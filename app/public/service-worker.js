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

  // A tag GROUPS notifications: a new one whose tag is already on screen
  // REPLACES it. That is what should happen when the same announcement is
  // repeated, and never otherwise — but everything without a publisherId
  // shared the tag 'notification', so a cleaning reminder followed by a task
  // assignment left only the task, and the first was gone before it was read.
  //
  // The server's own dedupe key is exactly the right name: 'task-assigned:12'
  // replaces itself and collides with nothing else. It arrives as
  // notificationKey. The fallbacks cover what does not travel through the
  // outbox — a publisher status change is sent on its own path and carries no
  // key, and the type at least keeps different KINDS apart.
  const tag =
    data.notificationKey || data.publisherId || data.type || 'notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/icon-192.png',
      badge: '/icon-mono-96.png',
      tag,
      // A genuine repeat should draw attention again rather than swap itself
      // in silently — otherwise a second reminder for the same thing looks
      // like nothing happened.
      renotify: true,
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
