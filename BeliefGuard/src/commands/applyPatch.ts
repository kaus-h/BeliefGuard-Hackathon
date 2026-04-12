import * as vscode from 'vscode';
import {
    applyStructuredPatchToWorkspace,
    applyUnifiedDiffToWorkspace,
    normalizeStructuredPatchText,
    normalizeUnifiedDiffText,
    parseStructuredPatchText,
} from '../utils/unifiedDiff';

export async function applyPatch(diffPatch: string): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
        'Apply the proposed BeliefGuard patch to your workspace?',
        { modal: true },
        'Apply Patch'
    );

    if (answer !== 'Apply Patch') {
        return;
    }

    try {
        const structuredPatch = parseStructuredPatchText(
            normalizeStructuredPatchText(diffPatch)
        );

        if (structuredPatch.blocks.length > 0) {
            await applyStructuredPatchToWorkspace(diffPatch);
        } else {
            await applyUnifiedDiffToWorkspace(normalizeUnifiedDiffText(diffPatch));
        }
        vscode.window.showInformationMessage(
            'BeliefGuard applied the proposed patch to the workspace.'
        );
    } catch (error: any) {
        console.error('[BeliefGuard] Failed to apply patch:', error);
        vscode.window.showErrorMessage(
            `BeliefGuard could not apply the patch: ${error?.message || 'Unknown error'}`
        );
    }
}
