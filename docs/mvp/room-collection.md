# Room collection

The Decorate link under Blobby opens `/shop?tab=room`. Choose Garden, Table, Lamps or View, then use the action beside the item. **Buy & use** reviews the leaf price and purchases and installs the piece together. Owned pieces have **Use in room**; installed pieces are marked **In your room**. The optional Preview button opens a compact room dialog and never charges or changes the installed room. Each of the four areas has one installed piece; owned pieces can be swapped freely. The originals are included with every save.

| Area | Included | New choices | Leaves |
| --- | --- | --- | --- |
| Garden spot | Little bonsai / sensory watering | Zen garden / sand-raking game | 60 |
| Activity table | Tea for two / 3D tea break | Vinyl corner / record player | 70 |
| Lamp | Soft glow | Lavender lava; Mushroom glow | 45; 50 |
| Window view | Bamboo garden | Seaside daydream; Alpine escape | 40 each |

Tap the installed object or its labelled activity button. Blobby walks to the Zen garden or record player before the game opens. Still-image and reduced-motion modes skip the animated approach. Neither game has a timer or changes medication records, inventory or the leaf balance.

- **Little bonsai:** a quiet, open-ended garden with Rain and Breeze tools, water beads, soft leaf movement, optional sound and one-press alternatives. See [Sensory bonsai](sensory-bonsai.md).
- **Zen garden:** freely rake a textured sand surface, smooth old grooves, undo or start with fresh sand. Optional grain sounds follow movement. Touch, keyboard and a one-button spiral are available. See [Sensory sand](sensory-sand.md).
- **Vinyl corner:** opens a listening screen with Blobby radio and local audio-file playback. The optional Make a melody button opens the original untimed note activity. Listening also has a free entry from Sound → Open record player, without buying the room item. Native Apple Music connection is prepared but disabled until Apple service setup. See [Record player and activation](../ios/Leaves-and-Music.md).
- Both games use a labelled modal dialog, Escape/Back to room, focus restoration and reduced-motion styling.
- The lava lamp has moving wax while lit; its switch also controls the room light. Mushroom glow uses warm light. Both new views follow the existing local-time day/night system.
- My Blobby's room visibility controls follow installed item names. Equipping a hidden area's piece makes that area visible.

## Save contract

`src/domain/room.ts` defines stable item IDs and slots. `AppData.room` records the four installed IDs; `market.ownedRoomItems` records ownership. Old backups without these fields receive the four original pieces. Restore rejects unknown, duplicate, mismatched-slot or unowned equipped items before replacing any data. Buying and installing use one atomic local transaction with order-ID protection. A failed save does not charge or equip; a repeated order does not charge again or overwrite a later room choice. No real-money billing is enabled.

The original and replacement geometry are mutually exclusive, including original teacup, watering can, books and window celestial objects. Hidden-area preferences remain independent of the installed selection.

## Blender and runtime

Editable source: `rebuild/blender/build_room_collection.py` and generated `rebuild/generated/room-collection.blend`. Each item has a separate native collection. The alternative mushroom lamp and alpine view start hidden in the authoring file; toggle their collections to inspect them. Export copies include every variant.

Run the complete `npm run assets:build`, or regenerate only this pack:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python rebuild/blender/build_room_collection.py
node rebuild/scripts/room-collection.mjs
```

The optimized pack is 318,960 bytes with no textures or remote decoder. Each item has 1,996–6,912 triangles and 4–9 draw calls. Only the installed variants render, and the pack loads on demand when a non-default piece is shown. Procedural motion is suspended with room pause, hidden tabs or reduced motion. Content hashes keep exports and offline updates aligned.

`room_item`, `room_motion` and `room_celestial` extras connect Blender nodes to the runtime. Original character and room GLBs remain separate. The optimizer enforces a 400 KB pack budget and 10,000-triangle per-item limit. Product thumbnails and game artwork are code-native SVG/CSS; the actual room props are Blender models.

## Verification

`npm run test:unit` covers save migration, ownership, invalid restore, purchases, independent slots and untimed games. `npm run test:room-shop` exercises the actual shop and room in an isolated browser: preview/cancel/buy/equip/reload, default swaps, lamp/motion/visibility, day/night, walking before game launch, freeform raking, keyboard games, optional sound, static mode, narrow layouts and axe scans. Existing tea, garden, medication and food/clothing tests cover regression behaviour.

Automated accessibility checks supplement the keyboard and pointer checks; assistive-technology and neurodivergent-user testing remain part of release review.

For the offline check, run a fresh production build and preview on port 4177, then `npm run test:room-offline`. It verifies cached models and game chunks, offline play, purchase/equip persistence and unchanged medication records.

The shop keeps choices above the daily gift at all widths. Preview, name, description and use/buy actions stay on the same item card. Preview closes back to its trigger; a successful use returns keyboard focus to that item’s installed status. Success is confirmed on the card rather than in a floating overlay.
