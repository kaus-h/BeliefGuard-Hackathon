# AGENTS.md — BeliefGuard Source of Truth, E2E Onboarding, and Developer Handoff

This document is the **authoritative onboarding and handoff reference** for the BeliefGuard project.

It is intended to give a new developer, AI coding agent, reviewer, or hackathon judge enough context to:

- understand **what BeliefGuard is**,
- understand **why it exists**,
- understand **how the current codebase is structured**,
- understand **what has already been implemented**,
- understand **what is still in progress**,
- understand **how to test the system correctly**,
- and continue development without losing architectural intent.

Where possible, this file cites the concrete implementation files that currently embody each subsystem.

---

## 1. Executive Summary

**BeliefGuard** is a VS Code / Antigravity extension that inserts a **belief-aware governance layer** between a developer and an autonomous coding workflow.

Its purpose is to prevent **agent drift**: the failure mode where an AI coding agent turns uncertain assumptions into concrete file edits without first validating whether those assumptions are actually true in the current repository or acceptable to the user.

BeliefGuard solves that by combining three ideas:

1. a **Repo Belief Graph** that stores extracted beliefs, evidence, contradictions, and validation state,
2. a **Confidence-to-Action Gate** that decides whether the agent can proceed, should investigate further, must ask the user, or must be blocked,
3. a **thinkN / `beliefs` SDK integration** that is intended to serve as the canonical remote belief-state engine and contradiction-memory substrate.

At a high level, BeliefGuard works like this:

1. user submits a task,
2. repository context is gathered,
3. the LLM generates an **execution plan + explicit beliefs**, not code,
4. beliefs are grounded against the workspace,
5. the gate evaluates whether uncertainty is acceptable,
6. only when beliefs are sufficiently validated does the system request a code patch,
7. the patch is validated and then surfaced for developer review.

---

## 2. Product Thesis and Hackathon Positioning

### 2.1 The core thesis

BeliefGuard is based on the idea that coding agents fail **not only because they lack context**, but because they lack **structured, explicit beliefs**.

Traditional agent workflows:

- retrieve files,
- ask an LLM for a solution,
- apply a patch.

BeliefGuard inserts a governance step that asks:

- What is the agent assuming?
- What is actually supported by repository evidence?
- What remains uncertain?
- Which uncertainties are dangerous enough to block edits?
- What should be clarified before code is touched?

### 2.2 Hackathon alignment

BeliefGuard is designed for the VillageHacks / thinkN track, where the problem is explicitly about the gap between:

- agent **memory**, and
- agent **belief coherence**.

The project’s value proposition is strongest when thinkN is not decorative, but **integral**.

That is why the active sprint direction (see `New_sprint.md`) treats thinkN as a **hard dependency for milestone validation** rather than an optional enhancement.

### 2.3 Canonical concept source

The original architectural blueprint and implementation specification live in:

- `VS Code Extension_ Belief Graph & Action Gate.txt`

That file contains:

- the conceptual architecture,
- the node/edge taxonomy,
- the gate decision matrix,
- the thinkN integration rationale,
- the modular agent partitioning strategy,
- and the intended end-to-end runtime flow.

This `AGENTS.md` file translates that blueprint into the **current actual codebase state**.

---

## 3. What BeliefGuard Is Supposed to Do

BeliefGuard is meant to implement the following workflow:

1. **Task submission** via sidebar chat/webview.
2. **Context collection** from the current workspace.
3. **Plan and belief extraction** from an LLM.
4. **Belief graph population** into local state + thinkN.
5. **Evidence grounding** against source/config/workspace artifacts.
6. **Gate evaluation** according to risk/confidence/contradictions.
7. **Clarification loop** when high-risk beliefs remain unresolved.
8. **Patch generation** only after the gate returns `PROCEED`.
9. **Patch validation** against validated user constraints.
10. **Diff review / patch approval** in the editor UI.

In other words:

> BeliefGuard is not a patch generator first. It is a **belief-governed execution controller** first.

---

## 4. Architectural Blueprint vs. Current Implementation

### 4.1 Blueprint pillars

From `VS Code Extension_ Belief Graph & Action Gate.txt`, the system has two foundational pillars:

1. **Repo Belief Graph**
2. **Confidence-to-Action Gate**

Those pillars are present in the current implementation, though some parts are more mature than others.

### 4.2 Current code realization

The current codebase implements the architecture across these primary layers:

