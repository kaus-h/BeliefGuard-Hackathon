# Implementation Plan

- [-] 1. Write bug condition exploration tests for thinkN SDK defects
  - **Property 1: Bug Condition** — thinkN SDK Configuration and Error Handling
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 6 thinkN SDK defects exist
  - **Scoped PBT Approach**: Scope properties to the concrete failing cases in ThinkNClient.ts
  - Test file: `BeliefGuard/src/__tests__/thinkn-bug-condition.test.ts`
  - Property 1a: `createClient(threadId)` — assert constructor options include `writeScope: 'thread'` (from Bug Condition: `NOT hasExplicitWriteScope(input.context.constructorOptions)`)
  - Property 1b: `createClient(threadId)` with `BELIEFS_DEBUG=true` — assert constructor options include `debug: true` (from Bug Condition: `NOT input.context.constructorOptions.debug`)
  - Property 1c: When `BeliefsError` is thrown with `.code`, `.retryable`, `.retryAfterMs` — assert `wrapThinkNError()` preserves structured error info (from Bug Condition: `NOT preservesStructuredErrorInfo(input.context.wrappedError)`)
  - Property 1d: Assert `REMOTE_CALL_TIMEOUT_MS >= 120000` (from Bug Condition: `input.context.timeoutMs < 120000`)
  - Property 1e: Assert top-of-file comments do NOT describe graceful degradation (from Bug Condition: `commentsDescribeGracefulDegradation(input.context.fileContent)`)
  - Property 1f: Assert `syncAddBelief()` options match SDK contract — `confidence`, `type`, `source` are valid per docs (from Bug Condition: `passesUndocumentedOptions(input.context.addOptions)`)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found:
    - Constructor missing `writeScope: 'thread'`
    - Constructor missing `debug: true` in debug environment
    - `wrapThinkNError()` returns generic `Error` without `.code`, `.retryable`, `.retryAfterMs`
    - `REMOTE_CALL_TIMEOUT_MS` is 30000 (< 120000)
    - Comments still reference "fire-and-forget" and "graceful degradation"
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [-] 2. Write bug condition exploration tests for agent workflow defects
  - **Property 1: Bug Condition** — Agent Workflow Architecture Gaps
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate the 4 agent workflow defects exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases across LLMClient.ts, unifiedDiff.ts, types.ts, BeliefGuardProvider.ts
  - Test file: `BeliefGuard/src/__tests__/workflow-bug-condition.test.ts`
  - Property 1g: Generate a 3-file unified diff with ambiguous `---`/`+++` boundaries — assert `parseUnifiedDiff()` produces exactly 3 changes (from Bug Condition: `input.context.patchFormat == 'monolithic-unified-diff'` and `input.context.targetFiles.length > 1`)
  - Property 1h: Assert `LLMClient` has no `requestContextExpansion()` method or iterative read mechanism (from Bug Condition: `NOT input.context.hasIterativeReadMechanism`)
  - Property 1i: Assert webview message types do NOT include `FILE_CHANGE_READY`, `FILE_APPROVED`, `FILE_REJECTED` — no per-file approval granularity (from Bug Condition: `input.context.approvalGranularity == 'all-or-nothing'`)
  - Property 1j: Assert `LLMClient` has no `callOpenRouterStreaming()` method and `ExtensionToWebviewMessage` does not include `STREAMING_CHUNK` (from Bug Condition: `NOT input.context.hasStreamingFeedback`)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found:
    - `parseUnifiedDiff()` returns 1 or 2 changes for a 3-file diff
    - No `requestContextExpansion` method exists
    - No per-file approval message types exist
    - No streaming method or message type exists
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.7, 1.8, 1.9, 1.10_

