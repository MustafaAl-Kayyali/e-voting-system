# Distributed E-Voting Setup

This project runs as a **distributed system** with:

- **2 API instances** (`api1`, `api2`) behind **Nginx** load balancer
- **Redis** — shared rate limits, idempotency, vote locks
- **BullMQ worker** — async vote processing
- **MongoDB replica set** — transactional vote writes

## Quick start (Docker)

```bash
# From project root
docker compose up --build
```

| Service | URL |
|---------|-----|
| Load-balanced API | http://localhost:8080 |
| API health | http://localhost:8080/api/health |
| Redis | localhost:6379 |
| MongoDB | localhost:27017 |

Point the frontend at the load balancer:

```bash
# View/.env
VITE_API_URL=http://localhost:8080/api
```

## Local development (without Docker)

**Terminal 1 — Redis** (Docker or local install):

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Terminal 2 — MongoDB replica set** (required for transactions):

Use `docker compose up mongo mongo-init` or a local replica set.

**Terminal 3 — API:**

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

**Terminal 4 — Worker:**

```bash
cd backend
npm run dev:worker
```

Set in `backend/.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
DISTRIBUTED_VOTING=true
DATABASE=mongodb://127.0.0.1:27017/evoting?replicaSet=rs0
```

Without `REDIS_URL`, voting falls back to **synchronous** mode (single-node).

## Vote flow (distributed)

1. `POST /api/voting/vote` → **202 Accepted** + `jobId`
2. Worker consumes queue → `castVoteAtomic()`
3. Client polls `GET /api/voting/vote/jobs/:jobId` until `completed`

## Concurrency test (through load balancer)

```powershell
$env:API_BASE_URL="http://localhost:8080"
$env:VOTER_TOKEN="<jwt>"
$env:ELECTION_ID="<id>"
$env:CANDIDATE_ID="<id>"
cd backend
npm run test:concurrency
```

Expected: exactly **1** success, others `ALREADY_VOTED`.

## Architecture

```
Client → Nginx → api1 / api2 → Redis (rate limit, idempotency, queue)
                              ↘ worker → MongoDB (replica set)
```
