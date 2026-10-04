# Chordstand

Generate, rearrange and save piano song structures on your phone. A minimal, offline-friendly web app: no accounts, everything stays in your browser.

Pick a style, a mood and a complexity, tap **Generate**, and you get a full song structure (Verse, Chorus, Bridge…) with a chord for every bar. Make chords simpler or richer, reorder and extend sections, then put the phone on the music stand and switch to the large play view.

## Features

- **Setup**: 7 styles (Pop, Ballad, Jazz, Blues, Gospel, Folk, Lo-fi), 6 moods, 5 complexity levels, forms (AB, ABAB, AABA, Verse–Chorus ×2, Verse–Chorus–Bridge, 12-bar blues, or a custom number of sections). Advanced: key, time signature, bars per section, seed.
- **Deterministic generation**: same choices + seed = same song. Rule-based, in the browser, well under 50 ms.
- **Simplify / embellish** one chord, one section or the whole song. Steps are reversible (the generated chord is always kept), and higher levels reveal substitutions (tritone subs in Jazz, borrowed iv in Ballad and Gospel, secondary dominants).
- **Blocks**: drag to reorder (touch and mouse) or use the move up/down buttons; duplicate, delete (with undo), rename, change bar count, "make unique", regenerate one section. Undo/redo for every edit (100 steps).
- **Extend**: add any section or let it suggest what fits next; add an outro, repeat the chorus, or a key change up a semitone.
- **Play view**: full-screen, high-contrast chord grid (chords ≥ 32 px). Tap the left/right half, swipe, or use the arrow keys to move between sections; optional auto-advance at the song's BPM; keeps the screen awake.
- **Library**: autosaves every change, sorted by last edit; rename, duplicate, delete; export one or all songs as JSON and import them again; share a song as a link (the song is compressed into the URL hash, no server).
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

### Storage

- `chordstand:v1:index`: `{id, title, updatedAt}` list for the library
- `chordstand:v1:song:<id>`: one full song (validated with Valibot on read; invalid songs are skipped and reported)
- `chordstand:v1:prefs`: theme, wake lock, numerals, auto-advance, last setup

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