- [ ] 3. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Pipeline Order, Gate Integrity, and Existing Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - **CRITICAL**: These tests MUST PASS on unfixed code — passing confirms baseline behavior to preserve
  - Test file: `BeliefGuard/src/__tests__/preservation.test.ts`
  - Observe on UNFIXED code:
    - `evaluateState()` returns BLOCK for contradictions against REPO_FACT/USER_CONSTRAINT
    - `evaluateState()` returns ASK_USER for unvalidated HIGH risk beliefs
    - `evaluateState()` returns INSPECT_MORE for confidence < 0.40
    - `evaluateState()` returns PROCEED when all clear
    - `SessionStore.setBelief()` is synchronous (returns void, not Promise)
    - `parseUnifiedDiff('')` returns empty array (empty patch handling)
    - `validateGeneratedPatch()` detects USER_CONSTRAINT violations via heuristic matching
    - `normalizeUnifiedDiffText()` strips fences and finds diff start
    - Single-file unified diffs parse correctly
  - Write property-based tests:
    - Property 2a: For all belief states, `evaluateState()` follows priority BLOCK > ASK_USER > INSPECT_MORE > PROCEED (from Preservation Requirements 3.1–3.8)
    - Property 2b: For all beliefs, `SessionStore.setBelief()` is synchronous — write then immediate read returns same belief (from Preservation Requirement 3.3)
    - Property 2c: For empty diffPatch input, `parseUnifiedDiff('')` returns `[]` and no schema error (from Preservation Requirement 3.9)
    - Property 2d: For all valid single-file unified diffs, `parseUnifiedDiff()` returns exactly 1 change with correct paths (from Preservation: single-file patch handling)
    - Property 2e: For all USER_CONSTRAINT beliefs with protective keywords and diffs containing opposing actions, `validateGeneratedPatch()` flags violations (from Preservation Requirement 3.13)
    - Property 2f: `normalizeUnifiedDiffText()` correctly strips markdown fences and locates diff start for all valid diff inputs (from Preservation: diff normalization)
  - Verify all tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 3.12, 3.13_


- [ ] 4. Group A: thinkN SDK fixes (Defects 1.1–1.6) in ThinkNClient.ts

  - [ ] 4.1 Add explicit `writeScope: 'thread'` to Beliefs constructor and enable debug mode
    - In `createClient()`, add `writeScope: 'thread'` to the Beliefs constructor options object
    - Add `debug: true` when `process.env.BELIEFS_DEBUG === 'true'` or VS Code debug session is active
    - This makes the thread-scoped contract explicit regardless of SDK defaults
    - _Bug_Condition: isBugCondition({ operation: 'createClient' }) where NOT hasExplicitWriteScope AND NOT debug in debug env_
    - _Expected_Behavior: Constructor options include writeScope: 'thread' and debug: true when in debug context_
    - _Preservation: Thread binding and ensureReady() behavior unchanged_
    - _Requirements: 2.1, 2.5_

  - [ ] 4.2 Validate `add()` options match SDK contract
    - In `syncAddBelief()`, ensure options passed to `this.thinkN.add()` match documented SDK signature
    - Verify `confidence`, `type`, `source` are valid per SDK docs
    - The current `mapBeliefTypeToThinkN()` mapping is correct; validate the options object shape
    - _Bug_Condition: isBugCondition({ operation: 'syncAddBelief' }) where passesUndocumentedOptions_
    - _Expected_Behavior: Only documented SDK options are passed to add()_
    - _Preservation: Local SessionStore writes remain synchronous before remote sync_
    - _Requirements: 2.2_

  - [ ] 4.3 Import `BetaAccessError`/`BeliefsError` and replace `wrapThinkNError()` with typed handler
    - Add named imports: `import Beliefs, { BetaAccessError, BeliefsError } from 'beliefs'`
    - Replace `wrapThinkNError()` with a typed error handler that:
      - Checks `instanceof BetaAccessError` → surfaces fatal auth error with `.signupUrl`
      - Checks `instanceof BeliefsError` → preserves `.code`, `.retryable`, `.retryAfterMs` in diagnostic output
      - Falls back to generic Error wrapping for unknown errors
    - _Bug_Condition: isBugCondition({ operation: 'handleError' }) where error IS BetaAccessError OR BeliefsError AND NOT preservesStructuredErrorInfo_
    - _Expected_Behavior: Structured error properties preserved in diagnostic output and thrown error_
    - _Preservation: Diagnostic events continue to route through diagnosticReporter callback_
    - _Requirements: 2.3_

  - [ ] 4.4 Align timeout with SDK default (30s → 120s)
    - Change `REMOTE_CALL_TIMEOUT_MS` from `30000` to `120000`
    - Alternatively, remove custom `withTimeout()` and pass `timeout: 120000` in constructor
    - _Bug_Condition: isBugCondition({ operation: 'withTimeout' }) where timeoutMs < 120000_
    - _Expected_Behavior: Timeout >= 120000ms, no false-positive timeouts on legitimate slow calls_
    - _Preservation: withTimeout() still prevents infinite hangs_
    - _Requirements: 2.4_

  - [ ] 4.5 Update stale comments to reflect fail-fast contract
    - Replace top-of-file JSDoc to reflect fail-fast contract
    - Remove references to "fire-and-forget", "graceful degradation", "local-only operation"
    - Document that thinkN is a hard dependency during guarded-task execution
    - _Bug_Condition: isBugCondition({ operation: 'readComments' }) where commentsDescribeGracefulDegradation_
    - _Expected_Behavior: Comments accurately describe fail-fast behavior_
    - _Requirements: 2.6_

  - [ ] 4.6 Verify bug condition exploration tests (task 1) now pass
    - **Property 1: Expected Behavior** — thinkN SDK Configuration and Error Handling
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior for defects 1.1–1.6
    - When these tests pass, it confirms the SDK configuration bugs are fixed
    - Run bug condition exploration tests from task 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms thinkN SDK bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 4.7 Verify preservation tests (task 3) still pass
    - **Property 2: Preservation** — Pipeline Order, Gate Integrity, and Existing Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 3 — do NOT write new tests
    - Run preservation property tests from task 3
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions from Group A fixes)
    - Confirm all preservation tests still pass after thinkN SDK fixes

