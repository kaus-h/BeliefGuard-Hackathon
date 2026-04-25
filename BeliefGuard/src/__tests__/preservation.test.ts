/**
 * Preservation Property Tests - Baseline Behavior
 *
 * These tests capture current behavior that must remain stable while the
 * bugfix work continues. They should pass against the current codebase.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';

vi.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [
            {
                name: 'test-workspace',
                uri: { fsPath: '/test-workspace' },
            },
        ],
        openTextDocument: vi.fn(),
        applyEdit: vi.fn(),
        saveAll: vi.fn(),
        fs: {
            createDirectory: vi.fn(),
        },
    },
    window: {
        showQuickPick: vi.fn(),
        showInformationMessage: vi.fn(),
    },
    Uri: {
        file: (p: string) => ({ fsPath: p, scheme: 'file' }),
        parse: (u: string) => ({ fsPath: u, scheme: 'file' }),
        joinPath: (_base: { fsPath: string }, ...parts: string[]) => ({
            fsPath: parts.join('/'),
            scheme: 'file',
        }),
    },
    WorkspaceEdit: class {
        replace() {}
        insert() {}
        deleteFile() {}
        createFile() {}
    },
    Range: class {
        constructor(public start: unknown, public end: unknown) {}
    },
    Position: class {
        constructor(public line: number, public character: number) {}
    },
    ViewColumn: { One: 1 },
}));

import type { Belief, BeliefType, RiskLevel } from '../types';
import { evaluateState, getBlockingContradictions } from '../gate/ConfidenceGate.ts';
import { SessionStore } from '../state/SessionStore.ts';
import {
    normalizeUnifiedDiffText,
    parseUnifiedDiff,
} from '../utils/unifiedDiff.ts';
import { validateGeneratedPatch } from '../validation/PatchValidator.ts';

const riskLevelArb = fc.constantFrom<RiskLevel>('LOW', 'MEDIUM', 'HIGH');
const beliefTypeArb = fc.constantFrom<BeliefType>(
    'REPO_FACT',
    'TASK_BELIEF',
    'AGENT_ASSUMPTION',
    'USER_CONSTRAINT'
);

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

beforeEach(() => {
    SessionStore.resetInstance();
});

describe('Preservation: Gate Decision Priority', () => {
    it('returns BLOCK when a belief contradicts an immutable belief', () => {
        const immutable: Belief = {
            id: 'immutable-1',
            statement: 'Repo uses TypeScript',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const contradicted: Belief = {
            id: 'contradicted-1',
            statement: 'Repo uses JavaScript',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.5,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['immutable-1'],
        };

        expect(evaluateState([immutable, contradicted])).toBe('BLOCK');
        expect(getBlockingContradictions([immutable, contradicted])).toEqual([
            contradicted,
        ]);
    });

    it('returns ASK_USER for unvalidated HIGH risk beliefs without contradictions', () => {
        const highRiskUnvalidated: Belief = {
            id: 'hr-1',
            statement: 'Auth uses JWT',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.6,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };

        expect(evaluateState([highRiskUnvalidated])).toBe('ASK_USER');
    });

    it('returns INSPECT_MORE when confidence is below 0.40 and there is no higher-priority trigger', () => {
        const lowConfidence: Belief = {
            id: 'lc-1',
            statement: 'Uses Redis for caching',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };

        expect(evaluateState([lowConfidence])).toBe('INSPECT_MORE');
    });

    it('returns PROCEED for safe validated beliefs', () => {
        const safe: Belief = {
            id: 'safe-1',
            statement: 'Package.json exists',
            type: 'REPO_FACT',
            confidenceScore: 0.95,
            riskLevel: 'LOW',
            evidenceIds: ['ev-1'],
            isValidated: true,
            contradictions: [],
        };

        expect(evaluateState([safe])).toBe('PROCEED');
    });

    it('preserves the priority order BLOCK > ASK_USER > INSPECT_MORE > PROCEED', () => {
        const immutable: Belief = {
            id: 'imm-1',
            statement: 'Fact',
            type: 'REPO_FACT',
            confidenceScore: 1,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: true,
            contradictions: [],
        };
        const contradicted: Belief = {
            id: 'cont-1',
            statement: 'Wrong',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.1,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: ['imm-1'],
        };
        const highRiskUnvalidated: Belief = {
            id: 'hr-2',
            statement: 'Need confirmation',
            type: 'TASK_BELIEF',
            confidenceScore: 0.3,
            riskLevel: 'HIGH',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        const lowConfidence: Belief = {
            id: 'lc-2',
            statement: 'Maybe something',
            type: 'TASK_BELIEF',
            confidenceScore: 0.2,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };

        expect(evaluateState([immutable, contradicted, highRiskUnvalidated, lowConfidence])).toBe('BLOCK');
        expect(evaluateState([highRiskUnvalidated, lowConfidence])).toBe('ASK_USER');
        expect(evaluateState([lowConfidence])).toBe('INSPECT_MORE');
        expect(evaluateState([safeBelief()])).toBe('PROCEED');
    });
});

describe('Preservation: SessionStore Synchronous Writes', () => {
    it('returns the same singleton instance across reads', () => {
        expect(SessionStore.getInstance()).toBe(SessionStore.getInstance());
    });

    it('setBelief then getBelief returns the same belief immediately', () => {
        fc.assert(
            fc.property(beliefArb, (belief) => {
                const store = SessionStore.getInstance();
                store.clear();

                store.setBelief(belief);
                const retrieved = store.getBelief(belief.id);

                return (
                    retrieved !== undefined &&
                    retrieved.id === belief.id &&
                    retrieved.statement === belief.statement &&
                    retrieved.type === belief.type
                );
            }),
            { numRuns: 50 }
        );
    });

    it('getAllBeliefs returns all unique beliefs that were stored', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(beliefArb, {
                    selector: (belief) => belief.id,
                    maxLength: 8,
                }),
                (beliefs) => {
                    const store = SessionStore.getInstance();
                    store.clear();

                    for (const belief of beliefs) {
                        store.setBelief(belief);
                    }

                    const all = store.getAllBeliefs();
                    return (
                        all.length === beliefs.length &&
                        beliefs.every((belief) =>
                            all.some((stored) => stored.id === belief.id)
                        )
                    );
                }
            ),
            { numRuns: 30 }
        );
    });

    it('exports and hydrates a serializable graph snapshot', () => {
        const store = SessionStore.getInstance();
        store.clear();

        const belief = safeBelief();
        const evidence = {
            id: 'evidence-1',
            sourceType: 'FILE' as const,
            uri: 'src/example.ts',
            snippet: 'export const safe = true;',
            weight: 0.8,
        };

        store.setBelief(belief);
        store.setEvidence(evidence);
        store.addEdge({
            fromId: belief.id,
            toId: evidence.id,
            relation: 'SUPPORTED_BY',
        });

        const snapshot = store.toSnapshot();

        store.clear();
        expect(store.beliefCount).toBe(0);

        store.hydrate(snapshot);
        expect(store.getBelief(belief.id)).toEqual(belief);
        expect(store.getEvidence(evidence.id)).toEqual(evidence);
        expect(store.getAllEdges()).toEqual([
            {
                fromId: belief.id,
                toId: evidence.id,
                relation: 'SUPPORTED_BY',
            },
        ]);
    });
});

describe('Preservation: Empty Patch Handling', () => {
    it('parseUnifiedDiff returns an empty array for empty input', () => {
        expect(parseUnifiedDiff('')).toEqual([]);
    });

    it('parseUnifiedDiff returns an empty array for whitespace-only input', () => {
        expect(parseUnifiedDiff('   \n  \n  ')).toEqual([]);
    });
});

describe('Preservation: Unified Diff Parsing', () => {
    it('parses a single-file diff into one change', () => {
        const singleFileDiff = `--- a/src/types.ts
+++ b/src/types.ts
@@ -1,3 +1,4 @@
 export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
+export type NewType = string;
 export type GateDecision = 'PROCEED';
 export type SourceType = 'FILE';`;

        const changes = parseUnifiedDiff(singleFileDiff);
        expect(changes).toHaveLength(1);
        expect(changes[0].newPath).toContain('src/types.ts');
    });

    it('keeps multiple file sections separate', () => {
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

        const changes = parseUnifiedDiff(multiFileDiff);
        expect(changes).toHaveLength(2);
        expect(changes.map((change) => change.newPath)).toEqual([
            'src/a.ts',
            'src/b.ts',
        ]);
    });
});

describe('Preservation: PatchValidator Constraint Detection', () => {
    it('flags diffs that touch a constrained file', () => {
        const constraintBelief: Belief = {
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

        const result = validateGeneratedPatch(diffTouchingSchema, [constraintBelief]);
        expect(result.isValid).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].id).toBe('uc-1');
        expect(result.diffPatch).toBe(diffTouchingSchema);
    });

    it('ignores non-constraint beliefs', () => {
        const nonConstraintBelief: Belief = {
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

        const result = validateGeneratedPatch(diff, [nonConstraintBelief]);
        expect(result.isValid).toBe(true);
        expect(result.violations).toEqual([]);
    });
});

describe('Preservation: Diff Normalization', () => {
    it('strips markdown fences from diff text', () => {
        const fenced = '```diff\n--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2\n```';
        const normalized = normalizeUnifiedDiffText(fenced);

        expect(normalized).not.toContain('```');
        expect(normalized).toContain('--- a/file.ts');
    });

    it('passes through raw diff text unchanged', () => {
        const raw = '--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n line1\n+line2';
        const normalized = normalizeUnifiedDiffText(raw);

        expect(normalized).toContain('--- a/file.ts');
        expect(normalized).toContain('+line2');
    });
});

function safeBelief(): Belief {
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
