import * as routines from '@/domain/routines';
import type { RoutineInput, RoutineStatus } from '@/types';
import { readBinding, serializeLocal, type CloudBinding } from '@/cloud/local';
import type { PaidOrder } from '@/native/leaves';
import { isBlobbyVoice } from '@/domain/voices';
import { persistNativeStorage } from '@/native/storage';
import { roomGameFor, roomGroup, roomItem } from '@/domain/room';
import { buyRoomWithLeaves, buyWithLeaves, claimDailyLeaves, foodQuantity } from '@/domain/market';
import { CHECK_IN_LEAVES, FREE_APPLES, productById } from '@/domain/catalog';
import { create } from 'zustand';
import type {
  AnimationName,
  AppData,
  BlobbyVariant,
  MedicationInput,
  FoodId,
  RoomItemId,
  Result,
} from '@/types';
import {
  addDays,
  dateKey,
  dosesForDay,
  findDose,
  formatDosage,
  latestSchedule,
  scheduleAt,
  validateMedication,
} from '@/domain/schedule';
import type { ReminderDelivery } from '@/domain/reminders';
import { activityDuration } from '@/domain/choreography';
import { careForDay, foodById } from '@/domain/companion';
import { emptyData, parseData, saveLocalData, STORAGE_KEY } from '@/domain/storage';

function readInitial(): { data: AppData; storageError: string; cloudOwner: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? parseData(JSON.parse(raw)) : emptyData();
    if (raw && JSON.parse(raw).schemaVersion === 1) {
      const upgraded = serializeLocal(data, readBinding(raw));
      saveLocalData(upgraded);
      persistNativeStorage(upgraded);
    }
    return {
      data,
      storageError: '',
      cloudOwner: readBinding(raw)?.ownerId ?? null,
    };
  } catch {
    return {
      data: emptyData(),
      cloudOwner: null,
      storageError:
        'Your saved data could not be opened. It has been kept untouched. Download it in Profile, then restore a backup or reset.',
    };
  }
}
export interface CheckInMoment {
  id: string;
  doseId: string | null;
  title: string;
  allDone: boolean;
  leaves: number;
}

