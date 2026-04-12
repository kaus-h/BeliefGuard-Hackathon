// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Show Diff Command
// Opens a side-by-side diff view comparing the proposed patch against
// the currently active editor's content.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { UnifiedDiffChange, applyUnifiedDiffToText, findMatchingDiffChange, normalizeUnifiedDiffText, parseUnifiedDiff } from '../utils/unifiedDiff';

/**
 * Opens a VS Code diff editor showing the proposed patch applied to
 * the active document.
 *
 * @param diffPatch - The proposed file content (post-patch). For the
 *   hackathon MVP this is treated as the full replacement text rather
 *   than a unified diff so we can display it without a diff-apply lib.
 */
export async function showDiff(diffPatch: string): Promise<void> {
    const normalizedDiff = normalizeUnifiedDiffText(diffPatch);
    const parsedChanges = parseUnifiedDiff(normalizedDiff);
    const activeEditor = vscode.window.activeTextEditor;

    if (parsedChanges.length === 0) {
        throw new Error('No file changes were found in the proposed patch.');
    }

    let selectedRelativePath: string | undefined = activeEditor
        ? vscode.workspace.asRelativePath(activeEditor.document.uri)
        : undefined;

    if (parsedChanges.length > 1) {
        const quickPickItems: vscode.QuickPickItem[] = parsedChanges.map((change: UnifiedDiffChange) => {
            const path = change.newPath ?? change.oldPath ?? 'unknown';
            return {
                label: path,
                description: change.oldPath === null
                    ? 'Added file'
                    : change.newPath === null
                        ? 'Deleted file'
                        : 'Modified file',
            };
        });

        const hasActiveMatch = selectedRelativePath
            ? parsedChanges.some((change: UnifiedDiffChange) => findMatchingDiffChange([change], selectedRelativePath || ''))
            : false;

        if (!hasActiveMatch) {
            const picked = await vscode.window.showQuickPick<vscode.QuickPickItem>(quickPickItems, {
                placeHolder: 'Select a file from the workspace patch to review',
            });
            if (!picked) {
                return;
            }
            selectedRelativePath = picked.label;
        }
    }

    // Determine original content.
    let originalUri: vscode.Uri;
    let originalContent: string;
    let proposedContent: string;
    let displayFileName = 'workspace-change';

    if (selectedRelativePath) {
        const matchingChange = findMatchingDiffChange(parsedChanges, selectedRelativePath);
        if (matchingChange) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const targetPath = matchingChange.newPath ?? matchingChange.oldPath;
            displayFileName = targetPath?.split(/[\\/]/).pop() || targetPath || 'workspace-change';

            if (workspaceFolder && targetPath) {
                originalUri = vscode.Uri.joinPath(workspaceFolder.uri, targetPath);

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
        `${originalScheme}:${fileName}?ts=${Date.now()}`
    );
    const rightUri = vscode.Uri.parse(
        `${patchedScheme}:${fileName}?ts=${Date.now()}`
    );

    // Open the native diff editor.
    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        `BeliefGuard: ${fileName} (Current ↔ Proposed)`
    );

    // Dispose providers after a short delay to let VS Code read the content.
    setTimeout(() => {
        sub1.dispose();
        sub2.dispose();
    }, 5000);
}
