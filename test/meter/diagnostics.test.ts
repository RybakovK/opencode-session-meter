import { describe, expect, test } from "bun:test"
import { createDiagnostics } from "#src/meter/diagnostics"
import type { ControllerState } from "#src/telemetry/session-controller"

const progress = (patch: Partial<ControllerState> = {}): ControllerState => ({
  counters: { bridge: 0, client: 0, store: 0, http: 0 },
  polled: false,
  error: undefined,
  ...patch,
})

describe("MeterDiagnostics", () => {
  test("stays silent before the delay", () => {
    const diagnostics = createDiagnostics({ delayMs: 1000 })
    diagnostics.observe(true, progress({ counters: { bridge: 0, client: 0, store: 0, http: 2 } }), 0)

    expect(diagnostics.hint(999)).toBeUndefined()
  })

  test("explains the sources after the delay", () => {
    const diagnostics = createDiagnostics({ delayMs: 1000 })
    diagnostics.observe(true, progress({ counters: { bridge: 1, client: 0, store: 2, http: 3 } }), 0)

    expect(diagnostics.hint(1000)).toBe("bridge 1 · stream 0 · store 2 · http 3")
  })

  test("appends the transport error", () => {
    const diagnostics = createDiagnostics({ delayMs: 1000 })
    diagnostics.observe(true, progress({ error: "transcript timed out" }), 0)

    expect(diagnostics.hint(1000)).toContain("transcript timed out")
  })

  test("restarts the timer when waiting clears", () => {
    const diagnostics = createDiagnostics({ delayMs: 1000 })
    diagnostics.observe(true, progress(), 0)
    diagnostics.observe(false, progress(), 500)
    diagnostics.observe(true, progress(), 900)

    expect(diagnostics.hint(1500)).toBeUndefined()
    expect(diagnostics.hint(1900)).toBeDefined()
  })

  test("has nothing to say without an observation", () => {
    expect(createDiagnostics().hint(10_000)).toBeUndefined()
  })
})
