# Reminduh Production Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Reminduh from a Vite web prototype to a production Expo native app with Supabase backend, video verification, and push notifications — targeting ADHD/neurodivergent users.

**Architecture:** Expo native shell with WebView for the 3D Blobby scene. Native screens handle all UI (Meds, Log, Profile, Verification). Bridge protocol (postMessage) syncs state between native Zustand store and WebView renderer. Supabase provides auth, database, storage, and edge functions.

**Tech Stack:** Expo SDK 52+, React Native, React Navigation, Supabase (Postgres + Auth + Storage + Edge Functions), MediaPipe (on-device ML), Gemini 1.5 Flash (cloud verification), expo-notifications, expo-camera, expo-sqlite, react-native-webview.

**Design Doc:** `docs/plans/2026-03-02-production-roadmap-design.md`

---

## Phase 1: Expo Project Scaffold + WebView Bridge

Goal: Get the existing Blobby 3D scene running inside an Expo app via WebView, with a working bridge protocol.

### Task 1.1: Initialize Expo Project

**Files:**
- Create: `/expo/` (new Expo project root alongside existing `/src/`)
- Create: `/expo/app.json`
- Create: `/expo/package.json`
- Create: `/expo/tsconfig.json`

**Step 1: Create Expo project**

```bash
cd /Users/finnerz/reminduh
npx create-expo-app@latest expo --template blank-typescript
```

**Step 2: Install core dependencies**

```bash
cd expo
npx expo install react-native-webview expo-file-system expo-asset
npm install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context zustand
```

**Step 3: Verify it runs**

```bash
npx expo start
```

Expected: Expo dev server starts, blank app loads in simulator.

**Step 4: Commit**

```bash
git add expo/
git commit -m "feat: scaffold Expo project with core dependencies"
```

---

### Task 1.2: Build Blobby WebView Bundle

**Files:**
- Create: `/webview/` (stripped-down Vite build for WebView)
- Create: `/webview/index.html`
- Create: `/webview/src/main.tsx`
- Create: `/webview/src/BlobbyWebView.tsx`
- Create: `/webview/vite.config.ts`
- Copy: `/src/components/scene/SceneCanvas.tsx` → `/webview/src/SceneCanvas.tsx`
- Copy: `/src/components/scene/BlobbyModel.tsx` → `/webview/src/BlobbyModel.tsx`
- Copy: `/src/components/scene/WindowScene.tsx` → `/webview/src/WindowScene.tsx`
- Copy: `/src/hooks/useIdleBehavior.ts` → `/webview/src/useIdleBehavior.ts`
- Copy: `/src/types/index.ts` → `/webview/src/types.ts`

**Step 1: Create webview directory and copy 3D files**

Copy the scene components, hooks, and types into `/webview/src/`. These are the files that will run inside the WebView.

**Step 2: Create BlobbyWebView.tsx wrapper**

This is the new entry point that listens for bridge messages and renders the scene:

```tsx
// webview/src/BlobbyWebView.tsx
import { useState, useEffect } from 'react'
import SceneCanvas from './SceneCanvas'
import type { AnimationName, BlobbyVariant, PetMood, PetStats } from './types'

interface BridgeState {
  animation: AnimationName
  variant: BlobbyVariant
  mood: PetMood
  stats: PetStats
  isPlaying: boolean
}

const defaultState: BridgeState = {
  animation: 'idle',
  variant: 'base',
  mood: 'content',
  stats: { happiness: 50, health: 50, energy: 50 },
  isPlaying: true,
}

export default function BlobbyWebView() {
  const [state, setState] = useState<BridgeState>(defaultState)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'MOOD_UPDATE':
            setState(prev => ({ ...prev, mood: msg.mood, stats: msg.stats }))
            break
          case 'EQUIP_OUTFIT':
            setState(prev => ({ ...prev, variant: msg.variant }))
            break
          case 'DOSE_LOGGED':
            setState(prev => ({ ...prev, animation: 'celebrating' }))
            break
          case 'PET_INTERACTION':
            setState(prev => ({ ...prev, animation: 'happy' }))
            break
        }
      } catch (e) {
        // ignore non-JSON messages
      }
    }

    window.addEventListener('message', handleMessage)

    // Tell native we're ready
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SCENE_READY' }))

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleBlobbyTap = () => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'BLOBBY_TAPPED' }))
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1A1612' }} onClick={handleBlobbyTap}>
      <SceneCanvas
        currentAnimation={state.animation}
        currentVariant={state.variant}
        petMood={state.mood}
        isPlaying={state.isPlaying}
      />
    </div>
  )
}
```

