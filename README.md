# Reminduh

A working medication check-in app with Blobby, the Blender-built companion.
The app works offline, with optional email sign-in and cloud sync across devices.

## Run locally

Use Node.js 22 LTS (recommended) and npm:

```sh
npm ci
npm run dev -- --port 5177
```

Open **http://127.0.0.1:5177**. The asset studio remains at **/studio**.

For the installable, offline-capable production build:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4177
```

Open **http://127.0.0.1:4177** and let the first load finish while online.
Profile shows when offline access is ready. Install with the browser's app-install
or Add to Home Screen option when available.

Use a consistent address: browser storage belongs to an origin, so localhost,
127.0.0.1, and different ports have separate data. Export/restore a backup to move
a routine between them.

## Included

- Welcome and personalisation with an empty, real schedule.
- Offline medication-name autocomplete with spelling support, previously used names, and keyboard/touch controls; free entry remains available.
- Medication creation and editing, selected weekdays, multiple daily times,
  future start dates, supply tracking, pause/resume and archive/restore.
- Explicit taken/skipped check-ins, notes, correction/undo, snooze and duplicate protection.
- A bigger dose celebration with a 3D Blobby cheer, confetti, final-check-in milestone and persistent Undo; reduced-motion and calm settings are respected.
- Calendar history, day-based check-in streaks, filtering and CSV export.
- Blobby outfits, a full-screen Bloom Burst watering game, an interactive room, 19 expressive animations and automatic check-in moods.
- A 3D tea break with two-handed pickup, two sips, steam and a closer camera.
- A softer room panel, one care/activity dock and concise pages. Blobby appears above check-ins on mobile.
- Three interactive pours inside the 2D garden scene, blossom scores, touch/keyboard
  controls, a tap alternative, reduced motion and replay.
- Drag-to-feed with touch and keyboard alternatives, six snacks, free daily apples, and a food/clothing shop using earned leaves.
- Seven Blender outfits with try-on previews and persistent ownership; real-money billing is not enabled.
- A room shop with four customisable areas, a freeform sensory sand garden and melody game, animated lava and mushroom lamps, and coastal/alpine window views.
- Free cuddles/play, friendship levels, daily rituals and a state-preview cheat bar.
- Reduced motion, a still-image mode and local care persistence.
- Optional open-app reminders with live status, a test button, failed-delivery retries,
  duplicate protection, midnight snoozing and calendar exports for outside the app.
- Local backups, validated restore, storage-error handling and explicit reset.
- Offline production app and assets, with no remote fonts or analytics.

Browser reminders do not wake a closed app. Import the calendar export and verify
alerts in your calendar for reminders outside Reminduh. Dose records are
self-reported; there is no camera or AI verification or dose advice.

## Accounts and cloud sync

Open **My Blobby → Account** to sign in with an email code. Existing device data
is uploaded only after you enable cloud sync. The London backend has separate
development and production branches, private access controls and versioned migrations.
See [backend setup and verification](docs/backend/Auth-and-Sync.md) for configuration,
account deletion, conflict handling and release checks. Run `npm run test:cloud`
against the development branch to test real authentication and database operations.

## Verify

```sh
npx playwright install chromium
npm run build
npm test
npm run assets:check
npm run assets:test
```

The MVP browser test starts local test servers if required and closes only servers
it starts. It uses isolated browser contexts, not your saved app data.
The asset browser test expects the development server on port 5177.

See [the MVP guide](docs/mvp/development.md) for data conventions, test coverage,
reminder limitations and release details. See [the Blender guide](rebuild/README.md)
for editable sources, export scripts and asset budgets.

## iPhone / TestFlight

The iOS app is in `ios/App/App.xcodeproj` (scheme `Reminduh`). It uses native device reminders, durable local storage and the iPhone backup share sheet. Start with `npm run ios:simulator`; see [TestFlight preparation](docs/ios/TestFlight.md) for signing, beta metadata, device testing and the reminder queue limits. Node 22+ is required for the native toolchain.
