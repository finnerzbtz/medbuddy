import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reminduh.app',
  appName: 'Reminduh',
  loggingBehavior: 'none',
  webDir: 'dist',
  backgroundColor: '#f5f3ec',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#f5f3ec', showSpinner: false },
    LocalNotifications: { presentationOptions: ['banner', 'list', 'sound'] },
  },
};
export default config;
