"use strict";
/**
 * Preservation Property Tests - Baseline Behavior
 *
 * These tests capture current behavior that must remain stable while the
 * bugfix work continues. They should pass against the current codebase.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fc = __importStar(require("fast-check"));
vitest_1.vi.mock('vscode', () => ({
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
        file: (p) => ({ fsPath: p, scheme: 'file' }),
        parse: (u) => ({ fsPath: u, scheme: 'file' }),
        joinPath: (_base, ...parts) => ({
            fsPath: parts.join('/'),
            scheme: 'file',
        }),
    },
    WorkspaceEdit: class {
        replace() { }
        insert() { }
        deleteFile() { }
        createFile() { }
    },
    Range: class {
        start;
        end;
        constructor(start, end) {
            this.start = start;
            this.end = end;
        }
    },
    Position: class {
        line;
        character;
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    },
    ViewColumn: { One: 1 },
}));
const ConfidenceGate_ts_1 = require("../gate/ConfidenceGate.ts");
const SessionStore_ts_1 = require("../state/SessionStore.ts");
const unifiedDiff_ts_1 = require("../utils/unifiedDiff.ts");
const PatchValidator_ts_1 = require("../validation/PatchValidator.ts");
const riskLevelArb = fc.constantFrom('LOW', 'MEDIUM', 'HIGH');
const beliefTypeArb = fc.constantFrom('REPO_FACT', 'TASK_BELIEF', 'AGENT_ASSUMPTION', 'USER_CONSTRAINT');
const beliefArb = fc.record({
    id: fc.uuid(),
    statement: fc.string({ minLength: 1, maxLength: 100 }),
    type: beliefTypeArb,
    confidenceScore: fc.double({ min: 0, max: 1, noNaN: true }),
    riskLevel: riskLevelArb,
    evidenceIds: fc.array(fc.uuid(), { maxLength: 3 }),
    isValidated: fc.boolean(),
    contradictions: fc.array(fc.uuid(), { maxLength: 2 }),
});
(0, vitest_1.beforeEach)(() => {
    SessionStore_ts_1.SessionStore.resetInstance();
});
(0, vitest_1.describe)('Preservation: Gate Decision Priority', () => {
    (0, vitest_1.it)('returns BLOCK when a belief contradicts an immutable belief', () => {
        const immutable = {
            id: 'immutable-1',
            statement: 'Repo uses TypeScript',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const contradicted = {
            id: 'contradicted-1',
            statement: 'Repo uses JavaScript',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.5,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['immutable-1'],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([immutable, contradicted])).toBe('BLOCK');
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.getBlockingContradictions)([immutable, contradicted])).toEqual([
            contradicted,
        ]);
    });
    (0, vitest_1.it)('returns ASK_USER for unvalidated HIGH risk beliefs without contradictions', () => {
        const highRiskUnvalidated = {
            id: 'hr-1',
            statement: 'Auth uses JWT',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.6,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([highRiskUnvalidated])).toBe('ASK_USER');
    });
    (0, vitest_1.it)('returns INSPECT_MORE when confidence is below 0.40 and there is no higher-priority trigger', () => {
        const lowConfidence = {
            id: 'lc-1',
            statement: 'Uses Redis for caching',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([lowConfidence])).toBe('INSPECT_MORE');
    });
    (0, vitest_1.it)('returns PROCEED for safe validated beliefs', () => {
        const safe = {
            id: 'safe-1',
            statement: 'Package.json exists',
            type: 'REPO_FACT',
            confidenceScore: 0.95,
            riskLevel: 'LOW',
            evidenceIds: ['ev-1'],
            isValidated: true,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([safe])).toBe('PROCEED');
    });
    (0, vitest_1.it)('preserves the priority order BLOCK > ASK_USER > INSPECT_MORE > PROCEED', () => {
        const immutable = {
            id: 'imm-1',
            statement: 'Fact',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const contradicted = {
            id: 'cont-1',
            statement: 'Wrong',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['imm-1'],
        };
        const highRiskUnvalidated = {
            id: 'hr-2',
            statement: 'Need confirmation',
            type: 'TASK_BELIEF',
            confidenceScore: 0.3,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        const lowConfidence = {
            id: 'lc-2',
            statement: 'Maybe something',
            type: 'TASK_BELIEF',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([immutable, contradicted, highRiskUnvalidated, lowConfidence])).toBe('BLOCK');
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([highRiskUnvalidated, lowConfidence])).toBe('ASK_USER');
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([lowConfidence])).toBe('INSPECT_MORE');
        (0, vitest_1.expect)((0, ConfidenceGate_ts_1.evaluateState)([safeBelief()])).toBe('PROCEED');
    });
});
(0, vitest_1.describe)('Preservation: SessionStore Synchronous Writes', () => {
    (0, vitest_1.it)('returns the same singleton instance across reads', () => {
        (0, vitest_1.expect)(SessionStore_ts_1.SessionStore.getInstance()).toBe(SessionStore_ts_1.SessionStore.getInstance());
    });
    (0, vitest_1.it)('setBelief then getBelief returns the same belief immediately', () => {
        fc.assert(fc.property(beliefArb, (belief) => {
            const store = SessionStore_ts_1.SessionStore.getInstance();
            store.clear();
            store.setBelief(belief);
            const retrieved = store.getBelief(belief.id);
            return (retrieved !== undefined &&
                retrieved.id === belief.id &&
                retrieved.statement === belief.statement &&
                retrieved.type === belief.type);
        }), { numRuns: 50 });
    });
    (0, vitest_1.it)('getAllBeliefs returns all unique beliefs that were stored', () => {
        fc.assert(fc.property(fc.uniqueArray(beliefArb, {
            selector: (belief) => belief.id,
            maxLength: 8,
        }), (beliefs) => {
            const store = SessionStore_ts_1.SessionStore.getInstance();
            store.clear();
            for (const belief of beliefs) {
                store.setBelief(belief);
            }
            const all = store.getAllBeliefs();
            return (all.length === beliefs.length &&
                beliefs.every((belief) => all.some((stored) => stored.id === belief.id)));
        }), { numRuns: 30 });
    });
});
(0, vitest_1.describe)('Preservation: Empty Patch Handling', () => {
    (0, vitest_1.it)('parseUnifiedDiff returns an empty array for empty input', () => {
        (0, vitest_1.expect)((0, unifiedDiff_ts_1.parseUnifiedDiff)('')).toEqual([]);
    });
    (0, vitest_1.it)('parseUnifiedDiff returns an empty array for whitespace-only input', () => {
        (0, vitest_1.expect)((0, unifiedDiff_ts_1.parseUnifiedDiff)('   \n  \n  ')).toEqual([]);
    });
});
(0, vitest_1.describe)('Preservation: Unified Diff Parsing', () => {
    (0, vitest_1.it)('parses a single-file diff into one change', () => {
        const singleFileDiff = `--- a/src/types.ts
+++ b/src/types.ts
@@ -1,3 +1,4 @@
 export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
+export type NewType = string;
 export type GateDecision = 'PROCEED';
 export type SourceType = 'FILE';`;
        const changes = (0, unifiedDiff_ts_1.parseUnifiedDiff)(singleFileDiff);
        (0, vitest_1.expect)(changes).toHaveLength(1);
        (0, vitest_1.expect)(changes[0].newPath).toContain('src/types.ts');
    });
    (0, vitest_1.it)('keeps multiple file sections separate', () => {
        const multiFileDiff = `--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-const a = 1;
+const a = 2;
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-const b = 1;
+const b = 2;`;
        const changes = (0, unifiedDiff_ts_1.parseUnifiedDiff)(multiFileDiff);
        (0, vitest_1.expect)(changes).toHaveLength(2);
        (0, vitest_1.expect)(changes.map((change) => change.newPath)).toEqual([
            'src/a.ts',
            'src/b.ts',
        ]);
    });
});
(0, vitest_1.describe)('Preservation: PatchValidator Constraint Detection', () => {
    (0, vitest_1.it)('flags diffs that touch a constrained file', () => {
        const constraintBelief = {
            id: 'uc-1',
            statement: 'Do not modify the database schema in schema.ts',
            type: 'USER_CONSTRAINT',
            confidenceScore: 1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const diffTouchingSchema = `--- a/schema.ts
+++ b/schema.ts
@@ -1,3 +1,4 @@
 const schema = {
+  newField: 'string',
   id: 'number',
 };`;
        const result = (0, PatchValidator_ts_1.validateGeneratedPatch)(diffTouchingSchema, [constraintBelief]);
        (0, vitest_1.expect)(result.isValid).toBe(false);
        (0, vitest_1.expect)(result.violations).toHaveLength(1);
        (0, vitest_1.expect)(result.violations[0].id).toBe('uc-1');
        (0, vitest_1.expect)(result.diffPatch).toBe(diffTouchingSchema);
    });
    (0, vitest_1.it)('ignores non-constraint beliefs', () => {
        const nonConstraintBelief = {
            id: 'task-1',
            statement: 'Use the new caching layer',
            type: 'TASK_BELIEF',
            confidenceScore: 0.8,
            riskLevel: 'MEDIUM',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const diff = `--- a/src/cache.ts
+++ b/src/cache.ts
@@ -1,1 +1,2 @@
 export const cache = {};
+export const enabled = true;`;
        const result = (0, PatchValidator_ts_1.validateGeneratedPatch)(diff, [nonConstraintBelief]);
        (0, vitest_1.expect)(result.isValid).toBe(true);
        (0, vitest_1.expect)(result.violations).toEqual([]);
    });
});
(0, vitest_1.describe)('Preservation: Diff Normalization', () => {
    (0, vitest_1.it)('strips markdown fences from diff text', () => {
        const fenced = '```diff\n--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n```';
        const normalized = (0, unifiedDiff_ts_1.normalizeUnifiedDiffText)(fenced);
        (0, vitest_1.expect)(normalized).not.toContain('```');
        (0, vitest_1.expect)(normalized).toContain('--- a/file.ts');
    });
    (0, vitest_1.it)('passes through raw diff text unchanged', () => {
        const raw = '--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2';
        const normalized = (0, unifiedDiff_ts_1.normalizeUnifiedDiffText)(raw);
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
//# sourceMappingURL=preservation.test.js.map