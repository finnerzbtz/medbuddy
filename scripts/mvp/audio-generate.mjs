import { readFile, writeFile, mkdir, access, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd(),
  rawDir = path.join(root, 'rebuild/generated/audio/raw');
const assetsDir = path.join(root, 'public/audio');
const musicModel = 'music_v2',
  effectsModel = 'eleven_text_to_sound_v2';
const definitions = [
  [
    'zen-music',
    90,
    'Instrumental ambient music for quiet sand raking. Spacious warm felt piano and occasional muted wooden plucks, very soft airy pads, gentle pentatonic harmony, slow unhurried phrases, approximately 58 BPM with no audible beat. Peaceful, intimate, comforting. Consistent quiet dynamics, seamless atmosphere with matching opening and closing harmony. No vocals, speech, drums, high bells, dramatic swells or sudden events.',
  ],
  [
    'step',
    1,
    'One very soft small footstep on a woven tatami mat, gentle rounded body and tiny dry fabric shuffle. Close dry isolated foley, no background.',
  ],
  [
    'bounce',
    1,
    'One small soft rubber ball bouncing gently on a woven mat. Round low plop, a little elastic wobble, cute and tactile. Dry isolated foley, no music or background.',
  ],
  [
    'bite',
    1,
    'One small crisp apple bite, delicate short crunch with soft low body, cute gentle cartoon creature eating. Dry isolated foley, no voice, lip smacks, music or background.',
  ],
  [
    'sip',
    1,
    'One gentle quiet sip of tea from a ceramic cup. Subtle warm liquid movement, restrained and delicate, no exaggerated mouth noise. Close isolated foley, no voice, music or background.',
  ],
  [
    'cup',
    1,
    'One delicate ceramic teacup touching a saucer, warm soft small clink with very short natural resonance. Not sharp or loud. Isolated foley, no music or background.',
  ],
  [
    'cuddle',
    2,
    'A tiny friendly rounded coo made by a cute imaginary soft blob creature, warm and comforting, two gentle rising notes with a breathy soft finish. No intelligible words, no music, no background.',
  ],
  [
    'delight',
    2,
    'A small happy imaginary blob creature making a gentle rounded delighted chirrup, soft low pitch, cute tender playful sound. No words, shouting, music or background.',
  ],
  [
    'cloth',
    1,
    'One short soft cotton fabric swish as a tiny sweater is put on, tactile and delicate. Dry isolated foley, no music or background.',
  ],
  [
    'place',
    1,
    'One small wooden ornament placed gently on a wooden shelf, a quiet warm hollow tok with tiny surface friction. Close dry isolated foley, no music or background.',
  ],
  [
    'lamp',
    1,
    'One soft tactile lamp toggle switch click, rounded warm wooden click, not sharp. Dry isolated foley, no music or background.',
  ],
  [
    'water',
    1,
    'A quiet continuous gentle stream of water from a miniature watering can onto moist plant soil. Soft little droplets, delicate liquid texture, no splashes or hiss, consistent volume. Dry isolated foley, no music.',
  ],
  [
    'bloom',
    2,
    'A tiny magical flower opening, airy soft whoosh followed by three muted wooden and glass notes rising slowly, warm and gentle. Short game sound, no harsh sparkle or high ringing, no background.',
  ],
  [
    'checkin',
    3,
    'A gentle warm success sound for a small accomplishment. Four rising soft marimba and felt piano notes ending in a mellow major chord, subtle airy shimmer. Encouraging and calm, no loud fanfare, no speech or background.',
  ],
  [
    'purchase',
    1.5,
    'A short friendly warm reward sound, two soft wooden plucks rising with a tiny leaf-like rustle. Gentle organic game sound, no cash register, coins or loud bells.',
  ],
  [
    'sleep',
    1.5,
    'A soft tiny pillow squish and linen settling as a little creature curls up in bed. Quiet tactile dry isolated foley, no snoring, music or background.',
  ],
  [
    'reminder',
    2,
    'A discreet kind reminder, two soft felt piano notes with a warm gentle decay. Slow, quiet and reassuring, no alarm, urgency, voice or sharp frequencies.',
  ],
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
if (only && !definitions.some(([id]) => id === only)) throw new Error('Unknown audio asset.');
const selected = definitions.filter(([id]) => !only || id === only);
console.log(
  `ElevenLabs: ${selected.length} planned assets (music_v2 + sound effects v2). Requests use your account credits; no requests are made without --generate.`,
);
for (const [id, duration] of selected) console.log(`  ${id}: ${duration}s`);
const masterOnly = process.argv.includes('--master-only');
if (!process.argv.includes('--generate') && !masterOnly) {
  console.log(
    'Plan only. Add ELEVENLABS_API_KEY to .env.audio.local, then use --generate to make the requests. Existing generated assets are kept.',
  );
  process.exit(0);
}
try {
  process.loadEnvFile(path.join(root, '.env.audio.local'));
} catch {
  /* A process environment key is also supported. */
}
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key && !masterOnly)
  throw new Error('Add ELEVENLABS_API_KEY to .env.audio.local first. No request was sent.');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status !== 0)
  throw new Error('Install ffmpeg before generating. No request was sent.');
