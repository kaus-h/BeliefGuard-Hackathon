# Bugfix Requirements Document

## Introduction

The BeliefGuard VS Code extension has multiple interrelated bugs preventing true end-to-end operation with the thinkN `beliefs` SDK, and critical architectural gaps in its patch generation and agent workflow compared to production-grade agent extensions like Cline.

The thinkN SDK issues are: (1) the `Beliefs` constructor call omits `writeScope`, causing ambiguous SDK behavior when thread-scoped mode is the default; (2) SDK method calls in `syncAddBelief()` may pass options not matching the documented `add()` API; (3) error handling catches generic `Error` instead of the SDK's exported `BetaAccessError` and `BeliefsError` types, losing structured retry guidance and error codes; (4) the custom 30-second timeout wrapper races against the SDK's own 120-second default timeout, causing premature aborts on legitimate slow calls; (5) the SDK `debug` mode is not exposed, making E2E validation opaque; and (6) stale top-of-file comments describe "fire-and-forget" and "graceful degradation" behavior that contradicts the current fail-fast sprint contract.

The agent workflow issues are: (7) the patch generator produces a single monolithic unified diff blob instead of per-file structured operations, making multi-file edits unreliable and preventing per-file review/approval; (8) the LLM is called exactly once for patch generation with no iterative tool-use loop, so the agent cannot read files, execute commands, or gather additional context mid-task; (9) the patch application is all-or-nothing with no per-file approval flow, unlike Cline's per-file prepare→approve→save cycle; and (10) the webview has no streaming feedback during LLM generation, leaving the user staring at a spinner with no visibility into what the agent is doing.

These bugs collectively prevent reliable E2E thinkN integration, limit the agent to trivial single-file edits, and create a poor developer experience compared to what the architecture promises.

## Cline Reference Analysis

The Cline source code (cloned to `cline-reference/`) was analyzed to understand how a production agent extension handles the same problems BeliefGuard faces. Key architectural differences:

### How Cline handles multi-file edits
Cline uses a structured `apply_patch` tool with a custom V4A diff format that supports `*** Add File:`, `*** Update File:`, `*** Delete File:`, and `*** Move to:` markers. Each file operation is parsed into a `PatchAction` with typed chunks, then processed per-file through a prepare→approve→save cycle (`ApplyPatchHandler.ts`). This means the user can approve or reject changes to individual files, and the system can show streaming diffs as the LLM generates them.

### How Cline's agent loop works
Cline uses a recursive `recursivelyMakeClineRequests()` loop where the LLM can invoke tools (read_file, write_to_file, apply_patch, execute_command, search_files, etc.) across multiple turns. Each tool call is parsed from the LLM's streaming output via `StreamResponseHandler`, executed by `ToolExecutor` with per-tool handlers, and the result is fed back to the LLM for the next turn. This allows the agent to: read files it needs, make edits, run commands to verify, and iterate — all within a single task.

### What BeliefGuard does differently (by design)
BeliefGuard intentionally separates plan extraction from patch generation (belief-governed execution). This is architecturally sound and should be preserved. However, the patch generation step itself is too constrained — it asks the LLM for a single unified diff in one shot, with no ability to read additional files or iterate on the output.

