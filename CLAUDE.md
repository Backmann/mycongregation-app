# CLAUDE.md — mycongregation-app

Expo / React Native app (web + Android + iOS). The Expo project lives in `app/`;
the repository root holds CI, Maestro flows and Claude settings.
Public repository: write neutral language (participants, groups, meetings,
programme parts, schedules); no names of organisations, no personal data.

## Never
- Never touch `app/package.json` or `app/.gitignore` (this includes the
  `scripts` block). Both feed the Expo fingerprint; a changed runtime means
  over-the-air updates stop reaching installed phones. Guarded by
  `.claude/hooks/protect-expo-fingerprint.mjs` and a CI step.
- Never run `prettier --write` on app files — there is no prettier config here
  and it rewrites whole files.
- Never rewrite published history (no force-push, no rebase of `main`).
- Never commit file or folder names that break on Windows (device names such as
  `aux`, `con`, `nul`; `<>:"\|?*`; trailing dot/space; case-only differences).
  `scripts/check-windows-paths.mjs` guards it.

## The gate
- One command, from `app/`: `node scripts/gate.mjs`. CI runs the same command.
- A new check is a new `scripts/check-*.mjs` wired into `gate.mjs` — never a
  `package.json` script (see "Never").
- The gate does NOT run the bundler: when imports or platform code change, also
  run `npx expo export --platform web` and `--platform android`.
- Every lesson learned the hard way should end as a check in the gate, not as a
  note somewhere.
- A test is only trusted after the reverse check: reintroduce the bug and watch
  the new test fail. Make sure the injected bug really landed before concluding.

## Traps that cost time before
- Expo Router turns any folder under `app/(app)` not named in
  `app/(app)/_layout.tsx` into a visible tab. Each screen needs a line, usually
  `<Tabs.Screen name="x" options={{ href: null }} />` (`scripts/check-tabs.mjs`).
- Hermes has no `Intl.PluralRules` and no `Intl.DateTimeFormat.formatRange`:
  use `lib/plural-rules.ts` and `lib/week-range.ts`.
- react-native-web does not implement `Image.resolveAssetSource` (blank screen,
  no type error). Check the library source before using a native-only RN API.
- What happens in a given week (meeting day, hour, place, moves) has ONE
  authority: `lib/week-rules.ts`. Do not recompute it elsewhere.
- Part times on Home use the same layout as the programme sheet
  (`lib/run-order.ts`); order of own parts comes from `lib/home-timeline.ts`.
- The same entity is often rendered in several files: list every renderer
  before fixing one.
- Moving a screen into a shared shell silently drops what the old frame held
  (padding, error text). Look at the result, not only the linter.
- Nested scroll views of the same direction fight on phones.
- `cmd | head` hides the exit code of `cmd`; redirect to a file and check `$?`.
- A guard that decides "already done" must test a string that exists only after
  the change.

## Checking screens
- Every pull request that touches `app/` gets the CI job `screens`: main and
  the PR photographed on an invented congregation (server
  `scripts/seed-screens.mjs`), 48 frames — phone, tablet, wide; admin and
  publisher; a few in German. Defects on the PR's frames fail it (text cut
  off or invisible, sideways scrolling, raw keys, failure screens, console
  errors, 5xx); changed frames are only reported. The report asking
  to deploy names every changed frame and whether it was meant to change;
  the pictures are in the run's `screens` artifact.
- A screen the app needs data for that the seed lacks: extend the seed in the
  server repository (same branch name), not the app.
- Before/after: `node scripts/screens.mjs <label>` twice, then
  `node scripts/screens-compare.mjs <a> <b>`; say in advance which frames must
  differ, and look only at those. Call scripts directly, not via npm.
- Walkthrough: `node scripts/walkthrough.mjs <label>` (needs `CHROME`,
  `SERVER_DIR`).
- Android: `scripts/android-*.mjs`; Maestro flows in `/maestro/*.yaml`
  (live-data flows only look, never change data).
- Animations must respect "reduce motion" (`lib/reduce-motion.ts`); scripts set
  animation scales to 0 and wait for screen text, not for fixed seconds.

## Delivery
- Branch `claude/<topic>`, pull request, conventional commits in English.
- Merging to `main` deploys: web from CI, and the `ota` job publishes the
  Android update to channel `preview` only if the runtime equals the one on
  the phones. There is no `production` channel.
- The server is always deployed before the app.
