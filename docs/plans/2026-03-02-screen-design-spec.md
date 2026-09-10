# Reminduh — Complete Screen & Component Design Spec

**Date:** 2026-03-02
**Status:** Approved
**Pencil File:** `/Users/finnerz/reminduh/Untitled.pen`

---

## Navigation Structure

**Bottom tabs (4):** Home | Meds | Log | Profile

Verify is a modal/sheet triggered from Home "Log a Dose" button or notification deep link. NOT a tab.

---

## Existing Screens — Audit & Required Changes

### Screen 1 - Home (`pJ67u`) — Minor Changes
- Add: "Next dose in X hours" relative time below dose chips (time blindness support)
- Change: BottomNav — replace Verify tab with Profile tab
- Keep: Everything else (streak, 3D viewport, dose chips, CTA)

### Screen 2 - Meds (`iSpON`) — Minor Changes
- Change: BottomNav — replace Verify tab with Profile tab
- Add: Doses remaining count on each MedCard (e.g. "24 pills left")
- Keep: Pill box viewport, med list, FAB

### Screen 3 - Log (`p3eXL`) — Minor Changes
- Change: BottomNav — replace Verify tab with Profile tab
- Keep: Calendar, stats, medication supply — this screen is solid

### Screen 4 - Verify (`z4DvC`) — Major Redesign
- Remove from BottomNav entirely
- Becomes a modal/sheet with multiple states (see new screens below)
- Keep the camera viewport and record button design as base for State 2a

### Onboarding 1 - Welcome (`EKEjp`) — Minor Changes
- Keep: Blobby hero, branding, Google/Apple buttons
- Change: "Sign up with email" → magic link flow (no password)
- Keep: "Already have an account? Sign in"

### Onboarding 2 - Create Account (`rPwK2`) — Major Redesign
- Remove: Full name, Password, Confirm Password fields
- Replace with: Single email input + "Send magic link" button
- Add: "Check your email" success state with inbox illustration
- Keep: Step indicator, back arrow, pill box header

### Onboarding 3 - Add Medications (`CnebC`) — Add Fields
- Keep: Name, dosage, unit, frequency, time, color, "Add another", "Skip"
- Add: "Doses in current supply" number input (optional)
- Add: "Remind me" toggle with offset picker (At dose time / 15 min before / 30 min before)

### Onboarding 4 - Customise Pet (`ZN7ox`) — No Changes
- Perfect as-is

---

## New Screens

### Onboarding 5 - Enable Notifications (NEW)
- **Position:** After Onboarding 4, before Home
- **Layout:**
  - Blobby looking hopeful/excited (3D viewport or illustration)
  - Heading: "Blobby needs to remind you!"
  - Subtext: "Get nudges when it's time for your meds. We'll keep it gentle."
  - Primary button: "Enable notifications"
  - Secondary text link: "Maybe later"
- **Step indicator:** 4/4 (final step)
- **Tone:** Warm, non-pushy

### Profile Screen (NEW)
- **Tab:** Profile (4th tab, replaces Verify)
- **Layout (scrollable):**
  - TopBar: pill box + streak badge + avatar (same as other screens)
  - Profile Header (GlassCard):
    - Small Blobby avatar (2D or mini 3D)
    - Pet name "Mochi" + personality "Cheerful"
    - Current title: "Beginner"
  - Outfits section:
    - Section label: "OUTFITS"
    - Horizontal scroll of OutfitCards
    - Unlocked: thumbnail + name + equipped indicator
    - Locked: silhouette + unlock condition text ("7-day streak")
  - Furniture section:
    - Section label: "FURNITURE"
    - Horizontal scroll of FurnitureCards
    - Same locked/unlocked pattern
  - Milestones section:
    - Section label: "MILESTONES"
    - 2x3 grid of MilestoneCards
    - Completed: colored icon + green check
    - Incomplete: greyed icon + progress text
    - "View all" link if > 6
  - Notifications settings (GlassCard):
    - Section label: "NOTIFICATIONS"
    - Tone: Gentle / Neutral / Urgent (segmented control)
    - Haptic feedback: toggle
  - Accessibility settings (GlassCard):
    - Section label: "ACCESSIBILITY"
    - Reduce motion: toggle
    - Disable 3D: toggle
    - High contrast: toggle
  - Account section (GlassCard):
    - Section label: "ACCOUNT"
    - Email display
    - "Sign out" button (text, not primary)
  - BottomNav (Profile tab active)

