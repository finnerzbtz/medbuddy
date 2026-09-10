#!/usr/bin/env node
/**
 * In-environment animation validation.
 *
 * Loads the real app in headless Chromium (where requestAnimationFrame actually
 * runs, unlike the embedded preview pane), drives the Zustand store to select an
 * animation, samples frames evenly across the clip, and writes one contact sheet
 * per animation so the motion can be judged *inside the room*, not in isolation.
 *
 *   node scripts/validate-scene.mjs                       # all clips, base variant
 *   node scripts/validate-scene.mjs --anim idle,happy
 *   node scripts/validate-scene.mjs --variant glasses --frames 8
 *   node scripts/validate-scene.mjs --zoom                # tight crop on Blobby
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const URL_BASE = process.env.VS_URL ?? 'http://localhost:5173';

// Clip durations in seconds — must match scripts/animate-blobbys.py CLIPS.
const DURATIONS = {
  idle: 5.0,
  happy: 2.5,
  celebrating: 3.75,
  worried: 3.67,
  sick: 5.0,
  critical: 5.0,
  recovering: 6.25,
  walk_to_cushion: 9.96,
};

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const ANIMS = String(arg('anim', Object.keys(DURATIONS).join(','))).split(',');
const VARIANT = String(arg('variant', 'base'));
const FRAMES = Number(arg('frames', 6));
const OUT = String(arg('out', 'shots/validate'));
const ZOOM = Boolean(arg('zoom', false));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  // Let Chromium pick its own backend — on macOS that's ANGLE/Metal on the real
  // GPU (~115fps). Forcing swiftshader drops it to ~18fps and stalls sampling.
  args: ['--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await browser.newPage({
  viewport: { width: 430, height: 932 },   // iPhone-ish portrait
  deviceScaleFactor: 2,
});

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL_BASE, { waitUntil: 'networkidle' });

// Wait for the GLBs to parse and the canvas to be driven by R3F.
await page.waitForFunction(() => {
  const c = document.querySelector('canvas');
  return c && c.width > 300 && !!window.__appStore;
}, { timeout: 90_000 });

// Confirm the render loop is genuinely running before trusting any screenshot.
const looping = await page.evaluate(async () => {
  const count = () => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n++; performance.now() - t0 < 500 ? requestAnimationFrame(tick) : res(n); };
    requestAnimationFrame(tick);
  });
  return count();
});
console.log(`rAF ticks in 500ms: ${looping}${looping < 10 ? '  <-- LOOP NOT RUNNING' : ''}`);

await mkdir(OUT, { recursive: true });

// Collapse the CONTROLS overlay so it never covers the scene.
await page.evaluate(() => {
  const s = window.__appStore.getState();
  s.setVariant?.('base');
});

const canvas = await page.locator('canvas').first();

async function captureSheet(anim) {
  const dur = DURATIONS[anim] ?? 4;
  await page.evaluate(([a, v]) => {
    const s = window.__appStore.getState();
    s.setVariant(v);
    s.setAnimation(a);
    if (!s.isPlaying) s.togglePlaying();
  }, [anim, VARIANT]);

  // Let the crossfade settle, then sample evenly across one full clip.
  await sleep(450);
  const box = await canvas.boundingBox();

  // Frame the crop on Blobby himself by projecting his Spine bone to screen
  // space — a fixed fractional crop drifts off him as the pose changes.
  let clip = box;
  if (ZOOM) {
    const p = await page.evaluate(() => {
      const { scene, camera, size } = window.__three;
      let bone = null;
      scene.traverse((o) => { if (o.isBone && o.name === 'Spine' && !bone) bone = o; });
      if (!bone) return null;
      const v = new bone.position.constructor();
      v.setFromMatrixPosition(bone.matrixWorld).project(camera);
      return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height };
    });
    if (p) {
      const half = Math.min(box.width, box.height) * 0.30;
      clip = {
        x: Math.max(box.x, box.x + p.x - half),
        y: Math.max(box.y, box.y + p.y - half * 1.05),
        width: half * 2,
        height: half * 2,
      };
    }
  }

  const step = (dur * 1000) / FRAMES;
  const shots = [];
  for (let i = 0; i < FRAMES; i++) {
    const buf = await page.screenshot({ clip });
    shots.push(buf.toString('base64'));
    await sleep(step);
  }

  // Tile the frames into a single sheet by rendering them in a scratch page.
  const sheet = await page.evaluate(async ([imgs, label]) => {
    const loaded = await Promise.all(imgs.map((b64) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = 'data:image/png;base64,' + b64;
    })));
    const cw = loaded[0].width, ch = loaded[0].height;
    const cols = Math.min(loaded.length, 3);
    const rows = Math.ceil(loaded.length / cols);
    const pad = 6, header = 30;
    const cv = document.createElement('canvas');
    cv.width = cols * cw + pad * (cols + 1);
    cv.height = header + rows * ch + pad * (rows + 1);
    const g = cv.getContext('2d');
    g.fillStyle = '#14110e'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#e8e0d4'; g.font = 'bold 20px monospace';
    g.fillText(label, pad, 21);
    loaded.forEach((im, i) => {
      const cx = pad + (i % cols) * (cw + pad);
      const cy = header + pad + Math.floor(i / cols) * (ch + pad);
      g.drawImage(im, cx, cy);
      g.fillStyle = '#ffcc66'; g.font = '16px monospace';
      g.fillText(`${i}`, cx + 4, cy + 18);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, [shots, `${anim}  (${dur}s, ${VARIANT})`]);

  const file = path.join(OUT, `${anim}.png`);
  await writeFile(file, Buffer.from(sheet, 'base64'));
  console.log(`  wrote ${file}`);
}

for (const a of ANIMS) {
  console.log(`capturing ${a}...`);
  await captureSheet(a.trim());
}

if (errors.length) {
  console.log('\nPAGE ERRORS:');
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
} else {
  console.log('\nno page errors');
}

await browser.close();
