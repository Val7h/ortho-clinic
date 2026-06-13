/**
 * usePushNotifications — OrthoClinic Mobile
 * ==========================================
 *
 * Manages:
 *   - Initialization (permission request + token registration)
 *   - Foreground message display (toast/banner)
 *   - Badge count polling + real-time update via SSE/WebSocket (future)
 *   - Deep-link navigation on notification tap
 *   - Token refresh handling
 *
 * Usage:
 *   const { badgeCount, requestPermission, initialized } = usePushNotifications();
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  initPushNotifications,
  fetchBadgeCount,
  handleForegroundMessage,
  setForegroundMessageHandler,
  resolveDeepLink,
  type NotificationType,
  type PushNotificationPayload,
} from "@/lib/push-notifications";

interface UsePushNotificationsReturn {
  initialized: boolean;
  permissionDenied: boolean;
  badgeCount: number;
  requestPermission: () => Promise<void>;
  refreshBadge: () => Promise<void>;
}

const BADGE_POLL_INTERVAL_MS = 60_000; // 60 seconds

export function usePushNotifications(): UsePushNotificationsReturn {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [badgeCount, setBadgeCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshBadge = useCallback(async () => {
    try {
      const count = await fetchBadgeCount();
      setBadgeCount(count);
    } catch {
      // Silently ignore — badge is cosmetic
    }
  }, []);

  const handleForeground = useCallback(
    (title: string, body: string, data: PushNotificationPayload) => {
      const deepLink = resolveDeepLink(data);
      toast(title, {
        description: body,
        duration: 5000,
        action: {
          label: "Abrir",
          onClick: () => router.push(deepLink),
        },
      });
      // Bump badge count optimistically
      setBadgeCount((prev) => prev + 1);
    },
    [router]
  );

  const requestPermission = useCallback(async () => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    const platform: "android" | "ios" | "web" =
      /android/.test(ua) ? "android" : /iphone|ipad/.test(ua) ? "ios" : "web";

    const deviceName = `${navigator.platform} — ${new Date().toLocaleDateString("pt-BR")}`;
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0";

    const token = await initPushNotifications(platform, deviceName, appVersion);

    if (!token) {
      setPermissionDenied(true);
      return;
    }

    setInitialized(true);
    setPermissionDenied(false);

    // Register foreground handler
    setForegroundMessageHandler(handleForeground);
  }, [handleForeground]);

  // On mount: init if permission already granted, start badge polling
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if we already registered before
    const prevToken = localStorage.getItem("push_token_registered");
    if (prevToken) {
      setInitialized(true);
      setForegroundMessageHandler(handleForeground);
    }

    // Initial badge fetch
    refreshBadge();

    // Poll badge every 60s (replace with SSE/WebSocket in production)
    pollRef.current = setInterval(refreshBadge, BADGE_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [handleForeground, refreshBadge]);

  return { initialized, permissionDenied, badgeCount, requestPermission, refreshBadge };
}
