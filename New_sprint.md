# New Sprint — BeliefGuard thinkN E2E Recovery

## Sprint objective
Restore and verify true end-to-end thinkN integration in BeliefGuard before any additional product or UI work continues.

## Non-negotiable rules
1. thinkN is a hard dependency for this sprint.
2. No silent local-only fallback during guarded-task execution for the active repair milestone.
3. If thinkN initialization or scoped execution fails, the task must fail fast.
4. Validation must happen in the Extension Development Host via Run and Debug / F5.
5. Broader chat / patch UX work resumes only after thinkN passes E2E.

---

## E2E diagnosis summary

### Primary root cause

The thinkN integration is being initialized in `BeliefGuard/src/beliefs/ThinkNClient.ts` like this:

- `new Beliefs({ apiKey, agent: 'beliefguard-agent', namespace: 'beliefguard-session' })`

But the runtime errors clearly show the SDK is operating in **thread-scoped mode**, and the old code never bound a thread:

- `BeliefsError: Thread-scoped beliefs require a thread ID. Bind one with beliefs.withThread(threadId) or set writeScope:'agent' or writeScope:'space'.`

So the failure is not “API key missing” and not primarily a network issue. It is a **scope/configuration mismatch** between the beliefs SDK expectations and the way BeliefGuard instantiates and calls it.

For the installed SDK version, constructor configuration supports `thread`, so the intended implementation direction is task-scoped client initialization using a real thread id.

### End-to-end failure points in the original pipeline

From the files and logs, the breakage happened across the full orchestration path:

1. **Task starts**
   - `MainOrchestrator.runGuardedTask()` calls `this.beliefManager.reset()`.
   - `BeliefStateManager.reset()` calls `thinkN.reset()`.
   - This immediately fails because no thread is bound.

2. **Before first LLM plan call**
   - `MainOrchestrator` calls `getBeliefContext(userTask)`.
   - `ThinkNClient.getBeliefContext()` calls `thinkN.before(input)`.
   - Fails for the same missing-thread reason.

3. **Belief registration**
   - `addBeliefs()` succeeds locally in `SessionStore`.
   - But each `syncAddBelief()` calls `thinkN.add(...)`.
   - Those all fail because no thread is bound.

4. **Post-plan fusion**
   - `feedOutput(JSON.stringify(agentPlan), 'llm-plan-extraction')`
   - Calls `thinkN.after(...)`
   - Also fails with missing thread.

5. **Evidence sync during grounding**
   - `updateBeliefConfidence()` eventually calls `syncEvidence()` → `thinkN.after(...)`
   - This also fails for the same reason whenever evidence is found.

### Important architectural observation

BeliefGuard was **not fully broken** because of this. The local belief system still worked:

- `SessionStore`
- confidence updates
- contradiction tracking fallback
- gate evaluation logic

So thinkN was failing, but the app was degrading into a **local-only belief mode**, only noisily and incompletely. That meant the project risk was not just “thinkN doesn’t work” — it also meant:

- noisy repeated failures in logs,
- no proper remote belief persistence,
- no cloud-side `before/after` enrichment,
- no reliable contradiction memory across turns if thinkN was meant to be canonical.

### Non-root-cause noise from logs

These appear secondary / not the blocker for thinkN restoration:

- `punycode` deprecation warning
- `UnleashProvider must be initialized first!`
- `Running in One LS mode...`
- `No debugger available...`

These may deserve cleanup later, but they are not the main reason BeliefGuard fails to use thinkN.

---

## Immediate containment options considered

### Option A — bind a per-task thread ID

Best fit if BeliefGuard runs should be isolated per guarded task.

- Generate a UUID when a guarded task begins.
- Bind the beliefs client to that thread for the lifetime of the task.
- Reuse that bound client for `reset`, `before`, `add`, `after`, and `read`.

This matches the SDK error message most directly and is the chosen implementation direction.

### Option B — switch write scope to `agent` or `space`

Best fit if thread-level separation is not required for the demo.

- Reconfigure the beliefs client so it no longer requires a thread ID.
- This is simpler operationally, but weaker semantically than proper per-task thread scoping.

This remains a fallback design alternative, but is **not** the active sprint choice.

### Option C — explicit local-only fallback mode when thinkN config is invalid

Even after the main issue is fixed, this can still be useful as a future safety net.

- If thinkN initialization is invalid, disable all remote calls immediately.
- Surface one clear UI/audit warning instead of spamming repeated stack traces.

This gives graceful degradation and cleaner demos, but for the current sprint we are intentionally **not** relying on it.

---

## Decision record for this sprint

We explicitly decided that for this phase we should **remove the local fallback** and make thinkN a **hard requirement** until we verify true end-to-end behavior.

That changes the implementation goal from “degrade gracefully” to **fail fast and loudly**.

BeliefGuard should not proceed unless thinkN is actually functioning, because thinkN is part of the core hackathon value proposition.

---

## Updated phased plan