**Step 3: Create Vite config for WebView build**

```typescript
// webview/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // relative paths for local file loading
  build: {
    outDir: '../expo/assets/webview',
    assetsInlineLimit: 0,
  },
})
```

**Step 4: Build and verify output**

```bash
cd webview
npm install
npm run build
ls ../expo/assets/webview/
```

Expected: `index.html` + JS/CSS bundles in `expo/assets/webview/`.

**Step 5: Commit**

```bash
git add webview/
git commit -m "feat: create WebView Blobby bundle with bridge protocol"
```

---

### Task 1.3: Embed WebView in Expo Home Screen

**Files:**
- Create: `/expo/src/screens/HomeScreen.tsx`
- Create: `/expo/src/components/BlobbyWebViewContainer.tsx`
- Modify: `/expo/App.tsx`

**Step 1: Create BlobbyWebViewContainer component**

```tsx
// expo/src/components/BlobbyWebViewContainer.tsx
import { useRef, useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'
import { Asset } from 'expo-asset'

interface BridgeMessage {
  type: string
  [key: string]: unknown
}

interface Props {
  onBlobbyTapped?: () => void
  onSceneReady?: () => void
  onSceneError?: (error: string) => void
}

export default function BlobbyWebViewContainer({ onBlobbyTapped, onSceneReady, onSceneError }: Props) {
  const webViewRef = useRef<WebView>(null)

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg: BridgeMessage = JSON.parse(event.nativeEvent.data)
      switch (msg.type) {
        case 'BLOBBY_TAPPED':
          onBlobbyTapped?.()
          break
        case 'SCENE_READY':
          onSceneReady?.()
          break
        case 'SCENE_ERROR':
          onSceneError?.(msg.error as string)
          break
      }
    } catch (e) {
      // ignore
    }
  }, [onBlobbyTapped, onSceneReady, onSceneError])

  // Send message to WebView
  const sendMessage = useCallback((msg: BridgeMessage) => {
    webViewRef.current?.postMessage(JSON.stringify(msg))
  }, [])

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={require('../../assets/webview/index.html')}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={['*']}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
})
```

**Step 2: Create HomeScreen**

```tsx
// expo/src/screens/HomeScreen.tsx
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BlobbyWebViewContainer from '../components/BlobbyWebViewContainer'

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>reminduh</Text>
      <View style={styles.sceneContainer}>
        <BlobbyWebViewContainer
          onBlobbyTapped={() => console.log('Blobby tapped!')}
          onSceneReady={() => console.log('Scene ready')}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1612' },
  title: { color: '#F5F0E8', fontSize: 24, fontWeight: '700', textAlign: 'center', paddingTop: 16 },
  sceneContainer: { flex: 1, margin: 16 },
})
```

**Step 3: Wire up App.tsx with tab navigator**

```tsx
// expo/App.tsx
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import HomeScreen from './src/screens/HomeScreen'

const Tab = createBottomTabNavigator()

function PlaceholderScreen({ name }: { name: string }) {
  return <View style={{ flex: 1, backgroundColor: '#1A1612', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#F5F0E8' }}>{name}</Text></View>
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#241F1A', borderTopColor: '#FFFFFF12' } }}>
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Meds" component={() => PlaceholderScreen({ name: 'Meds' })} />
          <Tab.Screen name="Log" component={() => PlaceholderScreen({ name: 'Log' })} />
          <Tab.Screen name="Profile" component={() => PlaceholderScreen({ name: 'Profile' })} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
```

**Step 4: Run and verify Blobby renders in WebView**

```bash
cd expo
npx expo start
```

Expected: App loads with tab nav. Home tab shows Blobby 3D scene inside WebView.

**Step 5: Commit**

```bash
git add expo/
git commit -m "feat: embed Blobby WebView in Expo Home screen with bridge"
```

---

### Task 1.4: Port Zustand Store to React Native

**Files:**
- Create: `/expo/src/stores/appStore.ts`
- Create: `/expo/src/types/index.ts`
- Copy: `/src/data/rewards.ts` → `/expo/src/data/rewards.ts`