- [ ] 5. Group B: Agent workflow fixes — Structured per-file patch format (Defect 1.7)

  - [ ] 5.1 Add new types for structured patches in `types.ts`
    - Add `FileChangeType` (`'ADD' | 'UPDATE' | 'DELETE'`)
    - Add `FileChange` interface (type, path, content for ADD/DELETE, hunks for UPDATE)
    - Add `StructuredPatch` interface (files array, metadata)
    - Add new webview message types: `FILE_CHANGE_READY`, `FILE_APPROVED`, `FILE_REJECTED`, `FILE_REVIEW_COMPLETE`
    - Add `PerFileReviewState` type tracking approval status per file
    - Add `STREAMING_CHUNK` to `ExtensionToWebviewMessage` union
    - _Bug_Condition: No structured patch types exist, no per-file approval messages, no streaming message_
    - _Expected_Behavior: Typed interfaces for structured per-file patch operations and per-file review flow_
    - _Preservation: Existing types unchanged, new types are additive_
    - _Requirements: 2.7, 2.9, 2.10_

  - [ ] 5.2 Add `parseStructuredPatch()` in `unifiedDiff.ts`
    - Parse `*** Begin Patch` / `*** Update File:` / `*** Add File:` / `*** Delete File:` / `*** End Patch` format
    - Return typed `StructuredPatch` with per-file operations
    - Each file section uses `+`/`-`/` ` line prefixes with `@@` context markers for updates
    - Keep existing unified diff functions for backward compatibility
    - Add `applyStructuredPatchToWorkspace()` for per-file application
    - _Bug_Condition: isBugCondition({ operation: 'generatePatch' }) where patchFormat == 'monolithic-unified-diff' and targetFiles > 1_
    - _Expected_Behavior: Parser produces typed StructuredPatch where file count matches markers in input_
    - _Preservation: Existing parseUnifiedDiff(), normalizeUnifiedDiffText(), applyUnifiedDiffToWorkspace() unchanged_
    - _Requirements: 2.7_

  - [ ] 5.3 Update `PatchGenerator.ts` prompt for structured format
    - Instruct LLM to produce structured patch format instead of raw unified diff
    - Include format examples: `*** Begin Patch`, `*** Update File: path`, `*** Add File: path`, `*** Delete File: path`, `*** End Patch`
    - Maintain existing rules about workspace-relative paths, no synthetic files, empty patch for non-concrete tasks
    - _Bug_Condition: Prompt asks for monolithic unified diff_
    - _Expected_Behavior: Prompt instructs structured per-file format with explicit markers_
    - _Preservation: Empty patch contract preserved, workspace-relative path requirement preserved_
    - _Requirements: 2.7, 3.12_

  - [ ] 5.4 Update `LLMClient.ts` schema for structured patch
    - Update `PatchGenerationResultSchema` to expect `structuredPatch` (string in new format) alongside `diffPatch`
    - Update `generateCodePatch()` return type
    - Maintain backward compatibility: empty patch still accepted
    - _Bug_Condition: Schema only accepts monolithic diffPatch_
    - _Expected_Behavior: Schema accepts structuredPatch string in new format_
    - _Preservation: Empty patch handling unchanged (Requirement 3.9)_
    - _Requirements: 2.7, 3.9_

  - [ ] 5.5 Update `MainOrchestrator.ts` to use structured patch format
    - Update step 9 to parse structured patch format via `parseStructuredPatch()`
    - Update step 10 to validate per-file using existing `PatchValidator` logic
    - Update step 11 to deliver per-file for approval
    - Maintain pipeline order: context → extraction → thinkN sync → grounding → gate → clarification → patch → validation → delivery
    - _Bug_Condition: Orchestrator uses monolithic diff parsing for multi-file patches_
    - _Expected_Behavior: Orchestrator parses structured format, validates per-file, delivers per-file_
    - _Preservation: Pipeline step order unchanged (Requirement 3.8), gate evaluation unchanged_
    - _Requirements: 2.7, 3.8, 3.11_

