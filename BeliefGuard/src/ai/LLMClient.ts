import { randomUUID } from 'crypto';
import { z } from 'zod';
import { AgentPlan, Belief } from '../types';
import { getExtractorPrompt } from '../prompts/Extractor';
import { getPatchGeneratorPrompt } from '../prompts/PatchGenerator';

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_REQUEST_TIMEOUT_MS = 60000;

// Reusable Zod schemas for structured outputs
const BeliefSchema = z.object({
    id: z.string().optional().describe("A unique UUID v4 identifier"),
    statement: z.string().describe("The specific assumption, fact, or constraint"),
    type: z.enum(['REPO_FACT', 'TASK_BELIEF', 'AGENT_ASSUMPTION', 'USER_CONSTRAINT'] as const),
    confidenceScore: z.number().min(0.0).max(1.0).describe("Confidence score between 0.0 and 1.0"),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH'] as const).describe("Blast radius if incorrect"),
    evidenceIds: z.array(z.string()).default([]),
    isValidated: z.boolean().default(false),
    contradictions: z.array(z.string()).default([])
});

const AgentPlanSchema = z.object({
    intentDescription: z.string().describe("A description of the intended execution plan"),
    targetFiles: z.array(z.string()).describe("Paths of files to be created or modified"),
    extractedBeliefs: z.array(BeliefSchema).describe("All assumptions and beliefs extracted")
});

export class LLMClient {
    private readonly apiKey: string;
    private readonly modelName: string;
    private readonly baseURL: string;
    private readonly headers: Record<string, string>;

    constructor(modelName?: string) {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        const resolvedModel =
            modelName ||
            process.env.OPENROUTER_MODEL ||
            'minimax/minimax-m2.5:free';

        if (!apiKey) {
            throw new Error(
                'OpenRouter API key is missing. Add OPENROUTER_API_KEY to your environment or BeliefGuard/.env.'
            );
        }

        this.apiKey = apiKey;
        this.modelName = resolvedModel;
        this.baseURL = process.env.OPENROUTER_BASE_URL || OPENROUTER_DEFAULT_BASE_URL;
        this.headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://antigravity.app',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'BeliefGuard',
        };

