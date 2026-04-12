"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUnifiedDiffText = normalizeUnifiedDiffText;
exports.parseUnifiedDiff = parseUnifiedDiff;
exports.applyUnifiedDiffToText = applyUnifiedDiffToText;
exports.findMatchingDiffChange = findMatchingDiffChange;
exports.resolveWorkspaceRelativePath = resolveWorkspaceRelativePath;
exports.getUnifiedDiffChangePath = getUnifiedDiffChangePath;
exports.summarizeUnifiedDiff = summarizeUnifiedDiff;
exports.applyUnifiedDiffToWorkspace = applyUnifiedDiffToWorkspace;
const vscode = __importStar(require("vscode"));
function normalizeUnifiedDiffText(input) {
    const trimmed = input.trim();
    const withoutFence = trimmed
        .replace(/^```(?:diff)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    const diffStart = withoutFence.search(/^(diff --git|---\s+)/m);
    return diffStart >= 0 ? withoutFence.slice(diffStart).trim() : withoutFence;
}
function parseUnifiedDiff(diffText) {
    const lines = normalizeUnifiedDiffText(diffText).split(/\r?\n/);
    const changes = [];
    let currentChange = null;
    let currentHunk = null;
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
function applyUnifiedDiffToText(originalContent, change) {
    const originalLines = splitLinesPreserveTrailingNewline(originalContent);
    const resultLines = [...originalLines];
    let lineOffset = 0;
    for (const hunk of change.hunks) {
        const expectedOldLines = [];
        const replacementLines = [];
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
        const actualSlice = resultLines.slice(startIndex, startIndex + expectedOldLines.length);
        if (!arraysEqual(actualSlice, expectedOldLines)) {
            throw new Error(`Unified diff hunk did not match file contents for ${change.newPath || change.oldPath || 'unknown file'}.`);
        }
        resultLines.splice(startIndex, expectedOldLines.length, ...replacementLines);
        lineOffset += replacementLines.length - expectedOldLines.length;
    }
    return resultLines.join('\n');
}
function findMatchingDiffChange(changes, relativePath, workspaceFolder) {
    const normalized = relativePath.replace(/\\/g, '/');
    return changes.find((change) => {
        const resolvedChangePath = workspaceFolder
            ? resolveWorkspaceRelativePath(workspaceFolder, change.newPath ?? change.oldPath)
            : null;
        return (resolvedChangePath === normalized ||
            change.newPath === normalized ||
            change.oldPath === normalized ||
            change.newPath?.endsWith(`/${normalized}`) ||
            change.oldPath?.endsWith(`/${normalized}`));
    });
}
function resolveWorkspaceRelativePath(workspaceFolder, diffPath) {
    const normalized = cleanDiffPath(diffPath);
    if (!normalized) {
        return null;
    }
    const workspacePath = workspaceFolder.uri.fsPath.replace(/\\/g, '/');
    const workspaceName = workspaceFolder.name.replace(/\\/g, '/');
    const candidates = new Set();
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
function getUnifiedDiffChangePath(change, workspaceFolder) {
    const rawPath = change.newPath ?? change.oldPath ?? 'unknown';
    if (!workspaceFolder) {
        return rawPath;
    }
    return resolveWorkspaceRelativePath(workspaceFolder, rawPath) ?? rawPath;
}
function summarizeUnifiedDiff(diffText) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const changes = parseUnifiedDiff(diffText);
    const files = changes.map((change) => {
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
                }
                else if (line.startsWith('-')) {
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
async function applyUnifiedDiffToWorkspace(diffText) {
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
            throw new Error(`BeliefGuard could not resolve a workspace file path for diff target: ${rawTargetPath ?? 'unknown file'}.`);
        }
        const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);
        if (change.newPath === null) {
            edit.deleteFile(targetUri, { ignoreIfNotExists: true });
            continue;
        }
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, getDirectoryPath(targetPath)));
        if (change.oldPath === null) {
            edit.createFile(targetUri, { overwrite: true, ignoreIfExists: false });
            const newContent = applyUnifiedDiffToText('', change);
            edit.insert(targetUri, new vscode.Position(0, 0), newContent);
            continue;
        }
        const document = await vscode.workspace.openTextDocument(targetUri);
        const newContent = applyUnifiedDiffToText(document.getText(), change);
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        edit.replace(targetUri, fullRange, newContent);
    }
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        throw new Error('VS Code rejected the proposed patch edits.');
    }
    await vscode.workspace.saveAll();
}
function cleanDiffPath(pathText) {
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
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function splitLinesPreserveTrailingNewline(content) {
    if (!content) {
        return [];
    }
    const lines = content.split(/\r?\n/);
    if (content.endsWith('\n')) {
        lines.pop();
    }
    return lines;
}
function arraysEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
}
function getDirectoryPath(filePath) {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}
//# sourceMappingURL=unifiedDiff.js.map