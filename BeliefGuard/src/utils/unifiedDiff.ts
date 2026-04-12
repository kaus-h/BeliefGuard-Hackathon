import * as vscode from 'vscode';
import type {
    PatchFileSummary,
    PatchSummary,
    StructuredPatchAction,
    StructuredPatchBlock,
    StructuredPatchDocument,
} from '../types';

export interface UnifiedDiffChange {
    oldPath: string | null;
    newPath: string | null;
    hunks: UnifiedDiffHunk[];
}

interface UnifiedDiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
}

export function normalizeUnifiedDiffText(input: string): string {
    const trimmed = input.trim();
    const withoutFence = trimmed
        .replace(/^```(?:diff)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    const diffStart = withoutFence.search(/^(diff --git|---\s+)/m);
    return diffStart >= 0 ? withoutFence.slice(diffStart).trim() : withoutFence;
}

export function normalizeStructuredPatchText(input: string): string {
    const trimmed = input.trim();
    const withoutFence = trimmed
        .replace(/^```(?:patch|diff)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    const patchStart = withoutFence.search(/^\*\*\* Begin Patch/m);
    if (patchStart >= 0) {
        return withoutFence.slice(patchStart).trim();
    }

    const fileHeaderStart = withoutFence.search(/^\*\*\* (?:Update|Add|Delete) File:\s+/m);
    return fileHeaderStart >= 0 ? withoutFence.slice(fileHeaderStart).trim() : withoutFence;
}

export function parseUnifiedDiff(diffText: string): UnifiedDiffChange[] {
    const lines = normalizeUnifiedDiffText(diffText).split(/\r?\n/);
    const changes: UnifiedDiffChange[] = [];
    let currentChange: UnifiedDiffChange | null = null;
    let currentHunk: UnifiedDiffHunk | null = null;

    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            continue;
        }

        if (line.startsWith('--- ')) {
            if (currentChange) {
                changes.push(currentChange);
            }

            currentChange = {
                oldPath: cleanDiffPath(line.slice(4).trim()),
                newPath: null,
                hunks: [],
            };
            currentHunk = null;
            continue;
        }

        if (line.startsWith('+++ ')) {
            if (!currentChange) {
                currentChange = { oldPath: null, newPath: null, hunks: [] };
            }

            currentChange.newPath = cleanDiffPath(line.slice(4).trim());
            continue;
        }

        const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
        if (hunkMatch) {
            if (!currentChange) {
                throw new Error('Encountered a diff hunk before a file header.');
            }

            currentHunk = {
                oldStart: Number(hunkMatch[1]),
                oldCount: Number(hunkMatch[2] || '1'),
                newStart: Number(hunkMatch[3]),
                newCount: Number(hunkMatch[4] || '1'),
                lines: [],
            };
            currentChange.hunks.push(currentHunk);
            continue;
        }

        if (currentHunk && /^( |\+|-|\\)/.test(line)) {
            currentHunk.lines.push(line);
        }
    }

    if (currentChange) {
        changes.push(currentChange);
    }

    return changes;
}

export function applyUnifiedDiffToText(
    originalContent: string,
    change: UnifiedDiffChange
): string {
    const originalLines = splitLinesPreserveTrailingNewline(originalContent);
    const resultLines = [...originalLines];
    let lineOffset = 0;

    for (const hunk of change.hunks) {
        const expectedOldLines: string[] = [];
        const replacementLines: string[] = [];

        for (const line of hunk.lines) {
            if (!line || line.startsWith('\\')) {
                continue;
            }

            const marker = line[0];
            const value = line.slice(1);

            if (marker === ' ' || marker === '-') {
                expectedOldLines.push(value);
            }

            if (marker === ' ' || marker === '+') {
                replacementLines.push(value);
            }
        }

        const startIndex = Math.max(0, hunk.oldStart - 1 + lineOffset);
        const actualSlice = resultLines.slice(
            startIndex,
            startIndex + expectedOldLines.length
        );

        if (!arraysEqual(actualSlice, expectedOldLines)) {
            throw new Error(
                `Unified diff hunk did not match file contents for ${change.newPath || change.oldPath || 'unknown file'}.`
            );
        }

        resultLines.splice(
            startIndex,
            expectedOldLines.length,
            ...replacementLines
        );

        lineOffset += replacementLines.length - expectedOldLines.length;
    }

    return resultLines.join('\n');
}

