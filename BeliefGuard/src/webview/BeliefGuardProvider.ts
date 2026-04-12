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
    PatchSummary,
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
            }
        });
    }

    public postProcessing(message: string): void {
        this._post({ type: 'PROCESSING', payload: { message } });
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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--vscode-font-family, system-ui, sans-serif); font-size: var(--vscode-font-size, 13px); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 12px; line-height: 1.5; }
        .header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .header .shield { font-size: 20px; }
        .header h2 { font-size: 14px; font-weight: 600; }
        .chat-thread { display: flex; flex-direction: column; gap: 10px; min-height: 220px; margin-bottom: 12px; }
        .message { border-radius: 8px; padding: 10px 12px; background: var(--vscode-editor-background); border: 1px solid transparent; }
        .message.user { align-self: flex-end; max-width: 92%; background: color-mix(in srgb, var(--vscode-button-background) 20%, var(--vscode-editor-background)); border-color: color-mix(in srgb, var(--vscode-button-background) 35%, transparent); }
        .message.error, .message.blocked { border-color: var(--vscode-errorForeground, #f44747); background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 10%, var(--vscode-editor-background)); }
        .message-role { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.7; margin-bottom: 4px; }
        .message-title { font-weight: 600; margin-bottom: 6px; }
        .message-body { font-size: 12px; }
        .composer { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        textarea, input[type="text"] { width: 100%; padding: 8px 10px; border: 1px solid var(--vscode-input-border, #3c3c3c); border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: inherit; }
        textarea { min-height: 92px; resize: vertical; }
        textarea:focus, input[type="text"]:focus { outline: none; border-color: var(--vscode-focusBorder); }
        button { padding: 8px 14px; border: none; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: inherit; font-weight: 500; }
        button:hover { opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .belief-card, .graph-node, .patch-file-row, .question-block { background: var(--vscode-sideBar-background); border-radius: 6px; padding: 10px 12px; }
        .belief-card { border-left: 4px solid var(--vscode-charts-blue, #3794ff); margin-bottom: 6px; }
        .belief-card.high-risk, .graph-node.high-risk { border-left-color: var(--vscode-errorForeground, #f44747); }
        .belief-card.medium-risk, .graph-node.medium-risk { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
        .belief-card .label, .graph-group-title, .audit-phase { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.75; margin-bottom: 4px; }
        .belief-card .meta, .graph-meta, .patch-file-meta { margin-top: 6px; font-size: 11px; opacity: 0.7; }
        .question-block + .question-block, .graph-node + .graph-node, .graph-group + .graph-group, .patch-file-row + .patch-file-row, .audit-item + .audit-item { margin-top: 6px; }
        .question-block .q-text { font-weight: 600; margin-bottom: 8px; }
        .question-block .options { display: flex; flex-direction: column; gap: 4px; }
        .question-block .options label { display: flex; align-items: center; gap: 6px; }
        .card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
        .patch-summary-header { font-size: 12px; opacity: 0.8; margin-bottom: 6px; }
        .patch-file-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
        .patch-file-path { font-size: 12px; word-break: break-word; }
        .audit-panel, .graph-panel { margin-top: 14px; border: 1px solid var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c)); border-radius: 6px; background: var(--vscode-editor-background); overflow: hidden; }
        .audit-panel summary, .graph-panel summary { cursor: pointer; padding: 10px 12px; font-weight: 600; list-style: none; }
        .audit-panel summary::-webkit-details-marker, .graph-panel summary::-webkit-details-marker, .audit-data summary::-webkit-details-marker { display: none; }
        .audit-panel[open] summary, .graph-panel[open] summary { border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c)); }
        .audit-panel-body, .graph-panel-body { max-height: 320px; overflow: auto; padding: 10px 12px; }
        .audit-empty, .graph-empty { opacity: 0.7; font-size: 12px; }
        .audit-item { border-left: 3px solid var(--vscode-charts-blue, #3794ff); background: var(--vscode-sideBar-background); border-radius: 4px; padding: 8px 10px; }
        .audit-item.success { border-left-color: var(--vscode-charts-green, #89d185); }
        .audit-item.warning { border-left-color: var(--vscode-editorWarning-foreground, #cca700); }
        .audit-item.error { border-left-color: var(--vscode-errorForeground, #f44747); }
        .audit-topline, .graph-node-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .audit-title, .graph-node-statement { font-weight: 600; font-size: 12px; }
        .audit-time { font-size: 11px; opacity: 0.65; white-space: nowrap; }
        .audit-data { margin-top: 6px; }
        .audit-data summary { font-size: 11px; opacity: 0.8; cursor: pointer; }
        .audit-data pre { margin-top: 6px; white-space: pre-wrap; word-break: break-word; font-size: 11px; padding: 8px; border-radius: 4px; background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08)); overflow: auto; }
        .graph-node { border-left: 3px solid var(--vscode-charts-blue, #3794ff); }
        .graph-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
        .graph-badge { font-size: 10px; padding: 2px 6px; border-radius: 999px; background: var(--vscode-badge-background, rgba(127,127,127,0.16)); }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    </style>
</head>
<body>
    <div class="header"><span class="shield">🛡️</span><h2>BeliefGuard</h2></div>
    <div id="chat-thread" class="chat-thread"></div>
    <div class="composer">
        <label for="task-input" class="sr-only">Describe your coding task</label>
        <textarea id="task-input" placeholder="Describe your coding task…&#10;e.g. 'Implement JWT-based auth on the user settings route'"></textarea>
        <button id="btn-submit" class="btn-primary">⚡ Send Guarded Task</button>
    </div>
    <details id="audit-panel" class="audit-panel">
        <summary>🧪 Run Audit Timeline</summary>
        <div class="audit-panel-body"><div id="audit-empty" class="audit-empty">No audit events yet. Start a task to inspect extraction, grounding, and gate decisions.</div><div id="audit-list"></div></div>
    </details>
    <details id="graph-panel" class="graph-panel">
        <summary>🕸️ Belief Graph Snapshot</summary>
        <div class="graph-panel-body"><div id="graph-empty" class="graph-empty">No beliefs yet. Start a task to inspect the current belief graph.</div><div id="graph-groups"></div></div>
    </details>
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
            var currentQuestions = [];
            function escapeHtml(str) { var div = document.createElement('div'); div.appendChild(document.createTextNode(str == null ? '' : String(str))); return div.innerHTML; }
            function appendMessage(kind, title, bodyHtml) {
                if (!chatThread) return;
                var card = document.createElement('div');
                card.className = 'message ' + kind;
                card.innerHTML = '<div class="message-role">' + escapeHtml(kind === 'user' ? 'You' : 'BeliefGuard') + '</div><div class="message-title">' + escapeHtml(title) + '</div><div class="message-body">' + bodyHtml + '</div>';
                chatThread.appendChild(card);
            }
            function seedWelcomeMessage() { appendMessage('assistant', 'BeliefGuard', 'Describe a coding task to start a guarded run. I will audit extraction, explain gate decisions, surface the belief graph, and propose a workspace patch for review.'); }
            function clearRunUi() {
                if (chatThread) chatThread.innerHTML = '';
                if (auditList) auditList.innerHTML = '';
                if (auditEmpty) auditEmpty.style.display = '';
                if (graphGroups) graphGroups.innerHTML = '';
                if (graphEmpty) graphEmpty.style.display = '';
                currentQuestions = [];
                seedWelcomeMessage();
            }
            function renderBeliefCards(beliefs) {
                return (beliefs || []).map(function (belief) {
                    var klass = 'belief-card';
                    if (belief.riskLevel === 'HIGH') klass += ' high-risk';
                    else if (belief.riskLevel === 'MEDIUM') klass += ' medium-risk';
                    return '<div class="' + klass + '"><div class="label">' + escapeHtml(belief.riskLevel) + ' risk · ' + escapeHtml(belief.type) + '</div><div>' + escapeHtml(belief.statement) + '</div><div class="meta">Confidence: ' + Number((belief.confidenceScore || 0) * 100).toFixed(0) + '% · ' + (belief.isValidated ? '✅ Validated' : '⚠️ Unverified') + '</div></div>';
                }).join('');
            }
            function renderQuestionBlocks(questions) {
                return (questions || []).map(function (question) {
                    var inner = '<div class="q-text">' + escapeHtml(question.questionText) + '</div>';
                    if (question.options && question.options.length) {
                        inner += '<div class="options">';
                        question.options.forEach(function (option, index) { inner += '<label><input type="radio" name="q-' + question.beliefId + '" value="' + escapeHtml(option) + '"' + (index === 0 ? ' checked' : '') + ' />' + escapeHtml(option) + '</label>'; });
                        inner += '</div>';
                    } else {
                        inner += '<input type="text" id="input-' + question.beliefId + '" placeholder="Type your answer…" />';
                    }
                    return '<div class="question-block">' + inner + '</div>';
                }).join('');
            }
            function renderBeliefReview(beliefs, questions) {
                currentQuestions = questions || [];
                appendMessage('action', 'Belief Review Required', '<div>The Confidence Gate paused the run because high-risk beliefs still require confirmation.</div><div style="margin-top:10px;">' + renderBeliefCards(beliefs) + '</div><div id="active-question-card" style="margin-top:10px;">' + renderQuestionBlocks(currentQuestions) + '</div><div class="card-actions"><button class="btn-primary" data-action="submit-answers">✅ Submit Answers</button></div>');
            }
            function renderPatchSummary(summary) {
                if (!summary || !Array.isArray(summary.files)) return '<div>No patch summary available.</div>';
                var rows = summary.files.map(function (file) { return '<div class="patch-file-row"><div class="patch-file-path">' + escapeHtml(file.path) + '</div><div class="patch-file-meta">' + escapeHtml(file.status) + ' · +' + Number(file.additions || 0) + ' / -' + Number(file.deletions || 0) + '</div></div>'; }).join('');
                return '<div class="patch-summary-header">Workspace-wide patch summary · ' + summary.fileCount + ' file(s) · +' + summary.additions + ' / -' + summary.deletions + '</div>' + rows;
            }
            function renderPatchReady(summary) {
                appendMessage('action', 'Patch Ready', '<div>Patch generated and validated against the current belief state.</div><div style="margin-top:10px;">' + renderPatchSummary(summary) + '</div><div class="card-actions"><button class="btn-primary" data-action="review-diff">📄 Review Diff</button><button class="btn-secondary" data-action="apply-patch">✅ Accept All Changes</button></div>');
            }
            function renderBlocked(reason, violations) {
                appendMessage('blocked', 'Run Blocked', '<div>' + escapeHtml(reason || 'Task blocked.') + '</div><div style="margin-top:10px;">' + renderBeliefCards(violations || []) + '</div><div class="card-actions"><button class="btn-secondary" data-action="restart-run">↩ Start Over</button></div>');
            }
            function renderError(message) {
                appendMessage('error', 'Error', '<div>' + escapeHtml(message || 'Unknown error.') + '</div><div class="card-actions"><button class="btn-secondary" data-action="restart-run">↩ Start Over</button></div>');
            }
            function renderAuditEvent(event) {
                if (!auditList) return;
                if (auditEmpty) auditEmpty.style.display = 'none';
                var item = document.createElement('div');
                item.className = 'audit-item ' + escapeHtml(event.level || 'info');
                var timeText = '';
                if (event.timestamp) { try { timeText = new Date(event.timestamp).toLocaleTimeString(); } catch (_err) { timeText = String(event.timestamp); } }
                var html = '<div class="audit-phase">' + escapeHtml(event.phase || 'event') + '</div><div class="audit-topline"><div class="audit-title">' + escapeHtml(event.title || 'Audit Event') + '</div><div class="audit-time">' + escapeHtml(timeText) + '</div></div>';
                if (event.detail) html += '<div>' + escapeHtml(event.detail) + '</div>';
                if (event.data !== undefined) {
                    var serialized = '';
                    try { serialized = JSON.stringify(event.data, null, 2); } catch (_err) { serialized = String(event.data); }
                    html += '<details class="audit-data"><summary>Details</summary><pre>' + escapeHtml(serialized) + '</pre></details>';
                }
                item.innerHTML = html;
                auditList.prepend(item);

                if (shouldMirrorAuditToChat(event)) {
                    appendMessage(
                        event.level === 'error' ? 'error' : 'system',
                        event.title || 'Audit Event',
                        escapeHtml(event.detail || '')
                    );
                }
            }

            function shouldMirrorAuditToChat(event) {
                if (!event || !event.phase) {
                    return false;
                }

                return (
                    event.phase === 'context' ||
                    event.phase === 'extraction' ||
                    event.phase === 'gate' ||
                    event.phase === 'questions' ||
                    event.phase === 'patch' ||
                    event.phase === 'validation' ||
                    event.level === 'error'
                );
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
                    section.innerHTML = '<div class="graph-group-title">' + escapeHtml(type.replace(/_/g, ' ')) + ' (' + entries.length + ')</div>';
                    entries.forEach(function (belief) {
                        var klass = 'graph-node';
                        if (belief.riskLevel === 'HIGH') klass += ' high-risk';
                        else if (belief.riskLevel === 'MEDIUM') klass += ' medium-risk';
                        var node = document.createElement('div');
                        node.className = klass;
                        var badges = '<span class="graph-badge">' + escapeHtml(belief.riskLevel) + '</span><span class="graph-badge">Conf ' + Number((belief.confidenceScore || 0) * 100).toFixed(0) + '%</span><span class="graph-badge">' + escapeHtml(belief.isValidated ? 'Validated' : 'Open') + '</span>';
                        if ((belief.contradictions || []).length) badges += '<span class="graph-badge">Conflicts ' + belief.contradictions.length + '</span>';
                        node.innerHTML = '<div class="graph-node-top"><div class="graph-node-statement">' + escapeHtml(belief.statement) + '</div><div class="graph-badges">' + badges + '</div></div><div class="graph-meta">Evidence edges: ' + ((belief.evidenceIds && belief.evidenceIds.length) || 0) + ' · Contradictions: ' + ((belief.contradictions && belief.contradictions.length) || 0) + '</div>';
                        section.appendChild(node);
                    });
                    graphGroups.appendChild(section);
                });
            }
            function postToExtension(message) {
                if (!vscodeApi || typeof vscodeApi.postMessage !== 'function') { renderError('BeliefGuard could not connect to the extension host. Please reload the window and try again.'); return false; }
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
                appendMessage('assistant', 'Clarifications submitted', 'Your answers were sent back to the Confidence Gate.');
                appendMessage('system', 'Processing', 'Re-evaluating beliefs after user clarification…');
            }
            function handleDynamicAction(event) {
                var target = event.target;
                if (!(target instanceof HTMLElement)) return;
                var button = target.closest('button[data-action]');
                if (!button) return;
                var action = button.getAttribute('data-action');
                if (action === 'submit-answers') collectAndSubmitAnswers();
                else if (action === 'review-diff') postToExtension({ type: 'REVIEW_DIFF' });
                else if (action === 'apply-patch') postToExtension({ type: 'APPLY_PATCH' });
                else if (action === 'restart-run') clearRunUi();
            }
            if (!taskInput || !btnSubmit || !chatThread || !auditList || !auditEmpty || !graphGroups || !graphEmpty) return;
            clearRunUi();
            btnSubmit.addEventListener('click', function () {
                var task = taskInput.value.trim();
                if (!task) return;
                btnSubmit.disabled = true;
                clearRunUi();
                appendMessage('user', 'Task', escapeHtml(task));
                appendMessage('system', 'Processing', 'Starting guarded run…');
                if (!postToExtension({ type: 'TASK_SUBMITTED', payload: { task: task } })) btnSubmit.disabled = false;
            });
            taskInput.addEventListener('keydown', function (event) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') btnSubmit.click(); });
            chatThread.addEventListener('click', handleDynamicAction);
            window.addEventListener('message', function (event) {
                var msg = event.data || {};
                btnSubmit.disabled = false;
                switch (msg.type) {
                    case 'PROCESSING': appendMessage('system', 'Processing', escapeHtml((msg.payload && msg.payload.message) || 'Processing…')); break;
                    case 'AUDIT_EVENT': renderAuditEvent((msg.payload && msg.payload.event) || {}); break;
                    case 'BELIEF_GRAPH_UPDATED': renderBeliefGraph((msg.payload && msg.payload.beliefs) || []); break;
                    case 'BELIEFS_EXTRACTED': renderBeliefReview((msg.payload && msg.payload.beliefs) || [], (msg.payload && msg.payload.questions) || []); renderBeliefGraph((msg.payload && msg.payload.beliefs) || []); break;
                    case 'PATCH_READY': renderPatchReady((msg.payload && msg.payload.summary) || null); break;
                    case 'BLOCKED': renderBlocked((msg.payload && msg.payload.reason) || 'Task blocked.', (msg.payload && msg.payload.violations) || []); break;
                    case 'ERROR': renderError((msg.payload && msg.payload.message) || 'Unknown error.'); break;
                }
            });
            window.addEventListener('error', function (event) { renderError(event.error || event.message || 'BeliefGuard hit a webview error.'); });
            window.addEventListener('unhandledrejection', function (event) { renderError(event.reason || 'BeliefGuard hit an unexpected async error.'); });
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
