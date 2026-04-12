import * as vscode from 'vscode';
import { AuditEvent, Belief, ClarificationQuestion, PatchSummary } from '../types';
export declare class BeliefGuardProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    static readonly viewType = "beliefguard.sidebarView";
    private _view?;
    private _latestDiffPatch?;
    private readonly _onUserAnswered;
    readonly onUserAnswered: vscode.Event<{
        beliefId: string;
        answer: string;
    }>;
    private readonly _onTaskSubmitted;
    readonly onTaskSubmitted: vscode.Event<string>;
    constructor(_extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postProcessing(message: string): void;
    postAssistantMessage(title: string, message: string): void;
    postAuditEvent(event: AuditEvent): void;
    postBeliefs(beliefs: Belief[], questions: ClarificationQuestion[]): void;
    postBeliefGraph(beliefs: Belief[]): void;
    postPatchReady(diffPatch: string, summary: PatchSummary): void;
    postBlocked(reason: string, violations: Belief[]): void;
    postError(message: string): void;
    getLatestDiffPatch(): string | undefined;
    private _post;
    private _getHtmlForWebview;
}
//# sourceMappingURL=BeliefGuardProvider.d.ts.map