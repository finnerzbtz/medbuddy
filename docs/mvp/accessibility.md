# Reminduh accessibility assessment — 5 September 2026

## Status and scope

**Target: WCAG 2.2 level AA. Status: implemented accessibility improvements,
with automated and keyboard verification; independent conformance and legal
review remain outstanding.** Do not market this MVP as certified or fully compliant.

Scope: the one-device web MVP, Welcome, Today, Medications, medication add/edit,
check-in/skip dialogs, History, My Blobby, backup/reset dialogs, Help, the 3D room,
the sensory bonsai and the developer asset studio. Tests use synthetic data in isolated
Chromium contexts. No user medication records or real notification permissions
are used by the checks. The unchanged native Blender assets retain the existing
asset validation evidence; they were not regenerated for this accessibility pass.

## Implemented

- Readable text contrast throughout the soft palette, stronger input boundaries,
  visible keyboard focus, labelled room controls and larger action targets.
- Browser zoom/reflow, text-spacing overrides, forced-colour styling, and scrollable
  dialogs/game controls. No essential action relies on dragging the room canvas.
- Unique route titles, skip links, route/hash focus, contextual medication action
  names, dose strength and tablet count in accessible names, and keyboard calendar
  navigation. Dialogs contain focus and return it when closed.
- Focused form error summaries link to the control to correct. Adding/removing
  times and moving into skip confirmation preserve keyboard focus.
- Stable live-region confirmation messages with no automatic expiry. Undo remains
  available through the message or by correcting the record in History.
- Visible persisted room pause; reduced motion follows the OS and app preferences
  across CSS, Three.js and the 2D game. Optional still-image mode avoids WebGL.
- Calm preset, optional gentle moods, and hidden scores/streaks. Medication CTAs
  remain factual and available. Fictional moods do not assess health or effort.
- Open-ended sensory bonsai with no scoring or timing. Mouse/touch, keyboard
  toggle controls and one-press showers are available. Reduced motion preserves
  wet-leaf feedback without moving foliage or falling water. Pause and exit are
  always available. Games never gate medication recording.
- Consistent public Help with comfort settings, reminder limitations, local-data
  privacy information and an honest accessibility status.
- Patched dependencies; production onboarding and early garden-launch regressions
  found during verification were fixed.

## Verification and limits

Run `npm run build`, `npm run test:unit`, `npm run test:e2e`,
`npm run test:reminders`, `npm run test:environment`, and
`npm run test:accessibility`. Other scene regressions remain in `npm test`.

Axe scans cover WCAG A/AA rules available in axe-core and best practices. They
cannot determine full WCAG conformance. Reports keep `incomplete` results for
manual assessment. Browser scripts additionally check route/dialog/error focus,
keyboard garden interaction without timing, persistent preferences, live messages,
calendar keys, and reflow at 320, 390 and 768 CSS pixels. Separate visual checks
cover a short 320×256 CSS viewport (equivalent to 400% zoom of 1280×1024), night
colours and the camera alternatives. This is not a substitute for native browser
zoom testing on every supported browser/device.

The bundled verification report records the actual completed run and failures
must be resolved before treating a release as verified. Automated passes are not
proof of successful real-world screen-reader interaction.

## Required before a public compliance claim

1. **Assistive technology testing:** VoiceOver/Safari on macOS and iOS,
   NVDA/Firefox or Chrome on Windows, and TalkBack/Chrome on Android. Check actual
   announcements, form errors, focus order, full modal flows, live status messages,
   native time/date inputs and keyboard/switch use. Confirm usable native 200% and
   400% zoom, system text scaling, text spacing, and high-contrast themes.
2. **Involve people with different access needs:** include neurodivergent people
   with varied attention, sensory, processing and reading preferences. Test setup,
   correcting a mistaken dose, reminders, and finding comfort settings. Check that
   tone, visual effects, reminders, fictional moods and rewards do not create
   unwanted pressure. There is no single neurodivergent preference profile.
3. **Independent WCAG review:** evaluate all applicable success criteria and
   complete processes, including focus obscuration, screen-reader behaviour,
   non-text contrast, pointer cancellation, mobile orientation, flash thresholds
   and error prevention. Assess axe's incomplete checks, not just violations.
4. **Legal/product scope:** no launch jurisdiction, operating entity or regulated
   product classification has been confirmed. Establish those before deciding
   which accessibility, privacy, consumer or health-product laws apply. Confirm
   the intended reminder reliability and any health claims with appropriate
   professional review; this app records user-entered information.
5. **Publish real support and policy details:** provide an actual accessible
   feedback channel, ownership/contact information, a reviewed accessibility
   statement and the applicable privacy information. Do not invent an email
   address or claim a formal compliance status. The current Help wording explicitly
   identifies a development version and directs feedback to its provider.
6. **Real-device reminder verification:** notifications are opt-in, generic and
   open-app only; OS permissions and Focus modes can affect delivery. Calendar
   exports contain medication information and must be managed privately. No
   closed-app push delivery or medical-grade reliability is claimed.

## Data considerations

Records stay in local browser storage with no account or cloud syncing. A device
lock and private browser profile protect against casual shared-device access;
Reminduh does not encrypt exports or implement an application access lock.
Clearing browser data deletes local records. Backups, CSV and calendar files
contain personal medication information. Privacy obligations depend on the
operator, deployment and jurisdiction; local-only storage is not itself a legal
compliance certification.

## Sources

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — normative technical target.
- [New criteria in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
  — focus visibility, target size and other additions.
- [Making Content Usable for People with Cognitive and Learning Disabilities](https://www.w3.org/TR/coga-usable/)
  — supplemental guidance, including participation by affected users.
- [Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
  and [Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html).
