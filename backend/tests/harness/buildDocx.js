/* Build E-Voting-Test-Report.docx (Word) mirroring the PDF report. */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require('docx');

const DIR = __dirname;
const CONTENT_W = 9360;           // US Letter, 1" margins (DXA)
const MAXIMG_PX = 600;            // target image width in px
const MAXH_PX = 760;             // cap image height

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function imgPara(file, widthPx = MAXIMG_PX) {
  const { w, h } = pngSize(file);
  let width = widthPx, height = Math.round(widthPx * h / w);
  if (height > MAXH_PX) { height = MAXH_PX; width = Math.round(MAXH_PX * w / h); }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 40 },
    children: [new ImageRun({
      type: 'png', data: fs.readFileSync(file),
      transformation: { width, height },
      altText: { title: path.basename(file), description: path.basename(file), name: path.basename(file) }
    })]
  });
}
let figN = 0;
const caption = (txt) => { figN += 1; return new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 160 },
  children: [new TextRun({ text: `Figure ${figN}. ${txt}`, italics: true, size: 18, color: '6B7280' })] }); };
const fig = (file, cap) => [imgPara(file), caption(cap)];

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const P = (t, opts = {}) => new Paragraph({ spacing: { after: 120 }, children: parseRuns(t), ...opts });
const bullet = (t) => new Paragraph({ numbering: { reference: 'b', level: 0 }, spacing: { after: 40 }, children: parseRuns(t) });
// **bold** parsing
function parseRuns(t) {
  return t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((seg) =>
    seg.startsWith('**') ? new TextRun({ text: seg.slice(2, -2), bold: true }) : new TextRun(seg));
}

// ---- results table ----
const rows = fs.readFileSync(path.join(DIR, 'results.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const headers = ['Mode', 'Conc.', 'Reps', 'Throughput (v/s)', 'Mean (ms)', 'p95 (ms)', 'p99 (ms)', 'OK', 'Err'];
const colW = [1500, 760, 700, 1700, 1100, 1100, 1100, 700, 700];
const cell = (text, { head = false, alignRight = false } = {}) => new TableCell({
  width: { size: 0, type: WidthType.AUTO },
  shading: head ? { fill: 'D5E8F0', type: ShadingType.CLEAR } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  borders: { top: bd, bottom: bd, left: bd, right: bd },
  children: [new Paragraph({ alignment: alignRight ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [new TextRun({ text, bold: head, size: 18 })] })]
});
const bd = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const headRow = new TableRow({ tableHeader: true, children: headers.map((h, i) =>
  new TableCell({ width: { size: colW[i], type: WidthType.DXA }, shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: bd, bottom: bd, left: bd, right: bd },
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })] })) });
const dataRows = rows.map((r) => new TableRow({ children: [
  r[0], r[1], r[2], `${r[3]} ± ${r[4]}`, r[5], r[6], r[7], r[8], r[9]
].map((v, i) => new TableCell({ width: { size: colW[i], type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 100, right: 100 }, borders: { top: bd, bottom: bd, left: bd, right: bd },
    children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
      children: [new TextRun({ text: String(v), size: 18 })] })] })) }));
const resultsTable = new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colW, rows: [headRow, ...dataRows] });

// ---- figures ----
const shots = (n) => path.join(DIR, 'screenshots', n);
const figures = [
  [shots('01-login.png'), 'Login screen — voters use national ID, admins use username/email.'],
  [shots('02-voter-signup.png'), 'Voter self-registration (ID, profile, district, password).'],
  [shots('03-admin-signup.png'), 'Administrator registration with role selection.'],
  [shots('04-voter-elections.png'), 'Voter dashboard — eligible active elections.'],
  [shots('05-candidates.png'), 'Candidate selection for a chosen election.'],
  [shots('06-confirm-modal.png'), 'Vote confirmation modal (election, candidate, party).'],
  [shots('07-vote-receipt.png'), 'Vote accepted via the distributed queue, with receipt ID.'],
  [shots('08-vote-history.png'), 'Voter vote history with the immutable receipt.'],
  [shots('09-voting-status.png'), 'Voter voting-status summary.'],
  [shots('10-admin-elections.png'), 'Admin election management with live tallies.'],
  [shots('11-create-election.png'), 'Create Election form (type, dates, districts, candidates).'],
  [shots('12-admin-candidates.png'), 'Admin candidate management.'],
  [shots('13-admin-voter-registry.png'), 'Admin voter registry / whitelist.'],
  [shots('15-auditor-integrity.png'), 'Auditor — register integrity verification.'],
  [shots('16-auditor-logs.png'), 'Auditor — full system audit log.'],
  [shots('17-auditor-activity.png'), 'Auditor — voter activity analytics.'],
  [shots('18-auditor-metrics.png'), 'Auditor — system performance metrics.']
];

