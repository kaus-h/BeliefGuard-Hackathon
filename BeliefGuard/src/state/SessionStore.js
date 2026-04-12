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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
// ── Singleton implementation ────────────────────────────────────────────
var SessionStore = /** @class */ (function () {
    function SessionStore() {
        this.state = {
            beliefs: new Map(),
            evidence: new Map(),
            edges: [],
        };
    }
    /** Retrieve (or lazily create) the global SessionStore instance. */
    SessionStore.getInstance = function () {
        if (!SessionStore.instance) {
            SessionStore.instance = new SessionStore();
        }
        return SessionStore.instance;
    };
    /**
     * Tear down the singleton — strictly for test isolation.
     * Production code should never call this.
     */
    SessionStore.resetInstance = function () {
        SessionStore.instance = null;
    };
    // ── Belief CRUD ─────────────────────────────────────────────────────
    /** Register or overwrite a belief by its ID. */
    SessionStore.prototype.setBelief = function (belief) {
        this.state.beliefs.set(belief.id, belief);
    };
    /** Retrieve a single belief; returns `undefined` if not found. */
    SessionStore.prototype.getBelief = function (id) {
        return this.state.beliefs.get(id);
    };
    /** Return all tracked beliefs as an array. */
    SessionStore.prototype.getAllBeliefs = function () {
        return Array.from(this.state.beliefs.values());
    };
    /** Remove a belief and all edges that reference it. */
    SessionStore.prototype.removeBelief = function (id) {
        var deleted = this.state.beliefs.delete(id);
        if (deleted) {
            this.state.edges = this.state.edges.filter(function (e) { return e.fromId !== id && e.toId !== id; });
        }
        return deleted;
    };
    // ── Evidence CRUD ───────────────────────────────────────────────────
    /** Register or overwrite an evidence artifact. */
    SessionStore.prototype.setEvidence = function (evidence) {
        this.state.evidence.set(evidence.id, evidence);
    };
    /** Retrieve evidence by ID. */
    SessionStore.prototype.getEvidence = function (id) {
        return this.state.evidence.get(id);
    };
    /** Return all stored evidence as an array. */
    SessionStore.prototype.getAllEvidence = function () {
        return Array.from(this.state.evidence.values());
    };
    // ── Edge management ─────────────────────────────────────────────────
    /** Add a directed edge between two graph nodes. */
    SessionStore.prototype.addEdge = function (edge) {
        // Prevent exact duplicates
        var exists = this.state.edges.some(function (e) {
            return e.fromId === edge.fromId &&
                e.toId === edge.toId &&
                e.relation === edge.relation;
        });
        if (!exists) {
            this.state.edges.push(edge);
        }
    };
    /** Return all edges currently in the graph. */
    SessionStore.prototype.getAllEdges = function () {
        return __spreadArray([], this.state.edges, true);
    };
    /** Return edges originating from a specific node. */
    SessionStore.prototype.getEdgesFrom = function (nodeId) {
        return this.state.edges.filter(function (e) { return e.fromId === nodeId; });
    };
    /** Return edges pointing to a specific node. */
    SessionStore.prototype.getEdgesTo = function (nodeId) {
        return this.state.edges.filter(function (e) { return e.toId === nodeId; });
    };
    // ── Bulk operations ─────────────────────────────────────────────────
    /** Wipe the entire session state (new task cycle). */
    SessionStore.prototype.clear = function () {
        this.state.beliefs.clear();
        this.state.evidence.clear();
        this.state.edges = [];
    };
    Object.defineProperty(SessionStore.prototype, "beliefCount", {
        /** Return the count of beliefs currently stored. */
        get: function () {
            return this.state.beliefs.size;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SessionStore.prototype, "evidenceCount", {
        /** Return the count of evidence currently stored. */
        get: function () {
            return this.state.evidence.size;
        },
        enumerable: false,
        configurable: true
    });
    // ── Singleton plumbing ──────────────────────────────────────────────
    SessionStore.instance = null;
    return SessionStore;
}());
exports.SessionStore = SessionStore;