**Step 1: Copy types and rewards**

Copy `src/types/index.ts` and `src/data/rewards.ts` to Expo project. Add new types for the native app:

```typescript
// Add to expo/src/types/index.ts

export interface VerificationResult {
  verified: boolean
  confidence: number
  method: 'face_motion' | 'gemini' | 'manual' | 'tap'
}

export type TrustTier = 'new' | 'trusted' | 'established'

export type VerificationPreference = 'video' | 'tap_only' | 'adaptive'
```

**Step 2: Port Zustand store**

Adapt `src/stores/appStore.ts` for React Native:
- Replace `localStorage` persistence with `expo-sqlite` or `AsyncStorage`
- Add bridge message dispatch (sends state updates to WebView)
- Keep all existing game logic (logDose, tick, unlock checking)

```typescript
// expo/src/stores/appStore.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
// ... port all existing state shape and actions from src/stores/appStore.ts
// Key change: storage adapter
```

**Step 3: Verify store initializes**

Add a simple `console.log(useAppStore.getState())` in HomeScreen to confirm store loads.

**Step 4: Commit**

```bash
git add expo/src/stores/ expo/src/types/ expo/src/data/
git commit -m "feat: port Zustand store and types to Expo"
```

---

### Task 1.5: Bridge State Sync

**Files:**
- Modify: `/expo/src/components/BlobbyWebViewContainer.tsx`
- Modify: `/expo/src/screens/HomeScreen.tsx`

**Step 1: Add sendMessage imperative handle to BlobbyWebViewContainer**

Expose a `ref` with `sendMessage` so parent screens can push state to WebView.

**Step 2: Subscribe to Zustand store changes in HomeScreen**

When mood, stats, outfit, or animation change in the native store, send bridge messages to WebView:

```typescript
useEffect(() => {
  const unsub = useAppStore.subscribe(
    (state) => ({ mood: state.petMood, stats: state.petStats, variant: state.currentVariant, animation: state.currentAnimation }),
    (slice) => {
      webViewRef.current?.sendMessage({ type: 'MOOD_UPDATE', mood: slice.mood, stats: slice.stats })
    },
    { equalityFn: shallow }
  )
  return unsub
}, [])
```

**Step 3: Test the bridge**

Trigger `logDose()` from a button → confirm Blobby plays celebrating animation in WebView.

**Step 4: Commit**

```bash
git add expo/src/
git commit -m "feat: wire Zustand store to WebView bridge for state sync"
```

---

## Phase 2: Supabase Backend

Goal: Set up Supabase project with auth, database, and RLS. Wire up to Expo app.

### Task 2.1: Supabase Project Setup

**Step 1: Create Supabase project**

Go to supabase.com, create project "reminduh". Note the project URL and anon key.

**Step 2: Create .env in Expo**

```bash
# expo/.env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Step 3: Install Supabase client**

```bash
cd expo
npm install @supabase/supabase-js
```

**Step 4: Create Supabase client**

```typescript
// expo/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

**Step 5: Commit**

```bash
git add expo/src/lib/ expo/.env.example
git commit -m "feat: add Supabase client configuration"
```

---

### Task 2.2: Database Schema Migration

**Files:**
- Create: `/supabase/migrations/001_initial_schema.sql`

**Step 1: Create migration file**

Write the full schema from the design doc (users, medications, dose_logs, pet_state tables with constraints and RLS policies).

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dose_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can CRUD own medications" ON medications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own dose logs" ON dose_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can CRUD own pet state" ON pet_state FOR ALL USING (auth.uid() = user_id);
```

**Step 2: Run migration via Supabase dashboard or CLI**

```bash
npx supabase db push
```

**Step 3: Verify tables exist in Supabase dashboard**

**Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add database schema with RLS policies"
```

---

### Task 2.3: Auth Flow (Magic Links)

**Files:**
- Create: `/expo/src/screens/AuthScreen.tsx`
- Create: `/expo/src/hooks/useAuth.ts`
- Modify: `/expo/App.tsx`

**Step 1: Create useAuth hook**

```typescript
// expo/src/hooks/useAuth.ts
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string) => {
    return supabase.auth.signInWithOtp({ email })
  }

  const signOut = async () => {
    return supabase.auth.signOut()
  }

  return { session, loading, signInWithEmail, signOut }
}
```

