# Sensory sand garden

The Zen garden is an open-ended raking space. Blobby walks to the installed Zen garden before it opens; reduced-motion and still-image settings skip that approach. There are no stone objectives, scores, rewards or time limits.

- Click and drag, or drag a finger, to pull a seven-tooth wooden rake through the sand. Fine surface grain and directional shading reveal recessed grooves and the raised sand beside them. New strokes can cross old ones.
- **Smooth** gently flattens the area under the tool. **Undo** reverses a stroke or reset. **Fresh sand** clears the tray and can itself be undone.
- **Sound off/on** controls locally synthesized, filtered granular noise. Sound is off initially. Rake speed changes its level and texture; horizontal position changes its stereo position. Stopping, releasing, cancelling, losing focus or hiding the tab fades sound to silence. Muting or leaving closes the audio context. Volume is adjustable; the sand texture needs no microphone, audio downloads or external service. The adjacent Music button controls optional ambient music; global Sound settings share the effects volume and master mute. See [app audio](app-audio.md).
- **Tools & keyboard** includes tool width, an equivalent one-button spiral, and keyboard instructions. Focus the sand and use the arrow keys to move; Space toggles contact. Tab leaves the canvas, Escape returns to the room, and Command/Ctrl+Z undoes a stroke.
- Reduced motion keeps direct drawing responsive while removing the moving grain particles and cursor easing. The sand and undo history survive viewport changes without stretching. The current garden is retained in memory while this app page is open, including leaving and returning; a full reload starts a fresh garden. Medication, purchases and care data are never changed by raking.

## Implementation

`src/domain/sand.ts` holds a typed-array height field with rake displacement, smoothing and bounded undo history. `SandRenderer.ts` shades only the changed region from surface gradients and deterministic grain. Coalesced pointer samples are retained and consumed as a continuous path. The rake steers by distance travelled, smoothing hand jitter and keeping its heading on reverse passes. Pending work is bounded. The surface is capped at 720,000 cells, a 1,100-pixel long edge and 1.5 pixel density; history is capped at six snapshots and approximately 18 MB. Idle rendering stops after movement and grain particles settle.

`SandGarden.tsx` owns pointer capture, keyboard interaction, responsive sizing and audio lifecycle. `SandAudio.ts` creates the filtered noise, movement envelope and stereo pan using Web Audio. The original Blender room collectible remains unchanged; no new raster textures or audio assets are needed. All code ships in the offline app bundle.

## Verification

`npm run test:unit` checks seven groove positions, untouched sand outside the brush, raised shoulders, depth bounds, smoothing, exact undo, history bounds and proportional resizing. `npm run test:sand` uses an isolated browser to check mouse strokes, touch, keyboard controls, actual audio output, silence at rest, volume/mute, mobile layouts, accessibility scans, session retention and unchanged app data. The existing room suite and offline room suite also exercise the sensory garden and the separate melody game.
