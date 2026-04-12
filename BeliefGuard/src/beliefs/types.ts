/**
 * BeliefGuard — Beliefs Domain Types
 *
 * Re-exports the canonical shared types from the project root types.ts
 * and adds graph-specific enumerations/types used exclusively within the
 * beliefs and state layers.
 *
 * All modules inside src/beliefs/* and src/state/* MUST import from this
 * file rather than reaching into other directories directly.
 */

// ── Re-export shared canonical types ────────────────────────────────────
export type {
    SourceType,
    BeliefType,
    RiskLevel,
    Evidence,
    Belief,
    AgentPlan,
    ClarificationQuestion,
    ValidationResult,
} from '../types';

// ── Graph-specific edge types ───────────────────────────────────────────

/**
 * Enumerates the two directed-edge relationships that can exist between
 * nodes in the Repo Belief Graph.
 */
export type EdgeRelation = 'SUPPORTED_BY' | 'CONTRADICTED_BY';

/**
 * Represents a directed edge between two nodes in the Belief Graph.
 */
export interface BeliefEdge {
    /** UUID v4 identifier of the source node. */
    fromId: string;
    /** UUID v4 identifier of the target node. */
    toId: string;
    /** The semantic relationship this edge encodes. */
    relation: EdgeRelation;
}

/**
 * A lightweight snapshot of the full belief-graph state, used by the
 * Confidence Gate evaluator and the Main Orchestrator.
 */
export interface BeliefGraphSnapshot {
    /** All beliefs currently tracked (validated + unvalidated). */
    beliefs: import('../types').Belief[];
    /** All evidence artifacts currently registered. */
    evidence: import('../types').Evidence[];
    /** All edges between belief and evidence nodes. */
    edges: BeliefEdge[];
    /** ISO-8601 timestamp of the snapshot. */
    timestamp: string;
}
