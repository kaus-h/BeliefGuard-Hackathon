import { AgentPlan, Belief, PatchGenerationResult } from '../types';
type OpenRouterChunkHandler = (chunk: string) => void;
interface OpenRouterRequestOptions {
    jsonMode: boolean;
    onChunk?: OpenRouterChunkHandler;
}
interface ContextExpansionResult {
    assistantMessage: string;
    requestedFiles: string[];
    rationale: string;
}
interface StructuredPatchEntry {
    path: string;
    status: 'ADDED' | 'MODIFIED' | 'DELETED';
    patch: string;
    summary?: string;
    additions?: number;
    deletions?: number;
    oldPath?: string;
    newPath?: string;
    [key: string]: unknown;
}
interface PatchGenerationResultWithStructuredPatch extends PatchGenerationResult {
    structuredPatch: StructuredPatchEntry[];
}
export declare class LLMClient {
    private readonly apiKey;
    private readonly modelName;
    private readonly baseURL;
    private readonly headers;
    constructor(modelName?: string);
    /**
     * Executes an operation with exponential backoff for rate limits and timeouts.
     */
    private withRetries;
    /**
     * Integrates with the Language Model to parse context and extract explicit beliefs.
     */
    generatePlanAndBeliefs(task: string, context: string): Promise<AgentPlan>;
    /**
     * Once the Confidence Gate yields PROCEED, this method generates the final patch.
     */
    requestContextExpansion(task: string, currentContext: string, validatedBeliefs?: Belief[], plan?: AgentPlan, callbacks?: {
        onChunk?: OpenRouterChunkHandler;
    }): Promise<ContextExpansionResult>;
    generateCodePatch(task: string, plan: AgentPlan, validatedBeliefs: Belief[], repositoryContext?: string, callbacks?: {
        onChunk?: OpenRouterChunkHandler;
        onParsed?: (result: PatchGenerationResultWithStructuredPatch) => void;
    }): Promise<PatchGenerationResultWithStructuredPatch>;
    private callOpenRouter;
    callOpenRouterStreaming(prompt: string, options: OpenRouterRequestOptions): Promise<string>;
    private consumeOpenRouterStreamBuffer;
}
export {};
//# sourceMappingURL=LLMClient.d.ts.map