// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Webview View Provider
// Chat-first sidebar UI with inline action cards, audit timeline, and
// collapsible belief graph snapshot.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import {
    AuditEvent,
    Belief,
    ClarificationQuestion,
    ExtensionToWebviewMessage,
    FileChangeReadyPayload,
    PatchSummary,
    StreamingChunkPayload,
    WebviewToExtensionMessage,
} from '../types';

export class BeliefGuardProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'beliefguard.sidebarView';

    private _view?: vscode.WebviewView;
    private _latestDiffPatch?: string;

    private readonly _onUserAnswered = new vscode.EventEmitter<{
        beliefId: string;
        answer: string;
    }>();
    public readonly onUserAnswered = this._onUserAnswered.event;

    private readonly _onTaskSubmitted = new vscode.EventEmitter<string>();
    public readonly onTaskSubmitted = this._onTaskSubmitted.event;

    private readonly _onFileChangeApproved = new vscode.EventEmitter<FileChangeReadyPayload>();
    public readonly onFileChangeApproved = this._onFileChangeApproved.event;

    private readonly _onFileChangeRejected = new vscode.EventEmitter<FileChangeReadyPayload>();
    public readonly onFileChangeRejected = this._onFileChangeRejected.event;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
            switch (message.type) {
                case 'TASK_SUBMITTED':
                    this._latestDiffPatch = undefined;
                    this._onTaskSubmitted.fire(message.payload.task);
                    break;
                case 'USER_ANSWERED':
                    this._onUserAnswered.fire(message.payload);
                    break;
                case 'REVIEW_DIFF':
                    void vscode.commands.executeCommand('beliefguard.showDiff');
                    break;
                case 'APPLY_PATCH':
                    void vscode.commands.executeCommand('beliefguard.applyPatch');
                    break;
                case 'REJECT_PATCH':
                    this._latestDiffPatch = undefined;
                    void vscode.window.showInformationMessage(
                        'The pending patch was discarded.'
                    );
                    break;
                case 'APPROVE_FILE_CHANGE':
                    this._latestDiffPatch = message.payload.fileChange.diffPatch;
                    this._onFileChangeApproved.fire(message.payload);
                    void vscode.window.showInformationMessage(
                        `Approved ${message.payload.fileChange.path}.`
                    );
                    break;
                case 'REJECT_FILE_CHANGE':
                    this._latestDiffPatch = undefined;
                    this._onFileChangeRejected.fire(message.payload);
                    void vscode.window.showInformationMessage(
                        `Rejected ${message.payload.fileChange.path}.`
                    );
                    break;
            }
        });
    }

    public postProcessing(message: string): void {
        this._post({ type: 'PROCESSING', payload: { message } });
    }

    public postAssistantMessage(title: string, message: string): void {
        this._post({ type: 'ASSISTANT_MESSAGE', payload: { title, message } });
    }

    public postAuditEvent(event: AuditEvent): void {
        this._post({ type: 'AUDIT_EVENT', payload: { event } });
    }

    public postBeliefs(beliefs: Belief[], questions: ClarificationQuestion[]): void {
        this._post({
            type: 'BELIEFS_EXTRACTED',
            payload: { beliefs, questions },
        });
    }

    public postBeliefGraph(beliefs: Belief[]): void {
        this._post({
            type: 'BELIEF_GRAPH_UPDATED',
            payload: { beliefs },
        });
    }

    public postPatchReady(diffPatch: string, summary: PatchSummary): void {
        this._latestDiffPatch = diffPatch;
        this._post({ type: 'PATCH_READY', payload: { diffPatch, summary } });
    }

    public postFileChangeReady(payload: FileChangeReadyPayload): void {
        this._latestDiffPatch = payload.fileChange.diffPatch;
        this._post({
            type: 'FILE_CHANGE_READY',
            payload,
        });
    }

    public postStreamingChunk(chunk: string): void {
        this._post({
            type: 'STREAMING_CHUNK',
            payload: {
                chunk,
            },
        });
    }

    public postFileReviewComplete(appliedPaths: string[], rejectedPaths: string[]): void {
        this._post({
            type: 'FILE_REVIEW_COMPLETE',
            payload: { appliedPaths, rejectedPaths },
        });
    }

    public postBlocked(reason: string, violations: Belief[]): void {
        this._post({ type: 'BLOCKED', payload: { reason, violations } });
    }

    public postError(message: string): void {
        this._post({ type: 'ERROR', payload: { message } });
    }

    public getLatestDiffPatch(): string | undefined {
        return this._latestDiffPatch;
    }

    private _post(message: ExtensionToWebviewMessage): void {
        void this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(): string {
        const nonce = getNonce();

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BeliefGuard</title>
    <style nonce="${nonce}">
        html { height: 100%; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background: color-mix(in srgb, var(--vscode-sideBar-background) 84%, var(--vscode-editor-background));
            line-height: 1.5;
            height: 100vh;
            overflow: hidden;
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 20px;
            --radius-sm: 6px;
            --radius-md: 10px;
            --radius-lg: 14px;
            --radius-pill: 999px;
            --surface-base: var(--vscode-editor-background);
            --surface-muted: color-mix(in srgb, var(--vscode-sideBar-background) 76%, var(--vscode-editor-background));
            --surface-soft: color-mix(in srgb, var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08)) 50%, var(--vscode-editor-background));
            --surface-elevated: color-mix(in srgb, var(--vscode-sideBar-background) 72%, var(--vscode-editor-background));
            --outline-soft: color-mix(in srgb, var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c)) 58%, transparent);
            --outline-strong: color-mix(in srgb, var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c)) 80%, transparent);
            --text-muted: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
            --text-subtle: var(--vscode-descriptionForeground, color-mix(in srgb, var(--vscode-foreground) 58%, transparent));
            --tone-info: var(--vscode-charts-blue, #3794ff);
            --tone-warning: var(--vscode-editorWarning-foreground, #cca700);
            --tone-success: var(--vscode-charts-green, #89d185);
            --tone-error: var(--vscode-errorForeground, #f44747);
        }
        .app-shell { height: 100%; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); }
        .header, .run-shell, .inspector-shell, .composer-shell {
            border-radius: var(--radius-lg);
            border: 1px solid var(--outline-soft);
            background: var(--surface-base);
        }
        .header { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
        .header-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
        .header-title-group { display: flex; align-items: center; min-width: 0; }
        .header h2 { font-size: 13.5px; font-weight: 700; letter-spacing: 0.01em; }
        .header-status-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
        .status-chip, .phase-chip {
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            padding: 0 9px;
            border-radius: var(--radius-pill);
            font-size: 10.5px;
            border: 1px solid var(--outline-soft);
            background: var(--surface-muted);
        }
        .status-chip { font-weight: 600; }
        .phase-chip { color: var(--text-subtle); background: transparent; }
        .status-chip.is-idle { color: var(--text-subtle); }
        .status-chip.is-inspecting, .status-chip.is-generating, .status-chip.is-applying { border-color: color-mix(in srgb, var(--tone-info) 34%, transparent); background: color-mix(in srgb, var(--tone-info) 12%, var(--surface-muted)); }
        .status-chip.is-awaiting, .status-chip.is-reviewing, .status-chip.is-ready { border-color: color-mix(in srgb, var(--tone-warning) 40%, transparent); background: color-mix(in srgb, var(--tone-warning) 12%, var(--surface-muted)); }
        .status-chip.is-completed { border-color: color-mix(in srgb, var(--tone-success) 40%, transparent); background: color-mix(in srgb, var(--tone-success) 12%, var(--surface-muted)); }
        .status-chip.is-blocked, .status-chip.is-error { border-color: color-mix(in srgb, var(--tone-error) 44%, transparent); background: color-mix(in srgb, var(--tone-error) 12%, var(--surface-muted)); }
        .header-nav { display: flex; gap: 6px; flex-wrap: wrap; }
        .header-nav-button {
            min-height: 28px;
            padding: 0 10px;
            border-radius: var(--radius-pill);
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 600;
        }
        .header-nav-button:hover { background: var(--surface-muted); color: var(--vscode-foreground); }
        .header-nav-button.is-active { background: color-mix(in srgb, var(--vscode-button-background) 10%, var(--surface-muted)); border-color: color-mix(in srgb, var(--vscode-button-background) 28%, transparent); color: var(--vscode-foreground); }
        .app-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: var(--space-3); }
        .run-shell { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
        .transcript-shell { flex: 1 1 auto; min-height: 0; padding: var(--space-3) var(--space-3) 0; }
        .chat-thread { display: flex; flex-direction: column; gap: var(--space-2); height: 100%; min-height: 0; overflow-y: auto; padding-right: var(--space-1); padding-bottom: var(--space-3); scrollbar-gutter: stable; }
        .inspector-shell { flex: 0 0 auto; overflow: hidden; background: color-mix(in srgb, var(--surface-base) 94%, var(--surface-muted)); }
        .inspector-shell.is-collapsed { display: none; }
        .inspector-body { padding: var(--space-3); }
        .inspector-panel { display: none; }
        .inspector-panel.is-active { display: block; }
        .inspector-panel-title, .inspector-section-title { font-weight: 700; font-size: 11px; margin-bottom: var(--space-2); color: var(--text-subtle); }
        .inspector-section + .inspector-section { margin-top: var(--space-3); }
        .composer-shell { flex: 0 0 auto; padding: var(--space-3); }
        .composer { display: flex; flex-direction: column; gap: var(--space-2); }
        .transcript-row { display: flex; width: 100%; }
        .transcript-row + .transcript-row { margin-top: 3px; }
        .transcript-row.row-user { justify-content: flex-end; }
        .transcript-row.row-milestone,
        .transcript-row.row-review,
        .transcript-row.row-blocked,
        .transcript-row.row-error,
        .transcript-row.row-success { margin-top: var(--space-2); }
        .row-shell { width: 100%; border-radius: var(--radius-lg); padding: 11px 12px; border: 1px solid transparent; background: transparent; }
        .row-user .row-shell { max-width: 88%; background: color-mix(in srgb, var(--vscode-button-background) 12%, var(--surface-base)); border-color: color-mix(in srgb, var(--vscode-button-background) 18%, transparent); }
        .row-assistant .row-shell { background: color-mix(in srgb, var(--tone-info) 4%, var(--surface-base)); }
        .row-system .row-shell { padding: 7px 10px; background: transparent; }
        .row-milestone .row-shell { background: color-mix(in srgb, var(--vscode-button-background) 6%, var(--surface-base)); border-color: color-mix(in srgb, var(--vscode-button-background) 18%, transparent); }
        .row-review .row-shell { background: color-mix(in srgb, var(--tone-warning) 8%, var(--surface-base)); border-color: color-mix(in srgb, var(--tone-warning) 24%, transparent); }
        .row-warning .row-shell { background: color-mix(in srgb, var(--tone-warning) 7%, var(--surface-base)); border-color: color-mix(in srgb, var(--tone-warning) 20%, transparent); }
        .row-blocked .row-shell, .row-error .row-shell { background: color-mix(in srgb, var(--tone-error) 8%, var(--surface-base)); border-color: color-mix(in srgb, var(--tone-error) 28%, transparent); }
        .row-success .row-shell { background: color-mix(in srgb, var(--tone-success) 9%, var(--surface-base)); border-color: color-mix(in srgb, var(--tone-success) 24%, transparent); }
        .row-topline { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-1); }
        .row-label { font-size: 10px; letter-spacing: 0.03em; opacity: 0.72; font-weight: 600; color: var(--text-subtle); }
        .row-title { font-weight: 700; font-size: 13px; line-height: 1.38; }
        .row-body { margin-top: var(--space-1); font-size: 12px; line-height: 1.55; }
        .row-meta { margin-top: 6px; font-size: 11px; color: var(--text-subtle); }
        .row-user .row-topline { margin-bottom: 2px; }
        .row-user .row-body { margin-top: 2px; }
        .row-system .row-topline { margin-bottom: 0; }
        .row-system .row-title { font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
        .row-system .row-label { opacity: 0.58; }
        .row-review .row-title, .row-milestone .row-title, .row-blocked .row-title, .row-error .row-title, .row-success .row-title { font-size: 13.5px; }
        .row-stack { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
        .row-panel { padding: 10px 11px; border-radius: var(--radius-md); background: var(--surface-elevated); border: 1px solid var(--outline-soft); }
        .row-panel-title { font-size: 10.5px; letter-spacing: 0.04em; opacity: 0.76; margin-bottom: 6px; color: var(--text-subtle); }
        .row-actions, .card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: var(--space-3); }
        .clarification-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--space-2); }
        .clarification-summary .stat-chip { padding: 5px 9px; }
        .blocker-list, .question-list { display: flex; flex-direction: column; gap: 8px; }
        .blocker-item, .question-item { padding: 10px 11px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-base) 84%, var(--surface-elevated)); border: 1px solid var(--outline-soft); }
        .blocker-item { border-left: 2px solid color-mix(in srgb, var(--tone-warning) 72%, transparent); }
        .blocker-item.high-risk { border-left-color: color-mix(in srgb, var(--tone-warning) 90%, transparent); }
        .blocker-statement, .question-text { font-size: 12px; font-weight: 600; line-height: 1.45; }
        .blocker-meta, .question-meta { margin-top: 6px; font-size: 11px; color: var(--text-subtle); }
        .question-item .options { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
        .question-item .options label { display: flex; align-items: flex-start; gap: 8px; }
        .question-item input[type="radio"] { margin-top: 2px; }
        .question-item input[type="text"] { margin-top: 8px; }
        textarea, input[type="text"] { width: 100%; padding: 9px 11px; border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: var(--radius-md); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: 12px; }
        textarea { min-height: 88px; resize: vertical; line-height: 1.5; }
        textarea::placeholder, input[type="text"]::placeholder { color: var(--text-subtle); }
        textarea:focus, input[type="text"]:focus { outline: none; border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
        input[type="radio"] { accent-color: var(--vscode-button-background); }
        button {
            min-height: 30px;
            padding: 0 12px;
            border: 1px solid transparent;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-family: inherit;
            font-size: 11.5px;
            font-weight: 600;
            line-height: 1;
            transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease;
        }
        button:hover { opacity: 1; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        button:focus-visible, summary:focus-visible { outline: none; border-color: var(--vscode-focusBorder); box-shadow: 0 0 0 1px var(--vscode-focusBorder); }
        .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: color-mix(in srgb, var(--vscode-button-background) 70%, transparent); }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground, color-mix(in srgb, var(--vscode-button-background) 86%, white)); }
        .btn-secondary { background: var(--surface-muted); color: var(--vscode-foreground); border-color: var(--outline-soft); }
        .btn-secondary:hover { background: color-mix(in srgb, var(--surface-muted) 78%, var(--surface-base)); }
        .btn-danger { background: color-mix(in srgb, var(--tone-error) 10%, var(--surface-base)); color: var(--tone-error); border-color: color-mix(in srgb, var(--tone-error) 34%, transparent); }
        .btn-danger:hover { background: color-mix(in srgb, var(--tone-error) 14%, var(--surface-base)); }
        .belief-card, .graph-node, .patch-file-row, .question-block { background: var(--surface-elevated); border-radius: var(--radius-md); padding: 9px 10px; }
        .belief-card { border-left: 2px solid var(--tone-info); margin-bottom: 6px; }
        .belief-card.high-risk, .graph-node.high-risk { border-left-color: var(--tone-error); }
        .belief-card.medium-risk, .graph-node.medium-risk { border-left-color: var(--tone-warning); }
        .belief-card .label, .graph-group-title, .audit-phase { font-size: 10.5px; letter-spacing: 0.04em; color: var(--text-subtle); margin-bottom: 4px; }
        .belief-card .meta, .graph-meta, .patch-file-meta { margin-top: 6px; font-size: 11px; color: var(--text-subtle); }
        .question-block + .question-block, .graph-node + .graph-node, .graph-group + .graph-group, .patch-file-row + .patch-file-row, .audit-item + .audit-item { margin-top: 6px; }
        .question-block .q-text { font-weight: 600; margin-bottom: 8px; }
        .question-block .options { display: flex; flex-direction: column; gap: 4px; }
        .question-block .options label { display: flex; align-items: center; gap: 6px; }
        .card-shell { display: flex; flex-direction: column; gap: 10px; }
        .card-scroll { max-height: 280px; overflow-y: auto; padding-right: 4px; }
        .card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .helper-text { font-size: 11px; color: var(--text-subtle); }
        .chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .stat-chip,
        .graph-badge,
        .audit-level-badge,
        .file-change-status,
        .stream-live-badge {
            display: inline-flex;
            align-items: center;
            min-height: 22px;
            padding: 0 8px;
            border-radius: var(--radius-pill);
            border: 1px solid var(--outline-soft);
            background: var(--surface-muted);
            color: var(--text-muted);
            font-size: 10.5px;
            font-weight: 600;
        }
        .patch-summary { display: flex; flex-direction: column; gap: 10px; }
        .patch-summary-header { font-size: 13px; font-weight: 700; line-height: 1.45; }
        .patch-summary-files { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow: auto; padding-right: 4px; scrollbar-gutter: stable; }
        .patch-file-row { display: flex; flex-direction: column; gap: 4px; align-items: stretch; padding: 8px 10px; border: 1px solid var(--outline-soft); background: var(--surface-elevated); }
        .patch-file-path { font-size: 12px; word-break: break-word; }
        .audit-panel-body, .graph-panel-body, .review-panel-body, .stream-panel-body { max-height: 240px; overflow: auto; padding-right: 4px; scrollbar-gutter: stable; }
        .audit-empty, .graph-empty, .review-empty, .stream-empty, .inspector-summary { color: var(--text-subtle); font-size: 11px; }
        .inspector-summary { margin-bottom: 8px; }
        .audit-item { border: 1px solid var(--outline-soft); background: color-mix(in srgb, var(--surface-base) 76%, var(--surface-muted)); border-radius: var(--radius-md); padding: 8px 10px; }
        .audit-item.success { border-color: color-mix(in srgb, var(--tone-success) 24%, transparent); }
        .audit-item.warning { border-color: color-mix(in srgb, var(--tone-warning) 24%, transparent); }
        .audit-item.error { border-color: color-mix(in srgb, var(--tone-error) 28%, transparent); }
        .audit-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
        .audit-phase-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .audit-topline { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .graph-node-top { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
        .audit-title, .graph-node-statement { font-weight: 600; font-size: 12px; line-height: 1.45; }
        .audit-time { font-size: 10px; color: var(--text-subtle); white-space: nowrap; }
        .audit-data { margin-top: 6px; }
        .audit-data summary { font-size: 11px; color: var(--text-subtle); cursor: pointer; }
        .audit-data summary:hover,
        .file-change-inspector-preview summary:hover { color: var(--vscode-foreground); }
        .audit-detail { margin-top: 6px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--text-muted); }
        .audit-data pre { margin-top: 6px; white-space: pre-wrap; word-break: break-word; font-size: 11px; padding: 8px 9px; border-radius: var(--radius-sm); background: var(--surface-soft); border: 1px solid var(--outline-soft); overflow: auto; }
        .graph-group + .graph-group { margin-top: 10px; }
        .graph-group-title { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .graph-group-count { font-size: 10px; color: var(--text-subtle); }
        .graph-node { border-left: 2px solid var(--tone-info); background: color-mix(in srgb, var(--surface-base) 76%, var(--surface-muted)); border-radius: var(--radius-md); padding: 8px 10px; }
        .graph-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-start; }
        .review-empty, .stream-empty { color: var(--text-subtle); font-size: 11px; }
        .file-review-phase { gap: 10px; }
        .file-review-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .file-review-summary .stat-chip { padding: 5px 9px; }
        .file-review-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .file-change-card { border-left: 2px solid var(--tone-info); background: var(--surface-elevated); border: 1px solid var(--outline-soft); border-radius: var(--radius-md); padding: 10px 12px; }
        .file-change-card.is-transcript { background: color-mix(in srgb, var(--surface-base) 84%, var(--surface-elevated)); }
        .file-change-card.approved { border-left-color: var(--tone-success); background: color-mix(in srgb, var(--tone-success) 7%, var(--surface-base)); }
        .file-change-card.rejected { border-left-color: var(--tone-error); background: color-mix(in srgb, var(--tone-error) 6%, var(--surface-base)); }
        .file-change-card.is-inspector { padding: 8px 10px; border-radius: 8px; }
        .file-change-card.is-inspector .file-change-ordinal,
        .file-change-card.is-inspector .file-change-actions,
        .file-change-card.is-inspector .file-change-diff-label { display: none; }
        .file-change-card.is-inspector .file-change-diff { max-height: 110px; margin-top: 8px; }
        .file-change-inspector-preview { margin-top: 8px; }
        .file-change-inspector-preview summary { font-size: 11px; color: var(--text-subtle); cursor: pointer; }
        .file-change-ordinal { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.66; margin-bottom: 6px; }
        .file-change-topline { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
        .file-change-path { font-weight: 600; font-size: 12px; line-height: 1.45; word-break: break-word; }
        .file-change-card.approved .file-change-status { border-color: color-mix(in srgb, var(--tone-success) 32%, transparent); background: color-mix(in srgb, var(--tone-success) 14%, var(--surface-base)); color: var(--tone-success); }
        .file-change-card.rejected .file-change-status { border-color: color-mix(in srgb, var(--tone-error) 32%, transparent); background: color-mix(in srgb, var(--tone-error) 14%, var(--surface-base)); color: var(--tone-error); }
        .file-change-meta { margin-top: 6px; font-size: 11px; color: var(--text-subtle); }
        .file-change-diff-label { margin-top: 8px; font-size: 10px; letter-spacing: 0.04em; color: var(--text-subtle); }
        .file-change-diff { margin-top: 4px; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.5; padding: 8px 9px; border-radius: var(--radius-sm); background: var(--surface-soft); border: 1px solid var(--outline-soft); overflow: auto; max-height: 96px; font-family: var(--vscode-editor-font-family, Consolas, monospace); }
        .file-change-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: var(--space-3); }
        .row-streaming .row-shell { border-color: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 28%, transparent); background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 6%, var(--vscode-editor-background)); }
        .row-streaming.is-live .row-shell { border-color: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 42%, transparent); }
        .stream-live-badge { border-color: color-mix(in srgb, var(--tone-info) 34%, transparent); background: color-mix(in srgb, var(--tone-info) 14%, var(--surface-base)); color: var(--tone-info); }
        .row-streaming:not(.is-live) .stream-live-badge { background: var(--vscode-badge-background, rgba(127,127,127,0.16)); color: var(--vscode-badge-foreground, inherit); }
        .stream-inline-output { margin-top: 2px; white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.5; font-family: var(--vscode-editor-font-family, Consolas, monospace); padding: 9px 10px; border-radius: var(--radius-sm); background: var(--surface-soft); border: 1px solid var(--outline-soft); max-height: 180px; overflow: auto; }
        .stream-inline-output.is-empty { font-family: inherit; opacity: 0.7; }
        .stream-output { white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.5; padding: 8px 9px; border-radius: var(--radius-sm); background: var(--surface-soft); border: 1px solid var(--outline-soft); min-height: 52px; }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    </style>