**Step 2: Create AuthScreen**

Simple email input + "Send magic link" button. Show success message after sending.

**Step 3: Gate App.tsx on auth state**

If no session → show AuthScreen. If session → show tab navigator. Support anonymous browsing (deferred signup).

**Step 4: Commit**

```bash
git add expo/src/
git commit -m "feat: add magic link auth with deferred signup"
```

---

### Task 2.4: Supabase Data Sync Layer

**Files:**
- Create: `/expo/src/lib/sync.ts`
- Modify: `/expo/src/stores/appStore.ts`

**Step 1: Create sync module**

Functions to push/pull medications, dose_logs, and pet_state to/from Supabase:

```typescript
// expo/src/lib/sync.ts
import { supabase } from './supabase'

export async function syncPetState(userId: string, state: PetState) {
  const { error } = await supabase
    .from('pet_state')
    .upsert({ user_id: userId, ...state })
  return { error }
}

export async function fetchMedications(userId: string) {
  return supabase
    .from('medications')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
}

// ... similar for dose_logs, etc.
```

**Step 2: Add sync triggers to Zustand store**

After `logDose()`, sync dose_log and pet_state to Supabase. Use a debounced sync for pet stats (don't hit Supabase on every tick).

**Step 3: Add offline queue**

If Supabase is unreachable, queue writes locally. Flush queue on reconnect.

**Step 4: Commit**

```bash
git add expo/src/lib/ expo/src/stores/
git commit -m "feat: add Supabase sync layer with offline queue"
```

---

## Phase 3: Core Native Screens

Goal: Build the native medication management, dose logging, and profile screens.

### Task 3.1: Theme & Shared Components

**Files:**
- Create: `/expo/src/theme.ts`
- Create: `/expo/src/components/GlassCard.tsx`
- Create: `/expo/src/components/PillChip.tsx`
- Create: `/expo/src/components/PrimaryButton.tsx`

**Step 1: Define theme constants**

Port CSS variables from `src/index.css` to a React Native theme object:

```typescript
// expo/src/theme.ts
export const colors = {
  background: '#1A1612',
  layer: '#241F1A',
  textPrimary: '#F5F0E8',
  textMuted: 'rgba(245, 240, 232, 0.44)',
  mintGreen: '#8BA875',
  amberGold: '#D4A574',
  softRed: 'rgba(196, 112, 112, 0.8)',
  glassFill: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.07)',
}

export const fonts = {
  heading: 'Sora',
  body: 'DMSans',
  mono: 'DMMono',
}
```

**Step 2: Build shared components**

Port GlassCard, PillChip, PrimaryButton from web to React Native StyleSheet equivalents.

**Step 3: Commit**

```bash
git add expo/src/theme.ts expo/src/components/
git commit -m "feat: add theme and shared UI components"
```

---

### Task 3.2: Medications Screen (CRUD)

**Files:**
- Create: `/expo/src/screens/MedsScreen.tsx`
- Create: `/expo/src/screens/MedDetailScreen.tsx`
- Create: `/expo/src/components/MedCard.tsx`

**Step 1: Build MedsScreen (list view)**

FlatList of medications. Each card shows: name, dosage, next dose time, doses remaining, color dot. FAB to add new medication.

**Step 2: Build MedDetailScreen (create/edit)**

Form fields:
- Name (text input with common medication autocomplete)
- Dosage (text input)
- Schedule (time pickers + day selector)
- Color picker
- Doses remaining (number input, optional)
- Doses per refill (number input, optional)
- Refill reminder threshold (number input, optional)
- Reminder settings (enabled, offset, snooze, escalation)
- Verification preference (video / tap / adaptive)

**Step 3: Wire to Supabase**

Create, read, update, delete medications via `supabase.from('medications')`.

**Step 4: Commit**

```bash
git add expo/src/screens/ expo/src/components/
git commit -m "feat: add medication CRUD screens"
```

---

### Task 3.3: Dose Log Screen (Calendar)

**Files:**
- Create: `/expo/src/screens/LogScreen.tsx`
- Create: `/expo/src/components/DoseCalendar.tsx`
- Create: `/expo/src/components/DayDetail.tsx`

**Step 1: Build calendar view**

Month view with colored dots per day (green = all taken, red = any missed, grey = skipped, empty = no doses scheduled). Use `react-native-calendars` or build a simple custom grid.

**Step 2: Build day detail**

Tap a day → bottom sheet showing each dose for that day: medication name, scheduled time, taken time, verified badge.

**Step 3: Add streak stats summary**

Current streak, longest streak, total doses, average adherence percentage.

**Step 4: Wire to Supabase dose_logs**

**Step 5: Commit**

```bash
git add expo/src/screens/ expo/src/components/
git commit -m "feat: add dose log calendar screen"
```

---

### Task 3.4: Profile Screen

**Files:**
- Create: `/expo/src/screens/ProfileScreen.tsx`
- Create: `/expo/src/components/OutfitPicker.tsx`
- Create: `/expo/src/components/FurniturePicker.tsx`
- Create: `/expo/src/components/MilestoneList.tsx`

**Step 1: Build ProfileScreen sections**

- Blobby customization (outfit picker, furniture picker, window scene picker)
- Milestones & achievements grid
- Notification settings
- Accessibility settings
- Account (email display, sign out button)

**Step 2: Build OutfitPicker**

Horizontal scroll of outfit cards. Locked outfits show silhouette + unlock condition. Unlocked outfits show thumbnail. Tap to equip → sends EQUIP_OUTFIT to WebView bridge.

**Step 3: Build MilestoneList**

Grid of milestone badges. Completed = colored + checkmark. Incomplete = greyed + progress indicator.

**Step 4: Commit**

```bash
git add expo/src/screens/ expo/src/components/
git commit -m "feat: add profile screen with customization and milestones"
```

---

## Phase 4: Video Verification

Goal: Implement the multi-signal adaptive verification system.

### Task 4.1: Camera Capture

**Files:**
- Create: `/expo/src/screens/VerifyScreen.tsx`
- Create: `/expo/src/components/VerifyCamera.tsx`

**Step 1: Install dependencies**

```bash
npx expo install expo-camera expo-av
```

**Step 2: Build VerifyCamera component**

Front-facing camera, 5-10 second recording. Large "Recording..." indicator. Auto-stop after 10 seconds. Preview before submit.

**Step 3: Build VerifyScreen modal**

Shows which medication is being verified. Camera component. Skip button ("I already took it"). Cancel button.

**Step 4: Commit**

```bash
git add expo/src/screens/ expo/src/components/
git commit -m "feat: add camera capture for dose verification"
```

---

### Task 4.2: On-Device Face + Motion Detection

**Files:**
- Create: `/expo/src/lib/verification/faceDetection.ts`
- Create: `/expo/src/lib/verification/motionDetection.ts`

**Step 1: Install MediaPipe or ML Kit**

```bash
npx expo install expo-face-detector
```

Note: Evaluate whether `expo-face-detector` (deprecated) or `react-native-vision-camera` + MediaPipe frame processor is the better path. Start with face detector for MVP, upgrade later.

**Step 2: Implement face detection**

Detect face presence + orientation during recording. Return confidence score.

**Step 3: Implement motion detection**

Simple frame differencing: compare frames to detect arm/hand movement in the upper frame area (toward face). Return motion confidence.

**Step 4: Combine signals**

```typescript
export function evaluateOnDevice(faceConfidence: number, motionConfidence: number): { pass: boolean, confidence: number } {
  const combined = (faceConfidence * 0.4) + (motionConfidence * 0.6)
  return { pass: combined >= 0.6, confidence: combined }
}
```

**Step 5: Commit**

```bash
git add expo/src/lib/verification/
git commit -m "feat: add on-device face and motion detection for verification"
```

---

### Task 4.3: Gemini Cloud Verification (Edge Function)

**Files:**
- Create: `/supabase/functions/verify-dose/index.ts`
- Create: `/expo/src/lib/verification/geminiVerify.ts`

**Step 1: Create Supabase Edge Function**

```typescript
// supabase/functions/verify-dose/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { videoUrl, doseLogId } = await req.json()

  // Download video from Supabase Storage
  // Send to Gemini 1.5 Flash with prompt
  // Parse confidence score
  // Update dose_logs.verified

  const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: 'Did this person take a pill or medication? Look for: pill in hand, putting in mouth, drinking water. Respond with JSON: { "confidence": 0-100, "explanation": "brief reason" }' },
          { inlineData: { mimeType: 'video/mp4', data: videoBase64 } }
        ]
      }]
    })
  })

  // Parse and return result
})
```

**Step 2: Create client-side caller**

```typescript
// expo/src/lib/verification/geminiVerify.ts
export async function verifyWithGemini(videoStoragePath: string, doseLogId: string) {
  const { data, error } = await supabase.functions.invoke('verify-dose', {
    body: { videoUrl: videoStoragePath, doseLogId }
  })
  return data as { verified: boolean, confidence: number, explanation: string }
}
```

**Step 3: Deploy edge function**

```bash
npx supabase functions deploy verify-dose
npx supabase secrets set GEMINI_API_KEY=your-key
```

**Step 4: Commit**

```bash
git add supabase/functions/ expo/src/lib/verification/
git commit -m "feat: add Gemini video verification edge function"
```

---

### Task 4.4: Adaptive Trust Tier System

**Files:**
- Create: `/expo/src/lib/verification/trustTier.ts`
- Modify: `/expo/src/screens/VerifyScreen.tsx`

**Step 1: Implement trust tier logic**

```typescript
// expo/src/lib/verification/trustTier.ts
import type { TrustTier } from '../types'

export function getTrustTier(streak: number): TrustTier {
  if (streak >= 30) return 'established'
  if (streak >= 7) return 'trusted'
  return 'new'
}

export function getRequiredVerification(tier: TrustTier, userPreference: VerificationPreference) {
  if (userPreference === 'tap_only') return 'tap'
  if (userPreference === 'video') return 'full_video'

  // Adaptive
  switch (tier) {
    case 'established': return 'tap' // occasional spot check (10% chance → 'face_motion')
    case 'trusted': return 'face_motion'
    case 'new': return 'full_video'
  }
}
```

**Step 2: Wire into VerifyScreen**

Check trust tier → show appropriate verification UI (full camera, quick face check, or just confirm button).

**Step 3: Commit**

```bash
git add expo/src/lib/verification/ expo/src/screens/
git commit -m "feat: add adaptive trust tier verification system"
```

---

## Phase 5: Notifications

Goal: Reliable local push notifications for medication reminders.

### Task 5.1: Notification Scheduling

**Files:**
- Create: `/expo/src/lib/notifications.ts`
- Modify: `/expo/App.tsx`

**Step 1: Install and configure**

```bash
npx expo install expo-notifications expo-device
```

**Step 2: Create notification module**

```typescript
// expo/src/lib/notifications.ts
import * as Notifications from 'expo-notifications'

export async function requestPermissions() {
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function scheduleMedicationReminder(medication: Medication) {
  const { schedule, reminder_offset_minutes, name } = medication

  for (const time of schedule.times) {
    const [hours, minutes] = time.split(':').map(Number)
    const adjustedMinutes = minutes + (reminder_offset_minutes || 0)

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time for ${name}!`,
        body: `Blobby's cheering you on 💊`,
        data: { medicationId: medication.id, type: 'dose_reminder' },
      },
      trigger: {
        type: 'daily',
        hour: hours,
        minute: adjustedMinutes,
      },
    })
  }
}

