/**
 * Push Notification Client — OrthoClinic Mobile
 * ================================================
 *
 * Handles:
 *   - Requesting FCM/APNs permission
 *   - Obtaining and registering the device token
 *   - Listening for foreground messages (FCM onMessage)
 *   - Deep-link routing on notification tap
 *   - Background fetch (silent push) handling
 *   - Token refresh listener (FCM onTokenRefresh)
 *
 * FCM setup notes (Android/iOS React Native / PWA):
 *   1. Install: npm install firebase
 *   2. Add google-services.json (Android) and GoogleService-Info.plist (iOS)
 *      to the project root and your native build config.
 *   3. Enable Background Modes → Remote notifications in Xcode capabilities.
 *   4. Add firebase.json with messaging config at project root.
 *
 * APNs setup notes (iOS native):
 *   - Certificate or Auth Key (.p8) uploaded to Firebase Console.
 *   - Firebase handles APNs token <> FCM token bridging automatically
 *     when using Firebase iOS SDK — no direct APNs calls needed from client.
 */

import { api } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "appointment_reminder"
  | "result_ready"
  | "message_received"
  | "system_alert";

export interface PushNotificationPayload {
  type: NotificationType;
  deep_link: string;
  [key: string]: string;
}

export interface NotificationItem {
  id: number;
  notification_type: NotificationType;
  title: string | null;
  body: string | null;
  deep_link: string | null;
  image_url: string | null;
  status: string;
  is_silent: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationCenterData {
  items: NotificationItem[];
  unread_count: number;
  total: number;
}

export interface NotificationPreference {
  notification_type: NotificationType;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  reminder_lead_minutes: number;
}

// ---------------------------------------------------------------------------
// Deep-link router
// ---------------------------------------------------------------------------

const DEEP_LINK_MAP: Record<NotificationType, string> = {
  appointment_reminder: "/agenda",
  result_ready: "/resultados",
  message_received: "/mensagens",
  system_alert: "/alertas",
};

export function resolveDeepLink(data: PushNotificationPayload): string {
  if (data.deep_link) return data.deep_link;
  return DEEP_LINK_MAP[data.type] ?? "/";
}

// ---------------------------------------------------------------------------
// Permission + Token registration
// ---------------------------------------------------------------------------

/**
 * Request push permission and register the token with the backend.
 * Returns the token string on success, null if denied or unsupported.
 *
 * SIMULATION NOTE:
 * In a real React Native / Expo app replace the body with:
 *
 *   import messaging from '@react-native-firebase/messaging';
 *   const authStatus = await messaging().requestPermission();
 *   const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED
 *                || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
 *   if (!enabled) return null;
 *   const token = await messaging().getToken();
 *   await registerTokenWithBackend(token, platform);
 *   return token;
 *
 * For Web Push (PWA) replace with navigator.serviceWorker + getToken(app, {vapidKey}).
 */
export async function initPushNotifications(
  platform: "android" | "ios" | "web",
  deviceName?: string,
  appVersion?: string
): Promise<string | null> {
  // Web PWA path (used in desktop / web fallback)
  if (typeof window !== "undefined" && "Notification" in window) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[Push] Permission denied");
      return null;
    }

    // SIMULATION: generate a stable pseudo-token based on browser fingerprint
    const simulatedToken = `web_${btoa(navigator.userAgent).slice(0, 40)}_${Date.now()}`;

    await registerTokenWithBackend(simulatedToken, "web", deviceName, appVersion);
    return simulatedToken;
  }

  // React Native / Expo — handled by native Firebase SDK
  // Token obtained in native module and passed here
  console.warn("[Push] Non-web platform — token must be provided by native layer");
  return null;
}

export async function registerTokenWithBackend(
  token: string,
  platform: "android" | "ios" | "web",
  deviceName?: string,
  appVersion?: string,
  dndStart?: string,
  dndEnd?: string
): Promise<void> {
  try {
    await api.post("/push/tokens", {
      token,
      platform,
      device_name: deviceName,
      app_version: appVersion,
      dnd_start: dndStart,
      dnd_end: dndEnd,
    });
    localStorage.setItem("push_token_registered", token.slice(0, 20));
  } catch (err) {
    console.error("[Push] Token registration failed:", err);
  }
}

