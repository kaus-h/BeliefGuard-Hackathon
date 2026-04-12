import * as vscode from 'vscode';
import { AuditEvent, Belief, ClarificationQuestion } from '../types';
/**
 * Provides the BeliefGuard sidebar webview inside VS Code.
 */
export declare class BeliefGuardProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    /** Must match the id declared in package.json → contributes.views. */
    static readonly viewType = "beliefguard.sidebarView";
    private _view?;
    private _latestDiffPatch?;
    /** Event bus so other modules can react to user answers. */
    private readonly _onUserAnswered;
    readonly onUserAnswered: vscode.Event<{
        beliefId: string;
        answer: string;
    }>;
    /** Event bus for task submission. */
    private readonly _onTaskSubmitted;
    readonly onTaskSubmitted: vscode.Event<string>;
    constructor(_extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postProcessing(message: string): void;
    postAuditEvent(event: AuditEvent): void;
    postBeliefs(beliefs: Belief[], questions: ClarificationQuestion[]): void;
    postPatchReady(diffPatch: string): void;
    postBlocked(reason: string, violations: Belief[]): void;
    postError(message: string): void;
    getLatestDiffPatch(): string | undefined;
    private _post;
    private _getHtmlForWebview;
}
//# sourceMappingURL=BeliefGuardProvider.d.ts.map