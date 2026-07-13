/* Build E-Voting-Issues-and-Resolutions.docx */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require('docx');

const DIR = __dirname;
const CONTENT_W = 9360;
const bd = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };

function parseRuns(t) {
  return t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((seg) =>
    seg.startsWith('**') ? new TextRun({ text: seg.slice(2, -2), bold: true }) : new TextRun(seg));
}
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const P = (t) => new Paragraph({ spacing: { after: 100 }, children: parseRuns(t) });
const labeled = (label, t) => new Paragraph({ spacing: { after: 80 },
  children: [new TextRun({ text: label + ': ', bold: true, color: '1D4ED8' }), ...parseRuns(t)] });

// summary table
const sumCols = [520, 3400, 1500, 1400, 2540];
const sumHeaders = ['#', 'Issue', 'Category', 'Severity', 'Status'];
const sumData = [
  ['1', 'MongoDB Atlas connection refused', 'Environment', 'Blocker', 'Resolved (local Mongo)'],
  ['2', 'No Docker / WSL2 / virtualization', 'Environment', 'Blocker', 'Resolved (install + reboot)'],
  ['3', 'Async vote poll always 404', 'App defect', 'High', 'Fixed'],
  ['4', 'X-Forwarded-For / trust proxy error', 'App defect', 'Medium', 'Fixed'],
  ['5', 'Rate-limit store reuse (v8)', 'App defect', 'Medium', 'Fixed'],
  ['6', 'Rate limits blocked benchmarking', 'App config', 'Medium', 'Fixed (env-tunable)'],
  ['7', 'Vite/Babel launch in report tooling', 'Tooling', 'Low', 'Worked around']
];
const tcell = (text, i, head) => new TableCell({
  width: { size: sumCols[i], type: WidthType.DXA },
  shading: head ? { fill: 'D5E8F0', type: ShadingType.CLEAR } : undefined,
  margins: { top: 50, bottom: 50, left: 90, right: 90 },
  borders: { top: bd, bottom: bd, left: bd, right: bd },
  children: [new Paragraph({ children: [new TextRun({ text, bold: !!head, size: 18 })] })]
});
const summaryTable = new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: sumCols,
  rows: [new TableRow({ tableHeader: true, children: sumHeaders.map((h, i) => tcell(h, i, true)) }),
    ...sumData.map((r) => new TableRow({ children: r.map((v, i) => tcell(v, i, false)) }))] });

// detailed issues
const issues = [
  { t: 'Issue 1 — MongoDB Atlas connection refused', cat: 'Environment (setup blocker)', sev: 'Blocker',
    sym: 'The API failed to start with "Could not connect to any servers in your MongoDB Atlas cluster … IP that isn’t whitelisted."',
    cause: 'backend/.env pointed at a shared MongoDB Atlas cluster whose IP allowlist did not include this machine. The cluster also held shared data unsuitable for isolated benchmarking.',
    fix: 'Ran the system against the project’s own Dockerised MongoDB replica set (defined in docker-compose.yml), which the compose stack injects via environment variables. No dependency on the external Atlas cluster.',
    files: 'docker-compose.yml (internal mongo, replicaSet rs0); backend/.env left untouched for the app, bypassed by compose.' },

  { t: 'Issue 2 — Docker / WSL2 / hardware virtualization not ready', cat: 'Environment (setup blocker)', sev: 'Blocker',
    sym: 'docker was not installed; after installing Docker Desktop the engine would not start: "WSL2 is unable to start since virtualization is not enabled".',
    cause: 'Docker Desktop requires the WSL2 backend, which was not installed, and the VirtualMachinePlatform Windows feature had not yet taken effect (pending reboot). CPU virtualization itself was already enabled (a hypervisor / VBS was running).',
    fix: 'Installed Docker Desktop (winget), installed WSL2 with wsl --install --no-distribution, and rebooted to activate VirtualMachinePlatform. After reboot the engine started and the full stack came up healthy.',
    files: 'Host setup only — no application changes.' },

  { t: 'Issue 3 — Distributed vote poll always returned 404', cat: 'Application defect', sev: 'High',
    sym: 'In distributed mode, POST /vote returned 202 + jobId, but every subsequent GET /vote/jobs/:id returned 404 "Vote job not found" — even though the ballot was actually committed to MongoDB.',
    cause: 'The job was enqueued with removeOnComplete: true, so BullMQ deleted the completed job instantly. The documented client poll ("poll until completed") could therefore never observe the result. This broke the core distributed vote flow and the load test (20/20 false errors).',
    fix: 'Changed the enqueue options to retain completed jobs briefly — removeOnComplete: { age: 300, count: 1000 } — so clients can poll the result for up to 5 minutes. Re-run: 20/20 votes succeeded, end-to-end latency measurable.',
    files: 'backend/services/voteEnqueueService.js' },

  { t: 'Issue 4 — X-Forwarded-For / trust proxy validation error', cat: 'Application defect', sev: 'Medium',
    sym: 'The API logged ERR_ERL_UNEXPECTED_X_FORWARDED_FOR and rate limiting behaved erratically (spurious 429s) when traffic arrived through the Nginx load balancer.',
    cause: 'Express had trust proxy = false (default), so it rejected the X-Forwarded-For header Nginx adds and could not derive the real client IP. express-rate-limit’s key generator threw on this.',
    fix: 'Set app.set("trust proxy", 1) (one proxy hop), so req.ip and the rate limiter use the genuine client IP. Configurable via TRUST_PROXY_HOPS.',
    files: 'backend/app.js' },

  { t: 'Issue 5 — Rate-limit store reuse (express-rate-limit v8)', cat: 'Application defect', sev: 'Medium',
    sym: 'Startup logged ERR_ERL_STORE_REUSE: "A Store instance must not be shared across multiple rate limiters."',
    cause: 'The global limiter and the vote limiter shared a single Redis store instance, which express-rate-limit v8 forbids.',
    fix: 'Each limiter now builds its own Redis store with a unique key prefix (rl:global:, rl:vote:) via a createRateLimitStore(prefix) factory.',
    files: 'backend/config/redis.js, backend/config/rateLimiters.js' },

  { t: 'Issue 6 — Rate limits prevented load testing from one host', cat: 'Application configuration', sev: 'Medium',
    sym: 'Bulk voter signup and voting from a single host hit 429 almost immediately (only 3–6 of 120 signups succeeded).',
    cause: 'Three hard-coded limits keyed by IP: global 100 / 15 min, vote 10 / 15 min (express-rate-limit), and a custom in-memory rateLimitByIP capping auth routes at 3 signups / 5 logins per 15 min. From one host every request shares one key.',
    fix: 'Made all three limits environment-configurable (RATE_LIMIT_GLOBAL_MAX, RATE_LIMIT_VOTE_MAX, AUTH_RATE_LIMIT_MAX); defaults preserve production behaviour, the benchmark stack sets them high. After the change: 120/120 signups succeeded.',
    files: 'backend/config/rateLimiters.js, backend/middleware/auth.js, docker-compose.yml' },

  { t: 'Issue 7 — Vite/Babel launch error during report tooling', cat: 'Tooling (report generation)', sev: 'Low',
    sym: 'When launching the front end through the screenshot tool, the page was blank: "[BABEL] Cannot find package babel-plugin-react-compiler".',
    cause: 'The tool launched Vite from the parent folder, so Babel resolved plugins from the wrong working directory (the plugin lives in View/node_modules). A spaces-in-path issue also affected the launcher.',
    fix: 'Used a small wrapper that changes into the View directory before starting Vite (and 8.3 short paths to avoid spaces). Normal use — npm run dev inside View — is unaffected. This is a tooling/runner detail, not an application bug.',
    files: 'run-view.cmd (helper for the preview tool only)' }
];