interface State {
  saveRoutine: (input: RoutineInput, id?: string) => Result;
  setRoutineStatus: (id: string, status: 'active' | 'paused' | 'archived') => Result;
  recordRoutine: (id: string, status: RoutineStatus) => Result;
  undoRoutine: (id: string) => Result;
  laterRoutine: (id: string) => Result;
  hideRoutinesToday: (ids: string[], hide: boolean) => Result;
  dismissRoutineIntroduction: () => Result;
  data: AppData;
  cloudOwner: string | null;
  storageError: string;
  currentAnimation: AnimationName;
  reactionUntil: number;
  reactionId: number;
  previewAnimation: AnimationName | null;
  previewPaused: boolean;
  previewState: (animation: AnimationName | null) => void;
  setPreviewPaused: (paused: boolean) => void;
  feedBlobby: (food: FoodId) => Result;
  completePaidOrder: (order: PaidOrder) => Result;
  buyProduct: (productId: string, orderId: string) => Result;
  buyRoomProduct: (productId: string, orderId: string) => Result;
  claimShopGift: () => Result;
  careForBlobby: (kind: 'pet' | 'play') => Result;
  celebration: CheckInMoment | null;
  previewCelebration: () => void;
  dismissCelebration: (id: string) => void;
  toast: { message: string; undoId?: string; checkIn?: boolean } | null;
  completeWelcome: (name: string, petName: string) => Result;
  saveMedication: (input: MedicationInput, id?: string) => Result;
  setMedicationStatus: (id: string, status: 'active' | 'paused' | 'archived') => Result;
  setSupply: (id: string, quantity: number) => Result;
  recordDose: (id: string, status: 'taken' | 'skipped', note?: string) => Result;
  undoDose: (id: string) => Result;
  snoozeDose: (id: string, minutes: number) => Result;
  markNotified: (deliveries: ReminderDelivery[]) => Result;
  setProfile: (name: string, petName: string) => Result;
  setVoice: (voice: AppData['voice']) => Result;
  setOutfit: (outfit: BlobbyVariant) => Result;
  toggleRoomItem: (id: string) => Result;
  equipRoomItem: (item: RoomItemId) => Result;
  setCalmMode: () => Result;
  setPreference: (key: keyof AppData['preferences'], value: boolean) => Result;
  restore: (data: AppData) => Result;
  reset: () => Result;
  react: (animation: AnimationName) => void;
  settle: () => void;
  showToast: (message: string, undoId?: string) => void;
  dismissToast: () => void;
  sync: () => void;
  applyCloud: (data: AppData, binding: CloudBinding | null) => Result;
}
export const useAppStore = create<State>((set, get) => {
  function commit(transform: (data: AppData) => AppData, replace = false): Result {
    let next: AppData;
    let binding: CloudBinding | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let recoveringMetadata = false;
      try {
        binding = readBinding(raw);
      } catch (error) {
        if (!replace || !get().storageError) throw error;
        recoveringMetadata = true;
      }
      if (!recoveringMetadata && (binding?.ownerId ?? null) !== get().cloudOwner)
        throw new Error('The account changed in another window. Refresh before saving.');
      const data = !replace && raw ? parseData(JSON.parse(raw)) : get().data;
      next = transform(data);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not read saved data.',
      };
    }
    try {
      next.updatedAt = new Date().toISOString();
      const serialized = serializeLocal(next, binding);
      saveLocalData(serialized);
      persistNativeStorage(serialized);
      set({ data: next, cloudOwner: binding?.ownerId ?? null, storageError: '' });
      return { ok: true };
    } catch {
      const error =
        'This change could not be saved. Device storage may be full or unavailable. Export a backup before clearing space.';
      set({ storageError: error });
      return { ok: false, error };
    }
  }
  return {
    ...readInitial(),
    saveRoutine: (input, id) =>
      commit((data) =>
        routines.saveRoutine(data, input, id ?? crypto.randomUUID(), new Date(), !!id),
      ),
    setRoutineStatus: (id, status) => commit((data) => routines.setRoutineStatus(data, id, status)),
    recordRoutine: (id, status) => commit((data) => routines.recordRoutine(data, id, status)),
    undoRoutine: (id) => commit((data) => routines.undoRoutine(data, id)),
    laterRoutine: (id) => commit((data) => routines.laterRoutine(data, id)),
    hideRoutinesToday: (ids, hide) => commit((data) => routines.hideRoutinesToday(data, ids, hide)),
    dismissRoutineIntroduction: () =>
      commit((data) => ({ ...data, selfCare: { ...data.selfCare, introductionDismissed: true } })),
    applyCloud: (data, binding) => {
      try {
        const next = parseData(data);
        const serialized = serializeLocal(next, binding);
        saveLocalData(serialized);
        persistNativeStorage(serialized);
        set({
          data: next,
          cloudOwner: binding?.ownerId ?? null,
          storageError: '',
          currentAnimation: 'idle',
          reactionUntil: 0,
          previewAnimation: null,
          toast: null,
          celebration: null,
        });
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'The device copy could not be saved. Your existing data has been kept.',
        };
      }
    },
    currentAnimation: 'idle',
    reactionUntil: 0,
    reactionId: 0,
    previewAnimation: null,
    previewPaused: false,
    toast: null,
    celebration: null,
    previewCelebration: () => {
      set({
        celebration: {
          id: crypto.randomUUID(),
          doseId: null,
          title: 'Celebration preview',
          leaves: 0,
          allDone: false,
        },
      });
      get().showToast('Celebration preview. No dose was recorded.');
    },
    dismissCelebration: (id) => {
      if (get().celebration?.id === id) set({ celebration: null });
    },
    completeWelcome: (name, petName) =>
      commit((data) => ({
        ...data,
        onboarded: true,
        profile: {
          name: name.trim().slice(0, 40),
          petName: petName.trim().slice(0, 40) || 'Blobby',
        },
      })),
    saveMedication: (input, id) => {
      const error = validateMedication(input);
      if (error) return { ok: false, error };
      return commit((data) => {
        if (!id && data.medications.length >= 300)
          throw new Error(
            'The one-device MVP supports up to 300 medications, including archived items.',
          );
        const previous = id ? data.medications.find((m) => m.id === id) : undefined;
        if (id && !previous)
          throw new Error('This medication no longer exists. Refresh and try again.');
        // Changing a time must not create an extra dose after today's check-in.
        const tomorrow = addDays(dateKey(), 1);
        const from = previous
          ? latestSchedule(previous).from > tomorrow
            ? latestSchedule(previous).from
            : tomorrow
          : input.startDate;
        const times = [...input.times].sort(),
          days = [...input.days].sort((a, b) => a - b);
        const medId = id ?? crypto.randomUUID();
        const takenIds = Object.values(data.records)
          .filter((r) => r.medicationId === medId && r.status === 'taken')
          .map((r) => r.id);
        const medication = {
          id: medId,
          name: input.name.trim(),
          dosage: formatDosage(input.strengthMg!, input.tabletsPerDose!),
          strengthMg: input.strengthMg!,
          tabletsPerDose: input.tabletsPerDose!,
          instructions: input.instructions.trim(),
          color: input.color,
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          archived: previous?.archived ?? false,
          schedules: [
            ...(previous?.schedules.filter((s) => s.from < from) ?? []),
            {
              from,
              times,
              days,
              active: previous ? latestSchedule(previous).active && !previous.archived : true,
            },
          ],
          stock:
            previous && !input.updateSupply
              ? previous.stock
              : input.supply === null
                ? null
                : { quantity: input.supply, baselineTakenIds: takenIds },
          refillAt: input.refillAt,
        };
        return {
          ...data,
          medications: previous
            ? data.medications.map((m) => (m.id === id ? medication : m))
            : [...data.medications, medication],
        };
      });
    },
    setMedicationStatus: (id, status) =>
      commit((data) => {
        const med = data.medications.find((m) => m.id === id);
        if (!med) throw new Error('Medication not found.');
        const today = dateKey(),
          current = scheduleAt(med, today),
          latest = current ?? latestSchedule(med);
        const from = current ? today : latest.from;
        return {
          ...data,
          medications: data.medications.map((m) =>
            m.id === id
              ? {
                  ...m,
                  archived: status === 'archived',
                  schedules: [
                    ...m.schedules.filter((s) => s.from < from),
                    { ...latest, from, active: status === 'active' },
                    ...m.schedules
                      .filter((s) => s.from > from)
                      .map((s) => ({ ...s, active: status === 'active' })),
                  ],
                }
              : m,
          ),
        };
      }),
    setSupply: (id, quantity) =>
      commit((data) => {
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000)
          throw new Error('Enter a whole number between 0 and 100,000.');
        if (!data.medications.some((m) => m.id === id)) throw new Error('Medication not found.');
        return {
          ...data,
          medications: data.medications.map((m) =>
            m.id === id
              ? {
                  ...m,
                  stock: {
                    quantity,
                    baselineTakenIds: Object.values(data.records)
                      .filter((r) => r.medicationId === id && r.status === 'taken')
                      .map((r) => r.id),
                  },
                }
              : m,
          ),
        };
      }),
    recordDose: (id, status, note = '') => {
      let firstCheckIn = false;
      let doseDate = '';
      let leaves = 0;
      const result = commit((data) => {
        const dose = findDose(data, id);
        if (!dose)
          throw new Error(
            'This dose is no longer scheduled. Refresh the page to see your latest schedule.',
          );
        if (dose.date > dateKey()) throw new Error('Future doses cannot be recorded yet.');
        if (note.length > 500) throw new Error('Keep your note under 500 characters.');
        if (dose.record?.status === status && dose.record.note === note.trim()) return { ...data };
        // Decide against the latest saved record, including writes from another tab.
        firstCheckIn = !dose.record;
        doseDate = dose.date;
        leaves =
          firstCheckIn && !Object.hasOwn(data.market.checkInRewards, id)
            ? Math.min(CHECK_IN_LEAVES, 1000000 - data.market.coins)
            : 0;
        const market = {
          ...data.market,
          coins: data.market.coins + leaves,
          checkInRewards: {
            ...data.market.checkInRewards,
            [id]: data.market.checkInRewards[id] ?? leaves,
          },
        };
        const { record: _record, ...snapshot } = dose;
        const reminders = { ...data.reminders };
        delete reminders[id];
        return {
          ...data,
          reminders,
          market,
          records: {
            ...data.records,
            [id]: {
              ...snapshot,
              status,
              note: note.trim(),
              recordedAt: new Date().toISOString(),
            },
          },
        };
      });
      if (result.ok) {
        const today = dosesForDay(get().data, dateKey());
        const allDone = doseDate === dateKey() && today.length > 0 && today.every((d) => d.record);
        const message =
          status === 'taken'
            ? 'Dose recorded. One little thing, done.'
            : 'Recorded as skipped. Thanks for checking in.';
        set({
          toast: {
            message:
              message +
              (allDone ? ' All checked in for today.' : '') +
              (leaves && !get().data.preferences.hideRewards ? ` +${leaves} leaves.` : ''),
            undoId: id,
            checkIn: true,
          },
        });
        if (firstCheckIn) {
          set({
            previewAnimation: null,
            previewPaused: false,
            // This event is deliberately ephemeral: reloads and syncs never replay it.
            celebration: {
              id: crypto.randomUUID(),
              doseId: id,
              leaves,
              title: allDone
                ? 'All checked in!'
                : status === 'taken'
                  ? 'Dose recorded!'
                  : 'Check-in saved!',
              allDone,
            },
          });
          get().react('celebrating');
        }
      }
      return result;
    },
    undoDose: (id) => {
      const result = commit((data) => {
        const records = { ...data.records };
        delete records[id];
        return { ...data, records };
      });
      if (result.ok) {
        set({
          currentAnimation: 'idle',
          reactionUntil: 0,
          celebration: get().celebration?.doseId === id ? null : get().celebration,
        });
        get().showToast('Check-in removed. Your history and supply are updated.');
      }
      return result;
    },
    snoozeDose: (id, minutes) =>
      commit((data) => {
        const dose = findDose(data, id);
        if (!dose || dose.record || dose.date !== dateKey())
          throw new Error('Only an unrecorded dose for today can be snoozed.');
        if (![5, 10, 15, 30].includes(minutes))
          throw new Error('Choose a supported snooze duration.');
        return {
          ...data,
          reminders: {
            ...data.reminders,
            [id]: {
              snoozedUntil: new Date(Date.now() + minutes * 60000).toISOString(),
            },
          },
        };
      }),
    markNotified: (deliveries) =>
      commit((data) => {
        const reminders = Object.fromEntries(
          Object.entries(data.reminders).filter(
            ([key]) => key.split('@')[1] >= addDays(dateKey(), -1),
          ),
        );
        for (const { id, snoozedUntil } of deliveries) {
          const dose = findDose(data, id);
          // A check-in or a new snooze made while the OS was responding wins.
          if (!dose || dose.record || reminders[id]?.snoozedUntil !== snoozedUntil) continue;
          reminders[id] = {
            ...reminders[id],
            notifiedAt: new Date().toISOString(),
          };
        }
        return { ...data, reminders };
      }),
    setProfile: (name, petName) =>
      commit((data) => ({
        ...data,
        profile: {
          name: name.trim().slice(0, 40),
          petName: petName.trim().slice(0, 40) || 'Blobby',
        },
      })),
    setVoice: (voice) =>
      commit((data) => {
        if (!isBlobbyVoice(voice)) throw new Error('Choose one of Blobby’s available voices.');
        return { ...data, voice };
      }),
    setOutfit: (outfit) =>
      commit((data) => {
        if (!data.market.ownedOutfits.includes(outfit))
          throw new Error('Get this outfit in the shop first.');
        return { ...data, outfit };
      }),
    equipRoomItem: (id) => {
      const result = commit((data) => {
        const item = roomItem(id);
        if (!item || !data.market.ownedRoomItems.includes(id))
          throw new Error('Get this item in the room shop first.');
        return {
          ...data,
          room: { ...data.room, [item.slot]: id },
          hiddenGroups: data.hiddenGroups.filter((group) => group !== roomGroup(item.slot)),
        };
      });
      if (result.ok)
        set({
          currentAnimation: 'idle',
          reactionUntil: 0,
          previewAnimation: null,
          previewPaused: false,
        });
      return result;
    },
    toggleRoomItem: (id) =>
      commit((data) => ({
        ...data,
        hiddenGroups: data.hiddenGroups.includes(id)
          ? data.hiddenGroups.filter((v) => v !== id)
          : [...data.hiddenGroups, id],
      })),
    setCalmMode: () =>
      commit((data) => ({
        ...data,
        preferences: {
          ...data.preferences,
          reducedMotion: true,
          pauseScene: true,
          hideRewards: true,
          gentleMoods: true,
          relaxedGarden: true,
          showWisdom: false,
        },
      })),
    setPreference: (key, value) =>
      commit((data) => ({
        ...data,
        preferences: { ...data.preferences, [key]: value },
      })),
    previewState: (animation) => set({ previewAnimation: animation, previewPaused: false }),
    setPreviewPaused: (paused) => set({ previewPaused: paused }),
    completePaidOrder: (order) =>
      commit((data) => {
        const product = productById(order.productId);
        if (
          !product ||
          !Number.isInteger(order.paidLeaves) ||
          order.paidLeaves <= 0 ||
          !Number.isInteger(order.earnedLeaves) ||
          order.earnedLeaves < 0 ||
          order.paidLeaves + order.earnedLeaves !== product.price
        )
          throw new Error('This leaf order couldn’t be verified.');
        const prior = data.market.orders.find((entry) => entry.id === order.id);
        if (prior) {
          if (prior.productId !== order.productId)
            throw new Error('This order belongs to another item.');
          return data;
        }
        if (data.market.coins < order.earnedLeaves)
          throw new Error(
            'Your shop order is waiting for its earned leaves. Open Leaves to retry.',
          );
        const funded = {
          ...data,
          market: { ...data.market, coins: data.market.coins + order.paidLeaves },
        };
        return product.kind === 'room'
          ? buyRoomWithLeaves(funded, order.productId, order.id)
          : buyWithLeaves(funded, order.productId, order.id);
      }),
    buyProduct: (productId, orderId) => {
      const result = commit((data) => buyWithLeaves(data, productId, orderId));
      if (result.ok)
        get().showToast(
          productById(productId)!.name +
            ' added to your ' +
            (productById(productId)!.kind === 'food'
              ? 'pantry.'
              : productById(productId)!.kind === 'room'
                ? 'room collection.'
                : 'wardrobe.'),
        );
      return result;
    },
    buyRoomProduct: (productId, orderId) => {
      const result = commit((data) => buyRoomWithLeaves(data, productId, orderId));
      if (result.ok) {
        set({
          currentAnimation: 'idle',
          reactionUntil: 0,
          previewAnimation: null,
          previewPaused: false,
        });
      }
      return result;
    },
    claimShopGift: () => commit((data) => claimDailyLeaves(data)),
    feedBlobby: (foodId) => {
      const food = foodById(foodId);
      if (!food) return { ok: false, error: 'Choose a snack from the pantry.' };
      if (get().currentAnimation === 'feeding' && get().reactionUntil !== 0)
        return { ok: false, error: 'Blobby is enjoying this snack.' };
      const result = commit((data) => {
        if (
          data.care.lastFedAt &&
          Date.now() >= Date.parse(data.care.lastFedAt) &&
          Date.now() - Date.parse(data.care.lastFedAt) < 4000
        )
          throw new Error('Blobby is still enjoying that bite. Just a moment!');
        if (foodQuantity(data, foodId) < 1)
          throw new Error(
            'This snack is finished. Find more in the shop, or enjoy free apples tomorrow.',
          );
        const day = dateKey(),
          current = careForDay(data);
        const days = Object.fromEntries(
          Object.entries(data.care.days).filter(([d]) => d >= addDays(day, -90)),
        );
        return {
          ...data,
          market: {
            ...data.market,
            foods: {
              ...data.market.foods,
              [foodId]:
                data.market.foods[foodId] -
                (foodId === 'apple' && current.spent < FREE_APPLES ? 0 : 1),
            },
          },
          care: {
            ...data.care,
            xp: Math.min(1000000000, data.care.xp + food.xp),
            lastFedAt: new Date().toISOString(),
            lastFood: foodId,
            days: {
              ...days,
              [day]: {
                ...current,
                spent: current.spent + (foodId === 'apple' && current.spent < FREE_APPLES ? 1 : 0),
                feeds: current.feeds + 1,
              },
            },
          },
        };
      });
      if (result.ok) {
        set({ previewAnimation: null, previewPaused: false });
        get().react('feeding');
      }
      return result;
    },
    careForBlobby: (kind) => {
      if (!['pet', 'play'].includes(kind)) return { ok: false, error: 'Choose a cuddle or play.' };
      const result = commit((data) => {
        const day = dateKey(),
          current = careForDay(data),
          key = kind === 'pet' ? 'petted' : 'played';
        const days = Object.fromEntries(
          Object.entries(data.care.days).filter(([d]) => d >= addDays(day, -90)),
        );
        return {
          ...data,
          market: {
            ...data.market,
            coins: Math.min(1000000, data.market.coins + (current[key] ? 0 : 5)),
          },
          care: {
            ...data.care,
            xp: Math.min(1000000000, data.care.xp + (current[key] ? 0 : 5)),
            days: { ...days, [day]: { ...current, [key]: true } },
          },
        };
      });
      if (result.ok) {
        set({ previewAnimation: null, previewPaused: false });
        get().react(kind === 'pet' ? 'petting' : 'dance');
        get().showToast(
          kind === 'pet'
            ? 'A little cuddle, just for ' + get().data.profile.petName + '.'
            : 'Time for a tiny dance party.',
        );
      }
      return result;
    },
    restore: (data) => {
      try {
        const clean = parseData(data);
        return commit(
          () => ({
            ...clean,
            preferences: { ...clean.preferences, reminders: false },
          }),
          true,
        );
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Invalid backup.',
        };
      }
    },
    reset: () => {
      const result = commit(() => emptyData(), true);
      if (result.ok)
        set({
          currentAnimation: 'idle',
          reactionUntil: 0,
          previewAnimation: null,
          previewPaused: false,
          toast: null,
          celebration: null,
        });
      return result;
    },
    react: (animation) =>
      set((state) => ({
        currentAnimation: animation,
        reactionId: state.reactionId + 1,
        // -1 means the scene owns completion. A paused/hidden room sequence must
        // not be interrupted by a wall-clock timer. Still-image mode retains one.
        reactionUntil:
          roomGameFor(animation, state.data.room) ||
          animation === 'rest' ||
          (['tend', 'tea', 'feeding'].includes(animation) && !state.data.preferences.staticScene)
            ? -1
            : Date.now() + activityDuration(animation),
      })),
    settle: () => {
      if (get().reactionUntil > 0 && get().reactionUntil <= Date.now())
        set({ currentAnimation: 'idle', reactionUntil: 0 });
    },
    showToast: (message, undoId) => set({ toast: { message, undoId } }),
    dismissToast: () => set({ toast: null }),
    sync: () => {
      const fresh = readInitial();
      if (
        !fresh.storageError &&
        (fresh.cloudOwner !== get().cloudOwner ||
          JSON.stringify(fresh.data) !== JSON.stringify(get().data))
      )
        set(fresh);
      else if (fresh.storageError) set({ storageError: fresh.storageError });
    },
  };
});
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) useAppStore.getState().sync();
  });
  if (import.meta.env.DEV)
    (window as unknown as { __appStore?: typeof useAppStore }).__appStore = useAppStore;
}
