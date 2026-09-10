# Reminduh asset development guide

The asset library is rebuilt in Blender from editable surfaces and primitives:
Blobby, seven looks, a furnished room, six modular room collectibles and nineteen animation clips. The original
approved base character is retained in `rebuild/blender/blobby.blend`.

The rebuilt scene is integrated into the home page. `/studio` provides outfit
switching, animation playback, room and character views, orbit controls,
wireframe inspection, furniture visibility controls and asset downloads.
The one-device app now supports medication setup, check-ins, history, reminders
and backups. See `docs/mvp/development.md` for the complete MVP workflow.

## Run the application

From the repository root, with Node.js 22 or newer:

```sh
npm ci
npm run dev -- --port 5177
```

Open `http://localhost:5177/studio`. Run `npm run build` for the production build.
Blender is required only to regenerate source assets; the application uses the
included exports directly. The app uses local fonts; 3D models, materials,
lighting environment and decoder dependencies require no external downloads.

## Files to work with

| Location | Purpose |
| --- | --- |
| `rebuild/blender/blobby.blend` | Approved base character, editable cages and nine-bone rig |
| `rebuild/generated/wardrobe.blend` | Seven complete looks, shared skeleton and nineteen clips |
| `rebuild/generated/room.blend` | Assembled room, editable furniture, lights and character |
| `rebuild/generated/room-collection.blend` | Modular Zen garden, turntable, lava/mushroom lamps and coastal/alpine views |
| `rebuild/blender/*.py` | Procedural source and export helpers |
| `rebuild/generated/*-raw.glb` | Intermediate exports; never served by the application |
| `public/assets-v2/` | Optimised GLBs, small WebP previews and JSON contracts |
| `src/generated/assets.ts` | Generated typed contract, metrics and content hashes |
| `src/components/scene/AssetScene.tsx` | Shared Three.js renderer for home and studio |
| `rebuild/scripts/` | Build, optimisation, validation and browser checks |

The supplied source bundle preserves this directory structure and includes a
runnable application snapshot. Generated `.blend` files are included in the
bundle; they can also be recreated in a checkout. Legacy models were moved to
`rebuild/legacy/models` in the working project and are excluded from the bundle
and application build. Original reference assets are retained in the project.

See `docs/mvp/room-collection.md` for collectible slots, native collection controls, runtime motion tags and the 319 KB texture-free add-on pack.

## Edit in Blender

Use Blender 5.0 or newer; the files and pipeline were verified in Blender 5.0.1.
Open `room.blend` for the full composition or `wardrobe.blend` for character work.
Select **Blobby_Rig**, then **Object Properties → Custom Properties → Outfit**:

| Value | Look |
| --- | --- |
| 0 | Base |
| 1 | Round glasses and straw hat |
| 2 | Oatmeal sweater and straw hat |
| 3 | Yellow raincoat and boots |
| 4 | Froggy bonnet and bow |
| 5 | Stargazer nightcap and scarf |
| 6 | Strawberry beret and apron |

Visibility drivers switch the pieces together. Source objects remain separate
and editable; temporary export copies are merged by material and visibility
group. Knit and straw normal textures are packed into the files.

In the NLA editor, unmute exactly one animation track to preview it. See the
`READ ME` text blocks inside the Blender files for controls. Save manual edits
under a new filename before regenerating: the build scripts overwrite their
generated files. For repeatable changes, update the Python source or approved
base `.blend` before running the pipeline.

## Rebuild and check

```sh
# Regenerate wardrobe and room, render previews, optimise and validate.
npm run assets:build -- --render

# Faster regeneration without new thumbnails.
npm run assets:build

# Reprocess existing raw exports, then check contracts and budgets.
npm run assets:optimize
npm run assets:check

# With the development server running on port 5177:
npm run assets:test
```

On macOS, the pipeline uses `/Applications/Blender.app/Contents/MacOS/Blender`.
Elsewhere it uses `blender` on PATH. Override it with `BLENDER_BIN` when needed.
`ASSET_TEST_URL` selects another running server. `ASSET_TEST_OUT` chooses the
browser evidence directory, which defaults to `rebuild/generated/qa`.
Install the Playwright browser with `npx playwright install chromium` if absent.
The browser suite runs against the development server because it inspects
development-only scene handles.