- **UI / Extension shell**
  - `BeliefGuard/src/extension.ts`
  - `BeliefGuard/src/webview/BeliefGuardProvider.ts`
  - `BeliefGuard/src/commands/showDiff.ts`
  - `BeliefGuard/src/commands/applyPatch.ts`

- **LLM orchestration / prompts**
  - `BeliefGuard/src/ai/LLMClient.ts`
  - `BeliefGuard/src/prompts/Extractor.ts`
  - `BeliefGuard/src/prompts/PatchGenerator.ts`

- **Belief state / thinkN integration**
  - `BeliefGuard/src/beliefs/ThinkNClient.ts`
  - `BeliefGuard/src/beliefs/BeliefGraph.ts`
  - `BeliefGuard/src/state/SessionStore.ts`
  - `BeliefGuard/src/beliefs/types.ts`

- **Workspace context and grounding**
  - `BeliefGuard/src/context/WorkspaceScanner.ts`
  - `BeliefGuard/src/context/EvidenceLocator.ts`
  - `BeliefGuard/src/utils/fs.ts`

- **Policy / validation**
  - `BeliefGuard/src/gate/ConfidenceGate.ts`
  - `BeliefGuard/src/gate/QuestionGenerator.ts`
  - `BeliefGuard/src/validation/PatchValidator.ts`

- **Patch parsing / workspace application**
  - `BeliefGuard/src/utils/unifiedDiff.ts`

- **System-wide shared contracts**
  - `BeliefGuard/src/types.ts`

---

## 5. Repository Structure and File-by-File Responsibilities

## 5.1 Root-level files

### `BeliefGuard/package.json`
Defines the extension package identity, commands, sidebar container, dependencies, and build scripts.

Notable facts:

- extension name: `beliefguard`
- entrypoint: `./out/extension.js`
- main commands currently contributed:
  - `beliefguard.startGuardedTask`
  - `beliefguard.showDiff`
- dependencies include:
  - `beliefs`
  - `zod`
  - `uuid`
  - `ai`
  - `@ai-sdk/openai`

### `BeliefGuard/tsconfig.json`
Current TypeScript configuration.

Important characteristics:

- `rootDir: src`
- `outDir: out`
- `strict: true`
- `module: commonjs`
- build target: `ES2022`

### `VS Code Extension_ Belief Graph & Action Gate.txt`
The original architecture manifesto and implementation blueprint.

### `New_sprint.md`
Current sprint plan focused on thinkN E2E restoration, fail-fast enforcement, and F5-based validation.

---

## 5.2 Extension shell and UI

### `BeliefGuard/src/extension.ts`
Primary activation entrypoint.

Responsibilities:

- loads `.env` from the extension root,
- creates the webview provider,
- creates the main orchestrator,
- wires `TASK_SUBMITTED` events to `runGuardedTask`,
- registers:
  - sidebar focus command,
  - diff review command,
  - patch apply command.

This is the main connection point between VS Code / Antigravity host lifecycle and BeliefGuard runtime.

### `BeliefGuard/src/webview/BeliefGuardProvider.ts`
The sidebar UI provider and message bridge.

Responsibilities:

- renders a chat-first sidebar,
- stores the latest pending diff patch,
- receives messages from the UI:
  - `TASK_SUBMITTED`
  - `USER_ANSWERED`
  - `REVIEW_DIFF`
  - `APPLY_PATCH`
  - `REJECT_PATCH`
- posts messages to the UI:
  - processing updates,
  - beliefs / questions,
  - audit events,
  - patch-ready cards,
  - errors / blocked states,
  - assistant narrative messages.

UI features visible in implementation:

- chat thread,
- audit timeline,
- belief graph snapshot,
- patch summary card,
- clarification question cards,
- review/apply/reject actions.

Important current behavior:

- audit events are selectively mirrored into chat,
- patch text is kept separate from ordinary assistant narration,
- this separation is intentional and aligns with the architecture direction.

### `BeliefGuard/src/commands/showDiff.ts`
Opens a workspace-oriented diff review.

Responsibilities:

- parses unified diff text,
- lets the user choose which file to inspect when the patch spans multiple files,
- reconstructs proposed file content with `applyUnifiedDiffToText`,
- opens a VS Code diff view using content providers.

### `BeliefGuard/src/commands/applyPatch.ts`
Applies the currently pending unified diff to the workspace after user confirmation.

