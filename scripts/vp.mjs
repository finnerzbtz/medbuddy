#!/usr/bin/env node

/**
 * Visual Playwright (vp.mjs) v0.4.0
 * 
 * DAEMON ARCHITECTURE: A background server holds the browser + page in memory.
 * CLI commands talk to it over HTTP. This means:
 *   - Page context (JS variables, cookies, DOM state) persists across commands
 *   - No reconnection = no about:blank bug
 *   - Playwright locator API available (text selectors, role selectors, etc.)
 * 
 * Usage:
 *   node vp.mjs [--session name] <command> [args] [--screenshot path] [--fullpage]
 * 
 * Lifecycle:
 *   First command auto-starts the daemon. Use `close` to stop it.
 */

import { chromium, firefox, webkit, devices } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);

const CONFIG = {
  browser: process.env.VP_BROWSER || 'chromium',
  headless: process.env.VP_HEADLESS !== 'false',
  width: parseInt(process.env.VP_WIDTH) || 1280,
  height: parseInt(process.env.VP_HEIGHT) || 720,
  timeout: parseInt(process.env.VP_TIMEOUT) || 30000,
  device: process.env.VP_DEVICE || null,
};

const args = process.argv.slice(2);
let sessionName = 'default';
let commandArgs = [...args];

const sessionIdx = commandArgs.indexOf('--session');
if (sessionIdx !== -1) {
  sessionName = commandArgs[sessionIdx + 1];
  commandArgs.splice(sessionIdx, 2);
}

let screenshotPath = null;
const ssIdx = commandArgs.indexOf('--screenshot');
if (ssIdx !== -1) {
  screenshotPath = commandArgs[ssIdx + 1];
  commandArgs.splice(ssIdx, 2);
}

let fullPage = false;
const fpIdx = commandArgs.indexOf('--fullpage');
if (fpIdx !== -1) {
  fullPage = true;
  commandArgs.splice(fpIdx, 1);
}

let scriptFile = null;
const fileIdx = commandArgs.indexOf('--file');
if (fileIdx !== -1) {
  scriptFile = commandArgs[fileIdx + 1];
  commandArgs.splice(fileIdx, 2);
}

const command = commandArgs[0];
const commandArgsRest = commandArgs.slice(1);

const sessionFile = sessionName === 'default'
  ? '.vp-session.json'
  : `.vp-session-${sessionName}.json`;

// ============================================================
// DAEMON MODE
// ============================================================

