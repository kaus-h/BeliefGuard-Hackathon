"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
// ── Singleton implementation ────────────────────────────────────────────
class SessionStore {
    // ── Singleton plumbing ──────────────────────────────────────────────
    static instance = null;
    /** Retrieve (or lazily create) the global SessionStore instance. */
    static getInstance() {
        if (!SessionStore.instance) {
            SessionStore.instance = new SessionStore();
        }
        return SessionStore.instance;
    }
    /**
     * Tear down the singleton — strictly for test isolation.
     * Production code should never call this.
     */
    static resetInstance() {
        SessionStore.instance = null;
    }
    // ── Instance state ──────────────────────────────────────────────────
    state;
    constructor() {
        this.state = {
            beliefs: new Map(),
            evidence: new Map(),
            edges: [],
        };
    }
    // ── Belief CRUD ─────────────────────────────────────────────────────
    /** Register or overwrite a belief by its ID. */
    setBelief(belief) {
        this.state.beliefs.set(belief.id, belief);
    }
    /** Retrieve a single belief; returns `undefined` if not found. */
    getBelief(id) {
        return this.state.beliefs.get(id);
    }
    /** Return all tracked beliefs as an array. */
    getAllBeliefs() {
        return Array.from(this.state.beliefs.values());
    }
    /** Remove a belief and all edges that reference it. */
    removeBelief(id) {
        const deleted = this.state.beliefs.delete(id);
        if (deleted) {
            this.state.edges = this.state.edges.filter((e) => e.fromId !== id && e.toId !== id);
        }
        return deleted;
    }
    // ── Evidence CRUD ───────────────────────────────────────────────────
    /** Register or overwrite an evidence artifact. */
    setEvidence(evidence) {
        this.state.evidence.set(evidence.id, evidence);
    }
    /** Retrieve evidence by ID. */
    getEvidence(id) {
        return this.state.evidence.get(id);
    }
    /** Return all stored evidence as an array. */
    getAllEvidence() {
        return Array.from(this.state.evidence.values());
    }
    // ── Edge management ─────────────────────────────────────────────────
    /** Add a directed edge between two graph nodes. */
    addEdge(edge) {
        // Prevent exact duplicates
        const exists = this.state.edges.some((e) => e.fromId === edge.fromId &&
            e.toId === edge.toId &&
            e.relation === edge.relation);
        if (!exists) {
            this.state.edges.push(edge);
        }
    }
    /** Return all edges currently in the graph. */
    getAllEdges() {
        return [...this.state.edges];
    }
    /** Return edges originating from a specific node. */
    getEdgesFrom(nodeId) {
        return this.state.edges.filter((e) => e.fromId === nodeId);
    }
    /** Return edges pointing to a specific node. */
    getEdgesTo(nodeId) {
        return this.state.edges.filter((e) => e.toId === nodeId);
    }
    // ── Bulk operations ─────────────────────────────────────────────────
    /** Wipe the entire session state (new task cycle). */
    clear() {
        this.state.beliefs.clear();
        this.state.evidence.clear();
        this.state.edges = [];
    }
    /** Return the count of beliefs currently stored. */
    get beliefCount() {
        return this.state.beliefs.size;
    }
    /** Return the count of evidence currently stored. */
    get evidenceCount() {
        return this.state.evidence.size;
    }
    /**
     * Export a serializable snapshot of the current graph state. This keeps
     * persistence adapter choices outside the core store.
     */
    toSnapshot() {
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
    hydrate(snapshot) {
        const beliefs = new Map();
        const evidence = new Map();
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
exports.SessionStore = SessionStore;
//# sourceMappingURL=SessionStore.js.map