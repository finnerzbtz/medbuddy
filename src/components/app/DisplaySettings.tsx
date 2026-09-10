import { setSoundSettings } from '@/audio/AppAudio';
import { useAppStore } from '@/stores/appStore';
import type { AppData } from '@/types';
const options: { key: keyof AppData['preferences']; label: string; hint: string }[] = [
  {
    key: 'reducedMotion',
    label: 'Reduce motion',
    hint: 'Still poses and gentle transitions. Your device’s reduce-motion setting also applies.',
  },
  {
    key: 'pauseScene',
    label: 'Pause room animation',
    hint: 'Keep the room still until you choose to resume it.',
  },
  {
    key: 'gentleMoods',
    label: 'Gentle moods',
    hint: 'Blobby stays content when a check-in is missing. Your dose reminders still appear.',
  },
  {
    key: 'hideRewards',
    label: 'Hide scores and streaks',
    hint: 'Keep your companion and activities, without scores, care goals or full-screen celebrations.',
  },
  {
    key: 'showWisdom',
    label: 'Little thoughts from Blobby',
    hint: 'Optional self-care ideas and quotes. Read or skip them at your own pace.',
  },
  {
    key: 'staticScene',
    label: 'Use a still image',
    hint: 'Replace the 3D room with a picture. Medication check-ins work as usual.',
  },
];
export default function DisplaySettings() {
  const preferences = useAppStore((s) => s.data.preferences);
  const report = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) useAppStore.getState().showToast(result.error!);
  };
  return (
    <>
      <p>Choose what feels comfortable. These settings are saved on this device.</p>
      <button
        className="button secondary"
        onClick={() => {
          setSoundSettings({ enabled: false });
          const result = useAppStore.getState().setCalmMode();
          report(result);
          if (result.ok)
            useAppStore
              .getState()
              .showToast('Calm settings applied. You can change each option below.');
        }}
      >
        Use calm settings
      </button>
      {options.map(({ key, label, hint }) => (
        <label className="toggle-row" key={key}>
          <span>
            <strong>{label}</strong>
            <small id={'display-' + key}>{hint}</small>
          </span>
          <input
            type="checkbox"
            aria-label={label}
            aria-describedby={'display-' + key}
            checked={preferences[key]}
            onChange={(e) => report(useAppStore.getState().setPreference(key, e.target.checked))}
          />
        </label>
      ))}
    </>
  );
}
