# Chordstand

Generate, rearrange and save piano song structures on your phone. A minimal, offline-friendly web app: everything is saved in your browser, and signing in with an Atlesque account (optional) syncs your songs across devices.

Pick a style, a mood and a complexity, tap **Generate**, and you get a full song structure (Verse, Chorus, Bridge…) with a chord for every bar. Make chords simpler or richer, reorder and extend sections, then put the phone on the music stand and switch to the large play view.

## Features

- **Setup**: 7 styles (Pop, Ballad, Jazz, Blues, Gospel, Folk, Lo-fi), 6 moods, 5 complexity levels, forms (AB, ABAB, AABA, Verse–Chorus ×2, Verse–Chorus–Bridge, 12-bar blues, or a custom number of sections). Advanced: key, time signature, bars per section, seed.
- **Deterministic generation**: same choices + seed = same song. Rule-based, in the browser, well under 50 ms.
- **Simplify / embellish** one chord, one section or the whole song. Steps are reversible (the generated chord is always kept), and higher levels reveal substitutions (tritone subs in Jazz, borrowed iv in Ballad and Gospel, secondary dominants).
- **Blocks**: drag to reorder (touch and mouse) or use the move up/down buttons; duplicate, delete (with undo), rename, change bar count, "make unique", regenerate one section. Undo/redo for every edit (100 steps).
- **Extend**: add any section or let it suggest what fits next; add an outro, repeat the chorus, or a key change up a semitone.
- **Play view**: full-screen, high-contrast chord grid (chords ≥ 32 px). Tap the left/right half, swipe, or use the arrow keys to move between sections; optional auto-advance at the song's BPM; keeps the screen awake.
- **Library**: autosaves every change, sorted by last edit; rename, duplicate, delete; export one or all songs as JSON and import them again; share a song as a link (the song is compressed into the URL hash, no server).
- **Sync (optional)**: sign in with your Atlesque account (Atlesque Play, email link, no password) and your library is kept on the account and merged with your other devices.
- **Offline PWA**: installable, works offline after the first visit.
- Optional Roman numerals under each chord; light, dark and system themes.

## Development

```sh
npm install
npm run dev        # dev server
npm run check      # svelte-check + TypeScript
npm test           # Vitest unit tests (engine, storage)
npm run build      # static build in build/ (+ build/_headers with CSP hashes)
npm run size       # first-load JS/CSS budget check (50 KB / 10 KB gzip)
npm run preview    # serve build/ like Cloudflare (headers + SPA fallback)
npm run test:e2e   # Playwright + axe on a phone viewport (needs a build)
```

To render the PNG icons after changing `static/favicon.svg`: `npm run icons`.

## Project layout

```
src/
  lib/engine/      generator, simplify/embellish, theory, PRNG (pure TS, no UI)
  lib/storage/     localStorage repository, schema + migrations, export/import, share links
  lib/state/       app prefs/toasts/announcements, editor state with undo/redo + autosave
  lib/components/  BlockCard, ChordChip, ChordSheet, PlayView, SongEditor…
  data/styles/     one JSON file per style: progression pools (add a file to add a style)
  data/            moods, forms, section labels, fixed patterns (12-bar blues)
  routes/          / (library), /new, /song/[id], /song/[id]/play, /s (shared link)
static/            icons, manifest
scripts/           postbuild (_headers + CSP), serve, size budget, icons
tests/unit         Vitest
tests/e2e          Playwright + @axe-core/playwright
```

### Adding a style

Drop a JSON file into `src/data/styles/`. Each pool entry has `degrees` (one Roman numeral per bar, `"ii V"` for two chords in a bar), `weight`, `tonality` (`major`/`minor`), optional `modes`, `roles` (`intro`, `verse`, `chorus`, `bridge`, `outro`), `moods` (or `"*"`) and `minComplexity`. Chords are stored as degrees and rendered into the key, so transposing is free.

### Song library (pre-generated with Claude)

`src/data/library/<style>.json` holds curated song structures for every style, mood and complexity, written offline by Claude through the Message Batches API and shipped as static JSON. Each style is its own lazy chunk, loaded only when you tap **Generate** (and precached by the service worker for offline use), so it never touches the first-load budget. When a library song fits the choices, the generator takes its chords, mode, title and (with the **From the library** form) its section order, then applies keys, chord colours and substitutions as usual; otherwise it falls back to the rule-based pools. It can be switched off under Advanced settings.

