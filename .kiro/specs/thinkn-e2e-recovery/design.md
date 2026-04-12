# thinkN E2E Recovery Bugfix Design

## Overview

BeliefGuard's thinkN integration and agent workflow have 10 interrelated defects preventing true end-to-end operation. The thinkN SDK wrapper (`ThinkNClient.ts`) has 6 configuration/contract mismatches (implicit writeScope, mismatched add() options, generic error handling, premature timeout, missing debug mode, stale comments). The agent workflow (`MainOrchestrator.ts`, `LLMClient.ts`, `PatchGenerator.ts`, `BeliefGuardProvider.ts`) has 4 architectural gaps (monolithic diff format, no iterative context, all-or-nothing approval, no streaming feedback).

The fix strategy is two-pronged:
1. Correct the thinkN SDK wrapper to match the documented API contract exactly, with proper error typing, timeout alignment, and debug visibility.
2. Evolve the patch generation and delivery pipeline from a single-shot monolithic diff to a structured per-file format with iterative context gathering, per-file approval, and streaming progress — all while preserving the belief-governed execution model (extract → ground → gate → generate).

## Glossary

- **Bug_Condition (C)**: The set of conditions across 10 defects where BeliefGuard's behavior diverges from the intended contract — SDK misconfiguration, lost error info, premature timeouts, monolithic diffs, single-shot context, all-or-nothing approval, and silent generation.
- **Property (P)**: The desired correct behavior for each defect — explicit SDK configuration, typed error handling, aligned timeouts, structured per-file patches, bounded iterative reads, per-file approval flow, and streaming progress.
- **Preservation**: The existing belief-governed execution model, local SessionStore synchronous writes, gate evaluation logic, pipeline step ordering, empty-diffPatch acceptance, and PatchValidator heuristic checking that must remain unchanged.
- **ThinkNClient / BeliefStateManager**: The class in `BeliefGuard/src/beliefs/ThinkNClient.ts` that wraps the `beliefs` SDK and manages dual-layer (local + remote) belief state.
- **MainOrchestrator**: The class in `BeliefGuard/src/controller/MainOrchestrator.ts` that executes the 11-step guarded task pipeline.
- **LLMClient**: The class in `BeliefGuard/src/ai/LLMClient.ts` that handles OpenRouter API calls for plan extraction and patch generation.
- **Structured Patch Format**: A new per-file patch format using `*** Begin Patch` / `*** Update File:` / `*** Add File:` / `*** Delete File:` / `*** End Patch` markers, adapted from Cline's V4A format to fit BeliefGuard's architecture.
- **Context Expansion Phase**: A bounded read-only loop between gate PROCEED and final patch generation where the LLM can request specific files to read before producing the patch.

## Bug Details

### Bug Condition

The bugs manifest across two domains: thinkN SDK integration (defects 1.1–1.6) and agent workflow architecture (defects 1.7–1.10). The thinkN defects cause silent misconfiguration, lost diagnostic information, and premature failures. The workflow defects cause unreliable multi-file edits, insufficient context for complex tasks, poor developer review experience, and opaque generation phases.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { operation: string, context: Record<string, any> }
  OUTPUT: boolean

  // thinkN SDK defects
  IF input.operation == 'createClient'
    RETURN NOT hasExplicitWriteScope(input.context.constructorOptions)
  IF input.operation == 'syncAddBelief'
    RETURN passesUndocumentedOptions(input.context.addOptions)
  IF input.operation == 'handleError'
    RETURN input.context.error IS BetaAccessError OR input.context.error IS BeliefsError
           AND NOT preservesStructuredErrorInfo(input.context.wrappedError)
  IF input.operation == 'withTimeout'
    RETURN input.context.timeoutMs < 120000
  IF input.operation == 'createClient' AND input.context.isDebugEnvironment
    RETURN NOT input.context.constructorOptions.debug
  IF input.operation == 'readComments'
    RETURN commentsDescribeGracefulDegradation(input.context.fileContent)

  // Agent workflow defects
  IF input.operation == 'generatePatch'
    RETURN input.context.targetFiles.length > 1
           AND input.context.patchFormat == 'monolithic-unified-diff'
  IF input.operation == 'gatherContext'
    RETURN input.context.llmNeedsAdditionalFiles
           AND NOT input.context.hasIterativeReadMechanism
  IF input.operation == 'approvePatch'
    RETURN input.context.patchFileCount > 1
           AND input.context.approvalGranularity == 'all-or-nothing'
  IF input.operation == 'generateWithLLM'
    RETURN NOT input.context.hasStreamingFeedback

  RETURN false
