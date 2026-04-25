#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateGeneratedPatch } = require('../out/validation/PatchValidator.js');

const DEFAULT_IGNORES = new Set([
  '.git',
  '.vscode',
  '.vite',
  'coverage',
  'dist',
  'build',
  'out',
  'node_modules',
]);

const MANIFEST_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'next.config.js',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
]);

const args = parseArgs(process.argv.slice(2));
const repoPath = path.resolve(args.repo || process.cwd());
const scenarioPaths = resolveScenarioPaths(args);

if (!existsSync(repoPath)) {
  fail(`Repository path does not exist: ${repoPath}`);
}

const scanRuns = [];
for (let i = 0; i < args.iterations; i += 1) {
  const started = performance.now();
  const scan = scanRepository(repoPath);
  scanRuns.push({
    ...scan,
    elapsedMs: Number((performance.now() - started).toFixed(2)),
  });
}

const scenarios = scenarioPaths.map((scenarioPath) => ({
  path: scenarioPath,
  ...JSON.parse(readFileSync(scenarioPath, 'utf8')),
}));
const gateRuns = scenarios.map((scenario) => ({
  name: scenario.name,
  task: scenario.task,
  expectedOutcome: scenario.expectedOutcome,
  decision: simulateGate(scenario.beliefs || []).decision,
  gate: simulateGate(scenario.beliefs || []),
  validation: scenario.patch
    ? benchmarkPatchValidation(scenario.patch, scenario.validatedBeliefs || scenario.beliefs || [], args.iterations)
    : null,
}));
const validationLatencies = gateRuns
  .map((run) => run.validation?.p50Ms)
  .filter((value) => typeof value === 'number');

const firstScan = scanRuns[0];
const scanLatencies = scanRuns.map((run) => run.elapsedMs);
const report = {
  generatedAt: new Date().toISOString(),
  repoPath,
  iterations: args.iterations,
  scan: {
    p50Ms: percentile(scanLatencies, 50),
    p95Ms: percentile(scanLatencies, 95),
    minMs: Math.min(...scanLatencies),
    maxMs: Math.max(...scanLatencies),
    filesScanned: firstScan.filesScanned,
    linesScanned: firstScan.linesScanned,
    bytesScanned: firstScan.bytesScanned,
    manifests: firstScan.manifests,
    extensions: firstScan.extensions,
  },
  scenarios: gateRuns,
  summary: {
    scenarioCount: gateRuns.length,
    passCount: gateRuns.filter((run) => run.decision === run.expectedOutcome).length,
    blockCount: gateRuns.filter((run) => run.decision === 'BLOCK').length,
    askUserCount: gateRuns.filter((run) => run.decision === 'ASK_USER').length,
    inspectMoreCount: gateRuns.filter((run) => run.decision === 'INSPECT_MORE').length,
    proceedCount: gateRuns.filter((run) => run.decision === 'PROCEED').length,
    patchValidationScenarioCount: validationLatencies.length,
    patchValidationP50Ms: percentile(validationLatencies, 50),
    patchValidationP95Ms: percentile(validationLatencies, 95),
  },
  resumeMetrics: {
    contextScanP50Ms: percentile(scanLatencies, 50),
    contextScanP95Ms: percentile(scanLatencies, 95),
    repoFilesScanned: firstScan.filesScanned,
    repoLinesScanned: firstScan.linesScanned,
    benchmarkScenarioCount: gateRuns.length,
    unsafeEditBlocks: gateRuns.filter((run) => run.decision === 'BLOCK').length,
    patchValidationP50Ms: percentile(validationLatencies, 50),
    patchValidationP95Ms: percentile(validationLatencies, 95),
    scenarioPassRate:
      gateRuns.length === 0
        ? 0
        : Number(((gateRuns.filter((run) => run.decision === run.expectedOutcome).length / gateRuns.length) * 100).toFixed(2)),
  },
};

const markdown = renderMarkdown(report);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (args.write) {
  const outputDir = path.resolve(process.cwd(), 'benchmarks/results');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(outputDir, 'latest.md'), markdown);
  console.log(`Wrote benchmark report to ${outputDir}`);
} else {
  console.log(markdown);
}

function parseArgs(argv) {
  const parsed = {
    iterations: 5,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--repo') {
      parsed.repo = argv[++i];
    } else if (arg === '--scenario') {
      parsed.scenario = argv[++i];
    } else if (arg === '--scenarios-dir') {
      parsed.scenariosDir = argv[++i];
    } else if (arg === '--iterations') {
      parsed.iterations = Math.max(1, Number.parseInt(argv[++i], 10) || 1);
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run benchmark -- [--repo PATH] [--scenario PATH | --scenarios-dir PATH] [--iterations N] [--write] [--json]');
      process.exit(0);
    }
  }

  return parsed;
}

function resolveScenarioPaths(parsedArgs) {
  if (parsedArgs.scenario) {
    const scenarioPath = path.resolve(parsedArgs.scenario);
    return existsSync(scenarioPath) ? [scenarioPath] : fail(`Scenario does not exist: ${scenarioPath}`);
  }

  const scenariosDir = parsedArgs.scenariosDir
    ? path.resolve(parsedArgs.scenariosDir)
    : path.resolve(process.cwd(), 'benchmarks/scenarios');

  if (!existsSync(scenariosDir)) {
    return [];
  }

  return readdirSync(scenariosDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => path.join(scenariosDir, fileName));
}

