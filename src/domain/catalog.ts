import { DEFAULT_ROOM, ROOM_COLLECTION } from './room';
import type { BlobbyVariant, FoodId, MarketState, RoomItemId } from '../types/index';

export const FOODS = [
  {
    id: 'apple',
    name: 'Apple',
    description: 'A crisp, rosy crunch',
    cost: 12,
    quantity: 3,
    xp: 10,
    color: '#bf6559',
  },
  {
    id: 'berries',
    name: 'Berries',
    description: 'Little bursts of sweetness',
    cost: 18,
    quantity: 3,
    xp: 20,
    color: '#807299',
  },
  {
    id: 'dumpling',
    name: 'Dumpling',
    description: 'A soft, cosy favourite',
    cost: 24,
    quantity: 3,
    xp: 30,
    color: '#cba16c',
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    description: 'Fresh from the little garden',
    cost: 18,
    quantity: 3,
    xp: 15,
    color: '#be6975',
  },
  {
    id: 'cookie',
    name: 'Cookie',
    description: 'Golden with chocolate chips',
    cost: 21,
    quantity: 3,
    xp: 20,
    color: '#b58a61',
  },
  {
    id: 'mochi',
    name: 'Mochi',
    description: 'A pillowy pink delight',
    cost: 27,
    quantity: 3,
    xp: 25,
    color: '#be91a4',
  },
] as const;
export const OUTFITS = [
  { id: 'base', name: 'Original', subtitle: 'Perfectly Blobby', cost: 0 },
  { id: 'glasses', name: 'Daydreamer', subtitle: 'Glasses & straw hat', cost: 0 },
  { id: 'sweater', name: 'Cosy days', subtitle: 'Soft knit & straw hat', cost: 0 },
  { id: 'raincoat', name: 'Rain or shine', subtitle: 'Yellow coat & boots', cost: 0 },
  { id: 'frog', name: 'Froggy', subtitle: 'A little pond explorer', cost: 80 },
  { id: 'starlight', name: 'Stargazer', subtitle: 'Nightcap & a starry scarf', cost: 100 },
  { id: 'strawberry', name: 'Strawberry', subtitle: 'Berry beret & a little apron', cost: 90 },
] as const;
export interface ShopProduct {
  id: string;
  kind: 'food' | 'outfit' | 'room';
  item: FoodId | BlobbyVariant | RoomItemId;
  name: string;
  description: string;
  price: number;
  quantity: number;
}
// Stable app catalog IDs. Platform product IDs belong in a future billing adapter.
export const PRODUCTS: ShopProduct[] = [
  ...ROOM_COLLECTION.map((item) => ({
    id: 'room.' + item.id,
    kind: 'room' as const,
    item: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    quantity: 1,
  })),
  ...FOODS.map((f) => ({
    id: 'food.' + f.id,
    kind: 'food' as const,
    item: f.id,
    name: f.name,
    description: f.description,
    price: f.cost,
    quantity: f.quantity,
  })),
  ...OUTFITS.map((o) => ({
    id: 'outfit.' + o.id,
    kind: 'outfit' as const,
    item: o.id,
    name: o.name,
    description: o.subtitle,
    price: o.cost,
    quantity: 1,
  })),
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
export const DAILY_LEAVES = 25;
export const CHECK_IN_LEAVES = 10;
export const FREE_APPLES = 3;
export function starterMarket(): MarketState {
  return {
    coins: 120,
    checkInRewards: {},
    foods: { apple: 0, berries: 1, dumpling: 1, strawberry: 0, cookie: 0, mochi: 0 },
    ownedOutfits: ['base', 'glasses', 'sweater', 'raincoat'],
    ownedRoomItems: Object.values(DEFAULT_ROOM),
    orders: [],
  };
}