### Phase 1 — Repair thinkN as a hard dependency

Goal: **BeliefGuard must not proceed unless thinkN is truly working E2E.**

Implementation targets:

- `BeliefGuard/src/beliefs/ThinkNClient.ts`
- `BeliefGuard/src/controller/MainOrchestrator.ts`
- possibly `BeliefGuard/src/state/SessionStore.ts` if task/session identity needs to persist during a guarded run

Changes:

1. Add a **real per-guarded-task thread ID**.
2. Bind the `beliefs` SDK to that thread context.
3. Ensure the same bound context is used consistently for:
   - `reset()`
   - `before()`
   - `add()`
   - `after()`
   - `read()`
4. Remove the current behavior where thinkN failures are effectively tolerated as local-only continuation.
5. Replace it with **fail-fast behavior**:
   - if thinkN is not initialized correctly,
   - the guarded task stops,
   - the user sees a clear audit/webview error,
   - no further plan/patch flow continues.

### Phase 2 — Add explicit thinkN readiness gating

Goal: verify the middleware is active before the rest of the system does anything important.

Changes:

- At task start, run a **thinkN readiness/bootstrap check** before the main pipeline proceeds.
- If thread binding or SDK readiness fails, block the task immediately.
- Surface a precise message in the audit/chat UI, such as:
  - `thinkN initialization failed`
  - `thread binding missing`
  - `remote belief operations unavailable`

This ensures we are not accidentally testing a hidden fallback path.

### Phase 3 — Run a true E2E validation in the Extension Development Host (F5)

Goal: validate the actual runtime path in the environment we are really using.

Validation flow:

1. Launch BeliefGuard with **Run and Debug / F5**.
2. Submit a very small guarded task, e.g. `Hello`.
3. Verify, in order, that these succeed without `missing_thread` errors:
   - task bootstrap
   - `thinkN.reset()`
   - `thinkN.before()`
   - `thinkN.add()` during belief registration
   - `thinkN.after()` after plan extraction
   - `thinkN.after()` for evidence sync if evidence is found
4. Confirm the audit trail/webview reflects real thinkN activity instead of silent degradation.
5. If any step fails, capture the exact failure point and fix that before moving to later phases.

### Phase 4 — Reconcile the agent output architecture with the middleware design

Goal: make sure the extension behaves like the BeliefGuard spec requires.

This phase comes **after thinkN is verified working**.

Changes:

- Ensure ordinary assistant narration goes only to the **chat window**.
- Ensure file edits go only through the **validated patch channel**.
- Keep the confidence gate, clarification loop, and post-patch validation intact.
- Confirm that no patch is emitted unless:
  - beliefs are extracted,
  - grounded,
  - evaluated,
  - gate outcome is `PROCEED`.

Files likely involved:

- `BeliefGuard/src/ai/LLMClient.ts`
- `BeliefGuard/src/prompts/PatchGenerator.ts`
- `BeliefGuard/src/controller/MainOrchestrator.ts`
- `BeliefGuard/src/utils/unifiedDiff.ts`
- `BeliefGuard/src/webview/BeliefGuardProvider.ts`

### Phase 5 — Continue the original UI/product work

Goal: resume the earlier UX roadmap only once the core middleware is trustworthy.

That includes:

- the proper Cursor/Antigravity-style chat flow,
- Review / Approve / Reject patch handling,
- fixing any remaining belief-review overflow/visibility issues,
- runtime polish and demo hardening.

---

## Recommended execution order

If implementing this next, the recommended order is:

1. **Fix thread-scoped thinkN initialization**
2. **Make thinkN failure block the task instead of falling back**
3. **Validate the full run in the F5 extension development environment**
4. **Only then continue chat/patched-file architecture cleanup**
5. **Then resume UI polish / demo refinement**

---

## Best implementation direction

The longer-term balanced strategy remains:

1. **per-task thread binding** as the proper fix,
2. **local-only auto-fallback** as the safety net,
3. then a **real E2E verification pass**.

That gives both correctness and resilience, which matches the middleware goals in the spec.

However, the active sprint decision is to **enforce thinkN as mandatory first**, prove E2E correctness, and only then decide whether to reintroduce fallback for resilience.

---

## Operational testing constraint

Testing should happen inside the **Extension Development Host launched via Run and Debug / F5**, not by trying to open a separate VS Code or Antigravity window with the `code` command.

All validation steps in this sprint assume the real extension development/debug flow.

---

## Exit criteria

This sprint is complete only when:

- no `missing_thread` thinkN errors remain in F5 runtime
- BeliefGuard does not proceed when thinkN is broken
- one guarded task completes with successful thinkN calls across the full loop
- `before()` returns context successfully
- `addBelief()` remote sync succeeds
- `after()` plan fusion succeeds
- evidence sync succeeds
- clarification loop still works
- patch generation still happens only after gate `PROCEED`
- audit / sidebar clearly indicate thinkN-backed execution is active
