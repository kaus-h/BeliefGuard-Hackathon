"use strict";
// ──────────────────────────────────────────────────────────────────────
// BeliefGuard — Main Orchestrator
// The operational brain of the extension. Wires all sub-systems from
// Agents 1-4 into a cohesive, asynchronous execution pipeline governed
// by the Confidence-to-Action Gate policy engine.
//
// Full 11-step pipeline (spec §Agent 5, lines 274-285):
//  1.  Context collection
//  2.  LLM plan + belief extraction
//  3.  Push beliefs → thinkN state
//  4.  Evidence grounding
//  5.  Gate evaluation
//  6.  If ASK_USER → dispatch questions to Webview, suspend
//  7.  On user reply → push USER_CONSTRAINT beliefs into thinkN
//  8.  Loop back to step 5
//  9.  On PROCEED → LLM patch generation
// 10.  Post-patch validation
// 11.  If valid → dispatch diff to Webview/VS Code Diff API
// ──────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.MainOrchestrator = void 0;
const uuid_1 = require("uuid");
// ── Agent 2: Context & Evidence ─────────────────────────────────────
const WorkspaceScanner_1 = require("../context/WorkspaceScanner");
const EvidenceLocator_1 = require("../context/EvidenceLocator");
// ── Agent 3: Belief State Manager ───────────────────────────────────
const ThinkNClient_1 = require("../beliefs/ThinkNClient");
const BeliefGraph_1 = require("../beliefs/BeliefGraph");
// ── Agent 4: LLM Orchestration ──────────────────────────────────────
const LLMClient_1 = require("../ai/LLMClient");
// ── Agent 5: Gate & Validation ──────────────────────────────────────
const ConfidenceGate_1 = require("../gate/ConfidenceGate");
const QuestionGenerator_1 = require("../gate/QuestionGenerator");
const PatchValidator_1 = require("../validation/PatchValidator");
const unifiedDiff_1 = require("../utils/unifiedDiff");
// ── Constants ───────────────────────────────────────────────────────
/** Maximum number of INSPECT_MORE re-grounding cycles before forcing ASK_USER. */
const MAX_INSPECT_CYCLES = 2;
/** Maximum number of ASK_USER → re-evaluate loops before aborting. */
const MAX_CLARIFICATION_LOOPS = 5;
/**
 * MainOrchestrator — End-to-End Pipeline Controller
 *
 * Orchestrates the full lifecycle of a guarded coding task:
 * context collection → belief extraction → evidence grounding →
 * gate evaluation → clarification loop → patch generation →
 * post-patch validation → diff delivery.
 */
