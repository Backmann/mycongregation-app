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
    // «Задача на завтра» was missing from this list from the start, so the
    // one reminder a brother has a whole evening to act on led nowhere.
    case 'task_tomorrow':
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
    // The Memorial has no screen of its own on purpose: its programme opens
    // in the week, in the place of the meeting it took away. So both of its
    // notices lead exactly where the schedule's do.
    case 'memorial_published':
    case 'memorial_tomorrow':
      return {
        path: '/schedule',
        params: data.weekStartDate ? { week: data.weekStartDate, meeting: 'memorial' } : {},
      };
    // An event opens its own page: what it is, when, where, and what it
    // changes for the meetings. Without an id, the list of events.
    case 'special_event':
      return data.eventId
        ? { path: `/special-events/${data.eventId}`, params: {} }
        : { path: '/special-events', params: {} };
    // A special talk is a talk of the weekend meeting: it opens that meeting.
    case 'special_talk':
      return {
        path: '/schedule',
        params: data.weekStartDate ? { week: data.weekStartDate, meeting: 'weekend' } : {},
      };
    case 'field_service_meeting':
      return { path: '/cart/field-service', params: {} };
    // The carts: a published week for whoever is on it, a request or a
    // cancellation for whoever arranges them — all three open the carts.
    case 'cart_published':
    case 'cart_dobor_request':
    case 'cart_cancel':
      return { path: '/cart/witnessing', params: {} };
    // A talk one of ours gives in another congregation. It stands on Home,
    // among his own things, with the address of the hall.
    case 'outgoing_talk':
      return { path: '/home', params: {} };
    // Cleaning has its own screen: the reminder opens the week it is about.
    case 'cleaning_after_meeting':
    case 'cleaning_weekly_monday':
    case 'cleaning_weekly_planned':
    case 'cleaning_general_planned':
      return {
        path: '/publishers/cleaning-week',
        params: data.weekStart ? { week: data.weekStart } : {},
      };
    // The evening digest is about the reader's own assignments.
    case 'assignment_reminder':
      return { path: '/home/my-assignments', params: {} };
    // What a meeting still lacks, for whoever assembles it.
    case 'meeting_gaps':
      return {
        path: '/schedule/edit',
        params: data.weekStartDate ? { week: data.weekStartDate } : {},
      };
    // «Отправить пробное» is sent from this screen; tapping it comes back.
    case 'test':
      return { path: '/profile/notifications', params: {} };
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

// ===========================================================================
// THE APP ITSELF, KEPT FOR A HALL WITH NO SIGNAL (8 October 2026)
//
// Until then this worker only showed notifications, and a browser with no
// connection could not open the app at all — however much of the person's
// programme was kept inside it (lib/offline-keep.ts). On an iPhone the web
// app IS the app.
//
//   • Pages: the NETWORK first — online, every opening gets the page the
//     server has now, exactly as before — and a copy is kept. With no network,
//     or no answer in five seconds, the kept copy opens.
//   • The program, fonts and pictures carry a hash in their name: a name is
//     one content for ever, so a kept one is served without asking.
//   • Nothing else is touched: not the data server (another address), not
//     /app/ (the APK), not build-info.json, not anything but a plain GET.
//   • Any error in here falls through to the network, as if this part did
//     not exist. A broken cache must never be a broken site.
//
// The site is deployed by wiping its folder, so an old program does not
// outlive a deploy on the server. Here a page is never kept apart from the
// program it names: when a new program appears, every kept page is fetched
// again with it, and programs no kept page names are dropped.
// ===========================================================================

const PAGES = 'mc-pages-v1';
const FILES = 'mc-files-v1';
const PAGE_WAIT_MS = 5000;
/** Kept at installation, so they open offline even if never visited here. */
const SHELL = ['/', '/home', '/home/my-assignments', '/schedule', '/login'];
const ENTRY = /\/_expo\/static\/js\/web\/entry-[0-9a-f]+\.js/g;

// <<< OFFLINE RULES — pure; scripts/check-offline-shell.mjs runs this block.
/**
 * What this worker does with a request: 'page' (network first, kept copy
 * when there is none), 'file' (hash-named: kept copy first), 'icon' (network
 * first) — or null: not touched at all.
 */
function offlineRule(href, method, mode, origin) {
  if (method !== 'GET') return null;
  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return null;
  }
  if (url.origin !== origin) return null;
  const p = url.pathname;
  if (p === '/app' || p.startsWith('/app/')) return null;
  if (p.startsWith('/.well-known/')) return null;
  if (p === '/build-info.json' || p === '/service-worker.js' || p === '/screen-check.html') return null;
  if (p.startsWith('/_expo/static/') || p.startsWith('/assets/')) return 'file';
  if (mode === 'navigate') return 'page';
  if (
    p === '/favicon.ico' ||
    p === '/favicon-32.png' ||
    p === '/icon-192.png' ||
    p === '/icon-mono-96.png' ||
    p === '/apple-touch-icon-180.png' ||
    p === '/manifest.webmanifest'
  )
    return 'icon';
  return null;
}

/** One kept copy per page, whatever the query: «/schedule?week=…» is «/schedule». */
function pageKey(href) {
  const url = new URL(href);
  let p = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return url.origin + (p || '/');
}

/** The programs a page names. */
function programsIn(html) {
  return Array.from(new Set(String(html).match(ENTRY) || []));
}
// >>> OFFLINE RULES

