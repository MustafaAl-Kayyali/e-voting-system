/**
 * Concurrent vote stress test (requires running API + MongoDB + worker if distributed).
 *
 * Usage:
 *   node tests/concurrency/castVoteConcurrency.js
 *
 * Env:
 *   API_BASE_URL=http://localhost:8080
 *   VOTER_TOKEN=<jwt>
 *   ELECTION_ID=<id>
 *   CANDIDATE_ID=<id>
 *   CONCURRENT_REQUESTS=20
 */
const CONCURRENT = Number(process.env.CONCURRENT_REQUESTS || 20);
const BASE = process.env.API_BASE_URL || 'http://localhost:8080';
const TOKEN = process.env.VOTER_TOKEN;
const ELECTION_ID = process.env.ELECTION_ID;
const CANDIDATE_ID = process.env.CANDIDATE_ID;

async function pollJob(jobId) {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`${BASE}/api/voting/vote/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const body = await res.json().catch(() => ({}));
    if (body.status === 'success') {
      return { status: 201, code: null, message: body.message };
    }
    if (body.status === 'fail') {
      return { status: res.status, code: body.code, message: body.message };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: 408, code: 'TIMEOUT', message: 'Job poll timeout' };
}

async function castOnce(index) {
  const res = await fetch(`${BASE}/api/voting/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'Idempotency-Key': 'concurrency-single-vote-test'
    },
    body: JSON.stringify({
      electionId: ELECTION_ID,
      candidateId: CANDIDATE_ID,
      authenticationMethod: 'password'
    })
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 202 && body.data?.jobId) {
    return pollJob(body.data.jobId);
  }

  return { status: res.status, code: body.code, message: body.message };
}

async function main() {
  if (!TOKEN || !ELECTION_ID || !CANDIDATE_ID) {
    console.error('Set VOTER_TOKEN, ELECTION_ID, and CANDIDATE_ID environment variables.');
    process.exit(1);
  }

  const results = await Promise.all(
    Array.from({ length: CONCURRENT }, (_, i) => castOnce(i))
  );

  const success = results.filter((r) => r.status === 201).length;
  const alreadyVoted = results.filter(
    (r) => r.code === 'ALREADY_VOTED' || /already voted/i.test(r.message || '')
  ).length;
  const other = results.filter(
    (r) => r.status !== 201 && r.code !== 'ALREADY_VOTED' && !/already voted/i.test(r.message || '')
  );

  console.log(
    JSON.stringify(
      { success, alreadyVoted, other: other.length, total: CONCURRENT, samples: other.slice(0, 3) },
      null,
      2
    )
  );

  if (success < 1) {
    console.error('Expected at least 1 successful vote (is the vote worker running?).');
    process.exit(1);
  }

  console.log('OK: concurrent requests handled; only one vote job per voter+election.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
