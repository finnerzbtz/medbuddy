# Reminduh MVP development guide

## Release scope

This is the user-selected **one-device MVP**: a responsive React application that
stores a person's routine in their browser. It supports real setup, scheduling,
check-ins and history around the rebuilt Blender scene. No fabricated medications,
dose history or initial streak is added.

The earlier Expo/cloud/video roadmap is retained under `docs/plans` as project
history. Those documents do not define this release's completion criteria.
The current checklist is `docs/mvp/acceptance.md`.

## Start and build

```sh
npm ci
npm run dev -- --port 5177
# http://127.0.0.1:5177
npm run build
npm run preview -- --host 127.0.0.1 --port 4177
# http://127.0.0.1:4177
```

Node.js 22 LTS is recommended. This environment also ran the checks successfully
with Node 20.17.0. Blender 5.0.1 is needed only to regenerate 3D assets.

The build type-checks the application, generates Vite output and writes a service
worker containing a versioned list of local assets. It precaches the app, icons,
all route bundles, GLBs and previews. Development mode omits the worker to keep
hot reload free of stale caches. In production, the initial installation needs an
online visit. Use HTTPS outside localhost for service workers and installation.

The worker caches application files, not user records. It waits for existing tabs
to close before activating an update, avoiding a mixture of old pages and new
bundles. Profile reports offline readiness. Cache and browser data remain subject
to browser storage policies; an exported backup is the portable copy of user data.

