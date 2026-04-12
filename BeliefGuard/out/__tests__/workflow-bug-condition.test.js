"use strict";
/**
 * Bug Condition Exploration Tests - Agent Workflow Defects (1.7-1.10)
 *
 * These tests encode the expected workflow behavior.
 * They should fail on the current code because the agent window still lacks
 * the structured patch, iterative context expansion, per-file approval, and
 * streaming surfaces needed for the MVP workflow.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const vitest_1 = require("vitest");
const testDir = (0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url));
const repoRoot = (0, node_path_1.resolve)(testDir, '..');
function readSource(relativePath) {
    return (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(repoRoot, relativePath), 'utf8');
}
(0, vitest_1.describe)('Bug Condition: Agent Workflow Defects (1.7-1.10)', () => {
    (0, vitest_1.it)('1g: Patch generation should use a structured per-file patch protocol', () => {
        const patchGeneratorSource = readSource('prompts/PatchGenerator.ts');
        (0, vitest_1.expect)(patchGeneratorSource).toContain('*** Begin Patch');
        (0, vitest_1.expect)(patchGeneratorSource).toContain('*** Update File:');
        (0, vitest_1.expect)(patchGeneratorSource).toContain('*** Add File:');
        (0, vitest_1.expect)(patchGeneratorSource).not.toContain('raw unified diff');
    });
    (0, vitest_1.it)('1h: The orchestration layer should expose an iterative context-expansion phase', () => {
        const llmClientSource = readSource('ai/LLMClient.ts');
        const orchestratorSource = readSource('controller/MainOrchestrator.ts');
        (0, vitest_1.expect)(llmClientSource).toContain('requestContextExpansion');
        (0, vitest_1.expect)(orchestratorSource).toMatch(/context expansion|expand context|requestContextExpansion/i);
        (0, vitest_1.expect)(orchestratorSource).toMatch(/MAX_.*CONTEXT.*ITER/i);
    });
    (0, vitest_1.it)('1i: The webview contract should include per-file approval actions and payloads', () => {
        const typesSource = readSource('types.ts');
        const providerSource = readSource('webview/BeliefGuardProvider.ts');
        (0, vitest_1.expect)(typesSource).toContain('FILE_CHANGE_READY');
        (0, vitest_1.expect)(typesSource).toContain('APPROVE_FILE_CHANGE');
        (0, vitest_1.expect)(typesSource).toContain('REJECT_FILE_CHANGE');
        (0, vitest_1.expect)(providerSource).toContain('FILE_CHANGE_READY');
        (0, vitest_1.expect)(providerSource).toContain('APPROVE_FILE_CHANGE');
        (0, vitest_1.expect)(providerSource).toContain('REJECT_FILE_CHANGE');
        (0, vitest_1.expect)(providerSource).toContain('Approve File');
        (0, vitest_1.expect)(providerSource).toContain('Reject File');
    });
    (0, vitest_1.it)('1j: The agent window should surface streaming chunks during generation', () => {
        const llmClientSource = readSource('ai/LLMClient.ts');
        const providerSource = readSource('webview/BeliefGuardProvider.ts');
        const typesSource = readSource('types.ts');
        (0, vitest_1.expect)(llmClientSource).toContain('callOpenRouterStreaming');
        (0, vitest_1.expect)(providerSource).toContain('STREAMING_CHUNK');
        (0, vitest_1.expect)(typesSource).toContain('STREAMING_CHUNK');
        (0, vitest_1.expect)(providerSource).toMatch(/streaming/i);
    });
});
//# sourceMappingURL=workflow-bug-condition.test.js.map