Responsibilities:

- confirmation modal,
- unified diff normalization,
- workspace edit application via `applyUnifiedDiffToWorkspace`.

---

## 5.3 Shared data contracts

### `BeliefGuard/src/types.ts`
This is the canonical shared contract layer across the extension.

Important types currently defined here:

- `RiskLevel`
- `GateDecision`
- `SourceType`
- `BeliefType`
- `Evidence`
- `Belief`
- `AgentPlan`
- `ClarificationQuestion`
- `ValidationResult`
- `PatchFileSummary`
- `PatchSummary`
- `PatchGenerationResult`
- audit-related types:
  - `AuditLevel`
  - `AuditPhase`
  - `AuditEvent`
- webview message unions:
  - `WebviewToExtensionMessage`
  - `ExtensionToWebviewMessage`

Important current note:

- `AuditPhase` now includes a dedicated `thinkn` phase, which is used for detailed thinkN diagnostics in the audit timeline.

### `BeliefGuard/src/beliefs/types.ts`
Belief-domain-specific types that re-export shared types and define graph-specific additions like:

- `EdgeRelation`
- `BeliefEdge`
- `BeliefGraphSnapshot`

---

## 5.4 Context gathering and evidence grounding

### `BeliefGuard/src/context/WorkspaceScanner.ts`
Builds the repository context string that is fed into the LLM.

Current behavior:

- enumerates directory structure up to 3 levels,
- ignores noisy directories like `node_modules`, `.git`, `dist`, `build`, `out`,
- reads common manifests:
  - `package.json`
  - `tsconfig.json`
  - `pom.xml`
  - `requirements.txt`
- captures visible editor contents.

This is effectively the primary context packaging layer for extraction.

### `BeliefGuard/src/context/EvidenceLocator.ts`
Heuristic grounding engine for beliefs.

Current implemented heuristics:

- framework detection via `package.json`
- direct file matching based on keyword-like filenames
- snippet extraction from matching content

Important note:

- this is currently heuristic and lightweight, not AST-grade full semantic grounding.
- it still forms the backbone of the `INSPECT_MORE` and grounding phases.

### `BeliefGuard/src/utils/fs.ts`
Safe file reading utility layer used by context collection / evidence extraction.

---

## 5.5 Belief state and graph logic

### `BeliefGuard/src/state/SessionStore.ts`
In-memory singleton used as the local belief/evidence/edge store.

Stores:

- beliefs map,
- evidence map,
- graph edges array.

Provides:

- CRUD-ish belief access,
- evidence registration,
- edge registration,
- session clear/reset,
- global singleton access.

Important role:

- this is the immediate synchronous backing store consumed by gate logic and graph queries.

### `BeliefGuard/src/beliefs/BeliefGraph.ts`
Read-only graph query / contradiction helper layer.

Current responsibilities:

- query unverified high-risk beliefs,
- query unverified beliefs,
- query contradicted beliefs,
- detect contradictions heuristically,
- snapshot graph state.

Important note:

- contradiction detection currently includes a deterministic fallback heuristic using token overlap and curated negation pairs.

### `BeliefGuard/src/beliefs/ThinkNClient.ts`
This is the most important current subsystem for the active sprint.

Current implemented role:

- wraps the `beliefs` SDK,
- maintains local + remote belief synchronization,
- now enforces **per-task thread scoping**,
- now fails fast instead of silently degrading during guarded-task execution,
- emits detailed thinkN diagnostics.

Important current methods:

- `beginTask(threadId)`
- `setDiagnosticReporter(...)`
- `ensureReady()`
- `addBelief(...)`
- `addBeliefs(...)`
- `updateBeliefConfidence(...)`
- `reset()`
- `readThinkNState()`
- `getBeliefContext(...)`
- `feedOutput(...)`

Important current design state:

- the code now creates a thread-scoped client with constructor-level `thread` config,
- no silent local-only fallback is used in the guarded-task path for this sprint,
- diagnostic events are emitted for:
  - thread initialization,
  - readiness failures,
  - reset/before/add/after/read/evidence-sync lifecycle steps.

Important caveat:

- some top-of-file comments still mention graceful degradation to local-only mode, but the current sprint behavior intentionally moved toward **fail-fast** for guarded-task validation.
- this document reflects the **actual runtime intent**, which currently favors hard failure if thinkN is not ready.

---

## 5.6 Gate and question system

