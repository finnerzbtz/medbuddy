# App audio and ElevenLabs authoring

## Listening

Audio starts off for a new installation. Open the speaker button in the top bar, or in a game, and enable audio when ready. The master choice is saved; playback still waits for an interaction when the platform requires one. Music and effects have independent switches and volume controls. Their choices are remembered on this device. The accessibility “Use calm settings” action also mutes audio.

The Zen garden has direct Sound and Music buttons. Raking uses locally synthesized granular noise controlled continuously by movement, so it stays responsive. Rake input now consumes a continuous mouse/touch path and steers over distance; small pointer jitter and reverse passes cannot snap the handle around.

The app ships with a 102.4-second lo-fi instrumental loop and 16 action effects. The walking effect now uses three new variations, bringing the pack to 19 local MP3s and 1,897,751 bytes (about 1.9 MB). The app decodes and plays local MP3s; Web Audio synthesis remains as a fallback for other effects if an asset cannot load. The responsive sand texture and the melody game's notes remain synthesized.

Covered actions: footsteps, ball bounces, food bites, tea sipping and cup contact, cuddling, delight, fabric/outfit changes, furniture placement, lamp switch, water, blooming, check-in celebrations, purchases, settling into bed and a discreet in-app reminder cue. No distressed or punitive sound plays for a missing dose. Native notification audio remains controlled by the browser/device.

Tea and feeding cues read the animation's actual clock, including the two bite markers. Moving, pausing and still-pose jumps cannot replay a backlog of effects. Water follows active pouring. The lo-fi recording uses authored, beat-aligned loop points; its ending never drops into a synth fallback. Pause/resume preserves the musical position. Music is quiet under ordinary app navigation and pauses during the note-matching game. App audio stops while the page is hidden. Browser focus loss also pauses it; the native mixer uses visibility because WKWebView can lose focus without the app entering the background. Old scheduled melody notes are cancelled.

## Lo-fi music replacement — 8 September 2026

“Soft afternoon” replaces the original ambience with warm Rhodes keys, mellow nylon guitar and a soft sustained bass line at 75 BPM. The current arrangement has no drums or percussion. One 128-second instrumental was generated with the approved ElevenLabs Music v2 account. A harmonically matched 32-bar section becomes a 102.4-second loop, blended across one full bar during authoring. Half-second encoder handles surround the loop; `src/generated/music-loop.ts` supplies precise Web Audio loop points, keeping MP3 edge artifacts out of playback. The stereo 128 kbps asset is 1,655,579 bytes, mastered towards −23 LUFS with soft high/low filtering.

The bare-tone music fallback is removed. The record player shows Loading while fetching/decoding, Playing only during actual playback, and a Retry action if the recording is unavailable. A late decode cannot restart muted music. Starts and stops have short gain fades, and resume retains the current musical position. Other effects and the interactive sand and melody instruments retain their existing behavior.

The current drum-free source, fixed prompt, generation provenance, previous master, 24-second seam preview and mastering measurements live in `rebuild/generated/audio/lofi-room-drumless-v2/`. The earlier version with a brushed beat remains archived in `rebuild/generated/audio/lofi-room-v1/`. The replacement was generated from a fixed text prompt; the existing recording was not uploaded for processing. `node scripts/mvp/lofi-music-generate.mjs` prints the plan; `--generate` uses account credits and reuses the completed source, with no automatic retry of uncertain paid requests. `scripts/mvp/lofi-music-master.py` requires Python with NumPy and ffmpeg and re-masters that source without network requests. It checks harmonic matching, encoded seam continuity and one-second audio levels before replacing the public asset. No personal data or credentials are bundled.

`npm run test:music-loop` checks actual Web Audio output across the encoded seam at normal speed, pause/resume, delayed loading followed by mute, and a missing recording without synthesized tones. The regular audio and record-player checks cover opt-in, volumes, effects and personal-playback isolation.

## Cached recording correction — 8 September 2026

The open production app was confirmed requesting the earlier recording (`fb02cd7a815f`) while the drum-free recording (`f98f050a5fec`) waited in a newer service-worker cache. A regular reload still used the active older app. This was verified from the live app's resource requests and SHA-256 of its cached music, rather than inferred from the generation prompt.

Music now uses a content-addressed filename (`soft-afternoon-f98f050a5fec.mp3`) instead of only a query suffix, which the old offline handler ignored. Completed web updates show a small Reload to update / Later notice. Updating explicitly activates the waiting worker and reloads that tab; other tabs retain unfinished work and are offered their own reload. One prior cache remains available for their older code. Saved medication data and preferences are not cleared. The iPhone app continues using its bundled assets without a service worker.

`npm run test:music-update` builds and reproduces the old recording surviving an ordinary reload, then verifies the Update action loads the exact replacement by SHA-256, keeps saved data and another tab's unfinished medication form, and plays the replacement offline. It also checks the update notice at 320 px and with an accessibility scan. No further audio generation was needed for this correction.

## Walking sound replacement — 7 September 2026

The original human/tatami footstep has been replaced with three newly generated plush cartoon paw contacts using the approved ElevenLabs Sound Effects v2 account. These are new source recordings, not alternate processing of the rejected sound. Each lasts 190 ms and is mastered as a quiet, rounded fabric contact, with no pitched oscillator fallback. Consecutive landings cycle through the three recordings with subtle variation in level and playback rate. The sound follows the same 2.6 hops-per-second clock as Blobby’s landing compression, rather than triggering repeatedly for distance travelled. Pauses, stationary frames and skipped animation do not produce catch-up steps.