Each song stores its parts as degrees, bars separated by `|` and two chords in a bar separated by a space (`"I|vi|ii V|I"`). `src/lib/engine/library-check.ts` validates them, both when the library is built and in the unit tests.

To (re)build it you need an Anthropic API key in `ANTHROPIC_API_KEY`, or in `CHORDSTAND_ANTHROPIC_KEY` in a Claude Code cloud environment, where `ANTHROPIC_API_KEY` is reserved:

```sh
npm run library -- plan                  # request count and cost estimate, spends nothing
npm run library -- submit --limit 3      # small pilot
npm run library -- submit --confirm      # full run: 10 styles x 6 moods x 5 levels x 2 requests
npm run library -- status                # batch progress (most finish within an hour)
npm run library -- collect               # download, validate, de-duplicate, write src/data/library/
```

`plan` and `submit` take `--styles`, `--moods`, `--complexities`, `--per-combo`, `--songs`, `--model` and `--effort` to top up thin combinations. Raw results stay in `scripts/library/.runs/` (git-ignored), so `collect` can be re-run without spending anything.

### Accounts and sync

Sign-in is optional; without it nothing leaves the browser. **Sign in with Atlesque** on the library page goes to the hosted sign-in at [Atlesque Play](https://play.atlesque.dev) ([atlesque/mbp-games](https://github.com/atlesque/mbp-games), where Chordstand is the `chordstand` client in `src/clients.js`) and comes back with a one-time code that the app swaps for a 90-day token (PKCE). Signed in:

- Songs are still saved to localStorage first. Each save or delete is also stamped and, after 10 seconds of quiet, the whole library goes up as the game's progress (`PUT /api/games/chordstand/progress`), deflated and base64'd (a few hundred bytes per song; the account allows 1 MB, so thousands of songs fit). The save's `songs` count is what the Atlesque Play hub shows.
- Opening the app, coming back to the tab (at most once a minute), going online and **Sync now** pull the account's copy first. Merging is per song: the newest change wins, and deletions travel as tombstones (forgotten after 180 days). If another device saved in between, the server answers 409 with its copy, which is merged and sent again.
- Signing out keeps every song in the browser. A 401 (signed out everywhere) does the same and says so.
- The code lives in `src/lib/sync/` and `AccountPanel.svelte`, loaded only when the library page has rendered or someone is signed in, so it is outside the first-load budget.

Cost: Chordstand itself stays static assets only (free requests). Sync requests go to the existing Atlesque Play Worker and its D1 database: a pull on open plus at most one request per 10 seconds of editing. Point a dev build at a local Atlesque Play with `VITE_PLAY_URL=http://localhost:8787 npm run dev` (sign-in redirects only work from origins listed for `chordstand` in mbp-games: production and localhost, not preview URLs).

### Storage

- `chordstand:v1:index`: `{id, title, updatedAt}` list for the library
- `chordstand:v1:song:<id>`: one full song (validated with Valibot on read; invalid songs are skipped and reported)
- `chordstand:v1:prefs`: theme, wake lock, numerals, auto-advance, last setup
- `chordstand:v1:account`: only while signed in: the token, email, the account save's revision, and when each song last changed or was deleted here
- `chordstand:v1:signin`: the PKCE verifier and state while a sign-in is underway

`schemaVersion` plus a migration per version bump lives in `src/lib/storage/schema.ts`. When storage is blocked or full, the app keeps working in memory and says so.

## Hosting on Cloudflare Workers (static assets)

The `chordstand` Worker serves `build/` as static assets, configured in `wrangler.jsonc` (no Worker script). In the Worker's Settings → Build, connect the GitHub repo with:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Build variable: `NODE_VERSION=22`

`not_found_handling: "single-page-application"` serves `index.html` for app routes like `/song/<id>`. The build writes `build/_headers` with long-term caching for hashed assets, `no-cache` for `index.html` and the service worker, and a strict Content-Security-Policy (inline scripts allowed by hash only), `Referrer-Policy` and `Permissions-Policy`. No Functions, KV or D1 are used.

## CI

`.github/workflows/ci.yml` runs typecheck, unit tests, build and the size budget; Playwright + axe end-to-end tests on a phone viewport (light and dark); and Lighthouse CI, which fails below 95 in any category.

## Licence

MIT
