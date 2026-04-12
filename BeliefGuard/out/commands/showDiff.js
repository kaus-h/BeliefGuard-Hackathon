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
/**
 * Opens a VS Code diff editor showing the proposed patch applied to
 * the active document.
 *
 * @param diffPatch - The proposed file content (post-patch). For the
 *   hackathon MVP this is treated as the full replacement text rather
 *   than a unified diff so we can display it without a diff-apply lib.
 */
async function showDiff(diffPatch) {
    const activeEditor = vscode.window.activeTextEditor;
    const normalizedDiff = (0, unifiedDiff_1.normalizeUnifiedDiffText)(diffPatch);
    const parsedChanges = (0, unifiedDiff_1.parseUnifiedDiff)(normalizedDiff);
    // Determine original content.
    let originalUri;
    let originalContent;
    let proposedContent;
    if (activeEditor) {
        originalUri = activeEditor.document.uri;
        originalContent = activeEditor.document.getText();
        const matchingChange = (0, unifiedDiff_1.findMatchingDiffChange)(parsedChanges, vscode.workspace.asRelativePath(activeEditor.document.uri));
        if (matchingChange) {
            try {
                proposedContent = (0, unifiedDiff_1.applyUnifiedDiffToText)(originalContent, matchingChange);
            }
            catch (error) {
                console.warn('[BeliefGuard] Failed to build diff preview from unified diff:', error);
                proposedContent = normalizedDiff;
            }
        }
        else {
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
    const fileName = activeEditor
        ? activeEditor.document.fileName.split(/[\\/]/).pop() || 'file'
        : 'file';
    const leftUri = vscode.Uri.parse(`${originalScheme}:${fileName}?ts=${Date.now()}`);
    const rightUri = vscode.Uri.parse(`${patchedScheme}:${fileName}?ts=${Date.now()}`);
    // Open the native diff editor.
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `BeliefGuard: ${fileName} (Current ↔ Proposed)`);
    // Dispose providers after a short delay to let VS Code read the content.
    setTimeout(() => {
        sub1.dispose();
        sub2.dispose();
    }, 5000);
}
//# sourceMappingURL=showDiff.js.map