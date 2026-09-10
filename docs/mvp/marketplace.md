# Food, wardrobe, room and leaves

Updated September 8, 2026. This one-device shop uses earned leaves, with a native purchased-leaf wallet prepared for iPhone. Live purchases remain disabled pending Apple Developer/App Store Connect setup and purchase testing. See [Leaves and Music activation](../ios/Leaves-and-Music.md).

## Included

- Six food types: apple, berries, dumpling, strawberry, cookie and mochi. Shop packs contain three snacks, with the quantity and leaf price shown before purchase.
- Seven outfits: the four original looks plus Froggy, Stargazer and Strawberry. The new clothing is authored in Blender, rigged to the same skeleton, previewed before purchase, and reflected in the room and garden artwork.
- Persistent wallet, food quantities, owned outfits, daily gift and recent purchase history. Buying and wearing are separate actions.
- Existing version 1 saves retain medication records, preferences and their equipped original outfit. The optional market field migrates to 120 starter leaves, two pantry snacks and ownership of the four original looks.
- Three daily free apples; a 25-leaf daily gift; 5 leaves each for the first cuddle and play. Each first scheduled dose check-in also earns 10 leaves, whether taken or skipped; edits and undo never earn a second reward. Purchased food lasts across days. There are no purchase streaks, timers, chance-based rewards or real-money prompts.
- Pointer dragging onto Blobby, safe cancelled/missed drops, and an equivalent select-and-Feed button. Keyboard, touch, reduced motion and static mode are supported. The non-drag control follows [W3C guidance for dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

Room pieces have direct item cards with optional previews, **Buy & use**, and free swaps for owned pieces. Purchase and placement are saved together. Ten choices cover garden, table, lamp and view, with four included originals and six purchasable additions. See [Room collection](room-collection.md) for games, prices, save migration and Blender assets.

## Source and asset boundary

`src/domain/catalog.ts` defines stable product IDs such as `food.mochi` and `outfit.frog`, independently of display text. `src/domain/market.ts` holds local currency transactions. `src/stores/appStore.ts` commits the wallet and entitlement/inventory change together and reports failed storage without granting the item. The shop uses a unique order ID per purchase review so a retry does not charge twice within the retained order history. Ownership is checked again by the store before equipping.

`src/domain/feeding-motion.json` drives both the native Blender arm animation and runtime food movement. Run `npm run assets:build -- --render` after changing it or the wardrobe authoring script. Editable output is `rebuild/generated/wardrobe.blend`; original source stays in `rebuild/blender/blobby.blend`. Runtime GLBs use one shared nine-bone skeleton and no external decoder. Seven outfits total about 2.39 MB / 90,500 triangles in the combined character file; each active outfit uses 5–9 draw calls. The room is about 0.62 MB. New garment texture work is procedural or reuses the small existing fabric textures.

## Purchased currency

The native StoreKit 2 bridge verifies consumable transactions, credits a device-only Keychain ledger before finishing them and handles pending/cancelled purchases, duplicate delivery and refunds. Paid leaf balances never come from health backups or localStorage. Spending uses a durable native reservation followed by an idempotent local inventory commit and native-storage flush. A failed commit refunds the reservation; interrupted successful commits resume without granting the item twice.

Earned leaves and inventory remain local save data. There is no account syncing or cross-device paid-wallet recovery. Product activation, real localized prices and end-to-end StoreKit/device validation remain pending. The wallet displays unavailable packs honestly. [Setup and release gates](../ios/Leaves-and-Music.md).

## Verification

- `npm run test:unit`: migration, malformed inventory, balances, duplicate orders, insufficient funds, ownership, daily grants, persistence and medication independence.
- `npm run test:market`: purchases/cancellation, shop previews and equipment, reload, mobile reflow, pointer dragging, keyboard after dragging, touch cancellation, reduced motion/static mode and axe scans.
- `npm run assets:check` and `npm run assets:test`: file budgets, rig weights, native clip loops, all 133 outfit/clip combinations, rendering and outfit visibility.
- Existing medication, companion, tea and garden browser tests remain part of regression coverage.
