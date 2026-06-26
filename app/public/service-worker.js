// Service Worker for Web Push notifications (mycongregation.org PWA).
// Renders push messages as system notifications and routes clicks back to
// the app (focuses an existing tab if open, otherwise opens a new one).

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Notification', body: event.data.text() };
  }

  const title = payload.title || 'Notification';
  const body = payload.body || '';
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/icon-192.png',
      badge: '/icon-mono-96.png',
      tag: data.publisherId || 'notification',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  let path = '/';
  if (data.type === 'publisher_status_change' && data.publisherId) {
    path = '/publishers/' + data.publisherId;
  }

  const url = self.registration.scope.replace(/\/$/, '') + path;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
