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

/**
 * Where a notification leads when it is tapped.
 *
 * Only ONE of the thirteen kinds was answered here — a publisher status
 * change — and it led to the publisher's card while the phone led to the
 * status history. Everything else opened the root of the app, so a reminder
 * about a task, a duty, cleaning or a visiting speaker took the reader
 * nowhere in particular.
 */
function routeForNotification(data) {
  // <<< NOTIFICATION ROUTES — one table, two copies. The service worker is
  // loaded by the browser on its own and cannot import from lib/, so this
  // block is duplicated on purpose; scripts/check-notification-routes.mjs
  // compares the two and fails the gate if they ever drift apart.
  switch (data.type) {
    // The history explains WHY the status changed — which months were
    // missed — and that is what the reader of this notification wants. The
    // card shows the person as a whole, most of which is beside the point.
    case 'publisher_status_change':
      return data.publisherId
        ? {
            path: '/service-reports/publisher-history',
            params: { publisherId: data.publisherId },
          }
        : null;
    // taskId travels with these, but there is no screen that opens one task
    // by id. His own list is the closest true answer.
    case 'task_assigned':
    case 'task_soon':
    case 'task_overdue':
      return { path: '/profile/my-tasks', params: {} };
    case 'agenda_approved':
    case 'elders_meeting_tomorrow':
      return {
        path: '/tasks/agenda',
        params: data.meetingId ? { meetingId: data.meetingId } : {},
      };
    case 'report_reminder':
      if (data.scope === 'overseer')
        return { path: '/service-reports/group', params: {} };
      if (data.scope === 'secretary')
        return { path: '/service-reports', params: {} };
      return {
        path: '/service-reports/new',
        params: data.reportMonth ? { reportMonth: data.reportMonth } : {},
      };
    case 'schedule_published':
    case 'schedule_changed':
      return {
        path: '/schedule',
        params: data.weekStartDate ? { week: data.weekStartDate } : {},
      };
    case 'field_service_meeting':
      return { path: '/cart/field-service', params: {} };
    // Cleaning has no screen of its own — the assignments live inside the
    // schedule week, so that is where the reminder leads.
    case 'cleaning_after_meeting':
    case 'cleaning_weekly_monday':
    case 'cleaning_weekly_planned':
    case 'cleaning_general_planned':
      return {
        path: '/schedule',
        params: data.weekStart ? { week: data.weekStart } : {},
      };
    default:
      return null;
  }
  // >>> NOTIFICATION ROUTES
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  const route = routeForNotification(data);
  let path = route ? route.path : '/';
  if (route && route.params) {
    const q = new URLSearchParams(route.params).toString();
    if (q) path += '?' + q;
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
