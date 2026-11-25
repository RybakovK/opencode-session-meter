import { type ContextTone, formatTokens } from "../telemetry/metrics"
import type { Translate } from "./translate"

export type GaugeID = "speed" | "context" | "cache"

export type GaugeDerived = {
  measured: number | undefined
  step: number | undefined
  used: number
  limit: number | undefined
  percent: number | undefined
  tone: ContextTone | undefined
  cache: { percent: number; read: number; write: number; low: boolean } | undefined
}

export type SegmentView = {
  text: string
  tone?: ContextTone
  low?: boolean
}

export type RowView = {
  label: string
  value: string
}

export type Gauge = {
  id: GaugeID
  title: string
  description: string
  segment?(derived: GaugeDerived, t: Translate): SegmentView | undefined
  row?(derived: GaugeDerived, t: Translate): RowView | undefined
}

const formatContext = (used: number, limit: number | undefined) =>
  limit ? `${formatTokens(used)} / ${formatTokens(limit)}` : formatTokens(used)

export const GAUGES: readonly Gauge[] = [
  {
    id: "speed",
    title: "settings.speed",
    description: "settings.speed.description",
    segment(derived, t) {
      if (derived.measured === undefined) return undefined
      return { text: t("header.speed", { rate: Math.round(derived.measured) }) }
    },
    row(derived, t) {
      const speed = derived.measured ?? derived.step
      if (speed === undefined) return undefined
      const value = t("tip.speedValue", { rate: Math.round(speed) })
      return {
        label: t("tip.speed"),
        value: derived.measured === undefined ? `${value} · ${t("tip.average")}` : value,
      }
    },
  },
  {
    id: "context",
    title: "settings.context",
    description: "settings.context.description",
    segment(derived) {
      if (derived.used <= 0) return undefined
      const size = formatContext(derived.used, derived.limit)
      return { text: derived.tone === "danger" ? `⚠ ${size}` : size, tone: derived.tone }
    },
    row(derived, t) {
      if (derived.used <= 0) return undefined
      return {
        label: t("tip.context"),
        value: derived.limit
          ? t("tip.contextValue", {
              used: formatTokens(derived.used),
              limit: formatTokens(derived.limit),
              percent: derived.percent ?? 0,
            })
          : t("tip.contextValueOnly", { used: formatTokens(derived.used) }),
      }
    },
  },
  {
    id: "cache",
    title: "settings.cache",
    description: "settings.cache.description",
    segment(derived, t) {
      if (!derived.cache) return undefined
      return { text: t("header.cache", { percent: derived.cache.percent }), low: derived.cache.low }
    },
    row(derived, t) {
      if (!derived.cache) return undefined
      return {
        label: t("tip.cache"),
        value: t("tip.cacheValue", {
          percent: derived.cache.percent,
          read: formatTokens(derived.cache.read),
          write: formatTokens(derived.cache.write),
        }),
      }
    },
  },
]