function scanRepository(root) {
  const result = {
    filesScanned: 0,
    linesScanned: 0,
    bytesScanned: 0,
    manifests: [],
    extensions: {},
  };

  walk(root, result);
  result.manifests.sort((a, b) => a.path.localeCompare(b.path));
  result.extensions = Object.fromEntries(
    Object.entries(result.extensions).sort((a, b) => b[1] - a[1])
  );
  return result;
}

function walk(currentPath, result) {
  const entries = readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && DEFAULT_IGNORES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, result);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = statSync(fullPath);
    if (stats.size > 1024 * 1024) {
      continue;
    }

    const relativePath = path.relative(repoPath, fullPath).replaceAll(path.sep, '/');
    const ext = path.extname(entry.name) || '[no-ext]';
    const content = readFileSync(fullPath, 'utf8');
    const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length;

    result.filesScanned += 1;
    result.linesScanned += lines;
    result.bytesScanned += stats.size;
    result.extensions[ext] = (result.extensions[ext] || 0) + 1;

    if (MANIFEST_NAMES.has(entry.name)) {
      result.manifests.push({ path: relativePath, bytes: stats.size, lines });
    }
  }
}

function simulateGate(beliefs) {
  const byId = new Map(beliefs.map((belief) => [belief.id, belief]));
  let hasBlockingContradiction = false;
  let highRiskUnvalidated = 0;
  let lowConfidence = 0;

  for (const belief of beliefs) {
    const contradictions = belief.contradictions || [];
    const blocks = contradictions.some((id) => {
      const target = byId.get(id);
      return target && (target.type === 'REPO_FACT' || target.type === 'USER_CONSTRAINT');
    });

    if (blocks) {
      hasBlockingContradiction = true;
    }
    if (!belief.isValidated && belief.riskLevel === 'HIGH') {
      highRiskUnvalidated += 1;
    }
    if (belief.confidenceScore < 0.4) {
      lowConfidence += 1;
    }
  }

  const decision = hasBlockingContradiction
    ? 'BLOCK'
    : highRiskUnvalidated > 0
      ? 'ASK_USER'
      : lowConfidence > 0
        ? 'INSPECT_MORE'
        : 'PROCEED';

  return {
    decision,
    totalBeliefs: beliefs.length,
    highRiskUnvalidated,
    lowConfidence,
    hasBlockingContradiction,
  };
}

function benchmarkPatchValidation(patch, beliefs, iterations) {
  const durations = [];
  let lastResult = null;

  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    lastResult = validateGeneratedPatch(patch, beliefs);
    durations.push(Number((performance.now() - started).toFixed(3)));
  }

  return {
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    isValid: lastResult?.isValid ?? null,
    violationCount: lastResult?.violations?.length ?? 0,
  };
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function renderMarkdown(report) {
  const scenarioRows = report.scenarios.length
    ? report.scenarios.map((scenario) => (
      `| ${scenario.name} | ${scenario.expectedOutcome} | ${scenario.decision} | ${scenario.validation ? `${scenario.validation.p50Ms} ms` : 'N/A'} | ${scenario.expectedOutcome === scenario.decision ? 'PASS' : 'FAIL'} |`
    ))
    : ['| No scenarios | N/A | N/A | N/A | N/A |'];

  const lines = [
    '# BeliefGuard Local Benchmark Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Repository: ${report.repoPath}`,
    `Iterations: ${report.iterations}`,
    '',
    '## Repository Scan',
    '',
    `- Context scan p50: ${report.scan.p50Ms} ms`,
    `- Context scan p95: ${report.scan.p95Ms} ms`,
    `- Files scanned: ${report.scan.filesScanned}`,
    `- Lines scanned: ${report.scan.linesScanned}`,
    `- Bytes scanned: ${report.scan.bytesScanned}`,
    `- Manifests found: ${report.scan.manifests.length}`,
    '',
    '## Gate Scenarios',
    '',
    '| Scenario | Expected | Actual | Validation p50 | Result |',
    '| --- | --- | --- | ---: | --- |',
    ...scenarioRows,
    '',
    '## Summary',
    '',
    `- Scenario pass rate: ${report.resumeMetrics.scenarioPassRate}%`,
    `- Unsafe edit blocks: ${report.resumeMetrics.unsafeEditBlocks}`,
    `- Patch validation p50: ${report.summary.patchValidationP50Ms} ms`,
    `- Patch validation p95: ${report.summary.patchValidationP95Ms} ms`,
    `- PROCEED: ${report.summary.proceedCount}`,
    `- INSPECT_MORE: ${report.summary.inspectMoreCount}`,
    `- ASK_USER: ${report.summary.askUserCount}`,
    `- BLOCK: ${report.summary.blockCount}`,
    '',
    '## Resume Metrics To Track',
    '',
    '- Add this report to a benchmark run table after testing real target repositories.',
    '- Track median and p95 scan latency across repositories of different sizes.',
    '- Track gate decisions, blocked unsafe edits, patch acceptance rate, and false positives.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
