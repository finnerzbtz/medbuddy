# One-device MVP — completion checklist

User-selected scope: one device, browser storage, no account or cross-device sync.
The existing native/cloud roadmap is background context, not this release scope.

- [x] Welcome and optional personalisation; empty state contains no sample medication.
- [x] Separate strength (mg per tablet) and tablet-count fields, decimal values, preserved legacy doses and recorded snapshots.
- [x] Medication creation/editing, daily or selected weekdays, multiple times, optional supply tracking, pause/resume and archive.
- [x] Today's local-date schedule, next dose, explicit taken/skipped check-in, optional note, snooze and duplicate protection.
- [x] Durable dose records, correction/undo, honest day-based check-in streak and inventory updates.
- [x] Calendar history, medication filter, recorded vs unrecorded distinction, CSV export.
- [x] Blobby outfit/furniture preferences, 19 expressive states, automatic moods from check-ins, preview cheat bar, feeding, friendship levels and daily care rituals.
- [x] Room navigation, tea/gardening/ball/window activities, interactive props, expressive mood colours/effects and a following camera.
- [x] Arrival-triggered sensory bonsai: open-ended rain and breeze, leaf springs and water beads, optional sound, touch/keyboard/one-press controls, pause and reduced motion.
- [x] Fully 3D tea journey with a shared Blender/cup timeline, two sips, saucer placement, pause/replay and a gentle close-up; unified activity buttons with the tummy footer removed.
- [x] Stable camera framing, closed raincoat back, faster squash-and-stretch motion, bouncing ball physics and a quiet illustrated sensory garden.
- [x] Optional browser notifications with clear open-app limitations; calendar export for external reminders.
- [x] Simple reminder setup, test alert, live permission status, failed-delivery retry, cross-tab coordination, midnight snooze and stale notification cleanup.
- [x] Cleaner page headings, soft room controls, transient speech, compact daily care and Blobby above mobile check-ins, including keyboard order.
- [x] Local backup export/validated restore, cross-tab refresh, visible storage errors, explicit reset.
- [x] Reduced motion, static-scene option, keyboard/focus support, responsive screens and no dead navigation.
- [x] Installable production build, offline app/assets after first load, no remote font dependency.
- [x] Domain tests and browser flows including date rollover, edit history, duplicates, skip/undo, restore rejection and offline reload.
- [x] Updated developer guide, packaged sources, local app running for review.

Manual check-ins are self-reported. No camera or AI claim of medication verification.
Schedules are entered by the user; the app does not calculate doses or give missed-dose advice.

Verified on 2026-09-05: production build and formatting checks pass; 49 domain checks, 17 app browser scenarios, 6 companion browser scenarios, 7 room-interaction scenarios, 5 focused camera/cutscene/outfit scenarios, 6 interactive garden-game scenarios, 6 focused tea/control scenarios, 10 reminder scenarios, 5 production reminder checks and 76 outfit/clip combinations pass. The production preview runs locally on port 4177. Native-device notification delivery is outside this browser MVP verification.


2026-09-06 celebration update: a screen-wide 3D cheer, 64 pastel confetti pieces,
current-outfit rendering and an all-checked-in milestone now accompany new
successful check-ins. Confirmation and Undo persist; motion/comfort preferences
are respected. A labelled cheat-code preview leaves saved data unchanged.
Verified: 69 domain checks, 10 focused celebration scenarios, 6 companion
scenarios and 17 medication/offline browser scenarios. The two focused automated
accessibility scans report no violations; this is not a conformance certification.

## Room collection · September 6, 2026

- [x] Four independently equipped room areas with preview, leaf purchases, owned-item swaps and backward-compatible saves.
- [x] Blender Zen garden, vinyl corner, lava/mushroom lamps and coastal/alpine views in a 319 KB texture-free pack.
- [x] Walk-to-object, pointer/keyboard games, optional sound, reduced motion, static mode, day/night and lamp switching.
- [x] Verified: production build and formatting; 76 domain checks; 8 room-shop/game scenarios; 3 direct-object checks; 3 offline room checks; 17 app scenarios; 9 marketplace/feeding scenarios; 6 tea and 6 original garden scenarios. Room shop and games had zero violations in six automated accessibility scans.

## Simpler room shop · September 6, 2026

Room pieces now have direct action cards and optional centered previews. Buy & use saves payment, ownership and placement together; owned swaps stay free. The daily gift follows the items, and installed status confirms success on the card. Verified: 79 domain checks, 8 room/shop/game scenarios, 9 food/outfit regressions, 3 offline room scenarios, mobile preview rendering, 320–768 px reflow, keyboard focus and automated shop/preview accessibility scans.

## Sensory sand · September 6, 2026

The Zen activity now provides open-ended, textured sand with mouse/touch raking, smoothing, undo, optional movement-responsive sound, keyboard controls and a one-button spiral. Verified: 83 domain checks; 5 focused sensory scenarios including monitored audio output; 8 room/shop/game scenarios; 3 direct-object checks; 3 production offline scenarios; and build/format checks. Sand desktop, mobile and reduced-motion accessibility scans returned no violations. Session-only pattern retention is documented in `sensory-sand.md`.
