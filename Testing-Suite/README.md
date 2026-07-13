# Testing Suite — Distributed Online Voting System

All testing and benchmarking code, results, figures, and reports produced for this
project, gathered in one place. (The same code also lives in `backend/tests/` so the
application's own `npm test` keeps working.)

## Contents

```
Testing-Suite/
├── authLogin.test.js          unit tests (auth login helpers)
├── authValidation.test.js     unit tests (auth/password validation)
├── voteModel.test.js          unit tests (vote hashing / integrity)
├── voteCastService.test.js    unit tests (vote-cast helpers)
├── concurrency/
│   └── castVoteConcurrency.js  concurrency / idempotency stress test
└── harness/                    performance + experiment + reporting tooling
    ├── lib.js                  shared API client + measurement helpers
    ├── seed.js                 register admin + election + N voters
    ├── loadtest.js             one throughput/latency run
    ├── experiment.js           concurrency sweep with repetitions
    ├── analyze.js              aggregate results -> Markdown table + results.csv
    ├── makeCharts.js           results.csv -> SVG charts + charts.html
    ├── capture.js              headless-Chrome capture of the whole UI -> screenshots/
    ├── buildReport.js          -> report.html + E-Voting-Test-Report.pdf
    ├── buildDocx.js            -> E-Voting-Test-Report.docx
    ├── buildIssuesDocx.js      -> E-Voting-Issues-and-Resolutions.docx
    ├── results.csv / results.json   raw + aggregated benchmark data
    ├── *.svg / *.png           charts
    ├── screenshots/            17 UI screenshots (whole system)
    ├── E-Voting-Test-Report.pdf / .docx
    └── E-Voting-Issues-and-Resolutions.docx
```

## How the four testing activities map to the code

| Activity | Command (run from `backend/`) |
|----------|-------------------------------|
| **Unit testing** | `npm test` |
| **Concurrency / correctness** | `npm run test:concurrency` (with VOTER_TOKEN/ELECTION_ID/CANDIDATE_ID env) |
| **Performance benchmarking** | `node tests/harness/seed.js` then `node tests/harness/loadtest.js` |
| **Experimental analysis** | `node tests/harness/experiment.js` then `node tests/harness/analyze.js` |

Target is selected via `API_BASE_URL` (`http://localhost:8080` = distributed via the
load balancer, `http://localhost:3001` = single-node). See `harness/README.md` for the
full methodology and `harness/FINDINGS.md` for the recorded results and interpretation.

## Prerequisites to re-run

1. Bring up the stack from the project root: `docker compose up -d --build`.
2. Install backend deps once: `cd backend && npm install`.
3. The reporting tools (`capture.js`, `buildReport.js`, `buildDocx.js`) need their own
   packages — `cd backend/tests/harness && npm install` (puppeteer-core, docx) — and a
   local Chrome. These are only needed to *regenerate* the figures/reports; the finished
   PDF/DOCX and screenshots are already included here.

## Headline result

| Concurrency | Distributed (votes/s) | Single-node (votes/s) |
|------------:|----------------------:|----------------------:|
| 10 | 10.2 | 14.9 |
| 25 | 13.0 | 11.3 |
| 50 | **24.4** | 11.2 |

Distributed scales with load (≈2.2× throughput, ≈2.6× lower p95 latency at concurrency 50);
single-node saturates. 720 votes, 0 errors, 0 double-votes. Full write-up in the reports.
