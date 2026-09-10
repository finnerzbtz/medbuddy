# Leaves and the record player

Updated 8 September 2026. Reminduh now has Apple Developer team `37N43RUU8P` and App Store Connect app `6809836995` (`com.reminduh.app`); MusicKit App Service is registered. The updated developer agreement is accepted and the App Store signing profile is configured; the first beta has uploaded successfully, and physical-device validation remains pending. Earned leaves, Blobby radio and local audio files work now. The native StoreKit 2 and MusicKit adapters compile, but **live purchases and Apple Music connection are disabled** in `Info.plist` until activation and device testing.

## Leaves

Each scheduled dose first recorded as taken **or skipped** grants 10 leaves. Editing, undoing or recording that same dose again gives no further reward. Old recorded doses migrate with a zero reward marker, so editing old records does not create retrospective grants. Rewards and the dose record commit together. The existing 120 starter leaves, 25-leaf daily gift, 5 leaves for the first daily cuddle/play and three daily free apples remain.

The wallet opens from Blobby or the shop. It explains earnings and shows optional 100 / 350 / 800 leaf packs. Pack prices come exclusively from StoreKit's localized `displayPrice`; unavailable products cannot be bought. No production cash prices have been chosen.

Purchased leaves use a separate, device-only Keychain ledger. They are absent from editable health backups. Verified consumable StoreKit transactions are credited durably before `finish()`. Transaction IDs prevent duplicate delivery; unfinished transactions retry on foreground. Refunds apply once and any spent balance is settled by later credits. Production, sandbox and explicit debug-test wallets are separate.

Shop spending uses earned leaves first. Native paid leaves are reserved against the bundled catalogue, local inventory is committed and flushed to native storage, then the reservation is acknowledged. A failed local commit returns its reserved paid leaves. A crash before acknowledgement retries the same order without delivering it twice. `scripts/ios/prepare-assets.mjs` regenerates `LeafShopCatalog.json` from the app catalogue.

This remains a one-device MVP. Earned currency and item inventory are local save data, not a server-backed economy. Purchased currency does not sync between devices or restore from health backups; resetting health data leaves that separate wallet intact. A future account/server ledger is needed for cross-device purchase recovery and tamper-resistant inventory.

## Activate purchases

1. Use existing team `37N43RUU8P`, bundle ID `com.reminduh.app` and App Store Connect app `6809836995`. The Developer Program agreement is accepted. Complete the separate paid-app agreements, tax and banking setup with the owner.
2. Create consumable products `com.reminduh.leaves.100`, `com.reminduh.leaves.350` and `com.reminduh.leaves.800`. Set their descriptions, prices and availability in App Store Connect. Change the IDs in Swift and TypeScript together if the owner chooses another naming scheme.
3. Run the local test under **Reminduh StoreKit**, using `AppUITests/Reminduh.storekit`. Its example prices are simulation data, not published prices. The production app does not bundle this file. The test uses a separate debug wallet and never charges real money.
4. Test StoreKit on a properly configured development device, then with App Store sandbox/TestFlight: success, cancellation, Ask to Buy/pending approval, duplicate delivery, app termination, failed storage, offline retry, refunds, and an item bought with a mixture of earned and purchased leaves.
5. Set `ReminduhLeafPurchasesEnabled` to true only for the build being validated with available products. Keep it false for an earned-only beta. Sign, archive and distribute using the normal Reminduh scheme.

The current unsigned archive compiles. Native ledger checks pass. The automated local StoreKit session on this Mac's iOS 26.5 simulator failed with `SKInternalErrorDomain Code=3` / `notEntitled` before a purchase could execute, including with local simulator signing. **No end-to-end StoreKit purchase is claimed as passed.** This remains a release gate. The default test scheme skips that opt-in purchase test; the dedicated StoreKit scheme runs it.

```sh
# Pure native wallet verification, independent of Apple account availability
xcrun swiftc ios/App/App/LeafLedger.swift scripts/ios/leaf-ledger-tests.swift -o /tmp/reminduh-leaf-tests
/tmp/reminduh-leaf-tests
```

## Listening now

Open Sound → Open record player, or tap the installed Vinyl corner. Listening is freely accessible even without owning the decorative room item. The player has Blobby radio, play/pause, a local-file listening queue, next/previous, seeking and volume. Files stay on the device and the queue lasts for the current visit. Clearing it releases the file URLs. Closing the player keeps music available in the room; backgrounding the app or muting pauses personal playback. The room's record marker moves only while music is playing and respects room pause/reduced motion.

The optional **Make a melody** activity remains available inside the room's player. Switching to it pauses personal music. Room music, effects and speech are silenced while personal music plays, so music isn't sampled or mixed into game sounds.

## Activate Apple Music

MusicKit App Service is enabled for registered App ID `com.reminduh.app`. After signing is configured, generate the provisioning profile and enable `ReminduhMusicKitEnabled` only for the build being validated on a physical device. The native adapter uses automatic developer-token generation; no signing key or shared user token belongs in JavaScript. `NSAppleMusicUsageDescription` is already present.

Connect requests Apple's authorization and checks the subscription. The player lists the user's songs/playlists, supports library search/pagination and uses `ApplicationMusicPlayer` for playback. MusicKit keeps authorization; Reminduh does not receive the user's Apple password. Disconnect clears the in-memory library and stops owned playback. Access can also be revoked in iPhone Settings. Device volume controls Apple Music.

Before release, verify authorization denied/revoked, expired subscription, empty library, unavailable tracks, playback, skips, backgrounding, phone/audio interruptions, master mute, reconnect/disconnect and VoiceOver on a signed physical iPhone. These live MusicKit flows have not been exercised without the Apple service setup.

Spotify is an external **Open Spotify** link only. Spotify's published policy prohibits games, integration with another music service's content and some monetized streaming uses; an embedded Reminduh integration should not be promised without Spotify's written approval.

## References

- [Apple StoreKit purchases](https://developer.apple.com/documentation/storekit/in-app-purchase)
- [StoreKit testing setup](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode/)
- [MusicKit](https://developer.apple.com/musickit/)
- [MusicKit automatic token generation](https://developer.apple.com/documentation/musickit/using-automatic-token-generation-for-apple-music-api)
- [Spotify developer policy](https://developer.spotify.com/policy)
