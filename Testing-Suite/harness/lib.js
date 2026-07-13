/**
 * Shared helpers for the e-voting test harness.
 * Dependency-free: uses Node 18+ global fetch and node:perf_hooks.
 */
const { performance } = require('node:perf_hooks');

const BASE = process.env.API_BASE_URL || 'http://localhost:8080';

async function api(path, { method = 'GET', token, body, idempotencyKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const STRONG_PASSWORD = 'Voter@12345';

async function signupAdmin(suffix = Date.now()) {
  const username = `admin_${suffix}`;
  const email = `admin_${suffix}@evoting.test`;
  const r = await api('/api/auth/signup/admin', {
    method: 'POST',
    body: {
      username,
      firstName: 'Bench',
      lastName: 'Admin',
      email,
      password: STRONG_PASSWORD,
      role: 'super_admin',
      department: 'IT'
    }
  });
  if (r.status !== 201) throw new Error(`admin signup failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.data.token, username, email };
}

async function createActiveElection(token, { title, district = 'Main Office', candidates }) {
  const now = Date.now();
  const r = await api('/api/admin/elections', {
    method: 'POST',
    token,
    body: {
      title,
      description: 'Benchmark election',
      type: 'presidential',
      // start in the past, end in the future -> created directly as "active"
      startDate: new Date(now - 60 * 1000).toISOString(),
      endDate: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      electoralDistricts: district,
      candidates: candidates || ['Alice Anderson', 'Bob Brown', 'Carol Clark'],
      settings: { requireTwoFactor: false }
    }
  });
  if (r.status !== 201) throw new Error(`create election failed: ${JSON.stringify(r.body)}`);
  return r.body.data.election.id;
}

async function signupVoter(i, district = 'Main Office', suffix = Date.now()) {
  // nationalId and email must be unique
  const nationalId = `${suffix}${String(i).padStart(5, '0')}`;
  const email = `voter_${suffix}_${i}@evoting.test`;
  const r = await api('/api/auth/signup/voter', {
    method: 'POST',
    body: {
      id: nationalId,
      firstName: `Voter${i}`,
      lastName: 'Test',
      email,
      phoneNumber: '1000000000',
      dateOfBirth: '1990-01-01',
      electoralDistrict: district,
      password: STRONG_PASSWORD
    }
  });
  if (r.status !== 201) throw new Error(`voter ${i} signup failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.data.token, nationalId, email };
}

async function getCandidateId(voterToken, electionId) {
  const r = await api(`/api/voting/elections/${electionId}/candidates`, { token: voterToken });
  if (r.status !== 200) throw new Error(`get candidates failed: ${JSON.stringify(r.body)}`);
  const list = r.body.data.candidates;
  if (!list || !list.length) throw new Error('no eligible candidates (district mismatch?)');
  return list[0]._id || list[0].id;
}

/**
 * Cast a single vote and resolve only when the vote is fully durable.
 * Handles both modes:
 *   - distributed: 202 + jobId -> poll until completed/failed
 *   - single-node: 201 immediately
 * Returns { outcome: 'success'|'already_voted'|'error', enqueueMs, endToEndMs, status, code }
 */
async function castVoteMeasured({ token, electionId, candidateId, idempotencyKey, pollIntervalMs = 100, pollTimeoutMs = 30000 }) {
  const t0 = performance.now();
  const r = await api('/api/voting/vote', {
    method: 'POST',
    token,
    idempotencyKey,
    body: { electionId, candidateId, authenticationMethod: 'password' }
  });
  const enqueueMs = performance.now() - t0;

  // Single-node synchronous success
  if (r.status === 201) {
    return { outcome: 'success', enqueueMs, endToEndMs: enqueueMs, status: 201, code: null };
  }
  // Synchronous already-voted / failure
  if (r.status !== 202) {
    const outcome = classify(r.status, r.body);
    return { outcome, enqueueMs, endToEndMs: enqueueMs, status: r.status, code: r.body.code };
  }

  // Distributed: poll the job
  const jobId = r.body.data?.jobId;
  const deadline = t0 + pollTimeoutMs;
  while (performance.now() < deadline) {
    const j = await api(`/api/voting/vote/jobs/${jobId}`, { token });
    const state = j.body.data?.state || j.body.status;
    if (j.body.status === 'success' || state === 'completed') {
      return { outcome: 'success', enqueueMs, endToEndMs: performance.now() - t0, status: 201, code: null };
    }
    if (j.body.status === 'fail' || state === 'failed') {
      const outcome = classify(j.status, j.body);
      return { outcome, enqueueMs, endToEndMs: performance.now() - t0, status: j.status, code: j.body.code };
    }
    await sleep(pollIntervalMs);
  }
  return { outcome: 'timeout', enqueueMs, endToEndMs: performance.now() - t0, status: 408, code: 'TIMEOUT' };
}

function classify(status, body) {
  const msg = (body && body.message) || '';
  if (body?.code === 'ALREADY_VOTED' || /already voted/i.test(msg)) return 'already_voted';
  if (status >= 200 && status < 300) return 'success';
  return 'error';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(latencies) {
  const s = [...latencies].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    count: s.length,
    min: round(s[0] || 0),
    mean: round(sum / (s.length || 1)),
    p50: round(percentile(s, 50)),
    p95: round(percentile(s, 95)),
    p99: round(percentile(s, 99)),
    max: round(s[s.length - 1] || 0)
  };
}

const round = (n) => Math.round(n * 100) / 100;

module.exports = {
  BASE,
  api,
  signupAdmin,
  createActiveElection,
  signupVoter,
  getCandidateId,
  castVoteMeasured,
  summarize,
  sleep,
  STRONG_PASSWORD
};
