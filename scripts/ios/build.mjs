import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const mode = process.argv[2];
if (!['simulator', 'archive', 'beta'].includes(mode))
  throw new Error('Choose simulator, archive or beta.');
if (Number(process.versions.node.split('.')[0]) < 22)
  throw new Error('Use Node 22 or newer (see .nvmrc).');
// Internal beta stays offline until the Release A server protocol is deployed.
if (mode === 'beta') {
  process.env.VITE_NEON_AUTH_URL = '';
  process.env.VITE_NEON_DATA_URL = '';
  if (!process.env.APPLE_TEAM_ID) throw new Error('Set APPLE_TEAM_ID for a signed beta archive.');
}
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};
run('npm', ['run', 'ios:sync']);
run(process.execPath, ['scripts/ios/prepare-assets.mjs']);
mkdirSync('ios/App/build', { recursive: true });
const base = [
  '-project',
  'ios/App/App.xcodeproj',
  '-scheme',
  'Reminduh',
  '-configuration',
  'Release',
  '-derivedDataPath',
  'ios/App/build/DerivedData',
];
if (mode === 'simulator') {
  run('xcodebuild', [
    ...base,
    '-destination',
    'generic/platform=iOS Simulator',
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ]);
} else {
  // An unsigned archive validates the device build before an Apple team is configured.
  // Set APPLE_TEAM_ID to create a signed archive; uploading is a separate explicit step in Xcode.
  const team = process.env.APPLE_TEAM_ID;
  if (team && !/^[A-Z0-9]{10}$/.test(team))
    throw new Error('APPLE_TEAM_ID must be a 10-character Apple team identifier.');
  run('xcodebuild', [
    ...base,
    '-destination',
    'generic/platform=iOS',
    '-archivePath',
    'ios/App/build/Reminduh.xcarchive',
    ...(team
      ? [`DEVELOPMENT_TEAM=${team}`, '-allowProvisioningUpdates']
      : ['CODE_SIGNING_ALLOWED=NO']),
    'archive',
  ]);
  if (!team)
    console.log(
      'Unsigned device archive created. Select your paid Apple Developer team and create a signed archive before TestFlight upload.',
    );
}