if (command === '__daemon') {
  const port = parseInt(commandArgsRest[0]);
  const configJson = commandArgsRest[1] ? JSON.parse(commandArgsRest[1]) : CONFIG;

  let browser, context, page;

  async function initBrowser() {
    const browserTypes = { chromium, firefox, webkit };
    const browserType = browserTypes[configJson.browser] || chromium;
    browser = await browserType.launch({ headless: configJson.headless });
    let contextOptions = {
      viewport: { width: configJson.width, height: configJson.height },
    };
    if (configJson.device && devices[configJson.device]) {
      contextOptions = { ...devices[configJson.device] };
    }
    context = await browser.newContext(contextOptions);
    page = await context.newPage();
    page.setDefaultTimeout(configJson.timeout);
  }

  function resolveLocator(selector) {
    if (selector.startsWith('text=')) {
      return page.getByText(selector.slice(5));
    }
    if (selector.startsWith('role=')) {
      const match = selector.match(/^role=(\w+)(?:\[name="(.+)"\])?$/);
      if (match) {
        const opts = match[2] ? { name: match[2] } : {};
        return page.getByRole(match[1], opts);
      }
    }
    if (selector.includes(':has-text(')) {
      const match = selector.match(/^(.+?):has-text\(['"](.+?)['"]\)$/);
      if (match) {
        return page.locator(match[1]).filter({ hasText: match[2] });
      }
    }
    return page.locator(selector);
  }

  async function waitForSPAHydration(timeoutMs = 10000) {
    try {
      await page.waitForFunction(() => {
        const body = document.body;
        if (!body) return false;
        const text = body.innerText?.trim() || '';
        const childCount = body.querySelectorAll('*').length;
        return text.length > 10 || childCount > 5;
      }, { timeout: timeoutMs });
    } catch {}
    await page.waitForTimeout(500);
  }

  async function handleRequest(cmd) {
    const { action, args: cmdArgs } = cmd;

    switch (action) {
      case 'goto': {
        const url = cmdArgs[0];
        if (!url) throw new Error('Usage: goto <url>');
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await waitForSPAHydration();
        const actualUrl = page.url();
        const bodyLen = await page.evaluate(() => document.body?.innerHTML?.length || 0);
        const elCount = await page.evaluate(() => document.body?.querySelectorAll('*').length || 0);
        let warning = '';
        try {
          const target = new URL(url);
          const actual = new URL(actualUrl);
          if (actual.href === 'about:blank') {
            warning = '\n   ⚠️  Navigation failed: page is about:blank';
          } else if (target.pathname !== '/' && actual.pathname !== target.pathname && !actual.pathname.startsWith(target.pathname)) {
            warning = `\n   ⚠️  URL mismatch: expected ${target.pathname}, got ${actual.pathname}`;
          }
        } catch { /* URL parsing failed */ }
        return `🌐 Navigated to: ${actualUrl}\n   DOM: ${elCount} elements, ${bodyLen} chars${warning}`;
      }
      case 'click': {
        const selector = cmdArgs[0];
        if (!selector) throw new Error('Usage: click <selector>');
        await resolveLocator(selector).click();
        await page.waitForTimeout(300);
        return `🖱️  Clicked: ${selector}`;
      }
      case 'fill': {
        const selector = cmdArgs[0];
        const value = cmdArgs.slice(1).join(' ');
        if (!selector || value === '') throw new Error('Usage: fill <selector> <value>');
        await resolveLocator(selector).fill(value);
        return `✏️  Filled "${selector}" with "${value}"`;
      }
      case 'type': {
        const text = cmdArgs.join(' ');
        if (!text) throw new Error('Usage: type <text>');
        await page.keyboard.type(text);
        return `⌨️  Typed: "${text}"`;
      }
      case 'select': {
        const selector = cmdArgs[0];
        const value = cmdArgs.slice(1).join(' ');
        if (!selector || !value) throw new Error('Usage: select <selector> <value>');
        await resolveLocator(selector).selectOption(value);
        return `📋 Selected "${value}" in ${selector}`;
      }
      case 'scroll': {
        const direction = cmdArgs[0] || 'down';
        const pixels = parseInt(cmdArgs[1]) || 500;
        const scrollMap = { down: [0, pixels], up: [0, -pixels], right: [pixels, 0], left: [-pixels, 0] };
        const [x, y] = scrollMap[direction] || [0, pixels];
        await page.mouse.wheel(x, y);
        await page.waitForTimeout(300);
        return `📜 Scrolled ${direction} ${pixels}px`;
      }
      case 'wait': {
        const selector = cmdArgs[0];
        if (!selector) throw new Error('Usage: wait <selector>');
        await resolveLocator(selector).waitFor({ state: 'visible' });
        return `✅ Element visible: ${selector}`;
      }
      case 'text': {
        const selector = cmdArgs[0] || 'body';
        return await resolveLocator(selector).innerText();
      }
      case 'title': {
        return `📄 Title: ${await page.title()}`;
      }
      case 'url': {
        return page.url();
      }
      case 'html': {
        const selector = cmdArgs[0] || 'body';
        return await resolveLocator(selector).innerHTML();
      }
      case 'attrs': {
        const selector = cmdArgs[0];
        if (!selector) throw new Error('Usage: attrs <selector>');
        const attrs = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const result = {};
          for (const attr of el.attributes) { result[attr.name] = attr.value; }
          result._tag = el.tagName.toLowerCase();
          result._text = el.textContent?.slice(0, 200);
          return result;
        }, selector);
        return attrs ? JSON.stringify(attrs, null, 2) : `❌ No element found: ${selector}`;
      }
      case 'eval': {
        const expression = cmdArgs.join(' ');
        if (!expression) throw new Error('Usage: eval <expression>');
        const result = await page.evaluate(expression);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      }
      case 'waiturl': {
        const pattern = cmdArgs[0];
        if (!pattern) throw new Error('Usage: waiturl <pattern>');
        const glob = pattern.includes('*') ? pattern : `**${pattern}**`;
        await page.waitForURL(glob);
        return `✅ URL matched: ${page.url()}`;
      }

      case 'assert': {
        const type = cmdArgs[0];
        const expected = cmdArgs.slice(1).join(' ');
        if (!type || !expected) throw new Error('Usage: assert <text|url|title|element> <expected>');
        switch (type) {
          case 'text': {
            const bodyText = await page.innerText('body');
            if (bodyText.includes(expected)) return `✅ PASS: Page contains "${expected}"`;
            throw new Error(`ASSERT FAILED: Page does not contain "${expected}"`);
          }
          case 'url': {
            const url = page.url();
            if (url.includes(expected)) return `✅ PASS: URL contains "${expected}" (${url})`;
            throw new Error(`ASSERT FAILED: URL "${url}" does not contain "${expected}"`);
          }
          case 'title': {
            const title = await page.title();
            if (title.includes(expected)) return `✅ PASS: Title contains "${expected}" (${title})`;
            throw new Error(`ASSERT FAILED: Title "${title}" does not contain "${expected}"`);
          }
          case 'element': {
            const count = await page.locator(expected).count();
            if (count > 0) return `✅ PASS: Element "${expected}" exists (${count} found)`;
            throw new Error(`ASSERT FAILED: Element "${expected}" not found`);
          }
          default:
            throw new Error(`Unknown assert type: ${type}. Use: text, url, title, element`);
        }
      }

      case 'upload': {
        const selector = cmdArgs[0];
        const filePaths = cmdArgs.slice(1).map(p => resolve(p));
        if (!selector || filePaths.length === 0) throw new Error('Usage: upload <selector> <file1> [file2...]');
        for (const fp of filePaths) {
          if (!existsSync(fp)) throw new Error(`File not found: ${fp}`);
        }
        const locator = resolveLocator(selector);
        await locator.setInputFiles(filePaths.length === 1 ? filePaths[0] : filePaths);
        await page.waitForTimeout(500);
        const names = filePaths.map(p => p.split('/').pop()).join(', ');
        return `📎 Uploaded ${filePaths.length} file(s): ${names} → ${selector}`;
      }

      case 'reload': {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForSPAHydration();
        return `🔄 Reloaded: ${page.url()}`;
      }

      case 'screenshot': {
        const path = cmdArgs[0];
        const isFullPage = cmdArgs.includes('--fullpage');
        if (!path) throw new Error('Usage: screenshot <path>');
        mkdirSync(dirname(resolve(path)), { recursive: true });
        await page.screenshot({ path: resolve(path), fullPage: isFullPage });
        return `📸 Screenshot saved: ${path}`;
      }
      case 'status': {
        return `✅ Daemon running | URL: ${page.url()} | Session: ${configJson.browser}`;
      }
      case 'close': {
        await browser.close();
        return '__SHUTDOWN__';
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  await initBrowser();

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return; }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const cmd = JSON.parse(body);
        const postScreenshot = cmd.screenshot;
        const postFullPage = cmd.fullPage || false;
        const result = await handleRequest(cmd);
        if (result === '__SHUTDOWN__') {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, result: '🔒 Session closed.' }));
          setTimeout(() => process.exit(0), 100);
          return;
        }
        if (postScreenshot) {
          mkdirSync(dirname(resolve(postScreenshot)), { recursive: true });
          await page.screenshot({ path: resolve(postScreenshot), fullPage: postFullPage });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result, screenshot: postScreenshot ? `📸 Screenshot saved: ${postScreenshot}` : null }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => { console.log(`VP_READY:${port}`); });
  process.on('SIGTERM', async () => { try { await browser.close(); } catch {} process.exit(0); });
  process.on('SIGINT', async () => { try { await browser.close(); } catch {} process.exit(0); });
  setInterval(() => {}, 60000);
  await new Promise(() => {});
}