### `BeliefGuard/src/gate/ConfidenceGate.ts`
Deterministic gate evaluator.

Priority order in current implementation:

1. `BLOCK` for contradictions against immutable beliefs,
2. `ASK_USER` for unresolved high-risk beliefs,
3. `INSPECT_MORE` for low-confidence beliefs,
4. `PROCEED` otherwise.

This mirrors the intended decision matrix from the blueprint.

### `BeliefGuard/src/gate/QuestionGenerator.ts`
Converts unresolved high-risk beliefs into human-readable clarification prompts.

Current behavior:

- only unvalidated + high-risk beliefs become user questions,
- generates a yes/no style question payload.

---

## 5.7 LLM orchestration and prompts

### `BeliefGuard/src/prompts/Extractor.ts`
System prompt for planning + belief extraction.

Current design:

- forbids executable code,
- requires an `AgentPlan`-shaped response,
- instructs the model to emit explicit beliefs,
- emphasizes risk-leveling and uncertainty surfacing.

### `BeliefGuard/src/prompts/PatchGenerator.ts`
System prompt for final patch generation.

Current design:

- requires a JSON object containing:
  - `assistantMessage`
  - `diffPatch`
- explicitly separates chat explanation from file-edit output,
- insists on workspace-relative paths,
- instructs the model **not** to invent synthetic/placeholder files,
- tells the model to return an empty `diffPatch` when the task is not concrete enough to map to repository edits.

### `BeliefGuard/src/ai/LLMClient.ts`
The actual OpenRouter-backed LLM integration.

Current responsibilities:

- plan extraction with Zod schema validation,
- patch generation with structured JSON parsing,
- retries with backoff,
- response normalization,
- plan tuning for gate sensitivity.

Important current implementation details:

- `generatePlanAndBeliefs(...)` expects structured JSON first, then a fallback JSON-text parse path.
- `generateCodePatch(...)` expects a `PatchGenerationResult` object.
- **Important recent fix:** `diffPatch` is now allowed to be an empty string, so non-concrete tasks like `hello` do not crash the pipeline with a schema error.

This change is important because it reflects the deliberate contract already present in `PatchGenerator.ts`.

---

## 5.8 Unified diff handling and patch validation

### `BeliefGuard/src/utils/unifiedDiff.ts`
Handles unified diff parsing, normalization, summarization, path resolution, preview application, and workspace application.

Current responsibilities:

- parse unified diffs,
- normalize fenced/raw diff content,
- apply hunks to text,
- resolve diff file paths into workspace-relative paths,
- summarize patch contents,
- apply patch edits through `WorkspaceEdit`.

This file is central to the distinction between:

- legitimate workspace patch targets, and
- bad / synthetic / unresolved targets.

### `BeliefGuard/src/validation/PatchValidator.ts`
Secondary heuristic validator for generated patches.

Current validation model:

- parses modified files from unified diff headers,
- extracts keywords from validated `USER_CONSTRAINT` beliefs,
- flags violations based on:
  - file overlap,
  - negation pattern conflict.

Important note:

- this is heuristic validation, not semantic execution validation.
- it is still a core safeguard in the current pipeline.

---

## 6. The Current Runtime Pipeline (Actual Code Path)

The current runtime path is primarily implemented in:

- `BeliefGuard/src/controller/MainOrchestrator.ts`

### 6.1 Current execution sequence

1. generate a guarded-task thinkN thread id,
2. initialize thread-scoped thinkN client,
3. reset local + remote task-scoped state,
4. request thinkN belief context (`before()`),
5. gather workspace context,
6. generate an agent plan + extracted beliefs,
7. register beliefs locally and sync to thinkN,
8. feed output back into thinkN (`after()`),
9. ground beliefs using workspace evidence,
10. evaluate gate,
11. if needed, ask user clarifying questions,
12. if `PROCEED`, request structured patch output,
13. normalize and validate the unified diff,
14. surface the patch for review/apply.

### 6.2 Important current runtime improvements

The following were implemented during the current sprint:

- **per-task thinkN thread binding**
- **fail-fast readiness gating**
- **structured thinkN audit instrumentation**
- **separation of assistant narration vs patch payload**
- **blocking of unresolved/non-workspace patch targets**
- **graceful handling of empty `diffPatch` for non-concrete tasks**

---

## 7. Current Sprint State (Exact Development Status)

This section is critical for handoff.

The current active sprint is documented in:

