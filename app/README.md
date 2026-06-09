# mycongregation-app

[![Deploy](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Expo + React Native client for [mycongregation](https://github.com/Backmann/mycongregation-server) — a helper for organizing meetings and managing members in small organizations and groups.

Production web app: **https://mycongregation.org**
Companion API: [mycongregation-server](https://github.com/Backmann/mycongregation-server)

> ⚠️ Independent, community-built tool. Not affiliated with or endorsed by any organization.

## Features

- 🌐 Cross-platform — Web (in production), iOS and Android from one codebase
- 🔐 JWT authentication with sliding refresh-token rotation
- 🌍 Three UI languages: Russian, English, German (more planned)
- 👥 Member records — list, create, edit, soft-delete with restore
- 👨‍👩‍👧 Families and groups
- 🎤 Talks catalog
- 📊 Activity reports with a self-edit window (current month + prior month until day 10)
- 📋 Assignments — scheduled meeting program
- 🔔 Push notifications — Expo Push (native) + Web Push API (browser)
- 👤 Self-service profile — change password, change UI language, edit own info
- 🛡️ Admin user management — role assignment, activate/deactivate (role-based access)

## Tech stack

- [Expo](https://expo.dev/) SDK 54 (React Native 0.81)
- TypeScript (strict mode)
- [Expo Router](https://docs.expo.dev/router/introduction/) — file-based routing
- [TanStack Query](https://tanstack.com/query) — server state and caching
- [react-i18next](https://react.i18next.com/) — internationalization
- [Axios](https://axios-http.com/) — HTTP client with auth interceptors
- [@expo/vector-icons](https://docs.expo.dev/guides/icons/) — Ionicons throughout

## Local development

### Prerequisites

- Node 18+ and npm
- A running [mycongregation-server](https://github.com/Backmann/mycongregation-server) backend (local or staging — see that repo for setup)
- Optional: Xcode (iOS simulator), Android Studio (Android emulator) — only needed for native builds; web works in any browser

### Setup

```bash
git clone https://github.com/Backmann/mycongregation-app.git
cd mycongregation-app
npm install
```

Create a `.env` file at the repo root:

```bash
EXPO_PUBLIC_API_URL=https://api.mycongregation.org/api
EXPO_PUBLIC_VAPID_KEY=<public VAPID key for web push (ask the backend admin)>
```

For local backend development, point at `http://localhost:3002/api` instead.

> Note: `EXPO_PUBLIC_*` variables are inlined into the JS bundle at build time and are intentionally not secret. The VAPID public key is published as such; the matching private key lives only on the server.

### Run

```bash
npm start
```

In the Expo CLI prompt, press:

- `w` — open in web browser
- `i` — open in iOS simulator
- `a` — open in Android emulator

For just the web build during day-to-day work:

```bash
npx expo start --web
```

### Lint

```bash
npm run lint
```

CI gates on zero warnings.

## Building for production

The web build is what ships to https://mycongregation.org:

```bash
npx expo export --platform web
# Outputs a static bundle to dist/
```

In CI/CD, the export step builds the bundle and SCPs it to the production server's web root, served behind nginx with HTTPS terminated at Cloudflare.

## Project structure

```
app/                       # Routes (file-based, expo-router)
  (auth)/                  # Public routes — login, bootstrap
  (app)/                   # Authenticated routes
    profile/               # User profile, talks catalog, admin tools
    publishers/            # Member list, edit, family relations
    assignments/           # Meeting program
    ...
components/                # Shared UI components
lib/
  api.ts                   # Axios client + typed API methods + auth interceptors
  permissions.ts           # Role-based access helpers
  i18n.ts                  # i18next bootstrap
locales/                   # Translation files
  ru.json
  en.json
  de.json
```

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. `npm install`
2. `npm run lint` (ESLint — blocks on warnings)
3. `npx expo export --platform web`
4. `scp` the bundle to the production server
5. Atomic swap into the web root

A typical deploy completes in ~90 seconds.

## Roadmap

- Sub-role permissions (responsibilities — Phase 2 role-based access)
- Native iOS and Android builds via EAS Build
- Offline-first reports
- Expanded internationalization
- Jest test suite

## Contributing

This is a personal project but issues and pull requests are welcome. Please respect the AGPL-3.0 reciprocity: any derivative running as a network service must publish its source.

## License

[GNU AGPL v3.0](LICENSE) — see the [LICENSE](LICENSE) file.
