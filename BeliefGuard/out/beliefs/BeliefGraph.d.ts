/**
 * BeliefGraph — Graph Querying & Contradiction Detection
 *
 * Provides stateless query functions that operate over the beliefs and
 * edges stored in the SessionStore singleton.  These functions are the
 * primary entry-points consumed by the Confidence Gate (Agent 5).
 *
 * Design Notes
 * ────────────
 * • Every function reads from the SessionStore but never mutates it.
 *   All mutations flow through BeliefStateManager.
 * • `detectContradictions` implements a deterministic heuristic fallback
 *   for the thinkN SDK's native contradiction tracking, as permitted by
 *   the hackathon constraint in the spec.
 *
 * Singleton Coupling (by design)
 * ──────────────────────────────
 * This module and the BeliefStateManager (ThinkNClient.ts) both access
 * the same SessionStore via `SessionStore.getInstance()`. This is an
 * intentional architectural decision — it allows BeliefGraph query
 * functions to read the latest state without requiring explicit state
 * passing, while BeliefStateManager remains the sole writer. The
 * SessionStore singleton guarantees data consistency across both modules
 * within a single extension host process.
 */
import type { Belief, BeliefGraphSnapshot } from './types';
/**
 * Return all beliefs that are HIGH-risk and have not yet been validated.
 * These are the beliefs the Confidence Gate will escalate to ASK_USER.
 */
export declare function getUnverifiedHighRiskBeliefs(): Belief[];
/**
 * Return all beliefs that remain unvalidated regardless of risk level.
 */
export declare function getUnverifiedBeliefs(): Belief[];
/**
 * Return all beliefs that already carry at least one contradiction edge.
 */
export declare function getContradictedBeliefs(): Belief[];
/**
 * Deterministic contradiction detection.
 *
 * Given a textual description of a proposed action (e.g., a generated
 * plan summary), this function searches the entire stored belief set for
 * beliefs whose statements logically conflict with the proposed context.
 *
 * The detection uses two complementary heuristics:
 *
 *   1. **Negation-pair matching** — a curated list of known antonym
 *      patterns (e.g., "stateless" vs "stateful").  If the proposed
 *      context matches one side and an existing USER_CONSTRAINT or
 *      REPO_FACT matches the opposite side, a contradiction is flagged.
 *
 *   2. **Semantic overlap + existing contradiction edges** — if the
 *      proposed context shares significant keyword overlap (Jaccard ≥ 0.3)
 *      with a belief that already has CONTRADICTED_BY edges, the belief
 *      is surfaced for re-evaluation.
 *
 * @param proposedActionContext  Free-text description of the planned action.
 * @returns  Array of beliefs that conflict with the proposal.
 */
export declare function detectContradictions(proposedActionContext: string): Belief[];
/**
 * Capture a point-in-time snapshot of the entire belief graph, suitable
 * for serialization, logging, or passing to the Confidence Gate.
 */
export declare function takeSnapshot(): BeliefGraphSnapshot;
//# sourceMappingURL=BeliefGraph.d.ts.map