export function parseStructuredPatchText(patchText: string): StructuredPatchDocument {
    const lines = normalizeStructuredPatchText(patchText).split(/\r?\n/);
    const blocks: StructuredPatchBlock[] = [];
    const seenBlocks = new Set<string>();
    let currentBlock: StructuredPatchBlock | null = null;
    let currentBlockLines: string[] = [];
    let insidePatch = false;

    const flushCurrentBlock = (): void => {
        if (!currentBlock) {
            return;
        }

        currentBlock.content = currentBlockLines.join('\n');
        const signature = `${currentBlock.action}:${currentBlock.path}`;
        if (seenBlocks.has(signature)) {
            throw new Error(`Duplicate structured patch block for ${currentBlock.path}.`);
        }

        seenBlocks.add(signature);
        blocks.push(currentBlock);
        currentBlock = null;
    };

    for (const line of lines) {
        if (line.startsWith('*** Begin Patch')) {
            insidePatch = true;
            continue;
        }

        if (line.startsWith('*** End Patch')) {
            flushCurrentBlock();
            insidePatch = false;
            continue;
        }

        const header = parseStructuredPatchHeader(line);
        if (header) {
            insidePatch = true;
            flushCurrentBlock();
            currentBlock = {
                action: header.action,
                path: header.path,
                content: '',
            };
            currentBlockLines = [];
            continue;
        }

        if (!insidePatch || !currentBlock) {
            continue;
        }

        currentBlockLines.push(line);
    }

    flushCurrentBlock();

    return { blocks };
}

export function summarizeStructuredPatch(patchText: string): PatchSummary {
    const document = parseStructuredPatchText(patchText);
    const files: PatchFileSummary[] = document.blocks.map((block) => {
        const lines = splitPatchBodyLines(block.content);
        const additions = block.action === 'DELETE_FILE'
            ? 0
            : lines.filter((line) => line.startsWith('+')).length;
        const deletions = block.action === 'ADD_FILE'
            ? 0
            : lines.filter((line) => line.startsWith('-')).length;

        return {
            path: block.path,
            status: block.action === 'ADD_FILE'
                ? 'ADDED'
                : block.action === 'DELETE_FILE'
                    ? 'DELETED'
                    : 'MODIFIED',
            additions,
            deletions,
        };
    });

    return {
        fileCount: files.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
        files,
    };
}

export function applyStructuredPatchToText(
    originalContent: string,
    block: StructuredPatchBlock
): string {
    if (block.action === 'DELETE_FILE') {
        return '';
    }

    if (block.action === 'ADD_FILE') {
        return splitPatchBodyLines(block.content)
            .filter((line) => !line.startsWith('*** End of File'))
            .map((line) => (line.startsWith('+') ? line.slice(1) : line))
            .join('\n');
    }

    const originalLines = splitLinesPreserveTrailingNewline(originalContent);
    const resultLines: string[] = [];
    let cursor = 0;

    for (const rawLine of splitPatchBodyLines(block.content)) {
        if (rawLine.startsWith('*** End of File') || rawLine.startsWith('@@')) {
            continue;
        }

        const marker = rawLine.length > 0 && (rawLine[0] === '+' || rawLine[0] === '-' || rawLine[0] === ' ')
            ? rawLine[0]
            : ' ';
        const value = marker === '+' || marker === '-' || marker === ' '
            ? rawLine.slice(marker === ' ' ? 0 : 1)
            : rawLine;

        if (marker === '+') {
            resultLines.push(value);
            continue;
        }

        const matchIndex = findLineIndex(originalLines, value, cursor);
        if (matchIndex === -1) {
            throw new Error(`Structured patch hunk did not match file contents for ${block.path}.`);
        }

        while (cursor < matchIndex) {
            resultLines.push(originalLines[cursor++]);
        }

        if (marker === '-') {
            cursor++;
        } else {
            resultLines.push(originalLines[cursor++]);
        }
    }

    while (cursor < originalLines.length) {
        resultLines.push(originalLines[cursor++]);
    }

    return resultLines.join('\n');
}

