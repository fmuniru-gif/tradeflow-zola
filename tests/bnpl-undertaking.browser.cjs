// Exercise the released form and PDF with disposable staff and customer data.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const { fixtureAsset } = require('./delivery-fixture.cjs');

const root = path.resolve(__dirname, '..');
const output = process.env.BNPL_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'zez-bnpl-'));
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!/^[\w./-]+$/.test(name) || name.includes('..') || !fs.existsSync(path.join(root, name))) {
    response.writeHead(404);
    return response.end();
  }
  response.setHeader('Content-Type', mime[path.extname(name)] || 'application/octet-stream');
  response.end(fixtureAsset(name));
});
let browser;
after(async () => {
  if (browser) await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
});

async function fixture(role, viewport) {
  if (!server.listening) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (!browser) browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const context = await browser.newContext({ acceptDownloads: true, viewport });
  const origin = 'http://127.0.0.1:' + server.address().port;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => !!window.ZEZMS?.bnplUndertaking);
  await page.evaluate(() => ZEZMS.cloudSync.waitUntilReady(10000));
  await page.evaluate(role => {
    DB.business = { name: 'ZOLA ELECTRONICS ZONE', address: 'Aliu Mahama Road, Tamale', tel: '0553486788' };
    DB.products = [{ id: 'SYN-1', name: 'Synthetic Television 55', uPrice: 4000, useCatalogSellingPrice: true }];
    Object.assign(session, { cashier: 'Synthetic Staff', commercialRole: role, role: 'ADMIN' });
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    applyRoleUI();
  }, role);
  return { page, context, errors };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    business: JSON.stringify(DB),
    queue: JSON.stringify(ZEZMS.cloudSync.getOutbox()),
    storage: JSON.stringify(localStorage)
  }));
}

test('Owner generates a branded A4 undertaking with validated terms, exact customer data and no saved records', async () => {
  const { page, context, errors } = await fixture('OWNER', { width: 1280, height: 900 });
  try {
    const before = await snapshot(page);
    await page.locator('#mainNav [data-group="management"] .nav-group-toggle').click();
    await page.getByRole('button', { name: 'Buy Now, Pay Later', exact: true }).click();
    await page.getByLabel('Full name').fill('Synthetic Tɛst Customer');
    await page.getByLabel('Telephone number').fill('+233 55 000 0000');
    await page.getByLabel('Employer / place of work').fill('Synthetic Teaching Hospital');
    await page.getByLabel('Ghana Card number').fill('GHA-000000000-0');
    await page.getByLabel('Product / model').fill('Synthetic Television 55');
    assert.equal(await page.getByLabel('Regular selling price').inputValue(), '4000.00');
    await page.getByLabel('Regular selling price').fill('4300.01');
    await page.getByLabel('Serial number').fill('SN-SYN-001');
    await page.getByLabel('Sale receipt reference').fill('RCP-SYNTHETIC');
    await page.getByLabel('Agreement date').fill('2028-02-19');
    await page.getByLabel('Upfront payment').fill('2700');
    const generate = page.getByRole('button', { name: 'Generate A4 PDF' });
    await generate.click();
    assert.match(await page.locator('[data-bnpl-status]').innerText(), /from the 20th/);
    await page.getByLabel('Agreement date').fill('2028-02-20');
    await page.getByLabel('Upfront payment').fill('2580.00');
    await generate.click();
    assert.match(await page.locator('[data-bnpl-status]').innerText(), /60–70%/);
    await page.getByLabel('Upfront payment').fill('3010.02');
    await generate.click();
    assert.match(await page.locator('[data-bnpl-status]').innerText(), /60–70%/);
    await page.getByLabel('Upfront payment').fill('2580.01');
    assert.match(await page.locator('[data-bnpl-payment]').innerText(), /1,720\.00.*29 February 2028/);
    await page.evaluate(() => render());
    assert.equal(await page.getByLabel('Ghana Card number').inputValue(), 'GHA-000000000-0');

    const onDownload = page.waitForEvent('download');
    await generate.click();
    const download = await onDownload;
    assert.match(download.suggestedFilename(), /^BNPL-20280220-[A-F0-9]+\.pdf$/);
    const pdf = path.join(output, 'undertaking.pdf');
    await download.saveAs(pdf);
    const body = fs.readFileSync(pdf).toString('latin1');
    assert.match(body, /\/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(body, /\/Count 1\b/);
    assert.match(body, /q \/GS1 gs 595\.28 0 0 841\.89/);
    assert.match(body, /\(APPROVED\)/);
    const pdfText = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
    for (const value of ['ZOLA ELECTRONICS ZONE', 'zolaelectronicszone.com', 'Synthetic Tɛst Customer', '+233 55 000 0000',
      'Synthetic Teaching Hospital', 'GHA-000000000-0', 'Synthetic Television 55', 'SN-SYN-001', 'RCP-SYNTHETIC',
      '4,300.01', '2,580.01', '1,720.00', '29 February 2028', 'Synthetic Staff',
      'For Zola Electronics Zone', 'Customer signature']) {
      assert.ok(pdfText.includes(value), value);
    }
    assert.match(body, /0054025b00730074/i, 'PDF preserves Unicode spelling in ActualText');
    assert.equal(await page.getByLabel('Ghana Card number').inputValue(), '');
    assert.match(await page.locator('[data-bnpl-status]').innerText(), /PDF generated/);
    assert.deepEqual(await snapshot(page), before);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('Admin can open the form on a phone and sign-out discards the draft. Cashier cannot open it', async () => {
  const admin = await fixture('ADMIN', { width: 390, height: 844 });
  try {
    await admin.page.evaluate(() => nav('bnpl-undertaking'));
    await admin.page.getByLabel('Ghana Card number').fill('GHA-000000001-0');
    const overflow = await admin.page.locator('#bnplUndertakingForm').evaluate(form => form.scrollWidth > form.clientWidth + 1);
    assert.equal(overflow, false);
    await admin.page.evaluate(() => nav('pos'));
    await admin.page.evaluate(() => nav('bnpl-undertaking'));
    assert.equal(await admin.page.getByLabel('Ghana Card number').inputValue(), '');
    await admin.page.getByLabel('Ghana Card number').fill('GHA-000000001-0');
    await admin.page.evaluate(() => ZEZMS.staffAuth.signOut());
    assert.equal(await admin.page.locator('#bnplUndertakingForm').count(), 0);
  } finally {
    await admin.context.close();
  }
  const cashier = await fixture('CASHIER', { width: 1280, height: 900 });
  try {
    const button = cashier.page.locator('#mainNav [data-view="bnpl-undertaking"]');
    assert.equal(await button.evaluate(el => el.style.display), 'none');
    await cashier.page.evaluate(() => nav('bnpl-undertaking'));
    assert.equal(await cashier.page.locator('#bnplUndertakingForm').count(), 0);
    assert.deepEqual(cashier.errors, []);
  } finally {
    await cashier.context.close();
  }
});
