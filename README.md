# mycongregation

[![Deploy](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Modern web and mobile app for organizing congregation meetings and members.

Live: **https://mycongregation.org**

> ⚠️ This is an unofficial, community-built tool. Not affiliated with or endorsed by any religious organization.

## Features

- 👥 **Publishers** — directory with pioneer status, appointed roles, soft-delete
- 👨‍👩‍👧 **Families** — household management with member linking
- 🤝 **Service groups** — weekly field service organization
- 📋 **Assignments** — midweek and weekend meeting parts
- 🎤 **Public talks** — 190+ catalog with bulk import, search, speaker history
- 📅 **Schedule import** — parse weekly meeting program EPUBs into editable schedules

## Tech stack

- [Expo](https://expo.dev/) (React Native for Web + iOS + Android)
- TypeScript (strict mode)
- expo-router (file-based routing)
- @tanstack/react-query for data fetching
- Axios + JWT auth via expo-secure-store

Backend API: [mycongregation-server](https://github.com/Backmann/mycongregation-server)

## Repository structure

- `app/` — Expo project (the actual app code — start here)
- `mobile/` — legacy mobile project (excluded via .gitignore)

## Development

Requirements: Node.js 20+, npm

```bash
git clone https://github.com/Backmann/mycongregation-app.git
cd mycongregation-app/app
npm install

EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo start
```

Then:
- Web: http://localhost:8081
- iOS/Android: scan QR with Expo Go

## Production build (web)

```bash
cd app
EXPO_PUBLIC_API_URL=https://api.mycongregation.org/api npx expo export --platform web
```

Output in `app/dist/` is deployed as static files behind nginx + Cloudflare.

## License

[AGPL-3.0](LICENSE) — derivative works distributed over a network must publish their source.

Copyright (C) 2026 Lionel Backmann (Hovorukha)
