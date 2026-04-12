// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Show Diff Command
// Opens a side-by-side diff view comparing the proposed patch against
// the currently active editor's content.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { applyUnifiedDiffToText, findMatchingDiffChange, normalizeUnifiedDiffText, parseUnifiedDiff } from '../utils/unifiedDiff';

/**
 * Opens a VS Code diff editor showing the proposed patch applied to
 * the active document.
 *
 * @param diffPatch - The proposed file content (post-patch). For the
 *   hackathon MVP this is treated as the full replacement text rather
 *   than a unified diff so we can display it without a diff-apply lib.
 */
export async function showDiff(diffPatch: string): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    const normalizedDiff = normalizeUnifiedDiffText(diffPatch);
    const parsedChanges = parseUnifiedDiff(normalizedDiff);

    // Determine original content.
    let originalUri: vscode.Uri;
    let originalContent: string;
    let proposedContent: string;

    if (activeEditor) {
        originalUri = activeEditor.document.uri;
        originalContent = activeEditor.document.getText();

        const matchingChange = findMatchingDiffChange(
            parsedChanges,
            vscode.workspace.asRelativePath(activeEditor.document.uri)
        );

        if (matchingChange) {
            try {
                proposedContent = applyUnifiedDiffToText(
                    originalContent,
                    matchingChange
                );
            } catch (error) {
                console.warn('[BeliefGuard] Failed to build diff preview from unified diff:', error);
                proposedContent = normalizedDiff;
            }
        } else {
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
    const fileName = activeEditor
        ? activeEditor.document.fileName.split(/[\\/]/).pop() || 'file'
        : 'file';

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
