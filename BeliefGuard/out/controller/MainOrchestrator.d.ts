import { BeliefGuardProvider } from '../webview/BeliefGuardProvider';
/**
 * MainOrchestrator — End-to-End Pipeline Controller
 *
 * Orchestrates the full lifecycle of a guarded coding task:
 * context collection → belief extraction → evidence grounding →
 * gate evaluation → clarification loop → patch generation →
 * post-patch validation → diff delivery.
 */
export declare class MainOrchestrator {
    private readonly provider;
    private readonly llmClient;
    private readonly beliefManager;
    constructor(provider: BeliefGuardProvider);
    /**
     * Executes the full 11-step guarded task pipeline.
     *
     * This method is the single entry point called when the user submits
     * a task through the Webview. It is fully async and will suspend
     * at step 6 while waiting for user clarification input.
     *
     * @param userTask  The natural language task description from the user.
     */
    runGuardedTask(userTask: string): Promise<void>;
    /**
     * Grounds each belief against the file system by running the
     * Evidence Locator heuristics and updating confidence scores.
     * Also runs contradiction detection against the full belief set.
     */
    private groundBeliefs;
    /**
     * Runs the BeliefGraph contradiction detector and marks any
     * conflicts found in the state manager.
     *
     * Each mutable belief (AGENT_ASSUMPTION, TASK_BELIEF) is checked
     * individually against the stored immutable facts. When
     * detectContradictions returns a conflicting REPO_FACT or
     * USER_CONSTRAINT, the exact contradicting pair is recorded.
     */
    private detectAndMarkContradictions;
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
    private runGateLoop;
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
    private awaitUserAnswers;
    private runPatchGeneration;
    private expandPatchGenerationContext;
    private handleStructuredPatchResult;
    private handleUnifiedDiffPatchResult;
    private extractStructuredPatchText;
    private serializeStructuredPatchEntries;
    private serializeStructuredPatchBlocks;
    private buildStructuredFileSummary;
    private looksLikeStructuredPatch;
    private normalizeRequestedWorkspacePath;
    private awaitFileReviewDecision;
    private audit;
    private summarizeBeliefs;
    private buildGateDecisionContext;
    private describeGateDecision;
    private pushBeliefGraphSnapshot;
}
//# sourceMappingURL=MainOrchestrator.d.ts.map