// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Extension Entrypoint
// Registers the sidebar webview provider and command palette triggers.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BeliefGuardProvider } from './webview/BeliefGuardProvider';
import { MainOrchestrator } from './controller/MainOrchestrator';

let provider: BeliefGuardProvider | undefined;
let orchestrator: MainOrchestrator | undefined;

/**
 * Called by VS Code when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    loadExtensionEnv(context.extensionUri);

    // ── Webview Sidebar Provider ────────────────────────────────────
    provider = new BeliefGuardProvider(context.extensionUri);
    orchestrator = new MainOrchestrator(provider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            BeliefGuardProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // ── Wire Webview task submission → Orchestrator pipeline ────────
    context.subscriptions.push(
        provider.onTaskSubmitted((task: string) => {
            if (!orchestrator) {
                provider?.postError(
                    'BeliefGuard failed to initialize correctly. Please reload the window and try again.'
                );
                return;
            }

            console.log('[BeliefGuard] Task submitted from webview:', task);
            void orchestrator.runGuardedTask(task);
        })
    );

    // ── Command: Start Guarded Task ─────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('beliefguard.startGuardedTask', () => {
            // Ensure the sidebar is visible so the user can interact.
            vscode.commands.executeCommand('beliefguard.sidebarView.focus');
        })
    );

    // ── Command: Show Diff ──────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('beliefguard.showDiff', async () => {
            const { showDiff } = await import('./commands/showDiff');
            const diffPatch = provider?.getLatestDiffPatch();
            if (diffPatch) {
                await showDiff(diffPatch);
            } else {
                vscode.window.showWarningMessage(
                    'BeliefGuard: No patch available to review.'
                );
            }
        })
    );

    // ── Command: Apply Patch ────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('beliefguard.applyPatch', async () => {
            const { applyPatch } = await import('./commands/applyPatch');
            const diffPatch = provider?.getLatestDiffPatch();
            if (diffPatch) {
                await applyPatch(diffPatch);
            } else {
                vscode.window.showWarningMessage(
                    'BeliefGuard: No patch available to apply.'
                );
            }
        })
    );

    console.log('BeliefGuard extension activated.');
}

/**
 * Called by VS Code when the extension is deactivated.
 */
export function deactivate(): void {
    provider = undefined;
    orchestrator = undefined;
    console.log('BeliefGuard extension deactivated.');
}

function loadExtensionEnv(extensionUri: vscode.Uri): void {
    try {
        const envPath = path.join(extensionUri.fsPath, '.env');
        if (!fs.existsSync(envPath)) {
            return;
        }

        const raw = fs.readFileSync(envPath, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) {
                continue;
            }

            const key = trimmed.slice(0, eqIndex).trim();
            const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');

            if (key && process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        console.warn('[BeliefGuard] Failed to load .env file:', error);
    }
}