The three new 32 kHz mono MP3s total 7,044 bytes. Their original generations, prompts and provenance are preserved in `rebuild/generated/audio/plush-steps-v2/`; the rejected original remains in the earlier raw authoring archive. `node scripts/mvp/footsteps-generate.mjs` shows the plan; `--generate` requires owner approval to spend credits, reuses completed requests, and never automatically retries an uncertain request. `--master-only` processes the new recordings without API calls. The main sound-pack generator preserves this replacement set.

## Optional spoken thoughts

Cloud, Moss and Pip were redesigned as original calm cartoon characters with ElevenLabs Voice Design v3 and Eleven v3 on 7 September 2026. Their 108 recordings add 4,303,728 bytes (4.3 MB), including previews and all 35 thoughts in each voice. Choose a voice in Sound settings and enable Read thoughts aloud. Thoughts and reactions share one compact bubble; the bubble has no navigation or source toolbar. Thoughts rotate automatically about once a minute, pausing for narration, hidden bubbles, dialogs and lost focus. Speech has its own volume and temporarily softens music and effects. Turning off Read thoughts aloud stops the current automatic reading and silences future bubbles without changing the chosen voice, music or effects. Quiet and master mute remain available in sound preferences. The complete pack works offline and is bundled into the unsigned iOS archive. See [Blobby’s voice choices](blobby-voices.md) for authoring and verification details.

## Generate the recorded sound pack

Provider: **ElevenLabs**, using `music_v2` and `eleven_text_to_sound_v2`.

1. Create a key with Music and Sound Effects access in the [ElevenLabs dashboard](https://elevenlabs.io/app/settings/api-keys). Music API access requires a paid plan.
2. Put `ELEVENLABS_API_KEY=your-key` in `.env.audio.local` in the project root. This file is ignored by Git. Never use a `VITE_` prefix and never place a key in browser code.
3. `npm run audio:generate` displays the 17-asset plan without sending a request. This is the original 90-second ambience and 16-effect authoring plan. The generator preserves the newer mastered lo-fi and plush-footstep replacements.
4. `npm run audio:generate -- --generate` sends the requests. `--only=zen-music` (or an effect name from the plan) limits the run to one asset. Requests use the account's credits and run sequentially. There are no automatic retries after uncertain paid requests. Existing raw generations are reused on rerun.
5. Use `npm run audio:generate -- --master-only` to re-master existing raw recordings without sending API requests. Short footsteps, bounces and switch clicks are fitted to action beats; a peak limiter and edge fades keep them gentle. Listen to the outputs. Raw MP3s and provenance are kept in `rebuild/generated/audio/`; mastered files are in `public/audio/`. Encoding uses ffmpeg, with controlled loudness, soft edges, stereo music at 128 kbps and mono effects at 96 kbps. The browser asset map contains only URLs and content hashes.
6. Run `npm run build` to include the files in the offline app. No generation key or live AI request is needed by players. No medication, profile or other user data is sent to the audio service; generation uses fixed creative prompts only.

The music terms have a separate category for monetised games distributed on more than one platform (“Studio Games”). Check the appropriate music rights before a commercial multi-platform release; this does not block the local MVP work. [Music API guide](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music/) · [Sound Effects API](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert) · [Music rights](https://elevenlabs.io/eleven-music-model-specific-terms).

## Verification

`npm run test:audio` checks real Web Audio output, all action cues, opt-in, independent volumes, master mute, hidden-page suspension, action-clock timing, three distinct footstep buffers, landing synchronization, quiet output, missing-recording silence, keyboard/focus accessibility, actual rake cursor headings during jitter and reversals, and unchanged app data. `npm run test:sand` retains coverage for drawing, smoothing, undo, touch, keyboard, reduced motion, mobile sizing and sand sound at rest. `npm run test:room-shop` covers room activity integration and the melody game.

## Recorded pack verification — 6 September 2026

All 17 MP3s decode at 44.1 kHz, with stereo music and mono effects. Each file is distinct and non-silent, with measured peak headroom. No extra generations were needed for mastering. The local key file has owner-only permissions and is excluded from Git. The generated asset map contains URLs and hashes only.

## Record player update · 8 September 2026

The record player now supports a local-file listening queue and the built-in radio. Optional native Apple Music is prepared but disabled until Apple setup. Personal playback silences room music, effects and speech; the master mute pauses it. File queues use temporary object URLs, never upload audio and release those URLs on clearing. User/OS reduced motion pauses the vinyl animation. See [Leaves and Music](../ios/Leaves-and-Music.md) for activation and validation limits.

## Floating record-player notes — 8 September 2026

Four small coloured music notes drift and fade above the room turntable and the record-player panel while music is audible. The room shares one small flat vector geometry across four meshes; no textures or additional asset downloads are needed. Visuals follow the decoded radio source or personal playback, rather than just the music preference. Notes disappear on pause, mute, zero music volume or hidden furniture. Reduced motion and room pause use two stationary notes. The panel notes are decorative and do not receive pointer or screen-reader interaction. `npm run test:record-notes` verifies actual 3D positions over time, panel motion, playback and mute, reduced motion, hidden furniture and mobile layout.