const children = [
  // cover
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2600, after: 80 },
    children: [new TextRun({ text: 'Distributed Online Voting System', bold: true, size: 52, font: 'Arial' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: 'Systematic Testing & Performance Evaluation Report', size: 28, color: '6B7280' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Unit Testing  •  Concurrency / Correctness  •  Performance Benchmarking  •  Experimental Analysis', size: 20, color: '1D4ED8' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
    children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 20, color: '6B7280' })] }),
  new Paragraph({ children: [new PageBreak()] }),
  // TOC
  new Paragraph({ children: [new TextRun({ text: 'Contents', bold: true, size: 28 })], spacing: { after: 120 } }),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),

  H1('1. System overview'),
  P('A full-stack electronic voting platform: a React (Vite) front end, a Node.js / Express REST API, and MongoDB for storage. It runs in two modes: a **single-node** mode (synchronous vote writes) and a **distributed** mode in which an Nginx load balancer fans requests across two API instances, votes are queued in Redis (BullMQ) and processed by a dedicated worker, and MongoDB runs as a replica set for transactional, exactly-once vote commits.'),
  P('**Distributed topology under test:** Browser → Nginx (:8080) → api-1 / api-2 → Redis queue + vote lock → vote worker → MongoDB replica set (rs0).'),

  H1('2. Environment & configuration'),
  bullet('Host: Windows + Docker Desktop (WSL2 backend). Node.js v22.'),
  bullet('Whole distributed stack launched with a single docker compose up --build (redis, mongo + init, api1, api2, worker, nginx).'),
  bullet('Front end (Vite) served on :5173, pointed at the load balancer (VITE_API_URL = http://localhost:8080/api).'),
  bullet('A single-node API container (:3001, DISTRIBUTED_VOTING=false) ran on the same network for an apples-to-apples comparison.'),
  bullet('Rate limits were made environment-configurable so a single-host benchmark would not be throttled (production defaults preserved).'),

  H1('3. Testing methodology'),
  H2('3.1 Unit testing'),
  P('Pure in-memory tests (npm test) covering vote hashing/integrity, vote-cast helpers, and auth validation. **Result: 12 / 12 passed.**'),
  H2('3.2 Concurrency / correctness'),
  P('20 simultaneous vote requests for the **same** voter and election. The system must record **exactly one** ballot. Verified via receipt count = 1; surplus requests returned 409 VOTE_IN_PROGRESS (Redis vote lock) or were de-duplicated by the deterministic queue job id and the unique MongoDB index on {voter, election}.'),
  H2('3.3 Performance benchmarking & 3.4 experimental analysis'),
  P('A concurrency sweep (10, 25, 50 simultaneous voters), 60 votes per data point, 2 repetitions, freshly seeded each time, run against both the distributed stack and the single-node API. Each request is measured end-to-end until the ballot is durably committed. 720 votes total.'),

  H1('4. Results & analysis'),
  resultsTable,
  new Paragraph({ spacing: { after: 60 }, children: [] }),
  ...fig(path.join(DIR, 'throughput_vs_concurrency.png'), 'Throughput vs concurrency (error bars = std dev across repetitions).'),
  ...fig(path.join(DIR, 'p95_latency_vs_concurrency.png'), 'p95 end-to-end latency vs concurrency.'),
  ...fig(path.join(DIR, 'throughput_scaling.png'), 'Throughput scaling — the lines cross over as load increases.'),
  H2('Interpretation'),
  bullet('**Low load:** single-node is faster (no queue / polling overhead).'),
  bullet('**High load:** the distributed architecture scales up (10→13→24 votes/s) while single-node saturates and degrades (15→11→11 votes/s) with latency rising sharply.'),
  bullet('**At concurrency 50: distributed delivers ~2.2x throughput and ~2.6x lower p95 latency.**'),
  bullet('**Correctness held throughout: 720 votes, 0 errors, 0 double votes.**'),

  H1('5. Defects found & fixed during testing'),
  bullet('**Broken async vote poll:** completed queue jobs were deleted immediately, so GET /vote/jobs/:id always returned 404 although the vote committed. Fixed by retaining completed jobs briefly.'),
  bullet('**Reverse-proxy client IP:** added trust proxy so rate limiting and req.ip use the real client IP behind Nginx.'),
  bullet('**Rate-limit store reuse:** each limiter now uses its own Redis store prefix (required by express-rate-limit v8).'),
  bullet('**Non-tunable limits:** global, vote, and auth limits made environment-configurable for benchmarking; production defaults unchanged.'),
  P('A detailed issue-by-issue log is provided in the companion document, "E-Voting — Issues & Resolutions".'),

  new Paragraph({ children: [new PageBreak()] }),
  H1('6. User-interface walkthrough'),
  H2('6.1 Public & authentication'),
  ...figures.slice(0, 3).flatMap((f) => fig(f[0], f[1])),
  H2('6.2 Voter journey (vote cast through the distributed queue)'),
  ...figures.slice(3, 9).flatMap((f) => fig(f[0], f[1])),
  H2('6.3 Administrator'),
  ...figures.slice(9, 13).flatMap((f) => fig(f[0], f[1])),
  H2('6.4 Auditor'),
  ...figures.slice(13).flatMap((f) => fig(f[0], f[1])),

  H1('7. Conclusion'),
  P('The distributed online voting system is functionally complete and behaves correctly under concurrency: it guarantees one ballot per voter per election even under 20-way simultaneous contention, and produces verifiable receipts and a full audit trail. The experimental analysis confirms the central distributed-systems trade-off: the queue-based, load-balanced architecture pays a small fixed overhead at low load but scales with concurrency, achieving roughly double the throughput and far lower tail latency than a single node once the system is busy — all while preserving correctness.')
];

const doc = new Document({
  creator: 'E-Voting Test Harness',
  title: 'E-Voting Systematic Testing Report',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, color: '1D4ED8', font: 'Arial' },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 25, bold: true, color: '111827', font: 'Arial' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } }
    ]
  },
  numbering: { config: [{ reference: 'b', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
    alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'E-Voting Test Report — page ', size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '9CA3AF' }),
        new TextRun({ text: ' / ', size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '9CA3AF' })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(DIR, 'E-Voting-Test-Report.docx'), buf);
  console.log('wrote E-Voting-Test-Report.docx');
});