### Med Detail / Edit Screen (NEW)
- **Type:** Pushed screen (no BottomNav, back arrow)
- **Trigger:** Tap med card on Meds screen
- **Layout:**
  - TopBar: ← Back + medication name
  - Header: colored dot + name + dosage + "Active" status
  - Schedule section (GlassCard):
    - Frequency: segmented control (Daily / 2x daily / Custom)
    - Times: list with + Add time
    - Days: day selector (if Custom)
  - Supply section (GlassCard):
    - Doses remaining: number input
    - Doses per refill: number input
    - Refill alert at: number input
    - Calculated "~24 days remaining" text
  - Reminders section (GlassCard):
    - Reminder enabled: toggle
    - Remind me: selector (At dose time / 15 min before / 30 min before)
    - Snooze duration: selector (5 / 10 / 15 / 30 min)
    - Escalation enabled: toggle
    - Escalation delay: selector (15 / 30 / 60 min)
  - Verification section (GlassCard):
    - Method: segmented control (Video / Tap only / Adaptive)
    - Trust tier badge: colored indicator + explanation text
  - Danger zone:
    - "Deactivate medication" (amber text button)
    - "Delete medication" (red text button)

### Verify Modal - State 2a: Full Video (redesign of `z4DvC`)
- **Type:** Full screen modal (no BottomNav)
- **Trust tier:** New users (0-6 day streak)
- **Layout:**
  - Header: "Verify Dose"
  - Subtext: "Record a quick clip so Blobby knows you're good"
  - Med selector chips (pre-selected: due medications)
  - Camera viewport (large, rounded corners)
  - Instruction: "Hold your medication up, then take it"
  - Record button with 10-second countdown ring
  - Camera flip button
  - "Skip verification" text link
  - Close X button top-right

### Verify Modal - State 2b: Quick Check (NEW)
- **Trust tier:** Trusted (7-29 day streak)
- **Layout:**
  - Header: "Quick Check"
  - Subtext: "Just a quick look — you've earned our trust"
  - Smaller camera viewport
  - Auto-captures in 2-3 seconds
  - Progress ring auto-fills
  - "Skip" link
  - Trust badge: "Trusted — 7+ day streak"

### Verify Modal - State 2c: Tap to Confirm (NEW)
- **Trust tier:** Established (30+ day streak)
- **Layout:**
  - Blobby illustration looking happy
  - "Time for [Sertraline]!"
  - Medication chip with dosage
  - Big primary button: "I took it"
  - Small text link: "Verify with video instead"
  - Trust badge: "Established — 30+ day streak"

### Verification Success (NEW)
- **Type:** Full screen overlay
- **Layout:**
  - Large checkmark with subtle glow
  - "Verified!" heading
  - Blobby celebrating (WebView or 2D)
  - Medication name + "Taken at 8:02 AM"
  - Streak counter with bump animation: "34 day streak!"
  - "Back to Home" button
  - Auto-dismisses after 3 seconds or tap
- **Transition:** If unlock triggered, flows into Reward screen

### Verification Failed (NEW)
- **Type:** Full screen overlay
- **Layout:**
  - Blobby looking curious (not sad)
  - "Hmm, we couldn't confirm that one"
  - "No worries! You can:"
  - [Try again] — primary button
  - [Mark as taken anyway] — secondary button
  - [Skip this dose] — text link
- **Tone:** Gentle, not accusatory

### Reward / Unlock Celebration (NEW)
- **Type:** Full screen modal with dark overlay
- **Trigger:** Milestone or outfit unlocked after dose logged
- **Layout:**
  - Particle/confetti effect
  - "New Unlock!" heading with sparkles
  - Large card showing the unlocked item (outfit illustration or furniture icon)
  - Item name + description
  - "Reached a 7-day streak!" unlock reason
  - Rarity badge (color-coded: grey/teal/purple/gold)
  - [Equip now] — primary button (for outfits/furniture)
  - [Maybe later] — text link
- **Multiple unlocks:** Show sequentially, one at a time

