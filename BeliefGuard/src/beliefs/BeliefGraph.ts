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
import { SessionStore } from '../state/SessionStore';

// ── Helper utilities ────────────────────────────────────────────────────

/**
 * Tokenise a string into normalised lowercase keywords, stripping
 * common stopwords so that semantic overlap checks are meaningful.
 */
function tokenise(text: string): Set<string> {
    const STOP_WORDS = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'shall', 'would', 'should', 'may', 'might', 'must', 'can',
        'could', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from',
        'by', 'about', 'as', 'into', 'through', 'during', 'before',
        'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
        'either', 'neither', 'each', 'every', 'all', 'any', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own',
        'same', 'than', 'too', 'very', 'just', 'it', 'its', 'this',
        'that', 'these', 'those',
    ]);

    return new Set(
        text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    );
}

/**
 * Jaccard similarity between two token sets — a value between 0 and 1.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

// ── Negation patterns for deterministic contradiction detection ─────────

const NEGATION_PAIRS: Array<[RegExp, RegExp]> = [
    [/\bstateless\b/i, /\bstateful\b/i],
    [/\btoken[- ]?based\b/i, /\bsession[- ]?based\b/i],
    [/\bno new dependenc/i, /\bnpm install\b|add.+dependenc/i],
    [/\bdo not alter\b/i, /\bmodif(y|ies|ied)\b/i],
    [/\bdo not change\b/i, /\bchange(s|d)?\b/i],
    [/\bpreserve\b/i, /\bremove\b|delete\b/i],
    [/\bbackward.?compat/i, /\bbreaking change/i],
    [/\benum\b/i, /\bdatabase entit/i],
    [/\bimmutable\b/i, /\bmutable\b/i],
    [/\bread[- ]?only\b/i, /\bwrit(e|able)\b/i],
];

// ── Public query API ────────────────────────────────────────────────────

/**
 * Return all beliefs that are HIGH-risk and have not yet been validated.
 * These are the beliefs the Confidence Gate will escalate to ASK_USER.
 */
export function getUnverifiedHighRiskBeliefs(): Belief[] {
    const store = SessionStore.getInstance();
    return store
        .getAllBeliefs()
        .filter(
            (b) => b.riskLevel === 'HIGH' && b.isValidated === false
        );
}

/**
 * Return all beliefs that remain unvalidated regardless of risk level.
 */
export function getUnverifiedBeliefs(): Belief[] {
    const store = SessionStore.getInstance();
    return store.getAllBeliefs().filter((b) => !b.isValidated);
}

/**
 * Return all beliefs that already carry at least one contradiction edge.
 */
export function getContradictedBeliefs(): Belief[] {
    const store = SessionStore.getInstance();
    return store
        .getAllBeliefs()
        .filter((b) => b.contradictions.length > 0);
}

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
export function detectContradictions(
    proposedActionContext: string
): Belief[] {
    const store = SessionStore.getInstance();
    const allBeliefs = store.getAllBeliefs();
    const contradicted = new Map<string, Belief>();

    const contextTokens = tokenise(proposedActionContext);

    for (const belief of allBeliefs) {
        // ── Heuristic 1: negation-pair matching ─────────────────────
        // Only flag contradictions with high-authority node types.
        if (
            belief.type === 'USER_CONSTRAINT' ||
            belief.type === 'REPO_FACT'
        ) {
            for (const [patternA, patternB] of NEGATION_PAIRS) {
                const contextMatchesA = patternA.test(proposedActionContext);
                const contextMatchesB = patternB.test(proposedActionContext);
                const beliefMatchesA = patternA.test(belief.statement);
                const beliefMatchesB = patternB.test(belief.statement);

                // Opposite poles → contradiction
                if (
                    (contextMatchesA && beliefMatchesB) ||
                    (contextMatchesB && beliefMatchesA)
                ) {
                    contradicted.set(belief.id, belief);
                    break; // one match is sufficient
                }
            }
        }

        // ── Heuristic 2: overlap + existing contradiction edges ─────
        if (belief.contradictions.length > 0) {
            const beliefTokens = tokenise(belief.statement);
            const similarity = jaccardSimilarity(contextTokens, beliefTokens);
            if (similarity >= 0.3) {
                contradicted.set(belief.id, belief);
            }
        }
    }

    return Array.from(contradicted.values());
}

/**
 * Capture a point-in-time snapshot of the entire belief graph, suitable
 * for serialization, logging, or passing to the Confidence Gate.
 */
export function takeSnapshot(): BeliefGraphSnapshot {
    const store = SessionStore.getInstance();
    return {
        beliefs: store.getAllBeliefs(),
        evidence: store.getAllEvidence(),
        edges: store.getAllEdges(),
        timestamp: new Date().toISOString(),
    };
}
