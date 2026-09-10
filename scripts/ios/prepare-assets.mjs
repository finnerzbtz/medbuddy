import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const root = 'ios/App/App/Assets.xcassets';
await sharp('public/icons/icon-512.png')
  .resize(1024, 1024)
  .flatten({ background: '#f5f3ec' })
  .removeAlpha()
  .png()
  .toFile(root + '/AppIcon.appiconset/AppIcon-512@2x.png');
await mkdir(root + '/LaunchMark.imageset', { recursive: true });
await sharp('public/icons/icon-512.png')
  .resize(256, 256)
  .png()
  .toFile(root + '/LaunchMark.imageset/mark.png');
await writeFile(
  root + '/LaunchMark.imageset/Contents.json',
  JSON.stringify(
    {
      images: [{ filename: 'mark.png', idiom: 'universal', scale: '2x' }],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  ) + '\n',
);

// The native wallet validates shop debits against the same bundled catalogue.
const { build } = await import('esbuild');
const catalogue = await build({
  stdin: {
    contents:
      "import { PRODUCTS } from './src/domain/catalog.ts'; export default Object.fromEntries(PRODUCTS.map(p => [p.id, p.price]));",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { default: prices } = await import(
  'data:text/javascript;base64,' + Buffer.from(catalogue.outputFiles[0].text).toString('base64')
);
await writeFile('ios/App/App/LeafShopCatalog.json', JSON.stringify(prices, null, 2) + '\n');
