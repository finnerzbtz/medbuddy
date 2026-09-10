import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const revision = 'plush-steps-v2';
const root = process.cwd();
const folder = path.join(root, 'rebuild/generated/audio', revision);
const ids = ['step', 'step-soft-2', 'step-soft-3'];
const generate = process.argv.includes('--generate');
const masterOnly = process.argv.includes('--master-only');
const prompt =
  'One single tiny soft cartoon paw pat for a small plush blob landing on a cushion. A warm rounded dry puf with a very short velvety fabric compression, gentle and cute, like pressing a small felt beanbag. The actual contact lasts only about 150 milliseconds, followed by silence. Intimate close dry foley. No human footsteps, shoes, hard heel impact, grit, crunch, squeak, wet squelch, mouth sounds, pitched note, voice, music, background or reverb.';
if (!generate && !masterOnly) {
  console.log(
    'Plan: three new one-second ElevenLabs foley variations. Use --generate with owner approval, or --master-only to reuse the new recordings.',
  );
  process.exit(0);
}
await mkdir(folder, { recursive: true });
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0)
  throw new Error('ffmpeg is required.');
if (generate) {
  try {
    process.loadEnvFile(path.join(root, '.env.audio.local'));
  } catch {}
  if (!process.env.ELEVENLABS_API_KEY?.trim())
    throw new Error('The authoring key is unavailable. No request sent.');
}
const entries = {};
for (let index = 0; index < ids.length; index++) {
  const id = ids[index];
  const rawPath = path.join(folder, id + '.raw.mp3');
  const provenancePath = path.join(folder, id + '.json');
  let raw = await readFile(rawPath).catch(() => null);
  let provenance = JSON.parse(await readFile(provenancePath, 'utf8').catch(() => '{}'));
  if (!raw) {
    if (!generate) throw new Error('Missing new recording: ' + id + '. No request sent.');
    if (provenance.status === 'requested')
      throw new Error(
        'A prior request has an uncertain result for ' + id + '; check it before retrying.',
      );
    provenance = {
      provider: 'ElevenLabs',
      model: 'eleven_text_to_sound_v2',
      prompt,
      revision,
      requestedAt: new Date().toISOString(),
      status: 'requested',
    };
    await writeFile(provenancePath, JSON.stringify(provenance, null, 2));
    console.log('Generating new plush footstep ' + (index + 1) + '/3…');
    const response = await fetch(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY.trim(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'eleven_text_to_sound_v2',
          text: prompt,
          duration_seconds: 1,
          prompt_influence: 0.55,
          loop: false,
        }),
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok)
      throw new Error('Generation returned HTTP ' + response.status + '. No automatic retry.');
    raw = Buffer.from(await response.arrayBuffer());
    if (raw.length < 1024 || (raw.toString('ascii', 0, 3) !== 'ID3' && raw[0] !== 0xff))
      throw new Error('Expected an MP3; nothing installed.');
    await writeFile(rawPath, raw);
    provenance.status = 'received';
    await writeFile(provenancePath, JSON.stringify(provenance, null, 2));
  }
  // Keep the actual new contact, rather than cropping arbitrary leading silence.
  const decoded = spawnSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-i',
      rawPath,
      '-af',
      'highpass=f=110,lowpass=f=2600',
      '-ar',
      '32000',
      '-ac',
      '1',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { maxBuffer: 2_000_000 },
  );
  if (decoded.status !== 0) throw new Error('Could not decode ' + id);
  const pcm = decoded.stdout;
  const samples = Array.from({ length: pcm.length / 4 }, (_, i) => pcm.readFloatLE(i * 4));
  const block = 320;
  const energy = Array.from(
    { length: Math.floor(samples.length / block) },
    (_, b) => samples.slice(b * block, (b + 1) * block).reduce((s, v) => s + v * v, 0) / block,
  );
  const peak = Math.max(...energy);
  if (!Number.isFinite(peak) || peak < 1e-10) throw new Error('The new recording is silent: ' + id);
  let onset = energy.indexOf(peak);
  const earliest = Math.max(0, onset - 8);
  while (onset > earliest && energy[onset - 1] > peak * 0.08) onset--;
  const start = Math.max(0, onset * block - 160);
  const length = Math.min(6080, samples.length - start);
  const shaped = samples.slice(start, start + length).map((v, i) => {
    const attack = Math.min(1, i / 384);
    const release = Math.min(1, (length - 1 - i) / 2240);
    return v * Math.sin((attack * Math.PI) / 2) ** 2 * Math.sin((release * Math.PI) / 2) ** 2;
  });
  const rms = Math.sqrt(shaped.reduce((s, v) => s + v * v, 0) / length);
  const gain = Math.min(0.025 / rms, 0.14 / Math.max(...shaped.map(Math.abs)));
  const output = Buffer.alloc(length * 4);
  shaped.forEach((v, i) => output.writeFloatLE(v * gain, i * 4));
  const master = path.join(folder, id + '.mp3');
  const encoded = spawnSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      '32000',
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '64k',
      master,
    ],
    { input: output },
  );
  if (encoded.status !== 0) throw new Error('Could not master ' + id);
  const bytes = await readFile(master);
  const hash = createHash('sha256').update(bytes).digest('hex');
  entries[id] = {
    url: '/audio/' + id + '.mp3?v=' + hash.slice(0, 12),
    provider: 'ElevenLabs',
    model: provenance.model,
    prompt,
    revision,
    generatedAt: provenance.requestedAt,
    duration: length / 32000,
    bytes: bytes.length,
    sha256: hash,
    source: path.relative(root, rawPath),
  };
  console.log(
    'Prepared ' + id + ': ' + Math.round(length / 32) + 'ms, ' + bytes.length + ' bytes.',
  );
}
// Publish only after all three new variations are present and mastered.
for (const id of ids)
  await writeFile(
    path.join(root, 'public/audio', id + '.mp3'),
    await readFile(path.join(folder, id + '.mp3')),
  );
const manifestPath = path.join(root, 'rebuild/generated/audio/manifest.json');
const manifest = { ...JSON.parse(await readFile(manifestPath, 'utf8')), ...entries };
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  path.join(root, 'src/generated/audio.ts'),
  '// Generated audio asset URLs. Credentials never enter this file.\nexport const AUDIO_ASSETS: Record<string, string> = ' +
    JSON.stringify(
      Object.fromEntries(Object.entries(manifest).map(([id, data]) => [id, data.url])),
      null,
      2,
    ) +
    ';\n',
);
console.log(
  'Installed three newly generated plush footsteps. Original source recording is preserved in the authoring archive.',
);
