# BeliefGuard

BeliefGuard is a VS Code extension that adds a belief-aware control layer to AI-assisted code changes. Before edits are applied, it extracts assumptions, grounds them against repository evidence, evaluates risk via a deterministic gate, and asks for user clarification when uncertainty is high.

This project was built in the VillageHacks 2026 context with thinkN (`beliefs` SDK) as the belief-state backbone.

## Table of Contents
- [Why this project exists](#why-this-project-exists)
- [What BeliefGuard does](#what-beliefguard-does)
- [Architecture](#architecture)
- [End-to-end pipeline](#end-to-end-pipeline)
- [Repository layout](#repository-layout)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Development](#development)
- [Testing and validation](#testing-and-validation)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Hackathon context](#hackathon-context)

## Why this project exists

AI coding agents can fail when implicit assumptions become concrete edits without validation. BeliefGuard addresses this by making assumptions explicit (`Belief` objects), validating them against repository evidence and user input, and gating patch generation until risk is acceptable.

## What BeliefGuard does

- Collects workspace context (directory tree, selected manifests, visible editors)
- Uses an LLM to produce:
  - an execution plan (`AgentPlan`)
  - explicit beliefs (`REPO_FACT`, `TASK_BELIEF`, `AGENT_ASSUMPTION`, `USER_CONSTRAINT`)
- Stores and updates belief state locally (`SessionStore`) and remotely via thinkN (`beliefs` SDK)
- Grounds beliefs via heuristics over files/config
- Runs a confidence/risk gate with four decisions:
  - `PROCEED`
  - `INSPECT_MORE`
  - `ASK_USER`
  - `BLOCK`
- Generates structured patches and supports per-file review/approval in the webview
- Validates generated patches against validated `USER_CONSTRAINT` beliefs before applying

## Architecture

Core implementation is under `BeliefGuard/src`.

- **Extension entrypoint**: `src/extension.ts`
  - Registers sidebar, commands, and loads `.env`
- **UI (webview provider)**: `src/webview/BeliefGuardProvider.ts`
  - Task submission, clarification messages, patch/file-review messaging
- **Orchestrator**: `src/controller/MainOrchestrator.ts`
  - Coordinates the guarded workflow and loop behavior
- **Belief state layer**:
  - `src/beliefs/ThinkNClient.ts` (local + thinkN integration)
  - `src/state/SessionStore.ts` (in-memory singleton)
  - `src/beliefs/BeliefGraph.ts` (querying + contradiction heuristics)
- **Context and evidence**:
  - `src/context/WorkspaceScanner.ts`
  - `src/context/EvidenceLocator.ts`
- **Gate and questions**:
  - `src/gate/ConfidenceGate.ts`
  - `src/gate/QuestionGenerator.ts`
- **Patch path**:
  - `src/ai/LLMClient.ts`
  - `src/validation/PatchValidator.ts`
  - `src/commands/showDiff.ts`, `src/commands/applyPatch.ts`

## End-to-end pipeline

`MainOrchestrator.runGuardedTask()` implements the guarded flow:

1. Start task and initialize thread-scoped thinkN context
2. Gather workspace context
3. Extract plan + beliefs (LLM)
4. Register beliefs in local state + sync to thinkN
5. Ground beliefs against workspace evidence
6. Evaluate gate (`PROCEED` / `INSPECT_MORE` / `ASK_USER` / `BLOCK`)
7. If `ASK_USER`, collect answers and convert into high-confidence constraints
8. Re-evaluate gate (bounded loops)
9. Expand context (bounded) and generate patch
10. Validate patch against user constraints
11. Present diff/per-file review, then apply approved changes

## Repository layout

Top-level repository:

- `README.md` (this file)
- `BeliefGuard/` (VS Code extension code)
- `VS Code Extension_ Belief Graph & Action Gate.txt` (original long-form blueprint)

Inside `BeliefGuard/`:

- `package.json` (scripts and extension manifest)
- `src/` (TypeScript source)
- `out/` (compiled output in current repo snapshot)
- `vitest.config.mjs`, `tsconfig.json`

## Quick Start

Prerequisites:

- VS Code (extension targets `^1.85.0`)
- Node.js (18+ recommended)

Install and open:

```bash
cd /home/runner/work/BeliefGuard-Hackathon/BeliefGuard-Hackathon/BeliefGuard
npm install
```

Create `BeliefGuard/.env` (see [Configuration](#configuration)).

Run the extension locally:

1. Open `BeliefGuard` folder in VS Code
2. Press `F5` (Run and Debug: Extension)
3. In the Extension Development Host window, open the BeliefGuard sidebar and submit a task

## Configuration

Environment variables used by the current implementation:

- `BELIEFS_KEY` (required): thinkN `beliefs` SDK key
- `OPENROUTER_API_KEY` (required unless `OPENAI_API_KEY` is set): model API key
- `OPENAI_API_KEY` (fallback for API key check in `LLMClient`)
- `OPENROUTER_MODEL` (optional, default: `minimax/minimax-m2.5:free`)
- `OPENROUTER_BASE_URL` (optional, default: `https://openrouter.ai/api/v1`)
- `OPENROUTER_SITE_URL` (optional, used as `HTTP-Referer` header)
- `OPENROUTER_APP_NAME` (optional, used as `X-Title` header)
- `BELIEFS_DEBUG` (optional, set to `true` for SDK debug mode)

Example `.env`:

```env
BELIEFS_KEY=your_thinkn_key
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=minimax/minimax-m2.5:free
```

## Development

From `BeliefGuard/`:

```bash
npm run compile
npm run watch
npm run lint
npm test
npm run test:watch
```

Command registration (extension manifest):

- `beliefguard.startGuardedTask`
- `beliefguard.showDiff`

Runtime command also registered in code:

- `beliefguard.applyPatch`

## Testing and validation

Current test configuration is Vitest (`vitest.config.mjs`) and tests are under `src/__tests__/**/*.test.ts`.

Representative areas covered in existing tests:

- Gate decision priority and behavior
- SessionStore invariants
- Diff parsing/normalization
- Constraint-based patch validation
- thinkN integration conditions
- Workflow capability checks (structured patch, context expansion, per-file review, streaming)

## Known limitations

Based on current code and repository state:

- `SessionStore` is in-memory only (no persistence across VS Code restarts)
- Evidence grounding is heuristic (keyword/file-based), not full semantic understanding
- Guard loops are intentionally bounded (`MAX_INSPECT_CYCLES`, `MAX_CLARIFICATION_LOOPS`, `MAX_CONTEXT_EXPANSION_ITERATIONS`)
- thinkN is treated as a hard dependency during guarded execution (`BELIEFS_KEY` required)
- In this repository snapshot, baseline local checks may fail due to environment/dependency setup issues (for example lint/test tooling availability and optional native bindings)

## Roadmap

Current direction (as reflected in code comments/tests and project context):

- Continue hardening thinkN end-to-end readiness and thread-scoped behavior
- Improve patch channel safety and per-file review ergonomics
- Refine context expansion and evidence quality
- Maintain strict separation between assistant narration and applied workspace edits

## Hackathon context

BeliefGuard was developed in the VillageHacks 2026 context under the thinkN-focused challenge area, with emphasis on belief coherence, contradiction handling, and safe autonomous coding workflows.
