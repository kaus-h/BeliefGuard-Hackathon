# Metrics Plan

BeliefGuard should be evaluated as developer-tools infrastructure, not only as a hackathon UI. These are the metrics that make the project stronger for top-tier software engineering interviews.

## Core Metrics

| Metric | Why It Matters | How To Measure |
| --- | --- | --- |
| Context scan latency | Shows local tool responsiveness | `npm run benchmark -- --repo <repo>` |
| Files / LOC scanned | Shows repository scale | Benchmark report |
| Gate decision distribution | Shows safety policy behavior | Count `PROCEED`, `INSPECT_MORE`, `ASK_USER`, `BLOCK` per task |
| Unsafe edits blocked | Shows real impact | Agent drift scenarios in `docs/agent-drift-cases.md` |
| Patch acceptance rate | Shows usefulness, not only blocking | Approved file changes / total proposed file changes |
| Clarification rate | Shows user interruption cost | Questions asked / task |
| False-positive rate | Shows trustworthiness | Incorrect blocks / total blocks |
| Patch validation latency | Shows final review responsiveness | Time validator execution |
| Test count and pass rate | Shows engineering hygiene | `npm test` |

## Suggested Benchmark Table

Populate this after testing more repositories.

| Repo | Files | LOC | Scan p50 | Scan p95 | Tasks | Blocks | Patch Acceptance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BeliefGuard | [X] | [Y] | [X ms] | [Y ms] | [N] | [B] | [A%] |
| Repo 2 | [X] | [Y] | [X ms] | [Y ms] | [N] | [B] | [A%] |
| Repo 3 | [X] | [Y] | [X ms] | [Y ms] | [N] | [B] | [A%] |

Current local smoke result, measured on April 25, 2026:

| Repo | Files | LOC | Scan p50 | Scan p95 | Scenarios | Blocks | Scenario Pass Rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BeliefGuard | 49 | 10,895 | 21.44 ms | 38.88 ms | 4 | 2 | 100% |

Patch validator smoke result:

| Repo | Validation p50 | Validation p95 |
| --- | ---: | ---: |
| BeliefGuard | 0.061 ms | 0.187 ms |

Current public corpus smoke result:

| Corpus | Repos | Files | LOC | Scenarios | Blocks | Pass Rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BeliefGuard + express + ky + ms + preact | 5 | 652 | 131,049 | 20 | 10 | 100% |

See `BeliefGuard/benchmarks/public-corpus.md` for the per-repository table.

## Resume-Ready Claims To Earn

Do not use these until measured.

- Reduced unsafe AI-generated edits by `[X%]` across `[N]` benchmark tasks.
- Scanned `[X]` files / `[Y]` LOC with median context collection latency of `[Z ms]`.
- Achieved `[X%]` patch acceptance after belief validation and per-file review.
- Blocked `[N]` architectural constraint violations before workspace mutation.
- Maintained `[X]` passing tests across gate, patch, thinkN, and workflow behavior.

## Local Report

Generate a local report without sending telemetry anywhere:

```bash
npm run metrics -- --repo C:\path\to\target-repo
```

Reports are written to `benchmarks/results/` and are ignored by git.

Run all benchmark scenarios with repeated scans:

```bash
npm run benchmark -- --iterations 10 --scenarios-dir benchmarks/scenarios
```

Run a multi-repository corpus benchmark:

```bash
npm run benchmark:corpus -- --repos-file benchmarks/repos.example.json --iterations 10
```
