import type { AnimationName, RoomItemId, RoomSlot, RoomStyle } from '@/types';

export const DEFAULT_ROOM: RoomStyle = {
  garden: 'bonsai',
  table: 'tea_set',
  lamp: 'paper_lamp',
  view: 'garden_view',
};
export const ROOM_SLOTS: { id: RoomSlot; name: string; group: string }[] = [
  { id: 'garden', name: 'Garden spot', group: 'Bonsai' },
  { id: 'table', name: 'Activity table', group: 'Tea_table' },
  { id: 'lamp', name: 'Lamps', group: 'Lamp' },
  { id: 'view', name: 'Window views', group: 'Garden' },
];
export const ROOM_COLLECTION: {
  id: RoomItemId;
  slot: RoomSlot;
  name: string;
  description: string;
  price: number;
}[] = [
  {
    id: 'bonsai',
    slot: 'garden',
    name: 'Little bonsai',
    description: 'A quiet sensory garden. Shower the leaves or brush them with a breeze.',
    price: 0,
  },
  {
    id: 'sand_garden',
    slot: 'garden',
    name: 'Zen garden',
    description: 'A calming sand garden. Rake freely, with soft sounds and smooth patterns.',
    price: 60,
  },
  {
    id: 'tea_set',
    slot: 'table',
    name: 'Tea for two',
    description: 'A warm cup and a quiet moment together.',
    price: 0,
  },
  {
    id: 'record_player',
    slot: 'table',
    name: 'Vinyl corner',
    description:
      'A cosy listening corner for Blobby radio, your own music and a little melody game.',
    price: 70,
  },
  {
    id: 'paper_lamp',
    slot: 'lamp',
    name: 'Soft glow',
    description: 'The original warm bedside light.',
    price: 0,
  },
  {
    id: 'lava_lamp',
    slot: 'lamp',
    name: 'Lavender lava',
    description: 'Slow, floating wax and a dreamy lilac glow. Tap to switch it on.',
    price: 45,
  },
  {
    id: 'mushroom_lamp',
    slot: 'lamp',
    name: 'Mushroom glow',
    description: 'A honey-coloured toadstool with a cosy golden light.',
    price: 50,
  },
  {
    id: 'garden_view',
    slot: 'view',
    name: 'Bamboo garden',
    description: 'Green hills and bamboo, from sunrise to starlight.',
    price: 0,
  },
  {
    id: 'coast_view',
    slot: 'view',
    name: 'Seaside daydream',
    description: 'Turquoise waves, a little sailboat and a sun that follows your day.',
    price: 40,
  },
  {
    id: 'mountain_view',
    slot: 'view',
    name: 'Alpine escape',
    description: 'Snowy peaks, evergreen trees and stars after dark.',
    price: 40,
  },
];
export const roomItem = (id: string) => ROOM_COLLECTION.find((item) => item.id === id);
export const roomGroup = (slot: RoomSlot) => ROOM_SLOTS.find((s) => s.id === slot)!.group;
export type RoomGameKind = 'sand' | 'melody';
export function roomGameFor(clip: AnimationName, room: RoomStyle): RoomGameKind | null {
  return clip === 'tend' && room.garden === 'sand_garden'
    ? 'sand'
    : clip === 'tea' && room.table === 'record_player'
      ? 'melody'
      : null;
}
/** Hide the original objects, while retaining the user's independent hide/show choices. */
export function roomHiddenGroups(room: RoomStyle, hidden: string[]) {
  return [
    ...new Set([
      ...hidden,
      ...(room.garden !== 'bonsai' ? ['Bonsai'] : []),
      ...(room.table !== 'tea_set' ? ['Tea_table', 'Books'] : []),
      ...(room.lamp !== 'paper_lamp' ? ['Lamp'] : []),
      ...(room.view !== 'garden_view' ? ['Garden'] : []),
    ]),
  ];
}
