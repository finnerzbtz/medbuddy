# Reminduh · iPhone beta

Native app: Capacitor 8, iPhone, iOS 17+, version 0.1.0 (build 2). Xcode project: `ios/App/App.xcodeproj`, shared scheme `Reminduh`.

The app bundles its web UI, Blender models, games and audio. It does not need a development server, accounts or a backend. Medication data stays on the device. Each scheduled check-in earns leaves. StoreKit consumable leaf packs and MusicKit library playback are implemented but explicitly disabled pending Apple account/service configuration and end-to-end testing. The free record player supports Blobby radio and local audio files now. See [Leaves and Music](Leaves-and-Music.md).

## Current internal beta

Build 2 includes Release A optional routines, medication-name autocomplete,
notification onboarding and the audio, sand layout and switch fixes. Build it with
`APPLE_TEAM_ID=37N43RUU8P npm run ios:beta`. This leaves cloud endpoints empty in the
bundle because production has not received the new schema protocol. All local data,
reminders and backup features remain available. The ordinary `ios:archive` command
uses the configured production environment; do not use it for this offline beta.
See [build 2 notes](releases/0.1.0-2.md) for validation and distribution status.

## Build locally

Use Node 22 or newer (`.nvmrc` selects Node 24), npm and Xcode 26+. Swift Package Manager resolves the native plugins; CocoaPods is not needed.

```sh
npm ci
npm run ios:simulator
npm run ios:open
```

`ios:sync` rebuilds the production website and copies it into the Xcode app. Run it after web changes. A `server.url` is deliberately absent from `capacitor.config.ts`; do not add a localhost/live-reload URL to a release build.

```sh
npm run test:unit
npm run test:ios-domain
npm run test:reminders  # requires npm run dev -- --port 5177
npm run test:e2e       # same development server
npm run ios:archive
```

Without `APPLE_TEAM_ID`, the archive command produces an **unsigned** device archive for build verification. It cannot be uploaded. With this Mac’s distribution certificate and profile installed, use `APPLE_TEAM_ID=37N43RUU8P npm run ios:archive`, or open Xcode and choose Product → Archive. Signing credentials belong in Xcode/Keychain, never in the repository.

## Apple account setup — 8 September 2026

