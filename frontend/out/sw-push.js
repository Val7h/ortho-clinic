/**
 * sw-push.js — Service Worker: Push Notification Navigation Handler
 *
 * Registrado por registerServiceWorker() no NavigationProvider.
 * Recebe push notifications e navega para a tela correta.
 *
 * Payload esperado (JSON):
 * {
 *   "type": "NEW_APPOINTMENT" | "APPOINTMENT_REMINDER" | "PATIENT_UPDATE" | "DOCUMENT_READY",
 *   "title": "string",
 *   "body": "string",
 *   "data": {
 *     "url": "/agenda?consulta=123",   // destino de navegação
 *     "consultationId": 123,
 *     "patientId": 456
 *   }
 * }
 */

const CACHE_NAME = "orthoclinic-v1";

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/offline.html"])
    )
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first with offline fallback ─────────────────────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Skip API calls and Next.js HMR
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/webpack-hmr")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached ?? caches.match("/offline.html"))
      )
  );
});

// ── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let payload = { title: "OrthoClinic", body: "Nova notificação", data: {} };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload.body = event.data?.text() ?? payload.body;
  }

  const options = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.type ?? "default",
    renotify: true,
    data: payload.data ?? {},
    actions: buildActions(payload.type),
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

function buildActions(type) {
  if (type === "APPOINTMENT_REMINDER") {
    return [
      { action: "view", title: "Ver consulta" },
      { action: "dismiss", title: "Dispensar" },
    ];
  }
  if (type === "NEW_APPOINTMENT") {
    return [{ action: "view", title: "Ver agenda" }];
  }
  if (type === "DOCUMENT_READY") {
    return [{ action: "view", title: "Ver documento" }];
  }
  return [];
}

// ── Notification click → navigate ─────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  if (action === "dismiss") return;

  const data = event.notification.data ?? {};
  let targetUrl = data.url ?? "/";

  // Fallback URL mapping by notification type
  if (!data.url) {
    if (data.consultationId) targetUrl = `/agenda?consulta=${data.consultationId}`;
    else if (data.patientId) targetUrl = `/pacientes/${data.patientId}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If app window already open, focus + navigate via postMessage
        const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
        if (existing) {
          existing.focus();
          existing.postMessage({
            type: "NAVIGATE",
            url: targetUrl,
            data,
          });
          return;
        }
        // Otherwise open new window
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ── Background Sync (retry failed API calls) ──────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-consultations") {
    event.waitUntil(syncPendingConsultations());
  }
});

async function syncPendingConsultations() {
  // Placeholder — actual implementation reads from IndexedDB pending queue
  const cache = await caches.open(CACHE_NAME);
  const pendingKey = "pending-consultations";
  const cached = await cache.match(pendingKey);
  if (!cached) return;

  try {
    const pending = await cached.json();
    for (const item of pending) {
      await fetch("/api/v1/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: item.token },
        body: JSON.stringify(item.data),
      });
    }
    await cache.delete(pendingKey);
  } catch {
    // Will retry on next sync event
  }
}
