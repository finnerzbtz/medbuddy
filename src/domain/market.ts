import type { AppData, FoodId, RoomItemId } from '../types/index';
import { FREE_APPLES, DAILY_LEAVES, productById } from './catalog';
import { dateKey } from './schedule';
import { roomItem, roomGroup } from './room';

export function foodQuantity(data: AppData, food: FoodId, day = dateKey()) {
  const daily = food === 'apple' ? Math.max(0, FREE_APPLES - (data.care.days[day]?.spent ?? 0)) : 0;
  return data.market.foods[food] + daily;
}
export function buyWithLeaves(data: AppData, productId: string, orderId: string): AppData {
  const product = productById(productId);
  if (!product || !/^[a-zA-Z0-9_-]{1,80}$/.test(orderId))
    throw new Error('Choose an item from the shop.');
  const prior = data.market.orders.find((order) => order.id === orderId);
  if (prior) {
    if (prior.productId !== productId) throw new Error('This order has already been used.');
    return data;
  }
  if (
    product.kind === 'outfit' &&
    data.market.ownedOutfits.includes(product.item as AppData['outfit'])
  )
    throw new Error('This outfit is already in your wardrobe.');
  if (product.kind === 'room' && data.market.ownedRoomItems.includes(product.item as RoomItemId))
    throw new Error('This item is already in your room collection.');
  if (data.market.coins < product.price)
    throw new Error('You need ' + (product.price - data.market.coins) + ' more leaves.');
  if (
    product.kind === 'food' &&
    data.market.foods[product.item as FoodId] + product.quantity > 9999
  )
    throw new Error('Your pantry is full for this snack.');
  return {
    ...data,
    market: {
      ...data.market,
      coins: data.market.coins - product.price,
      foods:
        product.kind === 'food'
          ? {
              ...data.market.foods,
              [product.item]: data.market.foods[product.item as FoodId] + product.quantity,
            }
          : data.market.foods,
      ownedOutfits:
        product.kind === 'outfit'
          ? [...data.market.ownedOutfits, product.item as AppData['outfit']]
          : data.market.ownedOutfits,
      ownedRoomItems:
        product.kind === 'room'
          ? [...data.market.ownedRoomItems, product.item as RoomItemId]
          : data.market.ownedRoomItems,
      orders: [
        ...data.market.orders,
        {
          id: orderId,
          productId,
          price: product.price,
          quantity: product.quantity,
          createdAt: new Date().toISOString(),
        },
      ].slice(-200),
    },
  };
}
/** Buy and place together: a failed save cannot charge without installing the piece. */
export function buyRoomWithLeaves(data: AppData, productId: string, orderId: string): AppData {
  const product = productById(productId);
  const item = product?.kind === 'room' ? roomItem(product.item) : undefined;
  if (!item) throw new Error('Choose a piece from the room shop.');
  const next = buyWithLeaves(data, productId, orderId);
  if (next === data) return data;
  return {
    ...next,
    room: { ...next.room, [item.slot]: item.id },
    hiddenGroups: next.hiddenGroups.filter((group) => group !== roomGroup(item.slot)),
  };
}
export function claimDailyLeaves(data: AppData, day = dateKey()): AppData {
  if (data.market.lastGiftDay && data.market.lastGiftDay >= day)
    throw new Error('Today’s gift is already collected.');
  return {
    ...data,
    market: {
      ...data.market,
      coins: Math.min(1000000, data.market.coins + DAILY_LEAVES),
      lastGiftDay: day,
    },
  };
}
