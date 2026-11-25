# Contributing

## Setup

```bash
npm install
npm run dev        # vite build --watch
```

OpenCode Desktop reloads the GUI in every window after each rebuild, so you can iterate against a live app.

## Checks

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run lint` runs Biome (formatting plus the recommended rules); `npm run format` rewrites the sources.

Tests use `bun:test` and import modules through the package's conditional subpath imports (`#src/...`), declared in `package.json`. Source files keep relative imports because the OpenCode loader imports the server entrypoint at runtime. Run them through `npm test`: it passes `--conditions=browser` so Solid resolves the client build and signals stay reactive.

## Layout

The window entry (`src/plugin/gui.tsx`) only wires modules together. Behaviour lives behind small interfaces with tests on the other side:

- `src/telemetry/sampler.ts` — the sampling state machine (deltas, polled totals, buckets, calibration, rate).
- `src/meter/view.ts` — one snapshot drives the header segments, the tooltip rows and the accessible text.
- `src/meter/alerts.ts` — threshold policy and the once-per-session rule; delivery is injected.
- `src/meter/compaction.ts`, `src/telemetry/select.ts` — small pure modules.
- `src/plugin/i18n.ts` — English source copy and the Russian translation.

Prefer adding a test through the module interface over testing the Solid component.

## Docs

`README.md` is the English source and the default on GitHub. `README.ru.md` mirrors it in Russian; update both in the same change so the language switch at the top never points at a stale page.

## Bundle

`dist/gui-experimental.cjs` is committed because OpenCode loads it directly. Run `npm run build` and commit the result; CI fails when the committed bundle does not match the sources.
