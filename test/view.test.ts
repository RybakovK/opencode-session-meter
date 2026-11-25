import { describe, expect, test } from "bun:test"
import { INITIAL_PREFS, type Prefs } from "../src/meter/prefs"
import { buildView, type MeterInput, segmentTone } from "../src/meter/view"

const t = (key: string, params?: Record<string, string | number | boolean>) =>
  params ? `${key}(${Object.values(params).join(",")})` : key

const usage = (input: number, output: number, reasoning: number, read: number, write: number) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const input = (patch: Partial<MeterInput> = {}): MeterInput => ({
  tokens: undefined,
  limit: undefined,
  measured: undefined,
  step: undefined,
  history: [],
  seconds: 30,
  collecting: false,
  diagnostic: undefined,
  warnPercent: 75,
  dangerPercent: 90,
  ...patch,
})

const prefs = (patch: Partial<Prefs> = {}): Prefs => ({ ...INITIAL_PREFS, ...patch })

describe("buildView", () => {
  test("renders the three header segments in order", () => {
    const view = buildView(
      input({
        measured: 42,
        tokens: usage(100, 20, 0, 199_880, 0),
        limit: 1_000_000,
      }),
      prefs(),
      t,
    )

    expect(view.segments.map((segment) => segment.id)).toEqual(["speed", "context", "cache"])
    expect(view.segments[0].text).toBe("header.speed(42)")
    expect(view.segments[1].text).toBe("200k / 1M")
    expect(view.segments[2].text).toBe("header.cache(100)")
  })

  test("computes the danger tone from the context window", () => {
    const view = buildView(input({ tokens: usage(0, 0, 0, 190_000, 0), limit: 200_000 }), prefs(), t)

    expect(view.segments[0].text).toBe("⚠ 190k / 200k")
    expect(view.segments[0].tone).toBe("danger")
  })

  test("shows the last step speed as an average", () => {
    const view = buildView(input({ tokens: usage(100, 20, 0, 800, 0), step: 48 }), prefs(), t)
    const speed = view.rows.find((row) => row.kind === "row" && row.id === "speed")

    expect(speed && "value" in speed ? speed.value : "").toBe("tip.speedValue(48) · tip.average")
  })

  test("labels the tooltip and the accessible text from one pass", () => {
    const view = buildView(
      input({
        measured: 42,
        tokens: usage(100, 20, 0, 800, 0),
        limit: 200_000,
        history: [1, 2, 4, 8],
      }),
      prefs(),
      t,
    )

    expect(view.rows.map((row) => row.id)).toEqual(["speed", "context", "cache", "sep", "spark"])
    expect(view.aria).toContain("tip.context: tip.contextValue(920,200k,0)")
    expect(view.aria).not.toContain("tip.spark")
  })

  test("hides disabled gauges from the header and the chart", () => {
    const view = buildView(
      input({ measured: 42, tokens: usage(100, 20, 0, 800, 0), limit: 200_000, history: [1, 2] }),
      prefs({ speed: false, cache: false }),
      t,
    )

    expect(view.segments.map((segment) => segment.id)).toEqual(["context"])
    expect(view.rows.some((row) => row.id === "spark")).toBe(false)
    expect(view.rows.some((row) => row.id === "speed")).toBe(false)
  })

  test("adds a low-cache hint from the tokens alone", () => {
    const view = buildView(input({ tokens: usage(10_000, 20, 0, 0, 0), limit: 200_000 }), prefs(), t)

    expect(view.rows.some((row) => row.kind === "hint" && row.value.startsWith("tip.cacheLow(0)"))).toBe(true)
    expect(view.aria).toContain("tip.cacheLow(0)")
  })

  test("keeps a flat green line when the window is idle", () => {
    const view = buildView(input({ seconds: 4 }), prefs(), t)
    const spark = view.rows.find((row) => row.id === "spark")

    expect(spark?.kind).toBe("spark")
    expect(spark && "value" in spark ? spark.value : "").toBe("▁▁▁▁")
  })

  test("hides every row when all gauges are off", () => {
    const view = buildView(
      input({ tokens: usage(100, 20, 0, 800, 0), limit: 200_000, history: [1, 2] }),
      prefs({ speed: false, context: false, cache: false }),
      t,
    )

    expect(view.segments).toHaveLength(0)
    expect(view.rows).toHaveLength(0)
  })

  test("does not switch to collecting while the speed gauge is off", () => {
    const view = buildView(input({ collecting: true }), prefs({ speed: false }), t)
    expect(view.collecting).toBe(false)
  })

  test("maps a segment tone to the classes the renderer applies", () => {
    expect(segmentTone({ id: "context", text: "x", tone: "danger", low: false })).toBe("danger")
    expect(segmentTone({ id: "context", text: "x", tone: "warning", low: false })).toBe("warn")
    expect(segmentTone({ id: "cache", text: "x", tone: undefined, low: true })).toBe("warn")
    expect(segmentTone({ id: "speed", text: "x", tone: undefined, low: false })).toBeUndefined()
  })

  test("keeps only the chart without any metric", () => {
    const view = buildView(input(), prefs(), t)
    expect(view.rows.map((row) => row.id)).toEqual(["sep", "spark"])
    expect(view.segments).toHaveLength(0)
  })
})
