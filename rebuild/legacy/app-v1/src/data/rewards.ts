import type { OutfitDef, FurnitureDef, MilestoneDef } from '@/types';

// ── OUTFITS ───────────────────────────────────────────────────────
export const OUTFITS: OutfitDef[] = [
  // Starter outfits (unlocked by default)
  {
    id: 'base', name: 'Classic Blobby', description: 'The original blob',
    variant: 'base', icon: '🫧', rarity: 'common',
    unlockCondition: { type: 'default' },
  },
  {
    id: 'raincoat', name: 'Rainy Day', description: 'Ready for any weather',
    variant: 'raincoat', icon: '🌧️', rarity: 'common',
    unlockCondition: { type: 'default' },
  },
  {
    id: 'sweater', name: 'Cozy Knit', description: 'Warm and snuggly',
    variant: 'sweater', icon: '🧶', rarity: 'common',
    unlockCondition: { type: 'default' },
  },
  {
    id: 'glasses', name: 'Smarty Blob', description: 'Looking intellectual',
    variant: 'glasses', icon: '🤓', rarity: 'common',
    unlockCondition: { type: 'default' },
  },

  // Streak rewards
  {
    id: 'party_hat', name: 'Party Blobby', description: 'Celebrating your first week!',
    variant: 'base', icon: '🎉', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 7 },
  },
  {
    id: 'scarf', name: 'Scarf Blobby', description: 'Two weeks of consistency!',
    variant: 'sweater', icon: '🧣', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 14 },
  },
  {
    id: 'sunglasses', name: 'Cool Blob', description: 'A whole month — you\'re unstoppable',
    variant: 'glasses', icon: '😎', rarity: 'rare',
    unlockCondition: { type: 'streak', days: 30 },
  },

  // Milestone rewards
  {
    id: 'wizard_hat', name: 'Wizard Blobby', description: 'Master of medication magic',
    variant: 'base', icon: '🧙', rarity: 'rare',
    unlockCondition: { type: 'total_doses', count: 100 },
  },
  {
    id: 'bow_tie', name: 'Fancy Blob', description: 'Dapper and dedicated',
    variant: 'glasses', icon: '🎀', rarity: 'rare',
    unlockCondition: { type: 'streak', days: 60 },
  },
  {
    id: 'flower_crown', name: 'Garden Blobby', description: 'Blooming with health',
    variant: 'base', icon: '🌸', rarity: 'rare',
    unlockCondition: { type: 'mood_time', mood: 'happy', minutes: 120 },
  },

  // Legendary unlocks
  {
    id: 'astronaut', name: 'Space Blobby', description: 'Out of this world dedication',
    variant: 'base', icon: '🚀', rarity: 'legendary',
    unlockCondition: { type: 'streak', days: 100 },
  },
  {
    id: 'pirate', name: 'Captain Blob', description: 'Arr! A treasure of good health',
    variant: 'raincoat', icon: '🏴‍☠️', rarity: 'legendary',
    unlockCondition: { type: 'total_doses', count: 500 },
  },
  {
    id: 'superhero', name: 'Super Blobby', description: 'A true health hero',
    variant: 'base', icon: '🦸', rarity: 'legendary',
    unlockCondition: { type: 'streak', days: 365 },
  },
];

// ── FURNITURE ─────────────────────────────────────────────────────
export const FURNITURE: FurnitureDef[] = [
  // Default items
  {
    id: 'cushion_default', name: 'Basic Cushion', description: 'A comfy spot',
    icon: '🛋️', category: 'seating', rarity: 'common',
    unlockCondition: { type: 'default' },
  },
  {
    id: 'plant_small', name: 'Little Sprout', description: 'A tiny green friend',
    icon: '🌱', category: 'plants', rarity: 'common',
    unlockCondition: { type: 'default' },
  },

  // Streak unlocks
  {
    id: 'cushion_cloud', name: 'Cloud Cushion', description: 'Floaty and soft',
    icon: '☁️', category: 'seating', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 3 },
  },
  {
    id: 'lamp_warm', name: 'Warm Lamp', description: 'A cozy glow',
    icon: '💡', category: 'lighting', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 5 },
  },
  {
    id: 'plant_tall', name: 'Tall Fern', description: 'Growing tall and strong',
    icon: '🌿', category: 'plants', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 10 },
  },
  {
    id: 'rug_round', name: 'Round Rug', description: 'Ties the room together',
    icon: '🔵', category: 'decor', rarity: 'uncommon',
    unlockCondition: { type: 'total_doses', count: 20 },
  },
  {
    id: 'window_curtains', name: 'Linen Curtains', description: 'Soft and breezy',
    icon: '🪟', category: 'window', rarity: 'uncommon',
    unlockCondition: { type: 'streak', days: 14 },
  },
  {
    id: 'shelf_books', name: 'Bookshelf', description: 'Knowledge is power',
    icon: '📚', category: 'decor', rarity: 'rare',
    unlockCondition: { type: 'total_doses', count: 50 },
  },

  // Rare unlocks
  {
    id: 'cushion_leaf', name: 'Leaf Cushion', description: 'Nature\'s embrace',
    icon: '🍃', category: 'seating', rarity: 'rare',
    unlockCondition: { type: 'streak', days: 30 },
  },
  {
    id: 'lamp_moon', name: 'Moon Lamp', description: 'Gentle lunar glow',
    icon: '🌙', category: 'lighting', rarity: 'rare',
    unlockCondition: { type: 'streak', days: 21 },
  },
  {
    id: 'plant_succulent', name: 'Rare Succulent', description: 'Precious and rare',
    icon: '🪴', category: 'plants', rarity: 'rare',
    unlockCondition: { type: 'total_doses', count: 100 },
  },
  {
    id: 'window_fairy_lights', name: 'Fairy Lights', description: 'Magical ambiance',
    icon: '✨', category: 'window', rarity: 'rare',
    unlockCondition: { type: 'streak', days: 45 },
  },

  // Legendary
  {
    id: 'rug_star', name: 'Star Rug', description: 'You\'re a star!',
    icon: '⭐', category: 'decor', rarity: 'legendary',
    unlockCondition: { type: 'streak', days: 60 },
  },
  {
    id: 'lamp_lava', name: 'Lava Lamp', description: 'Groovy and mesmerizing',
    icon: '🫧', category: 'lighting', rarity: 'legendary',
    unlockCondition: { type: 'streak', days: 90 },
  },
  {
    id: 'shelf_crystals', name: 'Crystal Shelf', description: 'Healing energy',
    icon: '🔮', category: 'decor', rarity: 'legendary',
    unlockCondition: { type: 'total_doses', count: 365 },
  },
];

