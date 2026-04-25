# Public Corpus Benchmark

This corpus benchmark was run against BeliefGuard plus four public repositories cloned outside this repository. External source code is not vendored here; only the measured results are recorded.

Command:

```bash
npm run benchmark:corpus -- --repos-file C:\Users\cause\Downloads\BGSV-benchmark-repos\repos.json --iterations 5
```

Measured April 25, 2026:

| Repo | Files | LOC | Scan p50 | Scan p95 | Validation p50 | Scenario Pass Rate | Unsafe Blocks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BeliefGuard | 52 | 11,168 | 10.93 ms | 29.15 ms | 0.033 ms | 100% | 2 |
| express | 213 | 26,712 | 39.90 ms | 47.58 ms | 0.039 ms | 100% | 2 |
| ky | 67 | 20,447 | 19.84 ms | 37.91 ms | 0.035 ms | 100% | 2 |
| ms | 23 | 6,022 | 4.18 ms | 16.78 ms | 0.025 ms | 100% | 2 |
| preact | 297 | 66,700 | 42.92 ms | 62.34 ms | 0.030 ms | 100% | 2 |

Aggregate:

- Repositories benchmarked: 5
- Total files scanned: 652
- Total LOC scanned: 131,049
- Total benchmark scenarios: 20
- Scenario pass rate: 100%
- Unsafe edit blocks: 10
- Median repository scan p50: 19.84 ms
- Median repository scan p95: 37.91 ms
- Median patch validation p50: 0.033 ms
- Median patch validation p95: 0.073 ms

Use this as early engineering evidence only. The gate scenarios are synthetic fixtures designed to validate policy behavior consistently across repository sizes; future work should add real task transcripts and patch acceptance rates.