END FUNCTION
```

### Examples

- **1.1**: `createClient('thread-123')` produces `new Beliefs({ apiKey, agent, namespace, thread: 'thread-123' })` — missing `writeScope: 'thread'`. If SDK default changes, scope silently shifts.
- **1.3**: thinkN throws `BeliefsError` with `{ code: 'rate_limit/exceeded', retryable: true, retryAfterMs: 5000 }`. `wrapThinkNError()` wraps it as `new Error('thinkN add failed: rate_limit/exceeded')` — losing `.retryable` and `.retryAfterMs`.
- **1.4**: SDK call takes 45 seconds (legitimate slow network). `withTimeout()` rejects at 30s with a false-positive timeout, even though the SDK would have succeeded within its own 120s window.
- **1.7**: LLM produces a multi-file unified diff where the `---`/`+++` boundary between file 2 and file 3 is ambiguous. `parseUnifiedDiff()` merges them into one change or drops file 3 entirely.
- **1.9**: User wants to approve changes to `types.ts` but reject changes to `LLMClient.ts`. Current UI only offers "Apply Patch" (all) or "Reject Changes" (all).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The 11-step pipeline order in MainOrchestrator must remain: context → extraction → thinkN sync → grounding → gate → clarification → patch → validation → delivery
- Local SessionStore writes must remain synchronous before any remote thinkN sync
- The Confidence Gate decision matrix (BLOCK > ASK_USER > INSPECT_MORE > PROCEED) must remain unchanged
- Empty `diffPatch` from non-concrete tasks must continue to be accepted without schema errors
- The belief-governed execution model must be preserved: no code generation during extraction, beliefs must be extracted and grounded before patch generation, gate must return PROCEED before patch generation
- PatchValidator heuristic checking against USER_CONSTRAINT beliefs must continue to work regardless of patch format changes
- The iterative context expansion (defect 1.8) must NOT bypass the gate — it operates only after PROCEED
- Workspace-relative path resolution and synthetic file blocking must continue to work
- The clarification loop (ASK_USER → user answers → re-evaluate) must remain functional
- Diagnostic events must continue to route through the `diagnosticReporter` callback

**Scope:**
All inputs that do NOT involve the 10 specific defect conditions should be completely unaffected by these fixes. This includes:
- Single-file patch generation (should work with both old and new format)
- Non-concrete tasks returning empty patches
- Gate evaluation logic
- Evidence grounding heuristics
- Belief graph contradiction detection
- User clarification question generation

## Hypothesized Root Cause

Based on the codebase analysis, the root causes are:

1. **Implicit SDK Configuration (1.1, 1.5)**: `createClient()` was written before the SDK's thread-scoped defaults were fully understood. The constructor call omits `writeScope` and `debug` because the developer assumed defaults were sufficient. The fix is to make all configuration explicit.

2. **SDK API Contract Drift (1.2)**: `syncAddBelief()` passes `confidence`, `type`, and `source` as options to `add()`. The SDK documentation lists `confidence`, `type`, `source`, and `evidence` as valid options, so `confidence` and `source` are correct, but `type` needs to use the SDK's enum values (`'claim'|'assumption'|'evidence'|'risk'|'gap'|'goal'`). The current `mapBeliefTypeToThinkN()` mapping is correct, but the options object construction should be validated against the documented contract.

3. **Missing Error Type Imports (1.3)**: The `beliefs` package exports `BetaAccessError` and `BeliefsError` as named exports, but `ThinkNClient.ts` only imports the default `Beliefs` class. `wrapThinkNError()` catches `unknown` and wraps it as a generic `Error`, discarding the structured properties.

4. **Timeout Mismatch (1.4)**: `REMOTE_CALL_TIMEOUT_MS` is set to 30000 (30s) while the SDK's default is 120000 (120s). This was likely a conservative choice to prevent UI hangs, but it causes false-positive timeouts on legitimate slow calls.

5. **Comment Staleness (1.6)**: The top-of-file JSDoc was written during the original "graceful degradation" design phase and was never updated when the sprint pivoted to fail-fast. The runtime behavior is correct (fail-fast), but the comments are misleading.

6. **Single-Shot Patch Architecture (1.7, 1.8)**: The original design assumed the LLM could produce a correct multi-file unified diff in one shot. In practice, LLMs frequently produce malformed multi-file diffs because the `---`/`+++` boundary format is ambiguous when multiple files are involved. A structured format with explicit file markers eliminates this ambiguity.

7. **Missing Approval Granularity (1.9)**: The webview was built with a single `PATCH_READY` message containing the entire diff. There's no mechanism to decompose the patch into per-file units for individual review. The `showDiff` command already supports file selection via QuickPick, but the approval flow doesn't.

8. **Synchronous LLM Calls (1.10)**: `callOpenRouter()` uses `fetch()` and awaits the full response body before returning. There's no streaming path — the entire response is buffered before any UI update occurs.

## Correctness Properties

Property 1: Bug Condition — thinkN SDK Configuration Correctness

_For any_ call to `createClient(threadId)`, the resulting `Beliefs` constructor options SHALL include `writeScope: 'thread'` explicitly, and when the environment indicates debug mode (`BELIEFS_DEBUG=true` or Extension Development Host), the options SHALL include `debug: true`. The timeout used for SDK calls SHALL be >= 120000ms or delegated entirely to the SDK constructor.

**Validates: Requirements 2.1, 2.4, 2.5**

Property 2: Bug Condition — SDK Error Type Preservation

_For any_ error thrown by the thinkN SDK, if the error is an instance of `BetaAccessError`, the handler SHALL surface it as a fatal auth configuration error with the `.signupUrl` property preserved. If the error is an instance of `BeliefsError`, the handler SHALL preserve `.code`, `.retryable`, and `.retryAfterMs` in the diagnostic output.

**Validates: Requirements 2.3**

Property 3: Bug Condition — Structured Patch Format Parsing

_For any_ valid structured patch string using the `*** Begin Patch` / `*** Update File:` / `*** Add File:` / `*** Delete File:` / `*** End Patch` format, the parser SHALL produce a typed `StructuredPatch` object where each file operation has a correct type (ADD, UPDATE, DELETE), a valid workspace-relative path, and parseable content. The number of parsed file operations SHALL equal the number of file markers in the input.

**Validates: Requirements 2.7**

Property 4: Bug Condition — Per-File Approval Independence

_For any_ multi-file structured patch and any subset of files approved by the user, the system SHALL apply only the approved file changes to the workspace. Rejected file changes SHALL NOT be applied, and approved file changes SHALL NOT be affected by rejections of other files.

**Validates: Requirements 2.9**

Property 5: Preservation — Pipeline Order and Gate Integrity

_For any_ guarded task execution, the fixed system SHALL execute pipeline steps in the same order as the original (context → extraction → thinkN sync → grounding → gate → clarification → patch → validation → delivery), the gate decision matrix SHALL produce identical results for identical belief states, and local SessionStore writes SHALL continue to occur synchronously before remote thinkN sync.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11**

Property 6: Preservation — Empty Patch and Non-Concrete Task Handling

_For any_ non-concrete task (e.g., `hello`) where the LLM returns an empty `diffPatch`, the fixed system SHALL continue to accept it without schema errors and SHALL produce a graceful "no actionable patch" message, identical to the current behavior.

**Validates: Requirements 3.9, 3.12**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

### Group A: thinkN SDK Fixes (Defects 1.1–1.6)

**File**: `BeliefGuard/src/beliefs/ThinkNClient.ts`

**1. Explicit writeScope in constructor (1.1)**
- In `createClient()`, add `writeScope: 'thread'` to the Beliefs constructor options object
- This makes the thread-scoped contract explicit regardless of SDK defaults

**2. Validate add() options against SDK contract (1.2)**
- In `syncAddBelief()`, ensure the options passed to `this.thinkN.add()` match the documented SDK signature: `confidence?: number`, `type?: 'claim'|'assumption'|'evidence'|'risk'|'gap'|'goal'`, `source?: string`, `evidence?: string`
- The current `mapBeliefTypeToThinkN()` mapping is correct; verify the options object shape

**3. Import and handle BetaAccessError / BeliefsError (1.3)**
- Add named imports: `import Beliefs, { BetaAccessError, BeliefsError } from 'beliefs'`
- Replace `wrapThinkNError()` with a typed error handler that:
  - Checks `instanceof BetaAccessError` → surfaces fatal auth error with `.signupUrl`
  - Checks `instanceof BeliefsError` → preserves `.code`, `.retryable`, `.retryAfterMs` in diagnostic output
  - Falls back to generic Error wrapping for unknown errors

**4. Align timeout with SDK default (1.4)**
- Change `REMOTE_CALL_TIMEOUT_MS` from `30000` to `120000` (matching SDK default)
- Alternatively, remove the custom `withTimeout()` wrapper entirely and pass `timeout: 120000` in the constructor, letting the SDK manage its own timeouts

**5. Enable debug mode for development (1.5)**
- In `createClient()`, check for `process.env.BELIEFS_DEBUG === 'true'` or VS Code debug session detection
- Pass `debug: true` to the Beliefs constructor when in development/debug context

**6. Update stale comments (1.6)**
- Replace the top-of-file JSDoc in `ThinkNClient.ts` to reflect the fail-fast contract
- Remove references to "fire-and-forget", "graceful degradation", and "local-only operation"
- Document that thinkN is a hard dependency during guarded-task execution

### Group B: Agent Workflow Fixes (Defects 1.7–1.10)

**7. Structured per-file patch format (1.7)**

**File**: `BeliefGuard/src/types.ts`
- Add new types: `FileChangeType` (`'ADD' | 'UPDATE' | 'DELETE'`), `FileChange` (type, path, content/hunks), `StructuredPatch` (files array, metadata)

**File**: `BeliefGuard/src/utils/unifiedDiff.ts`
- Add `parseStructuredPatch(text: string): StructuredPatch` — parses the `*** Begin Patch` format into typed per-file operations
- Add `applyStructuredPatchToWorkspace(patch: StructuredPatch): Promise<void>` — applies individual file changes
- Keep existing unified diff functions for backward compatibility

**File**: `BeliefGuard/src/prompts/PatchGenerator.ts`
- Update the prompt to instruct the LLM to produce the structured patch format instead of raw unified diff
- Include format examples in the prompt: `*** Begin Patch`, `*** Update File: path`, `*** Add File: path`, `*** Delete File: path`, `*** End Patch`
- Each file section uses `+`/`-`/` ` line prefixes with `@@` context markers for updates

**File**: `BeliefGuard/src/ai/LLMClient.ts`
- Update `PatchGenerationResultSchema` to expect `structuredPatch` (string in the new format) instead of `diffPatch`
- Update `generateCodePatch()` to return the structured patch string

**File**: `BeliefGuard/src/controller/MainOrchestrator.ts`
- Update step 9 to parse the structured patch format
- Update step 10 to validate per-file
- Update step 11 to deliver per-file for approval

**8. Iterative context expansion (1.8)**

**File**: `BeliefGuard/src/ai/LLMClient.ts`
- Add a `requestContextExpansion(task, plan, beliefs, currentContext)` method that:
  - Asks the LLM what additional files it needs to read
  - Returns a list of file paths (or empty if no expansion needed)
- This is a bounded loop (max 3 iterations) — not a full recursive tool loop

**File**: `BeliefGuard/src/controller/MainOrchestrator.ts`
- Between gate PROCEED and patch generation (between steps 8 and 9), add a context expansion phase:
  - Call `requestContextExpansion()` to get file read requests
  - Read the requested files from the workspace
  - Append their contents to the context
  - Repeat up to 3 times or until the LLM says it has enough context
- Pass the expanded context to `generateCodePatch()`

**9. Per-file approval flow (1.9)**

**File**: `BeliefGuard/src/types.ts`
- Add new webview message types: `FILE_CHANGE_READY`, `FILE_APPROVED`, `FILE_REJECTED`, `FILE_REVIEW_COMPLETE`
- Add `PerFileReviewState` type tracking approval status per file

**File**: `BeliefGuard/src/webview/BeliefGuardProvider.ts`
- Add `postFileChangeReady(fileChange, index, total)` method
- Add `onFileApproved` and `onFileRejected` event emitters
- Update webview HTML/JS to render per-file review cards with individual approve/reject buttons
- Each file card shows the file path, change type (ADD/UPDATE/DELETE), and line counts

**File**: `BeliefGuard/src/controller/MainOrchestrator.ts`
- After patch validation passes, iterate through file changes:
  - For each file, post `FILE_CHANGE_READY` to the webview
  - Open VS Code diff view for the file
  - Await user approval/rejection
  - If approved, apply that file's changes
  - If rejected, skip and continue to next file
- After all files processed, post summary of applied/rejected changes

**10. Streaming feedback (1.10)**

**File**: `BeliefGuard/src/ai/LLMClient.ts`
- Add a `callOpenRouterStreaming(prompt, options, onChunk)` method that:
  - Uses `fetch()` with `stream: true` in the request body
  - Reads the response as a ReadableStream
  - Parses SSE chunks and calls `onChunk(partialText)` for each delta
- Update `generateCodePatch()` to optionally use streaming, passing partial results to a callback

**File**: `BeliefGuard/src/webview/BeliefGuardProvider.ts`
- Add `postStreamingChunk(phase, partialText)` method
- Update webview HTML/JS to render streaming progress:
  - Show which pipeline phase is active
  - For patch generation, show file targets as they appear in the stream

**File**: `BeliefGuard/src/controller/MainOrchestrator.ts`
- Wire the streaming callback from LLMClient to the webview provider
- Post phase-level progress updates at each pipeline step transition

**File**: `BeliefGuard/src/types.ts`
- Add `STREAMING_CHUNK` to `ExtensionToWebviewMessage` union

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior. Given the 10 defects span both SDK integration and UI/workflow concerns, testing is organized by domain.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write targeted tests for each defect that exercise the buggy code path and observe the failure mode. Run on UNFIXED code.

**Test Cases**:

1. **SDK writeScope Test (1.1)**: Inspect the Beliefs constructor call — verify `writeScope` is absent (will confirm on unfixed code)
2. **SDK add() Options Test (1.2)**: Mock `thinkN.add()` and inspect the options argument — verify undocumented fields are passed (will confirm on unfixed code)
3. **Error Type Loss Test (1.3)**: Throw a mock `BeliefsError` with `.code`, `.retryable`, `.retryAfterMs` and verify `wrapThinkNError()` discards them (will confirm on unfixed code)
4. **Premature Timeout Test (1.4)**: Create a promise that resolves at 45s and verify `withTimeout()` rejects at 30s (will confirm on unfixed code)
5. **Missing Debug Test (1.5)**: Set `BELIEFS_DEBUG=true` and verify the constructor does NOT pass `debug: true` (will confirm on unfixed code)
6. **Multi-File Diff Ambiguity Test (1.7)**: Generate a 3-file unified diff with ambiguous boundaries and verify `parseUnifiedDiff()` produces incorrect results (will confirm on unfixed code)
7. **Single-Shot Context Test (1.8)**: Submit a task requiring file reads and verify no iterative mechanism exists (will confirm on unfixed code)
8. **All-or-Nothing Approval Test (1.9)**: Generate a 2-file patch and verify only "Apply Patch" (all) and "Reject Changes" (all) are available (will confirm on unfixed code)
9. **No Streaming Test (1.10)**: Start a patch generation and verify no streaming events are emitted to the webview (will confirm on unfixed code)

**Expected Counterexamples**:
- Constructor options missing `writeScope` and `debug`
- `wrapThinkNError()` returns `Error` without `.code`, `.retryable`, `.retryAfterMs`
- `withTimeout()` rejects at 30s for a 45s call
- `parseUnifiedDiff()` returns 1 or 2 changes for a 3-file diff
- Webview receives no streaming events during generation

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Specific Fix Checks:**

- `createClient(threadId)` → constructor options include `writeScope: 'thread'`
- `createClient(threadId)` with `BELIEFS_DEBUG=true` → constructor options include `debug: true`
- `wrapThinkNError(BetaAccessError)` → preserves `.signupUrl`, surfaces auth error
- `wrapThinkNError(BeliefsError)` → preserves `.code`, `.retryable`, `.retryAfterMs`
- `withTimeout()` timeout >= 120000ms
- `parseStructuredPatch(multiFilePatch)` → correct number of file operations
- Per-file approval with partial approvals → only approved files applied
- Streaming generation → webview receives chunk events

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Pipeline Order Preservation**: Verify the 11-step pipeline executes in the same order after fixes — audit events should appear in the same sequence
2. **Gate Decision Preservation**: For any belief state, `evaluateState()` returns the same decision before and after fixes
3. **Local Store Synchronous Write Preservation**: Verify `addBelief()` writes to SessionStore before any async thinkN call
4. **Empty Patch Preservation**: Verify non-concrete tasks still produce graceful "no actionable patch" flow
5. **Single-File Patch Preservation**: Verify single-file patches still work correctly with the new format
6. **PatchValidator Preservation**: Verify constraint violation detection works with the new structured patch format
7. **Clarification Loop Preservation**: Verify ASK_USER → user answers → re-evaluate still works
8. **Diagnostic Event Preservation**: Verify thinkN diagnostic events still route through `diagnosticReporter`

### Unit Tests

- Test `createClient()` constructor options for all combinations of threadId and debug environment
- Test `wrapThinkNError()` with BetaAccessError, BeliefsError, and generic Error instances
- Test `parseStructuredPatch()` with single-file, multi-file, add, update, delete, and mixed operations
- Test `applyStructuredPatchToWorkspace()` with valid and invalid patches
- Test per-file approval state machine (approve all, reject all, mixed)
- Test streaming chunk parsing from SSE format
- Test iterative context expansion with 0, 1, 2, 3, and max iterations
- Test timeout constant is >= 120000

### Property-Based Tests

- Generate random structured patch strings and verify round-trip: generate → parse → verify structure matches
- Generate random belief states and verify gate decisions are identical before and after fixes
- Generate random multi-file patches with random approval subsets and verify only approved files are applied
- Generate random SDK error types and verify error handler preserves type-specific properties
- Generate random non-concrete tasks and verify empty patch handling is unchanged

### Integration Tests

- **E2E: hello task** — F5 launch → submit `hello` → verify no thinkN errors, graceful no-patch flow, audit timeline shows thinkN lifecycle events
- **E2E: single-file task** — F5 launch → submit concrete single-file edit → verify full thinkN lifecycle (reset, before, add, after), structured patch generated, per-file review works
- **E2E: multi-file task** — F5 launch → submit concrete multi-file edit → verify structured patch with multiple file operations, per-file approval flow, streaming progress visible
- **E2E: thinkN error handling** — Temporarily use invalid API key → verify BetaAccessError is surfaced with auth-specific messaging, pipeline halts cleanly
- **E2E: context expansion** — Submit task requiring file not in initial context → verify iterative read mechanism provides the file before patch generation
- Document any failures with exact error message, pipeline step, and file/line

### E2E Validation Plan

The following concrete validation sequence must be executed in the Extension Development Host (F5):

**Phase 1: thinkN SDK Validation (after defects 1.1–1.6 are fixed)**
1. F5 launch → submit `hello` → verify:
   - No `missing_thread` errors in console
   - Audit timeline shows `thinkN thread scope initialized` with `writeScope: 'thread'`
   - `thinkN reset succeeded`, `thinkN before succeeded` events appear
   - Graceful "no actionable patch" message (no Zod crash)
2. F5 launch → submit "Add a comment to the top of extension.ts" → verify:
   - `thinkN add succeeded` events for each extracted belief
   - `thinkN after succeeded` for plan fusion
   - No premature timeout errors (calls that take 30-120s should succeed)
3. If `BELIEFS_DEBUG=true` is set in `.env`, verify SDK-level request/response logging appears in console

**Phase 2: Agent Workflow Validation (after defects 1.7–1.10 are fixed)**
4. F5 launch → submit a task requiring 2+ file edits → verify:
   - Structured patch format is generated (not monolithic unified diff)
   - Each file appears as a separate reviewable unit in the webview
   - User can approve file A and reject file B independently
   - Only approved files are applied to workspace
5. F5 launch → submit a task requiring a file not in initial context → verify:
   - Context expansion phase requests the file
   - File contents are provided to the LLM before patch generation
6. During any LLM generation, verify:
   - Webview shows streaming progress (not just static spinner)
   - Phase indicators update in real time

**Phase 3: Full Pipeline Validation**
7. F5 launch → submit a complex multi-file task → verify the complete pipeline:
   - thinkN lifecycle (reset → before → add → after) succeeds
   - Beliefs extracted and grounded
   - Gate evaluates correctly
   - Context expansion provides needed files
   - Structured patch generated with per-file operations
   - Per-file review and approval works
   - Applied changes are correct in workspace
   - Audit timeline reflects all steps with thinkN diagnostics
8. Any failure → document exact error, pipeline step, file/line → fix before proceeding