class MainOrchestrator {
    provider;
    llmClient;
    beliefManager;
    constructor(provider) {
        this.provider = provider;
        this.llmClient = new LLMClient_1.LLMClient();
        this.beliefManager = new ThinkNClient_1.BeliefStateManager();
    }
    /**
     * Executes the full 11-step guarded task pipeline.
     *
     * This method is the single entry point called when the user submits
     * a task through the Webview. It is fully async and will suspend
     * at step 6 while waiting for user clarification input.
     *
     * @param userTask  The natural language task description from the user.
     */
    async runGuardedTask(userTask) {
        try {
            // Reset state for a fresh task cycle
            this.beliefManager.reset();
            this.audit('session', 'Started guarded task', userTask, 'info', {
                task: userTask,
            });
            // ── Step 1: Context Collection (Agent 2) ────────────────
            this.provider.postProcessing('Scanning workspace and collecting context…');
            const repoContext = await (0, WorkspaceScanner_1.gatherInitialContext)();
            this.audit('context', 'Workspace context collected', `Collected ${repoContext.length} characters of repository context.`, 'success');
            // Enrich the LLM context with thinkN's accumulated belief state
            // from prior sessions (via beliefs.before())
            const beliefContext = await this.beliefManager.getBeliefContext(userTask);
            const enrichedContext = beliefContext
                ? `${repoContext}\n\n--- Prior Belief Context ---\n${beliefContext}`
                : repoContext;
            // ── Step 2: LLM Plan + Belief Extraction (Agent 4) ──────
            this.provider.postProcessing('Extracting Agent Plan and Formulating Beliefs…');
            const agentPlan = await this.llmClient.generatePlanAndBeliefs(userTask, enrichedContext);
            this.audit('extraction', 'Plan and beliefs extracted', `LLM returned ${agentPlan.extractedBeliefs.length} beliefs across ${agentPlan.targetFiles.length} target files.`, 'success', {
                intentDescription: agentPlan.intentDescription,
                targetFiles: agentPlan.targetFiles,
                beliefSummary: this.summarizeBeliefs(agentPlan.extractedBeliefs),
                beliefs: agentPlan.extractedBeliefs,
            });
            // ── Step 3: Push beliefs → thinkN State (Agent 3) ───────
            this.provider.postProcessing('Registering beliefs in the Repo Belief Graph…');
            this.beliefManager.addBeliefs(agentPlan.extractedBeliefs);
            this.pushBeliefGraphSnapshot();
            this.audit('beliefs', 'Beliefs registered in local state', `Session store now tracks ${this.beliefManager.getAllBeliefs().length} beliefs.`, 'success', this.summarizeBeliefs(this.beliefManager.getAllBeliefs()));
            // Feed the LLM output to thinkN for cloud-side extraction & fusion
            const thinkNResult = await this.beliefManager.feedOutput(JSON.stringify(agentPlan), 'llm-plan-extraction');
            this.audit('beliefs', 'thinkN synchronization completed', `thinkN clarity=${thinkNResult.clarity.toFixed(2)}, readiness=${thinkNResult.readiness}.`, 'info', thinkNResult);
            // ── Step 4: Evidence Grounding (Agent 2) ────────────────
            await this.groundBeliefs();
            // ── Steps 5-8: Gate Evaluation + Clarification Loop ─────
            const gateResult = await this.runGateLoop();
            if (gateResult === 'BLOCK') {
                // Pipeline terminates — unresolvable contradiction
                return;
            }
            // ── Step 9: Patch Generation (Agent 4) ──────────────────
            this.provider.postProcessing('Generating code patch with validated beliefs…');
            const allBeliefs = this.beliefManager.getAllBeliefs();
            const diffPatch = await this.llmClient.generateCodePatch(userTask, agentPlan, allBeliefs);
            this.audit('patch', 'Patch generated', `Generated unified diff with ${diffPatch.split(/\r?\n/).length} lines for ${agentPlan.targetFiles.length} target files.`, 'success', {
                targetFiles: agentPlan.targetFiles,
                diffPreview: diffPatch.split(/\r?\n/).slice(0, 40).join('\n'),
            });
            // ── Step 10: Post-Patch Validation (Agent 5) ────────────
            this.provider.postProcessing('Validating generated patch against constraints…');
            const validationResult = (0, PatchValidator_1.validateGeneratedPatch)(diffPatch, allBeliefs);
            const patchSummary = (0, unifiedDiff_1.summarizeUnifiedDiff)(diffPatch);
            // ── Step 11: Dispatch to Webview (Agent 1) ──────────────
            if (validationResult.isValid) {
                this.audit('validation', 'Patch validation passed', 'Patch satisfied the current validated constraints.', 'success');
                this.pushBeliefGraphSnapshot();
                this.provider.postPatchReady(diffPatch, patchSummary);
            }
            else {
                this.audit('validation', 'Patch validation failed', `Patch violated ${validationResult.violations.length} constraint(s).`, 'error', validationResult.violations);
                this.pushBeliefGraphSnapshot();
                this.provider.postBlocked('The generated patch violates one or more user constraints.', validationResult.violations);
            }
        }
        catch (error) {
            console.error('[BeliefGuard Orchestrator] Pipeline error:', error);
            this.audit('session', 'Pipeline failed', error?.message || 'An unexpected error occurred during task execution.', 'error');
            this.provider.postError(error?.message || 'An unexpected error occurred during task execution.');
        }
    }
    // ── Private: Evidence Grounding ─────────────────────────────────
    /**
     * Grounds each belief against the file system by running the
     * Evidence Locator heuristics and updating confidence scores.
     * Also runs contradiction detection against the full belief set.
     */
    async groundBeliefs() {
        this.provider.postProcessing('Grounding beliefs against workspace evidence…');
        const beliefs = this.beliefManager.getAllBeliefs();
        this.audit('grounding', 'Grounding cycle started', `Attempting to ground ${beliefs.length} belief(s) against workspace evidence.`, 'info');
        for (const belief of beliefs) {
            // Skip already-validated beliefs (e.g., USER_CONSTRAINTs)
            if (belief.isValidated)
                continue;
            try {
                // Extract keywords from the statement for evidence search
                const keywords = belief.statement
                    .split(/\s+/)
                    .filter((w) => w.length > 3);
                const evidence = await (0, EvidenceLocator_1.findEvidenceForBelief)(belief.statement, keywords);
                const detail = evidence.length > 0
                    ? `Found ${evidence.length} evidence item(s) for belief: ${belief.statement}`
                    : `No evidence found for belief: ${belief.statement}`;
                this.audit('grounding', evidence.length > 0 ? 'Belief grounded with evidence' : 'Belief remained ungrounded', detail, evidence.length > 0 ? 'success' : 'warning', {
                    beliefId: belief.id,
                    statement: belief.statement,
                    evidenceCount: evidence.length,
                    evidence,
                });
                if (evidence.length > 0) {
                    // Compute new confidence: weighted average of evidence
                    const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
                    const avgWeight = evidence.length > 0
                        ? totalWeight / evidence.length
                        : 0;
                    // Blend the original confidence with evidence strength
                    const newConfidence = Math.min(1.0, belief.confidenceScore * 0.4 + avgWeight * 0.6);
                    // Update through state manager (handles threshold auto-validation)
                    for (const ev of evidence) {
                        this.beliefManager.updateBeliefConfidence(belief.id, newConfidence, ev);
                    }
                }
            }
            catch (error) {
                console.warn(`[BeliefGuard] Evidence grounding failed for belief ${belief.id}:`, error);
                this.audit('grounding', 'Belief grounding failed', `Grounding failed for belief: ${belief.statement}`, 'error', {
                    beliefId: belief.id,
                    statement: belief.statement,
                    error: error instanceof Error ? error.message : String(error),
                });
                // Gracefully continue — a failed grounding just means the
                // belief keeps its original (likely low) confidence score.
            }
        }
        // Run contradiction detection against the full plan context
        this.detectAndMarkContradictions();
        this.pushBeliefGraphSnapshot();
    }
    /**
     * Runs the BeliefGraph contradiction detector and marks any
     * conflicts found in the state manager.
     *
     * Each mutable belief (AGENT_ASSUMPTION, TASK_BELIEF) is checked
     * individually against the stored immutable facts. When
     * detectContradictions returns a conflicting REPO_FACT or
     * USER_CONSTRAINT, the exact contradicting pair is recorded.
     */
    detectAndMarkContradictions() {
        const allBeliefs = this.beliefManager.getAllBeliefs();
        // Only check mutable beliefs for contradictions
        const mutableBeliefs = allBeliefs.filter((b) => b.type === 'AGENT_ASSUMPTION' || b.type === 'TASK_BELIEF');
        for (const mutable of mutableBeliefs) {
            // Check this individual belief's statement against stored facts
            const conflicting = (0, BeliefGraph_1.detectContradictions)(mutable.statement);
            for (const immutable of conflicting) {
                if (!mutable.contradictions.includes(immutable.id)) {
                    this.beliefManager.markContradiction(mutable.id, immutable.id);
                    this.audit('grounding', 'Contradiction detected', `"${mutable.statement}" conflicts with "${immutable.statement}".`, 'error', {
                        mutableBeliefId: mutable.id,
                        mutableStatement: mutable.statement,
                        immutableBeliefId: immutable.id,
                        immutableStatement: immutable.statement,
                    });
                }
            }
        }
    }
    // ── Private: Gate Evaluation + Clarification Loop ───────────────
    /**
     * Runs the gate evaluation loop (steps 5-8).
     *
     * Handles three decision paths:
     *   • INSPECT_MORE → re-grounds beliefs, re-evaluates (capped)
     *   • ASK_USER → dispatches questions, awaits user reply, re-evaluates
     *   • BLOCK → posts violations and returns immediately
     *   • PROCEED → returns to allow patch generation
     *
     * @returns The final gate decision after all loops resolve.
     */
    async runGateLoop() {
        let inspectCycles = 0;
        let clarificationLoops = 0;
        while (true) {
            // ── Step 5: Evaluate Gate ───────────────────────────────
            const allBeliefs = this.beliefManager.getAllBeliefs();
            const decision = (0, ConfidenceGate_1.evaluateState)(allBeliefs);
            const decisionContext = this.buildGateDecisionContext(allBeliefs);
            this.audit('gate', `Gate decision: ${decision}`, this.describeGateDecision(decision, decisionContext), decision === 'BLOCK' ? 'error' : decision === 'ASK_USER' ? 'warning' : decision === 'PROCEED' ? 'success' : 'info', decisionContext);
            switch (decision) {
                case 'PROCEED':
                    return 'PROCEED';
                case 'BLOCK': {
                    const violations = (0, ConfidenceGate_1.getBlockingContradictions)(allBeliefs);
                    this.provider.postBlocked('The agent\'s proposed action contradicts validated repository facts or user constraints.', violations);
                    return 'BLOCK';
                }
                case 'INSPECT_MORE': {
                    inspectCycles++;
                    if (inspectCycles > MAX_INSPECT_CYCLES) {
                        // Exhausted re-grounding attempts — escalate remaining
                        // low-confidence beliefs to HIGH risk so the gate returns
                        // ASK_USER on the next evaluation instead of looping.
                        this.provider.postProcessing('Re-grounding exhausted. Escalating remaining uncertainties…');
                        const lowConfBeliefs = allBeliefs.filter((b) => b.confidenceScore < 0.40 && !b.isValidated);
                        for (const b of lowConfBeliefs) {
                            this.beliefManager.addBelief({
                                ...b,
                                riskLevel: 'HIGH',
                            });
                        }
                        this.audit('gate', 'Escalated unresolved beliefs', `Escalated ${lowConfBeliefs.length} low-confidence belief(s) to HIGH risk after exhausting inspect cycles.`, 'warning', lowConfBeliefs.map((belief) => ({
                            id: belief.id,
                            statement: belief.statement,
                            confidenceScore: belief.confidenceScore,
                        })));
                        continue;
                    }
                    this.provider.postProcessing(`Autonomously seeking additional evidence (cycle ${inspectCycles}/${MAX_INSPECT_CYCLES})…`);
                    await this.groundBeliefs();
                    continue;
                }
                case 'ASK_USER': {
                    clarificationLoops++;
                    if (clarificationLoops > MAX_CLARIFICATION_LOOPS) {
                        this.provider.postError('Maximum clarification attempts reached. Please restart the task with more context.');
                        return 'BLOCK';
                    }
                    // ── Step 6: Dispatch questions to Webview ────────
                    const questions = (0, QuestionGenerator_1.generateQuestions)(allBeliefs);
                    this.audit('questions', 'Generated clarification questions', `Generated ${questions.length} question(s) for ${decisionContext.highRiskUnvalidatedCount} unresolved high-risk belief(s).`, questions.length > 0 ? 'warning' : 'info', questions);
                    this.provider.postBeliefs(allBeliefs, questions);
                    // Suspend pipeline — await user's async replies
                    const answers = await this.awaitUserAnswers(questions.length);
                    this.audit('questions', 'Received user clarification answers', `Received ${answers.length} answer(s) from the webview.`, 'success', answers);
                    // ── Step 7: Push USER_CONSTRAINT beliefs (Agent 3) ──
                    for (const answer of answers) {
                        const existingBelief = this.beliefManager.getBelief(answer.beliefId);
                        if (!existingBelief)
                            continue;
                        if (answer.answer.toLowerCase().includes('yes') ||
                            answer.answer.toLowerCase().includes('correct')) {
                            // User confirmed — upgrade to validated USER_CONSTRAINT
                            const confirmedEvidence = {
                                id: (0, uuid_1.v4)(),
                                sourceType: 'USER_ANSWER',
                                uri: 'user-clarification',
                                snippet: `User confirmed: "${existingBelief.statement}"`,
                                weight: 1.0,
                            };
                            this.beliefManager.updateBeliefConfidence(answer.beliefId, 1.0, confirmedEvidence);
                            this.audit('questions', 'User confirmed belief', existingBelief.statement, 'success', {
                                beliefId: existingBelief.id,
                                answer: answer.answer,
                            });
                        }
                        else {
                            // User rejected — mark as contradicted
                            const rejectionBelief = {
                                id: (0, uuid_1.v4)(),
                                statement: `User explicitly rejected: "${existingBelief.statement}"`,
                                type: 'USER_CONSTRAINT',
                                confidenceScore: 1.0,
                                riskLevel: existingBelief.riskLevel,
                                evidenceIds: [],
                                isValidated: true,
                                contradictions: [],
                            };
                            this.beliefManager.addBelief(rejectionBelief);
                            this.beliefManager.markContradiction(answer.beliefId, rejectionBelief.id);
                            this.audit('questions', 'User rejected belief', existingBelief.statement, 'warning', {
                                beliefId: existingBelief.id,
                                answer: answer.answer,
                                rejectionBelief,
                            });
                        }
                    }
                    this.pushBeliefGraphSnapshot();
                    // ── Step 8: Loop back to step 5 ─────────────────
                    continue;
                }
            }
        }
    }
    // ── Private: Async User Response Handling ────────────────────────
    /**
     * Wraps the Webview's `onUserAnswered` event emitter in a Promise
     * so the pipeline can `await` user input before resuming.
     *
     * Collects up to `expectedCount` answers before resolving, with a
     * safety timeout to prevent infinite hangs.
     *
     * @param expectedCount  Number of questions dispatched to the user.
     * @returns              Array of user answers keyed by belief ID.
     */
    awaitUserAnswers(expectedCount) {
        return new Promise((resolve) => {
            const answers = [];
            const disposables = [];
            const finish = () => {
                for (const d of disposables)
                    d.dispose();
                resolve(answers);
            };
            // Listen for each individual answer from the Webview
            const sub = this.provider.onUserAnswered((payload) => {
                answers.push(payload);
                if (answers.length >= expectedCount) {
                    finish();
                }
            });
            disposables.push(sub);
            // Safety timeout: 5 minutes max wait per clarification round
            const timer = setTimeout(() => {
                console.warn('[BeliefGuard] Clarification timeout — proceeding with partial answers.');
                this.audit('questions', 'Clarification timeout reached', 'Proceeding with partial user answers after waiting 5 minutes.', 'warning');
                finish();
            }, 5 * 60 * 1000);
            disposables.push({ dispose: () => clearTimeout(timer) });
        });
    }
    audit(phase, title, detail, level = 'info', data) {
        this.provider.postAuditEvent({
            id: (0, uuid_1.v4)(),
            phase,
            title,
            detail,
            level,
            timestamp: new Date().toISOString(),
            data,
        });
    }
    summarizeBeliefs(beliefs) {
        const summary = {
            total: beliefs.length,
            byType: {},
            byRisk: {},
            validated: beliefs.filter((belief) => belief.isValidated).length,
            unvalidated: beliefs.filter((belief) => !belief.isValidated).length,
        };
        for (const belief of beliefs) {
            summary.byType[belief.type] = (summary.byType[belief.type] || 0) + 1;
            summary.byRisk[belief.riskLevel] = (summary.byRisk[belief.riskLevel] || 0) + 1;
        }
        return summary;
    }
    buildGateDecisionContext(beliefs) {
        return {
            totalBeliefs: beliefs.length,
            highRiskUnvalidatedCount: beliefs.filter((belief) => !belief.isValidated && belief.riskLevel === 'HIGH').length,
            lowConfidenceCount: beliefs.filter((belief) => belief.confidenceScore < 0.4).length,
            contradictedCount: beliefs.filter((belief) => belief.contradictions.length > 0).length,
            validatedCount: beliefs.filter((belief) => belief.isValidated).length,
            unresolvedBeliefs: beliefs
                .filter((belief) => !belief.isValidated)
                .map((belief) => ({
                id: belief.id,
                statement: belief.statement,
                riskLevel: belief.riskLevel,
                confidenceScore: belief.confidenceScore,
            })),
        };
    }
    describeGateDecision(decision, context) {
        switch (decision) {
            case 'PROCEED':
                return `Proceeding with patch generation. ${context.validatedCount}/${context.totalBeliefs} beliefs are validated and no blocking conditions remain.`;
            case 'INSPECT_MORE':
                return `Still investigating because ${context.lowConfidenceCount} belief(s) remain below the confidence threshold.`;
            case 'ASK_USER':
                return `Pausing for clarification because ${context.highRiskUnvalidatedCount} high-risk belief(s) are still unresolved.`;
            case 'BLOCK':
                return `Blocking execution because ${context.contradictedCount} contradiction(s) were detected against immutable facts or user constraints.`;
        }
    }
    pushBeliefGraphSnapshot() {
        this.provider.postBeliefGraph(this.beliefManager.getAllBeliefs());
    }
}
exports.MainOrchestrator = MainOrchestrator;
//# sourceMappingURL=MainOrchestrator.js.map