export async function scheduleSnooze(medication: Medication) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Reminder: ${medication.name}`,
      body: `Don't forget! Blobby's waiting for you`,
      data: { medicationId: medication.id, type: 'snooze_reminder' },
    },
    trigger: {
      type: 'timeInterval',
      seconds: (medication.snooze_minutes || 10) * 60,
    },
  })
}

export async function cancelMedicationReminders(medicationId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const notif of scheduled) {
    if (notif.content.data?.medicationId === medicationId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier)
    }
  }
}
```

**Step 3: Register notification handler in App.tsx**

Handle notification taps → navigate to VerifyScreen with the correct medication.

**Step 4: Commit**

```bash
git add expo/src/lib/ expo/App.tsx
git commit -m "feat: add medication reminder notifications with snooze"
```

---

### Task 5.2: Escalation Notifications

**Files:**
- Modify: `/expo/src/lib/notifications.ts`

**Step 1: Add escalation scheduling**

When a dose reminder fires and goes unacknowledged, schedule a follow-up:

```typescript
export async function scheduleEscalation(medication: Medication) {
  if (!medication.escalation_enabled) return

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Blobby is worried about you`,
      body: `You haven't taken your ${medication.name} yet. Everything okay?`,
      data: { medicationId: medication.id, type: 'escalation' },
    },
    trigger: {
      type: 'timeInterval',
      seconds: (medication.escalation_delay_minutes || 30) * 60,
    },
  })
}
```

**Step 2: Cancel escalation when dose is logged**

**Step 3: Commit**

```bash
git add expo/src/lib/
git commit -m "feat: add escalation notifications for missed doses"
```

---

## Phase 6: Accessibility & Polish

Goal: Implement accessibility features and polish the UX for ADHD users.

### Task 6.1: Accessibility Settings

**Files:**
- Create: `/expo/src/screens/AccessibilitySettings.tsx`
- Modify: `/expo/src/stores/appStore.ts`

**Step 1: Add accessibility state to store**

```typescript
accessibility: {
  reduceMotion: boolean       // default: follows system
  disable3D: boolean          // default: false
  highContrast: boolean       // default: false
  notificationTone: 'gentle' | 'neutral' | 'urgent'
  hapticFeedback: boolean     // default: true
  verificationMethod: 'video' | 'tap_only' | 'adaptive'
  cameraAudioCues: boolean    // default: true
}
```

**Step 2: Build settings screen**

Toggle switches for each option. Respects system accessibility settings as defaults.

**Step 3: Wire reduce motion to WebView**

Send `REDUCE_MOTION` bridge message → WebView disables idle behaviors, particles, procedural animations.

**Step 4: Build 2D Blobby fallback**

When `disable3D` is true, HomeScreen shows a static/animated 2D illustration instead of WebView.

**Step 5: Commit**

```bash
git add expo/src/screens/ expo/src/stores/
git commit -m "feat: add accessibility settings with reduce motion and 2D fallback"
```

---

### Task 6.2: ADHD-Friendly UX Polish

**Files:**
- Modify: `/expo/src/screens/HomeScreen.tsx`
- Modify: `/expo/src/components/`

**Step 1: Time blindness support**

Show "Next dose in 2 hours" relative time, not just "14:00". Update every minute.

**Step 2: Streak recovery**

When user returns after missing doses: "Welcome back! Let's start fresh" instead of showing missed count prominently.

**Step 3: One-tap notification action**

Add notification action button "I took it" that logs dose directly from notification (when verification is tap_only).

**Step 4: Smart defaults**

Ensure the app works perfectly with zero configuration. Three example medications pre-populated on first launch.

**Step 5: Commit**

```bash
git add expo/src/
git commit -m "feat: add ADHD-friendly UX polish (time blindness, streak recovery, one-tap)"
```

---

### Task 6.3: Screen Reader & Dynamic Type

**Files:**
- Modify: All screen files

**Step 1: Add accessibilityLabel to all interactive elements**

**Step 2: Add accessibilityRole and accessibilityHint**

**Step 3: Test with VoiceOver (iOS) and TalkBack (Android)**

**Step 4: Support Dynamic Type**

Use `Text` component with `allowFontScaling` and ensure layouts don't break at larger sizes.

**Step 5: Add Blobby state announcements**

```typescript
AccessibilityInfo.announceForAccessibility(
  `Dose verified. ${streak} day streak. Blobby is celebrating.`
)
```

**Step 6: Commit**

```bash
git add expo/src/
git commit -m "feat: add screen reader support and Dynamic Type"
```

---

## Phase 7: Asset Delivery + Deployment

Goal: Optimize asset delivery and deploy to app stores.

### Task 7.1: Asset Pipeline

**Files:**
- Create: `/expo/src/lib/assetManager.ts`

**Step 1: Bundle base GLB with app**

Configure `expo-asset` to include `blobby-base.glb` in the app bundle.

**Step 2: Build asset manager for on-demand downloads**

```typescript
// expo/src/lib/assetManager.ts
import * as FileSystem from 'expo-file-system'

