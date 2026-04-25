#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const reposFile = path.resolve(args.reposFile || 'benchmarks/repos.example.json');
const scenariosDir = path.resolve(args.scenariosDir || 'benchmarks/scenarios');
const iterations = args.iterations || 5;

if (!existsSync(reposFile)) {
  fail(`Repos file does not exist: ${reposFile}`);
}

const repos = readJsonFile(reposFile).repos || [];
if (repos.length === 0) {
  fail(`Repos file contains no repositories: ${reposFile}`);
}

const reports = repos.map((repo) => runBenchmark(repo, iterations, scenariosDir));
const aggregate = buildAggregate(reports, iterations, reposFile, scenariosDir);
const markdown = renderMarkdown(aggregate);

if (args.write) {
  const outputDir = path.resolve('benchmarks/results');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'corpus-latest.json'), `${JSON.stringify(aggregate, null, 2)}\n`);
  writeFileSync(path.join(outputDir, 'corpus-latest.md'), markdown);
  console.log(`Wrote corpus benchmark report to ${outputDir}`);
} else {
  console.log(markdown);
}

function parseArgs(argv) {
  const parsed = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repos-file') {
      parsed.reposFile = argv[++i];
    } else if (arg === '--iterations') {
      parsed.iterations = Math.max(1, Number.parseInt(argv[++i], 10) || 1);
    } else if (arg === '--scenarios-dir') {
      parsed.scenariosDir = argv[++i];
    } else if (arg === '--write') {
      parsed.write = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run benchmark:corpus -- [--repos-file PATH] [--iterations N] [--scenarios-dir PATH] [--write]');
      process.exit(0);
    }
  }
  return parsed;
}

function runBenchmark(repo, iterations, scenarioDir) {
  const repoPath = path.resolve(repo.path);
  if (!existsSync(repoPath)) {
    return {
      name: repo.name,
      path: repoPath,
      error: `Repository path does not exist: ${repoPath}`,
    };
  }

  const result = spawnSync(
    process.execPath,
    [
      path.resolve('scripts/benchmark.mjs'),
      '--repo',
      repoPath,
      '--iterations',
      String(iterations),
      '--scenarios-dir',
      scenarioDir,
      '--json',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    }
  );

  if (result.status !== 0) {
    return {
      name: repo.name,
      path: repoPath,
      error: result.stderr || result.stdout || `benchmark exited with ${result.status}`,
    };
  }

  const report = JSON.parse(result.stdout);
  return {
    name: repo.name,
    path: repoPath,
    report,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function buildAggregate(reports, iterations, repoFile, scenarioDir) {
  const successful = reports.filter((entry) => entry.report);
  const failed = reports.filter((entry) => entry.error);
  const totalFiles = successful.reduce((sum, entry) => sum + entry.report.scan.filesScanned, 0);
  const totalLines = successful.reduce((sum, entry) => sum + entry.report.scan.linesScanned, 0);
  const totalScenarios = successful.reduce((sum, entry) => sum + entry.report.summary.scenarioCount, 0);
  const totalPasses = successful.reduce((sum, entry) => sum + entry.report.summary.passCount, 0);
  const totalBlocks = successful.reduce((sum, entry) => sum + entry.report.summary.blockCount, 0);
  const p50Values = successful.map((entry) => entry.report.scan.p50Ms);
  const p95Values = successful.map((entry) => entry.report.scan.p95Ms);
  const validationP50Values = successful.map((entry) => entry.report.summary.patchValidationP50Ms);
  const validationP95Values = successful.map((entry) => entry.report.summary.patchValidationP95Ms);

  return {
    generatedAt: new Date().toISOString(),
    iterations,
    repoFile,
    scenarioDir,
    repositoryCount: reports.length,
    successfulRepositoryCount: successful.length,
    failedRepositoryCount: failed.length,
    totalFiles,
    totalLines,
    totalScenarios,
    totalPasses,
    totalBlocks,
    scenarioPassRate: totalScenarios === 0 ? 0 : Number(((totalPasses / totalScenarios) * 100).toFixed(2)),
    medianRepoScanP50Ms: percentile(p50Values, 50),
    medianRepoScanP95Ms: percentile(p95Values, 50),
    medianPatchValidationP50Ms: percentile(validationP50Values, 50),
    medianPatchValidationP95Ms: percentile(validationP95Values, 50),
    reports,
  };
}

function renderMarkdown(aggregate) {
  const rows = aggregate.reports.map((entry) => {
    if (entry.error) {
      return `| ${entry.name} | ERROR | ERROR | ERROR | ERROR | ERROR | ${escapePipe(entry.error)} |`;
    }

    const report = entry.report;
    return `| ${entry.name} | ${report.scan.filesScanned} | ${report.scan.linesScanned} | ${report.scan.p50Ms} ms | ${report.scan.p95Ms} ms | ${report.summary.patchValidationP50Ms} ms | ${report.resumeMetrics.scenarioPassRate}% | ${report.resumeMetrics.unsafeEditBlocks} |`;
  });

  return [
    '# BeliefGuard Corpus Benchmark Report',
    '',
    `Generated: ${aggregate.generatedAt}`,
    `Repositories: ${aggregate.successfulRepositoryCount}/${aggregate.repositoryCount} successful`,
    `Iterations per repo: ${aggregate.iterations}`,
    '',
    '| Repo | Files | LOC | Scan p50 | Scan p95 | Validation p50 | Scenario Pass Rate | Unsafe Blocks |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    '## Aggregate',
    '',
    `- Total files scanned: ${aggregate.totalFiles}`,
    `- Total LOC scanned: ${aggregate.totalLines}`,
    `- Total benchmark scenarios: ${aggregate.totalScenarios}`,
    `- Scenario pass rate: ${aggregate.scenarioPassRate}%`,
    `- Unsafe edit blocks: ${aggregate.totalBlocks}`,
    `- Median repo scan p50: ${aggregate.medianRepoScanP50Ms} ms`,
    `- Median repo scan p95: ${aggregate.medianRepoScanP95Ms} ms`,
    `- Median patch validation p50: ${aggregate.medianPatchValidationP50Ms} ms`,
    `- Median patch validation p95: ${aggregate.medianPatchValidationP95Ms} ms`,
    '',
  ].join('\n');
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function escapePipe(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