</head>
<body>
    <div class="app-shell">
        <header class="header">
            <div class="header-top">
                <div class="header-title-group">
                    <h2>BeliefGuard</h2>
                </div>
                <div class="header-status-group">
                    <span id="run-status" class="status-chip is-idle">Idle</span>
                    <span id="run-phase" class="phase-chip">Run</span>
                </div>
            </div>
            <div id="header-nav" class="header-nav">
                <button type="button" class="header-nav-button is-active" data-header-view="run">Run</button>
                <button type="button" class="header-nav-button" data-header-view="audit">Audit</button>
                <button type="button" class="header-nav-button" data-header-view="beliefs">Beliefs</button>
                <button type="button" class="header-nav-button" data-header-view="files">Files</button>
            </div>
        </header>

        <div class="app-main">
            <section class="run-shell">
                <div class="transcript-shell">
                    <div id="chat-thread" class="chat-thread"></div>
                </div>
            </section>

            <section id="inspector-shell" class="inspector-shell is-collapsed">
                <div class="inspector-body">
                    <section id="audit-panel" class="inspector-panel is-active" data-inspector-panel="audit">
                        <div class="inspector-panel-title">Audit</div>
                        <div class="audit-panel-body">
                            <div id="audit-empty" class="audit-empty">No run events yet.</div>
                            <div id="audit-list"></div>
                            <div class="inspector-section">
                                <div class="inspector-section-title">Live output</div>
                                <div id="stream-empty" class="stream-empty">Live output appears here during generation.</div>
                                <div id="stream-output" class="stream-output" aria-live="polite"></div>
                            </div>
                        </div>
                    </section>
                    <section id="graph-panel" class="inspector-panel" data-inspector-panel="beliefs">
                        <div class="inspector-panel-title">Beliefs</div>
                        <div class="graph-panel-body"><div id="graph-empty" class="graph-empty">No beliefs captured yet.</div><div id="graph-groups"></div></div>
                    </section>
                    <section id="file-review-panel" class="inspector-panel" data-inspector-panel="files">
                        <div class="inspector-panel-title">Files</div>
                        <div class="review-panel-body">
                            <div id="file-review-summary-inspector" class="inspector-summary">No file changes queued.</div>
                            <div id="file-review-empty" class="review-empty">No file changes queued.</div>
                            <div id="file-review-list"></div>
                        </div>
                    </section>
                </div>
            </section>
        </div>

        <div class="composer-shell">
            <div class="composer">
                <label for="task-input" class="sr-only">Describe the coding task</label>
                <textarea id="task-input" placeholder="Describe the coding task you want reviewed.&#10;Example: add JWT auth to the user settings route"></textarea>
                <button id="btn-submit" class="btn-primary">Send task</button>
            </div>
        </div>
    </div>
    <script nonce="${nonce}">
        (function () {
            var vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
            var taskInput = document.getElementById('task-input');
            var btnSubmit = document.getElementById('btn-submit');
            var chatThread = document.getElementById('chat-thread');
            var auditList = document.getElementById('audit-list');
            var auditEmpty = document.getElementById('audit-empty');
            var graphGroups = document.getElementById('graph-groups');
            var graphEmpty = document.getElementById('graph-empty');
            var fileReviewList = document.getElementById('file-review-list');
            var fileReviewEmpty = document.getElementById('file-review-empty');
            var fileReviewSummary = document.getElementById('file-review-summary-inspector');
            var fileReviewPanel = document.getElementById('file-review-panel');
            var streamOutput = document.getElementById('stream-output');
            var streamEmpty = document.getElementById('stream-empty');
            var inspectorShell = document.getElementById('inspector-shell');
            var headerNav = document.getElementById('header-nav');
            var runStatus = document.getElementById('run-status');
            var runPhase = document.getElementById('run-phase');
            var activeView = 'run';
            var currentQuestions = [];
            var hasAnnouncedFileReview = false;
            var pendingFileChangesById = Object.create(null);
            var streamState = {
                mode: '',
                row: null,
                title: null,
                phase: null,
                badge: null,
                output: null,
                meta: null,
                hasContent: false,
            };
            function escapeHtml(str) { var div = document.createElement('div'); div.appendChild(document.createTextNode(str == null ? '' : String(str))); return div.innerHTML; }
            function escapeCssSelector(value) {
                if (window.CSS && typeof window.CSS.escape === 'function') {
                    return window.CSS.escape(String(value));
                }
                return String(value).replace(/["\\\\]/g, '\\\\$&');
            }
            function toSentenceCase(value) {
                var text = String(value || '').replace(/_/g, ' ').toLowerCase();
                return text.replace(/(^|\\s)([a-z])/g, function (match, prefix, char) {
                    return prefix + char.toUpperCase();
                });
            }
            function formatRiskLabel(value) {
                var normalized = String(value || 'UNKNOWN').toUpperCase();
                if (normalized === 'HIGH') return 'High risk';
                if (normalized === 'MEDIUM') return 'Medium risk';
                if (normalized === 'LOW') return 'Low risk';
                return toSentenceCase(normalized) + ' risk';
            }
            function formatBeliefType(value) {
                return toSentenceCase(value || 'TASK_BELIEF');
            }
            function formatStatusLabel(value) {
                var normalized = String(value || 'PENDING').toUpperCase();
                if (normalized === 'APPROVED') return 'Approved';
                if (normalized === 'REJECTED') return 'Rejected';
                if (normalized === 'PENDING') return 'Pending';
                if (normalized === 'UNKNOWN') return 'Pending';
                return toSentenceCase(normalized);
            }
            function formatFileSummary(summary) {
                var label = formatStatusLabel(summary && summary.status);
                var additions = Number((summary && summary.additions) || 0);
                var deletions = Number((summary && summary.deletions) || 0);
                return label + ' \u00B7 +' + additions + ' / -' + deletions;
            }
            function sanitizeUiText(value) {
                return String(value == null ? '' : value)
                    .replace(/[⚡✅✖↩🧪🕸️📄🛡️]/gu, '')
                    .replace(/…/g, '')
                    .replace(/\\s{2,}/g, ' ')
                    .trim();
            }
            function sanitizeStreamingText(value) {
                return String(value == null ? '' : value)
                    .replace(/[ƒs­ƒo.ƒo-ƒ+cdY¦dY,‹,?dY",dY>­‹,?]/gu, '')
                    .replace(/ƒ?Ý/g, '');
            }
            function getStatusTone(status) {
                var normalized = String(status || '').toLowerCase();
                if (normalized === 'idle') return 'is-idle';
                if (normalized === 'inspecting') return 'is-inspecting';
                if (normalized === 'awaiting clarification') return 'is-awaiting';
                if (normalized === 'generating patch') return 'is-generating';
                if (normalized === 'reviewing files' || normalized === 'ready for review') return 'is-reviewing';
                if (normalized === 'applying') return 'is-applying';
                if (normalized === 'completed') return 'is-completed';
                if (normalized === 'blocked') return 'is-blocked';
                if (normalized === 'error') return 'is-error';
                return 'is-idle';
            }
            function setRunState(status, phase) {
                var statusText = sanitizeUiText(status || 'Idle') || 'Idle';
                var phaseText = sanitizeUiText(phase || 'Run') || 'Run';
                if (runStatus) {
                    runStatus.textContent = statusText;
                    runStatus.className = 'status-chip ' + getStatusTone(statusText);
                }
                if (runPhase) runPhase.textContent = phaseText;
            }
            function setInspectorVisibility(isVisible) {
                if (!inspectorShell) return;
                inspectorShell.classList.toggle('is-collapsed', !isVisible);
            }
            function setActiveView(viewName) {
                activeView = viewName || activeView;
                setInspectorVisibility(activeView !== 'run');
                var panels = document.querySelectorAll('[data-inspector-panel]');
                panels.forEach(function (panel) {
                    if (!(panel instanceof HTMLElement)) return;
                    var isActive = panel.getAttribute('data-inspector-panel') === activeView;
                    panel.classList.toggle('is-active', isActive);
                });
                var tabs = document.querySelectorAll('[data-header-view]');
                tabs.forEach(function (tab) {
                    if (!(tab instanceof HTMLElement)) return;
                    var isActive = tab.getAttribute('data-header-view') === activeView;
                    tab.classList.toggle('is-active', isActive);
                    tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
            }
            function revealInspector(panelName) {
                setActiveView(panelName);
            }
            function mapAuditPhaseToLabel(phase) {
                var normalized = String(phase || '').toLowerCase();
                if (normalized === 'context' || normalized === 'session' || normalized === 'thinkn') return 'Context';
                if (normalized === 'extraction' || normalized === 'beliefs') return 'Extraction';
                if (normalized === 'grounding') return 'Grounding';
                if (normalized === 'gate') return 'Gate';
                if (normalized === 'questions') return 'Questions';
                if (normalized === 'patch') return 'Patch';
                if (normalized === 'validation') return 'Validation';
                return 'Run';
            }
            function deriveRunStateFromProcessing(message) {
                var text = String(message || '').toLowerCase();
                if (text.includes('context')) return { status: 'Inspecting', phase: 'Context' };
                if (text.includes('extract')) return { status: 'Inspecting', phase: 'Extraction' };
                if (text.includes('ground')) return { status: 'Inspecting', phase: 'Grounding' };
                if (text.includes('gate')) return { status: 'Inspecting', phase: 'Gate' };
                if (text.includes('question') || text.includes('clarification')) return { status: 'Inspecting', phase: 'Questions' };
                if (text.includes('patch')) return { status: 'Generating patch', phase: 'Patch' };
                if (text.includes('validat')) return { status: 'Inspecting', phase: 'Validation' };
                if (text.includes('review')) return { status: 'Reviewing files', phase: 'Review' };
                return { status: 'Inspecting', phase: 'Run' };
            }
            function getRowLabel(variant) {
                if (variant === 'user') return 'Task';
                if (variant === 'assistant') return 'Run';
                if (variant === 'system') return 'System';
                if (variant === 'milestone') return 'Milestone';
                if (variant === 'review') return 'Review';
                if (variant === 'warning') return 'Warning';
                if (variant === 'blocked') return 'Blocked';
                if (variant === 'error') return 'Error';
                if (variant === 'success') return 'Complete';
                return 'Run';
            }
            function appendRow(variant, title, bodyHtml, options) {
                if (!chatThread) return;
                var config = options || {};
                var row = document.createElement('article');
                row.className = 'transcript-row row-' + variant + (config.compact ? ' is-compact' : '') + (config.rowClass ? ' ' + config.rowClass : '');
                if (config.id) row.id = config.id;
                var metaHtml = config.meta ? '<div class="row-meta">' + escapeHtml(sanitizeUiText(config.meta)) + '</div>' : '';
                var titleHtml = title ? '<div class="row-title">' + escapeHtml(sanitizeUiText(title)) + '</div>' : '';
                var bodySection = bodyHtml ? '<div class="row-body">' + bodyHtml + '</div>' : '';
                row.innerHTML =
                    '<div class="row-shell">'
                    + '<div class="row-topline"><div class="row-label">' + escapeHtml(config.label || getRowLabel(variant)) + '</div></div>'
                    + titleHtml
                    + bodySection
                    + metaHtml
                    + '</div>';
                chatThread.appendChild(row);
                chatThread.scrollTop = chatThread.scrollHeight;
                return row;
            }
            function appendMessage(kind, title, bodyHtml) {
                var variant = kind;
                if (kind === 'action') variant = 'milestone';
                if (kind === 'blocked') variant = 'blocked';
                if (kind === 'error') variant = 'error';
                appendRow(variant, title, bodyHtml, { compact: kind === 'system' });
            }
            function appendProgressRow(message, phase) {
                appendRow('system', sanitizeUiText(message), '', {
                    compact: true,
                    label: phase ? sanitizeUiText(phase) : 'System'
                });
            }
            function seedWelcomeMessage() {
                appendRow(
                    'assistant',
                    'Ready to start',
                    'Describe a coding task to start a guarded run. Beliefs, review checkpoints, and proposed changes will appear here.',
                    { label: 'Run' }
                );
            }
            function clearRunUi() {
                if (chatThread) chatThread.innerHTML = '';
                if (auditList) auditList.innerHTML = '';
                if (auditEmpty) auditEmpty.style.display = '';
                if (graphGroups) graphGroups.innerHTML = '';
                if (graphEmpty) graphEmpty.style.display = '';
                if (fileReviewList) fileReviewList.innerHTML = '';
                if (fileReviewEmpty) fileReviewEmpty.style.display = '';
                if (fileReviewSummary) fileReviewSummary.textContent = 'No file changes queued.';
                if (streamOutput) streamOutput.textContent = '';
                if (streamEmpty) streamEmpty.style.display = '';
                pendingFileChangesById = Object.create(null);
                currentQuestions = [];
                hasAnnouncedFileReview = false;
                streamState = {
                    mode: '',
                    row: null,
                    title: null,
                    phase: null,
                    badge: null,
                    output: null,
                    meta: null,
                    hasContent: false,
                };
                setActiveView('run');
                setRunState('Idle', 'Run');
                seedWelcomeMessage();
            }
            function normalizeFileChange(fileChange, changeId) {
                var normalized = fileChange || {};
                var path = normalized.path || 'unknown-file';
                var diffPatch = normalized.diffPatch || '';
                var summary = normalized.summary || {};
                return {
                    changeId: changeId || normalized.changeId || path,
                    index: Number(normalized.index || 0),
                    totalFiles: Number(normalized.totalFiles || 0),
                    status: normalized.status || 'PENDING',
                    fileChange: {
                        path: path,
                        diffPatch: diffPatch,
                        summary: {
                            path: summary.path || path,
                            status: summary.status || 'UNKNOWN',
                            additions: Number(summary.additions || 0),
                            deletions: Number(summary.deletions || 0),
                        },
                    },
                };
            }
            function getFileReviewProgress() {
                var ids = Object.keys(pendingFileChangesById);
                var progress = { total: ids.length, approved: 0, rejected: 0, pending: 0, reviewed: 0 };
                ids.forEach(function (id) {
                    var status = (pendingFileChangesById[id] && pendingFileChangesById[id].status) || 'PENDING';
                    if (status === 'APPROVED') progress.approved += 1;
                    else if (status === 'REJECTED') progress.rejected += 1;
                    else progress.pending += 1;
                });
                progress.reviewed = progress.approved + progress.rejected;
                return progress;
            }
            function formatFileReviewSummary(progress) {
                if (!progress.total) return 'No file changes queued.';
                if (progress.total === 1) return 'Approve or reject this file before the run continues.';
                return 'Approve or reject each file before the run continues.';
            }
            function formatFileReviewMeta(progress) {
                if (!progress.total) return 'No file changes queued';
                var parts = [];
                parts.push(progress.reviewed + ' of ' + progress.total + ' reviewed');
                if (progress.pending) parts.push(progress.pending + ' pending');
                if (progress.approved) parts.push(progress.approved + ' approved');
                if (progress.rejected) parts.push(progress.rejected + ' rejected');
                return parts.join(' \u00B7 ');
            }
            function renderFileReviewSummaryChips(progress) {
                if (!progress.total) return '';
                return ''
                    + '<div class="stat-chip">Files ' + progress.total + '</div>'
                    + '<div class="stat-chip">Pending ' + progress.pending + '</div>'
                    + '<div class="stat-chip">Reviewed ' + progress.reviewed + '</div>';
            }
            function ensureFileReviewPhase() {
                if (!chatThread) return;
                var existing = document.getElementById('file-review-phase');
                if (existing) return existing;
                var row = document.createElement('article');
                row.id = 'file-review-phase';
                row.className = 'transcript-row row-review';
                row.innerHTML =
                    '<div class="row-shell file-review-phase">'
                    + '<div class="row-topline"><div class="row-label">Review</div></div>'
                    + '<div class="row-title">Review file changes</div>'
                    + '<div class="row-body">'
                    + '<div id="file-review-summary-copy"></div>'
                    + '<div id="file-review-summary" class="file-review-summary"></div>'
                    + '<div id="transcript-file-review-list" class="file-review-list"></div>'
                    + '<div class="row-actions">'
                    + '<button class="btn-secondary" data-action="review-diff">Review diff</button>'
                    + '<button class="btn-secondary" data-action="open-files">Open files</button>'
                    + '</div>'
                    + '</div>'
                    + '<div id="file-review-progress" class="row-meta"></div>'
                    + '</div>';
                chatThread.appendChild(row);
                chatThread.scrollTop = chatThread.scrollHeight;
                return row;
            }
            function updateFileReviewPhase() {
                var progress = getFileReviewProgress();
                var summaryCopy = document.getElementById('file-review-summary-copy');
                var summaryNode = document.getElementById('file-review-summary');
                var metaNode = document.getElementById('file-review-progress');
                if (summaryCopy) summaryCopy.textContent = formatFileReviewSummary(progress);
                if (summaryNode) summaryNode.innerHTML = renderFileReviewSummaryChips(progress);
                if (metaNode) metaNode.textContent = formatFileReviewMeta(progress);
                if (fileReviewSummary) fileReviewSummary.textContent = formatFileReviewMeta(progress);
            }
            function buildFileChangeItemHtml(review, variant) {
                var status = review.status || 'PENDING';
                var summary = review.fileChange.summary || {};
                var diffPreview = review.fileChange.diffPatch || '';
                var previewLines = diffPreview.split(/\\r?\\n/).slice(0, 12).join('\\n');
                if (variant === 'inspector') {
                    return ''
                        + '<div class="file-change-topline">'
                        + '<div class="file-change-path">' + escapeHtml(review.fileChange.path) + '</div>'
                        + '<div class="file-change-status">' + escapeHtml(formatStatusLabel(status)) + '</div>'
                        + '</div>'
                        + '<div class="file-change-meta">' + escapeHtml(formatFileSummary(summary)) + '</div>'
                        + (previewLines
                            ? '<details class="file-change-inspector-preview"><summary>Preview diff</summary><div class="file-change-diff">' + escapeHtml(previewLines) + '</div></details>'
                            : '')
                        ;
                }
                var ordinal = '';
                if (review.index && review.totalFiles) {
                    ordinal = '<div class="file-change-ordinal">File ' + review.index + ' of ' + review.totalFiles + '</div>';
                }
                return ''
                    + ordinal
                    + '<div class="file-change-topline">'
                    + '<div class="file-change-path">' + escapeHtml(review.fileChange.path) + '</div>'
                    + '<div class="file-change-status">' + escapeHtml(formatStatusLabel(status)) + '</div>'
                    + '</div>'
                    + '<div class="file-change-meta">' + escapeHtml(formatFileSummary(summary)) + '</div>'
                    + '<div class="file-change-diff-label">Diff preview</div>'
                    + '<div class="file-change-diff">' + escapeHtml(previewLines || '(empty diff)') + '</div>'
                    + '<div class="file-change-actions">'
                    + '<button class="btn-primary" data-action="approve-file-change" data-file-change-id="' + escapeHtml(review.changeId) + '"' + (status !== 'PENDING' ? ' disabled' : '') + '>Approve file</button>'
                    + '<button class="btn-danger" data-action="reject-file-change" data-file-change-id="' + escapeHtml(review.changeId) + '"' + (status !== 'PENDING' ? ' disabled' : '') + '>Reject file</button>'
                    + '</div>';
            }
            function upsertFileChangeItem(container, review, variantClass) {
                if (!container) return;
                var selector = '[data-file-change-id="' + escapeCssSelector(review.changeId) + '"]';
                var existing = container.querySelector(selector);
                var card = existing || document.createElement('div');
                card.className = 'file-change-card ' + (variantClass || '');
                card.dataset.fileChangeId = review.changeId;
                card.classList.toggle('approved', review.status === 'APPROVED');
                card.classList.toggle('rejected', review.status === 'REJECTED');
                card.innerHTML = buildFileChangeItemHtml(review, variantClass === 'is-inspector' ? 'inspector' : 'transcript');
                if (!existing) container.appendChild(card);
            }
            function renderFileChangeCard(review) {
                if (fileReviewList && fileReviewEmpty) {
                    fileReviewEmpty.style.display = 'none';
                    upsertFileChangeItem(fileReviewList, review, 'is-inspector');
                }
                var transcriptList = document.getElementById('transcript-file-review-list');
                if (transcriptList) {
                    upsertFileChangeItem(transcriptList, review, 'is-transcript');
                }
            }
            function renderFileChangeReady(payload, changeId) {
                var normalizedPayload = payload && payload.fileChange ? payload : { fileChange: payload, changeId: changeId };
                var review = normalizeFileChange({
                    changeId: normalizedPayload.changeId,
                    path: normalizedPayload.fileChange && normalizedPayload.fileChange.path,
                    diffPatch: normalizedPayload.fileChange && normalizedPayload.fileChange.diffPatch,
                    summary: normalizedPayload.fileChange && normalizedPayload.fileChange.summary,
                    index: normalizedPayload.index,
                    totalFiles: normalizedPayload.totalFiles,
                });
                pendingFileChangesById[review.changeId] = review;
                settleStreamingRow('Output captured');
                if (!hasAnnouncedFileReview) {
                    hasAnnouncedFileReview = true;
                    ensureFileReviewPhase();
                }
                setRunState('Reviewing files', 'Review');
                updateFileReviewPhase();
                renderFileChangeCard(review);
            }
            function updateFileChangeDecision(changeId, decision) {
                var review = pendingFileChangesById[changeId];
                if (!review) return;
                review.status = decision;
                var cards = document.querySelectorAll('[data-file-change-id="' + escapeCssSelector(changeId) + '"]');
                cards.forEach(function (card) {
                    card.classList.remove('approved', 'rejected');
                    card.classList.add(decision === 'APPROVED' ? 'approved' : 'rejected');
                    var statusNode = card.querySelector('.file-change-status');
                    if (statusNode) statusNode.textContent = formatStatusLabel(decision);
                    var buttons = card.querySelectorAll('button[data-action="approve-file-change"], button[data-action="reject-file-change"]');
                    buttons.forEach(function (button) { button.disabled = true; });
                });
                updateFileReviewPhase();
            }
            function getStreamingMode(marker) {
                var text = String(marker || '').toLowerCase();
                var contextMatch = text.match(/context expansion\s+(\d+)/);
                if (contextMatch) {
                    return {
                        key: 'context',
                        title: 'Expanding context ' + contextMatch[1],
                        phase: 'Context',
                        status: 'Inspecting',
                    };
                }
                if (text.indexOf('patch generation') !== -1) {
                    return {
                        key: 'patch',
                        title: 'Generating patch',
                        phase: 'Patch',
                        status: 'Generating patch',
                    };
                }
                return {
                    key: 'stream',
                    title: 'Live generation',
                    phase: 'Run',
                    status: 'Inspecting',
                };
            }
            function extractStreamingChunkState(chunk) {
                var raw = String(chunk == null ? '' : chunk);
                var markers = [];
                var cleaned = raw.replace(/\[(patch generation|context expansion\s+\d+)\]/ig, function (_match, markerText) {
                    markers.push(markerText);
                    return '';
                });
                return {
                    raw: raw,
                    cleaned: sanitizeStreamingText(cleaned),
                    mode: markers.length ? getStreamingMode(markers[markers.length - 1]) : null,
                };
            }
            function ensureStreamingRow(mode) {
                if (streamState.row && streamState.mode === mode.key) {
                    return streamState;
                }
                if (streamState.row && streamState.mode !== mode.key) {
                    settleStreamingRow('Output captured');
                }
                var row = appendRow(
                    'system',
                    mode.title,
                    '<div class="stream-inline-output is-empty">Live output appears here during generation.</div>',
                    {
                        label: mode.phase,
                        meta: 'Live output',
                        rowClass: 'row-streaming is-live',
                    }
                );
                if (!row) return streamState;
                streamState = {
                    mode: mode.key,
                    row: row,
                    title: row.querySelector('.row-title'),
                    phase: row.querySelector('.row-label'),
                    badge: null,
                    output: row.querySelector('.stream-inline-output'),
                    meta: row.querySelector('.row-meta'),
                    hasContent: false,
                };
                if (streamState.phase) streamState.phase.textContent = mode.phase;
                if (streamState.title) streamState.title.textContent = mode.title;
                if (streamState.meta) streamState.meta.textContent = 'Live output';
                var topLine = row.querySelector('.row-topline');
                if (topLine) {
                    var badge = document.createElement('div');
                    badge.className = 'stream-live-badge';
                    badge.textContent = 'Live';
                    topLine.appendChild(badge);
                    streamState.badge = badge;
                }
                return streamState;
            }
            function settleStreamingRow(metaText) {
                if (!streamState.row) return;
                streamState.row.classList.remove('is-live');
                if (streamState.badge) streamState.badge.textContent = 'Captured';
                if (streamState.meta) streamState.meta.textContent = metaText || 'Output captured';
                streamState.mode = '';
                streamState.row = null;
                streamState.title = null;
                streamState.phase = null;
                streamState.badge = null;
                streamState.output = null;
                streamState.meta = null;
                streamState.hasContent = false;
            }
            function appendStreamingChunk(chunk) {
                if (!streamOutput || !streamEmpty) return;
                streamEmpty.style.display = 'none';
                var current = streamOutput.textContent || '';
                var parsed = extractStreamingChunkState(chunk);
                streamOutput.textContent = current + parsed.raw;
                var mode = parsed.mode || getStreamingMode(streamState.mode || 'stream');
                ensureStreamingRow(mode);
                setRunState(mode.status, mode.phase);
                if (streamState.phase) streamState.phase.textContent = mode.phase;
                if (streamState.title) streamState.title.textContent = mode.title;
                if (streamState.meta) streamState.meta.textContent = 'Live output';
                if (streamState.badge) streamState.badge.textContent = 'Live';
                if (streamState.output && parsed.cleaned) {
                    if (!streamState.hasContent) {
                        streamState.output.textContent = '';
                        streamState.output.classList.remove('is-empty');
                        streamState.hasContent = true;
                    }
                    streamState.output.textContent = (streamState.output.textContent || '') + parsed.cleaned;
                    streamState.output.scrollTop = streamState.output.scrollHeight;
                }
                if (chatThread) chatThread.scrollTop = chatThread.scrollHeight;
            }
            function renderBeliefCards(beliefs) {
                return (beliefs || []).map(function (belief) {
                    var klass = 'belief-card';
                    if (belief.riskLevel === 'HIGH') klass += ' high-risk';
                    else if (belief.riskLevel === 'MEDIUM') klass += ' medium-risk';
                    return '<div class="' + klass + '"><div class="label">' + escapeHtml(formatRiskLabel(belief.riskLevel)) + ' · ' + escapeHtml(formatBeliefType(belief.type)) + '</div><div>' + escapeHtml(belief.statement) + '</div><div class="meta">Confidence ' + Number((belief.confidenceScore || 0) * 100).toFixed(0) + '% · ' + escapeHtml(belief.isValidated ? 'Validated' : 'Open') + '</div></div>';
                }).join('');
            }
            function renderBlockingBeliefItems(beliefs) {
                return (beliefs || []).map(function (belief) {
                    var klass = 'blocker-item';
                    if (belief.riskLevel === 'HIGH') klass += ' high-risk';
                    return '<div class="' + klass + '">'
                        + '<div class="blocker-statement">' + escapeHtml(belief.statement) + '</div>'
                        + '<div class="blocker-meta">'
                        + escapeHtml(formatRiskLabel(belief.riskLevel))
                        + ' · Confidence ' + Number((belief.confidenceScore || 0) * 100).toFixed(0) + '%'
                        + ' · ' + escapeHtml(belief.isValidated ? 'Validated' : 'Open')
                        + '</div>'
                        + '</div>';
                }).join('');
            }
            function renderQuestionBlocks(questions, beliefsById) {
                return (questions || []).map(function (question) {
                    var relatedBelief = beliefsById && question && question.beliefId ? beliefsById[question.beliefId] : null;
                    var inner = '<div class="question-text">' + escapeHtml(question.questionText) + '</div>';
                    if (relatedBelief) {
                        inner += '<div class="question-meta">Belief: ' + escapeHtml(relatedBelief.statement) + '</div>';
                    }
                    if (question.options && question.options.length) {
                        inner += '<div class="options">';
                        question.options.forEach(function (option, index) { inner += '<label><input type="radio" name="q-' + question.beliefId + '" value="' + escapeHtml(option) + '"' + (index === 0 ? ' checked' : '') + ' />' + escapeHtml(option) + '</label>'; });
                        inner += '</div>';
                    } else {
                        inner += '<input type="text" id="input-' + question.beliefId + '" placeholder="Type your answer" />';
                    }
                    return '<div class="question-item">' + inner + '</div>';
                }).join('');
            }
            function renderBeliefReview(beliefs, questions) {
                var blockingBeliefs = (beliefs || []).filter(function (belief) {
                    return belief && belief.isValidated === false && belief.riskLevel === 'HIGH';
                });
                var beliefsById = Object.create(null);
                blockingBeliefs.forEach(function (belief) {
                    if (belief && belief.id) beliefsById[belief.id] = belief;
                });
                currentQuestions = questions || [];
                setRunState('Awaiting clarification', 'Questions');
                appendRow(
                    'review',
                    'Run paused for clarification',
                    '<div>' + (blockingBeliefs.length === 1
                        ? 'This high-risk belief must be confirmed before edits can continue.'
                        : 'These high-risk beliefs must be confirmed before edits can continue.') + '</div>'
                    + '<div class="clarification-summary">'
                    + '<div class="stat-chip">Beliefs ' + blockingBeliefs.length + '</div>'
                    + '<div class="stat-chip">Questions ' + currentQuestions.length + '</div>'
                    + '<div class="stat-chip">Awaiting clarification</div>'
                    + '</div>'
                    + '<div class="row-stack">'
                    + '<div class="row-panel"><div class="row-panel-title">Beliefs requiring clarification</div><div class="blocker-list">' + renderBlockingBeliefItems(blockingBeliefs) + '</div></div>'
                    + '<div class="row-panel"><div class="row-panel-title">Questions to continue</div><div id="active-question-card" class="question-list">' + renderQuestionBlocks(currentQuestions, beliefsById) + '</div></div>'
                    + '</div>'
                    + '<div class="row-actions">'
                    + '<button class="btn-primary" data-action="submit-answers">Submit answers</button>'
                    + '<button class="btn-secondary" data-action="expand-graph">Open beliefs</button>'
                    + '</div>',
                    {
                        label: 'Review',
                        meta: 'Only blocking beliefs are shown here. Open Beliefs for the full graph.'
                    }
                );
            }
            function renderPatchSummary(summary) {
                if (!summary || !Array.isArray(summary.files)) return '<div>No changes are ready yet.</div>';
                var rows = summary.files.map(function (file) {
                    return '<div class="patch-file-row"><div class="patch-file-path">' + escapeHtml(file.path) + '</div><div class="patch-file-meta">' + escapeHtml(formatFileSummary(file)) + '</div></div>';
                }).join('');
                return ''
                    + '<div class="patch-summary">'
                    + '<div class="patch-summary-header">' + summary.fileCount + ' files \u00B7 +' + summary.additions + ' / -' + summary.deletions + '</div>'
                    + '<div class="patch-summary-files">' + rows + '</div>'
                    + '</div>';
            }
            function renderPatchReady(summary) {
                settleStreamingRow('Output captured');
                setRunState('Ready for review', 'Review');
                appendRow(
                    'review',
                    'Patch ready',
                    '<div>Validated against the current belief state and ready for final review.</div>'
                    + '<div class="row-stack"><div class="row-panel">' + renderPatchSummary(summary) + '</div></div>'
                    + '<div class="row-actions">'
                    + '<button class="btn-primary" data-action="review-diff">Review diff</button>'
                    + '<button class="btn-secondary" data-action="apply-patch">Apply changes</button>'
                    + '<button class="btn-danger" data-action="reject-patch">Reject changes</button>'
                    + '</div>',
                    { label: 'Review', meta: 'Changes are ready for final review.' }
                );
            }
            function renderAssistantMessage(title, message) {
                appendMessage('assistant', title || 'Update', '<div>' + escapeHtml(sanitizeUiText(message || '')) + '</div>');
            }
            function renderBlocked(reason, violations) {
                settleStreamingRow('Run interrupted');
                setRunState('Blocked', 'Gate');
                appendRow(
                    'blocked',
                    'Run blocked',
                    '<div>' + escapeHtml(sanitizeUiText(reason || 'Run blocked by conflicting constraints.')) + '</div>'
                    + '<div class="row-stack"><div class="row-panel"><div class="row-panel-title">Blocking beliefs</div>' + renderBeliefCards(violations || []) + '</div></div>'
                    + '<div class="row-actions"><button class="btn-secondary" data-action="restart-run">Start over</button></div>',
                    { label: 'Blocked' }
                );
            }
            function renderError(message) {
                settleStreamingRow('Run interrupted');
                setRunState('Error', 'Run');
                appendRow(
                    'error',
                    'Error',
                    '<div>' + escapeHtml(sanitizeUiText(message || 'An unexpected error interrupted the run.')) + '</div>'
                    + '<div class="row-actions"><button class="btn-secondary" data-action="restart-run">Start over</button></div>',
                    { label: 'Error' }
                );
            }
            function renderAuditEvent(event) {
                if (!auditList) return;
                if (auditEmpty) auditEmpty.style.display = 'none';
                if (event && event.phase && runPhase) {
                    runPhase.textContent = mapAuditPhaseToLabel(event.phase);
                }
                var item = document.createElement('div');
                item.className = 'audit-item ' + escapeHtml(event.level || 'info');
                var timeText = '';
                if (event.timestamp) { try { timeText = new Date(event.timestamp).toLocaleTimeString(); } catch (_err) { timeText = String(event.timestamp); } }
                var phaseLabel = mapAuditPhaseToLabel(event.phase || 'run');
                var levelLabel = toSentenceCase(event.level || 'info');
                var html = ''
                    + '<div class="audit-head">'
                    + '<div class="audit-phase-line"><div class="audit-phase">' + escapeHtml(phaseLabel) + '</div><div class="audit-level-badge">' + escapeHtml(levelLabel) + '</div></div>'
                    + '<div class="audit-time">' + escapeHtml(timeText) + '</div>'
                    + '</div>'
                    + '<div class="audit-topline"><div class="audit-title">' + escapeHtml(sanitizeUiText(event.title || 'Audit event')) + '</div></div>';
                if (event.detail || event.data !== undefined) {
                    html += '<details class="audit-data"><summary>Details</summary>';
                    if (event.detail) {
                        html += '<div class="audit-detail">' + escapeHtml(sanitizeUiText(event.detail)) + '</div>';
                    }
                    if (event.data !== undefined) {
                        var serialized = '';
                        try { serialized = JSON.stringify(event.data, null, 2); } catch (_err) { serialized = String(event.data); }
                        html += '<pre>' + escapeHtml(serialized) + '</pre>';
                    }
                    html += '</details>';
                }
                item.innerHTML = html;
                auditList.prepend(item);

                if (shouldMirrorAuditToChat(event)) {
                    appendMessage(
                        event.level === 'error' ? 'error' : 'system',
                        sanitizeUiText(event.title || 'Audit event'),
                        escapeHtml(sanitizeUiText(event.detail || ''))
                    );
                }
            }

            function shouldMirrorAuditToChat(event) {
                if (!event || !event.phase) {
                    return false;
                }

                return false;
            }
            function renderBeliefGraph(beliefs) {
                if (!graphGroups || !graphEmpty) return;
                graphGroups.innerHTML = '';
                var items = Array.isArray(beliefs) ? beliefs : [];
                if (!items.length) { graphEmpty.style.display = ''; return; }
                graphEmpty.style.display = 'none';
                var grouped = { REPO_FACT: [], USER_CONSTRAINT: [], TASK_BELIEF: [], AGENT_ASSUMPTION: [] };
                items.forEach(function (belief) { if (!grouped[belief.type]) grouped[belief.type] = []; grouped[belief.type].push(belief); });
                Object.keys(grouped).forEach(function (type) {
                    var entries = grouped[type] || [];
                    if (!entries.length) return;
                    var section = document.createElement('div');
                    section.className = 'graph-group';
                    section.innerHTML = '<div class="graph-group-title"><span>' + escapeHtml(formatBeliefType(type)) + '</span><span class="graph-group-count">' + entries.length + '</span></div>';
                    entries.forEach(function (belief) {
                        var klass = 'graph-node';
                        if (belief.riskLevel === 'HIGH') klass += ' high-risk';
                        else if (belief.riskLevel === 'MEDIUM') klass += ' medium-risk';
                        var node = document.createElement('div');
                        node.className = klass;
                        var badges = '<span class="graph-badge">' + escapeHtml(formatRiskLabel(belief.riskLevel)) + '</span><span class="graph-badge">Confidence ' + Number((belief.confidenceScore || 0) * 100).toFixed(0) + '%</span><span class="graph-badge">' + escapeHtml(belief.isValidated ? 'Validated' : 'Open') + '</span>';
                        if ((belief.contradictions || []).length) badges += '<span class="graph-badge">Conflicts ' + belief.contradictions.length + '</span>';
                        node.innerHTML = '<div class="graph-node-top"><div class="graph-node-statement">' + escapeHtml(belief.statement) + '</div><div class="graph-badges">' + badges + '</div></div><div class="graph-meta">Evidence ' + ((belief.evidenceIds && belief.evidenceIds.length) || 0) + ' · Conflicts ' + ((belief.contradictions && belief.contradictions.length) || 0) + '</div>';
                        section.appendChild(node);
                    });
                    graphGroups.appendChild(section);
                });
            }
            function postToExtension(message) {
                if (!vscodeApi || typeof vscodeApi.postMessage !== 'function') { renderError('The run could not connect to the extension host. Reload the window and try again.'); return false; }
                vscodeApi.postMessage(message);
                return true;
            }
            function collectAndSubmitAnswers() {
                currentQuestions.forEach(function (question) {
                    var answer = '';
                    if (question.options && question.options.length) {
                        var checked = chatThread.querySelector('input[name="q-' + question.beliefId + '"]:checked');
                        answer = checked ? checked.value : '';
                    } else {
                        var input = chatThread.querySelector('#input-' + question.beliefId);
                        answer = input ? input.value.trim() : '';
                    }
                    if (answer) postToExtension({ type: 'USER_ANSWERED', payload: { beliefId: question.beliefId, answer: answer } });
                });
                currentQuestions = [];
                setRunState('Inspecting', 'Questions');
                appendRow(
                    'success',
                    'Answers submitted',
                    'Re-evaluating beliefs.',
                    { label: 'Complete', meta: 'Clarification submitted' }
                );
                appendProgressRow('Re-evaluating beliefs', 'Questions');
            }
            function handleDynamicAction(event) {
                var target = event.target;
                if (!(target instanceof HTMLElement)) return;
                var button = target.closest('button[data-action]');
                if (!button) return;
                var action = button.getAttribute('data-action');
                if (action === 'submit-answers') collectAndSubmitAnswers();
                else if (action === 'open-files') revealInspector('files');
                else if (action === 'review-diff') postToExtension({ type: 'REVIEW_DIFF' });
                else if (action === 'apply-patch') postToExtension({ type: 'APPLY_PATCH' });
                else if (action === 'reject-patch') {
                    postToExtension({ type: 'REJECT_PATCH' });
                    appendRow(
                        'system',
                        'Changes rejected',
                        'The pending patch was discarded.',
                        { compact: true, label: 'Run' }
                    );
                }
                else if (action === 'approve-file-change') {
                    var approveId = button.getAttribute('data-file-change-id') || '';
                    var approveReview = pendingFileChangesById[approveId];
                    if (approveReview && postToExtension({
                        type: 'APPROVE_FILE_CHANGE',
                        payload: {
                            changeId: approveReview.changeId,
                            fileChange: approveReview.fileChange,
                            index: approveReview.index || undefined,
                            totalFiles: approveReview.totalFiles || undefined,
                        },
                    })) {
                        updateFileChangeDecision(approveReview.changeId, 'APPROVED');
                    }
                }
                else if (action === 'reject-file-change') {
                    var rejectId = button.getAttribute('data-file-change-id') || '';
                    var rejectReview = pendingFileChangesById[rejectId];
                    if (rejectReview && postToExtension({
                        type: 'REJECT_FILE_CHANGE',
                        payload: {
                            changeId: rejectReview.changeId,
                            fileChange: rejectReview.fileChange,
                            index: rejectReview.index || undefined,
                            totalFiles: rejectReview.totalFiles || undefined,
                        },
                    })) {
                        updateFileChangeDecision(rejectReview.changeId, 'REJECTED');
                    }
                }
                else if (action === 'expand-graph') {
                    revealInspector('beliefs');
                }
                else if (action === 'restart-run') clearRunUi();
            }
            if (!taskInput || !btnSubmit || !chatThread || !auditList || !auditEmpty || !graphGroups || !graphEmpty) return;
            clearRunUi();
            if (headerNav) {
                headerNav.addEventListener('click', function (event) {
                    var target = event.target;
                    if (!(target instanceof HTMLElement)) return;
                    var tab = target.closest('[data-header-view]');
                    if (!(tab instanceof HTMLElement)) return;
                    var panelName = tab.getAttribute('data-header-view') || 'run';
                    setActiveView(panelName);
                });
            }
            btnSubmit.addEventListener('click', function () {
                var task = taskInput.value.trim();
                if (!task) return;
                btnSubmit.disabled = true;
                clearRunUi();
                setRunState('Inspecting', 'Context');
                appendRow('user', '', '<div>' + escapeHtml(task) + '</div>', { label: 'Task' });
                appendProgressRow('Starting run', 'Context');
                if (!postToExtension({ type: 'TASK_SUBMITTED', payload: { task: task } })) btnSubmit.disabled = false;
            });
            taskInput.addEventListener('keydown', function (event) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') btnSubmit.click(); });
            chatThread.addEventListener('click', handleDynamicAction);
            if (fileReviewList) fileReviewList.addEventListener('click', handleDynamicAction);
            window.addEventListener('message', function (event) {
                var msg = event.data || {};
                btnSubmit.disabled = false;
                switch (msg.type) {
                    case 'PROCESSING':
                        var processingMessage = sanitizeUiText((msg.payload && msg.payload.message) || 'Inspecting run');
                        var derivedState = deriveRunStateFromProcessing(processingMessage);
                        setRunState(derivedState.status, derivedState.phase);
                        var processingText = processingMessage.toLowerCase();
                        var isStreamPhase = processingText.indexOf('generating code patch') !== -1
                            || processingText.indexOf('context expansion') !== -1;
                        if (!isStreamPhase) {
                            appendProgressRow(processingMessage, derivedState.phase);
                        }
                        break;
                    case 'ASSISTANT_MESSAGE': renderAssistantMessage((msg.payload && msg.payload.title) || 'Update', (msg.payload && msg.payload.message) || ''); break;
                    case 'AUDIT_EVENT': renderAuditEvent((msg.payload && msg.payload.event) || {}); break;
                    case 'BELIEF_GRAPH_UPDATED': renderBeliefGraph((msg.payload && msg.payload.beliefs) || []); break;
                    case 'BELIEFS_EXTRACTED': renderBeliefReview((msg.payload && msg.payload.beliefs) || [], (msg.payload && msg.payload.questions) || []); renderBeliefGraph((msg.payload && msg.payload.beliefs) || []); break;
                    case 'FILE_CHANGE_READY': renderFileChangeReady(msg.payload || {}, (msg.payload && msg.payload.changeId) || undefined); break;
                    case 'FILE_REVIEW_COMPLETE':
                        setRunState('Completed', 'Review');
                        appendRow(
                            'success',
                            'File review complete',
                            (((msg.payload && msg.payload.appliedPaths) || []).length) + ' approved · ' + (((msg.payload && msg.payload.rejectedPaths) || []).length) + ' rejected',
                            {
                                label: 'Complete',
                                meta: 'Review finished'
                            }
                        );
                        break;
                    case 'STREAMING_CHUNK': appendStreamingChunk((msg.payload && msg.payload.chunk) || ''); break;
                    case 'PATCH_READY': renderPatchReady((msg.payload && msg.payload.summary) || null); break;
                    case 'BLOCKED': renderBlocked((msg.payload && msg.payload.reason) || 'Run blocked by conflicting constraints.', (msg.payload && msg.payload.violations) || []); break;
                    case 'ERROR': renderError((msg.payload && msg.payload.message) || 'An unexpected error interrupted the run.'); break;
                }
            });
            window.addEventListener('error', function (event) { renderError(event.error || event.message || 'An unexpected webview error interrupted the run.'); });
            window.addEventListener('unhandledrejection', function (event) { renderError(event.reason || 'An unexpected error interrupted the run.'); });
        })();
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
