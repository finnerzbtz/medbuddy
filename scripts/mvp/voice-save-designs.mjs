import { readFile, writeFile, access } from 'node:fs/promises';
const dir = 'rebuild/generated/voice/cartoon-v2';
const ids = ['cloud', 'moss', 'pip'];
const exists = (file) =>
  access(file).then(
    () => true,
    () => false,
  );
if (!process.argv.includes('--save')) {
  console.log(
    'Use --save to add the three generated Blobby character voices to the authoring library.',
  );
  process.exit(0);
}
process.loadEnvFile('.env.audio.local');
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error('No authoring key');
const voices = [];
for (const [i, id] of ids.entries()) {
  const design = JSON.parse(await readFile(dir + '/' + id + '-design.json', 'utf8'));
  const selected = design.previews[0];
  const file = dir + '/' + id + '-saved.json';
  let voice;
  if (await exists(file)) voice = JSON.parse(await readFile(file, 'utf8'));
  else {
    const name = 'Blobby ' + design.name + ' — cartoon v2';
    // A read before create avoids duplicate slots after an interrupted response.
    const existing = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    });
    if (!existing.ok) throw new Error('Could not check existing voice slots');
    const list = await existing.json();
    voice = list.voices.find((v) => v.name === name);
    if (!voice) {
      const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_name: name,
          voice_description: design.prompt,
          generated_voice_id: selected.generatedVoiceId,
          labels: { use_case: 'characters_animation', language: 'en' },
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw new Error(
          'Saving ' + id + ' failed with HTTP ' + response.status + '. No automatic retry.',
        );
      voice = await response.json();
    }
    await writeFile(
      file,
      JSON.stringify(
        {
          voice_id: voice.voice_id,
          name: voice.name,
          generatedVoiceId: selected.generatedVoiceId,
          designInputHash: design.inputHash,
        },
        null,
        2,
      ) + '\n',
    );
  }
  voices.push({
    id,
    sourceName: voice.name,
    sourceId: voice.voice_id,
    speed: [0.97, 0.97, 1][i],
    stability: 0.5,
    pitch: 1,
    description: design.description,
    previewIndex: selected.index,
  });
  console.log('Saved custom ' + design.name + ' character voice');
}
await writeFile(
  dir + '/voices.json',
  JSON.stringify({ model: 'eleven_v3', designModel: 'eleven_ttv_v3', voices }, null, 2) + '\n',
);
