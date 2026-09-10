import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const revision = 'lofi-room-drumless-v2';
const dir = path.join(root, 'rebuild/generated/audio', revision);
const prompt =
  'An original drum-free instrumental cozy lo-fi piece for a gentle little companion game. Instrumentation is ONLY warm mellow Rhodes electric piano, soft fingerpicked nylon guitar and a quiet sustained acoustic bass. Absolutely NO drums and NO percussion anywhere in the recording. Intimate late-afternoon bedroom cafe feeling, comforting and quietly optimistic. The Rhodes plays rich major ninth and minor seventh chords with velvety soft attacks; the nylon guitar answers with a small memorable tender melody; bass supports the harmony softly without percussive plucks. Relaxed 75 BPM, naturally flowing piano and guitar phrasing, gentle human timing. Soft tape warmth, restrained stereo room ambience, rounded low-pass character. Full musical harmony and gentle melody continue throughout all 128 seconds, including the final bars. Begin with the established piano-and-guitar arrangement. Repeat and gently vary an eight-bar harmonic cycle; opening and closing should share the same key and musical flow for a seamless background loop. Consistent quiet dynamics. No drum kit, kick, snare, hi-hat, cymbals, brushes, shaker, tambourine, handclaps, finger snaps, rimshot, tapping, clicking, beatboxing, rhythmic noise, vinyl crackle, percussive impacts or percussion of any kind. No intro, outro, ending cadence, fade-out, breakdown, dramatic transitions, sound effects, bells, synth leads, isolated sine wave, test tone, high ringing, drone-only passage, vocals, speech, humming or singing. A complete warm acoustic and electric-piano musical piece with no percussion.';
const body = { model_id: 'music_v2', prompt, music_length_ms: 128000, force_instrumental: true };
console.log('ElevenLabs Music v2: one 128-second drum-free instrumental lo-fi recording.');
if (!process.argv.includes('--generate')) {
  console.log(prompt);
  process.exit(0);
}
await mkdir(dir, { recursive: true });
const exists = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
const raw = path.join(dir, 'original.mp3');
if (await exists(raw)) {
  console.log('Existing raw recording kept; no new request.');
  process.exit(0);
}
const attempt = path.join(dir, 'request.json');
if (await exists(attempt))
  throw new Error(
    'A request was already attempted. Inspect its status before deciding whether another paid generation is needed. No retry was sent.',
  );
try {
  process.loadEnvFile(path.join(root, '.env.audio.local'));
} catch {}
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error('The saved ElevenLabs key is unavailable. No request sent.');
const record = {
  provider: 'ElevenLabs',
  revision,
  arrangement: 'drumless',
  startedAt: new Date().toISOString(),
  status: 'started',
  ...body,
};
await writeFile(attempt, JSON.stringify(record, null, 2) + '\n');
try {
  const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok)
    throw new Error(
      'ElevenLabs returned HTTP ' + response.status + '. No automatic retry was sent.',
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100000 || (bytes.toString('ascii', 0, 3) !== 'ID3' && bytes[0] !== 0xff))
    throw new Error('The response was not the expected recording; no asset installed.');
  await writeFile(raw, bytes);
  await writeFile(
    attempt,
    JSON.stringify(
      {
        ...record,
        status: 'completed',
        completedAt: new Date().toISOString(),
        bytes: bytes.length,
        songId: response.headers.get('song-id'),
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Raw lo-fi recording saved (' + bytes.length + ' bytes). Ready for mastering.');
} catch (error) {
  await writeFile(
    attempt,
    JSON.stringify(
      {
        ...record,
        status: 'failed-or-uncertain',
        error: error instanceof Error ? error.message : 'Unknown request outcome',
      },
      null,
      2,
    ) + '\n',
  );
  throw error;
}