        console.log(`[BeliefGuard AI] Using OpenRouter model: ${this.modelName}`);
    }

    /**
     * Executes an operation with exponential backoff for rate limits and timeouts.
     */
    private async withRetries<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
        let attempt = 0;
        const baseDelayMs = 1000;

        while (true) {
            try {
                return await operation();
            } catch (error: any) {
                attempt++;
                const isRateLimit = error?.statusCode === 429 || error?.message?.includes('429');
                const isTimeout = error?.message?.toLowerCase().includes('timeout') || error?.code === 'ETIMEDOUT';
                const isMalformedJSON = error?.name === 'TypeValidationError' || error?.name === 'JSONParseError';

                if ((isRateLimit || isTimeout || isMalformedJSON) && attempt <= maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, attempt - 1);
                    console.warn(`[BeliefGuard AI] Encountered error (${isMalformedJSON ? 'Malformed JSON' : 'Rate Limit / Timeout'}). Retrying in ${delay}ms... (Attempt ${attempt} of ${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
    }

    /**
     * Integrates with the Language Model to parse context and extract explicit beliefs.
     */
    public async generatePlanAndBeliefs(task: string, context: string): Promise<AgentPlan> {
        const systemPrompt = getExtractorPrompt(task, context);
        const extractionPrompt = `${systemPrompt}\n\nReturn ONLY valid JSON matching this exact shape:\n${JSON.stringify({
            intentDescription: 'string',
            targetFiles: ['string'],
            extractedBeliefs: [
                {
                    id: 'uuid-v4-string',
                    statement: 'string',
                    type: 'REPO_FACT',
                    confidenceScore: 0.5,
                    riskLevel: 'LOW',
                    evidenceIds: [],
                    isValidated: false,
                    contradictions: [],
                },
            ],
        }, null, 2)}`;

        try {
            const text = await this.withRetries(
                () => this.callOpenRouter(extractionPrompt, { jsonMode: true }),
                2
            );

            return tunePlanForGate(
                sanitizeAgentPlan(AgentPlanSchema.parse(extractJsonObject(text))),
                task
            );
        } catch (error: any) {
            console.warn('[BeliefGuard AI] Structured extraction failed, trying JSON text fallback:', error);

            try {
                const text = await this.withRetries(
                    () => this.callOpenRouter(extractionPrompt, { jsonMode: false }),
                    2
                );

                const parsed = AgentPlanSchema.parse(extractJsonObject(text));
                return tunePlanForGate(sanitizeAgentPlan(parsed), task);
            } catch (fallbackError: any) {
                console.error('[BeliefGuard AI] Failed to generate plan and extract beliefs:', fallbackError);
                throw new Error(`LLM Extraction Error: ${fallbackError?.message || error?.message || 'Unknown error'}`);
            }
        }
    }

    /**
     * Once the Confidence Gate yields PROCEED, this method generates the final patch.
     */
    public async generateCodePatch(task: string, plan: AgentPlan, validatedBeliefs: Belief[]): Promise<string> {
        const systemPrompt = getPatchGeneratorPrompt(task, validatedBeliefs, plan);

        try {
            return await this.withRetries(
                () => this.callOpenRouter(systemPrompt, { jsonMode: false }),
                2
            );
        } catch (error: any) {
            console.error('[BeliefGuard AI] Failed to generate code patch:', error);
            throw new Error(`LLM Patch Generation Error: ${error?.message || 'Unknown error'}`);
        }
    }

    private async callOpenRouter(
        prompt: string,
        options: { jsonMode: boolean }
    ): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);

        try {
            const body: Record<string, unknown> = {
                model: this.modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: options.jsonMode ? 0 : 0.2,
            };

            if (options.jsonMode) {
                body.response_format = { type: 'json_object' };
            }

            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            const rawText = await response.text();
            let data: any;

            try {
                data = rawText ? JSON.parse(rawText) : undefined;
            } catch {
                data = undefined;
            }

            if (!response.ok) {
                throw createRequestError(
                    `OpenRouter request failed with status ${response.status}: ${rawText || response.statusText}`,
                    response.status
                );
            }

            const content = extractMessageContent(data);
            if (!content) {
                throw new Error(
                    `OpenRouter returned no message content for model ${this.modelName}. Raw response: ${rawText || '[empty]'}`
                );
            }

            return content;
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw createRequestError(
                    `OpenRouter request timed out after ${OPENROUTER_REQUEST_TIMEOUT_MS}ms`,
                    408
                );
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

function extractJsonObject(text: string): unknown {
    const trimmed = text.trim();

    try {
        return JSON.parse(trimmed);
    } catch {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('Model response did not contain a valid JSON object.');
        }
        return JSON.parse(match[0]);
    }
}

function extractMessageContent(responseBody: any): string {
    const content = responseBody?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
        return content.trim();
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part;
                }

                if (part?.type === 'text' && typeof part.text === 'string') {
                    return part.text;
                }

                return '';
            })
            .join('')
            .trim();
    }

    return '';
}

function createRequestError(message: string, statusCode?: number): Error & { statusCode?: number } {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    return error;
}

function sanitizeAgentPlan(plan: z.infer<typeof AgentPlanSchema>): AgentPlan {
    return {
        intentDescription: plan.intentDescription,
        targetFiles: plan.targetFiles,
        extractedBeliefs: plan.extractedBeliefs.map((belief) => sanitizeBelief(belief)),
    };
}

function sanitizeBelief(belief: z.infer<typeof BeliefSchema>): Belief {
    const confidenceScore = Math.max(0, Math.min(1, belief.confidenceScore));
    const isRepositoryFact = belief.type === 'REPO_FACT';

    return {
        id: isUuid(belief.id) ? belief.id : randomUUID(),
        statement: belief.statement,
        type: belief.type,
        confidenceScore,
        riskLevel: belief.riskLevel,
        evidenceIds: Array.isArray(belief.evidenceIds) ? belief.evidenceIds : [],
        isValidated: isRepositoryFact ? Boolean(belief.isValidated && confidenceScore >= 0.85) : false,
        contradictions: Array.isArray(belief.contradictions) ? belief.contradictions : [],
    };
}

function tunePlanForGate(plan: AgentPlan, task: string): AgentPlan {
    const tunedBeliefs = plan.extractedBeliefs.map((belief) => tuneBeliefForGate(belief));

    const assumptionIndexes = tunedBeliefs
        .map((belief, index) => ({ belief, index }))
        .filter(({ belief }) => belief.type === 'AGENT_ASSUMPTION');

    const taskLooksHighImpact =
        /auth|authori|database|schema|migration|config|environment|env|route|router|api|permission|deploy|infra|security|workspace|multi[- ]file|multiple files?/i.test(task) ||
        plan.targetFiles.length > 1;

    if (
        taskLooksHighImpact &&
        assumptionIndexes.length > 0 &&
        !assumptionIndexes.some(({ belief }) => belief.riskLevel === 'HIGH')
    ) {
        const lowestConfidence = [...assumptionIndexes].sort(
            (left, right) => left.belief.confidenceScore - right.belief.confidenceScore
        )[0];

        tunedBeliefs[lowestConfidence.index] = {
            ...lowestConfidence.belief,
            riskLevel: 'HIGH',
        };
    }

    return {
        ...plan,
        extractedBeliefs: tunedBeliefs,
    };
}

function tuneBeliefForGate(belief: Belief): Belief {
    const highImpactPattern = /auth|authori|database|schema|migration|config|environment|env|route|router|api|permission|deploy|infra|security|payment|token|session/i;

    let riskLevel = belief.riskLevel;

    if (belief.type === 'AGENT_ASSUMPTION') {
        if (highImpactPattern.test(belief.statement)) {
            riskLevel = 'HIGH';
        } else if (belief.confidenceScore < 0.75 && riskLevel === 'LOW') {
            riskLevel = 'MEDIUM';
        }
    }

    if (belief.type === 'TASK_BELIEF' && belief.confidenceScore < 0.6 && riskLevel === 'LOW') {
        riskLevel = 'MEDIUM';
    }

    return {
        ...belief,
        riskLevel,
        isValidated: belief.type === 'REPO_FACT' ? belief.isValidated : false,
    };
}

function isUuid(value: string | undefined): value is string {
    if (!value) {
        return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
