"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const Extractor_1 = require("../prompts/Extractor");
const PatchGenerator_1 = require("../prompts/PatchGenerator");
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_REQUEST_TIMEOUT_MS = 180000;
// Reusable Zod schemas for structured outputs
const BeliefSchema = zod_1.z.object({
    id: zod_1.z.string().optional().describe("A unique UUID v4 identifier"),
    statement: zod_1.z.string().describe("The specific assumption, fact, or constraint"),
    type: zod_1.z.enum(['REPO_FACT', 'TASK_BELIEF', 'AGENT_ASSUMPTION', 'USER_CONSTRAINT']),
    confidenceScore: zod_1.z.number().min(0.0).max(1.0).describe("Confidence score between 0.0 and 1.0"),
    riskLevel: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']).describe("Blast radius if incorrect"),
    evidenceIds: zod_1.z.array(zod_1.z.string()).default([]),
    isValidated: zod_1.z.boolean().default(false),
    contradictions: zod_1.z.array(zod_1.z.string()).default([])
});
const AgentPlanSchema = zod_1.z.object({
    intentDescription: zod_1.z.string().describe("A description of the intended execution plan"),
    targetFiles: zod_1.z.array(zod_1.z.string()).describe("Paths of files to be created or modified"),
    extractedBeliefs: zod_1.z.array(BeliefSchema).describe("All assumptions and beliefs extracted")
});
const StructuredPatchEntrySchema = zod_1.z.object({
    path: zod_1.z.string().optional().default(''),
    status: zod_1.z.enum(['ADDED', 'MODIFIED', 'DELETED']).optional().default('MODIFIED'),
    patch: zod_1.z.string().optional().default(''),
    summary: zod_1.z.string().optional().default(''),
    additions: zod_1.z.number().int().nonnegative().optional(),
    deletions: zod_1.z.number().int().nonnegative().optional(),
    oldPath: zod_1.z.string().optional(),
    newPath: zod_1.z.string().optional(),
}).passthrough();
const PatchGenerationResultSchema = zod_1.z.object({
    assistantMessage: zod_1.z.string().min(1).describe('A concise user-facing explanation for the chat UI'),
    diffPatch: zod_1.z.string().default('').describe('A structured patch envelope containing only repository file edits, or an empty string when no actionable patch should be produced'),
    structuredPatch: zod_1.z.array(StructuredPatchEntrySchema).default([]).describe('A structured per-file patch description that can be serialized into the patch envelope')
}).passthrough();
const ContextExpansionResultSchema = zod_1.z.object({
    assistantMessage: zod_1.z.string().min(1).describe('A concise user-facing explanation of what additional context is needed'),
    requestedFiles: zod_1.z.array(zod_1.z.string()).default([]).describe('Workspace-relative file paths that should be inspected next'),
    rationale: zod_1.z.string().default('').describe('Why the additional context would help'),
}).passthrough();
class LLMClient {
    apiKey;
    modelName;
    baseURL;
    headers;
    constructor(modelName) {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        const resolvedModel = modelName ||
            process.env.OPENROUTER_MODEL ||
            'minimax/minimax-m2.5:free';
        if (!apiKey) {
            throw new Error('OpenRouter API key is missing. Add OPENROUTER_API_KEY to your environment or BeliefGuard/.env.');
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
    async withRetries(operation, maxRetries = 3) {
        let attempt = 0;
        const baseDelayMs = 1000;
        while (true) {
            try {
                return await operation();
            }
            catch (error) {
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
    async generatePlanAndBeliefs(task, context) {
        const systemPrompt = (0, Extractor_1.getExtractorPrompt)(task, context);
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
            const text = await this.withRetries(() => this.callOpenRouter(extractionPrompt, { jsonMode: true }), 2);
            return tunePlanForGate(sanitizeAgentPlan(AgentPlanSchema.parse(extractJsonObject(text))), task);
        }
        catch (error) {
            console.warn('[BeliefGuard AI] Structured extraction failed, trying JSON text fallback:', error);
            try {
                const text = await this.withRetries(() => this.callOpenRouter(extractionPrompt, { jsonMode: false }), 2);
                const parsed = AgentPlanSchema.parse(extractJsonObject(text));
                return tunePlanForGate(sanitizeAgentPlan(parsed), task);
            }
            catch (fallbackError) {
                console.error('[BeliefGuard AI] Failed to generate plan and extract beliefs:', fallbackError);
                throw new Error(`LLM Extraction Error: ${fallbackError?.message || error?.message || 'Unknown error'}`);
            }
        }
    }
    /**
     * Once the Confidence Gate yields PROCEED, this method generates the final patch.
     */
    async requestContextExpansion(task, currentContext, validatedBeliefs = [], plan, callbacks = {}) {
        const beliefsContext = validatedBeliefs.map((belief) => `- [${belief.type}] ${belief.statement} (Validated: ${belief.isValidated}, Risk: ${belief.riskLevel}, Confidence: ${belief.confidenceScore.toFixed(2)})`).join('\n');
        const prompt = `You are helping BeliefGuard safely expand repository context before code changes are generated.

Return ONLY valid JSON matching this shape:
{
  "assistantMessage": "brief explanation of what additional context is needed",
  "requestedFiles": ["workspace/relative/path.ts"],
  "rationale": "why these files or areas matter"
}

Rules:
- Request only read-only context.
- Do not propose code changes.
- Prefer the smallest set of files or folders that would remove uncertainty.
- If no additional context is needed, return an empty requestedFiles array and explain why.

### CURRENT TASK
${task}

### CURRENT CONTEXT
${currentContext}

### VALIDATED BELIEFS
${beliefsContext || '(none)'}

### CURRENT PLAN
${plan ? `${plan.intentDescription}\nTarget files: ${plan.targetFiles.join(', ')}` : '(none)'}

Respond with the JSON object now.`;
        try {
            const text = await this.withRetries(() => this.callOpenRouterStreaming(prompt, { jsonMode: true, onChunk: callbacks.onChunk }), 2);
            return sanitizeContextExpansionResult(ContextExpansionResultSchema.parse(extractJsonObject(text)));
        }
        catch (error) {
            console.warn('[BeliefGuard AI] Streaming context expansion failed, trying non-streaming fallback:', error);
            try {
                const text = await this.withRetries(() => this.callOpenRouter(prompt, { jsonMode: true }), 2);
                return sanitizeContextExpansionResult(ContextExpansionResultSchema.parse(extractJsonObject(text)));
            }
            catch (fallbackError) {
                console.error('[BeliefGuard AI] Failed to request context expansion:', fallbackError);
                throw new Error(`LLM Context Expansion Error: ${fallbackError?.message || error?.message || 'Unknown error'}`);
            }
        }
    }
    async generateCodePatch(task, plan, validatedBeliefs, repositoryContext = '', callbacks = {}) {
        const systemPrompt = (0, PatchGenerator_1.getPatchGeneratorPrompt)(task, validatedBeliefs, plan, repositoryContext);
        const patchPrompt = `${systemPrompt}\n\nAdditional output contract:\n- Include a \"structuredPatch\" field when you can identify per-file edits.\n- Keep \"diffPatch\" populated with the structured patch envelope so older consumers continue to work.\n- If no actionable patch is available, set diffPatch to an empty string and structuredPatch to an empty array.\n`;
        try {
            const text = await this.withRetries(
            // Do NOT pass onChunk here — JSON-mode streaming produces raw JSON
            // fragments that are unreadable in the UI. The parsed result is
            // displayed after extraction instead.
            () => this.callOpenRouterStreaming(patchPrompt, { jsonMode: true }), 2);
            const result = sanitizePatchGenerationResult(PatchGenerationResultSchema.parse(extractJsonObject(text)));
            callbacks.onParsed?.(result);
            return result;
        }
        catch (error) {
            console.warn('[BeliefGuard AI] Streaming structured patch generation failed, trying fallback:', error);
            try {
                const text = await this.withRetries(() => this.callOpenRouter(patchPrompt, { jsonMode: false }), 2);
                const result = sanitizePatchGenerationResult(PatchGenerationResultSchema.parse(extractJsonObject(text)));
                callbacks.onParsed?.(result);
                return result;
            }
            catch (fallbackError) {
                console.error('[BeliefGuard AI] Failed to generate code patch:', fallbackError);
                throw new Error(`LLM Patch Generation Error: ${fallbackError?.message || error?.message || 'Unknown error'}`);
            }
        }
    }
    async callOpenRouter(prompt, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
        try {
            const body = {
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
            let data;
            try {
                data = rawText ? JSON.parse(rawText) : undefined;
            }
            catch {
                data = undefined;
            }
            if (!response.ok) {
                throw createRequestError(`OpenRouter request failed with status ${response.status}: ${rawText || response.statusText}`, response.status);
            }
            const content = extractMessageContent(data);
            if (!content) {
                throw new Error(`OpenRouter returned no message content for model ${this.modelName}. Raw response: ${rawText || '[empty]'}`);
            }
            return content;
        }
        catch (error) {
            if (error?.name === 'AbortError') {
                throw createRequestError(`OpenRouter request timed out after ${OPENROUTER_REQUEST_TIMEOUT_MS}ms`, 408);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async callOpenRouterStreaming(prompt, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
        const body = {
            model: this.modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: options.jsonMode ? 0 : 0.2,
            stream: true,
        };
        if (options.jsonMode) {
            body.response_format = { type: 'json_object' };
        }
        try {
            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!response.ok) {
                const rawText = await response.text();
                throw createRequestError(`OpenRouter request failed with status ${response.status}: ${rawText || response.statusText}`, response.status);
            }
            if (!response.body) {
                const rawText = await response.text();
                return extractContentFromRawResponse(rawText);
            }
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream')) {
                const rawText = await response.text();
                return extractContentFromRawResponse(rawText);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let assembledContent = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                assembledContent += this.consumeOpenRouterStreamBuffer(buffer, options.onChunk, (remaining) => {
                    buffer = remaining;
                });
            }
            const tail = decoder.decode();
            if (tail) {
                buffer += tail;
                assembledContent += this.consumeOpenRouterStreamBuffer(buffer, options.onChunk, (remaining) => {
                    buffer = remaining;
                });
            }
            if (buffer.trim()) {
                assembledContent += this.consumeOpenRouterStreamBuffer(`${buffer}\n`, options.onChunk, (remaining) => {
                    buffer = remaining;
                });
            }
            if (!assembledContent.trim()) {
                return extractContentFromRawResponse(buffer);
            }
            return assembledContent;
        }
        catch (error) {
            if (error?.name === 'AbortError') {
                throw createRequestError(`OpenRouter request timed out after ${OPENROUTER_REQUEST_TIMEOUT_MS}ms`, 408);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    consumeOpenRouterStreamBuffer(buffer, onChunk, updateRemaining) {
        const lines = buffer.split(/\r?\n/);
        const remaining = lines.pop() ?? '';
        updateRemaining(remaining);
        let assembledContent = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) {
                continue;
            }
            const payload = trimmed.slice('data:'.length).trim();
            if (!payload || payload === '[DONE]') {
                continue;
            }
            try {
                const parsed = JSON.parse(payload);
                const chunk = extractMessageContent(parsed, true);
                if (chunk) {
                    assembledContent += chunk;
                    onChunk?.(chunk);
                }
            }
            catch {
                // Failed to parse SSE payload as JSON — accumulate silently.
                // Do NOT forward raw SSE payloads to onChunk (causes garbled UI output).
                assembledContent += payload;
            }
        }
        return assembledContent;
    }
}
exports.LLMClient = LLMClient;
function extractJsonObject(text) {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('Model response did not contain a valid JSON object.');
        }
        return JSON.parse(match[0]);
    }
}
function extractMessageContent(responseBody, preserveWhitespace = false) {
    const choice = responseBody?.choices?.[0];
    const content = choice?.message?.content ?? choice?.delta?.content;
    if (typeof content === 'string') {
        return preserveWhitespace ? content : content.trim();
    }
    if (Array.isArray(content)) {
        const joined = content
            .map((part) => {
            if (typeof part === 'string') {
                return part;
            }
            if (part?.type === 'text' && typeof part.text === 'string') {
                return part.text;
            }
            return '';
        })
            .join('');
        return preserveWhitespace ? joined : joined.trim();
    }
    return '';
}
function createRequestError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}
function sanitizeAgentPlan(plan) {
    return {
        intentDescription: plan.intentDescription,
        targetFiles: plan.targetFiles,
        extractedBeliefs: plan.extractedBeliefs.map((belief) => sanitizeBelief(belief)),
    };
}
function sanitizeBelief(belief) {
    const confidenceScore = Math.max(0, Math.min(1, belief.confidenceScore));
    const isRepositoryFact = belief.type === 'REPO_FACT';
    return {
        id: isUuid(belief.id) ? belief.id : (0, crypto_1.randomUUID)(),
        statement: belief.statement,
        type: belief.type,
        confidenceScore,
        riskLevel: belief.riskLevel,
        evidenceIds: Array.isArray(belief.evidenceIds) ? belief.evidenceIds : [],
        isValidated: isRepositoryFact ? Boolean(belief.isValidated && confidenceScore >= 0.85) : false,
        contradictions: Array.isArray(belief.contradictions) ? belief.contradictions : [],
    };
}
function sanitizePatchGenerationResult(result) {
    return {
        assistantMessage: result.assistantMessage.trim(),
        diffPatch: result.diffPatch.trim(),
        structuredPatch: result.structuredPatch.map((entry) => sanitizeStructuredPatchEntry(entry)),
    };
}
function sanitizeStructuredPatchEntry(entry) {
    const path = firstNonEmptyString([entry.path, entry.newPath, entry.oldPath]);
    return {
        ...entry,
        path,
        status: entry.status,
        patch: entry.patch.trim(),
        summary: entry.summary.trim(),
        additions: typeof entry.additions === 'number' ? entry.additions : undefined,
        deletions: typeof entry.deletions === 'number' ? entry.deletions : undefined,
    };
}
function sanitizeContextExpansionResult(result) {
    return {
        assistantMessage: result.assistantMessage.trim(),
        requestedFiles: result.requestedFiles.map((file) => file.trim()).filter(Boolean),
        rationale: result.rationale.trim(),
    };
}
function firstNonEmptyString(values) {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return '';
}
function extractContentFromRawResponse(rawText) {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return '';
    }
    try {
        const parsed = JSON.parse(trimmed);
        const content = extractMessageContent(parsed);
        if (content) {
            return content;
        }
    }
    catch {
        // Fall through to returning the raw text below.
    }
    return trimmed;
}
function tunePlanForGate(plan, task) {
    const tunedBeliefs = plan.extractedBeliefs.map((belief) => tuneBeliefForGate(belief));
    const assumptionIndexes = tunedBeliefs
        .map((belief, index) => ({ belief, index }))
        .filter(({ belief }) => belief.type === 'AGENT_ASSUMPTION');
    const taskLooksHighImpact = /auth|authori|database|schema|migration|config|environment|env|route|router|api|permission|deploy|infra|security|workspace|multi[- ]file|multiple files?/i.test(task) ||
        plan.targetFiles.length > 1;
    if (taskLooksHighImpact &&
        assumptionIndexes.length > 0 &&
        !assumptionIndexes.some(({ belief }) => belief.riskLevel === 'HIGH')) {
        const lowestConfidence = [...assumptionIndexes].sort((left, right) => left.belief.confidenceScore - right.belief.confidenceScore)[0];
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
function tuneBeliefForGate(belief) {
    const highImpactPattern = /auth|authori|database|schema|migration|config|environment|env|route|router|api|permission|deploy|infra|security|payment|token|session/i;
    let riskLevel = belief.riskLevel;
    if (belief.type === 'AGENT_ASSUMPTION') {
        if (highImpactPattern.test(belief.statement)) {
            riskLevel = 'HIGH';
        }
        else if (belief.confidenceScore < 0.75 && riskLevel === 'LOW') {
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
function isUuid(value) {
    if (!value) {
        return false;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
//# sourceMappingURL=LLMClient.js.map