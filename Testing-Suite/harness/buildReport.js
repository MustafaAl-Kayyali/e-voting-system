/**
 * Build a single PDF report from the charts, results.csv, and UI screenshots.
 * Renders report.html with headless Chrome -> E-Voting-Test-Report.pdf
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const DIR = __dirname;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const today = new Date().toISOString().slice(0, 10);

const rows = fs.readFileSync(path.join(DIR, 'results.csv'), 'utf8').trim().split('\n').slice(1)
  .map((l) => l.split(','));

const tableRows = rows.map((r) => `<tr>
  <td>${r[0]}</td><td class="n">${r[1]}</td><td class="n">${r[2]}</td>
  <td class="n">${r[3]} &plusmn; ${r[4]}</td><td class="n">${r[5]}</td>
  <td class="n">${r[6]}</td><td class="n">${r[7]}</td><td class="n">${r[8]}</td><td class="n">${r[9]}</td>
</tr>`).join('\n');

const figures = [
  ['screenshots/01-login.png', 'Login screen — voters log in with national ID, admins with username/email.'],
  ['screenshots/02-voter-signup.png', 'Voter self-registration (ID, profile, electoral district, password).'],
  ['screenshots/03-admin-signup.png', 'Administrator registration with role selection.'],
  ['screenshots/04-voter-elections.png', 'Voter dashboard — active elections the voter is eligible for.'],
  ['screenshots/05-candidates.png', 'Candidate selection for a chosen election.'],
  ['screenshots/06-confirm-modal.png', 'Vote confirmation modal (election, candidate, party).'],
  ['screenshots/07-vote-receipt.png', 'Vote accepted through the distributed queue, with a cryptographic receipt ID.'],
  ['screenshots/08-vote-history.png', 'Voter vote history showing the immutable receipt.'],
  ['screenshots/09-voting-status.png', 'Voting status summary for the voter.'],
  ['screenshots/10-admin-elections.png', 'Admin election management — live vote tallies per election.'],
  ['screenshots/11-create-election.png', 'Create Election form (type, dates, districts, candidates).'],
  ['screenshots/12-admin-candidates.png', 'Admin candidate management.'],
  ['screenshots/13-admin-voter-registry.png', 'Admin voter registry / whitelist.'],
  ['screenshots/15-auditor-integrity.png', 'Auditor — distributed register integrity verification.'],
  ['screenshots/16-auditor-logs.png', 'Auditor — full system audit log (every sensitive action recorded).'],
  ['screenshots/17-auditor-activity.png', 'Auditor — voter activity analytics.'],
  ['screenshots/18-auditor-metrics.png', 'Auditor — system performance metrics (events, error rate, health).']
];

let figIdx = 0;
const figBlock = (file, cap) => {
  figIdx += 1;
  return `<figure><img src="${file}"><figcaption>Figure ${figIdx}. ${cap}</figcaption></figure>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.55; }
  h1 { font-size: 26px; color: #111827; margin: 0 0 4px; }
  h2 { font-size: 18px; color: #1d4ed8; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; }
  h3 { font-size: 14px; color: #111827; margin: 18px 0 6px; }
  .cover { text-align: center; padding-top: 120px; page-break-after: always; }
  .cover .sub { font-size: 15px; color: #6b7280; margin-top: 8px; }
  .cover .meta { margin-top: 60px; color: #6b7280; font-size: 13px; }
  .badge { display:inline-block; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius: 6px; padding: 3px 10px; margin: 3px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
  th, td { border: 1px solid #d1d5db; padding: 5px 7px; text-align: left; }
  th { background: #f3f4f6; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  figure { margin: 14px 0; page-break-inside: avoid; text-align: center; }
  figure img { width: 100%; max-width: 100%; border: 1px solid #d1d5db; border-radius: 6px; }
  figcaption { font-size: 11px; color: #6b7280; margin-top: 5px; text-align: center; }
  .chart img { width: 92%; border: none; }
  ul { margin: 6px 0 6px 18px; } li { margin: 3px 0; }
  .kpi { display:flex; gap:10px; margin:10px 0; }
  .kpi div { flex:1; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:10px; text-align:center; }
  .kpi b { display:block; font-size:20px; color:#1d4ed8; }
  .section { page-break-before: always; }
  code { background:#f3f4f6; padding:1px 4px; border-radius:3px; font-size: 11px; }
</style></head><body>

<div class="cover">
  <h1>Distributed Online Voting System</h1>
  <div class="sub">Systematic Testing &amp; Performance Evaluation Report</div>
  <div class="meta">
    <span class="badge">Unit Testing</span><span class="badge">Concurrency / Correctness</span>
    <span class="badge">Performance Benchmarking</span><span class="badge">Experimental Analysis</span>
    <br><br>Generated ${today}
  </div>
</div>

<h2>1. System overview</h2>
<p>A full-stack electronic voting platform: a React (Vite) front end, a Node.js / Express REST API,
and MongoDB for storage. It runs in two modes: a <b>single-node</b> mode (synchronous vote writes) and a
<b>distributed</b> mode in which an Nginx load balancer fans requests across two API instances, votes are
queued in Redis (BullMQ) and processed by a dedicated worker, and MongoDB runs as a replica set for
transactional, exactly-once vote commits.</p>
<p><b>Distributed topology under test:</b> Browser &rarr; Nginx (:8080) &rarr; api-1 / api-2 &rarr;
Redis queue + vote lock &rarr; vote worker &rarr; MongoDB replica set (rs0).</p>
<div class="kpi">
  <div><b>2</b>API instances</div><div><b>1</b>Redis queue + worker</div>
  <div><b>rs0</b>Mongo replica set</div><div><b>:8080</b>Nginx load balancer</div>
</div>

<h2>2. Environment &amp; configuration</h2>
<ul>
  <li>Host: Windows + Docker Desktop (WSL2 backend). Node.js v22.</li>
  <li>Whole distributed stack launched with <code>docker compose up --build</code> (redis, mongo+init, api1, api2, worker, nginx).</li>
  <li>Front end (Vite) served on :5173, pointed at the load balancer via <code>VITE_API_URL=http://localhost:8080/api</code>.</li>
  <li>A single-node API container (:3001, <code>DISTRIBUTED_VOTING=false</code>) was run on the same network for an apples-to-apples comparison.</li>
  <li>Rate limits were made environment-configurable so a single-host benchmark would not be throttled (production defaults preserved).</li>
</ul>

<h2>3. Testing methodology</h2>
<h3>3.1 Unit testing</h3>
<p>Pure in-memory tests (<code>npm test</code>) covering vote hashing/integrity, vote-cast helpers, and auth
validation. <b>Result: 12 / 12 passed.</b></p>
<h3>3.2 Concurrency / correctness</h3>
<p>20 simultaneous vote requests issued for the <i>same</i> voter and election. The system must record
<b>exactly one</b> ballot. Verified via the receipt count = 1; surplus requests returned
<code>409 VOTE_IN_PROGRESS</code> (Redis vote lock) or were de-duplicated by the deterministic queue job id
and the unique MongoDB index on <code>{voter, election}</code>.</p>
<h3>3.3 Performance benchmarking &amp; 3.4 experimental analysis</h3>
<p>A concurrency sweep (10, 25, 50 simultaneous voters), 60 votes per data point, 2 repetitions per point,
freshly seeded each time, run against both the distributed stack and the single-node API. Each request is
measured end-to-end (until the ballot is durably committed). 720 votes total.</p>

<h2 class="section">4. Results &amp; analysis</h2>
<table>
  <thead><tr><th>Mode</th><th>Concurrency</th><th>Reps</th><th>Throughput (votes/s)</th>
  <th>Mean lat (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>OK</th><th>Err</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="chart">${figBlock('throughput_vs_concurrency.svg', 'Throughput vs concurrency (error bars = std dev across repetitions).')}</div>
<div class="chart">${figBlock('p95_latency_vs_concurrency.svg', 'p95 end-to-end latency vs concurrency.')}</div>
<div class="chart">${figBlock('throughput_scaling.svg', 'Throughput scaling — the lines cross over as load increases.')}</div>
<h3>Interpretation</h3>
<ul>
  <li><b>Low load:</b> single-node is faster (no queue/polling overhead).</li>
  <li><b>High load:</b> the distributed architecture <b>scales up</b> (10&rarr;13&rarr;24 votes/s) while single-node
  <b>saturates and degrades</b> (15&rarr;11&rarr;11 votes/s) with latency rising sharply.</li>
  <li><b>At concurrency 50: distributed delivers ~2.2&times; the throughput and ~2.6&times; lower p95 latency.</b></li>
  <li><b>Correctness held throughout:</b> 720 votes, 0 errors, 0 double votes.</li>
</ul>

<h2 class="section">5. Defects found &amp; fixed during testing</h2>
<ul>
  <li><b>Broken async vote poll:</b> completed queue jobs were deleted immediately, so the documented
  <code>GET /vote/jobs/:id</code> poll always returned 404 although the vote committed. Fixed by retaining
  completed jobs briefly.</li>
  <li><b>Reverse-proxy client IP:</b> added <code>trust proxy</code> so rate limiting and <code>req.ip</code> use
  the real client IP behind Nginx.</li>
  <li><b>Rate-limit store reuse:</b> each limiter now uses its own Redis store prefix (required by
  express-rate-limit v8).</li>
  <li><b>Non-tunable limits:</b> global, vote, and auth limits made environment-configurable for benchmarking;
  production defaults unchanged.</li>
</ul>

<h2 class="section">6. User-interface walkthrough</h2>
<h3>6.1 Public &amp; authentication</h3>
${figBlock(figures[0][0], figures[0][1])}${figBlock(figures[1][0], figures[1][1])}${figBlock(figures[2][0], figures[2][1])}
<h3>6.2 Voter journey (vote cast through the distributed queue)</h3>
${figures.slice(3, 9).map((f) => figBlock(f[0], f[1])).join('\n')}
<h3>6.3 Administrator</h3>
${figures.slice(9, 13).map((f) => figBlock(f[0], f[1])).join('\n')}
<h3>6.4 Auditor</h3>
${figures.slice(13).map((f) => figBlock(f[0], f[1])).join('\n')}

<h2 class="section">7. Conclusion</h2>
<p>The distributed online voting system is functionally complete and behaves correctly under concurrency:
it guarantees one ballot per voter per election even under 20-way simultaneous contention, and produces
verifiable receipts and a full audit trail. The experimental analysis confirms the central distributed-systems
trade-off: the queue-based, load-balanced architecture pays a small fixed overhead at low load but scales with
concurrency, achieving roughly double the throughput and far lower tail latency than a single node once the
system is busy &mdash; all while preserving correctness.</p>

</body></html>`;

fs.writeFileSync(path.join(DIR, 'report.html'), html);
console.log('wrote report.html');

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(DIR, 'report.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  const out = path.join(DIR, 'E-Voting-Test-Report.pdf');
  await page.pdf({ path: out, format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;color:#9ca3af;width:100%;text-align:center;">E-Voting Test Report &middot; page <span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  });
  await browser.close();
  console.log('wrote', out);
})();
