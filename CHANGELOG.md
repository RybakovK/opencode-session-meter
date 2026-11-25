# Changelog

## 0.1.0 — 2026-11-25

First public release.

- Session header meter: generation speed, context usage against the model window, prompt cache hit rate.
- Live speed from four sources with first-wins arbitration: plugin event bridge, client event stream, window store and a 1 s HTTP transcript poll.
- A live reading older than three seconds falls back to the finished step average.
- Warning colours at 75% and 90% of the context window, configurable per plugin entry.
- Tooltip with exact numbers and a 30 s speed chart that slides in real time.
- Cache diagnostic when the share of cached prompt tokens drops below 40%.
- Compaction indicator with elapsed time and summarized size; collecting is its own header mode.
- Threshold alerts as a toast, plus a system notification while the app is in the background.
- Commands to toggle the meter and to compact the session.
- ErrorBoundary around the header: a crash shows `meter unavailable` instead of removing the row.
- Controller stops on unmount and when the header is hidden or the plugin is off; disabled gauges hide their rows too.
- English and Russian copy; English is the fallback.
- Biome checks, typechecked tests and a CI gate for lint, tests, build and bundle freshness.