- `New_sprint.md`

### 7.1 What has been accomplished

#### thinkN / Phase 1 and 2 progress

Implemented:

- Option A: **per-task thread binding**
- fail-fast thinkN readiness gating at guarded-task start
- thinkN diagnostic audit stream

Evidence from recent debugging:

- the earlier `missing_thread` failure is no longer the first blocker in F5 runs,
- the pipeline progressed far enough to hit patch generation,
- meaning thinkN thread scoping and readiness are functioning substantially better than before.

#### patch pipeline progress

Implemented:

- assistant chat text separated from patch output,
- unresolved/non-workspace patch targets are blocked explicitly,
- non-concrete tasks can intentionally return empty `diffPatch` without schema failure.

### 7.2 The latest observed runtime blocker sequence

Recent debugging showed this evolution:

1. **Old failure:** thinkN missing-thread errors
2. **After thread fix:** pipeline advanced to patch stage
3. **Next failure:** unresolved/non-workspace patch targets
4. **After handling improvement:** non-concrete task `hello` produced empty `diffPatch`
5. **Schema bug discovered:** `LLMClient` originally rejected empty `diffPatch`
6. **Schema fix applied:** empty `diffPatch` now allowed

Therefore, the latest known state is:

> thinkN is no longer the primary blocker in the `hello` test case.

The next validation step is to re-run F5 and confirm that:

- a conversational/non-concrete task results in a graceful “no actionable patch” path,
- not a crash,
- and then proceed to a real coding task for deeper verification.

### 7.3 Current sprint phase mapping

From the actual sprint trajectory:

- **Phase 1 (thinkN thread scoping): mostly implemented**
- **Phase 2 (readiness gating): implemented**
- **Phase 3 (F5 E2E validation): actively in progress**
- **Phase 4 (patch/channel hardening): partially underway because runtime testing exposed patch-contract issues**
- **Phase 5 (broader UI/product polish): not yet resumed as a primary focus**

---

## 8. Known Non-Root-Cause Noise

The following logs have appeared but are not currently treated as the core blocker:

- `punycode` deprecation warning
- `UnleashProvider must be initialized first!`
- `Running in One LS mode...`
- `No debugger available...`

These should be documented and not confused with the belief-pipeline failures.

---

## 9. Testing and Verification Workflow

### 9.1 Correct way to test

**Do not** use the `code` command or launch a separate editor window as the primary verification path.

The correct runtime validation environment is:

- **Extension Development Host launched with Run and Debug / F5**

This is important enough to restate:

> Runtime validation must happen in the actual extension development/debug environment, not in an independently launched window.

### 9.2 Recommended F5 validation sequence

#### First validation task

Use:

- `hello`

Expected result now:

- thinkN thread scope initializes,
- `reset()` succeeds,
- `before()` succeeds,
- the run reaches patch generation,
- no Zod schema exception for empty `diffPatch`,
- BeliefGuard gracefully reports that no actionable workspace patch was produced for a non-concrete task.

#### Second validation task

Use a real coding request, e.g. a concrete repository edit.

Expected result:

- beliefs extracted,
- thinkN sync succeeds,
- grounding runs,
- gate decision is meaningful,
- patch generation produces real repository-relative diff targets,
- patch validation and review flow work without synthetic/unknown-file drift.

### 9.3 What to inspect during runtime

In the webview:

- **Audit Timeline**
- **Belief Graph Snapshot**
- clarification cards
- patch-ready cards

In logs / console:

- `thinkn` diagnostics
- patch-generation diagnostics
- any orchestrator pipeline errors

---

## 10. Key Design Decisions That New Developers Must Preserve

1. **No code generation during extraction phase**
   - plan generation and patch generation are separate phases.

2. **Beliefs must be explicit**
   - assumptions should not remain hidden in prose.

3. **High-risk uncertainty must be surfaced, not buried**
   - the gate should escalate meaningful uncertainty.

4. **Assistant narration and workspace edits are different channels**
   - chat text belongs in the sidebar,
   - diff text belongs in the patch channel only.

5. **Patch targets must resolve to real workspace-relative files**
   - synthetic or unresolved file targets must be blocked.

6. **thinkN is core to the current milestone**
   - not optional during current E2E verification.

7. **Testing must happen in F5**
   - do not substitute another launch path and assume equivalence.

---

## 11. Domain Ownership / Multi-Agent Development Guidance

