import { readFile, writeFile, mkdir, access, rename } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const cartoon = !process.argv.includes('--legacy');
const pack = cartoon ? 'cartoon-v2' : 'legacy';
const workDir = path.resolve('rebuild/generated/voice', pack);
const rawDir = cartoon ? path.join(workDir, 'raw') : path.resolve('rebuild/generated/voice/raw');
const targetDir = cartoon
  ? path.resolve('public/audio/voices', pack)
  : path.resolve('public/audio/voices');
const model = cartoon ? 'eleven_v3' : 'eleven_multilingual_v2';
const legacyVoices = [
  {
    id: 'cloud',
    sourceName: 'Lily',
    sourceId: 'pFZP5JQG7iQjIQuC4Bku',
    speed: 0.95,
    stability: 0.65,
    pitch: 1.06,
  },
  {
    id: 'moss',
    sourceName: 'George',
    sourceId: 'JBFqnCBsd6RMkjVDRZzb',
    speed: 0.96,
    stability: 0.68,
    pitch: 1,
  },
  {
    id: 'pip',
    sourceName: 'Jessica',
    sourceId: 'cgSgspJ2msm6clMCkdW9',
    speed: 1.01,
    stability: 0.57,
    pitch: 1.05,
  },
];
const voices = cartoon
  ? JSON.parse(await readFile(path.join(workDir, 'voices.json'), 'utf8')).voices
  : legacyVoices;
const only = process.argv.find((v) => v.startsWith('--only='))?.slice(7);
const previews = process.argv.includes('--previews');
const masterOnly = process.argv.includes('--master-only');
if (only && !voices.some((v) => v.id === only)) throw new Error('Unknown voice');
await mkdir(rawDir, { recursive: true });
await build({
  entryPoints: ['src/domain/wisdom.ts'],
  outfile: path.join(rawDir, '../wisdom.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { LITTLE_THOUGHTS } = await import(pathToFileURL(path.join(rawDir, '../wisdom.mjs')));
const sample = 'Hello, I’m Blobby. Let’s take a little moment together. There’s no hurry.';
const lines = [
  { id: 'preview', text: sample },
  ...LITTLE_THOUGHTS.map((t) => ({
    id: t.id,
    text:
      t.kind === 'quote'
        ? `A quote from ${t.author}. ${t.text.replaceAll('…', '').trim()}`
        : t.text,
  })),
];
const selected = voices
  .filter((v) => !only || v.id === only)
  .flatMap((voice) =>
    lines.filter((line) => !previews || line.id === 'preview').map((line) => ({ voice, line })),
  );
console.log(
  `Voice pack: ${selected.length} clips, ${selected.reduce((s, p) => s + p.line.text.length, 0)} text characters. Fixed scripts only; no player data.`,
);
if (!masterOnly && !process.argv.includes('--generate')) {
  console.log(
    'Plan only; no API requests. --generate requires explicit approval to spend credits. --previews limits generation to three samples.',
  );
  process.exit(0);
}
try {
  process.loadEnvFile('.env.audio.local');
} catch {
  /* Environment key supported. */
}
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key && !masterOnly) throw new Error('No authoring key configured; no request made.');
if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0)
  throw new Error('ffmpeg required.');
await mkdir(targetDir, { recursive: true });
const manifestPath = path.join(workDir, 'manifest.json');
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  /* First run. */
}
const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );
for (const { voice, line } of selected) {
  const id = `${voice.id}/${line.id}`;
  const direction =
    line.id === 'preview'
      ? '[curious] '
      : line.text.startsWith('A quote from ')
        ? '[thoughtful] '
        : '[gently] ';
  const params = {
    text: cartoon ? direction + line.text : line.text,
    model_id: model,
    voice_settings: {
      stability: voice.stability,
      similarity_boost: 0.75,
      style: cartoon ? 0 : 0.12,
      use_speaker_boost: !cartoon,
      speed: voice.speed,
    },
    seed: 42,
  };
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ sourceId: voice.sourceId, ...params }))
    .digest('hex');
  const raw = path.join(rawDir, `${voice.id}-${line.id}-${inputHash.slice(0, 10)}.mp3`);
  if (!(await exists(raw))) {
    if (masterOnly) throw new Error('Missing raw recording for ' + id);
    console.log('Generating ' + id);
    // No automatic retries after an uncertain paid request.
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.sourceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!response.ok)
      throw new Error(
        `ElevenLabs returned ${response.status} for ${id}. Check TTS access and credits. No retry made.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024 || !(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff))
      throw new Error('Invalid audio response.');
    await writeFile(raw, bytes);
  }
  const folder = path.join(targetDir, voice.id);
  await mkdir(folder, { recursive: true });
  const temporary = path.join(folder, line.id + '.new.mp3');
  const target = path.join(folder, line.id + '.mp3');
  const filter = [
    'silenceremove=start_periods=1:start_duration=0.015:start_threshold=-48dB',
    voice.pitch !== 1
      ? `asetrate=44100*${voice.pitch},aresample=44100,atempo=${1 / voice.pitch}`
      : null,
    'highpass=f=70',
    'lowpass=f=10500',
    'loudnorm=I=-21:TP=-4:LRA=9',
    'alimiter=limit=0.6:level=false:latency=true',
    'afade=t=in:d=0.015',
    'areverse',
    'afade=t=in:d=0.07',
    'areverse',
  ]
    .filter(Boolean)
    .join(',');
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      raw,
      '-af',
      filter,
      '-ar',
      '32000',
      '-ac',
      '1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '64k',
      temporary,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error('Mastering failed for ' + id);
  await rename(temporary, target);
  const bytes = await readFile(target);
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      target,
    ],
    { encoding: 'utf8' },
  );
  const duration = Number(probe.stdout.trim());
  if (!Number.isFinite(duration) || duration < 0.5 || duration > 25)
    throw new Error('Unexpected duration for ' + id);
  manifest[id] = {
    url: '/audio/voices/' + (cartoon ? pack + '/' : '') + id + '.mp3',
    bytes: bytes.length,
    duration,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    inputHash,
    text: line.text,
    provider: 'ElevenLabs',
    model,
    sourceVoice: voice.sourceName,
    sourceId: voice.sourceId,
    pitch: voice.pitch,
    ...(cartoon ? { direction: direction.trim(), characterDesign: pack } : {}),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Ready ' + id + ' (' + duration.toFixed(1) + 's)');
}
// A new character pack is published only after every thought has a recording.
if (selected.length !== voices.length * lines.length) {
  console.log(
    'Character auditions ready in ' + targetDir + '; the complete pack remains unchanged.',
  );
  process.exit(0);
}
await writeFile('rebuild/generated/voice/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const assets = Object.fromEntries(
  Object.entries(manifest).map(([id, asset]) => [
    id,
    asset.url + '?v=' + asset.sha256.slice(0, 10),
  ]),
);
await writeFile(
  'src/generated/voices.ts',
  '// Bundled speech; no credentials or provider IDs.\nexport const VOICE_ASSETS: Readonly<Record<string, string>> = ' +
    JSON.stringify(assets, null, 2) +
    ';\n',
);
console.log(
  `Voice pack ready: ${Object.keys(manifest).length} clips, ${Object.values(manifest).reduce((s, a) => s + a.bytes, 0)} bytes.`,
);
