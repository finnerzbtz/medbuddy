// Asset contract checks: topology, weights, dimensions, animation and portability.
// Run from the project root: node rebuild/blender/validate_blobby.mjs
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const file = fileURLToPath(new URL('./blobby.glb', import.meta.url));
const root = (await new NodeIO().read(file)).getRoot();
assert.equal(root.listMeshes().length, 8, 'body, wrap, two arms, two feet, two eyes');
assert.equal(root.listSkins().length, 1, 'one shared rig');
assert.equal(root.listSkins()[0].listJoints().length, 9);
assert.equal(root.listTextures().length, 0, 'no external image dependency');
assert.equal(root.listCameras().length, 0, 'studio is excluded');
assert.deepEqual(root.listAnimations().map(a => a.getName()).sort(), ['happy', 'idle', 'wave']);
for (const accessor of root.listAccessors()) {
  assert.ok(Array.from(accessor.getArray() ?? []).every(Number.isFinite), 'all numeric values are finite');
}
let vertices = 0;
let triangles = 0;
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const pos = primitive.getAttribute('POSITION');
    const normals = primitive.getAttribute('NORMAL');
    const weights = primitive.getAttribute('WEIGHTS_0');
    assert.ok(pos && normals && weights);
    vertices += pos.getCount();
    triangles += primitive.getIndices().getCount() / 3;
    const w = weights.getArray();
    for (let i = 0; i < w.length; i += 4) {
      const total = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
      assert.ok(Math.abs(total - 1) < .001, `normalized skin weights on ${mesh.getName()}`);
    }
  }
}
const durations = {};
for (const clip of root.listAnimations()) {
  const samplers = clip.listSamplers();
  const end = Math.max(...samplers.map(s => s.getInput().getMax([])[0]));
  const start = Math.min(...samplers.map(s => s.getInput().getMin([])[0]));
  durations[clip.getName()] = +(end - start).toFixed(3);
  assert.equal(durations[clip.getName()], clip.getName() === 'idle' ? 4 : 3);
  // Every clip is a seamless loop: first and last poses match, preventing pops.
  for (const sampler of samplers) {
    const values = sampler.getOutput();
    const first = values.getElement(0, []);
    const last = values.getElement(values.getCount() - 1, []);
    assert.ok(first.every((v, i) => Math.abs(v - last[i]) < .0001), `${clip.getName()} loop continuity`);
  }
}
assert.ok(vertices < 40000, 'portable export has a controlled mesh budget');
console.log(JSON.stringify({ status: 'passed', meshes: 8, bones: 9, vertices, triangles, durations }, null, 2));
