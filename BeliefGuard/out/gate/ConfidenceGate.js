"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Confidence-to-Action Gate Policy Engine
// Deterministic decision matrix that prevents code execution until the
// aggregate risk of the belief state is sufficiently mitigated.
//
// Rule priority (spec §43-58 decision matrix):
//   1. BLOCK        — contradiction against REPO_FACT / USER_CONSTRAINT
//   2. ASK_USER     — unvalidated + HIGH risk
//   3. INSPECT_MORE — confidence < 0.40
//   4. PROCEED      — all clear
// ──────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateState = evaluateState;
exports.getBlockingContradictions = getBlockingContradictions;
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
function evaluateState(beliefs) {
    let hasUnvalidatedHighRisk = false;
    let hasLowConfidence = false;
    let hasContradiction = false;
    for (const belief of beliefs) {
        // Rule 1: Unvalidated HIGH-risk belief → ASK_USER
        if (belief.isValidated === false && belief.riskLevel === 'HIGH') {
            hasUnvalidatedHighRisk = true;
        }
        // Rule 2: Any belief with confidence below 0.40 → INSPECT_MORE
        if (belief.confidenceScore < 0.40) {
            hasLowConfidence = true;
        }
        // Rule 3: Contradiction specifically against a REPO_FACT or USER_CONSTRAINT → BLOCK
        if (belief.contradictions.length > 0) {
            const contradictsImmutable = belief.contradictions.some((cId) => {
                const contradicting = beliefs.find((b) => b.id === cId);
                return contradicting && (contradicting.type === 'REPO_FACT' ||
                    contradicting.type === 'USER_CONSTRAINT');
            });
            if (contradictsImmutable) {
                hasContradiction = true;
            }
        }
    }
    // Return decisions in spec-defined priority order
    if (hasContradiction) {
        return 'BLOCK';
    }
    if (hasUnvalidatedHighRisk) {
        return 'ASK_USER';
    }
    if (hasLowConfidence) {
        return 'INSPECT_MORE';
    }
    return 'PROCEED';
}
/**
 * Extracts the specific beliefs that are causing a BLOCK decision.
 * Used by the orchestrator to populate the Webview's violation display.
 *
 * @param beliefs  The full array of beliefs currently tracked.
 * @returns        Only the beliefs that carry active contradiction edges.
 */
function getBlockingContradictions(beliefs) {
    return beliefs.filter((b) => b.contradictions.length > 0);
}
//# sourceMappingURL=ConfidenceGate.js.map