export async function unregisterToken(tokenId: number): Promise<void> {
  try {
    await api.delete(`/push/tokens/${tokenId}`);
    localStorage.removeItem("push_token_registered");
  } catch (err) {
    console.error("[Push] Token unregister failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Foreground message handler (Firebase onMessage equivalent)
// ---------------------------------------------------------------------------

type ForegroundHandler = (title: string, body: string, data: PushNotificationPayload) => void;

let foregroundHandler: ForegroundHandler | null = null;

export function setForegroundMessageHandler(handler: ForegroundHandler): void {
  foregroundHandler = handler;
}

/**
 * Called by native bridge / Firebase SDK when app is in foreground.
 * Shows an in-app toast/banner rather than a system notification.
 */
export function handleForegroundMessage(remoteMessage: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}): void {
  const title = remoteMessage.notification?.title ?? "OrthoClinic";
  const body = remoteMessage.notification?.body ?? "";
  const data = (remoteMessage.data ?? {}) as PushNotificationPayload;

  if (foregroundHandler) {
    foregroundHandler(title, body, data);
  }
}

// ---------------------------------------------------------------------------
// Background fetch handler (silent push)
// ---------------------------------------------------------------------------

/**
 * Called when a silent push (content-available:1 on iOS, data-only on Android)
 * wakes the app in the background.
 *
 * SIMULATION NOTE:
 * In React Native Firebase:
 *   messaging().setBackgroundMessageHandler(async remoteMessage => {
 *     await handleBackgroundFetch(remoteMessage.data);
 *   });
 */
export async function handleBackgroundFetch(
  data: Record<string, string>
): Promise<void> {
  const type = data.type as NotificationType | undefined;
  if (!type) return;

  // Example: silently refresh appointment list when a silent push arrives
  switch (type) {
    case "appointment_reminder":
      // Pre-fetch agenda data so it's warm when user opens app
      try {
        await api.get("/agenda");
      } catch (_) { /* offline — ignore */ }
      break;
    case "result_ready":
      try {
        await api.get("/resultados");
      } catch (_) { /* offline — ignore */ }
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Notification Center API calls
// ---------------------------------------------------------------------------

export async function fetchNotifications(
  page = 1,
  pageSize = 20,
  unreadOnly = false
): Promise<NotificationCenterData> {
  const resp = await api.get<NotificationCenterData>("/push/notifications", {
    params: { page, page_size: pageSize, unread_only: unreadOnly },
  });
  return resp.data;
}

export async function fetchBadgeCount(): Promise<number> {
  const resp = await api.get<{ unread: number }>("/push/notifications/badge");
  return resp.data.unread;
}

export async function markAsRead(notificationIds: number[]): Promise<{ remaining_unread: number }> {
  const resp = await api.post("/push/notifications/read", {
    notification_ids: notificationIds,
  });
  return resp.data;
}

// ---------------------------------------------------------------------------
// Preferences API calls
// ---------------------------------------------------------------------------

export async function fetchPreferences(): Promise<NotificationPreference[]> {
  const resp = await api.get<{ preferences: NotificationPreference[] }>("/push/preferences");
  return resp.data.preferences;
}

export async function updatePreferences(
  preferences: NotificationPreference[]
): Promise<NotificationPreference[]> {
  const resp = await api.put<{ preferences: NotificationPreference[] }>("/push/preferences", {
    preferences,
  });
  return resp.data.preferences;
}

// ---------------------------------------------------------------------------
// Labels for UI
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  appointment_reminder: "Lembretes de Consulta",
  result_ready:         "Resultados Disponíveis",
  message_received:     "Mensagens Recebidas",
  system_alert:         "Alertas do Sistema",
};

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, string> = {
  appointment_reminder: "calendar",
  result_ready:         "file-text",
  message_received:     "message-circle",
  system_alert:         "bell",
};