const detail = issues.flatMap((it) => [
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220 }, children: [new TextRun(it.t)] }),
  new Paragraph({ spacing: { after: 80 }, children: [
    new TextRun({ text: 'Category: ', bold: true }), new TextRun(it.cat),
    new TextRun({ text: '    Severity: ', bold: true }), new TextRun(it.sev) ] }),
  labeled('Symptom', it.sym),
  labeled('Root cause', it.cause),
  labeled('Resolution', it.fix),
  labeled('Files changed', it.files)
]);

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 80 },
    children: [new TextRun({ text: 'Distributed Online Voting System', bold: true, size: 48, font: 'Arial' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: 'Issues Encountered During Testing & Their Resolutions', size: 28, color: '6B7280' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 20, color: '6B7280' })] }),
  new Paragraph({ children: [new PageBreak()] }),

  H1('Overview'),
  P('This document records every issue encountered while bringing up and testing the distributed online voting system, together with the root cause and the fix applied. Issues fall into three groups: **environment/setup blockers** (host configuration), **application defects** (real bugs in the code, now fixed), and **tooling notes** (report-generation only). Despite these issues being resolved mid-effort, the final test run recorded **720 votes with 0 errors and 0 double-votes**.'),

  H1('Summary'),
  summaryTable,
  new Paragraph({ spacing: { after: 60 }, children: [] }),
  P('**4 application defects were found and fixed** as a direct result of testing — most importantly the broken asynchronous vote-poll path (Issue 3), which only surfaces under the distributed queue and would have gone unnoticed without end-to-end load testing.'),

  new Paragraph({ children: [new PageBreak()] }),
  H1('Detailed issues & resolutions'),
  ...detail,

  H1('Final state'),
  P('After all resolutions: the full distributed stack (Nginx + 2 API instances + Redis queue + worker + Mongo replica set) runs healthy; unit tests pass 12/12; the concurrency test records exactly one ballot under 20-way contention; and the performance sweep completed 720 votes with zero errors. The application defects (Issues 3–6) are permanent code fixes that also harden the system for any real reverse-proxied deployment.')
];

const doc = new Document({
  creator: 'E-Voting Test Harness',
  title: 'E-Voting Issues & Resolutions',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, color: '1D4ED8', font: 'Arial' },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, color: '111827', font: 'Arial' },
        paragraph: { spacing: { before: 200, after: 90 }, outlineLevel: 1 } }
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Issues & Resolutions — page ', size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '9CA3AF' }),
        new TextRun({ text: ' / ', size: 16, color: '9CA3AF' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '9CA3AF' })] })] }) },
    children
  }]
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(path.join(DIR, 'E-Voting-Issues-and-Resolutions.docx'), buf);
  console.log('wrote E-Voting-Issues-and-Resolutions.docx');
});
