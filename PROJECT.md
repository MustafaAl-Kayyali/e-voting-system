# E-Voting System — Project Documentation

A full-stack **electronic voting platform** built for a distributed-systems course. It supports voter registration, secure ballot casting, election administration, and audit workflows. The backend can run as a **distributed deployment** (multiple API instances, Redis, message queue, MongoDB replica set) or in **local single-node** mode for development.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Technology stack](#technology-stack)
3. [Repository structure](#repository-structure)
4. [User roles](#user-roles)
5. [Authentication (login & signup)](#authentication-login--signup)
6. [Frontend pages (detailed)](#frontend-pages-detailed)
7. [Backend API reference](#backend-api-reference)
8. [Voting system (core logic)](#voting-system-core-logic)
9. [Distributed architecture](#distributed-architecture)
10. [Database models](#database-models)
11. [Security features](#security-features)
12. [Running the project](#running-the-project)
13. [Testing](#testing)
14. [Related documentation](#related-documentation)

---

## Project overview

| Aspect | Description |
|--------|-------------|
| **Purpose** | Digital elections: voters cast one ballot per election; admins manage elections and candidates; auditors review integrity and logs. |
| **Frontend** | React (Vite) SPA at `View/` — port **5173** by default |
| **Backend** | Node.js + Express API at `backend/` — port **3000** by default |
| **Database** | MongoDB (Mongoose ODM) |
| **Distributed extras** | Redis, BullMQ worker, Nginx load balancer (see [DISTRIBUTED.md](./DISTRIBUTED.md)) |

### High-level flow

```
Voter signs up (ID + profile) → Admin creates/starts election → Voter logs in with ID
→ Selects election → Chooses candidate → Confirms vote → Receives receipt
Admin views results → Auditor reviews logs and metrics
```

---

## Technology stack

### Frontend (`View/`)

- **React 18** + **React Router** — routing and protected dashboards
- **Axios** — HTTP client (`src/api/api.js`), JWT in `Authorization` header
- **Lucide React** — icons
- **Vite** — dev server and build

### Backend (`backend/`)

- **Express 5** — REST API
- **Mongoose** — MongoDB models
- **JWT** — session tokens
- **bcryptjs** — password hashing
- **Helmet, CORS, express-rate-limit** — security and throttling
- **BullMQ + ioredis** — async vote queue (when `REDIS_URL` is set)
- **speakeasy / qrcode** — optional two-factor authentication

---

## Repository structure

```
Project Distributed/
├── PROJECT.md              ← This file
├── DISTRIBUTED.md          ← Docker / Redis / worker setup
├── docker-compose.yml      ← Multi-instance distributed stack
├── nginx.conf              ← Load balancer config
├── View/                   ← React frontend
│   ├── src/
│   │   ├── App.jsx         ← Routes & protected routes
│   │   ├── api/api.js      ← API base URL & interceptors
│   │   ├── context/authContext.jsx
│   │   └── pages/          ← All UI screens
│   └── package.json
└── backend/
    ├── server.js           ← API entry point
    ├── worker.js           ← Vote queue worker
    ├── app.js              ← Express app & middleware
    ├── Controllers/        ← Route handlers
    ├── Models/             ← Mongoose schemas
    ├── routes/             ← API route definitions
    ├── services/           ← voteCastService, voteEnqueueService, etc.
    ├── middleware/         ← auth, idempotency, rate limits
    ├── queues/             ← BullMQ vote queue
    ├── config/             ← Redis, DB, rate limiters
    └── tests/              ← Unit & concurrency scripts
```

---

## User roles

| Role | Dashboard route | Access |
|------|-----------------|--------|
| **Voter** | `/voter-dashboard` | Vote, view history, voting status |
| **Administrator** | `/admin-dashboard` | Elections, candidates, voter registry (`election_admin`, `super_admin`, etc.) |
| **Auditor** | `/auditor-dashboard` | Logs, integrity, analytics (`auditor`, `super_admin`) |

`App.jsx` uses `ProtectedRoute` to redirect unauthenticated users to `/login` and block wrong role access.

---

## Authentication (login & signup)

### Voter signup — `/signup`

**Page:** `View/src/pages/Signup.jsx`  
**API:** `POST /api/auth/signup/voter`

| Field | Purpose |
|-------|---------|
| **ID** | Unique national ID — **used to log in** (stored as `nationalId`) |
| First name / Last name | Display name |
| Email | Contact & uniqueness check (not used for voter login) |
| Phone number | Optional profile data |
| Date of birth | Eligibility |
| Electoral district | District-based voting rules |
| Password / Confirm | Must match; min 8 chars; complexity rules on server |

On success, the user is logged in automatically and redirected to **Voter Dashboard**.

---

### Voter login — `/login` (Voter tab)

**Page:** `View/src/pages/Login.jsx`  
**API:** `POST /api/auth/login/voter`

| Field | Purpose |
|-------|---------|
| **ID** | Same value as registered at signup (`nationalId`) |
| Password | Account password |
| 2FA code | Shown only if two-factor is enabled on the account |

**Important:** Voters log in with **ID + password**, not email.

---

### Admin signup — `/admin/signup`

**Page:** `View/src/pages/AdminSignup.jsx`  
**API:** `POST /api/auth/signup/admin`

| Field | Purpose |
|-------|---------|
| Username | Login identifier (or use email on login) |
| First / Last name | Profile |
| Email | Login alternative + uniqueness |
| Department / Phone | Admin metadata |
| Role | e.g. `election_admin`, `super_admin` |
| Password / Confirm | Server-validated strength |

Redirects to **Admin Dashboard** on success.

---

### Admin login — `/login` (Admin tab)

**API:** `POST /api/auth/login/admin`

| Field | Purpose |
|-------|---------|
| Username **or** email | Resolved server-side |
| Password | Account password |
| 2FA code | If enabled |

---

### Auth context (`authContext.jsx`)

Centralizes:

- `login(id, password, twoFactorToken, userType)` — calls correct auth endpoint
- `signup(userData)` — voter → `/auth/signup/voter`
- `signupAdmin(adminData)` — `/auth/signup/admin`
- `logout()` — clears `localStorage` token and user
- Persists `token`, `user`, `userType` in `localStorage`

API base URL: `VITE_API_URL` or `http://localhost:3000/api`.

---

## Frontend pages (detailed)

### 1. Login — `/login`

**File:** `View/src/pages/Login.jsx`

**Purpose:** Entry point for all users.

**UI elements:**

- Header: “Sign In”
- **User type toggle:** Voter | Admin
- **ID** field (voters) or **Username or Email** (admins)
- Password field
- Optional **2FA** field after first step if required
- Submit → authenticates and navigates to role dashboard
- Footer link → Signup (voter) or Admin signup

**Navigation after login:**

| Role | Destination |
|------|-------------|
| `voter` | `/voter-dashboard` |
| Admin roles | `/admin-dashboard` |
| `auditor` | `/auditor-dashboard` |

---

### 2. Voter signup — `/signup`

**File:** `View/src/pages/Signup.jsx`

**Purpose:** Self-registration for voters.

**Behavior:**

- Validates passwords match and minimum length client-side
- Posts to auth signup API with **ID** (`nationalId`)
- On success → `/voter-dashboard`
- Link back to login

---

### 3. Admin signup — `/admin/signup`

**File:** `View/src/pages/AdminSignup.jsx`

**Purpose:** Create administrator accounts.

**Behavior:**

- Role selection (e.g. election admin)
- Posts to `/api/auth/signup/admin`
- On success → `/admin-dashboard`

---

### 4. Voter dashboard — `/voter-dashboard`

**File:** `View/src/pages/VoterDashboard.jsx`  
**Access:** Authenticated voters only

**Header:** Voter name, logout button

#### Tab: Elections

- Lists **active elections** the voter can still vote in (`GET /api/voting/elections`)
- Each card: title, type, description, dates
- **View Candidates** → drill-down for one election

**Candidate selection view:**

- Lists candidates for that election (filtered by electoral district when applicable)
- Click to select a candidate
- **Review Selection** → opens confirmation modal
- **Confirm and Cast Vote** → `POST /api/voting/vote`
  - If distributed mode (Redis): returns `202` + `jobId`, polls until complete
  - Shows **receipt ID** on success
- **Back to Elections** returns to list

#### Tab: Vote history

- Past votes (`GET /api/voting/votes`)
- Election title, candidate name, date, receipt ID

#### Tab: Voting status

- Cards: has voted, verified, elections available, elections completed
- Data from `GET /api/voting/status`

---

### 5. Admin dashboard — `/admin-dashboard`

**File:** `View/src/pages/AdminDashboard.jsx`  
**Access:** `super_admin`, `election_admin`, `admin`, `voter_registry_admin` (admin route group)

**Header:** Admin name, logout

#### Tab: Elections

- Table of all elections: title, type, status, dates, vote counts
- **Create Election** modal:
  - Title, description, type (parliamentary, presidential, municipal, referendum, etc.)
  - Start / end dates
  - Electoral districts (comma-separated)
  - Candidate names (2–5 slots)
  - Default settings: one vote per voter, audit allowed
- **Actions per row:**
  - **Draft** → Start (▶)
  - **Active** → Pause (⏸) or End (■)
  - **Paused** → Resume or End
  - **Completed** → View results modal

**APIs:** `/api/admin/elections`, `.../start`, `.../pause`, `.../end`, `.../results`

#### Tab: Candidates

- Table: name, party, position, district, linked elections, status
- **Add Candidate** (UI present; wire to API as needed)
- Pending candidates: approve / reject actions (UI)
- Data from `GET /api/candidates`

#### Tab: Voter registry

- Table of registered voters
- **Upload Voter List** (UI for bulk CSV upload)
- Whitelist / verify operations via `/api/voter-registry`
- Used to control who may vote when `STRICT_VOTER_ELIGIBILITY=true`

---

### 6. Auditor dashboard — `/auditor-dashboard`

**File:** `View/src/pages/AuditorDashboard.jsx`  
**Access:** `auditor`, `super_admin`

**Header:** Auditor name, logout

#### Tab: Integrity

- Placeholder cards for election integrity verification and blockchain checks
- Backend support: `POST /api/audit/elections/:electionId/verify-integrity`

#### Tab: System logs

- Table of audit log entries (timestamp, event type, action, description, severity, success)
- **Generate Report** → downloads JSON report
- `GET /api/audit/logs`

#### Tab: Voter activity

- Statistics: total votes, peak hour/day, average votes per hour
- `GET /api/audit/analytics/voter-activity`

#### Tab: System metrics

- Total events, error rate, security events, system health status
- `GET /api/audit/metrics/system-performance`

---

## Backend API reference

Base path: `/api` (e.g. `http://localhost:3000/api`)

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info and endpoint list |
| GET | `/health` | Health + instance ID + distributed flags |

### Auth — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/signup/voter` | Register voter (ID, email, password, …) |
| POST | `/signup/admin` | Register administrator |
| POST | `/login/voter` | Login with `nationalId` + password |
| POST | `/login/admin` | Login with username/email + password |
| POST | `/enable-2fa` | Start 2FA setup (protected) |
| POST | `/verify-2fa` | Confirm 2FA (protected) |

### Voting — `/api/voting` (voter JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections` | Elections voter can vote in |
| GET | `/elections/:electionId/candidates` | Candidates for an election |
| POST | `/vote` | Cast vote (202 + jobId if distributed) |
| GET | `/vote/jobs/:jobId` | Poll async vote job status |
| GET | `/vote/verify/:receiptId` | Verify own vote receipt |
| GET | `/votes` | Voting history |
| GET | `/status` | Voting status summary |

### Admin — `/api/admin` (admin JWT)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/elections` | Create election |
| GET | `/elections` | List elections |
| PATCH | `/elections/:electionId` | Update election |
| POST | `/elections/:electionId/start` | Start |
| POST | `/elections/:electionId/pause` | Pause |
| POST | `/elections/:electionId/end` | End |
| GET | `/elections/:electionId/results` | Results |
| POST | `/elections/:electionId/publish-results` | Publish results |

### Candidates — `/api/candidates`

CRUD, approve, reject, stats (admin roles).

### Voter registry — `/api/voter-registry`

List voters, upload CSV, whitelist, verify, assign to election.

### Audit — `/api/audit`

Logs, reports, voter activity, system metrics, integrity verification.

### Legacy users — `/api/users`

Older `User` model with numeric `Id`. **Prefer `/api/auth` for new work.**

---

## Voting system (core logic)

### Rules

- **One vote per voter per election** (unless `allowMultipleVotes` is enabled on the election).
- Votes are **immutable** (no public update/delete).
- Duplicate votes blocked by:
  - Unique MongoDB index `{ voter: 1, election: 1 }`
  - Pre-insert checks
  - MongoDB transactions (when replica set available)
  - Redis vote lock + queue job deduplication (distributed mode)

### Cast vote pipeline

1. Validate election active, candidate eligible, voter eligible.
2. `voteCastService.castVoteAtomic()`:
   - Create `Vote` document (encrypted payload, receipt, hash).
   - Update voter `votedInElections`.
   - Increment election and candidate tallies.
   - Write audit log.

### Distributed mode

When `REDIS_URL` is set and worker is running:

1. API enqueues job → **202 Accepted**
2. Worker runs `castVoteAtomic()`
3. Client polls `GET /vote/jobs/:jobId`

See [DISTRIBUTED.md](./DISTRIBUTED.md) for setup.

---

## Distributed architecture

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │    Nginx    │  (port 8080)
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼                         ▼
        ┌──────────┐              ┌──────────┐
        │  API 1   │              │  API 2   │
        └────┬─────┘              └────┬─────┘
             │                         │
             └────────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌────────────┐   ┌───────────┐
   │  Redis   │    │  MongoDB   │   │  Worker   │
   │ queue/RL │    │ replica set│   │ (BullMQ)  │
   └──────────┘    └────────────┘   └───────────┘
```

---

## Database models

| Model | Key fields |
|-------|------------|
| **Voter** | `nationalId`, `email`, `password`, `electoralDistrict`, `isVerified`, `isWhitelisted`, `votedInElections` |
| **Administrator** | `username`, `email`, `role`, `permissions` |
| **Election** | `title`, `type`, `status`, dates, `candidates`, `results`, `settings` |
| **Candidate** | `party`, `position`, `electoralDistrict`, `elections[]`, `status` |
| **Vote** | `voter`, `election`, `candidate`, `encryptedVote`, `receipt`, unique voter+election |
| **AuditLog** | `eventType`, `action`, `userId`, `details`, `severity` |

---

## Security features

- JWT authentication on protected routes
- Role-based access (`restrictTo`, `restrictToVoter`)
- Password hashing (bcrypt, cost 12)
- Rate limiting (global + vote-specific; Redis-backed when configured)
- Idempotency keys on vote requests (distributed)
- Encrypted vote payload + integrity hash on receipts
- Audit logging on sensitive actions
- Helmet HTTP headers
- Account lockout after failed login attempts

**Production checklist:** set `JWT_SECRET`, `ENCRYPTION_KEY`, use HTTPS, MongoDB replica set, run vote worker.

---

## Running the project

### Quick local dev

**Backend:**

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

**Frontend:**

```bash
cd View
npm install
npm run dev
```

Open `http://localhost:5173` → Login.

### Environment variables (backend)

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default 3000) |
| `DATABASE` / `DATABASE_LOCAL` | MongoDB connection string |
| `JWT_SECRET` | Signing secret for tokens |
| `ENCRYPTION_KEY` | Vote encryption key |
| `REDIS_URL` | Enables distributed voting |
| `DISTRIBUTED_VOTING` | `true` / `false` |
| `STRICT_VOTER_ELIGIBILITY` | Require verified + whitelisted voters |

### Distributed stack

```bash
docker compose up --build
```

Set in `View/.env`:

```env
VITE_API_URL=http://localhost:8080/api
```

Run worker locally or via Docker `worker` service.

---

## Testing

```bash
cd backend
npm test                  # Unit tests (vote model, auth, helpers)
npm run test:concurrency    # Stress test (needs API + env vars)
```

Tests live in `backend/tests/`.

---

## Related documentation

| File | Contents |
|------|----------|
| [DISTRIBUTED.md](./DISTRIBUTED.md) | Docker Compose, Redis, worker, concurrency testing |
| [backend/.env.example](./backend/.env.example) | Sample environment configuration |

---

## Page route summary

| Route | Page | Role |
|-------|------|------|
| `/` | Redirect to login | — |
| `/login` | Sign in | Public |
| `/signup` | Voter registration | Public |
| `/admin/signup` | Admin registration | Public |
| `/voter-dashboard` | Vote & history | Voter |
| `/admin-dashboard` | Manage elections | Admin |
| `/auditor-dashboard` | Audit & metrics | Auditor |

---

*Last updated to reflect ID-based voter login, distributed voting queue, and current React/Express structure.*
