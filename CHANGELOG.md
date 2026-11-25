# Changelog

## Unreleased

- Session wiring extracted into `session-controller.ts`, covered by tests: stream first-wins, store fallback, polling, cleanup.
- Transcript polling extracted into `transport.ts` with interval, timeout, abort and its own tests.
- A live speed reading older than three seconds falls back to the finished step average instead of staying on screen.
- Biome checks (`npm run lint`) and a CI lint step.
- `MeterModel`: all header state and the diagnostics timer behind one interface, with regression tests that read every accessor at creation.
- `streams.ts`: the bridge and client `StreamSource` adapters, covered by tests for filtering and abort.
- An `ErrorBoundary` around the header contribution: a crash shows `meter unavailable` instead of removing the row.
- `buildSurface` decides the header mode once: hidden, collecting, metrics or compaction.
- Tests run with the browser condition so Solid signals and memos are reactive.
- `diagnostics.ts` owns the five-second "collecting" explanation with an injected clock.
- The controller is stopped on unmount and when the header is hidden or the plugin is off; disabled gauges hide their tooltip rows; colour follows the tone a descriptor computed.

## 0.1.0 — 2026-11-24

First public release.

- Session header meter: generation speed, context usage against the model window, prompt cache hit rate.
- Warning colors at 75% and 90% of the context window, configurable per plugin entry.
- Tooltip with exact numbers and a 30 s speed chart that slides in real time.
- Cache diagnostic when the share of cached prompt tokens drops below 40%.
- Compaction indicator with elapsed time and summarized size.
- Threshold alerts as a toast, plus a system notification while the app is in the background.
- Commands to toggle the meter and to compact the session.
- English and Russian copy; English is the fallback.
