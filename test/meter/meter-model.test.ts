import { describe, expect, test } from "bun:test"
import type { MountedSession } from "@opencode/plugin/gui"
import { createRoot, createSignal } from "solid-js"
import { createAlerts } from "../../src/meter/alerts"
import { createMeterModel } from "../../src/meter/meter-model"
import { INITIAL_PREFS, type Prefs } from "../../src/meter/prefs"

const tokens = { input: 100, output: 20, reasoning: 0, cache: { read: 800, write: 0 } }

const assistant = (patch: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "assistant",
  time: { created: 1, firstToken: 2, completed: 10 },
  content: [{ type: "text", text: "hello" }],
  model: { id: "model", providerID: "provider" },
  tokens,
  ...patch,
})

const fakeSession = (id = "ses_1") => {
  const [messages, setMessages] = createSignal<unknown[]>([assistant()])

  const data = {
    on: () => () => {},
    session: {
      message: { list: () => messages() },
      get: () => ({ id, model: { id: "model", providerID: "provider" } }),
      status: () => "idle",
    },
    location: {
      model: {
        list: () => [{ providerID: "provider", modelID: "model", limit: { context: 200_000, output: 8_000 } }],
        sync: async () => {},
      },
    },
  }

  const client = {
    event: { subscribe: () => (async function* () {})() as AsyncIterable<never> },
    message: { list: async () => ({ data: [], cursor: {} }) },
  }

  const session = {
    id,
    server: { id: "desktop", data, client },
    location: { directory: "/tmp" },
  } as unknown as MountedSession

  return { session, setMessages }
}

const harness = (initial: MountedSession, prefs: Prefs = INITIAL_PREFS) => {
  let current = initial
  let run: (() => void) | undefined
  let starts = 0

  const model = createRoot((dispose) => {
    const created = createMeterModel({
      session: () => current,
      prefs: () => prefs,
      alerts: createAlerts({ warnPercent: 75, dangerPercent: 90, deliver() {} }),
      warnPercent: 75,
      dangerPercent: 90,
      t: (key) => key,
      now: () => 0,
      timers: {
        every(_ms, fn) {
          starts += 1
          run = fn
          return () => {
            run = undefined
          }
        },
      },
    })

    // Reading the surface right away is the regression guard: a memo that
    // reads a later declaration used to throw here and blank the header.
    created.sync(true)
    created.surface()
    return { model: created, dispose }
  })

  return {
    model: model.model,
    tick: () => run?.(),
    starts: () => starts,
    switchTo: (next: MountedSession) => {
      current = next
      model.model.sync(true)
    },
    dispose: model.dispose,
  }
}

describe("MeterModel", () => {
  test("builds the metrics surface from one snapshot", () => {
    const { session } = fakeSession()
    const surface = harness(session).model.surface()

    expect(surface.kind).toBe("metrics")
    if (surface.kind !== "metrics") return
    expect(surface.segments.map((segment) => segment.id)).toEqual(["context", "cache"])
    expect(surface.rows.map((row) => row.id)).toEqual(["speed", "context", "cache", "sep", "spark"])
  })

  test("counts context and cache from the last step", () => {
    const { session } = fakeSession()
    const surface = harness(session).model.surface()
    if (surface.kind !== "metrics") return

    expect(surface.segments[0].text).toBe("920 / 200k")
    expect(surface.segments[1].text).toBe("header.cache")
  })

  test("hides the surface when the plugin is off", () => {
    const { session } = fakeSession()
    expect(harness(session, { ...INITIAL_PREFS, enabled: false }).model.surface()).toEqual({ kind: "hidden" })
  })

  test("compaction replaces the metrics", () => {
    const fake = fakeSession()
    fake.setMessages([
      assistant(),
      { id: "msg_c", type: "compaction", status: "running", reason: "auto", summary: "x", time: { created: 0 } },
    ])

    const surface = harness(fake.session).model.surface()
    expect(surface.kind).toBe("compaction")
    if (surface.kind !== "compaction") return
    expect(surface.row).toBe("▁ header.compact")
    expect(surface.tooltip).toBe("tooltip.compact")
  })

  test("turns collecting on while a step streams without deltas", () => {
    const fake = fakeSession()
    fake.setMessages([assistant({ time: { created: 1 } })])

    const meter = harness(fake.session)
    meter.tick()

    expect(meter.model.surface().kind).toBe("collecting")
    meter.dispose()
  })

  test("alerts when the first answer already crosses the threshold", async () => {
    const fake = fakeSession()
    fake.setMessages([])
    const delivered: { level: string; percent: number }[] = []
    const model = createRoot((dispose) => {
      const created = createMeterModel({
        session: () => fake.session,
        prefs: () => INITIAL_PREFS,
        alerts: createAlerts({
          warnPercent: 75,
          dangerPercent: 90,
          deliver: (_session, level, percent) => delivered.push({ level, percent }),
        }),
        warnPercent: 75,
        dangerPercent: 90,
        t: (key) => key,
        now: () => 0,
        timers: { every: () => () => {} },
      })
      created.sync(true)
      return { created, dispose }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    fake.setMessages([assistant({ tokens: { input: 160_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(delivered).toEqual([{ level: "warning", percent: 80 }])
    model.dispose()
  })

  test("restarts only when the session key changes", () => {
    const first = fakeSession("ses_1")
    const second = fakeSession("ses_2")
    const meter = harness(first.session)

    expect(meter.starts()).toBe(1)
    meter.switchTo(first.session)
    expect(meter.starts()).toBe(1)

    meter.switchTo(second.session)
    expect(meter.starts()).toBe(2)
    meter.dispose()
  })
})