// ============================================================
// CLI MODE
// ============================================================

function getSessionInfo() {
  try { if (existsSync(sessionFile)) return JSON.parse(readFileSync(sessionFile, 'utf-8')); } catch {}
  return null;
}
function saveSessionInfo(info) { writeFileSync(sessionFile, JSON.stringify(info, null, 2)); }
function clearSession() { try { if (existsSync(sessionFile)) unlinkSync(sessionFile); } catch {} }

async function isDaemonAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', args: [] }),
      signal: AbortSignal.timeout(2000),
    });
    return (await res.json()).ok;
  } catch { return false; }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startDaemon() {
  const port = await findFreePort();
  const child = spawn(process.execPath, [__filename, '__daemon', String(port), JSON.stringify(CONFIG)], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Daemon startup timeout')), 15000);
    child.stdout.on('data', (data) => { if (data.toString().includes('VP_READY:')) { clearTimeout(timeout); resolve(); } });
    child.stderr.on('data', (data) => { const err = data.toString(); if (err.includes('Error')) { clearTimeout(timeout); reject(new Error(`Daemon error: ${err.trim()}`)); } });
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Daemon exited with code ${code}`)); });
  });
  child.unref();
  child.stdout.destroy();
  child.stderr.destroy();
  saveSessionInfo({ port, pid: child.pid, sessionName, browser: CONFIG.browser, startedAt: new Date().toISOString() });
  return port;
}

async function getOrStartDaemon() {
  const info = getSessionInfo();
  if (info && info.port) { const alive = await isDaemonAlive(info.port); if (alive) return info.port; clearSession(); }
  return await startDaemon();
}

async function sendCommand(port, action, cmdArgs, screenshot, isFullPage) {
  const res = await fetch(`http://127.0.0.1:${port}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args: cmdArgs, screenshot: screenshot || null, fullPage: isFullPage || false }),
    signal: AbortSignal.timeout(CONFIG.timeout + 5000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Unknown daemon error');
  return data;
}

function parseCommandLine(line) {
  const parts = [];
  let current = '';
  let inQuote = null;
  for (const char of line) {
    if (inQuote) {
      if (char === inQuote) { inQuote = null; } else { current += char; }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) { parts.push(current); current = ''; }
    } else { current += char; }
  }
  if (current) parts.push(current);
  return parts;
}

async function runScriptFile(filePath) {
  if (!existsSync(filePath)) { console.error(`❌ Script not found: ${filePath}`); process.exit(1); }
  const lines = readFileSync(filePath, 'utf-8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));

  const port = await getOrStartDaemon();
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    const parts = parseCommandLine(line);
    if (parts.length === 0) continue;
    const action = parts[0];
    const args = parts.slice(1);

    let ss = null, fp = false;
    const ssI = args.indexOf('--screenshot');
    if (ssI !== -1) { ss = args[ssI + 1]; args.splice(ssI, 2); }
    const fpI = args.indexOf('--fullpage');
    if (fpI !== -1) { fp = true; args.splice(fpI, 1); }

    console.log(`\n[${lineNum}/${lines.length}] ${line}`);
    try {
      const data = await sendCommand(port, action, args, ss, fp);
      if (data.result) console.log(data.result);
      if (data.screenshot) console.log(data.screenshot);
    } catch (err) {
      console.error(`❌ Line ${lineNum} failed: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n✅ Script completed: ${lineNum} commands.`);
}

// ============================================================
// FILE GENERATORS (CLI-side, no daemon needed)
// ============================================================

function generatePNG(width, height, r = 99, g = 102, b = 241) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    raw[offset] = 0;
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      const fade = 1 - ((x + y) / (width + height)) * 0.3;
      raw[px] = Math.round(r * fade);
      raw[px + 1] = Math.round(g * fade);
      raw[px + 2] = Math.round(b * fade);
    }
  }
  const compressed = deflateSync(raw);
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) { crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

async function cmdMakeImg(args) {
  const path = args[0];
  if (!path) { console.error('Usage: makeimg <path.png> [width] [height] [#hexcolor]'); process.exit(1); }
  const width = parseInt(args[1]) || 800;
  const height = parseInt(args[2]) || 600;
  let r = 99, g = 102, b = 241;
  const colorArg = args[3];
  if (colorArg && colorArg.startsWith('#') && colorArg.length === 7) {
    r = parseInt(colorArg.slice(1, 3), 16);
    g = parseInt(colorArg.slice(3, 5), 16);
    b = parseInt(colorArg.slice(5, 7), 16);
  }
  const png = generatePNG(width, height, r, g, b);
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), png);
  console.log(`🖼️  Generated: ${path} (${width}×${height}, ${(png.length / 1024).toFixed(1)}KB)`);
}

