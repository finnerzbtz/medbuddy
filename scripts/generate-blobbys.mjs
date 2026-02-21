#!/usr/bin/env node
/**
 * Meshy AI Pipeline: Generate, Rig & Download all 4 Blobby variants
 *
 * Usage:
 *   1. Put your Meshy API key in .env:  MESHY_API_KEY=msy_xxxxx
 *   2. Run:  node scripts/generate-blobbys.mjs
 *
 * Pipeline per variant:
 *   Image → 3D model → Auto-rig → Download rigged GLB
 *
 * Output: public/models/blobby-{variant}.glb  (overwrites existing)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Load .env ───────────────────────────────────────────────────────────────
const envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env file. Create one with MESHY_API_KEY=msy_xxx');
  process.exit(1);
}
const envVars = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const API_KEY = envVars.MESHY_API_KEY;
if (!API_KEY || API_KEY === 'your_key_here') {
  console.error('Set your MESHY_API_KEY in .env');
  process.exit(1);
}

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = 'https://api.meshy.ai';
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

const VARIANTS = [
  { name: 'base',     image: 'base.png' },
  { name: 'raincoat', image: 'raincoat.png' },
  { name: 'sweater',  image: 'sweater.png' },
  { name: 'glasses',  image: 'glasses.png' },
];

const OUTPUT_DIR = path.join(ROOT, 'public', 'models');
const REF_DIR = path.join(__dirname, 'ref-images');

const POLL_INTERVAL_MS = 5_000; // 5 seconds between polls
const MAX_POLL_MINUTES = 15;    // give up after 15 min per step

// ── Helpers ─────────────────────────────────────────────────────────────────
function imageToBase64DataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function apiPost(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiGet(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function pollUntilDone(endpoint, label) {
  const maxPolls = (MAX_POLL_MINUTES * 60_000) / POLL_INTERVAL_MS;
  for (let i = 0; i < maxPolls; i++) {
    const data = await apiGet(endpoint);
    const { status, progress } = data;

    process.stdout.write(
      `\r  [${label}] ${status} ${progress ?? 0}%` + ' '.repeat(20)
    );

    if (status === 'SUCCEEDED') {
      console.log(`\r  [${label}] SUCCEEDED ✓` + ' '.repeat(30));
      return data;
    }
    if (status === 'FAILED') {
      console.error(`\n  [${label}] FAILED:`, data.task_error?.message);
      throw new Error(`Task failed: ${data.task_error?.message}`);
    }
    if (status === 'CANCELED') {
      throw new Error(`Task canceled`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out after ${MAX_POLL_MINUTES} minutes`);
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  console.log(`  → Saved ${destPath} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// ── Pipeline ────────────────────────────────────────────────────────────────
async function processVariant(variant) {
  const { name, image } = variant;
  const imagePath = path.join(REF_DIR, image);

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing reference image: ${imagePath}`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name.toUpperCase()} — Starting pipeline`);
  console.log(`${'═'.repeat(60)}`);

  // ── Step 1: Image to 3D ────────────────────────────────────────────────
  console.log(`\n  Step 1: Image → 3D`);
  const imageDataUri = imageToBase64DataUri(imagePath);

  const createRes = await apiPost('/openapi/v1/image-to-3d', {
    image_url: imageDataUri,
    ai_model: 'meshy-6',
    topology: 'triangle',
    target_polycount: 8000,
    symmetry_mode: 'on',
    should_texture: true,
    enable_pbr: true,
    pose_mode: 't-pose',
    texture_prompt:
      'Cute cartoon character, vibrant colors, clean flat shading, ' +
      'soft pastel tones, kawaii style, smooth matte surface, no baked shadows',
  });

  const taskId = createRes.result;
  console.log(`  Task ID: ${taskId}`);

  const modelResult = await pollUntilDone(
    `/openapi/v1/image-to-3d/${taskId}`,
    `${name} img2mesh`
  );

  // Download the un-rigged GLB as backup
  const rawGlbPath = path.join(OUTPUT_DIR, `blobby-${name}-raw.glb`);
  await downloadFile(modelResult.model_urls.glb, rawGlbPath);

  // ── Step 2: Auto-Rig ──────────────────────────────────────────────────
  console.log(`\n  Step 2: Auto-Rig`);
  const rigRes = await apiPost('/openapi/v1/rigging', {
    input_task_id: taskId,
    height_meters: 0.5, // Blobby is a small character
  });

  const rigTaskId = rigRes.result;
  console.log(`  Rig Task ID: ${rigTaskId}`);

  const rigResult = await pollUntilDone(
    `/openapi/v1/rigging/${rigTaskId}`,
    `${name} rigging`
  );

  // ── Step 3: Download rigged GLB ───────────────────────────────────────
  console.log(`\n  Step 3: Download rigged GLB`);
  const riggedGlbUrl = rigResult.result?.rigged_character_glb_url;
  if (!riggedGlbUrl) {
    console.warn(`  ⚠ No rigged GLB URL — using raw model instead`);
  } else {
    const finalGlbPath = path.join(OUTPUT_DIR, `blobby-${name}.glb`);
    await downloadFile(riggedGlbUrl, finalGlbPath);
  }

  // Also download walking animation if available
  const walkUrl = rigResult.result?.basic_animations?.walking_glb_url;
  if (walkUrl) {
    const walkPath = path.join(OUTPUT_DIR, `blobby-${name}-walk.glb`);
    await downloadFile(walkUrl, walkPath);
  }

  console.log(`\n  ✓ ${name} complete!`);
  return { name, taskId, rigTaskId };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Blobby Generator — Meshy AI Pipeline               ║');
  console.log('║     4 variants: base, raincoat, sweater, glasses       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Check credit balance first
  try {
    const balance = await apiGet('/openapi/v1/balance');
    console.log(`\n  Credits remaining: ${balance.credit_balance ?? JSON.stringify(balance)}`);
  } catch {
    console.log(`\n  (Could not check credit balance)`);
  }

  // Run variants sequentially to avoid rate limits
  const results = [];
  for (const variant of VARIANTS) {
    try {
      const result = await processVariant(variant);
      results.push(result);
    } catch (err) {
      console.error(`\n  ✗ ${variant.name} FAILED:`, err.message);
      results.push({ name: variant.name, error: err.message });
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.name}: FAILED — ${r.error}`);
    } else {
      console.log(`  ✓ ${r.name}: taskId=${r.taskId}, rigId=${r.rigTaskId}`);
    }
  }

  console.log('\nOutput files:');
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.startsWith('blobby-'));
  for (const f of files) {
    const stat = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
  }

  console.log('\nDone! Update .env with your key, then run:\n  node scripts/generate-blobbys.mjs\n');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
