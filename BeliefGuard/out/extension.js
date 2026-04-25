"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Extension Entrypoint
// Registers the sidebar webview provider and command palette triggers.
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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const BeliefGuardProvider_1 = require("./webview/BeliefGuardProvider");
const MainOrchestrator_1 = require("./controller/MainOrchestrator");
const MementoSessionPersistence_1 = require("./state/MementoSessionPersistence");
let provider;
let orchestrator;
/**
 * Called by VS Code when the extension is activated.
 */
function activate(context) {
    loadExtensionEnv(context.extensionUri);
    // ── Webview Sidebar Provider ────────────────────────────────────
    provider = new BeliefGuardProvider_1.BeliefGuardProvider(context.extensionUri);
    orchestrator = new MainOrchestrator_1.MainOrchestrator(provider, new MementoSessionPersistence_1.MementoSessionPersistence(context.globalState));
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(BeliefGuardProvider_1.BeliefGuardProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }));
    // ── Wire Webview task submission → Orchestrator pipeline ────────
    context.subscriptions.push(provider.onTaskSubmitted((task) => {
        if (!orchestrator) {
            provider?.postError('BeliefGuard failed to initialize correctly. Please reload the window and try again.');
            return;
        }
        console.log('[BeliefGuard] Task submitted from webview:', task);
        void orchestrator.runGuardedTask(task);
    }));
    // ── Command: Start Guarded Task ─────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('beliefguard.startGuardedTask', () => {
        // Ensure the sidebar is visible so the user can interact.
        vscode.commands.executeCommand('beliefguard.sidebarView.focus');
    }));
    // ── Command: Show Diff ──────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('beliefguard.showDiff', async () => {
        const { showDiff } = await Promise.resolve().then(() => __importStar(require('./commands/showDiff')));
        const diffPatch = provider?.getLatestDiffPatch();
        if (diffPatch) {
            await showDiff(diffPatch);
        }
        else {
            vscode.window.showWarningMessage('BeliefGuard: No patch available to review.');
        }
    }));
    // ── Command: Apply Patch ────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('beliefguard.applyPatch', async () => {
        const { applyPatch } = await Promise.resolve().then(() => __importStar(require('./commands/applyPatch')));
        const diffPatch = provider?.getLatestDiffPatch();
        if (diffPatch) {
            await applyPatch(diffPatch);
        }
        else {
            vscode.window.showWarningMessage('BeliefGuard: No patch available to apply.');
        }
    }));
    console.log('BeliefGuard extension activated.');
}
/**
 * Called by VS Code when the extension is deactivated.
 */
function deactivate() {
    provider = undefined;
    orchestrator = undefined;
    console.log('BeliefGuard extension deactivated.');
}
function loadExtensionEnv(extensionUri) {
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
    }
    catch (error) {
        console.warn('[BeliefGuard] Failed to load .env file:', error);
    }
}
//# sourceMappingURL=extension.js.map