/**
 * Seed an election + a pool of voters for functional demo and load testing.
 *
 * Env:
 *   API_BASE_URL   (default http://localhost:8080)   target (LB for distributed, :3000 for single-node)
 *   VOTERS         (default 50)                       number of distinct voters to register
 *   DISTRICT       (default "Main Office")
 *   TITLE          (default "Benchmark Election <ts>")
 *
 * Writes tests/harness/.seed.json with { electionId, candidateId, district, voters:[{token,...}] }.
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  signupAdmin, createActiveElection, signupVoter, getCandidateId
} = require('./lib');

const VOTERS = Number(process.env.VOTERS || 50);
const DISTRICT = process.env.DISTRICT || 'Main Office';
const SUFFIX = Date.now();
const TITLE = process.env.TITLE || `Benchmark Election ${SUFFIX}`;
const OUT = path.join(__dirname, '.seed.json');

async function main() {
  console.log(`[seed] admin...`);
  const admin = await signupAdmin(SUFFIX);

  console.log(`[seed] election "${TITLE}" (district: ${DISTRICT})...`);
  const electionId = await createActiveElection(admin.token, { title: TITLE, district: DISTRICT });

  console.log(`[seed] registering ${VOTERS} voters...`);
  const voters = [];
  // register in small batches to avoid tripping the global rate limiter
  const BATCH = 20;
  for (let i = 0; i < VOTERS; i += BATCH) {
    const slice = await Promise.all(
      Array.from({ length: Math.min(BATCH, VOTERS - i) }, (_, k) =>
        signupVoter(i + k, DISTRICT, SUFFIX).catch((e) => ({ error: e.message }))
      )
    );
    voters.push(...slice);
    process.stdout.write(`  ${Math.min(i + BATCH, VOTERS)}/${VOTERS}\r`);
  }
  const ok = voters.filter((v) => v.token);
  const failed = voters.length - ok.length;
  console.log(`\n[seed] voters registered: ${ok.length} ok, ${failed} failed`);

  const candidateId = await getCandidateId(ok[0].token, electionId);

  const seed = {
    createdAt: new Date().toISOString(),
    base: process.env.API_BASE_URL || 'http://localhost:8080',
    adminToken: admin.token,
    electionId,
    candidateId,
    district: DISTRICT,
    voters: ok.map((v) => ({ token: v.token, nationalId: v.nationalId }))
  };
  fs.writeFileSync(OUT, JSON.stringify(seed, null, 2));
  console.log(`[seed] wrote ${OUT}`);
  console.log(`[seed] electionId=${electionId}`);
  console.log(`[seed] candidateId=${candidateId}`);
  console.log(`[seed] sample VOTER_TOKEN for concurrency test:\n  ${ok[0].token}`);
}

main().catch((e) => {
  console.error('[seed] FAILED:', e.message);
  process.exit(1);
});
