/**
 * Analyze results.json: aggregate repetitions (mean +/- stddev) per
 * (mode, concurrency), print a Markdown table, and emit results.csv for
 * plotting in Excel / Python / R.
 */
const fs = require('node:fs');
const path = require('node:path');

const RESULTS = path.join(__dirname, 'results.json');
const CSV = path.join(__dirname, 'results.csv');

function stats(xs) {
  const n = xs.length;
  if (!n) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}
const r2 = (n) => Math.round(n * 100) / 100;

function main() {
  if (!fs.existsSync(RESULTS)) throw new Error('No results.json — run loadtest.js or experiment.js first');
  const data = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));

  const groups = new Map();
  for (const d of data) {
    const key = `${d.mode}|${d.concurrency}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const rows = [];
  for (const [key, ds] of groups) {
    const [mode, concurrency] = key.split('|');
    const tput = stats(ds.map((d) => d.throughputPerSec));
    const p95 = stats(ds.map((d) => d.endToEndLatencyMs.p95));
    const p99 = stats(ds.map((d) => d.endToEndLatencyMs.p99));
    const mean = stats(ds.map((d) => d.endToEndLatencyMs.mean));
    const errors = ds.reduce((a, d) => a + d.counts.errors, 0);
    const okTotal = ds.reduce((a, d) => a + d.counts.success, 0);
    rows.push({
      mode, concurrency: Number(concurrency), reps: ds.length,
      tputMean: r2(tput.mean), tputStd: r2(tput.std),
      latMean: r2(mean.mean), p95: r2(p95.mean), p99: r2(p99.mean),
      success: okTotal, errors
    });
  }
  rows.sort((a, b) => a.mode.localeCompare(b.mode) || a.concurrency - b.concurrency);

  // Markdown table
  console.log('\n## E-Voting performance results\n');
  console.log('| Mode | Concurrency | Reps | Throughput (votes/s) | Mean lat (ms) | p95 (ms) | p99 (ms) | OK | Err |');
  console.log('|------|------------:|-----:|---------------------:|--------------:|---------:|---------:|---:|----:|');
  for (const r of rows) {
    console.log(`| ${r.mode} | ${r.concurrency} | ${r.reps} | ${r.tputMean} ± ${r.tputStd} | ${r.latMean} | ${r.p95} | ${r.p99} | ${r.success} | ${r.errors} |`);
  }

  // CSV
  const header = 'mode,concurrency,reps,throughput_mean,throughput_std,lat_mean_ms,p95_ms,p99_ms,success,errors';
  const lines = rows.map((r) =>
    [r.mode, r.concurrency, r.reps, r.tputMean, r.tputStd, r.latMean, r.p95, r.p99, r.success, r.errors].join(','));
  fs.writeFileSync(CSV, [header, ...lines].join('\n') + '\n');
  console.log(`\nCSV written to ${CSV}`);

  // Quick interpretation hint
  const modes = [...new Set(rows.map((r) => r.mode))];
  if (modes.length === 2) {
    console.log('\nTip: you have both modes — compare throughput at matching concurrency to quantify the distributed speedup.');
  }
}

main();