await mkdir(rawDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });
let manifest = {};
try {
  manifest = JSON.parse(await readFile(path.join(rawDir, '../manifest.json'), 'utf8'));
} catch {
  /* First generation. */
}
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
for (const [id, duration, prompt] of selected) {
  if (id === 'zen-music' && manifest[id]?.revision?.startsWith('lofi-room-')) {
    console.log(
      'Keeping the mastered lo-fi loop. Use scripts/mvp/lofi-music-master.py to re-master its source.',
    );
    continue;
  }
  if (id === 'step' && manifest.step?.revision === 'plush-steps-v2') {
    console.log(
      'Keeping the new footstep set. Re-master it with node scripts/mvp/footsteps-generate.mjs --master-only.',
    );
    continue;
  }
  const music = id === 'zen-music';
  const model = music ? musicModel : effectsModel;
  const rawPath = path.join(rawDir, id + '.mp3');
  if (!(await exists(rawPath))) {
    if (masterOnly)
      throw new Error(`Missing raw audio for ${id}; master-only mode never sends an API request.`);
    console.log('Generating ' + id + '…');
    const body = music
      ? { model_id: model, prompt, music_length_ms: duration * 1000, force_instrumental: true }
      : {
          model_id: model,
          text: prompt,
          duration_seconds: duration,
          prompt_influence: 0.35,
          loop: id === 'water',
        };
    const endpoint = music
      ? 'https://api.elevenlabs.io/v1/music'
      : 'https://api.elevenlabs.io/v1/sound-generation';
    // No automatic retries: an uncertain paid request must not silently charge again.
    const response = await fetch(endpoint + (music ? '' : '?output_format=mp3_44100_128'), {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok)
      throw new Error(
        `Generation failed (${response.status}) for ${id}. Check your key permissions, credits and Music API access. No automatic retry was made.`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length < 1024 ||
      (!bytes.toString('ascii', 0, 3).startsWith('ID3') && bytes[0] !== 0xff)
    )
      throw new Error('Expected an MP3 response; nothing was installed.');
    await writeFile(rawPath, bytes);
  }
  const target = path.join(assetsDir, id + '.mp3'),
    temporary = path.join(assetsDir, id + '.new.mp3');
  // Foley has to finish within an action beat, not overlap the next footstep.
  const cueLengths = {
    step: 0.16,
    bounce: 0.42,
    cup: 0.55,
    cloth: 0.65,
    place: 0.55,
    lamp: 0.18,
    water: 0.4,
  };
  const durationLimit = Math.min(duration, cueLengths[id] ?? duration);
  const footstep = id === 'step';
  const filter = [
    music ? null : 'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB',
    `highpass=f=${footstep ? 140 : 80}`,
    `lowpass=f=${footstep ? 1500 : 8500}`,
    `loudnorm=I=${music ? -23 : footstep ? -29 : -21}:TP=${footstep ? -9 : -4}:LRA=7`,
    'alimiter=limit=0.5:level=false:attack=5:release=60:latency=true',
    `afade=t=in:d=${footstep ? 0.018 : 0.008}`,
    `afade=t=out:st=${Math.max(0, durationLimit - (footstep ? 0.12 : 0.08))}:d=${footstep ? 0.12 : 0.08}`,
  ]
    .filter(Boolean)
    .join(',');
  const encode = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      rawPath,
      '-af',
      filter,
      '-t',
      String(durationLimit),
      '-ar',
      '44100',
      '-ac',
      music ? '2' : '1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      music ? '128k' : '96k',
      temporary,
    ],
    { encoding: 'utf8' },
  );
  if (encode.status !== 0)
    throw new Error('Audio encoding failed for ' + id + '. Raw generation was kept for retry.');
  await rename(temporary, target);
  const hash = createHash('sha256')
    .update(await readFile(target))
    .digest('hex')
    .slice(0, 12);
  manifest[id] = {
    url: `/audio/${id}.mp3?v=${hash}`,
    provider: 'ElevenLabs',
    model,
    prompt,
    generatedAt: manifest[id]?.generatedAt || new Date().toISOString(),
    duration: durationLimit,
  };
  await writeFile(path.join(rawDir, '../manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const urls = Object.fromEntries(
    Object.entries(manifest).map(([name, value]) => [name, value.url]),
  );
  await writeFile(
    path.join(root, 'src/generated/audio.ts'),
    '// Generated audio asset URLs. Credentials never enter this file.\nexport const AUDIO_ASSETS: Record<string, string> = ' +
      JSON.stringify(urls, null, 2) +
      ';\n',
  );
  console.log('Mastered ' + id + '.');
}
console.log(
  'Generation complete. Listen to each asset before release, then run npm run build to include the files in the offline app.',
);