Reminduh is registered under team `37N43RUU8P` with explicit bundle ID `com.reminduh.app`, MusicKit App Service and the default In-App Purchase capability. [App Store Connect](https://appstoreconnect.apple.com/apps/6809836995/distribution) Apple ID: `6809836995`; SKU: `REMINDUH-IOS-001`; language: English (U.K.).

The owner approved the updated Developer Program License Agreement and use of their account contact details for beta feedback and Apple's private review contact. The agreement is accepted, and the TestFlight description, feedback email, review notes and contacts are saved. Draft listing copy, Health & Fitness category, subtitle and manual release are saved. The private **Reminduh Beta** internal group has the owner’s Apple account as its sole tester and automatic distribution off.

Xcode is signed in. Apple Development and Apple Distribution identities validate. The **Reminduh App Store** distribution profile is generated and installed, expiring 8 September 2027. The app's iPhone Release configuration uses that manual distribution profile because this team has no registered development devices; Debug retains automatic signing. `ios/App/ExportOptions.plist` contains repeatable upload settings and no credentials.

The owner handled the macOS Keychain prompt, and the signed archive completed at 16:01. Strict recursive signature verification passed, and all 165 bundled web files match the current native app assets. Xcode Organizer confirmed that version 0.1.0 (1) uploaded successfully at 16:03 Europe/London. Apple processing is complete, testing notes are saved, and the build is assigned to **Reminduh Beta** for its sole internal tester, the owner. The All Testers page confirms the owner is **Invited**. Open the invitation on iPhone to accept and install through TestFlight. Physical iPhone installation and testing remain unverified. Machine-readable status is in `App-Store-Connect.json`.

## Future TestFlight uploads

- Use the existing app record and bundle ID; do not create duplicates.
- Handle any macOS signing-key authorization prompt if shown. Enter passwords only into the native macOS prompt.
- Run `APPLE_TEAM_ID=37N43RUU8P npm run ios:archive`, or open Xcode and choose Product → Archive. The Release profile requires the matching distribution identity in the login Keychain.
- Validate and upload the signed archive in Xcode Organizer. Alternatively use `xcodebuild -exportArchive -archivePath ios/App/build/Reminduh.xcarchive -exportOptionsPlist ios/App/ExportOptions.plist -exportPath ios/App/build/TestFlight-export -allowProvisioningUpdates`. The export options upload to App Store Connect; they do not submit an App Store release.
- Increment `CURRENT_PROJECT_VERSION` for every new upload. Verify Apple processing, then add the build to **Reminduh Beta**, where the owner is already a tester. External testing may require beta review.
- Confirm published privacy/support URLs before external testing; `Privacy-policy-draft.md` remains an unpublished draft.

## Reminder behaviour

Device notifications use iOS local notifications, not the web service worker. They can fire with the app closed. Names/dose quantities are absent from notification titles and bodies. Tapping an alert opens Today's check-ins and never marks a medication as taken.

The app schedules up to 60 distinct alert times within the next 30 days, combining simultaneous doses. The queue refreshes on foreground, schedule changes, snooze, recording/undo, pause/archive, restore and reset. Settings shows how far the current queue reaches. One separate renewal alert prompts the user to reopen when the queue ends. If they do not reopen, medication alerts eventually stop; this is stated in the app. The remaining OS slots are reserved for the renewal and test alert.

Past unsnoozed times are not sent as fresh take-dose notifications; Today's check-in CTA remains available. A cross-midnight snooze is retained while its medication is active. Review/open the app after a time-zone change so the OS queue is rebuilt for local time. Focus, notification permissions and system settings can silence alerts. Do not claim guaranteed delivery or use this beta as a sole medication reminder.

## Storage and moving from the browser

The web app and iPhone app have different storage origins. To transfer existing data: export a JSON backup from the browser, save it to Files/AirDrop it to the phone, then choose My Blobby → Restore backup in the iPhone app. Verify the restored schedule and enable/test device notifications.

The iPhone app retains a native Preferences copy in addition to WKWebView local storage. It hydrates before creating the application store, keeps the newer valid copy, and surfaces failures. Explicit backups open the system share sheet; temporary export files are removed afterwards. Restore uses the iOS file picker. Deleting the app removes its local health data. Purchased leaves live in a device-only Keychain wallet, separate from health backups and resets. Device backups can include app data according to the user's iOS settings.

The optional purchase test uses the separate **Reminduh StoreKit** scheme. Its current simulator entitlement failure and release gates are documented in [Leaves and Music](Leaves-and-Music.md).

## Native acceptance checks

Use a separate simulator with no personal medication data. `AppUITests/ReminduhUITests.swift` exercises onboarding, iOS notification permission/test, process termination/relaunch and the native backup sheet. Run via Product → Test with scheme Reminduh. Use a fresh install to exercise onboarding; the smoke test also supports rerunning with its existing test data.

Before distributing broadly, test on a physical iPhone:

1. Add a sample medication due a few minutes ahead. Enable notifications, lock/close the app, and verify the actual alert time and its tap destination.
2. Snooze, record taken/skipped, undo, pause/archive and edit tomorrow's time. Verify obsolete notifications disappear and no duplicate dose is created.
3. Restart the phone, change time zone, disable/re-enable permission and try Focus mode. Check the displayed reminder status.
4. Export to Files, restore and compare records; confirm data survives a normal app update. Never uninstall a personal-data installation without a backup.
5. Check VoiceOver, larger text, touch gestures, reduced motion, silent mode, audio interruptions, WebGL games, low-power performance, keyboard and all screen edges.

## Privacy and assets

`PrivacyInfo.xcprivacy` declares no app data collection/tracking, app-owned UserDefaults use (CA92.1), and app-owned export-file metadata (C617.1). Capacitor includes its own SDK manifests. There are no analytics or advertising; optional StoreKit and MusicKit integrations contact Apple when activated, while generated sound files are bundled, and the ElevenLabs authoring key is excluded.

The export-encryption flag is `ITSAppUsesNonExemptEncryption = NO`; the app does not implement custom encryption. Reassess both declarations when adding analytics, cloud accounts, payment SDKs or other native libraries.

Apple separately collects TestFlight usage/crash/feedback information. The in-app privacy text explains that beta behaviour. Confirm the owner has the appropriate ElevenLabs music licence for the intended distribution; see `docs/mvp/app-audio.md`. In particular, future monetized releases on multiple platforms require checking the applicable game licence.

## Official references

- [Capacitor environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Native local notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Capacitor privacy manifests](https://capacitorjs.com/docs/ios/privacy-manifest)
- [Apple: distribute using TestFlight](https://help.apple.com/xcode/mac/current/en.lproj/dev2539d985f.html)
- [Apple: beta test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information/)
- [Apple: TestFlight privacy](https://www.apple.com/legal/privacy/data/en/test-flight/)