The pipeline begins with the approved base `.blend`, builds the wardrobe, then
the room, then both optimised exports. To reconstruct the base from first
principles as well, run this before `assets:build`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python rebuild/blender/build_blobby.py -- --render
```

## Runtime contract

- Blender uses metres, Z up and front -Y; the base character's feet are at Z=0.
- GLB uses Y up and front +Z. The character is approximately 2.02 m tall before
  scaling. The contract scale is 0.5; the home view and native room composition use
  0.61 for a closer companion. The cushion anchor is `[0.76, 0.35, 0.39]`.
- Place the character through a parent group. Animated bones belong to the mixer.
- One character GLB contains all seven looks and one nine-bone skin. Select a look
  by toggling nodes whose `extras.variants` is `all` or contains the outfit name.
  A generic GLB viewer may display every outfit until this visibility rule is
  applied; Blender sources and the included application handle it automatically.
- Use one AnimationMixer for a character instance. The included runtime blends
  clip changes, clones skeletons correctly and shares the loaded source asset.
- `scene-contract.json` defines placement anchors, camera, groups and clip names.
  Room groups are Architecture, Tatami, Bonsai, Tea_table, Books, Cushion, Lamp,
  Shelf, Garden, Toy_ball, Tea_cup, Bonsai_leaves, Watering_can and Blanket.
  Use `extras.asset_group` as the stable identifier; Blender may suffix object names. Source cameras, lights and cutter geometry are excluded.
- The renderer uses a locally generated lighting environment, capped pixel ratio,
  2048px shadow map and demand rendering when paused. It pauses while the page is
  hidden, and home animation respects the reduced-motion preference.
- Generated content hashes invalidate the GLB cache when exports change.

| Clip | Duration |
| --- | --- |
| idle | 4 s |
| wave | 3 s |
| happy | 3 s |
| celebrating | 4 s |
| worried | 4 s |
| sick | 4 s |
| critical | 4 s |
| recovering | 4 s |
| walk_to_cushion | 2 s |
| rest | 4 s |
| feeding | 4 s |
| petting | 3 s |
| dance | 4 s |
| curious | 4 s |
| stretch | 4 s |
| tea | 8 s |
| tend | 4 s |
| ball | 3 s |
| window | 4 s |

All clips loop continuously. `walk_to_cushion` is an **in-place walk cycle**;
the home scene supplies a path controller in `src/domain/choreography.ts`.
`RoomLife.tsx` animates reusable prop pivots and instanced mood effects.
`GardenCutscene.tsx` and `GardenArtwork.tsx` supply the arrival-triggered, full-screen
Bloom Burst watering game. Its input state, three target zones and blossom scores
live in `src/domain/garden.ts`; the studio’s
`tend` clip remains a standalone rig gesture. Camera and ball springs are in
`src/domain/motion.ts`. The raincoat has a closed rear hood pole, additional rear
clearance and an overlapping collar that dips below the face at the front. Tea uses `src/domain/tea-motion.json` as the shared source for the native arm
keys, facing direction, cup pickup, two sips and placement. The real hollow cup
moves with the character; the saucer remains in the table group. Its clip is
sampled on the room action clock, with no independent prop loop. Tea cups
and leaves inherit the visibility of their parent room items. The lap blanket
is hidden in the native composition and shown for the critical-care pose in the app.
The bed has its own fitted `Bed_cover`; `Window_sun`, `Window_moon` and `Window_stars`
inherit Garden visibility. The local clock controls daylight, and the lamp switch
controls both its material emission and its real point light. Bed, lamp and
watering-can pivots are exported in the scene contract. Mood
animations are visual expressions, not a medical assessment.

## Measured asset budgets

| Export | Bytes | Triangles | Materials |
| --- | ---: | ---: | ---: |
| Characters, including all hidden outfits | 2,390,636 | 90,500 | 17 |
| Room and furniture | 619,392 | 30,620 | 22 |
| Total GLBs | **3,010,028** | **121,120** | |

The total is **3.01 MB** in decimal units, before transport compression. Character
draw calls per visible outfit are base 5, glasses 8, sweater 6, raincoat 6,
frog 8, starlight 7 and strawberry 9;
these exclude room geometry and shadow passes. The room has 43 primitives.
Runtime rendering counters include the active scene and may include extra passes.
These measurements describe assets, not a guaranteed frame rate on every device.

Optimisation welds duplicate vertices, simplifies selected geometry, prunes unused
data, resamples animation and reorders buffers. The approved curved wrap keeps
its topology and character positions retain full precision to avoid visible rim
artifacts. Room positions and selected other attributes use integer quantisation.
Two embedded 256×256 normal textures provide knit and straw detail. No Draco or
Meshopt runtime decoder is required.

Validation enforces finite geometry, normalised skin weights, the shared rig,
continuous clips, embedded texture limits, named groups and file/triangle budgets.
The browser suite passed all 76 outfit/animation combinations, sampled deformed
skin geometry, pause/resume, wireframe, furniture toggles, mobile resizing and
home integration, with no remote model, HDR or decoder requests. The TypeScript
and Vite production build also passed. Physical-device performance tuning remains
appropriate when target devices are chosen.
