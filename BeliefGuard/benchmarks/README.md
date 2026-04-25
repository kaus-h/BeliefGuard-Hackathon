# BeliefGuard Benchmarks

This directory contains local, telemetry-free benchmark assets for turning the hackathon demo into measurable engineering evidence.

Run a smoke benchmark against the extension repository:

```bash
npm run benchmark
```

Run against another repository and write a report:

```bash
npm run metrics -- --repo C:\path\to\repo --scenario benchmarks/scenarios/agent-drift-auth.json
```

Run all built-in scenarios for repeatable p50/p95 scan latency:

```bash
npm run benchmark -- --iterations 10 --scenarios-dir benchmarks/scenarios
```

Run a corpus benchmark across multiple checked-out repositories:

```bash
npm run benchmark:corpus -- --repos-file benchmarks/repos.example.json --iterations 10
```

The benchmark report captures:

- Context scan latency
- Context scan p50/p95 over repeated iterations
- Files, lines, and bytes scanned
- Manifest discovery count
- Gate decisions for known agent-drift scenarios
- Patch-validation p50/p95 for scenarios with patch fixtures
- Resume-ready placeholders for median/p95 latency, blocked unsafe edits, and patch acceptance rate

Generated reports are written to `benchmarks/results/` and are ignored by git.
