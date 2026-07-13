# E-Voting Test Harness

A dependency-free harness (Node 18+ global `fetch`) for the four testing activities:
**unit testing, concurrency/correctness, performance benchmarking, and experimental analysis.**

All scripts target whatever API is at `API_BASE_URL`:
- `http://localhost:8080` → Nginx load balancer → **distributed** mode (api1/api2 + Redis queue + worker)
- `http://localhost:3000` → a single API process → **single-node** synchronous mode

The scripts auto-detect the mode from `/api/health` and tag every result, so you can
run the same experiment against both and compare.

---

## 1. Unit testing (no infrastructure needed)

```bash
cd backend
npm test
```

Pure in-memory tests of vote hashing/integrity, vote-cast helpers, and auth
validation. 12 tests, ~1 s. Run this first — it needs no DB.

## 2. Functional seed + concurrency / idempotency

```bash
# Seed an election + 50 voters against the load balancer
API_BASE_URL=http://localhost:8080 VOTERS=50 node tests/harness/seed.js
```

This writes `.seed.json` (electionId, candidateId, voter tokens) and prints a
sample `VOTER_TOKEN`. Use it for the built-in concurrency safety test —
**many concurrent requests from ONE voter must yield exactly one vote:**

```powershell
$env:API_BASE_URL="http://localhost:8080"
$env:VOTER_TOKEN="<sample token from seed>"
$env:ELECTION_ID="<electionId from seed>"
$env:CANDIDATE_ID="<candidateId from seed>"
$env:CONCURRENT_REQUESTS="20"
npm run test:concurrency
# Expected: success=1, the rest ALREADY_VOTED
```

## 3. Performance benchmarking (throughput + latency)

Drives N **distinct** voters (one vote each) at a fixed concurrency and reports
enqueue latency, end-to-end latency (until the vote is durably committed), and
sustained throughput.

```bash
API_BASE_URL=http://localhost:8080 node tests/harness/seed.js   # VOTERS>=VOTES
CONCURRENCY=25 VOTES=50 node tests/harness/loadtest.js
```

Each run appends to `results.json`.

## 4. Experimental analysis (sweep + stats)

Sweeps concurrency levels with repetitions, freshly seeding each data point so
points are independent and reproducible:

```bash
# Distributed
API_BASE_URL=http://localhost:8080 CONCURRENCIES=5,10,25,50 VOTES=100 REPS=3 \
  node tests/harness/experiment.js

# Single-node (start a local API on :3000 first, see below), then:
API_BASE_URL=http://localhost:3000 CONCURRENCIES=5,10,25,50 VOTES=100 REPS=3 \
  node tests/harness/experiment.js

# Aggregate -> Markdown table + results.csv
node tests/harness/analyze.js
```

### Running a single-node API for comparison
With the Docker stack up (Mongo exposed on 27017, Redis on 6379), start a local
synchronous API that reuses the same database but **without** the queue:

```powershell
cd backend
$env:PORT="3000"; $env:DISTRIBUTED_VOTING="false"
$env:DATABASE="mongodb://127.0.0.1:27017/evoting?replicaSet=rs0"
node server.js
```

Now `experiment.js` against `:3000` is tagged `single-node`, and against `:8080`
is tagged `distributed` — `analyze.js` puts both in one table for a clean
speedup comparison.

## Files
| File | Purpose |
|------|---------|
| `lib.js` | API client + measurement helpers |
| `seed.js` | Register admin/election/voters → `.seed.json` |
| `loadtest.js` | One throughput/latency run → `results.json` |
| `experiment.js` | Concurrency sweep with repetitions → `results.json` |
| `analyze.js` | Aggregate (mean±std) → Markdown table + `results.csv` |

`.seed.json`, `results.json`, `results.csv` are generated artifacts (git-ignore them).