export async function applyStructuredPatchToWorkspace(patchText: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder is open.');
    }

    const document = parseStructuredPatchText(patchText);
    if (document.blocks.length === 0) {
        throw new Error('No structured patch blocks were found.');
    }

    const edit = new vscode.WorkspaceEdit();

    for (const block of document.blocks) {
        const targetPath = resolveWorkspaceRelativePath(workspaceFolder, block.path);
        if (!targetPath) {
            throw new Error(`BeliefGuard could not resolve a workspace file path for structured patch target: ${block.path}.`);
        }

        const targetUri = await resolveFileUri(workspaceFolder, targetPath);

        if (block.action === 'DELETE_FILE') {
            edit.deleteFile(targetUri, { ignoreIfNotExists: true });
            continue;
        }

        await vscode.workspace.fs.createDirectory(
            vscode.Uri.joinPath(workspaceFolder.uri, getDirectoryPath(targetPath))
        );

        if (block.action === 'ADD_FILE') {
            const content = applyStructuredPatchToText('', block);
            edit.createFile(targetUri, { overwrite: true, ignoreIfExists: false });
            edit.insert(targetUri, new vscode.Position(0, 0), content);
            continue;
        }

        const documentText = await vscode.workspace.openTextDocument(targetUri);
        const newContent = applyStructuredPatchToText(documentText.getText(), block);
        const fullRange = new vscode.Range(
            documentText.positionAt(0),
            documentText.positionAt(documentText.getText().length)
        );
        edit.replace(targetUri, fullRange, newContent);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        throw new Error('VS Code rejected the proposed structured patch edits.');
    }

    await vscode.workspace.saveAll();
}

export function findMatchingDiffChange(
    changes: UnifiedDiffChange[],
    relativePath: string,
    workspaceFolder?: vscode.WorkspaceFolder
): UnifiedDiffChange | undefined {
    const normalized = relativePath.replace(/\\/g, '/');

    return changes.find((change) => {
        const resolvedChangePath = workspaceFolder
            ? resolveWorkspaceRelativePath(workspaceFolder, change.newPath ?? change.oldPath)
            : null;

        return (
            resolvedChangePath === normalized ||
            change.newPath === normalized ||
            change.oldPath === normalized ||
            change.newPath?.endsWith(`/${normalized}`) ||
            change.oldPath?.endsWith(`/${normalized}`)
        );
    });
}

export function resolveWorkspaceRelativePath(
    workspaceFolder: vscode.WorkspaceFolder,
    diffPath: string | null
): string | null {
    const normalized = cleanDiffPath(diffPath);
    if (!normalized) {
        return null;
    }

    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\/g, '/');
    const workspaceName = workspaceFolder.name.replace(/\\/g, '/');
    const candidates = new Set<string>();

    candidates.add(normalized);
    candidates.add(normalized.replace(/^\/+/, ''));
    candidates.add(normalized.replace(/^\.\//, ''));

    if (workspaceName) {
        candidates.add(normalized.replace(new RegExp(`^${escapeRegExp(workspaceName)}/`), ''));
    }

    const normalizedLower = normalized.toLowerCase();
    const workspaceLower = workspacePath.toLowerCase();
    if (normalizedLower.startsWith(`${workspaceLower}/`)) {
        candidates.add(normalized.slice(workspacePath.length + 1));
    }

    for (const candidate of candidates) {
        const cleaned = candidate.replace(/^\/+/, '').replace(/\/+/g, '/');
        if (!cleaned) {
            continue;
        }

        if (cleaned.startsWith('../') || /^[A-Za-z]:/.test(cleaned)) {
            continue;
        }

        return cleaned;
    }

    return null;
}

export function getUnifiedDiffChangePath(
    change: UnifiedDiffChange,
    workspaceFolder?: vscode.WorkspaceFolder
): string {
    const rawPath = change.newPath ?? change.oldPath ?? 'unknown';
    if (!workspaceFolder) {
        return rawPath;
    }

    return resolveWorkspaceRelativePath(workspaceFolder, rawPath) ?? rawPath;
}

export function summarizeUnifiedDiff(diffText: string): PatchSummary {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const changes = parseUnifiedDiff(diffText);
    const files: PatchFileSummary[] = changes.map((change) => {
        const path = getUnifiedDiffChangePath(change, workspaceFolder);
        const status = change.oldPath === null
            ? 'ADDED'
            : change.newPath === null
                ? 'DELETED'
                : 'MODIFIED';

        let additions = 0;
        let deletions = 0;
        for (const hunk of change.hunks) {
            for (const line of hunk.lines) {
                if (!line || line.startsWith('+++') || line.startsWith('---') || line.startsWith('\\')) {
                    continue;
                }
                if (line.startsWith('+')) {
                    additions++;
                } else if (line.startsWith('-')) {
                    deletions++;
                }
            }
        }

        return {
            path,
            status,
            additions,
            deletions,
        };
    });

    return {
        fileCount: files.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
        files,
    };
}

export async function applyUnifiedDiffToWorkspace(diffText: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder is open.');
    }

    const changes = parseUnifiedDiff(diffText);
    if (changes.length === 0) {
        throw new Error('No valid unified diff changes were found.');
    }

    const edit = new vscode.WorkspaceEdit();

    for (const change of changes) {
        const rawTargetPath = change.newPath ?? change.oldPath;
        const targetPath = resolveWorkspaceRelativePath(workspaceFolder, rawTargetPath);
        if (!targetPath) {
            throw new Error(
                `BeliefGuard could not resolve a workspace file path for diff target: ${rawTargetPath ?? 'unknown file'}.`
            );
        }

        const targetUri = await resolveFileUri(workspaceFolder, targetPath);

        if (change.newPath === null) {
            edit.deleteFile(targetUri, { ignoreIfNotExists: true });
            continue;
        }

        await vscode.workspace.fs.createDirectory(
            vscode.Uri.joinPath(workspaceFolder.uri, getDirectoryPath(targetPath))
        );

        if (change.oldPath === null) {
            edit.createFile(targetUri, { overwrite: true, ignoreIfExists: false });
            const newContent = applyUnifiedDiffToText('', change);
            edit.insert(targetUri, new vscode.Position(0, 0), newContent);
            continue;
        }

        const document = await vscode.workspace.openTextDocument(targetUri);
        const newContent = applyUnifiedDiffToText(document.getText(), change);
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        edit.replace(targetUri, fullRange, newContent);
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        throw new Error('VS Code rejected the proposed patch edits.');
    }

    await vscode.workspace.saveAll();
}