async function cmdMakePdf(args) {
  const path = args[0];
  const text = args.slice(1).join(' ') || 'Test Document — Generated by Visual Playwright';
  if (!path) { console.error('Usage: makepdf <path.pdf> [text content...]'); process.exit(1); }
  mkdirSync(dirname(resolve(path)), { recursive: true });

  try {
    const PDFDocument = (await import('pdfkit')).default;
    const { createWriteStream: cws } = await import('fs');
    await new Promise((res, rej) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = cws(resolve(path));
      doc.pipe(stream);
      doc.fontSize(24).font('Helvetica-Bold').text(text.split('\n')[0] || text, { align: 'center' });
      doc.moveDown(1);
      const body = text.includes('\n') ? text.split('\n').slice(1).join('\n') :
        `Test PDF generated by Visual Playwright v0.4.0.\n\nGenerated: ${new Date().toISOString()}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;
      doc.fontSize(12).font('Helvetica').text(body, { align: 'left', lineGap: 4 });
      doc.end();
      stream.on('finish', res);
      stream.on('error', rej);
    });
  } catch {
    // Fallback: minimal valid PDF, zero dependencies
    const safe = text.replace(/[()\\]/g, '\\$&');
    const ts = new Date().toISOString();
    const streamContent = `BT /F1 18 Tf 50 742 Td (${safe}) Tj /F1 10 Tf 0 -30 Td (Generated: ${ts}) Tj /F1 10 Tf 0 -20 Td (Visual Playwright Test Document) Tj ET`;
    const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
4 0 obj
<</Length ${streamContent.length}>>
stream
${streamContent}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000206 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
${360 + streamContent.length}
%%EOF`;
    writeFileSync(resolve(path), pdf);
  }
  const size = (readFileSync(resolve(path)).length / 1024).toFixed(1);
  console.log(`📄 Generated: ${path} (${size}KB)`);
}

async function cmdStock(args) {
  const query = args[0];
  if (!query) { console.error('Usage: stock <query> [output-path] [--size small|medium|large]'); process.exit(1); }
  const apiKey = process.env.VP_PEXELS_KEY;
  if (!apiKey) {
    console.error('❌ Set VP_PEXELS_KEY environment variable with your Pexels API key.');
    console.error('   Get one free at: https://www.pexels.com/api/new/');
    process.exit(1);
  }
  let outPath = null, size = 'medium';
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1]) { size = args[++i]; }
    else if (!outPath) { outPath = args[i]; }
  }
  if (!outPath) {
    outPath = `shots/stock-${query.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 30)}.jpg`;
  }
  try {
    const searchRes = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(10000) }
    );
    if (!searchRes.ok) throw new Error(searchRes.status === 401 ? 'Invalid Pexels API key' : `Pexels API ${searchRes.status}`);
    const data = await searchRes.json();
    if (!data.photos?.length) throw new Error(`No photos found for "${query}"`);
    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
    const sizeMap = { small: photo.src.small, medium: photo.src.medium, large: photo.src.large, original: photo.src.original };
    const imgRes = await fetch(sizeMap[size] || photo.src.medium, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), buffer);
    console.log(`📷 Stock photo: ${outPath} (${(buffer.length / 1024).toFixed(1)}KB)`);
    console.log(`   "${photo.alt || query}" by ${photo.photographer}`);
    console.log(`   License: Free (Pexels) — ${photo.url}`);
  } catch (err) { console.error(`❌ Stock fetch failed: ${err.message}`); process.exit(1); }
}

