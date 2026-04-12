/**
 * SessionStore — Singleton Session Persistence Engine
 *
 * Keeps validated beliefs and evidence alive across multiple iterative
 * prompt cycles within a single VS Code session.  This prevents
 * late-stage agent drift by ensuring that user constraints confirmed
 * during early turns remain accessible throughout the task lifecycle.
 *
 * Design Notes
 * ────────────
 * • This module is intentionally VS-Code-API-free; it stores everything
 *   in-memory so that it can be unit-tested without a host process.
 * • A future enhancement could accept a persistence adapter (e.g.,
 *   vscode.Memento) via constructor injection without changing the
 *   public API surface.
 */
import type { Belief, Evidence, BeliefEdge } from '../beliefs/types';
export declare class SessionStore {
    private static instance;
    /** Retrieve (or lazily create) the global SessionStore instance. */
    static getInstance(): SessionStore;
    /**
     * Tear down the singleton — strictly for test isolation.
     * Production code should never call this.
     */
    static resetInstance(): void;
    private state;
    private constructor();
    /** Register or overwrite a belief by its ID. */
    setBelief(belief: Belief): void;
    /** Retrieve a single belief; returns `undefined` if not found. */
    getBelief(id: string): Belief | undefined;
    /** Return all tracked beliefs as an array. */
    getAllBeliefs(): Belief[];
    /** Remove a belief and all edges that reference it. */
    removeBelief(id: string): boolean;
    /** Register or overwrite an evidence artifact. */
    setEvidence(evidence: Evidence): void;
    /** Retrieve evidence by ID. */
    getEvidence(id: string): Evidence | undefined;
    /** Return all stored evidence as an array. */
    getAllEvidence(): Evidence[];
    /** Add a directed edge between two graph nodes. */
    addEdge(edge: BeliefEdge): void;
    /** Return all edges currently in the graph. */
    getAllEdges(): BeliefEdge[];
    /** Return edges originating from a specific node. */
    getEdgesFrom(nodeId: string): BeliefEdge[];
    /** Return edges pointing to a specific node. */
    getEdgesTo(nodeId: string): BeliefEdge[];
    /** Wipe the entire session state (new task cycle). */
    clear(): void;
    /** Return the count of beliefs currently stored. */
    get beliefCount(): number;
    /** Return the count of evidence currently stored. */
    get evidenceCount(): number;
}
//# sourceMappingURL=SessionStore.d.ts.map