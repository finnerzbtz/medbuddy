# Calm, focused app refinement

Branch: `refine/calm-premium-experience`, based on TestFlight build 3 plus its release notes. The user has now requested a TestFlight release of this refinement and a reusable TestFlight skill. Build 4 is being prepared; signing, upload, Apple processing and beta-group assignment are separate release gates and are not claimed complete by this document. No backend deployment is included.

The goal remains a high-quality, engaging but calming app whose core functions work in the iOS simulator. A focused visual pass alone does not prove completion. Existing medication behaviour, default sadness thresholds, native data protection, optional self-care separation, owned assets and disabled purchase/cloud gates stay intact.

## First pass

- Room: four primary care controls; room options and activities expand when requested. Pause stays directly reachable. Keyboard Escape restores focus after closing room options. Daily care is compact and optional.
- Settings: a single divided list replaces separate padded cards. Routines opens directly. Help and privacy remain available without repeated footer copy.
- History: the selected day and records lead; calendar, filtering and summary are available on demand. Cross-year dates remain unambiguous.
- Routines: current plan leads, and new ideas appear on request after setup. The first-create focus fallback handles disappearance of its starter button.
- Shop: selecting food or clothing on mobile opens a focused details sheet. Buying still needs a separate explicit confirmation. Cancel and owned-item use preserve medication/self-care state.
- Music: actual playback, loading, failure and retry are visible. Late loading cannot override pause or mute. Test sound exposes failed recordings and can be stopped while loading or playing. Native snooze text no longer describes browser-only delivery.

## Completed verification

Local Release A contracts passed, including the 97 existing domain checks and native planner/storage contracts. The isolated release browser runner passed the medication, reminder, routine, compact room, history, mobile shop, bundled-media and radio failure/retry suites. WebKit and Chromium checks include 320px layouts, 200% text, keyboard/focus, accessibility scans, decoded audio output and medication/self-care isolation.

The broad medication browser suite reports 17 passing scenarios in `rebuild/generated/qa-mvp/browser-results.json`, including schedule edits, record snapshots, supply, undo, restore, local-midnight rollover, cross-tab refresh and the production offline package. Its offline check covers reload, recording, feeding, shop inventory, friendship and History, with no unexpected remote requests or page errors. Companion verification reports six passing scenarios in `rebuild/generated/qa-companion/companion-results.json`, including all 19 cheat states, walking/pause, feeding persistence, camera/pantry sizing and reduced-motion behaviour. Celebration checks cover actual check-ins, Undo, focus, automatic dismissal and calm feedback alternatives.

Both `scripts/ios/radio-playback-browser-tests.mjs` and `scripts/ios/sound-test-control-browser-tests.mjs` pass in Chromium and WebKit. They force recording failures, verify visible retry/error feedback, cancel or mute during loading, and then play the real decoded recording. Radio output is also checked with an audio analyser; a selected music switch alone does not count as successful playback.

## Native simulator acceptance

The final offline bundle passed five XCTest flows on the dedicated iOS 26.5 QA simulator on 10 September 2026: **5 tests, 0 failures**, in 162.7 seconds. Synthetic records were retained to test in-place persistence; personal simulator installations were not modified.

| Flow | Verified result |
| --- | --- |
| Medication and supply | Enter a synthetic medication through the native keyboard with 10 mg strength and two tablets; record Taken through the review dialog; retain History after process termination; confirm supply falls from 30 to 29 complete scheduled doses. |
| Reminders and backup | Open the expandable reminder section; receive a real local notification after leaving the app; retain notification opt-in after relaunch; open the native backup share sheet from Backups & data. |
| Radio | Load the bundled recording and show Playing only after a source starts; recover after returning from the Home screen; retain enabled/music choices across process termination. |
| Voice | Complete the recorded Cloud preview's loading phase while playback remains active; stop/replay after foregrounding; retain master mute after relaunch. |
| Sensory garden | Enter the bonsai from Activities; drag over the touch canvas; pause/resume; return to the room using a visible close control. |

All 165 files in the tested `dist` package matched `ios/App/App/public`; the native configuration had no development-server URL. Cloud endpoints were explicitly blank for the sync. The native tests use the bundled app, rather than a Vite server.

Local evidence:

- `/tmp/reminduh-native-final.xcresult` and `/tmp/reminduh-native-final.log` contain the final successful native run.
- `/tmp/reminduh-native-final-sync.log` records the offline build and Capacitor sync.
- `/tmp/reminduh-refinement-release-browser.log` records the integrated browser checks.
- `/tmp/reminduh-refinement-native-shots/manifest.json` maps 11 exported native screenshots to their tests.

The first expanded native run exposed two test-driver assumptions: iOS exposes the pressed garden control as a Switch, and WKWebView can report a control as hittable while fixed navigation covers it. The tests now use the observed accessibility role, scroll the entire target above navigation, and assert/capture the export button's geometry before opening the share sheet. The original failed run remains in `/tmp/reminduh-native-refinement.xcresult`; the assertions were retained and the final rerun passed.

## Visual review and limits

Native screenshots were reviewed for the room, sound controls, record player, bonsai, celebration and backup controls. The record player and sensory overlay render intact, their controls remain reachable, and the backup action can be fully scrolled above navigation. The compact speech bubble can still overlap Blobby's lower body while he walks near the front of the room; this remains a composition polish point. The native History screenshot captures the celebration, so the unobscured History layout is supported by the browser visual/interaction checks rather than that screenshot.

These results establish the listed simulator flows, not every possible function or device condition. Physical iPhone speaker/headphone output, Silent mode, calls/audio interruptions, Focus behaviour and an actual TestFlight update remain device validation. The new native suite opens export but does not perform a native Files-picker restore round trip or verify local-file music interruption behaviour. Native VoiceOver navigation and larger Dynamic Type settings also remain separate device/accessibility checks.

Cloud sync, Apple Music and real-money purchases remain intentionally disabled; they are not verified release functions. The TestFlight release must separately verify the signed build, upload, Apple processing and assignment to the existing beta group. The broader quality goal is not proven solely by this focused pass.
