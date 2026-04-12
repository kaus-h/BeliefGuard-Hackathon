"use strict";
/**
 * ThinkNClient — BeliefStateManager
 *
 * Dual-layer belief management system:
 *
 *   LOCAL LAYER  — SessionStore singleton for fast synchronous access
 *                  by the Confidence Gate, BeliefGraph, and pipeline.
 *
 *   REMOTE LAYER — thinkN `beliefs` SDK (https://thinkn.ai/dev) for
 *                  cloud persistence, native contradiction detection,
 *                  clarity scoring, and belief-level audit trails.
 *
 * During guarded-task execution, thinkN is treated as a hard dependency.
 * The local store remains the synchronous source of truth for gate logic,
 * but thinkN errors are surfaced and propagated instead of being swallowed.
 *
 * Responsibilities
 * ────────────────
 * • Register newly extracted assumptions with UUID v4 identifiers.
 * • Update confidence scores and evidence edges.
 * • Automatically toggle the `isValidated` flag at the 0.85 threshold.
 * • Persist all mutations through the SessionStore singleton.
 * • Mirror state to the thinkN cloud for persistence and clarity scoring.
 *
 * @see https://www.thinkn.ai/dev/sdk/core-api — Full SDK API reference
 * @see https://www.thinkn.ai/dev/start/hack-guide — Hackathon integration guide
 */
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
exports.BeliefStateManager = void 0;
const beliefs_1 = __importStar(require("beliefs"));
const uuid_1 = require("uuid");
const SessionStore_1 = require("../state/SessionStore");
// ── Constants ───────────────────────────────────────────────────────────
/** Beliefs with a confidence score at or above this value are auto-validated. */
const VALIDATION_THRESHOLD = 0.85;
/** Maximum time to wait for a thinkN network call before aborting locally. */
const REMOTE_CALL_TIMEOUT_MS = 120000;
// ── BeliefStateManager ─────────────────────────────────────────────────
class BeliefStateManager {
    /**
     * LOCAL LAYER: SessionStore singleton for synchronous access.
     * Shared with BeliefGraph query functions via the singleton pattern.
     */
    store;
    /**
     * REMOTE LAYER: thinkN `beliefs` SDK instance.
     * Provides cloud persistence, clarity scoring, and audit trails.
     */
    thinkN;
    apiKey;
    agentId = 'beliefguard-agent';
    namespace = 'beliefguard-session';
    currentThreadId = null;
    diagnosticReporter;
    constructor(workspaceName) {
        this.store = SessionStore_1.SessionStore.getInstance();
        this.apiKey = process.env.BELIEFS_KEY || '';
        if (workspaceName) {
            // Sanitize to a safe slug for thinkN namespace scoping
            const slug = workspaceName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40);
            this.namespace = `beliefguard-${slug}`;
        }
        this.thinkN = this.createClient();
    }
    beginTask(threadId) {
        if (!threadId) {
            throw new Error('BeliefGuard requires a non-empty thinkN thread ID for each guarded task.');
        }
        this.currentThreadId = threadId;
        this.thinkN = this.createClient(threadId);
        this.reportDiagnostic('thinkN thread scope initialized', `Bound BeliefGuard to thinkN thread ${threadId}.`, 'info', {
            threadId,
            namespace: this.namespace,
            agent: this.agentId,
        });
    }
    setDiagnosticReporter(reporter) {
        this.diagnosticReporter = reporter;
    }
    ensureReady() {
        if (!this.apiKey) {
            this.reportDiagnostic('thinkN readiness failed', 'BELIEFS_KEY is missing. BeliefGuard cannot start a guarded task without thinkN.', 'error', {
                namespace: this.namespace,
                agent: this.agentId,
            });
            throw new Error('BELIEFS_KEY is missing. BeliefGuard cannot run until thinkN is configured correctly.');
        }
        if (!this.currentThreadId) {
            this.reportDiagnostic('thinkN readiness failed', 'No thinkN thread is bound to the active guarded task.', 'error', {
                namespace: this.namespace,
                agent: this.agentId,
            });
            throw new Error('thinkN task thread has not been initialized. Guarded execution is blocked.');
        }
    }
    // ── Core mutation API ───────────────────────────────────────────────
    /**
     * Register a newly extracted assumption into the belief state.
     *
     * Writes to the local SessionStore (synchronous) and fires an
     * async push to the thinkN cloud via `beliefs.add()`.
     *
     * @param belief  The belief to register. `id` is optional — if
     *                omitted a new UUID v4 is generated.
     */
    async addBelief(belief) {
        const registered = {
            ...belief,
            id: belief.id || (0, uuid_1.v4)(),
        };
        // LOCAL: immediate synchronous access
        this.store.setBelief(registered);
        await this.syncAddBelief(registered);
    }
    /**
     * Bulk-register an array of beliefs — convenience helper used when
     * the LLM plan extractor returns many assumptions at once.
     */
    async addBeliefs(beliefs) {
        for (const b of beliefs) {
            await this.addBelief(b);
        }
    }
    /**
     * Locate an existing belief, append new evidence, recalculate the
     * confidence score, and auto-validate when the threshold is met.
     *
     * @param id             The UUID of the target belief.
     * @param newConfidence   The recalculated confidence score (0.0–1.0).
     * @param newEvidence     The evidence artifact to link.
     *
     * @throws {Error}       If no belief with the given `id` exists.
     */
    async updateBeliefConfidence(id, newConfidence, newEvidence) {
        const existing = this.store.getBelief(id);
        if (!existing) {
            throw new Error(`[BeliefStateManager] Belief not found: ${id}`);
        }
        // Persist the evidence artifact itself
        const evidenceWithId = {
            ...newEvidence,
            id: newEvidence.id || (0, uuid_1.v4)(),
        };
        this.store.setEvidence(evidenceWithId);
        // Append the evidence edge
        const updatedEvidenceIds = [
            ...existing.evidenceIds,
            evidenceWithId.id,
        ];
        // Add a SUPPORTED_BY edge in the graph
        const supportEdge = {
            fromId: existing.id,
            toId: evidenceWithId.id,
            relation: 'SUPPORTED_BY',
        };
        this.store.addEdge(supportEdge);
        // Clamp confidence to [0, 1]
        const clampedConfidence = Math.max(0, Math.min(1, newConfidence));
        // Auto-validate when threshold is reached
        const updatedBelief = {
            ...existing,
            evidenceIds: updatedEvidenceIds,
            confidenceScore: clampedConfidence,
            isValidated: existing.isValidated || clampedConfidence >= VALIDATION_THRESHOLD,
        };
        this.store.setBelief(updatedBelief);
        // REMOTE: sync evidence to thinkN
        await this.syncEvidence(existing.statement, evidenceWithId);
    }
    /**
     * Mark a belief as contradicted by another belief.
     *
     * Adds a `CONTRADICTED_BY` edge and appends the conflicting ID to
     * the belief's `contradictions` array.  The confidence score is
     * immediately set to 0 and the belief is de-validated.
     *
     * @param beliefId          The UUID of the belief being contradicted.
     * @param contradictingId   The UUID of the contradicting belief.
     */
    markContradiction(beliefId, contradictingId) {
        const belief = this.store.getBelief(beliefId);
        if (!belief) {
            throw new Error(`[BeliefStateManager] Belief not found: ${beliefId}`);
        }
        const edge = {
            fromId: beliefId,
            toId: contradictingId,
            relation: 'CONTRADICTED_BY',
        };
        this.store.addEdge(edge);
        const updated = {
            ...belief,
            contradictions: [...belief.contradictions, contradictingId],
            confidenceScore: 0,
            isValidated: false,
        };
        this.store.setBelief(updated);
    }
    // ── Read API ────────────────────────────────────────────────────────
    /** Retrieve a single belief by ID. */
    getBelief(id) {
        return this.store.getBelief(id);
    }
    /** Return all beliefs in the current session. */
    getAllBeliefs() {
        return this.store.getAllBeliefs();
    }
    /** Return all evidence in the current session. */
    getAllEvidence() {
        return this.store.getAllEvidence();
    }
    /** Clear the entire belief state (e.g., new task cycle). */
    async reset() {
        this.store.clear();
        await this.syncReset();
    }
    // ── thinkN Remote Layer ─────────────────────────────────────────────
    /**
     * Read the thinkN world state for clarity scoring and contradiction info.
     * Used by the Orchestrator to enrich gate decisions with cloud intelligence.
     *
     * @returns  clarity (0-1), contradictions array, and suggested moves.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsread
     */
    async readThinkNState() {
        this.ensureReady();
        this.reportDiagnostic('thinkN read started', 'Reading full thinkN world state for clarity and contradiction data.', 'info', this.getScopeMetadata());
        try {
            const world = await this.withTimeout(this.thinkN.read(), 'thinkN read()');
            this.reportDiagnostic('thinkN read succeeded', `Read world state with clarity ${Number(world.clarity ?? 0.5).toFixed(2)}.`, 'success', {
                ...this.getScopeMetadata(),
                clarity: world.clarity ?? 0.5,
                contradictions: world.contradictions ?? [],
                moveCount: Array.isArray(world.moves) ? world.moves.length : 0,
            });
            return {
                clarity: world.clarity ?? 0.5,
                contradictions: world.contradictions ?? [],
                moves: world.moves ?? [],
            };
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN read() failed:', error);
            this.reportDiagnostic('thinkN read failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'read');
        }
    }
    /**
     * Get belief context before an LLM call.
     * Returns a prompt string enriched with thinkN's accumulated belief state.
     *
     * @param input  Optional task description or user message.
     * @returns      The thinkN-generated context prompt.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsbeforeinput
     */
    async getBeliefContext(input) {
        this.ensureReady();
        this.reportDiagnostic('thinkN before started', 'Requesting belief context before LLM plan extraction.', 'info', {
            ...this.getScopeMetadata(),
            inputPreview: input?.slice(0, 120) ?? '',
        });
        try {
            const context = await this.withTimeout(this.thinkN.before(input), 'thinkN before()');
            this.reportDiagnostic('thinkN before succeeded', `Received belief context with ${context.beliefs.length} beliefs, ${context.gaps.length} gaps, and clarity ${Number(context.clarity).toFixed(2)}.`, 'success', {
                ...this.getScopeMetadata(),
                clarity: context.clarity,
                beliefCount: context.beliefs.length,
                gapCount: context.gaps.length,
                goalCount: context.goals.length,
                moveCount: context.moves.length,
            });
            return context.prompt;
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN before() failed:', error);
            this.reportDiagnostic('thinkN before failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'before');
        }
    }
    /**
     * Feed agent output to thinkN for automatic belief extraction and fusion.
     * Call this once per pipeline step after the LLM produces output.
     *
     * @param text     The LLM output text.
     * @param source   Optional source label for traceability.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsaftertext-options
     */
    async feedOutput(text, source) {
        this.ensureReady();
        this.reportDiagnostic('thinkN after started', 'Feeding agent output back into thinkN for extraction and fusion.', 'info', {
            ...this.getScopeMetadata(),
            source: source ?? 'unspecified',
            textPreview: text.slice(0, 160),
        });
        try {
            const delta = await this.withTimeout(this.thinkN.after(text, source ? { source } : undefined), 'thinkN after()');
            this.reportDiagnostic('thinkN after succeeded', `thinkN returned readiness ${delta.readiness ?? 'low'} with clarity ${Number(delta.clarity ?? 0.5).toFixed(2)}.`, 'success', {
                ...this.getScopeMetadata(),
                source: source ?? 'unspecified',
                clarity: delta.clarity ?? 0.5,
                readiness: delta.readiness ?? 'low',
                moveCount: Array.isArray(delta.moves) ? delta.moves.length : 0,
                changeCount: Array.isArray(delta.changes) ? delta.changes.length : 0,
            });
            return {
                clarity: delta.clarity ?? 0.5,
                readiness: delta.readiness ?? 'low',
            };
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN after() failed:', error);
            this.reportDiagnostic('thinkN after failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                source: source ?? 'unspecified',
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'after');
        }
    }
    // ── Private: thinkN sync helpers ────────────────────────────────────
    /**
     * Push a single belief to thinkN via `beliefs.add()`.
     * Errors are surfaced so guarded execution can fail fast.
     */
    async syncAddBelief(belief) {
        this.ensureReady();
        this.reportDiagnostic('thinkN add started', `Syncing belief to thinkN: ${belief.statement}`, 'info', {
            ...this.getScopeMetadata(),
            beliefId: belief.id,
            beliefType: belief.type,
            confidenceScore: belief.confidenceScore,
        });
        try {
            await this.withTimeout(this.thinkN.add(belief.statement, {
                confidence: belief.confidenceScore,
                type: this.mapBeliefTypeToThinkN(belief.type),
                evidence: belief.evidenceIds.length > 0 ? belief.evidenceIds.join(', ') : undefined,
                source: `beliefguard:${belief.type}`,
            }), 'thinkN add()');
            this.reportDiagnostic('thinkN add succeeded', `Belief synced to thinkN: ${belief.statement}`, 'success', {
                ...this.getScopeMetadata(),
                beliefId: belief.id,
                beliefType: belief.type,
                confidenceScore: belief.confidenceScore,
            });
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN add() failed:', error);
            this.reportDiagnostic('thinkN add failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                beliefId: belief.id,
                beliefType: belief.type,
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'add');
        }
    }
    /**
     * Sync evidence to thinkN via `beliefs.after()`, allowing the cloud
     * to extract and link supporting/refuting evidence automatically.
     */
    async syncEvidence(beliefStatement, evidence) {
        this.ensureReady();
        this.reportDiagnostic('thinkN evidence sync started', `Syncing evidence for belief: ${beliefStatement}`, 'info', {
            ...this.getScopeMetadata(),
            evidenceId: evidence.id,
            evidenceSource: evidence.uri,
        });
        try {
            await this.withTimeout(this.thinkN.after(`Evidence for "${beliefStatement}": ${evidence.snippet}`, { source: evidence.uri, tool: 'evidence_locator' }), 'thinkN after() [evidence]');
            this.reportDiagnostic('thinkN evidence sync succeeded', `Evidence synced from ${evidence.uri}.`, 'success', {
                ...this.getScopeMetadata(),
                evidenceId: evidence.id,
                evidenceSource: evidence.uri,
            });
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN after() [evidence] failed:', error);
            this.reportDiagnostic('thinkN evidence sync failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                evidenceId: evidence.id,
                evidenceSource: evidence.uri,
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'evidence-sync');
        }
    }
    /** Reset the thinkN namespace state alongside the local store. */
    async syncReset() {
        this.ensureReady();
        this.reportDiagnostic('thinkN reset started', 'Resetting thinkN state for the active guarded-task scope.', 'info', this.getScopeMetadata());
        try {
            await this.withTimeout(this.thinkN.reset(), 'thinkN reset()');
            this.reportDiagnostic('thinkN reset succeeded', 'Cleared thinkN state for the active guarded-task scope.', 'success', this.getScopeMetadata());
        }
        catch (error) {
            console.warn('[BeliefGuard] thinkN reset() failed:', error);
            this.reportDiagnostic('thinkN reset failed', error instanceof Error ? error.message : String(error), 'error', {
                ...this.getScopeMetadata(),
                ...this.getThinkNErrorMetadata(error),
            });
            throw this.wrapThinkNError(error, 'reset');
        }
    }
    /**
     * Prevent remote thinkN calls from hanging the full extension pipeline.
     */
    async withTimeout(promise, label) {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`${label} timed out after ${REMOTE_CALL_TIMEOUT_MS}ms`));
                }, REMOTE_CALL_TIMEOUT_MS);
            }),
        ]);
    }
    createClient(threadId) {
        const config = {
            apiKey: this.apiKey,
            agent: this.agentId,
            namespace: this.namespace,
            timeout: REMOTE_CALL_TIMEOUT_MS,
            debug: process.env.BELIEFS_DEBUG === 'true',
            writeScope: 'thread',
            ...(threadId ? { thread: threadId } : {}),
        };
        return new beliefs_1.default(config);
    }
    getScopeMetadata() {
        return {
            namespace: this.namespace,
            agent: this.agentId,
            threadId: this.currentThreadId ?? 'unbound',
        };
    }
    reportDiagnostic(title, detail, level = 'info', data) {
        this.diagnosticReporter?.({
            title,
            detail,
            level,
            data,
        });
    }
    getThinkNErrorMetadata(error) {
        if (error instanceof beliefs_1.BetaAccessError) {
            return {
                code: error.code,
                signupUrl: error.signupUrl,
            };
        }
        if (error instanceof beliefs_1.BeliefsError) {
            return {
                code: error.code,
                retryable: error.retryable,
                retryAfterMs: error.retryAfterMs,
            };
        }
        return {};
    }
    wrapThinkNError(error, operation) {
        const scope = `[thread=${this.currentThreadId ?? 'unbound'}, namespace=${this.namespace}, agent=${this.agentId}]`;
        if (error instanceof beliefs_1.BetaAccessError) {
            const wrapped = new Error(`thinkN ${operation} requires beta access ${scope}: ${error.message}`, { cause: error });
            wrapped.name = error.name;
            wrapped.code = error.code;
            wrapped.signupUrl = error.signupUrl;
            return wrapped;
        }
        if (error instanceof beliefs_1.BeliefsError) {
            const wrapped = new Error(`thinkN ${operation} failed ${scope}: ${error.message}`, { cause: error });
            wrapped.name = error.name;
            wrapped.code = error.code;
            wrapped.retryable = error.retryable;
            if (error.retryAfterMs !== undefined) {
                wrapped.retryAfterMs = error.retryAfterMs;
            }
            return wrapped;
        }
        const message = error instanceof Error ? error.message : String(error);
        return new Error(`thinkN ${operation} failed ${scope}: ${message}`, {
            cause: error instanceof Error ? error : undefined,
        });
    }
    /**
     * Map BeliefGuard's internal type taxonomy to thinkN's belief types.
     *
     * thinkN types: claim, assumption, evidence, risk, gap, goal
     * @see https://www.thinkn.ai/dev/core/beliefs#belief-types
     */
    mapBeliefTypeToThinkN(type) {
        switch (type) {
            case 'REPO_FACT':
                return 'evidence';
            case 'TASK_BELIEF':
                return 'goal';
            case 'AGENT_ASSUMPTION':
                return 'assumption';
            case 'USER_CONSTRAINT':
                return 'claim';
            default:
                return 'claim';
        }
    }
}
exports.BeliefStateManager = BeliefStateManager;
//# sourceMappingURL=ThinkNClient.js.map