import type { Belief, GateDecision } from '../types';
/**
 * Evaluates the current belief state against the Confidence-to-Action
 * Gate decision matrix and returns the appropriate routing decision.
 *
 * The function iterates through every belief in a single pass, tracking
 * which trigger conditions are met, then returns the highest-priority
 * decision that was flagged.
 *
 * @param beliefs  The full array of beliefs currently tracked in the session.
 * @returns        The gate decision that governs the next pipeline action.
 */
export declare function evaluateState(beliefs: Belief[]): GateDecision;
/**
 * Extracts the specific beliefs that are causing a BLOCK decision.
 * Used by the orchestrator to populate the Webview's violation display.
 *
 * @param beliefs  The full array of beliefs currently tracked.
 * @returns        Only the beliefs that carry active contradiction edges.
 */
export declare function getBlockingContradictions(beliefs: Belief[]): Belief[];
//# sourceMappingURL=ConfidenceGate.d.ts.map