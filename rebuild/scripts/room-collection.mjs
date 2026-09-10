import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, quantize } from '@gltf-transform/functions';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('rebuild/generated/room-collection-raw.glb');
await doc.transform(
  dedup(),
  weld(),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
  prune({ keepExtras: true }),
);
const bytes = await io.writeBinary(doc);
const items = {};
for (const node of doc.getRoot().listNodes()) {
  const id = node.getExtras().room_item;
  if (!id || !node.getMesh()) continue;
  const stat = (items[id] ??= { triangles: 0, drawCalls: 0 });
  for (const p of node.getMesh().listPrimitives()) {
    stat.triangles += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    stat.drawCalls++;
  }
}
const requiredItems = [
  'sand_garden',
  'record_player',
  'lava_lamp',
  'mushroom_lamp',
  'coast_view',
  'mountain_view',
];
if (
  requiredItems.some((id) => !items[id]?.triangles) ||
  Object.keys(items).length !== requiredItems.length
)
  throw new Error('Room collection is missing an expected item');
if (doc.getRoot().listTextures().length) throw new Error('Room collection must stay texture-free');
if (bytes.length > 400000 || Object.values(items).some((i) => i.triangles > 10000))
  throw new Error('Room collection exceeded its lightweight asset budget');
const report = {
  bytes: bytes.length,
  hash: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
  textures: doc.getRoot().listTextures().length,
  items,
};
await writeFile('public/assets-v2/room-collection.glb', bytes);
await writeFile(
  'public/assets-v2/room-collection-report.json',
  JSON.stringify(report, null, 2) + '\n',
);
await writeFile(
  'src/generated/room-collection.ts',
  'export const roomCollectionReport = ' + JSON.stringify(report, null, 2) + ' as const;\n',
);
console.log(JSON.stringify(report));
