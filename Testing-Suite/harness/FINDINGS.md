# E-Voting — Testing Findings & Results

Environment: Windows + Docker Desktop (WSL2). Distributed stack = Nginx LB (:8080)
→ api-1 + api-2 → Redis (BullMQ queue + locks + rate limits) → vote worker →
MongoDB replica set (rs0). Single-node comparison = one API container (:3001),
`DISTRIBUTED_VOTING=false`, synchronous voting, same MongoDB.

## 1. Unit tests
`npm test` → **12 passed / 0 failed** (vote hashing/integrity, vote-cast helpers,
auth validation). Pure in-memory, no infrastructure.

## 2. Concurrency / idempotency (correctness)
20 simultaneous vote requests from the **same** voter+election:
- Outcome: **exactly 1 vote recorded** (verified via receipt count = 1).
- Mechanism: deterministic BullMQ `jobId = vote:<voter>:<election>`, Redis vote
  lock (surplus requests get `409 VOTE_IN_PROGRESS`), and the unique Mongo index
  `{voter, election}`. Multiple clients observing the single shared job all see
  "success", but only one ballot exists.

## 3. Performance benchmarking + 4. Experimental analysis
Concurrency sweep, 60 votes/point, 2 reps/point, fresh-seeded each point.

| Mode | Concurrency | Throughput (votes/s) | Mean (ms) | p95 (ms) | p99 (ms) | Err |
|------|------------:|---------------------:|----------:|---------:|---------:|----:|
| distributed | 10 | 10.19 ± 2.44 | 998  | 2563 | 4882 | 0 |
| distributed | 25 | 12.96 ± 0.36 | 1559 | 2917 | 3972 | 0 |
| distributed | 50 | **24.41 ± 1.19** | 1286 | **1919** | 2464 | 0 |
| single-node | 10 | 14.87 ± 1.30 | 617  | 2529 | 3979 | 0 |
| single-node | 25 | 11.27 ± 0.20 | 1891 | 4780 | 5052 | 0 |
| single-node | 50 | 11.18 ± 0.16 | 3622 | 4934 | 5293 | 0 |

### Interpretation
- **Low load (c=10):** single-node is faster (14.9 vs 10.2 v/s, 617 vs 998 ms mean)
  — the queue + client polling add fixed overhead the synchronous path avoids.
- **High load (c=50):** the architectures cross over. Distributed **scales up**
  (10→13→24 v/s) while single-node **saturates and degrades** (15→11→11 v/s) with
  latency ballooning (mean 617→3622 ms; p95 2.5→4.9 s).
- **Net at c=50: distributed delivers ~2.2× the throughput and ~2.6× lower p95
  latency** than single-node. This is the classic distributed-systems trade-off:
  pay constant overhead to gain horizontal scalability and burst absorption.
- Zero errors and zero double-votes across all 720 votes.

## Bugs found & fixed during bring-up
1. **Distributed vote poll broken** (`services/voteEnqueueService.js`):
   `removeOnComplete: true` deleted the job the instant it finished, so the
   documented `GET /vote/jobs/:id` poll always returned 404 even though the vote
   committed. Fixed: retain completed jobs (`{ age: 300, count: 1000 }`).
2. **Reverse-proxy IP** (`app.js`): added `trust proxy` so `req.ip` /
   express-rate-limit use the real client IP from Nginx `X-Forwarded-For`
   (was throwing `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`).
3. **Rate-limit store reuse** (`config/redis.js`, `config/rateLimiters.js`):
   each limiter now builds its own Redis store with a unique prefix
   (express-rate-limit v8 forbids sharing → `ERR_ERL_STORE_REUSE`).
4. **Rate limits not tunable** — `globalLimiter`/`voteCastLimiter` and the custom
   in-memory `rateLimitByIP` (auth) are now env-configurable
   (`RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_VOTE_MAX`, `AUTH_RATE_LIMIT_MAX`);
   defaults preserve production behaviour. The test stack sets them high.

## Reproduce
```bash
# stack up
docker compose up -d --build
# unit
cd backend && npm test
# correctness
API_BASE_URL=http://localhost:8080 VOTERS=5 node tests/harness/seed.js
#   then npm run test:concurrency with VOTER_TOKEN/ELECTION_ID/CANDIDATE_ID
# performance / experiment (distributed)
API_BASE_URL=http://localhost:8080 CONCURRENCIES=10,25,50 VOTES=60 REPS=2 node tests/harness/experiment.js
# single-node container on :3001 (see README), then experiment against it
node tests/harness/analyze.js   # -> table + results.csv
```