The original blueprint divides work into five agent domains. That logic still matters for human or AI contributors.

### UI / Extension shell
Work mainly in:

- `src/extension.ts`
- `src/webview/*`
- `src/commands/*`

### Context collection / evidence
Work mainly in:

- `src/context/*`
- `src/utils/fs.ts`

### Belief state / thinkN
Work mainly in:

- `src/beliefs/*`
- `src/state/*`

### LLM / prompts
Work mainly in:

- `src/ai/*`
- `src/prompts/*`

### Gate / validation / orchestration
Work mainly in:

- `src/gate/*`
- `src/validation/*`
- `src/controller/MainOrchestrator.ts`

Avoid overlapping edits in the orchestration core unless the task requires cross-cutting changes.

---

## 12. Current Gaps / Risks / Outstanding Work

1. **Need another F5 verification pass after the latest schema fix**
   - current state strongly suggests the empty-diff issue is solved,
   - but it still needs confirmation in the real host.

2. **Need concrete-task E2E verification after `hello`**
   - conversational tasks are only one edge case.

3. **Some comments in code may lag behind runtime behavior**
   - especially around local-only fallback vs fail-fast philosophy.

4. **Patch generation still depends heavily on prompt discipline**
   - improved safeguards exist, but the LLM can still produce imperfect outputs.

5. **Validation is heuristic, not semantic execution validation**
   - the current validator protects some cases but is not a full static/dynamic analysis engine.

6. **Blueprint coverage is strong, but implementation is still sprint-active**
   - this is not a finished enterprise product yet.

---

## 13. Immediate Next Steps for a New Developer

If you are taking over right now, do this in order:

1. Read this file fully.
2. Read `New_sprint.md` fully.
3. Read the architecture blueprint in `VS Code Extension_ Belief Graph & Action Gate.txt`.
4. Inspect these files in order:
   - `BeliefGuard/src/controller/MainOrchestrator.ts`
   - `BeliefGuard/src/beliefs/ThinkNClient.ts`
   - `BeliefGuard/src/ai/LLMClient.ts`
   - `BeliefGuard/src/prompts/PatchGenerator.ts`
   - `BeliefGuard/src/utils/unifiedDiff.ts`
   - `BeliefGuard/src/webview/BeliefGuardProvider.ts`
5. Launch the Extension Development Host with **F5**.
6. Submit `hello`.
7. Confirm the no-actionable-patch flow is graceful.
8. Submit a concrete coding task.
9. Continue Phase 3 and Phase 4 based on real runtime results.

---

## 14. Source Files That Most Define Current Truth

If someone asks “what files define the current truth of the project?”, start here:

- Concept / intended architecture:
  - `VS Code Extension_ Belief Graph & Action Gate.txt`

- Current sprint / implementation strategy:
  - `New_sprint.md`

- Runtime orchestration:
  - `BeliefGuard/src/controller/MainOrchestrator.ts`

- thinkN integration:
  - `BeliefGuard/src/beliefs/ThinkNClient.ts`

- belief graph query logic:
  - `BeliefGuard/src/beliefs/BeliefGraph.ts`

- shared contracts:
  - `BeliefGuard/src/types.ts`
  - `BeliefGuard/src/beliefs/types.ts`

- context / grounding:
  - `BeliefGuard/src/context/WorkspaceScanner.ts`
  - `BeliefGuard/src/context/EvidenceLocator.ts`

- LLM behavior:
  - `BeliefGuard/src/ai/LLMClient.ts`
  - `BeliefGuard/src/prompts/Extractor.ts`
  - `BeliefGuard/src/prompts/PatchGenerator.ts`

- diff application / validation:
  - `BeliefGuard/src/utils/unifiedDiff.ts`
  - `BeliefGuard/src/validation/PatchValidator.ts`
  - `BeliefGuard/src/commands/showDiff.ts`
  - `BeliefGuard/src/commands/applyPatch.ts`

- UI / shell:
  - `BeliefGuard/src/webview/BeliefGuardProvider.ts`
  - `BeliefGuard/src/extension.ts`

---

## 15. Final Guidance

BeliefGuard should be thought of as a **belief-governed software execution system**, not merely a VS Code chatbot and not merely a patch generator.

Its defining promise is:

> no code edits without explicit belief extraction, evidence-aware reasoning, and deterministic gating.

That promise is the project’s identity. Any future refactor, optimization, or feature work should preserve it.
