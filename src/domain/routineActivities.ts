import type { AppData, Routine } from '@/types';
export function routineActivityAvailable(data: AppData, activity: Routine['activity']): boolean {
  if (!activity) return false;
  if (activity === 'bed') return !data.hiddenGroups.includes('Bed');
  const garden = activity === 'sand' || activity === 'garden';
  const item =
    activity === 'sand'
      ? 'sand_garden'
      : activity === 'garden'
        ? 'bonsai'
        : activity === 'tea'
          ? 'tea_set'
          : 'record_player';
  return (
    data.market.ownedRoomItems.includes(item) &&
    (garden ? data.room.garden : data.room.table) === item &&
    !data.hiddenGroups.includes(garden ? 'Bonsai' : 'Tea_table')
  );
}
