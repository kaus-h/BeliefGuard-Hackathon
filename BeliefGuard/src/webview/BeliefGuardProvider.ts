// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Webview View Provider
// Manages the sidebar UI, state transitions, and two-way messaging.
// ──────────────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import {
    AuditEvent,
    Belief,
    ClarificationQuestion,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from '../types';

/**
 * Provides the BeliefGuard sidebar webview inside VS Code.
 */
export class BeliefGuardProvider implements vscode.WebviewViewProvider {
    /** Must match the id declared in package.json → contributes.views. */
    public static readonly viewType = 'beliefguard.sidebarView';

    private _view?: vscode.WebviewView;
    private _latestDiffPatch?: string;

    /** Event bus so other modules can react to user answers. */
    private readonly _onUserAnswered = new vscode.EventEmitter<{
        beliefId: string;
        answer: string;
    }>();
    public readonly onUserAnswered = this._onUserAnswered.event;

    /** Event bus for task submission. */
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

        webviewView.webview.onDidReceiveMessage(
            (message: WebviewToExtensionMessage) => {
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
            }
        );
    }

    public postProcessing(message: string): void {
        this._post({ type: 'PROCESSING', payload: { message } });
    }

    public postAuditEvent(event: AuditEvent): void {
        this._post({ type: 'AUDIT_EVENT', payload: { event } });
    }

    public postBeliefs(
        beliefs: Belief[],
        questions: ClarificationQuestion[]
    ): void {
        this._post({
            type: 'BELIEFS_EXTRACTED',
            payload: { beliefs, questions },
        });
    }

    public postPatchReady(diffPatch: string): void {
        this._latestDiffPatch = diffPatch;
        this._post({ type: 'PATCH_READY', payload: { diffPatch } });
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
    <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BeliefGuard</title>
    <style nonce="${nonce}">
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family, system-ui, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 12px;
            line-height: 1.5;
        }

        .section {
            display: none;
            flex-direction: column;
            gap: 12px;
        }

        .section.active {
            display: flex;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .header .shield {
            font-size: 20px;
        }

        .header h2 {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        textarea,
        input[type="text"] {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: inherit;
            font-size: inherit;
        }

        textarea {
            min-height: 100px;
            resize: vertical;
        }

        textarea:focus,
        input[type="text"]:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        button {
            padding: 8px 14px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
            font-size: inherit;
            font-weight: 500;
            transition: opacity 0.15s ease;
        }

        button:hover { opacity: 0.85; }
        button:active { opacity: 0.7; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .loader {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 14px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
        }

        .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid var(--vscode-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .belief-card {
            padding: 10px 12px;
            border-radius: 6px;
            border-left: 4px solid var(--vscode-charts-blue, #3794ff);
            background: var(--vscode-editor-background);
            margin-bottom: 6px;
        }

        .belief-card.high-risk {
            border-left-color: var(--vscode-errorForeground, #f44747);
            background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 8%, var(--vscode-editor-background));
        }

        .belief-card.medium-risk {
            border-left-color: var(--vscode-editorWarning-foreground, #cca700);
        }

        .belief-card .label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.7;
        }

        .belief-card .statement {
            margin-top: 4px;
        }

        .belief-card .meta {
            margin-top: 6px;
            font-size: 11px;
            opacity: 0.6;
        }

        .question-block {
            padding: 10px 12px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
        }

        .question-block .q-text {
            font-weight: 600;
            margin-bottom: 8px;
        }

        .question-block .options {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .question-block .options label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
        }

        .diff-summary {
            padding: 14px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
            text-align: center;
        }

        .diff-summary .check {
            font-size: 28px;
            color: var(--vscode-charts-green, #89d185);
        }

        .diff-summary p {
            margin: 8px 0 14px;
        }

        .blocked-banner,
        .error-banner {
            padding: 12px;
            border-radius: 6px;
            background: color-mix(in srgb, var(--vscode-errorForeground, #f44747) 10%, var(--vscode-editor-background));
            border: 1px solid var(--vscode-errorForeground, #f44747);
        }

        .blocked-banner {
            text-align: center;
        }

        .blocked-banner .icon {
            font-size: 24px;
        }

        .blocked-banner p,
        .error-banner p {
            margin-top: 6px;
        }

        .audit-panel {
            margin-top: 14px;
            border: 1px solid var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c));
            border-radius: 6px;
            background: var(--vscode-editor-background);
            overflow: hidden;
        }

        .audit-panel summary {
            cursor: pointer;
            padding: 10px 12px;
            font-weight: 600;
            list-style: none;
        }

        .audit-panel summary::-webkit-details-marker {
            display: none;
        }

        .audit-panel[open] summary {
            border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-input-border, #3c3c3c));
        }

        .audit-panel-body {
            max-height: 260px;
            overflow: auto;
            padding: 10px 12px;
        }

        .audit-empty {
            opacity: 0.7;
            font-size: 12px;
        }

        .audit-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .audit-item {
            border-left: 3px solid var(--vscode-charts-blue, #3794ff);
            background: var(--vscode-sideBar-background);
            border-radius: 4px;
            padding: 8px 10px;
        }

        .audit-item.success {
            border-left-color: var(--vscode-charts-green, #89d185);
        }

        .audit-item.warning {
            border-left-color: var(--vscode-editorWarning-foreground, #cca700);
        }

        .audit-item.error {
            border-left-color: var(--vscode-errorForeground, #f44747);
        }

        .audit-topline {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-items: baseline;
            margin-bottom: 4px;
        }

        .audit-title {
            font-weight: 600;
        }

        .audit-time {
            font-size: 11px;
            opacity: 0.65;
            white-space: nowrap;
        }

        .audit-phase {
            display: inline-block;
            margin-bottom: 4px;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            opacity: 0.75;
        }

        .audit-detail {
            font-size: 12px;
            opacity: 0.9;
        }

        .audit-data {
            margin-top: 6px;
        }

        .audit-data summary {
            padding: 0;
            border: none;
            font-size: 11px;
            font-weight: 500;
            opacity: 0.8;
        }

        .audit-data pre {
            margin-top: 6px;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 11px;
            padding: 8px;
            border-radius: 4px;
            background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08));
            overflow: auto;
        }

        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="shield">🛡️</span>
        <h2>BeliefGuard</h2>
    </div>

    <div id="state-task" class="section active">
        <label for="task-input" class="sr-only">Describe your coding task</label>
        <textarea id="task-input" placeholder="Describe your coding task…&#10;e.g. 'Implement JWT-based auth on the user settings route'"></textarea>
        <button id="btn-submit" class="btn-primary">⚡ Start Guarded Task</button>
    </div>

    <div id="state-processing" class="section">
        <div class="loader">
            <div class="spinner"></div>
            <span id="processing-msg">Extracting Agent Plan and Formulating Beliefs…</span>
        </div>
    </div>

    <div id="state-gate" class="section">
        <p style="font-weight:600;">🔍 Belief Review Required</p>
        <div id="beliefs-list"></div>
        <div id="questions-list"></div>
        <button id="btn-answer" class="btn-primary" style="display:none;">✅ Submit Answers</button>
    </div>

    <div id="state-diff" class="section">
        <div class="diff-summary">
            <div class="check">✓</div>
            <p>Patch generated &amp; validated. All beliefs resolved.</p>
            <button id="btn-review" class="btn-primary">📄 Review Diff</button>
            <button id="btn-apply" class="btn-secondary">✅ Apply Patch</button>
        </div>
    </div>

    <div id="state-blocked" class="section">
        <div class="blocked-banner">
            <div class="icon">🚫</div>
            <p id="blocked-reason"></p>
        </div>
        <div id="violations-list"></div>
        <button id="btn-restart" class="btn-secondary">↩ Start Over</button>
    </div>

    <div id="state-error" class="section">
        <div class="error-banner">
            <strong>Error</strong>
            <p id="error-msg"></p>
        </div>
        <button id="btn-error-restart" class="btn-secondary">↩ Start Over</button>
    </div>

    <details id="audit-panel" class="audit-panel">
        <summary>🧪 Run Audit Timeline</summary>
        <div class="audit-panel-body">
            <div id="audit-empty" class="audit-empty">No audit events yet. Start a task to inspect extraction, grounding, and gate decisions.</div>
            <div id="audit-list" class="audit-list"></div>
        </div>
    </details>

    <script nonce="${nonce}">
        (function () {
            var vscodeApi = null;
            if (typeof acquireVsCodeApi === 'function') {
                vscodeApi = acquireVsCodeApi();
            }

            var sections = document.querySelectorAll('.section');
            var taskInput = document.getElementById('task-input');
            var btnSubmit = document.getElementById('btn-submit');
            var btnAnswer = document.getElementById('btn-answer');
            var btnReview = document.getElementById('btn-review');
            var btnApply = document.getElementById('btn-apply');
            var btnRestart = document.getElementById('btn-restart');
            var btnErrRestart = document.getElementById('btn-error-restart');
            var processingMsg = document.getElementById('processing-msg');
            var beliefsList = document.getElementById('beliefs-list');
            var questionsList = document.getElementById('questions-list');
            var blockedReason = document.getElementById('blocked-reason');
            var violationsList = document.getElementById('violations-list');
            var errorMsg = document.getElementById('error-msg');
            var auditList = document.getElementById('audit-list');
            var auditEmpty = document.getElementById('audit-empty');
            var currentQuestions = [];

            function showSection(id) {
                sections.forEach(function (section) {
                    section.classList.remove('active');
                });
                var target = document.getElementById('state-' + id);
                if (target) {
                    target.classList.add('active');
                }
            }

            function showFatalError(message) {
                if (errorMsg) {
                    errorMsg.textContent = message;
                }
                showSection('error');
            }

            function postToExtension(message) {
                if (!vscodeApi || typeof vscodeApi.postMessage !== 'function') {
                    console.error('[BeliefGuard] VS Code webview API is unavailable.');
                    showFatalError('BeliefGuard could not connect to the extension host. Please reload the window and try again.');
                    return false;
                }

                console.log('[BeliefGuard] Posting message to extension:', message.type);
                vscodeApi.postMessage(message);
                return true;
            }

            function escapeHtml(str) {
                var div = document.createElement('div');
                div.appendChild(document.createTextNode(str == null ? '' : String(str)));
                return div.innerHTML;
            }

            function restart() {
                taskInput.value = '';
                btnSubmit.disabled = false;
                beliefsList.innerHTML = '';
                questionsList.innerHTML = '';
                violationsList.innerHTML = '';
                blockedReason.textContent = '';
                errorMsg.textContent = '';
                if (auditList) {
                    auditList.innerHTML = '';
                }
                if (auditEmpty) {
                    auditEmpty.style.display = '';
                }
                currentQuestions = [];
                btnAnswer.style.display = 'none';
                showSection('task');
            }

            function renderAuditEvent(event) {
                if (!auditList) {
                    return;
                }

                if (auditEmpty) {
                    auditEmpty.style.display = 'none';
                }

                var item = document.createElement('div');
                item.className = 'audit-item ' + escapeHtml(event.level || 'info');

                var timeText = '';
                if (event.timestamp) {
                    try {
                        timeText = new Date(event.timestamp).toLocaleTimeString();
                    } catch (_err) {
                        timeText = String(event.timestamp);
                    }
                }

                var html =
                    '<div class="audit-phase">' + escapeHtml(event.phase || 'event') + '</div>' +
                    '<div class="audit-topline">' +
                        '<div class="audit-title">' + escapeHtml(event.title || 'Audit Event') + '</div>' +
                        '<div class="audit-time">' + escapeHtml(timeText) + '</div>' +
                    '</div>';

                if (event.detail) {
                    html += '<div class="audit-detail">' + escapeHtml(event.detail) + '</div>';
                }

                if (event.data !== undefined) {
                    var serialized = '';
                    try {
                        serialized = JSON.stringify(event.data, null, 2);
                    } catch (_err) {
                        serialized = String(event.data);
                    }

                    html +=
                        '<details class="audit-data">' +
                        '<summary>Details</summary>' +
                        '<pre>' + escapeHtml(serialized) + '</pre>' +
                        '</details>';
                }

                item.innerHTML = html;
                auditList.prepend(item);
            }

            function renderBeliefs(beliefs) {
                beliefsList.innerHTML = '';
                beliefs.forEach(function (belief) {
                    var card = document.createElement('div');
                    card.className = 'belief-card';
                    if (belief.riskLevel === 'HIGH') {
                        card.classList.add('high-risk');
                    } else if (belief.riskLevel === 'MEDIUM') {
                        card.classList.add('medium-risk');
                    }

                    card.innerHTML =
                        '<div class="label">' + escapeHtml(belief.riskLevel) + ' risk · ' + escapeHtml(belief.type) + '</div>' +
                        '<div class="statement">' + escapeHtml(belief.statement) + '</div>' +
                        '<div class="meta">Confidence: ' + Number(belief.confidenceScore * 100).toFixed(0) + '% · ' +
                        (belief.isValidated ? '✅ Validated' : '⚠️ Unverified') + '</div>';
                    beliefsList.appendChild(card);
                });
            }

            function renderQuestions(questions) {
                questionsList.innerHTML = '';
                currentQuestions = questions || [];
                if (!currentQuestions.length) {
                    btnAnswer.style.display = 'none';
                    return;
                }

                btnAnswer.style.display = '';
                currentQuestions.forEach(function (question) {
                    var block = document.createElement('div');
                    block.className = 'question-block';

                    var inner = '<div class="q-text">' + escapeHtml(question.questionText) + '</div>';
                    if (question.options && question.options.length) {
                        inner += '<div class="options">';
                        question.options.forEach(function (option, index) {
                            inner +=
                                '<label>' +
                                '<input type="radio" name="q-' + question.beliefId + '" value="' + escapeHtml(option) + '"' +
                                (index === 0 ? ' checked' : '') + ' />' +
                                escapeHtml(option) +
                                '</label>';
                        });
                        inner += '</div>';
                    } else {
                        inner += '<input type="text" id="input-' + question.beliefId + '" placeholder="Type your answer…" />';
                    }

                    block.innerHTML = inner;
                    questionsList.appendChild(block);
                });
            }

            function renderViolations(violations) {
                violationsList.innerHTML = '';
                (violations || []).forEach(function (belief) {
                    var card = document.createElement('div');
                    card.className = 'belief-card high-risk';
                    card.innerHTML =
                        '<div class="label">VIOLATION · ' + escapeHtml(belief.type) + '</div>' +
                        '<div class="statement">' + escapeHtml(belief.statement) + '</div>';
                    violationsList.appendChild(card);
                });
            }

            if (!taskInput || !btnSubmit || !btnAnswer || !btnReview || !btnApply || !btnRestart || !btnErrRestart || !processingMsg || !beliefsList || !questionsList || !blockedReason || !violationsList || !errorMsg || !auditList || !auditEmpty) {
                console.error('[BeliefGuard] Failed to initialize webview DOM.');
                showFatalError('BeliefGuard failed to initialize its UI. Please reload the window and try again.');
                return;
            }

            btnSubmit.addEventListener('click', function () {
                var task = taskInput.value.trim();
                if (!task) {
                    return;
                }

                btnSubmit.disabled = true;
                auditList.innerHTML = '';
                auditEmpty.style.display = '';
                if (postToExtension({ type: 'TASK_SUBMITTED', payload: { task: task } })) {
                    showSection('processing');
                } else {
                    btnSubmit.disabled = false;
                }
            });

            btnAnswer.addEventListener('click', function () {
                currentQuestions.forEach(function (question) {
                    var answer = '';
                    if (question.options && question.options.length) {
                        var checked = document.querySelector('input[name="q-' + question.beliefId + '"]:checked');
                        answer = checked ? checked.value : '';
                    } else {
                        var input = document.getElementById('input-' + question.beliefId);
                        answer = input ? input.value.trim() : '';
                    }

                    if (answer) {
                        postToExtension({
                            type: 'USER_ANSWERED',
                            payload: { beliefId: question.beliefId, answer: answer }
                        });
                    }
                });
                showSection('processing');
            });

            btnReview.addEventListener('click', function () {
                postToExtension({ type: 'REVIEW_DIFF' });
            });

            btnApply.addEventListener('click', function () {
                postToExtension({ type: 'APPLY_PATCH' });
            });

            btnRestart.addEventListener('click', restart);
            btnErrRestart.addEventListener('click', restart);

            taskInput.addEventListener('keydown', function (event) {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    btnSubmit.click();
                }
            });

            window.addEventListener('message', function (event) {
                var msg = event.data || {};
                console.log('[BeliefGuard] Received message from extension:', msg.type);
                btnSubmit.disabled = false;

                switch (msg.type) {
                    case 'PROCESSING':
                        processingMsg.textContent = (msg.payload && msg.payload.message) || 'Processing…';
                        showSection('processing');
                        break;
                    case 'AUDIT_EVENT':
                        renderAuditEvent((msg.payload && msg.payload.event) || {});
                        break;
                    case 'BELIEFS_EXTRACTED':
                        renderBeliefs((msg.payload && msg.payload.beliefs) || []);
                        renderQuestions((msg.payload && msg.payload.questions) || []);
                        showSection('gate');
                        break;
                    case 'PATCH_READY':
                        showSection('diff');
                        break;
                    case 'BLOCKED':
                        blockedReason.textContent = (msg.payload && msg.payload.reason) || 'Task blocked.';
                        renderViolations((msg.payload && msg.payload.violations) || []);
                        showSection('blocked');
                        break;
                    case 'ERROR':
                        errorMsg.textContent = (msg.payload && msg.payload.message) || 'Unknown error.';
                        showSection('error');
                        break;
                }
            });

            window.addEventListener('error', function (event) {
                console.error('[BeliefGuard Webview] Unhandled error:', event.error || event.message);
                showFatalError('BeliefGuard hit a webview error. Reload the window and try again.');
            });

            window.addEventListener('unhandledrejection', function (event) {
                console.error('[BeliefGuard Webview] Unhandled rejection:', event.reason);
                showFatalError('BeliefGuard hit an unexpected async error. Reload the window and try again.');
            });
        })();
    </script>
</body>
</html>`;
    }
}

/** Generate a cryptographic nonce for the Content-Security-Policy. */
function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