- [ ] 6. Group B: Iterative context expansion (Defect 1.8)

  - [ ] 6.1 Add `requestContextExpansion()` method in `LLMClient.ts`
    - New method that asks the LLM what additional files it needs to read
    - Returns a list of file paths (or empty if no expansion needed)
    - Bounded loop (max 3 iterations)
    - _Bug_Condition: isBugCondition({ operation: 'gatherContext' }) where llmNeedsAdditionalFiles AND NOT hasIterativeReadMechanism_
    - _Expected_Behavior: LLM can request specific files to read before producing patch_
    - _Preservation: Does NOT bypass the gate — operates only after PROCEED (Requirement 3.11)_
    - _Requirements: 2.8, 3.11_

  - [ ] 6.2 Add context expansion phase in `MainOrchestrator.ts`
    - Between gate PROCEED and patch generation (between steps 8 and 9), add expansion phase
    - Call `requestContextExpansion()` to get file read requests
    - Read requested files from workspace, append to context
    - Repeat up to 3 times or until LLM says it has enough context
    - Pass expanded context to `generateCodePatch()`
    - _Bug_Condition: Single-shot context with no iterative mechanism_
    - _Expected_Behavior: Bounded read-only expansion loop provides additional files before patch generation_
    - _Preservation: Pipeline order preserved, gate not bypassed, belief-governed model intact_
    - _Requirements: 2.8, 3.8, 3.11_

- [ ] 7. Group B: Per-file approval flow (Defect 1.9)

  - [ ] 7.1 Add per-file review methods in `BeliefGuardProvider.ts`
    - Add `postFileChangeReady(fileChange, index, total)` method
    - Add `onFileApproved` and `onFileRejected` event emitters
    - Update webview HTML/JS to render per-file review cards with individual approve/reject buttons
    - Each file card shows file path, change type (ADD/UPDATE/DELETE), and line counts
    - _Bug_Condition: isBugCondition({ operation: 'approvePatch' }) where patchFileCount > 1 AND approvalGranularity == 'all-or-nothing'_
    - _Expected_Behavior: Each file change presented individually with own approve/reject controls_
    - _Preservation: Existing postPatchReady() still works for single-file patches_
    - _Requirements: 2.9_

  - [ ] 7.2 Wire per-file approval in `MainOrchestrator.ts`
    - After patch validation passes, iterate through file changes
    - For each file: post `FILE_CHANGE_READY` to webview, open VS Code diff view, await approval/rejection
    - If approved, apply that file's changes; if rejected, skip and continue
    - Post summary of applied/rejected changes after all files processed
    - _Bug_Condition: All-or-nothing approval for multi-file patches_
    - _Expected_Behavior: Approved files applied independently, rejected files skipped_
    - _Preservation: Single-file patches still work, pipeline order preserved_
    - _Requirements: 2.9, 3.8_

  - [ ] 7.3 Update `showDiff.ts` and `applyPatch.ts` for per-file operations
    - Update `showDiff` to work with structured patch file changes
    - Update `applyPatch` to apply individual file changes from structured patch
    - _Bug_Condition: Commands only work with monolithic unified diff_
    - _Expected_Behavior: Commands work with both structured per-file format and legacy unified diff_
    - _Preservation: Existing unified diff commands still functional_
    - _Requirements: 2.7, 2.9_

