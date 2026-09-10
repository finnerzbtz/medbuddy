import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../../public/assets-v2/', import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const contract = JSON.parse(await readFile(dir + 'scene-contract.json', 'utf8'));
const report = JSON.parse(await readFile(dir + 'asset-report.json', 'utf8'));
for (const name of ['characters', 'room']) {
  const root = (await io.read(dir + name + '.glb')).getRoot();
  for (const a of root.listAccessors())
    assert.ok(Array.from(a.getArray() ?? []).every(Number.isFinite), `${name}: finite values`);
  assert.equal(root.listCameras().length, 0, 'studio is excluded');
  for (const ext of root.listExtensionsRequired())
    assert.ok(['KHR_mesh_quantization'].includes(ext.extensionName), 'no external decoder needed');
  for (const texture of root.listTextures()) {
    assert.ok(texture.getImage()?.byteLength > 0, 'embedded texture');
    assert.ok(
      texture.getSize().every((n) => n <= 512),
      'texture budget',
    );
  }
  if (name === 'characters') {
    assert.equal(root.listSkins().length, 1, 'one shared skin');
    assert.equal(
      new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()))).size,
      9,
      'shared nine-bone rig',
    );
    assert.deepEqual(
      root
        .listAnimations()
        .map((a) => a.getName())
        .sort(),
      Object.keys(contract.clips).sort(),
    );
    for (const clip of root.listAnimations()) {
      const samplers = clip.listSamplers();
      const duration = Math.max(...samplers.map((s) => s.getInput().getMax([])[0]));
      assert.ok(
        Math.abs(duration - contract.clips[clip.getName()]) < 0.05,
        clip.getName() + ' duration',
      );
      for (const s of samplers) {
        const values = s.getOutput();
        const a = values.getElement(0, []),
          b = values.getElement(values.getCount() - 1, []);
        assert.ok(
          a.every((v, i) => Math.abs(v - b[i]) < 0.001) ||
            (clip
              .listChannels()
              .some(
                (channel) => channel.getSampler() === s && channel.getTargetPath() === 'rotation',
              ) &&
              a.every((v, i) => Math.abs(v + b[i]) < 0.001)),
          clip.getName() + ' loop',
        );
      }
    }
    for (const variant of contract.outfits)
      assert.ok(
        report.assets[name].after.drawCallsByOutfit[variant] <= 18,
        variant + ' draw budget',
      );
    for (const m of root.listMeshes())
      for (const p of m.listPrimitives()) {
        const w = p.getAttribute('WEIGHTS_0');
        assert.ok(w, 'skin weights retained');
        for (let i = 0; i < w.getCount(); i++)
          assert.ok(
            Math.abs(w.getElement(i, []).reduce((a, b) => a + b, 0) - 1) < 0.015,
            'normalised weights',
          );
      }
  } else {
    assert.equal(root.listSkins().length, 0);
    assert.equal(root.listAnimations().length, 0);
    for (const group of contract.roomGroups)
      assert.ok(
        root.listNodes().some((n) => n.getExtras().asset_group === group),
        group + ' preserved',
      );
  }
  assert.ok(
    report.assets[name].bytes < (name === 'characters' ? 2_600_000 : 650_000),
    name + ' file budget',
  );
  assert.ok(
    report.assets[name].after.triangles < (name === 'characters' ? 105000 : 40000),
    name + ' triangle budget',
  );
}
console.log(
  'Asset contracts passed: geometry, weights, clips, outfit groups, textures and budgets.',
);
