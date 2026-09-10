import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Own an isolated preview; never reuse the user's saved origin or cloud backend.
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  VITE_NEON_AUTH_URL: '',
  VITE_NEON_DATA_URL: '',
  RELEASE_A_URL: base,
  MOBILE_TEST_URL: base,
  MVP_TEST_URL: base,
};
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env, stdio: 'inherit' },
);
const serverClosed = once(server, 'exit');
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Isolated preview stopped');
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw new Error('Isolated preview did not start');
  for (const script of [
    'scripts/mvp/medication-name-tests.mjs',
    'scripts/mvp/reminder-browser-test.mjs',
    'scripts/release-a/quiet-break-browser-test.mjs',
    'scripts/release-a/ui-browser-test.mjs',
    'scripts/release-a/activity-browser-test.mjs',
    'scripts/ios/notification-onboarding-browser-tests.mjs',
    'scripts/ios/mobile-browser-tests.mjs',
    'scripts/ios/bundled-audio-browser-tests.mjs',
    'scripts/ios/radio-playback-browser-tests.mjs',
    'scripts/ios/sound-test-control-browser-tests.mjs',
    'scripts/refinement/companion-browser-test.mjs',
    'scripts/refinement/history-routines-browser-test.mjs',
    'scripts/mvp/shop-details-browser-test.mjs',
  ]) {
    console.log(`\nChecking ${script}`);
    const child = spawn(process.execPath, [script], { env, stdio: 'inherit' });
    const [code, signal] = await once(child, 'exit');
    if (code !== 0) throw new Error(`${script} failed (${signal ?? code})`);
  }
} finally {
  server.kill('SIGTERM');
  await serverClosed;
}
