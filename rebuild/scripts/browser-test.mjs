import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.ASSET_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.ASSET_TEST_OUT ?? 'rebuild/generated/qa';
await mkdir(out, { recursive: true });
const contract = JSON.parse(
  await readFile(new URL('../../public/assets-v2/scene-contract.json', import.meta.url), 'utf8'),
);
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1120 },
  deviceScaleFactor: 1,
});
const errors = [];
const modelRequests = [];
const remoteAssetRequests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('fonts.googleapis')) errors.push(m.text());
});
page.on('request', (r) => {
  if (/\.glb/.test(r.url())) modelRequests.push(r.url());
  if (/\.(hdr|glb|wasm|ktx2)(\?|$)/.test(r.url()) && !r.url().startsWith(origin))
    remoteAssetRequests.push(r.url());
});
try {
  await page.goto(origin + '/studio');
  await page.waitForFunction(() => window.__assetCharacter && window.__assetScene, {
    timeout: 45000,
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  for (const outfit of contract.outfits) {
    await page
      .getByRole('button', { name: outfit[0].toUpperCase() + outfit.slice(1), exact: true })
      .click();
    await page.getByLabel('A little personality').selectOption('idle');
    await page.waitForTimeout(200);
    const parts = await page.evaluate(() => {
      const parts = [];
      window.__assetCharacter.object.traverse((n) => {
        if (n.userData.variants)
          parts.push({ name: n.name, allowed: n.userData.variants, visible: n.visible });
      });
      return parts;
    });
    for (const p of parts)
      assert.equal(
        p.visible,
        p.allowed === 'all' || p.allowed.split(',').includes(outfit),
        'correct outfit visibility',
      );
    await page.screenshot({ path: `${out}/${outfit}.png`, fullPage: true });
    for (const clip of Object.keys(contract.clips)) {
      await page.getByLabel('A little personality').selectOption(clip);
      await page.waitForTimeout(65);
      const result = await page.evaluate((name) => {
        const { object, mixer, clips } = window.__assetCharacter;
        mixer.stopAllAction();
        const clip = clips.find((c) => c.name === name);
        mixer.clipAction(clip).reset().setEffectiveWeight(1).play();
        mixer.setTime(clip.duration * 0.37);
        object.updateMatrixWorld(true);
        let finite = true,
          skinned = 0;
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        object.traverse((n) => {
          if (n.isSkinnedMesh) {
            n.skeleton.update();
            skinned++;
            finite &&= Array.from(n.skeleton.boneMatrices).every(Number.isFinite);
            let shown = true;
            for (let p = n; p; p = p.parent) shown &&= p.visible;
            if (!shown) return;
            const point = n.position.clone();
            for (let i = 0; i < n.geometry.attributes.position.count; i += 17) {
              n.getVertexPosition(i, point).applyMatrix4(n.matrixWorld);
              [point.x, point.y, point.z].forEach((v, j) => {
                min[j] = Math.min(min[j], v);
                max[j] = Math.max(max[j], v);
              });
            }
          }
        });
        return { finite, skinned, time: mixer.time, min, max };
      }, clip);
      assert.ok(result.finite && result.skinned > 0, `${outfit}/${clip} valid skeleton`);
      assert.ok(
        result.min[1] > -0.08 && result.max[1] < 2.9 && result.min[0] > -1.6 && result.max[0] < 1.6,
        `${outfit}/${clip} bounded skin deformation: ${JSON.stringify(result)}`,
      );
    }
  }
  await page.getByLabel('A little personality').selectOption('wave');
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.__assetCharacter.mixer.time);
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(() => window.__assetCharacter.mixer.time),
    before,
    'pause freezes animation',
  );
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.waitForTimeout(200);
  assert.ok(
    (await page.evaluate(() => window.__assetCharacter.mixer.time)) > before,
    'resume advances animation',
  );
  await page.getByRole('button', { name: 'Toggle wireframe' }).click();
  await page.waitForFunction(() => {
    let yes = false;
    window.__assetCharacter.object.traverse((n) => {
      if (n.isMesh) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        yes ||= mats.some((m) => m.wireframe);
      }
    });
    return yes;
  });
  await page.getByRole('button', { name: 'Toggle wireframe' }).click();
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByLabel('Bonsai', { exact: true }).uncheck();
  await page.waitForFunction(
    () => window.__assetScene.scene.getObjectByName('Bonsai')?.visible === false,
  );
  await page.getByLabel('Bonsai', { exact: true }).check();
  await page.getByRole('button', { name: 'Base', exact: true }).click();
  await page.getByLabel('A little personality').selectOption('idle');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: out + '/mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to app' }).click();
  await page.waitForFunction(
    () => location.pathname === '/welcome' || document.querySelector('.home-scene'),
  );
  if (page.url().endsWith('/welcome')) {
    await page.getByRole('button', { name: 'Make yourself at home' }).click();
    await page.getByRole('link', { name: 'I’ll add this later' }).click();
  }
  await page.waitForFunction(() => window.__assetCharacter && window.__assetScene);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/home.png', fullPage: true });
  assert.equal(remoteAssetRequests.length, 0, 'no remote model/HDR/decoder requests');
  assert.ok(
    modelRequests.every((url) => url.includes('/assets-v2/')),
    'no legacy models requested',
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        status: 'passed',
        outfits: contract.outfits.length,
        clips: Object.keys(contract.clips).length,
        modelRequests: [...new Set(modelRequests)],
        remoteAssetRequests,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Browser checks passed: ${contract.outfits.length * Object.keys(contract.clips).length} outfit/clip combinations, pause/resume, wireframe, furniture visibility, mobile, home and local-only assets.`,
  );
} finally {
  await browser.close();
}
