import { registerPlugin } from '@capacitor/core';
export interface NotificationDeliverySettings {
  alerts: boolean;
  sounds: boolean;
  lockScreen: boolean;
  notificationCenter: boolean;
}
export const nativeDevice = registerPlugin<{
  notificationSettings(): Promise<NotificationDeliverySettings>;
  openNotificationSettings(): Promise<void>;
}>('ReminduhDevice');
