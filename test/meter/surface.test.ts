import { describe, expect, test } from "bun:test"
import { INITIAL_PREFS } from "#src/meter/prefs"
import { buildSurface } from "#src/meter/surface"
import type { MeterView } from "#src/meter/view"

const t = (key: string) => key

const view = (patch: Partial<MeterView> = {}): MeterView => ({
  segments: [],
  rows: [],
  aria: "",
  collecting: false,
  ...patch,
})

const status = {
  reason: "auto" as const,
  frame: "▅",
  seconds: 12,
  tokens: "2k",
}

describe("buildSurface", () => {
  test("hides everything when the plugin is off", () => {
    expect(buildSurface({ view: view(), status: undefined, prefs: { ...INITIAL_PREFS, enabled: false }, t })).toEqual({
      kind: "hidden",
    })
  })

  test("hides an empty meter", () => {
    expect(buildSurface({ view: view(), status: undefined, prefs: INITIAL_PREFS, t }).kind).toBe("hidden")
  })

  test("shows metrics with their rows and aria", () => {
    const surface = buildSurface({
      view: view({
        segments: [{ id: "context", text: "920 / 200k", tone: undefined, low: false }],
        rows: [{ kind: "spark", id: "spark", label: "tip.spark", value: "▁▁" }],
        aria: "Контекст: 920 / 200k",
      }),
      status: undefined,
      prefs: INITIAL_PREFS,
      t,
    })

    expect(surface.kind).toBe("metrics")
    if (surface.kind !== "metrics") return
    expect(surface.segments).toHaveLength(1)
    expect(surface.rows).toHaveLength(1)
    expect(surface.aria).toContain("Контекст")
  })

  test("collecting is its own mode", () => {
    const surface = buildSurface({
      view: view({ collecting: true, aria: "сбор" }),
      status: undefined,
      prefs: INITIAL_PREFS,
      t,
    })

    expect(surface).toEqual({ kind: "collecting", rows: [], aria: "сбор" })
  })

  test("compaction wins over metrics", () => {
    const surface = buildSurface({
      view: view({ segments: [{ id: "context", text: "1", tone: undefined, low: false }] }),
      status,
      prefs: INITIAL_PREFS,
      t,
    })

    expect(surface).toEqual({
      kind: "compaction",
      row: "▅ header.compact",
      aria: "header.compact",
      tooltip: "tooltip.compact",
    })
  })
})
