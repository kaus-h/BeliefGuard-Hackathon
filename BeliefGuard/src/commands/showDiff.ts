// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Show Diff Command
// Opens a side-by-side diff view comparing the proposed patch against
// the currently active editor's content.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import {
    UnifiedDiffChange,
    applyStructuredPatchToText,
    applyUnifiedDiffToText,
    findMatchingDiffChange,
    getUnifiedDiffChangePath,
    normalizeUnifiedDiffText,
    parseStructuredPatchText,
    parseUnifiedDiff,
    resolveFileUri,
    resolveWorkspaceRelativePath,
} from '../utils/unifiedDiff';

async function readFileText(uri: vscode.Uri): Promise<string> {
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        return document.getText();
    } catch {
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
export async function showDiff(diffPatch: string): Promise<void> {
    const structuredChanges = parseStructuredPatchText(diffPatch).blocks;
    const useStructuredPatch = structuredChanges.length > 0;
    const normalizedDiff = normalizeUnifiedDiffText(diffPatch);
    const parsedChanges = parseUnifiedDiff(normalizedDiff);
    const activeEditor = vscode.window.activeTextEditor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!useStructuredPatch && parsedChanges.length === 0) {
        throw new Error('No file changes were found in the proposed patch.');
    }

    let selectedRelativePath: string | undefined = activeEditor
        ? vscode.workspace.asRelativePath(activeEditor.document.uri)
        : undefined;

    if (useStructuredPatch && structuredChanges.length > 1) {
        const quickPickItems: vscode.QuickPickItem[] = structuredChanges.map((change) => ({
            label: change.path,
            description: change.action === 'ADD_FILE'
                ? 'Added file'
                : change.action === 'DELETE_FILE'
                    ? 'Deleted file'
                    : 'Modified file',
        }));

        const picked = await vscode.window.showQuickPick<vscode.QuickPickItem>(quickPickItems, {
            placeHolder: selectedRelativePath
                ? `Select a file from the workspace patch to review (active file: ${selectedRelativePath})`
                : 'Select a file from the workspace patch to review',
        });
        if (!picked) {
            return;
        }

        selectedRelativePath = picked.label;
    } else if (!useStructuredPatch && parsedChanges.length > 1) {
        const quickPickItems: vscode.QuickPickItem[] = parsedChanges.map((change: UnifiedDiffChange) => {
            const path = getUnifiedDiffChangePath(change, workspaceFolder);
            return {
                label: path,
                description: change.oldPath === null
                    ? 'Added file'
                    : change.newPath === null
                        ? 'Deleted file'
                        : 'Modified file',
            };
        });

        const picked = await vscode.window.showQuickPick<vscode.QuickPickItem>(quickPickItems, {
            placeHolder: selectedRelativePath
                ? `Select a file from the workspace patch to review (active file: ${selectedRelativePath})`
                : 'Select a file from the workspace patch to review',
        });
        if (!picked) {
            return;
        }

        selectedRelativePath = picked.label;
    } else if (useStructuredPatch && structuredChanges.length === 1) {
        selectedRelativePath = structuredChanges[0].path ?? selectedRelativePath;
    } else {
        selectedRelativePath =
            parsedChanges[0].newPath ??
            parsedChanges[0].oldPath ??
            selectedRelativePath;
    }

    // Determine original content.
    let originalUri: vscode.Uri;
    let originalContent: string;
    let proposedContent: string;
    let displayFileName = 'workspace-change';
    let displayFilePath = 'workspace-change';

    if (useStructuredPatch && selectedRelativePath) {
        const matchingChange = structuredChanges.find((change) => change.path === selectedRelativePath)
            ?? structuredChanges[0];

        const targetPath = workspaceFolder
            ? resolveWorkspaceRelativePath(workspaceFolder, matchingChange.path)
            : matchingChange.path;
        displayFileName = targetPath?.split(/[\\/]/).pop() || targetPath || 'workspace-change';
        displayFilePath = targetPath || matchingChange.path || displayFileName;

        if (workspaceFolder && targetPath) {
            originalUri = await resolveFileUri(workspaceFolder, targetPath);
            originalContent = matchingChange.action === 'ADD_FILE' ? '' : await readFileText(originalUri);
            try {
                proposedContent = applyStructuredPatchToText(
                    originalContent,
                    matchingChange
                );
            } catch (error) {
                console.warn('[BeliefGuard] Failed to build diff preview from structured patch:', error);
                proposedContent = matchingChange.action === 'DELETE_FILE'
                    ? ''
                    : matchingChange.content;
            }
        } else {
            originalUri = vscode.Uri.parse('untitled:Original');
            originalContent = '';
            proposedContent = matchingChange.action === 'DELETE_FILE'
                ? ''
                : applyStructuredPatchToText('', matchingChange);
        }
    } else if (selectedRelativePath) {
        const matchingChange = findMatchingDiffChange(parsedChanges, selectedRelativePath, workspaceFolder);
        if (matchingChange) {
            const rawTargetPath = matchingChange.newPath ?? matchingChange.oldPath;
            const targetPath = workspaceFolder
                ? resolveWorkspaceRelativePath(workspaceFolder, rawTargetPath)
                : rawTargetPath;
            displayFileName = targetPath?.split(/[\\/]/).pop() || targetPath || 'workspace-change';
            displayFilePath = targetPath || rawTargetPath || displayFileName;

            if (workspaceFolder && targetPath) {
                originalUri = await resolveFileUri(workspaceFolder, targetPath);

                if (matchingChange.oldPath === null) {
                    originalContent = '';
                    proposedContent = applyUnifiedDiffToText('', matchingChange);
                } else {
                    try {
                        const document = await vscode.workspace.openTextDocument(originalUri);
                        originalContent = document.getText();
                    } catch (_error) {
                        originalContent = '';
                    }

                    try {
                        proposedContent = applyUnifiedDiffToText(
                            originalContent,
                            matchingChange
                        );
                    } catch (error) {
                        console.warn('[BeliefGuard] Failed to build diff preview from unified diff:', error);
                        proposedContent = normalizedDiff;
                    }
                }
            } else {
                originalUri = vscode.Uri.parse('untitled:Original');
                originalContent = '';
                proposedContent = normalizedDiff;
            }
        } else {
            originalUri = vscode.Uri.parse('untitled:Original');
            originalContent = '';
            proposedContent = normalizedDiff;
        }
    } else {
        // No active editor — show diff against an empty document.
        originalUri = vscode.Uri.parse('untitled:Original');
        originalContent = '';
        proposedContent = normalizedDiff;
    }

    // Create virtual documents for the diff viewer.
    const originalScheme = 'beliefguard-original';
    const patchedScheme = 'beliefguard-patched';

    const originalProvider = new (class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(): string {
            return originalContent;
        }
    })();

    const patchedProvider = new (class implements vscode.TextDocumentContentProvider {
        provideTextDocumentContent(): string {
            return proposedContent;
        }
    })();

    // Register disposable content providers.
    const sub1 = vscode.workspace.registerTextDocumentContentProvider(
        originalScheme,
        originalProvider
    );
    const sub2 = vscode.workspace.registerTextDocumentContentProvider(
        patchedScheme,
        patchedProvider
    );

    // Build virtual URIs.
    const fileName = displayFileName;

    const leftUri = vscode.Uri.parse(
        `${originalScheme}:${encodeURIComponent(fileName)}?ts=${Date.now()}`
    );
    const rightUri = vscode.Uri.parse(
        `${patchedScheme}:${encodeURIComponent(fileName)}?ts=${Date.now()}`
    );

    // Open the native diff editor.
    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `BeliefGuard: ${displayFilePath} (Current ↔ Proposed)`
    );

    // Dispose providers after a short delay to let VS Code read the content.
    setTimeout(() => {
        sub1.dispose();
        sub2.dispose();
    }, 5000);
}
