**English** · [Русский](README.ru.md)

[![ci](https://github.com/RybakovK/opencode-session-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/RybakovK/opencode-session-meter/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

# opencode-session-meter

Generation speed, context usage and prompt cache hit rate in the OpenCode Desktop session header.

```
12 tok/s  ·  86.2k / 200k  ·  cache 87%
```

## Features

- **Speed** — tokens per second while the model writes. The server does not publish streamed token usage, so the plugin counts streamed characters and calibrates characters per token from the last finished step. Four sources feed it, and only one counts at a time: the plugin event bridge, the client event stream of the same server (the first one that reports wins), the window store, and a 1 s poll of the HTTP transcript as a last resort. While a step streams and nothing has arrived yet, the header says `сбор…`.
- **Context** — tokens of the last request (`input + output + reasoning + cache.read + cache.write`, the same total the TUI sidebar shows) against the model's context window. From 75% of the window the number turns warning color, from 90% it turns critical red with a ⚠ mark.
- **Cache** — share of prompt tokens (`input + cache.read + cache.write`) served from the provider's cache. Below 40% on a prompt over 2k tokens the number turns warning color and the tooltip explains that the prompt prefix probably changed.
- **Sparkline** — the tooltip charts the speed of the last 30 seconds, one block per second, and slides in real time. An idle window stays on screen as a flat green baseline.
- **Compaction** — while the session compacts, the header swaps the metrics for `▁▃▅ компакт 12с`. Compaction events carry no total, so the row shows elapsed time instead of a made-up percentage; the tooltip adds the summarized size and whether it was automatic or manual.
- **Alerts** — one toast per threshold and session, plus a system notification while the app is in the background, at 75% and 90%.

Hover the row for a compact tooltip with one row per metric. When the answer has finished, the speed row shows the last step average and says so.

Copy follows the app language: Russian and English, English for every other language.

## What it looks like

A normal session:

```
12 tok/s  ·  86.2k / 200k  ·  cache 87%
```

Warning and critical context — 75% and 90% of the model window:

```
12 tok/s  ·  152k / 200k  ·  cache 61%
⚠ 190k / 200k  ·  cache 40%
```

While the session compacts, and before the first deltas arrive:

```
▅ компакт 12с
сбор…
```

The tooltip, English interface:

```
Speed        42 tok/s
Context      86.2k / 200k · 43%
Cache        87% · read 74k · write 1.2k
──────────────────────────────────────
Speed, 30 s  ▁▂▃▅█▆▃▂▁▁▂▃▅▆▇█▆▅▃▂▁▁▂▃▅▆▇█▆▅▃
```

When the answer has finished, the speed row reads `42 tok/s · step average`, and an idle chart stays as a flat green baseline.

## Install

Requires OpenCode Desktop with the GUI plugin API (2.2 or newer).

```bash
git clone https://github.com/RybakovK/opencode-session-meter.git ~/plugins/opencode-session-meter
```

Add the directory to the plugin list in your global `opencode.json` (or `opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["~/plugins/opencode-session-meter"]
}
```

OpenCode reloads plugins on config changes, so no restart is needed. The built GUI bundle is committed, so a clone works without a build step.

## Settings and commands

- `Settings → Session meter` — show or hide the whole meter, each gauge, and the notifications.
- Command palette — **Toggle session meter** and **Compact session context now**.

Thresholds and compaction advice use the same options as the colors:

```jsonc
{
  "plugins": [
    {
      "package": "~/plugins/opencode-session-meter",
      "options": { "warnPercent": 70, "dangerPercent": 85 }
    }
  ]
}
```

## Architecture

The window entry is wiring; behaviour sits behind small interfaces, each covered by tests:

| module                                      | interface                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/telemetry/sampler.ts`                  | `createSampler({ onChange, now })` → `delta`, `total`, `calibrate`, `tick`, `state`, `ratio`, `reset` |
| `src/meter/view.ts`                         | `buildView(input, prefs, t)` → header segments, tooltip rows, aria text                               |
| `src/meter/alerts.ts`                       | `createAlerts({ thresholds, deliver })` → `observe`, `reset`                                          |
| `src/meter/compaction.ts`                   | `compactionStatus(message, now, ratio)`                                                               |
| `src/telemetry/select.ts`                   | `lastAssistant`, `streamingAssistant`, `runningCompaction` over the message list                      |
| `src/telemetry/transport.ts`                | `createTranscriptPoller({ source, onLength, onState })` → `poll`, `stop`                              |
| `src/telemetry/session-controller.ts`       | `createSessionController({ sampler, probe, bridge, client, source })` → `start`, `stop`               |
| `src/meter/meter-model.ts`                  | `createMeterModel({ session, prefs, alerts })` → `view`, `status`, `label`, `start`, `stop`           |
| `src/telemetry/streams.ts`                  | `bridgeStream(data, sessionID)`, `clientStream(client, sessionID)` → `StreamSource`                   |
| `src/meter/surface.ts`                      | `buildSurface({ view, status, prefs, t })` → `hidden`, `collecting`, `metrics`, `compaction`          |
| `src/meter/diagnostics.ts`                  | `createDiagnostics({ now })` → `observe`, `hint`                                                      |
| `src/meter/prefs.ts`, `src/meter/gauges.ts` | one descriptor list drives prefs, settings and the header                                             |
| `src/plugin/i18n.ts`                        | English source copy plus the Russian translation; English is the fallback                             |

`src/telemetry/metrics.ts` keeps the pure token math. `src/plugin/id.ts` holds the plugin id both entries import.

## Development

```bash
npm install
npm run dev        # rebuild on change; OpenCode reloads the GUI in every window
npm run lint
npm run typecheck
npm test
npm run build      # writes dist/gui-experimental.cjs
```

`dist/gui-experimental.cjs` is committed because OpenCode loads it directly. CI runs the same checks and fails when the committed bundle is stale, so run `npm run build` before committing source changes.

## License

[MIT](LICENSE)
