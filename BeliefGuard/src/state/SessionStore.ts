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

// ── Internal store shape ────────────────────────────────────────────────

interface SessionState {
    beliefs: Map<string, Belief>;
    evidence: Map<string, Evidence>;
    edges: BeliefEdge[];
}

export interface SessionStoreSnapshot {
    beliefs: Belief[];
    evidence: Evidence[];
    edges: BeliefEdge[];
    savedAt: string;
}

// ── Singleton implementation ────────────────────────────────────────────

export class SessionStore {
    // ── Singleton plumbing ──────────────────────────────────────────────
    private static instance: SessionStore | null = null;

    /** Retrieve (or lazily create) the global SessionStore instance. */
    public static getInstance(): SessionStore {
        if (!SessionStore.instance) {
            SessionStore.instance = new SessionStore();
        }
        return SessionStore.instance;
    }

    /**
     * Tear down the singleton — strictly for test isolation.
     * Production code should never call this.
     */
    public static resetInstance(): void {
        SessionStore.instance = null;
    }

    // ── Instance state ──────────────────────────────────────────────────
    private state: SessionState;

    private constructor() {
        this.state = {
            beliefs: new Map(),
            evidence: new Map(),
            edges: [],
        };
    }

    // ── Belief CRUD ─────────────────────────────────────────────────────

    /** Register or overwrite a belief by its ID. */
    public setBelief(belief: Belief): void {
        this.state.beliefs.set(belief.id, belief);
    }

    /** Retrieve a single belief; returns `undefined` if not found. */
    public getBelief(id: string): Belief | undefined {
        return this.state.beliefs.get(id);
    }

    /** Return all tracked beliefs as an array. */
    public getAllBeliefs(): Belief[] {
        return Array.from(this.state.beliefs.values());
    }

    /** Remove a belief and all edges that reference it. */
    public removeBelief(id: string): boolean {
        const deleted = this.state.beliefs.delete(id);
        if (deleted) {
            this.state.edges = this.state.edges.filter(
                (e) => e.fromId !== id && e.toId !== id
            );
        }
        return deleted;
    }

    // ── Evidence CRUD ───────────────────────────────────────────────────

    /** Register or overwrite an evidence artifact. */
    public setEvidence(evidence: Evidence): void {
        this.state.evidence.set(evidence.id, evidence);
    }

    /** Retrieve evidence by ID. */
    public getEvidence(id: string): Evidence | undefined {
        return this.state.evidence.get(id);
    }

    /** Return all stored evidence as an array. */
    public getAllEvidence(): Evidence[] {
        return Array.from(this.state.evidence.values());
    }

    // ── Edge management ─────────────────────────────────────────────────

    /** Add a directed edge between two graph nodes. */
    public addEdge(edge: BeliefEdge): void {
        // Prevent exact duplicates
        const exists = this.state.edges.some(
            (e) =>
                e.fromId === edge.fromId &&
                e.toId === edge.toId &&
                e.relation === edge.relation
        );
        if (!exists) {
            this.state.edges.push(edge);
        }
    }

    /** Return all edges currently in the graph. */
    public getAllEdges(): BeliefEdge[] {
        return [...this.state.edges];
    }

    /** Return edges originating from a specific node. */
    public getEdgesFrom(nodeId: string): BeliefEdge[] {
        return this.state.edges.filter((e) => e.fromId === nodeId);
    }

    /** Return edges pointing to a specific node. */
    public getEdgesTo(nodeId: string): BeliefEdge[] {
        return this.state.edges.filter((e) => e.toId === nodeId);
    }

    // ── Bulk operations ─────────────────────────────────────────────────

    /** Wipe the entire session state (new task cycle). */
    public clear(): void {
        this.state.beliefs.clear();
        this.state.evidence.clear();
        this.state.edges = [];
    }

    /** Return the count of beliefs currently stored. */
    public get beliefCount(): number {
        return this.state.beliefs.size;
    }

    /** Return the count of evidence currently stored. */
    public get evidenceCount(): number {
        return this.state.evidence.size;
    }

    /**
     * Export a serializable snapshot of the current graph state. This keeps
     * persistence adapter choices outside the core store.
     */
    public toSnapshot(): SessionStoreSnapshot {
        return {
            beliefs: this.getAllBeliefs(),
            evidence: this.getAllEvidence(),
            edges: this.getAllEdges(),
            savedAt: new Date().toISOString(),
        };
    }

    /**
     * Hydrate the store from a previously exported snapshot.
     * Existing state is replaced atomically from the caller's perspective.
     */
    public hydrate(snapshot: SessionStoreSnapshot): void {
        const beliefs = new Map<string, Belief>();
        const evidence = new Map<string, Evidence>();

        for (const belief of snapshot.beliefs || []) {
            beliefs.set(belief.id, belief);
        }

        for (const artifact of snapshot.evidence || []) {
            evidence.set(artifact.id, artifact);
        }

        this.state = {
            beliefs,
            evidence,
            edges: [...(snapshot.edges || [])],
        };
    }
}
