# Release A — optional routines

Initial local implementation on 10 September 2026 against the product plan, developer handoff and competitor research in `/Users/finnerz/Documents/Codex/2026-09-09/i-n/outputs/`. Research was treated as evidence. R0–R4 only: no reflections, wind-down session tracking, chapters, paid purchases or production deployment.

The initial evidence below predates the subsequently authorized iOS release. [TestFlight build 4](../ios/releases/0.1.0-4.md) was signed, uploaded and made available to the existing internal beta group. Cloud deployment and purchase activation remain excluded. Further local refinement is tracked in [the quality pass](../refinement/quality-pass.md).

## What is available

- Today has a separate **For you** list. Add a quiet break, any of the six plan templates, or a custom routine with selected weekdays and an optional display time.
- Done and Not today explicitly record an optional routine. Later changes the Today list without scheduling an alert. Undo keeps the anti-repeat reward marker.
- The first Done or Not today for today's occurrence earns up to five earned leaves, at most 15 routine leaves per local reward day. Historical/future records receive a zero marker. No routine friendship XP or dose celebration is added.
- A paired activity opens the existing sand, bonsai, record player, tea or resting animation. Exiting asks what happened for the user. Playing, replaying and returning without recording do not complete the routine. Static scenes, unavailable objects and rendering failures have a simple break prompt; nothing must be bought or equipped to record a routine.
- Keep today small previews optional items to hide for this day. Restore reverses it without changing recurrence. An empty optional plan remains valid.
- `/routines` is reachable from Today and Profile. The skippable introduction offers up to two starters after the existing medication onboarding. A due medication review button appears before the room on narrow screens.

## Acceptance evidence

| Ticket                 | Local evidence                                                                                                                                                        | Result                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R0 baseline            | Source snapshot; original 97 domain checks, 15 native checks and web build                                                                                            | Passed before changes |
| R1 persistence/domain  | 22 routine/migration/mood contracts; 19 native planner/persistence checks; 5 server-handshake checks                                                                  | Passed                |
| R1 cloud compatibility | 11 SQL compatibility checks; 18 live authentication/RPC checks; 16 live two-browser sync/account checks on a disposable development branch                            | Passed                |
| R2 editor/Today        | 9 UI walkthrough checks, including keyboard save, day validation, pause/archive, future start, 320px with a 200% root-font setting and separate history               | Passed                |
| R3 activity boundary   | Quiet-break walkthrough (6 checks); all five reused activities, replay/cancel and failed-save retry (6 checks)                                                        | Passed                |
| R4 return/mood         | Baseline 2/24/72-hour boundaries; latest taken/skipped reset; archived/paused meds; Gentle moods; pure capped preview; hide/restore recurrence and reminder isolation | Passed                |
| Existing regressions   | Original 97 domain checks and automated accessibility audit across 13 existing screens/states                                                                         | Passed                |
| Packaging              | TypeScript, Vite/offline build, four packaged offline-flow checks, Capacitor sync and unsigned iOS simulator build                                                    | Passed                |

Evidence is in `rebuild/generated/release-a/`, with final command output copied to `docs/release-a/verification/`. The original root-font check did not prove that every fixed-pixel label enlarged. The later refinement explicitly converts text sizing and measures the rendered fonts; see the quality pass for its separate results. The walkthrough uses synthetic data; it is a developer acceptance check, not participant research or a claim of legal/clinical accessibility compliance.

No baseline check failed. The build retains the existing large 3D chunk warning and the existing mixed static/dynamic cloud-payload import warning. Neither is a new Release A test failure.

The R0 source preservation archive is `/Users/finnerz/Documents/Codex/2026-09-10/reminduh-release-a/before-release-a-source.tar.gz`, with original status and hashes alongside it. It contains source/configuration, not credential files or the large existing asset library. At the initial preservation stage, existing uncommitted work was neither reset nor committed; later authorized repository/release commits are recorded separately. `changes-from-baseline.patch` in that folder isolates this task from the already dirty Git baseline.

## Data contract and recovery