function cleanDiffPath(pathText: string | null): string | null {
    if (!pathText) {
        return null;
    }

    const normalized = pathText
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^([ab])\//, '')
        .replace(/\\/g, '/');
    return normalized === '/dev/null' ? null : normalized;
}

function parseStructuredPatchHeader(line: string): { action: StructuredPatchAction; path: string } | null {
    const headerMatch = line.match(/^\*\*\* (Update|Add|Delete) File:\s+(.+)$/);
    if (!headerMatch) {
        return null;
    }

    const action = headerMatch[1] === 'Add'
        ? 'ADD_FILE'
        : headerMatch[1] === 'Delete'
            ? 'DELETE_FILE'
            : 'UPDATE_FILE';

    return {
        action,
        path: headerMatch[2].trim(),
    };
}

function splitPatchBodyLines(content: string): string[] {
    if (!content) {
        return [];
    }

    return content.split(/\r?\n/);
}

function findLineIndex(lines: string[], target: string, startIndex: number): number {
    const trimmedTarget = target.trim();
    // Try exact match first
    for (let index = startIndex; index < lines.length; index++) {
        if (lines[index] === target) {
            return index;
        }
    }
    // Fall back to trimmed match (handles whitespace differences between LLM context and actual file)
    for (let index = startIndex; index < lines.length; index++) {
        if (lines[index].trim() === trimmedTarget) {
            return index;
        }
    }

    return -1;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a patch-relative file path to an actual workspace URI.
 * Tries direct join first, falls back to workspace.findFiles for
 * nested project structures (e.g. workspace root contains a subfolder
 * with the same name that holds the actual source).
 */
export async function resolveFileUri(
    workspaceFolder: vscode.WorkspaceFolder,
    relativePath: string
): Promise<vscode.Uri> {
    const directUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    try {
        await vscode.workspace.fs.stat(directUri);
        return directUri;
    } catch {
        // Not found at direct path — search the workspace.
    }

    const escapedPath = relativePath
        .replace(/\\/g, '/')
        .replace(/[\[\]{}()]/g, (ch) => `[${ch}]`);
    const matches = await vscode.workspace.findFiles(
        `**/${escapedPath}`,
        '**/node_modules/**',
        5
    );

    if (matches.length > 0) {
        const suffix = relativePath.replace(/\\/g, '/');
        for (const m of matches) {
            const rel = vscode.workspace.asRelativePath(m).replace(/\\/g, '/');
            if (rel.endsWith(suffix)) {
                return m;
            }
        }
        return matches[0];
    }

    return directUri;
}

function splitLinesPreserveTrailingNewline(content: string): string[] {
    if (!content) {
        return [];
    }

    const lines = content.split(/\r?\n/);
    if (content.endsWith('\n')) {
        lines.pop();
    }
    return lines;
}

function arraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

function getDirectoryPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}
