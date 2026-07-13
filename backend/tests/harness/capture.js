/**
 * Capture the whole e-voting system UI as PNG files using headless Chrome.
 * Drives real flows: public pages, a full voter journey (incl. casting a vote
 * through the distributed queue), admin dashboard, and auditor dashboard.
 *
 * Output: tests/harness/screenshots/*.png
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
const seed = require('./.seed.json');

const PW = 'Voter@12345';
const ADMIN = { id: 'demoadmin', pw: 'Admin@12345' };
const AUDITOR = { id: 'demoauditor', pw: 'Audit@12345' };
// pick a voter who has not voted (index 0 and 1 already used earlier)
const VOTER = seed.voters[2] || seed.voters[seed.voters.length - 1];

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log('  saved', name);
}

async function clickText(page, text, tag = 'button') {
  const ok = await page.evaluate((t, tg) => {
    const els = [...document.querySelectorAll(tg)];
    const el = els.find((e) => new RegExp(t, 'i').test(e.innerText || e.textContent));
    if (el) { el.click(); return true; }
    return false;
  }, text, tag);
  if (!ok) console.warn('    [warn] could not find', tag, text);
  return ok;
}

async function logout(page) {
  await page.evaluate(() => { localStorage.clear(); });
}

async function loginVoter(page, id) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#loginId');
  await page.type('#loginId', id);
  await page.type('#password', PW);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    clickText(page, '^Sign In$', 'button')
  ]);
  await sleep(1200);
}

async function loginAdminType(page, id, pw) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#loginId');
  await clickText(page, '^Admin$', 'button');     // switch to Admin tab
  await sleep(300);
  await page.type('#loginId', id);
  await page.type('#password', pw);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
    clickText(page, '^Sign In$', 'button')
  ]);
  await sleep(1500);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1200, height: 900, deviceScaleFactor: 2 },
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  try {
    console.log('[public pages]');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#loginId');
    await shot(page, '01-login.png');
    await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle2' });
    await sleep(400); await shot(page, '02-voter-signup.png');
    await page.goto(`${BASE}/admin/signup`, { waitUntil: 'networkidle2' });
    await sleep(400); await shot(page, '03-admin-signup.png');

    console.log('[voter journey] as', VOTER.nationalId);
    await logout(page);
    await loginVoter(page, VOTER.nationalId);
    await shot(page, '04-voter-elections.png');

    await clickText(page, 'View Candidates', 'button');
    await sleep(1200);
    await shot(page, '05-candidates.png');

    // select first candidate card, then review
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(
        (d) => /Independent/.test(d.innerText) && d.innerText.length < 60);
      if (card) card.click();
    });
    await sleep(500);
    await clickText(page, 'Review Selection', 'button');
    await sleep(800);
    await shot(page, '06-confirm-modal.png');

    await clickText(page, 'Confirm and Cast Vote', 'button');
    // wait for the distributed vote to complete (queue -> worker -> poll)
    for (let i = 0; i < 60; i++) {
      const done = await page.evaluate(() => /Vote cast successfully/i.test(document.body.innerText));
      if (done) break;
      await sleep(500);
    }
    await sleep(600);
    await shot(page, '07-vote-receipt.png');

    await clickText(page, 'Vote History', 'button');
    await sleep(1200);
    await shot(page, '08-vote-history.png');
    await clickText(page, 'Voting Status', 'button');
    await sleep(1200);
    await shot(page, '09-voting-status.png');

    console.log('[admin dashboard]');
    await logout(page);
    await loginAdminType(page, ADMIN.id, ADMIN.pw);
    await shot(page, '10-admin-elections.png');
    await clickText(page, 'Create Election', 'button');
    await sleep(800);
    await shot(page, '11-create-election.png');
    await clickText(page, 'Cancel', 'button');
    await sleep(400);
    await clickText(page, '^Candidates$', 'button');
    await sleep(1200);
    await shot(page, '12-admin-candidates.png');
    await clickText(page, 'Voter Registry', 'button');
    await sleep(1200);
    await shot(page, '13-admin-voter-registry.png');

    console.log('[auditor dashboard]');
    await logout(page);
    await loginAdminType(page, AUDITOR.id, AUDITOR.pw);
    await sleep(1000);
    await shot(page, '14-auditor-overview.png');
    for (const [label, file] of [
      ['Integrity', '15-auditor-integrity.png'],
      ['System Logs', '16-auditor-logs.png'],
      ['Logs', '16-auditor-logs.png'],
      ['Voter Activity', '17-auditor-activity.png'],
      ['Activity', '17-auditor-activity.png'],
      ['Metrics', '18-auditor-metrics.png'],
      ['Performance', '18-auditor-metrics.png']
    ]) {
      const clicked = await clickText(page, `^${label}$`, 'button');
      if (clicked) { await sleep(1300); await shot(page, file); }
    }

    console.log('DONE. Screenshots in', OUT);
  } catch (e) {
    console.error('CAPTURE ERROR:', e.message);
  } finally {
    await browser.close();
  }
})();