async function main() {
  if (scriptFile) { await runScriptFile(scriptFile); return; }

  // CLI-side file generators (no daemon needed)
  if (command === 'makeimg') { await cmdMakeImg(commandArgsRest); return; }
  if (command === 'makepdf') { await cmdMakePdf(commandArgsRest); return; }
  if (command === 'stock') { await cmdStock(commandArgsRest); return; }

  if (!command) {
    console.log(`Visual Playwright v0.4.0 — Hybrid browser automation for Claude Code

DAEMON ARCHITECTURE: Page context persists across all commands.

Usage: node vp.mjs [--session name] <command> [args] [--screenshot path] [--fullpage]
       node vp.mjs --file <script.txt> [--session name]

Commands:
  goto <url>              Navigate (SPA-aware)    click <selector>          Click element
  fill <selector> <val>   Fill input              type <text>               Type keys
  select <sel> <val>      Select option           scroll <dir> [px]         Scroll
  wait <selector>         Wait for element        waiturl <pattern>         Wait for URL
  text [selector]         Get text                title                     Page title
  url                     Current URL             eval <expr>               Run JS (persists!)
  html [sel]              innerHTML               attrs <selector>          Element attributes
  assert <type> <expect>  Validate (text/url/title/element)
  reload                  Reload page             screenshot <path>         Screenshot
  upload <sel> <file...>  Upload file(s)            stock <query> [path]    Pexels stock photo
  makepdf <path> [text]   Generate test PDF         makeimg <path> [w] [h]  Generate test PNG
  close                   Stop daemon             status                    Check daemon

Selectors: CSS | text=Sign In | role=button[name="X"] | button:has-text('X')

File upload workflow:
  stock "house exterior" shots/house.jpg      Fetch stock photo
  makepdf test/doc.pdf "Inspection Report"    Generate test PDF
  makeimg test/placeholder.png 400 300        Generate test image
  upload "input[type=file]" shots/house.jpg   Upload to file input

Env: VP_PEXELS_KEY=xxx for stock photos (free at pexels.com/api/new)`);
    process.exit(0);
  }

  if (command === 'close') {
    const info = getSessionInfo();
    if (info?.port) { try { await sendCommand(info.port, 'close', []); } catch {} }
    clearSession();
    console.log(`🔒 Session "${sessionName}" closed.`);
    return;
  }

  if (command === 'status') {
    const info = getSessionInfo();
    if (info?.port && await isDaemonAlive(info.port)) {
      console.log((await sendCommand(info.port, 'status', [])).result);
    } else { console.log(`❌ Session "${sessionName}" is not active.`); }
    return;
  }

  const port = await getOrStartDaemon();
  try {
    const data = await sendCommand(port, command, commandArgsRest, screenshotPath, fullPage);
    if (data.result) console.log(data.result);
    if (data.screenshot) console.log(data.screenshot);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => { console.error(`❌ Fatal: ${err.message}`); process.exit(1); });
