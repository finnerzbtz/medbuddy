# Sensory bonsai · September 7, 2026

**A little green** replaces the entire Bloom Burst game. Open Garden → Tend the
bonsai or tap the installed bonsai. Blobby still walks to the tree first; reduced
motion and still-image modes skip the approach. The activity stays open until
Back to room or Escape. Nothing expires, fails or demands a finish.

## Interaction

- **Rain:** press and drag across the foliage. Nearby leaves gather larger, highlighted beads;
  a fuller shower falls into small splashes and ripples that settle after release.
- **Breeze:** move the mouse across the foliage without holding a button, or
  drag a finger. Connected canopy clusters sway in the brushing direction, with
  individual leaf flutter and soft wind trails. Water beads detach from the leaves
  and arc in the brushing direction, clearing wetness locally. Reduced motion
  also clears beads but omits airborne water and foliage movement.
- **Shower the tree / Brush the tree:** one press performs a gentle sweep.
  The same button becomes Stop. Dragging and holding are optional.
- **Keyboard:** Tab to the tree, arrows position the tool, Space toggles it.
  Shift + arrows gives finer movement. Leaving the canvas stops keyboard input.
- **Clear droplets:** clears wetness and restores the tree's resting state.
- **Sound / Music:** follow the existing opt-in audio preferences. Effects use
  locally generated, filtered rain/leaf textures; music uses the bundled zen
  track. No remote generation, new key or runtime request is needed.

Pause, window blur and app hiding stop all held input and the automatic sweep.
Returning never restarts a held action. Reduced motion keeps water-bead feedback
but immediately removes existing particles and settles the leaves. The labelled
modal contains focus and returns it to the launcher on exit.

## Runtime and data

The canvas uses a cached backdrop, five connected canopy springs, 240 individual leaves, at most 180 drops (rain, detached beads and splashes combined) and
36 ripples. Delta time is capped, springs are bounded, pixel density is capped at
2 and the canvas at 1.6 million pixels. The render loop stops when the scene
settles and suspends while paused or hidden; the underlying 3D room stays frozen.
Audio fades on release and its dedicated context closes when muted or unmounted.
No new bitmap, GLB, video or downloaded audio asset is added.

All garden state is temporary. There are no points, rounds, inventory costs,
friendship rewards or medication changes. Save format and backup compatibility
are preserved, including the unused legacy `relaxedGarden` preference.

## Verification

- `npm run test:unit`: moisture locality, bounded springs, particle cleanup,
  resting state and switching into reduced motion during interaction.
- `npm run test:garden`: real approach, mouse/touch/keyboard, one-press sweep,
  pause/blur, optional audio cleanup, reduced motion, data preservation,
  interruption/focus restoration and 320/390/landscape layouts.
- `npm run test:accessibility`: keyboard flows and 320×256 reflow, plus automated
  accessibility scans. Automated results are not a conformance certification.
- `npm run test:polish`: existing camera/outfit/approach regression coverage.

Browser captures and reports: `rebuild/generated/qa-sensory-bonsai/`.
Touch is simulated in browser checks; physical iPhone sensory/audio and
VoiceOver feedback remain part of the pre-distribution device review.

September 7 breeze correction: tests now assert visible canopy displacement and
continued swaying under stationary input, rather than comparing snapshots that
could differ only because of the cursor. They cover hover exit, touch release,
one-press brushing, changing direction and reduced-motion feedback.