### What BeliefGuard should adapt (without copying Cline)
1. Per-file structured patch format instead of monolithic unified diff
2. Per-file review/approval flow in the webview
3. Streaming feedback during LLM generation
4. Optional iterative tool use within the patch generation phase (read files the LLM needs but weren't in initial context)

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `createClient(threadId)` is called THEN the system constructs `new Beliefs({ apiKey, agent, namespace, thread })` without setting `writeScope`, relying on the SDK's implicit default of `writeScope: 'thread'` — this makes the thread-scoped requirement implicit rather than explicit, and if the SDK default ever changes or if the constructor is called without a `threadId`, the scope mismatch is silent.

1.2 WHEN `syncAddBelief()` calls `this.thinkN.add(belief.statement, { confidence, type, source })` THEN the system passes `confidence`, `type`, and `source` as options — but the documented SDK `add()` signature is `add(text: string, options?)` where the accepted option fields are not confirmed to include `confidence` or `type`, risking silent rejection or unexpected behavior from the SDK.

1.3 WHEN any thinkN SDK call (`reset`, `before`, `add`, `after`, `read`) throws an error THEN the system catches it as a generic `Error` via `wrapThinkNError()`, losing the SDK's structured error information including `.code` (e.g., `rate_limit/exceeded`, `validation/invalid_params`), `.retryable`, and `.retryAfterMs` properties — and failing to distinguish `BetaAccessError` (401/403 auth failures) from `BeliefsError` (operational failures with retry guidance).

1.4 WHEN any thinkN SDK call takes longer than 30 seconds but less than 120 seconds THEN the system's `withTimeout()` wrapper rejects with a premature timeout error, even though the SDK's own default timeout is 120 seconds and the call may still be in progress — this causes false-positive timeout failures on legitimate slow network calls.

1.5 WHEN a developer runs F5 E2E validation THEN the system provides no SDK-level request/response logging because the `Beliefs` constructor is never passed `debug: true`, making it impossible to inspect what the SDK is actually sending and receiving during validation runs.

1.6 WHEN a developer reads `ThinkNClient.ts` THEN the top-of-file JSDoc and inline comments describe "fire-and-forget with try/catch wrappers" and "graceful degradation to local-only operation", which directly contradicts the current sprint's fail-fast contract where thinkN errors must halt the pipeline — this creates confusion about intended behavior during code review and handoff.

1.7 WHEN the `MainOrchestrator` reaches step 9 (patch generation) THEN the system calls `LLMClient.generateCodePatch()` which asks the LLM to produce a single monolithic unified diff string covering all target files — but the LLM frequently produces malformed multi-file diffs where hunk headers are missing, file boundaries are ambiguous, or paths are inconsistent, causing `parseUnifiedDiff()` to either fail or produce a single-change result even when multiple files need editing. Cline's `ApplyPatchHandler` solves this with a structured per-file patch format (`*** Update File:`, `*** Add File:`, `*** Delete File:`) that is unambiguous to parse.

1.8 WHEN the user submits a task that requires reading additional files, running commands, or iterating on partial results THEN the system has no mechanism for the LLM to request additional context mid-pipeline — the LLM receives one context blob at step 2 and must produce the complete plan and patch from that single context window. Cline's `recursivelyMakeClineRequests()` loop allows the LLM to invoke tools (read_file, execute_command, search_files) across multiple turns before producing the final output.

1.9 WHEN the generated patch spans multiple files THEN the system presents the entire patch as a single all-or-nothing approval in the webview — the user cannot review, approve, or reject changes to individual files. Cline's `ApplyPatchHandler` iterates through each file change with `prepareFileChange()` → `handleApproval()` → `saveFileChange()`, allowing per-file review with VS Code's native diff view.

1.10 WHEN the LLM is generating a plan or patch (steps 2 and 9) THEN the webview shows only a static "Processing…" spinner with no streaming feedback — the user has no visibility into what the agent is thinking or producing until the entire response is complete. Cline streams partial tool use blocks via `StreamResponseHandler` and shows real-time diff previews via `handlePartialBlock()` in each tool handler.

### Expected Behavior (Correct)

2.1 WHEN `createClient(threadId)` is called THEN the system SHALL explicitly pass `writeScope: 'thread'` in the constructor options alongside the `thread` parameter, making the scoping contract explicit and self-documenting — and when called without a `threadId`, the constructor SHALL still set `writeScope: 'thread'` so that `ensureReady()` catches the missing thread before any SDK call is attempted.

2.2 WHEN `syncAddBelief()` calls `this.thinkN.add()` THEN the system SHALL pass only the options documented in the SDK API (`add(text: string, options?)`) — if `confidence`, `type`, and `source` are not part of the documented options contract, they SHALL be omitted or restructured to match the SDK's actual accepted parameters.

2.3 WHEN any thinkN SDK call throws an error THEN the system SHALL import and check for `BetaAccessError` and `BeliefsError` from the `beliefs` package — `BetaAccessError` SHALL be surfaced as a fatal auth configuration error with a clear message about the API key, and `BeliefsError` SHALL preserve the `.code`, `.retryable`, and `.retryAfterMs` properties in the diagnostic output so that retry-eligible failures can be distinguished from permanent failures.

2.4 WHEN any thinkN SDK call is in progress THEN the system SHALL use a timeout value that is at least equal to the SDK's own default timeout (120 seconds), or SHALL delegate timeout management entirely to the SDK by passing the desired `timeout` value in the constructor — the custom `withTimeout()` wrapper SHALL NOT race against the SDK's internal timeout with a shorter duration.

2.5 WHEN the extension is running in a development/debug context (e.g., F5 Extension Development Host) THEN the system SHALL pass `debug: true` to the `Beliefs` constructor so that SDK-level request/response logging is available for E2E validation — this MAY be gated behind an environment variable (e.g., `BELIEFS_DEBUG=true`) or a VS Code configuration setting.

2.6 WHEN a developer reads `ThinkNClient.ts` THEN the top-of-file JSDoc and inline comments SHALL accurately reflect the current fail-fast contract: thinkN is a hard dependency during guarded-task execution, errors are propagated (not swallowed), and there is no silent local-only fallback in the guarded-task path.

2.7 WHEN the `MainOrchestrator` reaches patch generation THEN the system SHALL instruct the LLM to produce a structured per-file patch format with explicit file markers (e.g., `*** Update File: path/to/file`, `*** Add File: path/to/file`, `*** Delete File: path/to/file`) instead of a monolithic unified diff — the patch parser SHALL extract individual file operations from this format, producing a typed `Record<string, FileChange>` where each entry has a type (ADD, UPDATE, DELETE), old content, and new content. This format is unambiguous to parse and eliminates the multi-file boundary confusion inherent in raw unified diffs.

2.8 WHEN the user submits a task that may require additional context THEN the patch generation phase SHALL support an optional iterative loop where the LLM can request to read specific files before producing the final patch — the system SHALL provide a structured mechanism (e.g., a tool-use protocol or a multi-turn conversation) for the LLM to say "I need to read file X before I can produce the patch" and receive the file contents before continuing. This does NOT require a full Cline-style recursive tool loop — it can be a bounded read-only expansion phase between gate PROCEED and final patch generation.

2.9 WHEN the generated patch spans multiple files THEN the webview SHALL present each file change individually with its own approve/reject controls — the system SHALL iterate through file changes sequentially, showing a VS Code diff view for each file, and only applying changes that the user explicitly approves. Rejected individual file changes SHALL NOT block the application of approved changes to other files.

2.10 WHEN the LLM is generating a plan or patch THEN the webview SHALL display streaming progress feedback — at minimum, the system SHALL show which phase is active (extracting beliefs, grounding evidence, evaluating gate, generating patch) with real-time status updates. For patch generation specifically, the system SHOULD stream partial output to show the user which files are being targeted as the LLM produces them.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `beginTask(threadId)` is called with a valid non-empty thread ID THEN the system SHALL CONTINUE TO create a new thread-scoped `Beliefs` client and store the thread ID for the task lifecycle.

3.2 WHEN `ensureReady()` is called without a valid API key or thread ID THEN the system SHALL CONTINUE TO throw immediately with a descriptive error message and emit a diagnostic event, blocking the pipeline.

3.3 WHEN `addBelief()` is called THEN the system SHALL CONTINUE TO write the belief to the local `SessionStore` synchronously before attempting the remote thinkN sync.

3.4 WHEN `reset()` is called at task start THEN the system SHALL CONTINUE TO clear both the local `SessionStore` and the remote thinkN state for the active thread scope.

3.5 WHEN `getBeliefContext(input)` succeeds THEN the system SHALL CONTINUE TO return the `context.prompt` string from the thinkN `before()` response for use in LLM context enrichment.

3.6 WHEN `feedOutput(text, source)` succeeds THEN the system SHALL CONTINUE TO return `{ clarity, readiness }` from the thinkN `after()` response for pipeline audit logging.

3.7 WHEN `readThinkNState()` succeeds THEN the system SHALL CONTINUE TO return `{ clarity, contradictions, moves }` from the thinkN `read()` response.

3.8 WHEN the `MainOrchestrator` runs the full 11-step pipeline THEN the system SHALL CONTINUE TO execute steps in order: context collection → belief extraction → thinkN sync → evidence grounding → gate evaluation → clarification loop → patch generation → validation → diff delivery.

3.9 WHEN the `LLMClient` receives an empty `diffPatch` from the model THEN the system SHALL CONTINUE TO accept it without a Zod schema error, allowing non-concrete tasks to complete gracefully.

3.10 WHEN diagnostic events are emitted by `ThinkNClient` THEN the system SHALL CONTINUE TO route them through the `diagnosticReporter` callback to the orchestrator's audit timeline.

3.11 WHEN the `MainOrchestrator` runs the pipeline THEN the system SHALL CONTINUE TO enforce the belief-governed execution model: plan extraction and patch generation remain separate phases, beliefs must be extracted and grounded before any code is generated, and the gate must return PROCEED before patch generation begins. The iterative file-reading capability in 2.8 SHALL NOT bypass the gate — it operates only after PROCEED.

3.12 WHEN the `PatchGenerator` prompt instructs the LLM THEN the system SHALL CONTINUE TO require workspace-relative file paths, prohibit synthetic/placeholder file names, and require the LLM to return an empty patch for non-concrete tasks.

3.13 WHEN the `PatchValidator` validates a generated patch THEN the system SHALL CONTINUE TO check for USER_CONSTRAINT violations and REPO_FACT contradictions using the existing heuristic validation logic, regardless of whether the patch format changes from unified diff to structured per-file format.

## E2E Validation Requirements

4.1 AFTER each defect fix is implemented, the developer SHALL run a full E2E validation pass in the Extension Development Host (F5) to confirm the fix works in the real runtime environment — not just in unit tests or type checks.

4.2 The E2E validation SHALL follow this sequence for thinkN fixes (defects 1.1–1.6):
- Launch F5
- Submit task `hello` (non-concrete) → verify no `missing_thread` errors, no Zod schema crash, graceful "no actionable patch" message
- Submit a concrete coding task (e.g., "Add a comment to the top of extension.ts") → verify thinkN `reset()`, `before()`, `add()`, `after()` all succeed without errors in the audit timeline
- Inspect the audit timeline for thinkN diagnostic events showing real cloud responses (not fallback/local-only behavior)

4.3 The E2E validation SHALL follow this sequence for agent workflow fixes (defects 1.7–1.10):
- Submit a task that requires editing two or more files → verify the patch contains changes to multiple files and each file is individually reviewable
- Submit a task where the LLM would need to read a file not in the initial context → verify the iterative read mechanism provides the file content before patch generation
- During any LLM generation phase, verify the webview shows streaming progress (not just a static spinner)

4.4 Any E2E validation failure SHALL be documented with the exact error message, the pipeline step where it occurred, and the file/line that produced the error — this information SHALL be used to create a targeted fix before proceeding to the next defect.

4.5 The sprint is NOT complete until one full guarded task completes the entire 11-step pipeline with successful thinkN calls AND produces a multi-file patch that can be reviewed and applied per-file.
