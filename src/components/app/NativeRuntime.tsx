import { refreshMusic, reportPlayerError } from '@/audio/RecordPlayerAudio';
import { refreshLeafWallet, watchLeafWallet } from '@/native/leaves';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from '@/native/platform';
import { refreshNativePermission } from '@/native/reminders';
import { useAppStore } from '@/stores/appStore';

export default function NativeRuntime() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative) return;
    document.documentElement.dataset.native = 'true';
    void SplashScreen.hide();
    const stopWallet = watchLeafWallet().catch(() => () => {});
    const state = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void refreshLeafWallet();
        void refreshMusic().catch(reportPlayerError);
      }
      if (isActive)
        void refreshNativePermission().finally(() => window.dispatchEvent(new Event('focus')));
      else window.dispatchEvent(new Event('blur'));
    });
    const action = LocalNotifications.addListener('localNotificationActionPerformed', () => {
      navigate('/#check-ins');
      window.dispatchEvent(new Event('focus'));
    });
    const storageError = () =>
      useAppStore.setState({
        storageError:
          'The device copy could not be saved. Keep Reminduh open and export a backup before freeing storage.',
      });
    const exportError = () =>
      useAppStore.getState().showToast('The export could not be opened. Please try again.');
    window.addEventListener('native-storage-error', storageError);
    window.addEventListener('native-export-error', exportError);
    return () => {
      void stopWallet.then((stop) => stop());
      void state.then((listener) => listener.remove());
      void action.then((listener) => listener.remove());
      window.removeEventListener('native-storage-error', storageError);
      window.removeEventListener('native-export-error', exportError);
    };
  }, [navigate]);
  return null;
}
