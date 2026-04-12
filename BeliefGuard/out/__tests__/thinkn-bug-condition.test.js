"use strict";
/**
 * Bug Condition Exploration Tests - thinkN SDK Defects (1.1-1.6)
 *
 * These tests encode the expected correct behavior.
 * They MUST FAIL on unfixed code - failure confirms the bugs exist.
 * After fixes are applied, these same tests should PASS.
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const beliefsMock = vitest_1.vi.hoisted(() => {
    const instances = [];
    class MockBeliefs {
        _opts;
        reset = vitest_1.vi.fn().mockResolvedValue({ removed: 0 });
        before = vitest_1.vi.fn().mockResolvedValue({
            prompt: '',
            beliefs: [],
            goals: [],
            gaps: [],
            clarity: 0.5,
            moves: [],
        });
        add = vitest_1.vi.fn().mockResolvedValue({
            changes: [],
            clarity: 0.5,
            readiness: 'low',
            moves: [],
            state: {},
        });
        after = vitest_1.vi.fn().mockResolvedValue({
            changes: [],
            clarity: 0.5,
            readiness: 'low',
            moves: [],
            state: {},
        });
        read = vitest_1.vi.fn().mockResolvedValue({
            beliefs: [],
            goals: [],
            gaps: [],
            edges: [],
            contradictions: [],
            clarity: 0.5,
            moves: [],
            prompt: '',
        });
        constructor(opts) {
            this._opts = opts;
            instances.push(this);
        }
    }
    return { instances, MockBeliefs };
});
vitest_1.vi.mock('beliefs', () => ({
    default: beliefsMock.MockBeliefs,
    BetaAccessError: class BetaAccessError extends Error {
        signupUrl = 'https://thinkn.ai/waitlist';
        constructor(msg) {
            super(msg);
            this.name = 'BetaAccessError';
        }
    },
    BeliefsError: class BeliefsError extends Error {
        code;
        retryable;
        retryAfterMs;
        constructor(msg, code, retryable, retryAfterMs) {
            super(msg);
            this.name = 'BeliefsError';
            this.code = code;
            this.retryable = retryable;
            this.retryAfterMs = retryAfterMs;
        }
    },
}));
vitest_1.vi.mock('vscode', () => ({
    workspace: { workspaceFolders: [] },
    window: {},
    Uri: { file: (p) => ({ fsPath: p }) },
    EventEmitter: class {
        event = () => { };
        fire() { }
        dispose() { }
    },
}));
(0, vitest_1.describe)('Bug Condition: thinkN SDK Defects (1.1-1.6)', () => {
    (0, vitest_1.beforeEach)(() => {
        beliefsMock.instances.length = 0;
    });
    (0, vitest_1.afterEach)(() => {
        delete process.env.BELIEFS_DEBUG;
        delete process.env.BELIEFS_KEY;
    });
    function getLastMockInstance() {
        return beliefsMock.instances[beliefsMock.instances.length - 1];
    }
    (0, vitest_1.it)('1a: createClient() should pass writeScope: "thread" to Beliefs constructor', async () => {
        process.env.BELIEFS_KEY = 'bel_live_test';
        vitest_1.vi.resetModules();
        const { BeliefStateManager } = await Promise.resolve().then(() => __importStar(require('../beliefs/ThinkNClient')));
        const manager = new BeliefStateManager();
        manager.beginTask('test-thread-id');
        const lastInstance = getLastMockInstance();
        (0, vitest_1.expect)(lastInstance).toBeTruthy();
        (0, vitest_1.expect)(lastInstance._opts).toMatchObject({
            apiKey: 'bel_live_test',
            thread: 'test-thread-id',
        });
        (0, vitest_1.expect)(lastInstance._opts).toHaveProperty('writeScope', 'thread');
    });
    (0, vitest_1.it)('1b: createClient() with BELIEFS_DEBUG=true should pass debug: true', async () => {
        const originalEnv = process.env.BELIEFS_DEBUG;
        process.env.BELIEFS_DEBUG = 'true';
        process.env.BELIEFS_KEY = 'bel_live_test';
        try {
            vitest_1.vi.resetModules();
            const { BeliefStateManager } = await Promise.resolve().then(() => __importStar(require('../beliefs/ThinkNClient')));
            const manager = new BeliefStateManager();
            manager.beginTask('test-thread-debug');
            const lastInstance = getLastMockInstance();
            (0, vitest_1.expect)(lastInstance).toBeTruthy();
            (0, vitest_1.expect)(lastInstance._opts).toHaveProperty('debug', true);
        }
        finally {
            if (originalEnv === undefined) {
                delete process.env.BELIEFS_DEBUG;
            }
            else {
                process.env.BELIEFS_DEBUG = originalEnv;
            }
        }
    });
    (0, vitest_1.it)('1c: wrapThinkNError() should preserve BeliefsError structured properties', async () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');
        (0, vitest_1.expect)(source).toContain('BetaAccessError');
        (0, vitest_1.expect)(source).toContain('BeliefsError');
        (0, vitest_1.expect)(source).toMatch(/instanceof BetaAccessError/);
        (0, vitest_1.expect)(source).toMatch(/instanceof BeliefsError/);
    });
    (0, vitest_1.it)('1d: REMOTE_CALL_TIMEOUT_MS should be >= 120000', () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');
        const timeoutMatch = source.match(/REMOTE_CALL_TIMEOUT_MS\s*=\s*(\d+)/);
        (0, vitest_1.expect)(timeoutMatch).not.toBeNull();
        const timeoutValue = parseInt(timeoutMatch[1], 10);
        (0, vitest_1.expect)(timeoutValue).toBeGreaterThanOrEqual(120000);
    });
    (0, vitest_1.it)('1e: ThinkNClient.ts should NOT contain stale graceful-degradation comments', () => {
        const sourcePath = path.resolve(__dirname, '../beliefs/ThinkNClient.ts');
        const source = fs.readFileSync(sourcePath, 'utf8');
        (0, vitest_1.expect)(source).not.toMatch(/fire-and-forget/i);
        (0, vitest_1.expect)(source).not.toMatch(/graceful(?:ly)?\s+degrad/i);
        (0, vitest_1.expect)(source).not.toMatch(/local-only\s+operation/i);
    });
    (0, vitest_1.it)('1f: syncAddBelief() should pass only documented SDK options to add()', async () => {
        process.env.BELIEFS_KEY = 'bel_live_test';
        vitest_1.vi.resetModules();
        const { BeliefStateManager } = await Promise.resolve().then(() => __importStar(require('../beliefs/ThinkNClient')));
        const manager = new BeliefStateManager();
        manager.beginTask('test-thread-add');
        const testBelief = {
            id: 'test-belief-1',
            statement: 'Test framework uses vitest',
            type: 'AGENT_ASSUMPTION',
            confidenceScore: 0.7,
            riskLevel: 'LOW',
            evidenceIds: [],
            isValidated: false,
            contradictions: [],
        };
        try {
            await manager.addBelief(testBelief);
        }
        catch {
            // The current source may still fail earlier in the thinkN path;
            // the test only cares about the add() payload if it reaches the mock.
        }
        const instance = getLastMockInstance();
        (0, vitest_1.expect)(instance).toBeTruthy();
        (0, vitest_1.expect)(instance.add.mock.calls.length).toBeGreaterThan(0);
        const addCall = instance.add.mock.calls[0];
        const options = addCall[1];
        (0, vitest_1.expect)(options).toHaveProperty('confidence');
        (0, vitest_1.expect)(options).toHaveProperty('type');
        (0, vitest_1.expect)(options).toHaveProperty('source');
        (0, vitest_1.expect)(options).toHaveProperty('evidence');
        const validKeys = new Set(['confidence', 'type', 'source', 'evidence', 'supersedes']);
        for (const key of Object.keys(options)) {
            (0, vitest_1.expect)(validKeys.has(key)).toBe(true);
        }
    });
});
//# sourceMappingURL=thinkn-bug-condition.test.js.map