# Resume Evidence Checklist

Use this checklist before turning BeliefGuard into final resume bullets.

## Already Supported

- 4th place hackathon result.
- 24-hour build timeline.
- Original idea ownership.
- Gemini live demo integration.
- Fully functional thinkN integration.
- VS Code extension with webview, command registration, and diff/apply flow.
- 26 passing Vitest tests at the time of this pass.
- Compile and test CI workflow.
- Local benchmark script.
- Local benchmark smoke result: 49 files / 10,895 LOC scanned with 21.44 ms p50 and 38.88 ms p95 context scan latency.
- Four built-in gate scenarios with 100% expected decision pass rate.
- Two unsafe-edit benchmark scenarios currently return `BLOCK`.
- Patch validation benchmark: 0.061 ms p50 and 0.187 ms p95 on local fixtures.
- Public corpus benchmark: 5 repositories, 652 files, 131,049 LOC scanned, 20 benchmark scenarios, 100% expected gate decision pass rate, 10 unsafe-edit scenario blocks.

## Still Needs Measurement

- Number of repositories benchmarked.
- Unsafe edits blocked across benchmark tasks.
- False-positive rate for blocks.
- Patch acceptance rate.
- User clarification rate.

## Strongest Resume Positioning

BeliefGuard should be framed as AI developer-tools infrastructure:

- Belief graph for AI agent assumptions.
- Deterministic action gate before file mutation.
- Human-in-the-loop clarification only for high-risk uncertainty.
- Structured patch review and validation.
- thinkN-backed belief persistence.

Avoid positioning it as only a chatbot or VS Code UI project. The hiring signal is in the control-plane architecture.
