import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const blender =
  process.env.BLENDER_BIN ??
  (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const render = process.argv.includes('--render');
async function run(executable, args) {
  await new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { cwd: root, stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}`)),
    );
  });
}
await access(new URL('../blender/blobby.blend', import.meta.url));
for (const script of ['build_wardrobe.py', 'build_room.py', 'build_room_collection.py']) {
  await run(blender, [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    `rebuild/blender/${script}`,
    ...(render ? ['--', '--render'] : []),
  ]);
}
await run(process.execPath, ['rebuild/scripts/optimize.mjs']);
await run(process.execPath, ['rebuild/scripts/room-collection.mjs']);
await run(process.execPath, ['rebuild/scripts/validate.mjs']);