const ASSET_CDN = 'https://your-supabase-project.supabase.co/storage/v1/object/public/models'
const LOCAL_DIR = FileSystem.documentDirectory + 'models/'

export async function ensureAsset(filename: string): Promise<string> {
  const localPath = LOCAL_DIR + filename
  const info = await FileSystem.getInfoAsync(localPath)

  if (info.exists) return localPath

  await FileSystem.makeDirectoryAsync(LOCAL_DIR, { intermediates: true })
  await FileSystem.downloadAsync(`${ASSET_CDN}/${filename}`, localPath)

  return localPath
}

export async function preloadUnlockableAssets(unlockedOutfits: string[]) {
  // Background download of next likely unlocks on WiFi
}
```

**Step 3: Upload GLBs to Supabase Storage**

Create `models` bucket. Upload compressed GLBs. Set public access.

**Step 4: Commit**

```bash
git add expo/src/lib/
git commit -m "feat: add asset manager with CDN download and local caching"
```

---

### Task 7.2: App Store Preparation

**Files:**
- Modify: `/expo/app.json`
- Create: `/expo/eas.json`

**Step 1: Configure app.json**

```json
{
  "expo": {
    "name": "Reminduh",
    "slug": "reminduh",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": { "image": "./assets/splash.png", "resizeMode": "contain", "backgroundColor": "#1A1612" },
    "ios": { "bundleIdentifier": "com.yourname.reminduh", "supportsTablet": false },
    "android": { "package": "com.yourname.reminduh", "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#1A1612" } },
    "plugins": ["expo-notifications", "expo-camera"]
  }
}
```

**Step 2: Configure EAS Build**

```bash
npx eas-cli@latest
eas build:configure
```

**Step 3: Create production build**

```bash
eas build --platform all --profile production
```

**Step 4: Submit to stores**

```bash
eas submit --platform ios
eas submit --platform android
```

**Step 5: Commit**

```bash
git add expo/app.json expo/eas.json
git commit -m "feat: configure EAS build and app store metadata"
```

---

## Phase 8: Onboarding Flow

### Task 8.1: Welcome + Deferred Signup

**Files:**
- Create: `/expo/src/screens/WelcomeScreen.tsx`
- Create: `/expo/src/screens/OnboardingScreen.tsx`
- Modify: `/expo/App.tsx`

**Step 1: Build WelcomeScreen**

Full-screen Blobby WebView with wave animation. "Meet Blobby, your medication buddy." Two buttons: "Get Started" (anonymous) and "Sign In" (returning users).

**Step 2: Build OnboardingScreen**

Step-by-step: Add first medication → notification permission → done. Minimal, no overwhelm.

**Step 3: Gate in App.tsx**

First launch → WelcomeScreen → OnboardingScreen → HomeScreen. Subsequent launches → HomeScreen (or AuthScreen if signed in).

**Step 4: Commit**

```bash
git add expo/src/screens/ expo/App.tsx
git commit -m "feat: add onboarding flow with deferred signup"
```

---

## Validation

After all phases, verify:

```bash
# Type check
cd expo && npx tsc --noEmit

