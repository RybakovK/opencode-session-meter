import {
  type ContextTone,
  cacheDiagnostic,
  cacheShare,
  contextPercent,
  contextTokens,
  contextTone,
  sparkline,
  type Tokens,
} from "../telemetry/metrics"
import { GAUGES, type GaugeDerived, type GaugeID } from "./gauges"
import { gaugeEnabled, type Prefs } from "./prefs"
import type { Translate } from "./translate"

export type MeterInput = {
  tokens: Tokens | undefined
  limit: number | undefined
  measured: number | undefined
  step: number | undefined
  history: readonly number[]
  seconds: number
  collecting: boolean
  diagnostic: string | undefined
  warnPercent: number
  dangerPercent: number
}

export type Segment = {
  id: GaugeID
  text: string
  tone: ContextTone | undefined
  low: boolean
}

export type Row =
  | { kind: "row"; id: string; label: string; value: string }
  | { kind: "spark"; id: "spark"; label: string; value: string }
  | { kind: "hint"; id: string; value: string }
  | { kind: "sep"; id: string }

export const segmentTone = (segment: Segment): "warn" | "danger" | undefined =>
  segment.tone === "danger" ? "danger" : segment.tone === "warning" || segment.low ? "warn" : undefined

export type MeterView = {
  segments: Segment[]
  rows: Row[]
  aria: string
  collecting: boolean
}

export function buildView(input: MeterInput, prefs: Prefs, t: Translate): MeterView {
  const tokens = input.tokens
  const share = tokens ? cacheShare(tokens) : undefined
  const percent = tokens ? contextPercent(tokens, input.limit) : undefined

  const derived: GaugeDerived = {
    measured: input.measured,
    step: input.step,
    used: tokens ? contextTokens(tokens) : 0,
    limit: input.limit,
    percent,
    tone: contextTone(percent, input.warnPercent, input.dangerPercent),
    cache:
      share !== undefined && tokens
        ? {
            percent: Math.round(share * 100),
            read: tokens.cache.read,
            write: tokens.cache.write,
            low: cacheDiagnostic(tokens),
          }
        : undefined,
  }

  const segments: Segment[] = []
  const rows: Row[] = []

  for (const gauge of GAUGES) {
    if (!gaugeEnabled(prefs, gauge.id)) continue

    const segment = gauge.segment?.(derived, t)
    if (segment) {
      segments.push({ id: gauge.id, text: segment.text, tone: segment.tone, low: segment.low ?? false })
    }

    const row = gauge.row?.(derived, t)
    if (row) rows.push({ kind: "row", id: gauge.id, label: row.label, value: row.value })
  }

  if (gaugeEnabled(prefs, "cache") && derived.cache?.low) {
    rows.push({ kind: "hint", id: "cacheLow", value: t("tip.cacheLow", { percent: derived.cache.percent }) })
  }

  if (input.collecting && input.diagnostic) {
    rows.push({ kind: "hint", id: "diagnostic", value: input.diagnostic })
  }

  if (gaugeEnabled(prefs, "speed")) {
    const spark = sparkline(input.history) || "▁".repeat(input.seconds)
    rows.push({ kind: "sep", id: "sep" })
    rows.push({ kind: "spark", id: "spark", label: t("tip.spark", { seconds: input.seconds }), value: spark })
  }

  const aria = rows
    .filter((row) => row.kind === "row" || row.kind === "hint")
    .map((row) => (row.kind === "row" ? `${row.label}: ${row.value}` : row.value))
    .join("\n")

  return { segments, rows, aria, collecting: input.collecting && gaugeEnabled(prefs, "speed") }
}