The storage key remains `reminduh-mvp-v1`. The payload is explicitly schema **2**, with a validated `selfCare` section containing routines, records, day overrides, reward markers and introduction dismissal. New routines have one occurrence per local day (`routineId@YYYY-MM-DD`); time changes never create another occurrence. New schedules start today or later. Edits start tomorrow (or the routine's future starting date), while pause/archive stop unrecorded occurrences and preserve schedule history. Resume preserves previously scheduled future edits.

V1 parsing is an explicit migration to empty self-care sections. It does not create any optional history or reward, change medication fields, change the paid wallet or reset care XP/ownership. Backup exports include a wrapper version; original unversioned wrappers still import. Unknown future data/wrapper versions fail closed.

Before replacing a local v1 snapshot, its exact serialized content (including account binding) is saved under `reminduh-mvp-v1:before-v2`. Validation and backup write precede the upgraded write. The backup is retained after success and can be downloaded with **Export pre-update backup** in Profile. Import previews include optional routine counts and explain whole-copy replacement. Routine records, reward ledger and earned wallet commit in the same storage write. Failed local writes leave all three unchanged.

On iOS, Preferences retains its own pre-v2 snapshot before persisting an upgrade. Hydration validates both copies before choosing one. Unknown versions/corruption, or a newer-timestamp v1 copy competing with a v2 copy, stop hydration while retaining both copies. Native saves remain queued behind the synchronous browser save, as in the existing app: a native write failure raises the existing storage error, preserves the browser snapshot and prior native copy, and the next successful save can retry. A browser save success is not proof that the OS has completed its durable write. Physical purge/relaunch and low-storage recovery still require device testing.

The paid StoreKit ledger is unchanged and remains separate in native storage. `ReminduhLeafPurchasesEnabled` remains false.

## Medication and mood boundary

Routine actions do not call the medication logger, alter stock, create reminder receipts/snoozes, change notification permissions or update `market.checkInRewards`. Existing medication rewards remain 10 earned leaves on the first taken/skipped check-in. Only the shared earned-leaf balance changes when a routine receives its own bounded grant.

`baselineMedicationMood` names the existing calculation without changing it: the oldest qualifying unrecorded medication in its existing seven-day window gives Missing you at 2 hours, poorly at 24 hours and extra care at 72 hours. The latest taken **or skipped medication record** resets earlier gaps. Opening the app, routine records and a welcome line do not. Archived/paused medications retain the existing exclusion behaviour. Gentle moods continues to present idle.

The optional capped policy exists only in the development-build Cheat codes research preview, as component state. It maps sick/critical to worried without modifying data, existing expressions or defaults. It is absent from the production build and is not persisted or randomly assigned.

## Cloud protocol and rollout boundary

`0002_release_a_routines.sql` keeps the existing three owner-scoped medication/account tables. Optional self-care stays inside the account's JSON snapshot, validated before the atomic save. Read/write privileges and account deletion remain unchanged. The migration adds a protocol capability endpoint and rejects schema downgrades before CAS, with an HTTP 409 update-required message. V1 remains supported until that account first saves v2. V2 writes cannot erase unknown future versions.

The new client checks the capability endpoint before reading/writing snapshots. An old/unavailable server cannot silently accept a lossy v2 write. Unsupported servers produce a device-safe update message; account deletion remains available. An already shipped v1 client may display its generic sync error rather than the server's newer wording; its write is still rejected. Upgrade UI validation on an actual old installed build remains part of rollout testing.

Fingerprinting includes the entire routine section and sorts routine definitions by ID. Existing snapshot-level conflict handling stays explicit: one whole copy wins, including routines, day choices, reward markers and the leaf balance. Balances are never added. A v1 binding's old fingerprint may require a one-time explicit copy review after migration. Device reminder preferences/receipts retain their existing device-local treatment.

Validated on Neon project `damp-morning-93624758`, isolated branch `br-green-lab-zaxqbso9` (`release-a-validation-20260910`), cloned from development. The branch's compute suspends after five idle minutes. SQL fixtures roll back; live API/browser tests use reserved synthetic accounts and deterministic OTP fixtures, with no delivery of real emails. Production and the shared development service were not migrated. The branch and private temporary connection remain available for reproducing validation; no credentials are checked into source.

Before any future production rollout: back up production, apply/recheck the migration there first, then ship the v2 client. That work is **not done or authorized as part of this local release task**. The current production-connected local build will keep unsynced changes on the device and report that the Release A cloud update is required. Do not clear local storage to work around it. An old frontend rollback must not downgrade a v2 snapshot; retain the version guard and recover/export v2 data with a compatible build.

## External validation pending

- Real neurodivergent participants must distinguish their real-world routine from the optional Blobby activity; test the first quiet-break slice and empty/small-day choices before expanding scope.
- VoiceOver/TalkBack or another actual screen reader, switch/assistive input, the full iOS Dynamic Type/device range and physical touchscreen evaluation. A later simulator comparison at normal and accessibility-large text is recorded in the quality pass. Automated WCAG checks are supporting evidence, not complete conformance certification.
- Physical iPhone upgrade from the currently installed build, durable storage purge/relaunch/low-storage recovery, background/foreground, actual local-notification delivery and DST/device-time changes.
- Real email delivery and native authentication/sync to the eventual production backend. Synthetic browser tests verify OTP/session logic and data transport, not inbox delivery.
- Production migration and old installed-client cloud-update UX remain pending. Signing, upload, Apple processing and internal TestFlight distribution were subsequently completed for build 4; those completed release steps are not outstanding.

## Re-running locally

Use Node 22+ and the existing installed dependencies. `npm run test:release-a` runs local contracts, native checks and the original domain suite. Start an isolated preview with both `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_URL` empty on port 5188, then run `npm run test:release-a-ui`. The three cloud test scripts are deliberately pinned to the disposable branch and use `/tmp/reminduh-release-a-validation.env`; they must not be repointed at production. Run SQL compatibility, API and then browser tests with a separate development preview on 5189 configured for that branch. Production migration remains a separately controlled rollout step.

The initial Release A source comparison preserved the iOS Swift sources, paid ledger, medication scheduler, native reminder planner, medication form/autocomplete and asset definitions. That is a baseline preservation result, not a claim that those files must retain identical hashes after later authorized refinements.
