# Reminduh (Pill Box) — Production Roadmap Design

## Overview

Reminduh is a medication adherence app with a 3D tamagotchi-style companion (Blobby) targeting ADHD/neurodivergent users. This document defines the production architecture, features, and strategy to take the existing Phase 1 prototype to a shippable product with real users.

**Goal**: Side project with real users (not startup scale)
**Target audience**: ADHD/neurodivergent community
**Platform**: Native mobile (Expo) with WebView hybrid for 3D
**Backend**: Supabase
**Timeline**: 1-2 months to testable MVP

---

## 1. Architecture

### Expo + WebView Hybrid

```
┌─────────────────────────────────────┐
│           Expo Native Shell          │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Native    │  │   WebView      │  │
│  │ Screens   │  │                │  │
│  │           │  │  ┌──────────┐  │  │
│  │ • Meds    │  │  │ R3F/     │  │  │
│  │ • Log     │  │  │ Three.js │  │  │
│  │ • Verify  │  │  │ Blobby   │  │  │
│  │ • Settings│  │  │ Scene    │  │  │
│  │           │  │  └──────────┘  │  │
│  └───────────┘  └────────────────┘  │
│         │              │            │
│         └──── Bridge ──┘            │
│           (postMessage)             │
│                                     │
│  ┌─────────────────────────────────┐│
│  │  Expo APIs                      ││
│  │  • Notifications (expo-notifs)  ││
│  │  • Camera (expo-camera)         ││
│  │  • Haptics                      ││
│  └─────────────────────────────────┘│
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │  Supabase   │
        │  • Auth     │
        │  • Postgres │
        │  • Storage  │
        │  (video)    │
        └─────────────┘
```

**The split:**
- **Native screens** (React Native): Meds management, dose log/history, video verification, settings, navigation, notifications. Standard UI — no reason for WebView.
- **WebView**: Only the Blobby 3D scene (existing R3F code). Embedded as a component in the Home screen.
- **Supabase**: Both layers talk to Supabase directly via `@supabase/supabase-js`. Auth token shared via the bridge on init.

---

## 2. Bridge Protocol

JSON messages over `postMessage` / `onMessage`.

### Native → WebView

```json
{ "type": "AUTH_TOKEN", "token": "..." }
{ "type": "DOSE_LOGGED", "medication": "sertraline", "streak": 5 }
{ "type": "EQUIP_OUTFIT", "outfitId": "wizard_hat" }
{ "type": "PET_INTERACTION" }
{ "type": "MOOD_UPDATE", "mood": "happy", "stats": { "happiness": 85, "health": 90, "energy": 70 } }
```

### WebView → Native

```json
{ "type": "BLOBBY_TAPPED" }
{ "type": "ANIMATION_COMPLETE", "animation": "celebrating" }
{ "type": "SCENE_READY" }
{ "type": "SCENE_ERROR", "error": "..." }
```

### State Ownership

- Native side owns all app state (Zustand store moves to React Native).
- WebView is a dumb renderer — receives state, renders Blobby.
- No dual Zustand stores. No sync bugs.
- WebView loads from a bundled local HTML file (no network dependency).
- Fallback: If WebView fails, Home screen shows a 2D Blobby illustration.

---

## 3. Supabase Backend

### Database Schema

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Medications
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  name TEXT NOT NULL,
  dosage TEXT,
  schedule JSONB NOT NULL, -- { times: ["08:00", "20:00"], days: ["mon","tue",...] }
  color TEXT, -- hex
  active BOOLEAN DEFAULT true,
  doses_remaining INTEGER, -- null = not tracking
  doses_per_refill INTEGER, -- for calculating refill reminders
  refill_reminder_at INTEGER, -- remind when doses_remaining hits this
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_offset_minutes INTEGER DEFAULT 0, -- e.g. -15 for "15 min before"
  snooze_minutes INTEGER DEFAULT 10,
  escalation_enabled BOOLEAN DEFAULT false,
  escalation_delay_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Dose Logs