- [ ] 8. Group B: Streaming feedback (Defect 1.10)

  - [ ] 8.1 Add `callOpenRouterStreaming()` in `LLMClient.ts`
    - New method using `fetch()` with `stream: true` in request body
    - Read response as ReadableStream, parse SSE chunks
    - Call `onChunk(partialText)` callback for each delta
    - Update `generateCodePatch()` to optionally use streaming
    - _Bug_Condition: isBugCondition({ operation: 'generateWithLLM' }) where NOT hasStreamingFeedback_
    - _Expected_Behavior: Streaming method available, partial results passed to callback_
    - _Preservation: Non-streaming path still works as fallback_
    - _Requirements: 2.10_

  - [ ] 8.2 Add streaming display in `BeliefGuardProvider.ts`
    - Add `postStreamingChunk(phase, partialText)` method
    - Update webview HTML/JS to render streaming progress
    - Show which pipeline phase is active
    - For patch generation, show file targets as they appear in stream
    - _Bug_Condition: Webview shows only static spinner during generation_
    - _Expected_Behavior: Real-time streaming progress visible in webview_
    - _Preservation: Existing processing messages still work_
    - _Requirements: 2.10_

  - [ ] 8.3 Wire streaming in `MainOrchestrator.ts`
    - Connect streaming callback from LLMClient to webview provider
    - Post phase-level progress updates at each pipeline step transition
    - _Bug_Condition: No streaming events emitted during LLM generation_
    - _Expected_Behavior: Webview receives streaming chunks during generation_
    - _Preservation: Pipeline step order unchanged_
    - _Requirements: 2.10, 3.8_

- [ ] 9. Verify all bug condition exploration tests pass after Group B fixes

  - [ ] 9.1 Verify workflow bug condition tests (task 2) now pass
    - **Property 1: Expected Behavior** — Agent Workflow Architecture Gaps
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - The tests from task 2 encode the expected behavior for defects 1.7–1.10
    - When these tests pass, it confirms the workflow bugs are fixed
    - Run bug condition exploration tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms workflow bugs are fixed)
    - _Requirements: 2.7, 2.8, 2.9, 2.10_

  - [ ] 9.2 Verify preservation tests (task 3) still pass after all fixes
    - **Property 2: Preservation** — Pipeline Order, Gate Integrity, and Existing Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 3 — do NOT write new tests
    - Run preservation property tests from task 3
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions from any fixes)
    - Confirm gate decisions identical, SessionStore sync writes preserved, empty patch handling preserved, single-file diffs preserved, PatchValidator preserved

- [ ] 10. E2E validation in Extension Development Host (F5)

  - [ ] 10.1 Phase 1: thinkN SDK validation
    - F5 launch → submit `hello` → verify:
      - No `missing_thread` errors in console
      - Audit timeline shows `thinkN thread scope initialized` with `writeScope: 'thread'`
      - `thinkN reset succeeded`, `thinkN before succeeded` events appear
      - Graceful "no actionable patch" message (no Zod crash)
    - F5 launch → submit "Add a comment to the top of extension.ts" → verify:
      - `thinkN add succeeded` events for each extracted belief
      - `thinkN after succeeded` for plan fusion
      - No premature timeout errors
    - If `BELIEFS_DEBUG=true` in `.env`, verify SDK-level logging in console
    - _Requirements: 4.1, 4.2_

  - [ ] 10.2 Phase 2: Agent workflow validation
    - Submit task requiring 2+ file edits → verify:
      - Structured patch format generated (not monolithic unified diff)
      - Each file appears as separate reviewable unit in webview
      - User can approve file A and reject file B independently
      - Only approved files applied to workspace
    - Submit task requiring file not in initial context → verify:
      - Context expansion phase requests the file
      - File contents provided to LLM before patch generation
    - During any LLM generation, verify:
      - Webview shows streaming progress (not just static spinner)
      - Phase indicators update in real time
    - _Requirements: 4.3_

  - [ ] 10.3 Phase 3: Full pipeline validation
    - Submit complex multi-file task → verify complete pipeline:
      - thinkN lifecycle (reset → before → add → after) succeeds
      - Beliefs extracted and grounded
      - Gate evaluates correctly
      - Context expansion provides needed files
      - Structured patch generated with per-file operations
      - Per-file review and approval works
      - Applied changes are correct in workspace
      - Audit timeline reflects all steps with thinkN diagnostics
    - Any failure → document exact error, pipeline step, file/line → fix before proceeding
    - _Requirements: 4.4, 4.5_

- [ ] 11. Checkpoint — Ensure all tests pass
  - Run all bug condition exploration tests (tasks 1 and 2) — all must PASS
  - Run all preservation property tests (task 3) — all must PASS
  - Confirm E2E validation phases 1–3 completed successfully
  - Ensure no regressions in existing functionality
  - Ask the user if questions arise