/**
 * A file worth keeping: a real answer of our own site, and not a page. A
 * missing file may be answered with the app's page and «200» (that is how a
 * route without a file of its own is served) — kept under a program's name,
 * that page would break the app for good.
 */
function isKeepableFile(res) {
  return !!res && res.ok && res.type === 'basic' && !(res.headers.get('content-type') || '').includes('text/html');
}

function isHtml(res) {
  return !!res && res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html');
}

async function keepPage(key, res) {
  const html = await res.text();
  const cache = await caches.open(PAGES);
  await cache.put(
    key,
    new Response(html, { headers: { 'content-type': res.headers.get('content-type') || 'text/html; charset=utf-8' } }),
  );
  return programsIn(html);
}

/** Fetch and keep a program (or any hash-named file) — once. */
async function keepFile(href) {
  const cache = await caches.open(FILES);
  if (await cache.match(href)) return;
  const res = await fetch(href, { cache: 'no-store' });
  if (isKeepableFile(res)) await cache.put(href, res);
}

/**
 * Bring every kept page to the program the server serves now, then drop the
 * programs that no kept page names any more. One at a time.
 */
let refreshing = null;
function refreshShell() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const origin = self.location.origin;
    const pages = await caches.open(PAGES);
    const keys = new Set(SHELL.map((p) => origin + p));
    for (const req of await pages.keys()) keys.add(req.url);
    const named = new Set();
    for (const key of keys) {
      try {
        const res = await fetch(key, { cache: 'no-store', credentials: 'same-origin' });
        if (!isHtml(res)) continue;
        for (const prog of await keepPage(key, res)) {
          await keepFile(origin + prog);
          named.add(origin + prog);
        }
      } catch (e) {
        // Offline in the middle of it: what was kept stays as it was.
        return;
      }
    }
    // Every kept page now names a kept program; the rest are a deploy behind.
    for (const req of await pages.keys()) {
      const res = await pages.match(req);
      if (res) for (const prog of programsIn(await res.text())) named.add(origin + prog);
    }
    const files = await caches.open(FILES);
    for (const req of await files.keys()) {
      if (/\/_expo\/static\/js\/web\/entry-/.test(req.url) && !named.has(req.url)) await files.delete(req);
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function servePage(event) {
  const key = pageKey(event.request.url);
  const network = fetch(event.request).then((res) => {
    if (isHtml(res)) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          const progs = await keepPage(key, copy);
          // A program not kept yet: a deploy (or the first opening). Bring
          // every kept page along to it, and keep the program itself.
          const files = await caches.open(FILES);
          let fresh = false;
          for (const prog of progs) if (!(await files.match(self.location.origin + prog))) fresh = true;
          if (fresh) await refreshShell();
        })().catch(() => {}),
      );
    }
    return res;
  });
  const late = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_WAIT_MS));
  const first = await Promise.race([network.catch(() => null), late]);
  if (first) return first;
  // No network, or no answer in time: the kept copy of this page — or of
  // «Главная», which opens any screen once the program has started.
  const pages = await caches.open(PAGES);
  const kept =
    (await pages.match(key)) ||
    (await pages.match(self.location.origin + '/home')) ||
    (await pages.match(self.location.origin + '/'));
  if (kept) return kept;
  return network; // nothing kept: whatever the network ends up saying
}

async function serveFile(request) {
  const cache = await caches.open(FILES);
  const kept = await cache.match(request.url);
  if (kept) return kept;
  const res = await fetch(request);
  if (isKeepableFile(res)) {
    const copy = res.clone();
    cache.put(request.url, copy).catch(() => {});
  }
  return res;
}

async function serveIcon(request) {
  try {
    const res = await fetch(request);
    if (isKeepableFile(res)) {
      const copy = res.clone();
      caches.open(FILES).then((c) => c.put(request.url, copy)).catch(() => {});
    }
    return res;
  } catch (e) {
    const kept = await caches.open(FILES).then((c) => c.match(request.url));
    if (kept) return kept;
    throw e;
  }
}

self.addEventListener('install', (event) => {
  // Takes over at once: what it adds is only ever a fallback.
  self.skipWaiting();
  // Never fails the installation — notifications must work regardless.
  event.waitUntil(refreshShell().catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('mc-') && name !== PAGES && name !== FILES) await caches.delete(name);
      }
      await self.clients.claim();
    })().catch(() => {}),
  );
});

self.addEventListener('fetch', (event) => {
  let rule = null;
  try {
    rule = offlineRule(event.request.url, event.request.method, event.request.mode, self.location.origin);
  } catch (e) {
    rule = null;
  }
  if (!rule) return;
  const handle = rule === 'page' ? servePage(event) : rule === 'file' ? serveFile(event.request) : serveIcon(event.request);
  event.respondWith(handle.catch(() => fetch(event.request)));
});

/**
 * The page tells what it loaded before this worker was in charge — the
 * fonts above all — so they are kept from the first opening, not the second.
 */
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'keep-loaded' || !Array.isArray(msg.urls)) return;
  const origin = self.location.origin;
  event.waitUntil(
    (async () => {
      for (const href of msg.urls.slice(0, 200)) {
        if (offlineRule(String(href), 'GET', 'no-cors', origin) === 'file') {
          await keepFile(String(href)).catch(() => {});
        }
      }
    })(),
  );
});
