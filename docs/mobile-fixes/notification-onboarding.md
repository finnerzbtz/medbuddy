# Notification onboarding — 10 September 2026

The old flow went from naming Blobby to adding/skipping medication, then straight to Today. Reminders defaulted to off, and only My Blobby → Reminders requested notification permission. This is a plausible explanation for the reported missing notifications if permission was never granted; the installed iPhone's state has not been inspected.

The new final step at `/welcome/reminders` appears after adding or skipping the first medication. **Allow notifications** opens the actual iOS prompt when tapped; **Not now** continues without requesting permission or altering reminders. Once allowed, the existing reminder preference is saved and the native scheduler's verified queue must succeed before setup reports success. The confirmation offers **Test notification** and **Go to Blobby**. A denied permission offers iPhone Settings and a way to continue. Unsupported browsers offer calendar reminders. Existing users can still enable reminders in My Blobby → Reminders.

Browser copy accurately describes alerts requiring the app to remain open. iOS reminders remain locally scheduled medication notifications. No APNs service, new entitlement, schema change, cloud migration, purchases or deployment is introduced. The existing preference continues through normal backup, native persistence and cloud compatibility paths; medication/self-care records, supply, rewards and default sadness logic are unchanged.

This contextual request follows [Apple's notification authorization guidance](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications).

Validation:

- Ten WebKit/Chromium cases passed: allow, skip, denial, unsupported browser and permission failure in each engine. Tests exercise the full welcome → medication → reminders flow, assert no automatic permission request, preserve medication/self-care data and verify the preference after reload.
- Ten existing reminder browser scenarios passed.
- TypeScript/production web build and native Capacitor sync passed.
- A fresh iPhone 17 / iOS 26.5 simulator ran the actual UIKit permission flow: no prompt before tapping Allow notifications, Apple's prompt appeared, permission was granted, the test notification arrived after leaving the app, and opt-in survived process termination/relaunch. XCTest passed with zero failures.
- `git diff --check` passed. Previous source preserved in `before-onboarding.tar.gz`; only four original files changed plus the new screen, stylesheet, browser tests and this note.

Evidence is in `rebuild/generated/qa-notification-onboarding/` and `/Users/finnerz/Documents/Codex/2026-09-10/reminduh-notification-onboarding/`, including `permission-flow.xcresult`, build/test logs and the focused source patch.

These changes are local and copied into the native project. A signed TestFlight upload and validation on a physical iPhone remain pending. No upload was performed.
