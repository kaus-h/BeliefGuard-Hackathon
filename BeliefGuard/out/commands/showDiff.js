"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Show Diff Command
// Opens a side-by-side diff view comparing the proposed patch against
// the currently active editor's content.
// ──────────────────────────────────────────────────────────────────────
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
exports.showDiff = showDiff;
const vscode = __importStar(require("vscode"));
const unifiedDiff_1 = require("../utils/unifiedDiff");
async function readFileText(uri) {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        return document.getText();
    }
    catch {
        return '';
    }
}
/**
 * Opens a VS Code diff editor showing the proposed patch applied to
 * the active document.
 *
 * @param diffPatch - The proposed file content (post-patch). For the
 *   hackathon MVP this is treated as the full replacement text rather
 *   than a unified diff so we can display it without a diff-apply lib.
 */
async function showDiff(diffPatch) {
    const structuredChanges = (0, unifiedDiff_1.parseStructuredPatchText)(diffPatch).blocks;
    const useStructuredPatch = structuredChanges.length > 0;
    const normalizedDiff = (0, unifiedDiff_1.normalizeUnifiedDiffText)(diffPatch);
    const parsedChanges = (0, unifiedDiff_1.parseUnifiedDiff)(normalizedDiff);
    const activeEditor = vscode.window.activeTextEditor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!useStructuredPatch && parsedChanges.length === 0) {
        throw new Error('No file changes were found in the proposed patch.');
    }
    let selectedRelativePath = activeEditor
        ? vscode.workspace.asRelativePath(activeEditor.document.uri)
        : undefined;
    if (useStructuredPatch && structuredChanges.length > 1) {
        const quickPickItems = structuredChanges.map((change) => ({
            label: change.path,
            description: change.action === 'ADD_FILE'
                ? 'Added file'
                : change.action === 'DELETE_FILE'
                    ? 'Deleted file'
                    : 'Modified file',
        }));
        const picked = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: selectedRelativePath
                ? `Select a file from the workspace patch to review (active file: ${selectedRelativePath})`
                : 'Select a file from the workspace patch to review',
        });
        if (!picked) {
            return;
        }
        selectedRelativePath = picked.label;
    }
    else if (!useStructuredPatch && parsedChanges.length > 1) {
        const quickPickItems = parsedChanges.map((change) => {
            const path = (0, unifiedDiff_1.getUnifiedDiffChangePath)(change, workspaceFolder);
            return {
                label: path,
                description: change.oldPath === null
                    ? 'Added file'
                    : change.newPath === null
                        ? 'Deleted file'
                        : 'Modified file',
            };
        });
        const picked = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: selectedRelativePath
                ? `Select a file from the workspace patch to review (active file: ${selectedRelativePath})`
                : 'Select a file from the workspace patch to review',
        });
        if (!picked) {
            return;
        }
        selectedRelativePath = picked.label;
    }
    else if (useStructuredPatch && structuredChanges.length === 1) {
        selectedRelativePath = structuredChanges[0].path ?? selectedRelativePath;
    }
    else {
        selectedRelativePath =
            parsedChanges[0].newPath ??
                parsedChanges[0].oldPath ??
                selectedRelativePath;
    }
    // Determine original content.
    let originalUri;
    let originalContent;
    let proposedContent;
    let displayFileName = 'workspace-change';
    let displayFilePath = 'workspace-change';
    if (useStructuredPatch && selectedRelativePath) {
        const matchingChange = structuredChanges.find((change) => change.path === selectedRelativePath)
            ?? structuredChanges[0];
        const targetPath = workspaceFolder
            ? (0, unifiedDiff_1.resolveWorkspaceRelativePath)(workspaceFolder, matchingChange.path)
            : matchingChange.path;
        displayFileName = targetPath?.split(/[\\/]/).pop() || targetPath || 'workspace-change';
        displayFilePath = targetPath || matchingChange.path || displayFileName;
        if (workspaceFolder && targetPath) {
            originalUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);
            originalContent = matchingChange.action === 'ADD_FILE' ? '' : await readFileText(originalUri);
            try {
                proposedContent = (0, unifiedDiff_1.applyStructuredPatchToText)(originalContent, matchingChange);
            }
            catch (error) {
                console.warn('[BeliefGuard] Failed to build diff preview from structured patch:', error);
                proposedContent = matchingChange.action === 'DELETE_FILE'
                    ? ''
                    : matchingChange.content;
            }
        }
        else {
            originalUri = vscode.Uri.parse('untitled:Original');
            originalContent = '';
            proposedContent = matchingChange.action === 'DELETE_FILE'
                ? ''
                : (0, unifiedDiff_1.applyStructuredPatchToText)('', matchingChange);
        }
    }
    else if (selectedRelativePath) {
        const matchingChange = (0, unifiedDiff_1.findMatchingDiffChange)(parsedChanges, selectedRelativePath, workspaceFolder);
        if (matchingChange) {
            const rawTargetPath = matchingChange.newPath ?? matchingChange.oldPath;
            const targetPath = workspaceFolder
                ? (0, unifiedDiff_1.resolveWorkspaceRelativePath)(workspaceFolder, rawTargetPath)
                : rawTargetPath;
            displayFileName = targetPath?.split(/[\\/]/).pop() || targetPath || 'workspace-change';
            displayFilePath = targetPath || rawTargetPath || displayFileName;
            if (workspaceFolder && targetPath) {
                originalUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);
                if (matchingChange.oldPath === null) {
                    originalContent = '';
                    proposedContent = (0, unifiedDiff_1.applyUnifiedDiffToText)('', matchingChange);
                }
                else {
                    try {
                        const document = await vscode.workspace.openTextDocument(originalUri);
                        originalContent = document.getText();
                    }
                    catch (_error) {
                        originalContent = '';
                    }
                    try {
                        proposedContent = (0, unifiedDiff_1.applyUnifiedDiffToText)(originalContent, matchingChange);
                    }
                    catch (error) {
                        console.warn('[BeliefGuard] Failed to build diff preview from unified diff:', error);
                        proposedContent = normalizedDiff;
                    }
                }
            }
            else {
                originalUri = vscode.Uri.parse('untitled:Original');
                originalContent = '';
                proposedContent = normalizedDiff;
            }
        }
        else {
            originalUri = vscode.Uri.parse('untitled:Original');
            originalContent = '';
            proposedContent = normalizedDiff;
        }
    }
    else {
        // No active editor — show diff against an empty document.
        originalUri = vscode.Uri.parse('untitled:Original');
        originalContent = '';
        proposedContent = normalizedDiff;
    }
    // Create virtual documents for the diff viewer.
    const originalScheme = 'beliefguard-original';
    const patchedScheme = 'beliefguard-patched';
    const originalProvider = new (class {
        provideTextDocumentContent() {
            return originalContent;
        }
    })();
    const patchedProvider = new (class {
        provideTextDocumentContent() {
            return proposedContent;
        }
    })();
    // Register disposable content providers.
    const sub1 = vscode.workspace.registerTextDocumentContentProvider(originalScheme, originalProvider);
    const sub2 = vscode.workspace.registerTextDocumentContentProvider(patchedScheme, patchedProvider);
    // Build virtual URIs.
    const fileName = displayFileName;
    const leftUri = vscode.Uri.parse(`${originalScheme}:${encodeURIComponent(fileName)}?ts=${Date.now()}`);
    const rightUri = vscode.Uri.parse(`${patchedScheme}:${encodeURIComponent(fileName)}?ts=${Date.now()}`);
    // Open the native diff editor.
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `BeliefGuard: ${displayFilePath} (Current ↔ Proposed)`);
    // Dispose providers after a short delay to let VS Code read the content.
    setTimeout(() => {
        sub1.dispose();
        sub2.dispose();
    }, 5000);
}
//# sourceMappingURL=showDiff.js.map