# Build for both platforms
eas build --platform all --profile preview

# Test on physical device
npx expo start --dev-client

# Verify Supabase connection
# - Create account via magic link
# - Add medication
# - Log dose → Blobby celebrates
# - Check dose_logs table in Supabase dashboard
# - Close app → reopen → data persists
# - Turn off WiFi → log dose → turn on WiFi → syncs

# Verify notifications
# - Schedule reminder → receive notification
# - Tap notification → opens verify screen
# - Snooze → receive follow-up
# - Escalation fires after delay

# Verify accessibility
# - Enable VoiceOver → navigate all screens
# - Enable Reduce Motion → 3D simplifies
# - Enable Disable 3D → 2D fallback shows
# - Increase Dynamic Type → layouts hold
```

## Acceptance Criteria

1. Blobby 3D scene renders inside Expo WebView with no visual regression from web version
2. Bridge protocol syncs state bidirectionally (native ↔ WebView)
3. Magic link auth works end-to-end
4. Medications can be created, edited, deleted with full field set
5. Dose logging triggers verification flow appropriate to trust tier
6. Video verification via Gemini returns confidence score and updates dose_log
7. Notifications fire on schedule, snooze works, escalation fires
8. Calendar view shows accurate dose history
9. Outfit/furniture equipping works via Profile screen
10. App works offline (local notifications, local dose logging, sync on reconnect)
11. VoiceOver/TalkBack navigable on all screens
12. Reduce motion and disable 3D modes function correctly
13. Builds successfully for iOS and Android via EAS
