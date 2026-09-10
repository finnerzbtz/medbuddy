# Blobby’s voice choices

Three original cartoon voices are included: Cloud (a floaty, curious cloud sprite), Moss (a cuddly woodland creature with a little rumble), and Pip (a bouncy, gently cheeky blob). Quiet keeps the words on screen. The chosen voice is saved in app data, including backups and the native durable copy; older saves default to Cloud. This does not start speech.

The bubble has just two controls: the voice chooser and Mute / Unmute. The chooser is also available in Sound settings / My Blobby. Preview does not change the saved choice, and the short preview transcript is available to read. Audio starts quietly on each visit until the player presses Unmute or enables sound. Once enabled, Blobby reads each new visible bubble in the chosen voice, including the author before quotations. Mute stops current and pending speech and keeps future bubbles silent; it preserves the chosen voice and volume without muting music or effects. The choice is saved through the existing Read thoughts aloud preference. Unmute resumes the current bubble.

All 35 thoughts rotate together, without manual browsing or category filters. Each bubble gets about a minute of visible time, excluding narration, loading, lost focus, dialogs, hidden or offscreen bubbles, and a focused source link. Time resumes where it left off rather than skipping through a backlog. There are no progress bars or countdowns. Hide little thoughts remains available, including through Comfort settings.

Only bubbles at least one quarter visible on screen are narrated, with a brief delay to avoid overlapping UI changes. Hidden bubbles, the feeding tray, open dialogs, navigation, Quiet, zero voice volume, master mute and lost focus prevent automatic speech. An interrupted or completed thought is not replayed just because focus or scroll returns. Returning to Today or explicitly showing the bubble can read that new appearance. Captions remain on screen; polite screen-reader announcements are used when automatic audio is off. Automatic playback cannot unlock or unmute the audio mixer.

Speech uses its own volume and bus, independent of sound effects. Music and effects drop to one quarter of their chosen gain while speech plays, then return gently. A pending fetch or decode cannot start after cancellation. At most six decoded speech buffers are held in memory. The runtime only fetches bundled audio URLs; it contains no authoring key, provider account IDs or live generation requests.

## Generated authoring batch — 7 September 2026

The owner requested more playful, cartoon-like voices with a calm, relaxed delivery. The replacement pack uses [ElevenLabs Voice Design v3](https://elevenlabs.io/docs/api-reference/text-to-voice/design) for three original characters and [Eleven v3](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) for the spoken lines. Detailed character prompts specify rounded timbres, gentle melodic intonation, natural pauses and low-energy, intimate delivery. There is no pitch-shifting effect.

- Cloud: an androgynous upper-mid cloud sprite, floaty and softly curious.
- Moss: a plush mid-low woodland creature, cuddly with a little rumble.
- Pip: a higher-mid squishy blob, bouncy and gently cheeky.

Each design returned three auditions; the first candidate in each direction was saved to the private authoring library. Short production-model previews were supplied to the owner before the full batch. Natural stability (0.5), a relaxed pace, and sparse curious / gentle / thoughtful direction tags shape the performance. Mastering retains quiet volume, expression and peak headroom. User testing determines whether the character style fits; automated tests only verify playback and signal quality.

The owner approved ElevenLabs generation earlier in the session and requested this revision. The completed pack contains **108 clips, 7,038 spoken-text characters, 8,073 submitted TTS characters including direction tags, and 4,303,728 mastered bytes (4.3 MB)**. Voice-design auditions are a separate small authoring batch. Scripts are fixed app copy. No profile, medication, check-in or other player data is sent to ElevenLabs. These are character readings, not impersonations of the quoted authors.

Generation requires the owner’s explicit approval to spend ElevenLabs credits. `npm run voice:generate` is a local plan only. `--generate --previews` generates only the three staged samples; `--generate` generates the full pack. `--only=cloud` (or moss / pip) limits the voice. `--master-only` processes existing raw recordings without requests. Matching raw generations are reused, and uncertain paid requests are never retried automatically. A partial run does not publish a mixed voice pack; run the complete batch to update the runtime map. `npm run voice:design -- --generate` regenerates only uncached designs; `npm run voice:save-designs -- --save` saves the chosen designs with a duplicate check. Existing voices in the account are preserved.

Authoring credentials are loaded from the existing ignored `.env.audio.local`, never from a VITE variable. The current raw recordings and provenance go into `rebuild/generated/voice/cartoon-v2/`. The original stock pack is archived under `rebuild/generated/voice/legacy/` and is excluded from the app bundle. Mastered speech goes into `public/audio/voices/cartoon-v2/`, encoded as mono MP3 at 32 kHz / 64 kbps, with controlled loudness, peak headroom and short edge fades. A generated URL/hash manifest connects recordings to the app. `npm run build` includes the complete pack in the offline cache and the native archive. The current unsigned archive contains the recordings and matches the production web assets.

## Verification

- `npm run test:unit`: migration, valid choices, backup round-trip and unchanged health/care data.
- `npm run test:voice`: all eight voice-control scenarios pass with real recordings; measures actual Web Audio output, preview/stop, cancellation including delayed loading, focus/route changes, separate channels, ducking and master mute.
- `npm run test:voice-auto`: automatic reading after Unmute, timed rotation that waits for narration, pending-load cancellation, saved mute and voice choice, dialog previews, Quiet/master mute, focus, hiding, scrolling, the feeding tray and route changes.
- `npm run test:audio` and `npm run test:wisdom`: four sound and eight speech-bubble scenarios pass.
- `npm run test:wisdom-offline`: all 108 recordings match their hashes and decode after an offline production reload; all three previews produce sound, the selected voice reads a quote, and Mute silences playback. Timed bubbles also read automatically offline. All 35 thoughts remain available without external requests.
- `npm run test:voice-assets`: all 108 mono 32 kHz MP3s are distinct, non-silent and decode successfully; maximum measured peak is 0.589.
- Voice-picker accessibility and reflow pass at 320, 390 and 768 pixels. The earlier full accessibility baseline is 15 app flows and 13 axe scans; the compact toolbar also passes focused accessibility and touch-target checks.

Automated playback and asset checks passed. Listening on physical iPhones and testing with the intended users remain part of TestFlight QA; automated checks cannot assess their voice preferences.
