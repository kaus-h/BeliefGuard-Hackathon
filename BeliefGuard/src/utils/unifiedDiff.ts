import * as vscode from 'vscode';
import type { PatchFileSummary, PatchSummary } from '../types';

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

export function findMatchingDiffChange(
    changes: UnifiedDiffChange[],
    relativePath: string
): UnifiedDiffChange | undefined {
    const normalized = relativePath.replace(/\\/g, '/');

    return changes.find((change) => {
        return (
            change.newPath === normalized ||
            change.oldPath === normalized ||
            change.newPath?.endsWith(`/${normalized}`) ||
            change.oldPath?.endsWith(`/${normalized}`)
        );
    });
}

export function summarizeUnifiedDiff(diffText: string): PatchSummary {
    const changes = parseUnifiedDiff(diffText);
    const files: PatchFileSummary[] = changes.map((change) => {
        const path = change.newPath ?? change.oldPath ?? 'unknown';
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
        const targetPath = change.newPath ?? change.oldPath;
        if (!targetPath) {
            continue;
        }

        const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);

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

function cleanDiffPath(pathText: string): string | null {
    const normalized = pathText.replace(/^([ab])\//, '');
    return normalized === '/dev/null' ? null : normalized;
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