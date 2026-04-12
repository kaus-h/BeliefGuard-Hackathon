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
 * All thinkN SDK calls are fire-and-forget with try/catch wrappers.
 * If the SDK is unavailable (missing key, network error, rate limit),
 * the system degrades gracefully to local-only operation.
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
import type { Belief, Evidence } from './types';
type ThinkNDiagnosticLevel = 'info' | 'success' | 'warning' | 'error';
interface ThinkNDiagnosticEvent {
    title: string;
    detail?: string;
    level: ThinkNDiagnosticLevel;
    data?: unknown;
}
export declare class BeliefStateManager {
    /**
     * LOCAL LAYER: SessionStore singleton for synchronous access.
     * Shared with BeliefGraph query functions via the singleton pattern.
     */
    private store;
    /**
     * REMOTE LAYER: thinkN `beliefs` SDK instance.
     * Provides cloud persistence, clarity scoring, and audit trails.
     */
    private thinkN;
    private readonly apiKey;
    private readonly agentId;
    private readonly namespace;
    private currentThreadId;
    private diagnosticReporter?;
    constructor();
    beginTask(threadId: string): void;
    setDiagnosticReporter(reporter: ((event: ThinkNDiagnosticEvent) => void) | undefined): void;
    ensureReady(): void;
    /**
     * Register a newly extracted assumption into the belief state.
     *
     * Writes to the local SessionStore (synchronous) and fires an
     * async push to the thinkN cloud via `beliefs.add()`.
     *
     * @param belief  The belief to register. `id` is optional — if
     *                omitted a new UUID v4 is generated.
     */
    addBelief(belief: Belief): Promise<void>;
    /**
     * Bulk-register an array of beliefs — convenience helper used when
     * the LLM plan extractor returns many assumptions at once.
     */
    addBeliefs(beliefs: Belief[]): Promise<void>;
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
    updateBeliefConfidence(id: string, newConfidence: number, newEvidence: Evidence): Promise<void>;
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
    markContradiction(beliefId: string, contradictingId: string): void;
    /** Retrieve a single belief by ID. */
    getBelief(id: string): Belief | undefined;
    /** Return all beliefs in the current session. */
    getAllBeliefs(): Belief[];
    /** Return all evidence in the current session. */
    getAllEvidence(): Evidence[];
    /** Clear the entire belief state (e.g., new task cycle). */
    reset(): Promise<void>;
    /**
     * Read the thinkN world state for clarity scoring and contradiction info.
     * Used by the Orchestrator to enrich gate decisions with cloud intelligence.
     *
     * @returns  clarity (0-1), contradictions array, and suggested moves.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsread
     */
    readThinkNState(): Promise<{
        clarity: number;
        contradictions: string[];
        moves: Array<{
            action: string;
            target: string;
            reason: string;
            value: number;
        }>;
    }>;
    /**
     * Get belief context before an LLM call.
     * Returns a prompt string enriched with thinkN's accumulated belief state.
     *
     * @param input  Optional task description or user message.
     * @returns      The thinkN-generated context prompt, or empty string on failure.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsbeforeinput
     */
    getBeliefContext(input?: string): Promise<string>;
    /**
     * Feed agent output to thinkN for automatic belief extraction and fusion.
     * Call this once per pipeline step after the LLM produces output.
     *
     * @param text     The LLM output text.
     * @param source   Optional source label for traceability.
     * @see https://www.thinkn.ai/dev/sdk/core-api#beliefsaftertext-options
     */
    feedOutput(text: string, source?: string): Promise<{
        clarity: number;
        readiness: string;
    }>;
    /**
     * Push a single belief to thinkN via `beliefs.add()`.
     * Fire-and-forget — errors are logged but do not break the pipeline.
     */
    private syncAddBelief;
    /**
     * Sync evidence to thinkN via `beliefs.after()`, allowing the cloud
     * to extract and link supporting/refuting evidence automatically.
     */
    private syncEvidence;
    /** Reset the thinkN namespace state alongside the local store. */
    private syncReset;
    /**
     * Prevent remote thinkN calls from hanging the full extension pipeline.
     */
    private withTimeout;
    private createClient;
    private getScopeMetadata;
    private reportDiagnostic;
    private wrapThinkNError;
    /**
     * Map BeliefGuard's internal type taxonomy to thinkN's belief types.
     *
     * thinkN types: claim, assumption, evidence, risk, gap, goal
     * @see https://www.thinkn.ai/dev/core/beliefs#belief-types
     */
    private mapBeliefTypeToThinkN;
}
export {};
//# sourceMappingURL=ThinkNClient.d.ts.map