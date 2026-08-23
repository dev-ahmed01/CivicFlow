import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<boolean> {
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("civicos-updates", {
      name: "CivicOS updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return false;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return false;
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(result.data, Platform.OS);
  return true;
}

export async function clearAppBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
