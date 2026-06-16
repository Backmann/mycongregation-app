# mycongregation

[![Deploy](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/Backmann/mycongregation-app/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A modern, privacy-first web and mobile platform for organizing recurring
meetings and coordinating members in communities and groups.

Live: **https://mycongregation.org**

> ⚠️ This is an unofficial, community-built tool. Not affiliated with or endorsed by any organization.

## Why it's different

**Privacy by design.** Publication files (EPUB) are parsed **entirely in
the browser** — their contents never reach the server. Only the derived
schedule metadata (part labels, order, durations) is sent to the API. The
source document stays on the user's device.

**Encryption at rest.** Personal data is encrypted at the database-column
level with **AES-256-GCM** authenticated encryption (RFC 5288) via a
TypeORM value transformer — encrypted on write, decrypted on read.
Encryption is versioned (`enc:v1:`) for phased rollout, and tampered
ciphertext fails closed rather than returning corrupted data.

**Fine-grained access control.** A role-based permission model with
per-section capability grants, email invitations with a passwordless
set-up flow, and a sliding-window login rate limiter.

## Features

- 👥 **Members** — directory with roles, status tracking, and soft-delete
- 👨‍👩‍👧 **Families** — household management with member linking
- 🤝 **Groups** — weekly group organization and coordination
- 📋 **Assignments** — plan recurring meeting parts with a focused planning mode, including auto-advance through unfilled slots
- 🧹 **Duties & cleaning** — assign responsibilities and cleaning slots to people and groups
- 🎤 **Talks catalog** — searchable catalog with bulk import and speaker history
- 📅 **Schedule import** — parse program EPUBs into editable schedules, **client-side** (see Privacy above), with drag-and-drop on web
- 🔔 **Notifications** — web push (VAPID) plus an in-app notification center
- 🌍 **Localization** — full UI in English, Russian, and German, with proper `<html lang>` and document title handling

## Tech stack

- [Expo](https://expo.dev/) (React Native for Web + iOS + Android)
- TypeScript (strict mode)
- expo-router (file-based routing)
- @tanstack/react-query for data fetching
- Axios + JWT auth via expo-secure-store

Backend API: [mycongregation-server](https://github.com/Backmann/mycongregation-server)
— NestJS, PostgreSQL, TypeORM, with column-level encryption, Sentry
monitoring, daily database backups, and a test suite run in CI.

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

Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
