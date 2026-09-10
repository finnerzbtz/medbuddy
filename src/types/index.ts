import type { BlobbyVoice } from '../domain/voices';
export type BlobbyVariant =
  | 'base'
  | 'raincoat'
  | 'sweater'
  | 'glasses'
  | 'frog'
  | 'starlight'
  | 'strawberry';
export type AnimationName =
  | 'idle'
  | 'wave'
  | 'rest'
  | 'happy'
  | 'celebrating'
  | 'worried'
  | 'sick'
  | 'critical'
  | 'recovering'
  | 'walk_to_cushion'
  | 'feeding'
  | 'petting'
  | 'dance'
  | 'curious'
  | 'stretch'
  | 'tea'
  | 'tend'
  | 'ball'
  | 'window';
export type FoodId = 'apple' | 'berries' | 'dumpling' | 'strawberry' | 'cookie' | 'mochi';
export interface RoomStyle {
  garden: 'bonsai' | 'sand_garden';
  table: 'tea_set' | 'record_player';
  lamp: 'paper_lamp' | 'lava_lamp' | 'mushroom_lamp';
  view: 'garden_view' | 'coast_view' | 'mountain_view';
}
export type RoomSlot = keyof RoomStyle;
export type RoomItemId = RoomStyle[RoomSlot];
export interface MarketOrder {
  id: string;
  productId: string;
  price: number;
  quantity: number;
  createdAt: string;
}
export interface MarketState {
  coins: number;
  checkInRewards: Record<string, number>;
  foods: Record<FoodId, number>;
  ownedOutfits: BlobbyVariant[];
  ownedRoomItems: RoomItemId[];
  lastGiftDay?: string;
  orders: MarketOrder[];
}
export interface CareDay {
  spent: number;
  feeds: number;
  petted: boolean;
  played: boolean;
}
export interface CompanionCare {
  xp: number;
  days: Record<string, CareDay>;
  lastFedAt?: string;
  lastFood?: FoodId;
}
export interface Schedule {
  from: string;
  times: string[];
  days: number[];
  active: boolean;
}
export interface Medication {
  id: string;
  name: string;
  dosage: string;
  strengthMg?: number;
  tabletsPerDose?: number;
  instructions: string;
  color: string;
  createdAt: string;
  archived: boolean;
  schedules: Schedule[];
  stock: { quantity: number; baselineTakenIds: string[] } | null;
  refillAt: number;
}
export interface MedicationInput {
  name: string;
  strengthMg: number | null;
  tabletsPerDose: number | null;
  instructions: string;
  color: string;
  times: string[];
  days: number[];
  startDate: string;
  supply: number | null;
  updateSupply?: boolean;
  refillAt: number;
}
export interface DoseRecord {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  name: string;
  dosage: string;
  strengthMg?: number;
  tabletsPerDose?: number;
  instructions: string;
  color: string;
  status: 'taken' | 'skipped';
  recordedAt: string;
  note: string;
}
export interface Dose extends Omit<DoseRecord, 'status' | 'recordedAt' | 'note'> {
  record?: DoseRecord;
}
export interface AppData {
  schemaVersion: 2;
  selfCare: SelfCare;
  onboarded: boolean;
  profile: { name: string; petName: string };
  medications: Medication[];
  records: Record<string, DoseRecord>;
  outfit: BlobbyVariant;
  voice: BlobbyVoice;
  room: RoomStyle;
  hiddenGroups: string[];
  preferences: {
    reducedMotion: boolean;
    staticScene: boolean;
    reminders: boolean;
    lampOn: boolean;
    pauseScene: boolean;
    hideRewards: boolean;
    gentleMoods: boolean;
    relaxedGarden: boolean;
    showWisdom: boolean;
  };
  reminders: Record<string, { snoozedUntil?: string; notifiedAt?: string }>;
  care: CompanionCare;
  market: MarketState;
  updatedAt: string;
}
export interface Result {
  ok: boolean;
  error?: string;
}

export type RoutineCategory = 'rest' | 'everyday-care' | 'enjoyment' | 'connection' | 'preparation';
export type RoutineStatus = 'done' | 'skipped';
export interface RoutineSchedule {
  from: string;
  days: number[];
  time?: string;
  active: boolean;
}
export interface Routine {
  id: string;
  title: string;
  category: RoutineCategory;
  activity?: 'tea' | 'sand' | 'garden' | 'bed' | 'music';
  schedules: RoutineSchedule[];
  createdAt: string;
  archived: boolean;
}
export interface RoutineInput {
  title: string;
  category: RoutineCategory;
  activity?: Routine['activity'];
  days: number[];
  time?: string;
  startDate: string;
}
export interface RoutineRecord {
  id: string;
  routineId: string;
  date: string;
  title: string;
  category: RoutineCategory;
  status: RoutineStatus;
  recordedAt: string;
}
export interface SelfCare {
  routines: Routine[];
  records: Record<string, RoutineRecord>;
  overrides: Record<string, { hiddenForToday?: boolean; laterAt?: string }>;
  rewards: Record<string, { amount: number; rewardDay: string }>;
  introductionDismissed: boolean;
}