Implementation references:
[MDN offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
and [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Product flows

- **Welcome:** optional first name and companion name, followed by medication setup
  or exploration without adding a medication.
- **Today:** current schedule, recorded progress, upcoming dose and a compact reminder
  status link. On phones, Blobby appears above check-ins, followed by daily care. The room uses one action
  dock, short interaction reactions and a compact daily-care row. Repeated taglines
  and the persistent room speech overlay have been removed.
- **Medications:** daily or selected weekdays, one to eight unique times,
  optional future start date, separate strength per tablet (mg) and tablets per dose,
  user-entered instructions, supply and archive.
- **Check-in dialog:** taken or skipped, optional note, correction, remove/undo and
  a ten-minute snooze. It is keyboard accessible and returns focus on dismissal.
- **History:** month calendar, per-day detail, medication filter, recorded-at time,
  edits and CSV export. Missing records are labelled “Not recorded”.
- **My Blobby:** profile names, owned outfits and a link to the shop, room pieces, accessibility,
  reminder controls, backup export/restore and deliberate reset.
- **Asset studio:** `/studio` keeps the full developer inspection workflow, including
  all nineteen animation clips, wireframe and live rendering counters.

Check-ins confirm what the person says they already did. They do not prove
ingestion, calculate doses, recommend catch-up doses or infer adherence from the
absence of a record. Blobby’s fictional moods respond to unrecorded check-ins; they are not an assessment of the person’s health.

## Scheduling and records

`src/domain/schedule.ts` contains local-calendar logic. Dates use YYYY-MM-DD,
times use HH:mm, and weekdays use JavaScript's 0–6 convention (Sunday = 0).
Date arithmetic uses local calendar fields rather than adding 24-hour millisecond
blocks, so daylight-saving days do not shift the selected calendar date.

Medication schedules are revisions with an effective date. New medications begin
on the entered date. For existing medications, changed times/days begin tomorrow,
or the original future start date if that is later. This keeps today's dose slots
unchanged after an earlier dose has been recorded. Names, strength, tablet count and instructions update
on the medication immediately; already recorded doses retain their snapshots.

Pause/archive cancels unrecorded doses from today, while retaining earlier
schedules and all dose records. Resume restores the applicable schedule, keeping
future revisions and future starts. Archive is reversible through the Archived tab.

Every occurrence has one stable key: `medicationId@YYYY-MM-DD@HH:mm`. Recording the
same occurrence again updates its record rather than creating an extra one.
Records contain the scheduled date/time, name/dose/instruction snapshot, status,
note and recording timestamp. Past check-ins may be corrected. Future-day records
are refused; early check-ins today show an explicit notice before confirmation.

The schedule refreshes every 15 seconds and when the window regains focus or
visibility. A check-in streak counts consecutive local days containing at least
one taken or skipped record. Multiple doses on one day cannot inflate the streak.
An incomplete current day preserves yesterday's streak until the day changes.

Supply is measured in **complete scheduled doses**, not tablets or milligrams.
Taken records deduct one; skipped records do not. Undo restores consumption after
the current stock baseline. Entering a new current supply establishes a fresh
baseline, so correcting an old record from before a refill does not alter the
newly counted stock. Editing a name or schedule does not reset that baseline.

New medication entries require positive numeric strength in mg per tablet and a
positive tablet count per dose; both accept decimal values. Dose labels show both
values without calculating or suggesting a dose. Recorded check-ins keep their
original strength/count snapshot. JSON backups preserve these fields and CSV
exports have separate columns for them. Existing version 1 free-text doses still
load unchanged: the edit form shows the previous text and asks the user to enter
both values, without guessing either one.

## Room, sleep and local time

The gardening shelf, tea table and low bed have separate sightlines. The watering
can sits above the table on the shortened shelf; the lamp has a bedside stand.
Room anchors are exported by Blender in `scene-contract.json` and used by the
walking controller. The shifted tea table and cup share `tea-motion.json`.

Use the bed icon or click the bed to put Blobby to sleep. Blobby walks over, climbs
in and settles under a fitted cover using the native rest clip. Sleep stays active
until Wake, another interaction or a check-in; waking includes a stand-up beat
before walking away. Sleep is a session activity and changes no medication data.
Reduced motion shows the settled pose immediately. Bed visibility also controls
the cover and disables the bed button.

`src/domain/environment.ts` interpolates local device time through night, dawn,
day and dusk. Dawn starts at 05:30, full daylight at 09:00, sunset colours at
17:00 and night at 21:00. These are fixed clock transitions, not location-based
sunrise calculations. The room updates every 15 seconds and on focus/visibility
return, including while animation is paused. Night reveals a crescent moon and
stars and lowers the room lighting. Moonlight keeps objects visible with the lamp off.

Click the lamp or its header button to switch it. The emissive globe and point
light change together. `preferences.lampOn` persists locally and through backup;
older backups default to on. Hiding the lamp removes its light. Day/night needs
no permission, network access or location. Still-image mode uses the rendered
room preview rather than animated lighting.

## Blobby’s care loop

The home scene starts with a clear view of the whole room, with an optional close-up. Blobby
cycles through curious looks, stretches, waves and visits to the room’s objects when content.
Clicking Blobby or Cuddle gives affection; Play starts a dance. Feeding shows a
snack and a chewing animation. All 19 actions are authored in the Blender rig.
The in-room walking controller routes the parent group around the tea table, steps
off the cushion and returns home without changing rig bones. Activities can be
interrupted from Blobby’s current position. The camera pans at a fixed viewing
angle and a steady walking zoom, using a small dead zone and damped springs. The whole-room
toggle eases between two framing sizes without zooming at every walking stop.

The main care-button group includes **Tea, Garden, Window and Ball** alongside
Feed, Cuddle, Play and Look. Full activity names
remain available to assistive technology. There is no separate Explore section
or tummy subtitle.
The objects themselves are clickable; the bed starts sleep and the lamp toggles its light.
Blobby plays with a ball and watches a fluttering butterfly.

Tea stays in 3D: Blobby walks to the table, reaches for the hollow ceramic cup,
turns toward the viewer, blows across it, takes two sips, then returns it to its
saucer and walks home. The 8-second Blender clip and prop use the same
`src/domain/tea-motion.json` timeline, sampled by `src/domain/tea.ts`; the cup
is attached mathematically to the character placement while held, so its motion
does not lag behind the baked arm grips. The saucer stays on the table.
The close-up moves gently from a 3.8 m to 2.4 m frame while holding a constant
viewing direction. The whole-room toggle retains its 5.65 m frame. Pause and
hidden tabs freeze the rig, prop and clock together; interruptions ease the cup
back onto the table. Reduced motion uses a held-cup still with a short timeout.
Tea and gardening both let the animated scene own completion; navigation clears
an unfinished completion lock.

Bonsai tending walks Blobby to the real plant before opening **A little green**,
an open-ended sensory garden in a full-screen 2D canvas. Drag or touch the leaves
with Rain to leave water beads, or Breeze to gently bend the foliage. There are
no targets, timers, scores, rounds or rewards. One-press Shower/Brush controls
sweep the tree and stop on their own. Arrow keys move the tool; Space toggles it.

`src/domain/garden.ts` owns the bounded leaf springs, wetness, droplets and
ripples. `GardenCutscene.tsx` manages the dialog, inputs and focus;
`bonsai/BonsaiRenderer.ts` caches the backdrop and only renders while input or
settling needs it. `bonsai/BonsaiAudio.ts` supplies optional local rain and leaf
textures. The existing music control plays the bundled zen track. Reduced motion
keeps wet-leaf feedback without moving leaves or falling particles. Pause, blur,
visibility changes, cancelled touches and exit release input and stop audio.

The Garden button and bonsai object deliberately launch the activity.
Autonomous idle actions never open it. The 3D room remains frozen at the bonsai
until Back to room or Escape; navigation also releases its completion lock.
Session state is discarded on exit. The legacy `relaxedGarden` preference is
retained for save compatibility but no longer appears in settings: all bonsai
play is untimed. See [Sensory bonsai](sensory-bonsai.md) for verification and limits.

Moods change Blobby’s colour, effects and a subtle room tint. Local time controls the sky and daylight. Sadness brings a small
rain cloud, feeling poorly adds a cool compress, and rest adds a lap blanket and
sleep symbols. Cuddles send up hearts; happiness brings petals and bonsai blossoms;
celebrations add confetti. Effects use small instanced meshes, with no downloaded
sprites or particle textures. Blender supplies the reusable props and 19 clips.
Travel is faster, with landing squash and volume-preserving stretch.
The ball integrates gravity, impact restitution, friction and rolling in small
fixed steps; it settles on the floor. Camera springs also use bounded substeps.
Reduced motion shows expressive still poses, static mode gives text feedback,
and offscreen tabs stop animating. The renderer caps DPR at 2 and shadows at 2048px.

Food, clothing and room pieces live in the shop at `/shop`. The **Decorate** link opens its Room category. See [Room collection](room-collection.md) for the four slots, six new Blender props and two untimed games. A backward-compatible `market`
field adds 120 starter leaves, a small pantry and ownership of all four original
outfits. There are six foods and seven outfits. Three free apples refresh each
local day independently of medication records. A daily shop gift adds 25 leaves;
the first cuddle and play each day add 5 each. Food gives friendship, not leaves.
Purchased inventory persists; outfit ownership prevents repeat charges.

`catalog.ts` holds stable product IDs, prices and quantities. `market.ts` validates
local leaf transactions and consumes no inventory until the store commits to
localStorage. Recent order IDs make retries idempotent. Backups include inventory,
ownership and the last 200 orders. This is a local economy, not a payment ledger.
See `marketplace.md` for the native billing boundary and remaining purchase work.

Feeding supports pointer capture for mouse, pen and touch, with a real projected
Blobby target. A missed/cancelled drop consumes nothing. Selecting a snack and
pressing its Feed button supports taps, keyboard and screen readers. Feeding
begins in place. `feeding-motion.json` is shared by Blender arm poses and the
runtime snack: reach, two bites, chew, delight and settle over six seconds. The
scene owns completion, pausing respects motion settings, and static mode retains
text feedback. Medication records remain independent of shopping and feeding.

Live mood looks at unrecorded scheduled occurrences in the last seven days for
currently active medications. There is a 2-hour grace period, followed by “Missing
you”; after 24 hours it is “Feeling poorly”, and after 72 hours “Needs extra care”.
These are fictional companion states. A new taken or skipped check-in gives a
fresh start, excluding older gaps from the mood calculation. Paused or archived
routines do not make Blobby sad. Medication advice and record semantics are unchanged.

The **Cheat codes** bar accepts `/happy`, `/sad`, `/poorly`, `/feed`, `/cuddle`,
`/dance`, `/walk`, `/sleep`, `/curious`, `/stretch`, `/tea`, `/garden`, `/ball`,
`/window` and the other displayed states.
`/reset` or Back to live exits preview. Preview never changes records, treats or
friendship, is not persisted, and respects motion settings. Feeding and care exit
preview automatically. Original internal `critical` is labelled “Needs extra care”.

Care data lives alongside medications in the version 1 backup, with a validated
optional `care` field so older backups still load. It stores XP, recent daily
spending/checklists and the last snack/time. Daily records older than 90 days are
pruned on care actions; lifetime care XP is retained. No accounts or services are added.

## Reminders

Browser notifications are opt-in and use generic lock-screen text. My Blobby puts
reminder setup first, with On/Off/Blocked/Unavailable/Needs attention states, the
next pending alert, a test button and permission recovery instructions. Permission
is requested only after an explicit click; the app never enables notifications
as a side effect of snoozing. The test notification has a separate tag and does
not modify medication, care, check-in or delivery records.

`src/domain/reminders.ts` selects due unrecorded doses and computes the later of
the scheduled time and an explicit snooze. A snooze can cross local midnight;
unsnoozed old doses do not generate a backlog of alerts. Paused/archived schedules
are excluded. The runtime re-reads storage inside a Web Lock to avoid simultaneous
notifications from tabs where that API is available. Without Web Locks, persistent
acknowledgements still prevent repeats on reload, but simultaneous tabs have only
best-effort deduplication.

An occurrence is acknowledged only after `showNotification()` resolves (or the
desktop fallback emits `show`). Failed alerts remain eligible and retry after 60
seconds while the app is running, with an inline error instead of repeated toasts.
Acknowledging a slow OS response cannot overwrite a newer snooze or a check-in.
Turning alerts off or completing/snoozing all due check-ins withdraws the old alert
where supported. A later alert may notify again when replacing the previous tag.
Notification clicks open `/#check-ins`; recording a dose always requires the
user's explicit action in the app. The OS may still suppress an accepted alert,
for example during Focus mode: the test explains how to check device settings.

These are **open-app reminders**. There is no push server or native background
scheduler. Browsers can suspend or throttle tabs, so closed-app or precise
background delivery is not promised. Permission denied/unsupported states have
explanations and a calendar alternative. See
[MDN Notifications API usage](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API),
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) and
[service-worker notifications](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

Calendar export creates iCalendar events with local floating times, weekday
recurrence and display alarms. Current and future schedule revisions have separate
non-overlapping date ranges. Already elapsed times today are excluded. Import
the file into a calendar and confirm alerts there. Exports are snapshots; the app
cannot update or remove imported events after a schedule change. Replace the old
calendar reminders rather than importing duplicate copies. Calendar event text
contains the user-entered medication details.

Format reference: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

## Local data and recovery

The store is in `src/stores/appStore.ts`, with schema/backup validation in
`src/domain/storage.ts`. The key is `reminduh-mvp-v1`. The earlier prototype's
`reminduh-app-store` key is left untouched; sample medications and invented streak
values are not silently migrated into real history.

All mutations write to storage before updating the visible state. Storage failure
returns an error and a persistent notice instead of pretending that a change was
saved. Invalid stored JSON is preserved for recovery. Profile can download that
original content or restore a known-good backup.

The store rereads saved data before mutations and refreshes on storage events,
visibility and focus. Cross-tab changes are detected by content, including two
changes with the same timestamp. This is local browser persistence, not a cloud
database or a distributed conflict-resolution system.

Backups contain a schema-versioned snapshot. Restore validates structure, IDs,
times, dates, limits, references and allowed asset names before replacement.
Unknown fields are discarded. Unsupported or malformed backups leave current
data untouched. Restore and reset require explicit in-app confirmation.
Restoring disables reminders until the user enables them again.

Limits: 300 medication entries including archives, 8 times per schedule, 50,000
records on backup import, and 10 MB backup files. Browser quota may be reached
before those limits. JSON backups include health-related information in plain
text; the Profile screen tells the user to keep them private. CSV export quotes
values and neutralises spreadsheet formula prefixes.

## Graphics and performance

The GLB collection is **3,010,028 bytes (3.01 MB)**. Characters share one
nine-bone rig and 19 clips across seven outfits; per-outfit character draw calls
range from 5 to 9. Rendering caps device pixel ratio and shadow resolution, uses
local lighting, pauses when the page is hidden, and respects reduced motion.
The app and scene are separate bundles, so forms do not require the 3D code to
finish loading. A still image covers loading and unavailable/disabled 3D.

The original editable Blender sources, procedural scripts and optimisation checks
remain under `rebuild`. See `rebuild/README.md`. Current runtime assets are real
files under `public/assets-v2`; the old model directory is archived outside public.

## Verification

```sh
npx playwright install chromium
npm run build
npm run format:check
npm run test:unit
npm run test:e2e
npm run test:companion
npm run test:room
npm run test:environment
npm run test:polish
npm run test:garden
npm run test:tea
npm run test:reminders
npm run test:accessibility
npm audit
npm run assets:check
npm run assets:test
```

- Room environment checks cover local-time transitions, lamp persistence and clicks,
  sleep/wake travel, reduced motion, hidden furniture and narrow screens.
- Domain checks cover IDs, duplicate writes, stock correction/refill baselines,
  schedule revisions, archive, weekday and daylight-saving date arithmetic,
  midnight/streak behavior, backup validation, quota/corruption handling, CSV
  injection defence and calendar revision boundaries.
- Browser checks exercise onboarding through real UI, check-ins and correction,
  persistence, profile/scene preferences, reminder opt-in and snooze with mocked
  OS notifications, calendar filtering/exports, invalid backup rejection,
  reset/restore, date rollover, same-device tab refresh and responsive pages.
- The responsive checks inspect screenshot pixel variation to verify that the
  paused/reduced-motion 3D scene actually renders after loading.
- Companion checks cover all preview states, actual walking, pause, persistent feeding,
  daily bonuses, responsive controls and accessibility modes.
- Room checks cover activity arrivals, animated prop positions, mood colours, direct
  canvas clicks, camera framing, hidden furniture and reduced-motion destinations.
- Polish checks follow full room tours in real time, check constant camera angle/zoom,
  game completion/skip/replay/interruption, motion preferences and rear raincoat
  coverage. They save front, side and rear views across four rig poses.
- The production test loads online, disconnects the browser, reloads, records a
  dose and feeds Blobby offline, reloads again and verifies care data and history.
- Tea checks observe the complete journey, both hand grips, two sips, return to
  the saucer, constant camera angle, interruption, replay, four outfits, pause,
  hidden tabs, reduced motion, navigation and unified controls at four widths.
- Focused reminder checks cover explicit opt-in, failure/retry, test isolation,
  private text, duplicate delivery, concurrent tabs, changing permissions,
  midnight snooze, unavailable browsers and calendar/setup navigation. Production
  checks use the real service worker with a mocked OS notification boundary,
  including failure recovery, stale alert cleanup, click routing and offline use.
- Existing asset checks verify rig, geometry, skin weights, budgets and 76
  outfit/animation combinations.

`test:e2e` starts development/preview servers if absent, then closes only those it
started. An existing local server is left running. Override `MVP_TEST_URL`,
`MVP_PRODUCTION_URL` and `MVP_TEST_OUT` if needed. Browser evidence defaults to
`rebuild/generated/qa-mvp`; domain evidence goes to `rebuild/generated/tests`.
Tests use fresh browser contexts and never edit the user's browsing profile.
Asset browser checks require the development server at `ASSET_TEST_URL`
(default `http://127.0.0.1:5177`).

Checks were performed with Chromium on this Mac. Real iOS/Android installation,
OS notification permissions and performance should be verified on chosen target
devices before distributing a release to users. There is no deployment or app
store submission in this MVP handoff.

Garden-game checks cover arrival before reveal, input-dependent water, connected
water/spout motion, different earned scores, real touchscreen input, keyboard
holds, pause/hidden-tab/cancel handling, cap/reset, reduced motion, interruption
cleanup and seven outfits across five viewport layouts.

## Accessibility and comfort (September 2026)

The technical target is WCAG 2.2 AA, with additional cognitive-accessibility
features. This is not a declaration of full conformance or legal certification.
See `docs/mvp/accessibility.md` for scope, evidence and remaining review work.

`/help` is available before onboarding and from every app page. It explains
check-ins, reminders, keyboard controls, local data, and accessibility status.
My Blobby → Accessibility & comfort contains the same settings. Calm settings
atomically enables reduced motion, room pause, gentle moods, hidden rewards and
untimed play. Individual preferences remain editable and survive local reloads
and backup restore. Old version-1 backups default only untimed play to on; existing
mood/reward behaviour is preserved until changed. Invalid preference types are
rejected rather than silently coerced.

Room pause is always visible. It freezes animation while real-time daylight and
lamp controls remain usable. Both device and app reduced-motion preferences apply
to CSS, 3D and the garden. Gentle moods removes missing-check-in sadness while
retaining the factual dose CTA. Hidden rewards removes streaks, friendship bars,
daily care goals and game/feed score text; it never modifies stored history or XP.

Messages stay until dismissed or replaced, with a stable polite live region.
Route changes focus the main content and update the page title. Hash links focus
the destination section. Medication errors provide a focused summary linked to
the affected field. Time add/remove controls and skip confirmation manage focus.
Dose buttons include strength/count in their accessible names. The History
calendar uses one tab stop, arrow keys, Home/End, and explicit selection.
Studio camera buttons provide alternatives to dragging and scrolling.

`npm run test:accessibility` runs fresh-context keyboard/comfort/reflow checks,
then axe-core scans of the main pages, dialogs, game and studio. Axe results include
incomplete checks for human review. It does not test every WCAG criterion and
must not be used alone to claim accessibility conformance. Do not replace real
screen-reader and neurodivergent-user testing with an automated score.

Dependency security patches include React Router 7 and sharp 0.35.4. Onboarding's
redirect is coordinated with its saved setup destination, including the production
offline path. React development effect replay no longer cancels a game selected
before the scene has loaded. Assets and Blender sources are unchanged by this pass.


## Dose celebration (2026-09-06)

New successful taken and skipped check-ins create one transient visual event.
A 4.2-second, silent, screen-wide celebration reuses the Blender character and
selected outfit, with a front-facing cheer, pastel confetti and soft rings.
The last scheduled check-in of the current day says “All checked in!”;
historical records never claim that today is complete. The room also celebrates.

The visual is decorative: the persistent polite confirmation owns record status,
completion wording and Undo. It never moves focus or intercepts clicks. Any next
pointer, keyboard or wheel action dismisses it while continuing that action.
OS/in-app reduced motion, paused/still scenes and hidden rewards suppress it.
Tab hiding and navigation clear it. The nonanimated success seal remains usable
if the 3D asset fails to load. No new GLB or texture payload was added.

The event is emitted only after a successful storage write and a genuinely new
record, decided against the latest saved data. Duplicate confirmations, note
edits, status corrections, reloads and cross-tab syncs do not replay it. Undo
cancels the relevant event. Medication supply and the shop economy are unchanged.
Cheat codes includes “Preview check-in celebration”, explicitly labelled as a
preview and leaving all saved data untouched.

Run `npm run test:celebration` for focused desktop/mobile, keyboard, motion,
responsive, history and automated accessibility checks. Data-integrity cases
are included in `npm run test:unit`.
