/**
 * Bug Condition Exploration Tests - Agent Workflow Defects (1.7-1.10)
 *
 * These tests encode the expected workflow behavior.
 * They should fail on the current code because the agent window still lacks
 * the structured patch, iterative context expansion, per-file approval, and
 * streaming surfaces needed for the MVP workflow.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..');

function readSource(relativePath: string): string {
    return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('Bug Condition: Agent Workflow Defects (1.7-1.10)', () => {
    it('1g: Patch generation should use a structured per-file patch protocol', () => {
        const patchGeneratorSource = readSource('prompts/PatchGenerator.ts');

        expect(patchGeneratorSource).toContain('*** Begin Patch');
        expect(patchGeneratorSource).toContain('*** Update File:');
        expect(patchGeneratorSource).toContain('*** Add File:');
        expect(patchGeneratorSource).not.toContain('raw unified diff');
    });

    it('1h: The orchestration layer should expose an iterative context-expansion phase', () => {
        const llmClientSource = readSource('ai/LLMClient.ts');
        const orchestratorSource = readSource('controller/MainOrchestrator.ts');

        expect(llmClientSource).toContain('requestContextExpansion');
        expect(orchestratorSource).toMatch(/context expansion|expand context|requestContextExpansion/i);
        expect(orchestratorSource).toMatch(/MAX_.*CONTEXT.*ITER/i);
    });

    it('1i: The webview contract should include per-file approval actions and payloads', () => {
        const typesSource = readSource('types.ts');
        const providerSource = readSource('webview/BeliefGuardProvider.ts');

        expect(typesSource).toContain('FILE_CHANGE_READY');
        expect(typesSource).toContain('APPROVE_FILE_CHANGE');
        expect(typesSource).toContain('REJECT_FILE_CHANGE');
        expect(providerSource).toContain('FILE_CHANGE_READY');
        expect(providerSource).toContain('APPROVE_FILE_CHANGE');
        expect(providerSource).toContain('REJECT_FILE_CHANGE');
        expect(providerSource).toContain('Approve File');
        expect(providerSource).toContain('Reject File');
    });

    it('1j: The agent window should surface streaming chunks during generation', () => {
        const llmClientSource = readSource('ai/LLMClient.ts');
        const providerSource = readSource('webview/BeliefGuardProvider.ts');
        const typesSource = readSource('types.ts');

        expect(llmClientSource).toContain('callOpenRouterStreaming');
        expect(providerSource).toContain('STREAMING_CHUNK');
        expect(typesSource).toContain('STREAMING_CHUNK');
        expect(providerSource).toMatch(/streaming/i);
    });
});
