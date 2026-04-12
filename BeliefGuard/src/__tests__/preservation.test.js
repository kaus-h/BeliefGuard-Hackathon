"use strict";
/**
 * Preservation Property Tests - Baseline Behavior
 *
 * These tests capture current behavior that must remain stable while the
 * bugfix work continues. They should pass against the current codebase.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var fc = require("fast-check");
vitest_1.vi.mock('vscode', function () { return ({
    workspace: {
        workspaceFolders: [
            {
                name: 'test-workspace',
                uri: { fsPath: '/test-workspace' },
            },
        ],
        openTextDocument: vitest_1.vi.fn(),
        applyEdit: vitest_1.vi.fn(),
        saveAll: vitest_1.vi.fn(),
        fs: {
            createDirectory: vitest_1.vi.fn(),
        },
    },
    window: {
        showQuickPick: vitest_1.vi.fn(),
        showInformationMessage: vitest_1.vi.fn(),
    },
    Uri: {
        file: function (p) { return ({ fsPath: p, scheme: 'file' }); },
        parse: function (u) { return ({ fsPath: u, scheme: 'file' }); },
        joinPath: function (_base) {
            var parts = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                parts[_i - 1] = arguments[_i];
            }
            return ({
                fsPath: parts.join('/'),
                scheme: 'file',
            });
        },
    },
    WorkspaceEdit: /** @class */ (function () {
        function WorkspaceEdit() {
        }
        WorkspaceEdit.prototype.replace = function () { };
        WorkspaceEdit.prototype.insert = function () { };
        WorkspaceEdit.prototype.deleteFile = function () { };
        WorkspaceEdit.prototype.createFile = function () { };
        return WorkspaceEdit;
    }()),
    Range: /** @class */ (function () {
        function class_1(start, end) {
            this.start = start;
            this.end = end;
        }
        return class_1;
    }()),
    Position: /** @class */ (function () {
        function class_2(line, character) {
            this.line = line;
            this.character = character;
        }
        return class_2;
    }()),
    ViewColumn: { One: 1 },
}); });
var ConfidenceGate_1 = require("../gate/ConfidenceGate");
var SessionStore_1 = require("../state/SessionStore");
var unifiedDiff_1 = require("../utils/unifiedDiff");
var PatchValidator_1 = require("../validation/PatchValidator");
var riskLevelArb = fc.constantFrom('LOW', 'MEDIUM', 'HIGH');
var beliefTypeArb = fc.constantFrom('REPO_FACT', 'TASK_BELIEF', 'AGENT_ASSUMPTION', 'USER_CONSTRAINT');
var beliefArb = fc.record({
    id: fc.uuid(),
    statement: fc.string({ minLength: 1, maxLength: 100 }),
    type: beliefTypeArb,
    confidenceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    riskLevel: riskLevelArb,
    evidenceIds: fc.array(fc.uuid(), { maxLength: 3 }),
    isValidated: fc.boolean(),
    contradictions: fc.array(fc.uuid(), { maxLength: 2 }),
});
(0, vitest_1.beforeEach)(function () {
    SessionStore_1.SessionStore.resetInstance();
});
(0, vitest_1.describe)('Preservation: Gate Decision Priority', function () {
    (0, vitest_1.it)('returns BLOCK when a belief contradicts an immutable belief', function () {
        var immutable = {
            id: 'immutable-1',
            statement: 'Repo uses TypeScript',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        var contradicted = {
            id: 'contradicted-1',
            statement: 'Repo uses JavaScript',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.5,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['immutable-1'],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([immutable, contradicted])).toBe('BLOCK');
        (0, vitest_1.expect)((0, ConfidenceGate_1.getBlockingContradictions)([immutable, contradicted])).toEqual([
            contradicted,
        ]);
    });
    (0, vitest_1.it)('returns ASK_USER for unvalidated HIGH risk beliefs without contradictions', function () {
        var highRiskUnvalidated = {
            id: 'hr-1',
            statement: 'Auth uses JWT',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.6,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([highRiskUnvalidated])).toBe('ASK_USER');
    });
    (0, vitest_1.it)('returns INSPECT_MORE when confidence is below 0.40 and there is no higher-priority trigger', function () {
        var lowConfidence = {
            id: 'lc-1',
            statement: 'Uses Redis for caching',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([lowConfidence])).toBe('INSPECT_MORE');
    });
    (0, vitest_1.it)('returns PROCEED for safe validated beliefs', function () {
        var safe = {
            id: 'safe-1',
            statement: 'Package.json exists',
            type: 'REPO_FACT',
            confidenceScore: 0.95,
            riskLevel: 'LOW',
            evidenceIds: ['ev-1'],
            isValidated: true,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([safe])).toBe('PROCEED');
    });
    (0, vitest_1.it)('preserves the priority order BLOCK > ASK_USER > INSPECT_MORE > PROCEED', function () {
        var immutable = {
            id: 'imm-1',
            statement: 'Fact',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        var contradicted = {
            id: 'cont-1',
            statement: 'Wrong',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['imm-1'],
        };
        var highRiskUnvalidated = {
            id: 'hr-2',
            statement: 'Need confirmation',
            type: 'TASK_BELIEF',
            confidenceScore: 0.3,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        var lowConfidence = {
            id: 'lc-2',
            statement: 'Maybe something',
            type: 'TASK_BELIEF',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([immutable, contradicted, highRiskUnvalidated, lowConfidence])).toBe('BLOCK');
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([highRiskUnvalidated, lowConfidence])).toBe('ASK_USER');
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([lowConfidence])).toBe('INSPECT_MORE');
        (0, vitest_1.expect)((0, ConfidenceGate_1.evaluateState)([safeBelief()])).toBe('PROCEED');
    });
});
(0, vitest_1.describe)('Preservation: SessionStore Synchronous Writes', function () {
    (0, vitest_1.it)('returns the same singleton instance across reads', function () {
        (0, vitest_1.expect)(SessionStore_1.SessionStore.getInstance()).toBe(SessionStore_1.SessionStore.getInstance());
    });
    (0, vitest_1.it)('setBelief then getBelief returns the same belief immediately', function () {
        fc.assert(fc.property(beliefArb, function (belief) {
            var store = SessionStore_1.SessionStore.getInstance();
            store.clear();
            store.setBelief(belief);
            var retrieved = store.getBelief(belief.id);
            return (retrieved !== undefined &&
                retrieved.id === belief.id &&
                retrieved.statement === belief.statement &&
                retrieved.type === belief.type);
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('getAllBeliefs returns all unique beliefs that were stored', function () {
        fc.assert(fc.property(fc.uniqueArray(beliefArb, {
            selector: function (belief) { return belief.id; },
            maxLength: 8,
        }), function (beliefs) {
            var store = SessionStore_1.SessionStore.getInstance();
            store.clear();
            for (var _i = 0, beliefs_1 = beliefs; _i < beliefs_1.length; _i++) {
                var belief = beliefs_1[_i];
                store.setBelief(belief);
            }
            var all = store.getAllBeliefs();
            return (all.length === beliefs.length &&
                beliefs.every(function (belief) {
                    return all.some(function (stored) { return stored.id === belief.id; });
                }));
        }), { numRuns: 30 });
    });
});
(0, vitest_1.describe)('Preservation: Empty Patch Handling', function () {
    (0, vitest_1.it)('parseUnifiedDiff returns an empty array for empty input', function () {
        (0, vitest_1.expect)((0, unifiedDiff_1.parseUnifiedDiff)('')).toEqual([]);
    });
    (0, vitest_1.it)('parseUnifiedDiff returns an empty array for whitespace-only input', function () {
        (0, vitest_1.expect)((0, unifiedDiff_1.parseUnifiedDiff)('   \n  \n  ')).toEqual([]);
    });
});
(0, vitest_1.describe)('Preservation: Unified Diff Parsing', function () {
    (0, vitest_1.it)('parses a single-file diff into one change', function () {
        var singleFileDiff = "--- a/src/types.ts\n+++ b/src/types.ts\n@@ -1,3 +1,4 @@\n export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';\n+export type NewType = string;\n export type GateDecision = 'PROCEED';\n export type SourceType = 'FILE';";
        var changes = (0, unifiedDiff_1.parseUnifiedDiff)(singleFileDiff);
        (0, vitest_1.expect)(changes).toHaveLength(1);
        (0, vitest_1.expect)(changes[0].newPath).toContain('src/types.ts');
    });
    (0, vitest_1.it)('keeps multiple file sections separate', function () {
        var multiFileDiff = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-const b = 1;\n+const b = 2;";
        var changes = (0, unifiedDiff_1.parseUnifiedDiff)(multiFileDiff);
        (0, vitest_1.expect)(changes).toHaveLength(2);
        (0, vitest_1.expect)(changes.map(function (change) { return change.newPath; })).toEqual([
            'src/a.ts',
            'src/b.ts',
        ]);
    });
});
(0, vitest_1.describe)('Preservation: PatchValidator Constraint Detection', function () {
    (0, vitest_1.it)('flags diffs that touch a constrained file', function () {
        var constraintBelief = {
            id: 'uc-1',
            statement: 'Do not modify the database schema in schema.ts',
            type: 'USER_CONSTRAINT',
            confidenceScore: 1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        var diffTouchingSchema = "--- a/schema.ts\n+++ b/schema.ts\n@@ -1,3 +1,4 @@\n const schema = {\n+  newField: 'string',\n   id: 'number',\n };";
        var result = (0, PatchValidator_1.validateGeneratedPatch)(diffTouchingSchema, [constraintBelief]);
        (0, vitest_1.expect)(result.isValid).toBe(false);
        (0, vitest_1.expect)(result.violations).toHaveLength(1);
        (0, vitest_1.expect)(result.violations[0].id).toBe('uc-1');
        (0, vitest_1.expect)(result.diffPatch).toBe(diffTouchingSchema);
    });
    (0, vitest_1.it)('ignores non-constraint beliefs', function () {
        var nonConstraintBelief = {
            id: 'task-1',
            statement: 'Use the new caching layer',
            type: 'TASK_BELIEF',
            confidenceScore: 0.8,
            riskLevel: 'MEDIUM',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        var diff = "--- a/src/cache.ts\n+++ b/src/cache.ts\n@@ -1,1 +1,2 @@\n export const cache = {};\n+export const enabled = true;";
        var result = (0, PatchValidator_1.validateGeneratedPatch)(diff, [nonConstraintBelief]);
        (0, vitest_1.expect)(result.isValid).toBe(true);
        (0, vitest_1.expect)(result.violations).toEqual([]);
    });
});
(0, vitest_1.describe)('Preservation: Diff Normalization', function () {
    (0, vitest_1.it)('strips markdown fences from diff text', function () {
        var fenced = '```diff\n--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n```';
        var normalized = (0, unifiedDiff_1.normalizeUnifiedDiffText)(fenced);
        (0, vitest_1.expect)(normalized).not.toContain('```');
        (0, vitest_1.expect)(normalized).toContain('--- a/file.ts');
    });
    (0, vitest_1.it)('passes through raw diff text unchanged', function () {
        var raw = '--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2';
        var normalized = (0, unifiedDiff_1.normalizeUnifiedDiffText)(raw);
        (0, vitest_1.expect)(normalized).toContain('--- a/file.ts');
        (0, vitest_1.expect)(normalized).toContain('+line2');
    });
});
function safeBelief() {
    return {
        id: 'safe-2',
        statement: 'This is safe',
        type: 'REPO_FACT',
        confidenceScore: 0.99,
        riskLevel: 'LOW',
        evidenceIds: [],
        isValidated: true,
        contradictions: [],
    };
}
