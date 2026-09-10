import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve('rebuild/generated/voice/cartoon-v2');
const transcript =
  'Oh, hello! I’m Blobby. I saved you a cosy little spot. We could watch the leaves wiggle… or just sit for a moment. Mm, lovely. There’s no hurry. One small thing at a time. We’ll find our own little rhythm.';
const descriptions = [
  {
    id: 'cloud',
    name: 'Cloud',
    description: 'Floaty and softly curious',
    prompt:
      'Native British English. An adult performer voicing a tiny friendly cloud sprite in a cosy animated game. Androgynous, light upper-mid register. Studio quality. Persona: cuddly curious cloud creature. Emotion: quietly delighted, relaxed, affectionate. A distinctive soft rounded cartoon timbre with velvety vowels and gentle buoyant pitch swoops. Speaks as a small magical being chatting to one close friend, with a smile in the sound, spontaneous little pauses and expressive, slightly whimsical emphasis. Unhurried conversational rhythm, comfortably voiced and easy to understand. Warmth and subtle playful surprise throughout; a calm settling finish to each phrase. Intimate, low-energy character acting, soft consonants, consistent gentle volume.',
  },
  {
    id: 'moss',
    name: 'Moss',
    description: 'Cuddly with a little rumble',
    prompt:
      'Native British English. An adult male character performer voicing a small round woodland creature in a cosy animated game. Studio quality. Persona: cuddly, gently silly forest friend. Emotion: warm, contented, quietly amused. A distinctive plush rounded mid-low voice, a soft fuzzy rumble and a slightly dopey lovable cartoon resonance. Flexible melodic intonation, little thoughtful hums and smiling vowels. Friendly close conversation with a relaxed strolling rhythm, soft playful lifts and natural pauses. The creature is small and kind, with a comforting warm belly to the sound. Clear words, soft consonants, gentle consistent volume and a soothing finish to each phrase. Expressive character acting with warmth and tiny moments of wonder.',
  },
  {
    id: 'pip',
    name: 'Pip',
    description: 'Bouncy and gently cheeky',
    prompt:
      'Native British English. An adult female character performer voicing a little squishy blob creature in a cosy animated game. Studio quality. Persona: sweet, curious, gently mischievous little creature. Emotion: playful, contented, reassuring. A distinctive rounded higher-mid cartoon voice, warm and clear with a soft little squeak at the ends of delighted phrases. Buoyant melodic pitch curves and a smile, with tiny pauses as if the blob is discovering its words. Gentle restrained playfulness, light lilting rhythm with space between ideas, a cosy relaxed tempo. Soft consonants and comfortably voiced vowels. Small intimate conversational gestures and quiet whimsical emphasis, settling warmly at the end of each phrase. The energy stays low and soothing.',
  },
];
if (!process.argv.includes('--generate')) {
  console.log(
    JSON.stringify({
      plan: 'Three custom character voice designs, three previews per design',
      previewCharacters: transcript.length * descriptions.length,
      descriptions,
    }),
  );
  process.exit(0);
}
process.loadEnvFile('.env.audio.local');
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error('Missing authoring key');
await mkdir(directory, { recursive: true });
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );
for (const voice of descriptions) {
  const params = {
    model_id: 'eleven_ttv_v3',
    voice_description: voice.prompt,
    text: transcript,
    auto_generate_text: false,
    loudness: 0,
    guidance_scale: 3.5,
    seed: 731,
  };
  const hash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
  const responseFile = path.join(directory, voice.id + '-' + hash.slice(0, 10) + '.json');
  let result;
  if (await exists(responseFile)) result = JSON.parse(await readFile(responseFile, 'utf8'));
  else {
    console.log('Designing ' + voice.name);
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        'Design failed: HTTP ' +
          response.status +
          ' ' +
          String(error.detail?.status || '') +
          '. No automatic retry.',
      );
    }
    result = await response.json();
    await writeFile(responseFile, JSON.stringify(result));
  }
  if (!result.previews?.length) throw new Error('No previews for ' + voice.id);
  const previews = [];
  for (const [i, preview] of result.previews.entries()) {
    const raw = path.join(directory, voice.id + '-design-' + (i + 1) + '.mp3');
    const output = path.join(directory, voice.id + '-sample-' + (i + 1) + '.mp3');
    await writeFile(raw, Buffer.from(preview.audio_base_64, 'base64'));
    const mastered = spawnSync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      raw,
      '-af',
      'highpass=f=70,lowpass=f=10500,loudnorm=I=-21:TP=-4:LRA=9,alimiter=limit=0.6:level=false:latency=true,afade=t=in:d=0.015',
      '-ar',
      '44100',
      '-ac',
      '1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '96k',
      output,
    ]);
    if (mastered.status !== 0) throw new Error('Mastering failed');
    previews.push({
      index: i + 1,
      generatedVoiceId: preview.generated_voice_id,
      duration: preview.duration_secs,
      file: output,
    });
  }
  await writeFile(
    path.join(directory, voice.id + '-design.json'),
    JSON.stringify({ ...voice, params, inputHash: hash, transcript, previews }, null, 2) + '\n',
  );
  console.log('Ready ' + voice.name + ': ' + previews.length + ' samples');
}