// ── MILESTONES ────────────────────────────────────────────────────
export const MILESTONES: MilestoneDef[] = [
  // First steps
  {
    id: 'first_dose', name: 'First Step', description: 'Logged your first dose!',
    icon: '🌟', condition: { type: 'first_dose' },
    reward: { type: 'title', title: 'Beginner' },
  },

  // Streak milestones
  {
    id: 'streak_3', name: 'Getting Started', description: '3 days in a row!',
    icon: '🔥', condition: { type: 'streak', days: 3 },
    reward: { type: 'furniture', furnitureId: 'cushion_cloud' },
  },
  {
    id: 'streak_7', name: 'One Week Wonder', description: 'A full week of consistency!',
    icon: '🎯', condition: { type: 'streak', days: 7 },
    reward: { type: 'outfit', outfitId: 'party_hat' },
  },
  {
    id: 'streak_14', name: 'Two Week Warrior', description: 'Two weeks strong!',
    icon: '💪', condition: { type: 'streak', days: 14 },
    reward: { type: 'outfit', outfitId: 'scarf' },
  },
  {
    id: 'streak_30', name: 'Monthly Master', description: 'A whole month — incredible!',
    icon: '👑', condition: { type: 'streak', days: 30 },
    reward: { type: 'outfit', outfitId: 'sunglasses' },
  },
  {
    id: 'streak_60', name: 'Two Month Titan', description: 'Unstoppable consistency',
    icon: '🏆', condition: { type: 'streak', days: 60 },
    reward: { type: 'outfit', outfitId: 'bow_tie' },
  },
  {
    id: 'streak_100', name: 'Century Club', description: '100 days of dedication',
    icon: '💯', condition: { type: 'streak', days: 100 },
    reward: { type: 'outfit', outfitId: 'astronaut' },
  },
  {
    id: 'streak_365', name: 'Year of Health', description: 'A full year — legendary!',
    icon: '🌍', condition: { type: 'streak', days: 365 },
    reward: { type: 'outfit', outfitId: 'superhero' },
  },

  // Total dose milestones
  {
    id: 'total_10', name: 'Getting the Hang of It', description: '10 doses logged',
    icon: '📋', condition: { type: 'total_doses', count: 10 },
    reward: { type: 'furniture', furnitureId: 'plant_tall' },
  },
  {
    id: 'total_50', name: 'Half Century', description: '50 doses — you\'re committed',
    icon: '🎪', condition: { type: 'total_doses', count: 50 },
    reward: { type: 'window_scene', sceneId: 'river' },
  },
  {
    id: 'total_100', name: 'Triple Digits', description: '100 doses logged!',
    icon: '🧙', condition: { type: 'total_doses', count: 100 },
    reward: { type: 'outfit', outfitId: 'wizard_hat' },
  },
  {
    id: 'total_500', name: 'Health Legend', description: '500 doses — a true legend',
    icon: '🏴‍☠️', condition: { type: 'total_doses', count: 500 },
    reward: { type: 'outfit', outfitId: 'pirate' },
  },
];

// ── Helpers ───────────────────────────────────────────────────────
export const RARITY_COLORS: Record<string, string> = {
  common:    '#A8A8A8',
  uncommon:  '#4ECDC4',
  rare:      '#7B68EE',
  legendary: '#FFD700',
};

export function getOutfit(id: string): OutfitDef | undefined {
  return OUTFITS.find((o) => o.id === id);
}

export function getFurniture(id: string): FurnitureDef | undefined {
  return FURNITURE.find((f) => f.id === id);
}

export function getMilestone(id: string): MilestoneDef | undefined {
  return MILESTONES.find((m) => m.id === id);
}
