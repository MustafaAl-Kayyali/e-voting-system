/**
 * Experimental sweep: for each concurrency level (and repetitions), freshly
 * seed an election + voter pool, then drive N distinct votes and record
 * throughput + latency. Each data point is independent (fresh voters), so
 * results are reproducible and comparable across runs/modes.
 *
 * Env:
 *   API_BASE_URL   target (LB :8080 = distributed, API :3000 = single-node)
 *   CONCURRENCIES  comma list (default "5,10,25,50")
 *   VOTES          votes per data point (default 100)
 *   REPS           repetitions per level (default 3)
 *
 * Appends every data point to tests/harness/results.json.
 */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const {
  signupAdmin, createActiveElection, signupVoter, getCandidateId, castVoteMeasured, summarize
} = require('./lib');

const RESULTS = path.join(__dirname, 'results.json');
const CONCURRENCIES = (process.env.CONCURRENCIES || '5,10,25,50').split(',').map(Number);
const VOTES = Number(process.env.VOTES || 100);
const REPS = Number(process.env.REPS || 3);
const DISTRICT = process.env.DISTRICT || 'Main Office';

async function detectMode(base) {
  const r = await fetch(`${base}/api/health`);
  const j = await r.json();
  return j.distributed?.votingQueue ? 'distributed' : 'single-node';
}

async function runPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, lane));
  return out;
}

async function seedPoint() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const admin = await signupAdmin(suffix);
  const electionId = await createActiveElection(admin.token, { title: `Exp ${suffix}`, district: DISTRICT });
  const voters = [];
  const BATCH = 20;
  for (let i = 0; i < VOTES; i += BATCH) {
    const slice = await Promise.all(
      Array.from({ length: Math.min(BATCH, VOTES - i) }, (_, k) =>
        signupVoter(i + k, DISTRICT, suffix).catch(() => null))
    );
    voters.push(...slice.filter(Boolean));
  }
  const candidateId = await getCandidateId(voters[0].token, electionId);
  return { electionId, candidateId, voters };
}

async function dataPoint(base, mode, concurrency, rep) {
  const { electionId, candidateId, voters } = await seedPoint();
  const t0 = performance.now();
  const outcomes = await runPool(voters, concurrency, (v, i) =>
    castVoteMeasured({ token: v.token, electionId, candidateId, idempotencyKey: `exp-${electionId}-${i}` })
      .catch((e) => ({ outcome: 'error', enqueueMs: 0, endToEndMs: 0, code: e.message })));
  const wallMs = performance.now() - t0;
  const success = outcomes.filter((o) => o.outcome === 'success');
  return {
    timestamp: new Date().toISOString(),
    mode, base, rep, votes: voters.length, concurrency,
    wallSeconds: round(wallMs / 1000),
    throughputPerSec: round(success.length / (wallMs / 1000)),
    counts: {
      success: success.length,
      alreadyVoted: outcomes.filter((o) => o.outcome === 'already_voted').length,
      errors: outcomes.filter((o) => !['success', 'already_voted'].includes(o.outcome)).length
    },
    endToEndLatencyMs: summarize(success.map((o) => o.endToEndMs))
  };
}

async function main() {
  const base = process.env.API_BASE_URL || 'http://localhost:8080';
  const mode = await detectMode(base);
  console.log(`[exp] mode=${mode} base=${base} concurrencies=${CONCURRENCIES} votes=${VOTES} reps=${REPS}`);
  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : [];

  for (const c of CONCURRENCIES) {
    for (let rep = 1; rep <= REPS; rep++) {
      process.stdout.write(`[exp] concurrency=${c} rep=${rep}/${REPS} ... `);
      const dp = await dataPoint(base, mode, c, rep);
      console.log(`tput=${dp.throughputPerSec}/s p95=${dp.endToEndLatencyMs.p95}ms ok=${dp.counts.success} err=${dp.counts.errors}`);
      all.push(dp);
      fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2));
    }
  }
  console.log(`[exp] done -> ${RESULTS}  (run: node tests/harness/analyze.js)`);
}

const round = (n) => Math.round(n * 100) / 100;
main().catch((e) => { console.error('[exp] FAILED:', e.message); process.exit(1); });
