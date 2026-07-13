/**
 * Throughput / latency load test: N distinct voters each cast one vote,
 * driven at a fixed concurrency level. Measures enqueue latency, end-to-end
 * latency (until the vote is durably committed), and sustained throughput.
 *
 * Requires a prior `node tests/harness/seed.js` (reads .seed.json).
 *
 * Env:
 *   CONCURRENCY (default 25)   max in-flight votes
 *   VOTES       (default = all seeded voters)
 *
 * Prints a JSON result object and appends it to tests/harness/results.json.
 */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { api, castVoteMeasured, summarize } = require('./lib');

const SEED = path.join(__dirname, '.seed.json');
const RESULTS = path.join(__dirname, 'results.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 25);

async function detectMode(base) {
  try {
    const r = await fetch(`${base}/api/health`);
    const j = await r.json();
    return j.distributed?.votingQueue ? 'distributed' : 'single-node';
  } catch {
    return 'unknown';
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane));
  return results;
}

async function main() {
  if (!fs.existsSync(SEED)) throw new Error('No .seed.json — run `node tests/harness/seed.js` first');
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const base = seed.base;
  const mode = await detectMode(base);

  const total = Math.min(Number(process.env.VOTES || seed.voters.length), seed.voters.length);
  const voters = seed.voters.slice(0, total);

  console.log(`[load] mode=${mode} target=${base} votes=${total} concurrency=${CONCURRENCY}`);

  const t0 = performance.now();
  const outcomes = await runPool(voters, CONCURRENCY, (v, i) =>
    castVoteMeasured({
      token: v.token,
      electionId: seed.electionId,
      candidateId: seed.candidateId,
      idempotencyKey: `load-${seed.electionId}-${i}`
    }).catch((e) => ({ outcome: 'error', enqueueMs: 0, endToEndMs: 0, code: e.message }))
  );
  const wallMs = performance.now() - t0;

  const success = outcomes.filter((o) => o.outcome === 'success');
  const already = outcomes.filter((o) => o.outcome === 'already_voted');
  const errors = outcomes.filter((o) => !['success', 'already_voted'].includes(o.outcome));

  const result = {
    timestamp: new Date().toISOString(),
    mode,
    base,
    votes: total,
    concurrency: CONCURRENCY,
    wallSeconds: round(wallMs / 1000),
    throughputPerSec: round(success.length / (wallMs / 1000)),
    counts: { success: success.length, alreadyVoted: already.length, errors: errors.length },
    enqueueLatencyMs: summarize(outcomes.map((o) => o.enqueueMs)),
    endToEndLatencyMs: summarize(success.map((o) => o.endToEndMs)),
    errorSamples: errors.slice(0, 3).map((e) => ({ code: e.code, status: e.status }))
  };

  console.log(JSON.stringify(result, null, 2));

  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];
  all.push(result);
  fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2));
  console.log(`[load] appended to ${RESULTS}`);
}

const round = (n) => Math.round(n * 100) / 100;

main().catch((e) => {
  console.error('[load] FAILED:', e.message);
  process.exit(1);
});
