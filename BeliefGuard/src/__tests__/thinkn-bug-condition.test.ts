/**
 * Bug Condition Exploration Tests - thinkN SDK Defects (1.1-1.6)
 *
 * These tests encode the expected correct behavior.
 * They MUST FAIL on unfixed code - failure confirms the bugs exist.
 * After fixes are applied, these same tests should PASS.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const beliefsMock = vi.hoisted(() => {
    const instances: any[] = [];

    class MockBeliefs {
        _opts: unknown;
        reset = vi.fn().mockResolvedValue({ removed: 0 });
        before = vi.fn().mockResolvedValue({
            prompt: '',
            beliefs: [],
            goals: [],
            gaps: [],
            clarity: 0.5,
            moves: [],
        });
        add = vi.fn().mockResolvedValue({
            changes: [],
            clarity: 0.5,
            readiness: 'low',
            moves: [],
            state: {},
        });
        after = vi.fn().mockResolvedValue({
            changes: [],
            clarity: 0.5,
            readiness: 'low',
            moves: [],
            state: {},
        });
        read = vi.fn().mockResolvedValue({
            beliefs: [],
            goals: [],
            gaps: [],
            edges: [],
            contradictions: [],
            clarity: 0.5,
            moves: [],
            prompt: '',
        });

        constructor(opts: unknown) {
            this._opts = opts;
            instances.push(this);
        }
    }

    return { instances, MockBeliefs };
});

vi.mock('beliefs', () => ({
    default: beliefsMock.MockBeliefs,
    BetaAccessError: class BetaAccessError extends Error {
        signupUrl = 'https://thinkn.ai/waitlist';
        constructor(msg: string) {
            super(msg);
            this.name = 'BetaAccessError';
        }
    },
    BeliefsError: class BeliefsError extends Error {
        code: string;
        retryable: boolean;
        retryAfterMs?: number;
        constructor(msg: string, code: string, retryable: boolean, retryAfterMs?: number) {
            super(msg);
            this.name = 'BeliefsError';
            this.code = code;
            this.retryable = retryable;
            this.retryAfterMs = retryAfterMs;
        }
    },
}));

vi.mock('vscode', () => ({
    workspace: { workspaceFolders: [] },
    window: {},
    Uri: { file: (p: string) => ({ fsPath: p }) },
    EventEmitter: class { event = () => {}; fire() {} dispose() {} },
}));

describe('Bug Condition: thinkN SDK Defects (1.1-1.6)', () => {
    beforeEach(() => {
        beliefsMock.instances.length = 0;
    });

    afterEach(() => {
        delete process.env.BELIEFS_DEBUG;
        delete process.env.BELIEFS_KEY;
    });

    function getLastMockInstance() {
        return beliefsMock.instances[beliefsMock.instances.length - 1];
    }

    it('1a: createClient() should pass writeScope: "thread" to Beliefs constructor', async () => {
        process.env.BELIEFS_KEY = 'bel_live_test';
        vi.resetModules();

        const { BeliefStateManager } = await import('../beliefs/ThinkNClient');
        const manager = new BeliefStateManager();
        manager.beginTask('test-thread-id');

        const lastInstance = getLastMockInstance();
        expect(lastInstance).toBeTruthy();
        expect(lastInstance._opts).toMatchObject({
            apiKey: 'bel_live_test',
            thread: 'test-thread-id',
        });
        expect(lastInstance._opts).toHaveProperty('writeScope', 'thread');
    });

    it('1b: createClient() with BELIEFS_DEBUG=true should pass debug: true', async () => {
        const originalEnv = process.env.BELIEFS_DEBUG;
        process.env.BELIEFS_DEBUG = 'true';
        process.env.BELIEFS_KEY = 'bel_live_test';

        try {
            vi.resetModules();

            const { BeliefStateManager } = await import('../beliefs/ThinkNClient');
            const manager = new BeliefStateManager();
            manager.beginTask('test-thread-debug');

            const lastInstance = getLastMockInstance();
            expect(lastInstance).toBeTruthy();
            expect(lastInstance._opts).toHaveProperty('debug', true);
        } finally {
            if (originalEnv === undefined) {
                delete process.env.BELIEFS_DEBUG;
            } else {
                process.env.BELIEFS_DEBUG = originalEnv;
            }
        }
    });

    it('1c: wrapThinkNError() should preserve BeliefsError structured properties', async () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');

        expect(source).toContain('BetaAccessError');
        expect(source).toContain('BeliefsError');
        expect(source).toMatch(/instanceof BetaAccessError/);
        expect(source).toMatch(/instanceof BeliefsError/);
    });

    it('1d: REMOTE_CALL_TIMEOUT_MS should be >= 120000', () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');

        const timeoutMatch = source.match(/REMOTE_CALL_TIMEOUT_MS\s*=\s*(\d+)/);
        expect(timeoutMatch).not.toBeNull();

        const timeoutValue = parseInt(timeoutMatch![1], 10);
        expect(timeoutValue).toBeGreaterThanOrEqual(120000);
    });

    it('1e: ThinkNClient.ts should NOT contain stale graceful-degradation comments', () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');

        expect(source).not.toMatch(/fire-and-forget/i);
        expect(source).not.toMatch(/graceful(?:ly)?\s+degrad/i);
        expect(source).not.toMatch(/local-only\s+operation/i);
    });

    it('1f: syncAddBelief() should pass only documented SDK options to add()', async () => {
        process.env.BELIEFS_KEY = 'bel_live_test';
        vi.resetModules();

        const { BeliefStateManager } = await import('../beliefs/ThinkNClient');
        const manager = new BeliefStateManager();
        manager.beginTask('test-thread-add');

        const testBelief = {
            id: 'test-belief-1',
            statement: 'Test framework uses vitest',
            type: 'AGENT_ASSUMPTION' as const,
            confidenceScore: 0.7,
            riskLevel: 'LOW' as const,
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };

        try {
            await manager.addBelief(testBelief);
        } catch {
            // The current source may still fail earlier in the thinkN path;
            // the test only cares about the add() payload if it reaches the mock.
        }

        const instance = getLastMockInstance();
        expect(instance).toBeTruthy();
        expect(instance.add.mock.calls.length).toBeGreaterThan(0);

        const addCall = instance.add.mock.calls[0];
        const options = addCall[1];

        expect(options).toHaveProperty('confidence');
        expect(options).toHaveProperty('type');
        expect(options).toHaveProperty('source');
        expect(options).toHaveProperty('evidence');

        const validKeys = new Set(['confidence', 'type', 'source', 'evidence', 'supersedes']);
        for (const key of Object.keys(options)) {
            expect(validKeys.has(key)).toBe(true);
        }
    });
});