CREATE TABLE dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  medication_id UUID REFERENCES medications(id) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  verified BOOLEAN DEFAULT false,
  verification_url TEXT, -- Supabase Storage path
  status TEXT CHECK (status IN ('taken', 'missed', 'skipped')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pet State
CREATE TABLE pet_state (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  happiness INTEGER DEFAULT 50 CHECK (happiness BETWEEN 0 AND 100),
  health INTEGER DEFAULT 50 CHECK (health BETWEEN 0 AND 100),
  energy INTEGER DEFAULT 50 CHECK (energy BETWEEN 0 AND 100),
  mood TEXT DEFAULT 'content',
  streak INTEGER DEFAULT 0,
  total_doses INTEGER DEFAULT 0,
  equipped_outfit TEXT DEFAULT 'base',
  equipped_furniture JSONB DEFAULT '[]',
  unlocked_outfits JSONB DEFAULT '["base","raincoat","sweater","glasses"]',
  unlocked_furniture JSONB DEFAULT '["cushion_default"]',
  completed_milestones JSONB DEFAULT '[]',
  unlocked_scenes JSONB DEFAULT '["garden"]',
  last_interaction_at TIMESTAMPTZ DEFAULT now(),
  last_dose_log_at TIMESTAMPTZ
);
```

### Security

- RLS on all tables: `auth.uid() = user_id`
- Magic link auth (email only for MVP)

### Offline-First

- Local SQLite cache via `expo-sqlite` for medication data and pending dose logs
- Sync to Supabase when online
- Medication reminders work without internet

### Video Storage

- Verification clips uploaded to Supabase Storage
- 5-10 second clips, ~2-5MB each
- Auto-deleted after 30 days via storage lifecycle policy
- Users can delete anytime

### Stat Decay

- Handled client-side on app open (calculate missed ticks since last interaction)
- No server-side cron needed for MVP

---

## 4. Video Verification — Multi-Signal Adaptive System

### Verification Signals

1. **Face detection** (on-device, MediaPipe): Confirm user is present and looking at camera
2. **Motion detection** (on-device, frame differencing): Detect arm/hand movement toward face
3. **Gemini confirmation** (cloud, via Supabase Edge Function): Send clip for final verification
4. **Audio cue** (optional future): Detect pill bottle opening, water drinking sounds

### Adaptive Trust Tiers

| Tier | Streak | Verification Required |
|------|--------|-----------------------|
| New user | 0-6 days | Full video verification |
| Trusted | 7-29 days | Face + motion only (no Gemini) |
| Established | 30+ days | Tap-to-confirm with occasional spot checks |
| Any user | Any time | Can skip verification and tap "I took it" |

### Flow

```
User taps "Take Medication"
        │
        ▼
  Check trust tier
  ┌─────┴──────────────┐
  │                    │
  Tier requires       Tap-to-confirm
  video               (high trust / user preference)
  │                    │
  ▼                    ▼
  Expo Camera opens    Dose logged immediately
  (front-facing,       Blobby celebrates
  5-10 sec)
  │
  ▼
  On-device checks:
  • Face detected?
  • Motion toward face?
  │
  ├── Both pass + high trust tier → VERIFIED locally
  │
  └── Low confidence → Upload to Supabase Storage
      → Supabase Edge Function calls Gemini 1.5 Flash
      → Confidence ≥70 → VERIFIED
      → Confidence <70 → "We couldn't confirm. Mark as taken anyway?"
```

### Gemini Edge Function

- Prompt: "Did this person take a pill/medication? Look for: pill in hand, putting in mouth, drinking water. Respond with confidence 0-100 and brief explanation."
- Threshold: 70% (false negatives are worse than false positives for ADHD users)
- Graceful degradation: If Gemini is down, user can manually confirm

### Accessibility

- Video verification is always opt-in per medication
- Tap-to-confirm always available as fallback
- Camera guidance with audio cues for vision-impaired users
- Works with non-pill medications (liquid, inhaler, injection, patch) — verification prompt adapts per type

---

## 5. Notifications

### Stack

- `expo-notifications` for local scheduled notifications
- Supabase Edge Functions for escalation logic (future)
- No Twilio/SMS for MVP

### Flow

```
Medication schedule loaded
        │
        ▼
  Schedule local notifications
  (per medication, per time slot)
        │
        ▼
  Notification fires
  ┌─────┴──────────┐
  │                │
  User opens      User ignores
  app             │
  │               ▼
  ▼          Snooze fires (default 10 min)
  Verify      │
  flow        ├── User opens → Verify flow
              │
              └── Still ignored
                  │
                  ▼
              Escalation notification
              "Hey, Blobby is worried about you"
              (after escalation_delay_minutes)
                  │
                  └── Still ignored → Mark as missed
                      Blobby mood decays
```

### Design Principles

- **Local-first**: All reminders scheduled locally. Works offline, airplane mode.
- **Warm tone**: "Time for your Sertraline! Blobby's cheering you on" — not clinical.
- **Respect DND**: Follow system Do Not Disturb settings. Never override.
- **Rescheduling**: Editing medication times cancels and reschedules all related notifications.

---

## 6. Navigation

```
Tab Navigator (React Navigation, bottom tabs)
├── Home Tab
│   └── HomeScreen
│       ├── Blobby WebView (3D scene)
│       ├── Streak display
│       ├── Next medication due
│       └── Quick "Take Medication" CTA
│
├── Meds Tab
│   └── MedsScreen (list)
│       └── MedDetailScreen (push)
│           ├── Edit medication
│           ├── Doses remaining
│           ├── Reminder settings
│           └── Verification preference (video/tap/auto)
│
├── Log Tab
│   └── LogScreen
│       ├── Calendar view (month)
│       ├── Day detail (tap a day)
│       │   └── Each dose: time, status, verified badge
│       └── Streak stats summary
│
└── Profile Tab
    └── ProfileScreen
        ├── Blobby customization
        │   ├── Outfit picker (unlocked outfits)
        │   ├── Furniture picker
        │   └── Window scene picker
        ├── Milestones & achievements
        ├── Notification settings
        ├── Account (email, sign out)
        └── Accessibility settings
```

- **Verify is a modal/sheet**, not a tab. Overlays from Home or notification deep link.
- **Deep linking**: Notification tap opens directly to verification flow for that medication.
- **Calendar view**: Green dots = taken, red = missed, grey = skipped. Visual streak patterns.
- **All screens are native React Native** except the Blobby 3D viewport on HomeScreen.

---

## 7. Asset Delivery

### Strategy: Bundled Starter + Lazy-Loaded Outfits

**Bundled with app (~15-20MB total):**
- `blobby-base.glb` (~5MB, Draco compressed ~2MB)
- App code + native assets

**On-demand download (CDN / Supabase Storage):**
- `blobby-raincoat.glb`
- `blobby-sweater.glb`
- `blobby-glasses.glb`
- `room.glb`
- Future outfit GLBs

### Behavior

- Downloaded once on unlock or outfit picker browse, cached permanently via `expo-file-system`
- WiFi preloading: silently download next unlockable outfits in background
- Download UX: brief progress indicator on outfit card
- WebView loads GLBs from local device storage (URI passed via bridge)
- New outfits can be added server-side without app updates (GLB to storage + outfit definition to Supabase table)
- All GLBs run through `gltf-transform` with Draco compression before upload

---

## 8. Accessibility

### Core Principles

- Reduce friction, never add it
- Forgive, don't punish (Blobby is gently sad when doses are missed, never angry)
- Users choose their level of sensory stimulation

### Settings

```
Accessibility Settings (Profile tab)
├── Motion & Animation
│   ├── Reduce motion (disables idle behaviors, particles)
│   ├── Disable 3D entirely (2D Blobby illustration)
│   └── Respects system "Reduce Motion" automatically
│
├── Visual
│   ├── High contrast mode
│   ├── Larger text (scales with system Dynamic Type)
│   └── Color blind friendly indicators (icons + patterns, not just color)
│
├── Notifications
│   ├── Tone: Gentle / Neutral / Urgent
│   ├── Haptic feedback on/off
│   └── Quiet hours override
│
└── Verification
    ├── Default method: Video / Tap only / Adaptive
    └── Camera guidance: Audio cues on/off
```

### Screen Reader Support

- All native screens fully labeled for VoiceOver/TalkBack
- Blobby WebView `accessibilityLabel`: "Blobby is happy, wearing a wizard hat, bouncing gently"
- Dose logging announces result: "Dose verified. 5 day streak. Blobby is celebrating"

### ADHD-Specific UX

- **One-tap dose logging** from notification (skip app if verification is "tap only")
- **No decision paralysis**: Smart defaults everywhere
- **Positive reinforcement**: Streak recovery ("Welcome back! Let's start fresh") not guilt
- **Time blindness support**: "Next dose in 2 hours" not just "Next dose at 14:00"

---

## 9. Auth & Onboarding

### Flow

```
First launch
    │
    ▼
Welcome screen — "Meet Blobby" (Blobby waves in WebView)
    │
    ▼
Explore app anonymously (local state)
    │
    ▼
Sign up with email (magic link) — when ready
    │
    ▼
Add first medication
  • Name (autocomplete from common meds)
  • Dosage
  • Schedule (time picker + day selector)
  • Verification preference
    │
    ▼
Notification permission prompt — "Blobby needs to remind you!"
    │
    ▼
Home screen — Blobby celebrates
First milestone unlocked: "Beginner"
```

### Key Decisions

- **Magic links only**: No passwords. Lowest friction.
- **Deferred signup**: Anonymous local state until user chooses to create account. Data migrates seamlessly to Supabase on signup.
- **One medication minimum** during onboarding.
- **Notification prompt** after adding medication (contextual, not cold).
- **Instant reward**: "Beginner" milestone on first med added.
- **No tutorial**: Blobby's reactions teach organically.

---

## 10. Migration Path from Current Codebase

### What Stays

- **3D system**: BlobbyModel.tsx, SceneCanvas.tsx, animations, procedural behaviors — all move into a WebView-served Vite build
- **Reward definitions**: data/rewards.ts transfers to React Native side
- **Type definitions**: types/index.ts adapts for React Native
- **Asset pipeline**: generate-blobbys.mjs, rig-blobbys.py unchanged
- **Visual design language**: CSS variables translate to React Native StyleSheet/theme

### What Changes

- **Zustand store**: Moves to React Native, gains Supabase sync layer
- **React Router → React Navigation**: Tab navigator + stack screens
- **CSS → React Native styles**: StyleSheet.create or a styling library (e.g., Tamagui, NativeWind)
- **Page components**: Rewritten as React Native screens (Meds, Log, Profile are new)
- **HomePage**: Split into native HomeScreen + embedded WebView for Blobby

### What's New

- Expo project scaffolding
- Supabase integration (auth, database, storage, edge functions)
- Bridge module (postMessage protocol)
- expo-notifications scheduling
- expo-camera for verification
- MediaPipe on-device ML integration
- Offline sync layer (expo-sqlite)
