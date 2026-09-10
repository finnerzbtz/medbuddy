# Reminduh privacy policy — beta draft

Draft updated 8 September 2026 for the upcoming account-enabled build. The app owner must add their legal name and privacy contact before publishing.

Reminduh stores the medication names, schedules, check-ins, notes, display names and companion preferences you enter on your device. You can use the app without an account. The app does not include analytics or advertising and does not send medication information to an AI service.

If you choose to sign in, Reminduh uses Neon Auth to verify your email with a sign-in code and maintain your session. If you then enable cloud sync, your medications, check-in history, profile and companion progress are stored in our dedicated Neon PostgreSQL database in London, United Kingdom. This allows you to restore your routine on another device. Existing local records are not uploaded merely by opening the app or signing in. Access is restricted to your authenticated account through the app's database API.

Cloud synchronization uses an encrypted connection. Your device notification permission, notification receipts and snoozes remain device-specific. Cloud storage is optional; sign-in emails do not contain medication details.

Device notifications are scheduled locally. Their visible text omits medication names and dose details. Notification permission is optional and can be changed in iPhone Settings.

When you choose to export or share a backup, history or calendar file, it contains medication information. You choose its destination using the system share sheet. Reminduh does not encrypt exported files; keep them somewhere private. Temporary export files are removed after the share sheet closes.

You can edit medication information, restore a backup, or reset guest app data in My Blobby → Your data. In My Blobby → Account, signing out removes that account's records from this device while retaining its cloud copy. Deleting your account requires a fresh email code and removes your identity and associated records from the live cloud database. Database recovery history may retain historical copies for up to the currently configured 24-hour retention period. Deleting the app alone does not delete a cloud account. Apple device backups may contain app data, depending on your device settings; previously exported copies remain where you saved them.

Optional leaf purchases, when activated, are processed by Apple. Reminduh stores verified transaction identifiers and a paid-leaf balance in this iPhone's Keychain, separate from health backups. This wallet does not sync between devices and is not cleared by resetting health data. No medication records are sent as part of a purchase.

Audio files you select for the record player remain on your device and are not uploaded. Their temporary listening queue is cleared when the app reloads. Optional Apple Music connection, when activated, requests access to your library and uses Apple's service for playback. Reminduh holds library titles, artwork and identifiers in memory for browsing; disconnecting stops its playback and clears that cache. You may revoke access in iPhone Settings. Neither music service receives medication records from Reminduh. The Open Spotify link opens Spotify separately, under its own privacy terms.

Soundtracks, sound effects and 3D artwork are bundled app assets. No medication information is sent to the services used to author those assets.

During TestFlight testing, Apple collects beta usage and crash information and shares it with the developer. If you submit feedback, Apple may also share your comments, screenshots and contact information. Apple's [TestFlight privacy notice](https://www.apple.com/legal/privacy/data/en/test-flight/) explains this processing. Avoid including medication details in feedback.

Privacy contact: **to be supplied by the app owner before publication**.