### Streak Recovery (NEW)
- **Type:** Full screen, shown on app open when streak is broken
- **Trigger:** First app open after a missed day
- **Layout:**
  - Blobby waving, looking hopeful
  - "Welcome back!"
  - "You were away for 3 days — no worries, let's start fresh."
  - Previous streak: 33 (muted)
  - New streak: 0
  - "Your unlocks and milestones are safe. Nothing is lost."
  - [Let's go!] — primary button → Home
- **Shows once per streak reset only**

---

## New Reusable Components

### OutfitCard
- Width: ~90, Height: ~110
- Unlocked state: thumbnail image, outfit name, "Equipped" badge if active
- Locked state: silhouette overlay, lock icon, unlock condition ("7-day streak")
- Rarity border color (grey/teal/purple/gold)
- Corner radius: 16, GlassCard styling

### FurnitureCard
- Same dimensions and pattern as OutfitCard
- Furniture icon instead of outfit thumbnail

### MilestoneCard
- Width: ~100, Height: ~100
- Circular badge with icon
- Completed: colored fill + green checkmark overlay
- Incomplete: greyed out + progress text ("3/7 days")
- Milestone name below

### InputField (extract from onboarding)
- Full width, height ~48
- GlassCard fill (#FFFFFF0A) with glass border
- Left icon (optional)
- Placeholder text: #F5F0E840
- Input text: #F5F0E8
- Label above: #F5F0E870, DM Sans 13, 500 weight
- Corner radius: 14

### ToggleSwitch
- Width: 48, Height: 28
- Off: #FFFFFF14 track, #F5F0E8 thumb
- On: #8BA875 track, #FFFFFF thumb
- Corner radius: 14

### SegmentedControl
- Horizontal row of options
- Active: #FFFFFF14 fill, #F5F0E8 text
- Inactive: transparent, #F5F0E870 text
- Corner radius: 10
- GlassCard border around entire control
- Used for: frequency, notification tone, verification method

### StatCard (extract from Log screen)
- Width: ~100, Height: ~70
- GlassCard styling
- Icon top (small, muted)
- Large number: Sora, 24, 700 weight
- Label below: DM Sans, 11, #F5F0E870

### TrustBadge
- Inline badge, pill-shaped
- Green (#8BA875): Established
- Amber (#D4A574): Trusted
- Default (#FFFFFF14): New
- Icon + "Trusted — 7+ day streak" text

---

## Design Tokens (existing, for reference)

```
Background:     #1A1612
Layer:          #241F1A
Text Primary:   #F5F0E8
Text Muted:     #F5F0E870
Mint Green:     #8BA875
Amber Gold:     #D4A574
Glass Fill:     #FFFFFF0A
Glass Border:   #FFFFFF12
Nav Active:     #A3B18A
Nav Inactive:   #F5F0E840
Rarity Common:  #A8A8A8
Rarity Uncommon:#4ECDC4
Rarity Rare:    #7B68EE
Rarity Legendary:#FFD700
Fonts:          Sora (headings), DM Sans (body), DM Mono (data)
Corner Radius:  40 (screens), 24 (cards), 16 (buttons), 14 (inputs), 10 (segments), 100 (pills/chips)
```

---

## Screen Inventory (Final)

| # | Screen | Type | ID |
|---|--------|------|----|
| 1 | Home | Tab | `pJ67u` (modify) |
| 2 | Meds | Tab | `iSpON` (modify) |
| 3 | Log | Tab | `p3eXL` (modify) |
| 4 | Profile | Tab | NEW |
| 5 | Med Detail | Push | NEW |
| 6 | Verify - Full Video | Modal | `z4DvC` (redesign) |
| 7 | Verify - Quick Check | Modal | NEW |
| 8 | Verify - Tap Confirm | Modal | NEW |
| 9 | Verify Success | Overlay | NEW |
| 10 | Verify Failed | Overlay | NEW |
| 11 | Reward Celebration | Modal | NEW |
| 12 | Streak Recovery | Full screen | NEW |
| 13 | Onboarding 1 - Welcome | Full screen | `EKEjp` (modify) |
| 14 | Onboarding 2 - Email | Full screen | `rPwK2` (redesign) |
| 15 | Onboarding 3 - Add Meds | Full screen | `CnebC` (modify) |
| 16 | Onboarding 4 - Pet | Full screen | `ZN7ox` (keep) |
| 17 | Onboarding 5 - Notifs | Full screen | NEW |

**Total: 17 screens, 8 reusable components**
