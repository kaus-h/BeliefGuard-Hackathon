import { AgentPlan, Belief, PatchGenerationResult } from '../types';
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
    generateCodePatch(task: string, plan: AgentPlan, validatedBeliefs: Belief[]): Promise<PatchGenerationResult>;
    private callOpenRouter;
}
//# sourceMappingURL=LLMClient.d.ts.map