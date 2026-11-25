import { describe, expect, test } from "bun:test"
import type { Sampler } from "../../src/telemetry/sampler"
import {
  type ControllerState,
  createSessionController,
  type SessionProbe,
} from "../../src/telemetry/session-controller"
import type { StreamSource } from "../../src/telemetry/streams"
import type { TranscriptMessage } from "../../src/telemetry/transport"

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const manualTimers = () => {
  let run: (() => void) | undefined
  return {
    timers: {
      every(_ms: number, fn: () => void) {
        run = fn
        return () => {
          run = undefined
        }
      },
    },
    tick: () => run?.(),
    running: () => run !== undefined,
  }
}

const fakeSampler = () => {
  const deltas: number[] = []
  const totals: { id: string; chars: number }[] = []
  const ticks: boolean[] = []

  const sampler = {
    delta: (chars: number) => deltas.push(chars),
    total: (id: string, chars: number) => totals.push({ id, chars }),
    calibrate() {},
    tick: (streaming: boolean) => ticks.push(streaming),
    state: () => ({ rate: undefined, lastRate: undefined, history: [], waiting: false }),
    ratio: () => 4,
    reset() {},
  } as Sampler

  return { sampler, deltas, totals, ticks }
}

const fakeStream = () => {
  let handler: ((chars: number) => void) | undefined
  let received: AbortSignal | undefined

  const stream: StreamSource = {
    subscribe(onDelta, signal) {
      handler = onDelta
      received = signal
    },
  }

  return {
    stream,
    emit: (chars: number) => handler?.(chars),
    signal: () => received,
  }
}

const deferredSource = () => {
  const calls: string[] = []
  const pending: ((message: TranscriptMessage | undefined) => void)[] = []

  const source = (sessionID: string) => {
    calls.push(sessionID)
    return new Promise<TranscriptMessage | undefined>((resolve) => pending.push(resolve))
  }

  return { source, calls, pending }
}

const harness = () => {
  const clock = { value: 0 }
  const timers = manualTimers()
  const sampler = fakeSampler()
  const bridge = fakeStream()
  const client = fakeStream()
  const transcript = deferredSource()
  const states: ControllerState[] = []
  const ticks: number[] = []
  const probe: { current: ReturnType<SessionProbe> } = {
    current: { streaming: undefined, running: false },
  }

  const controller = createSessionController({
    sessionID: "ses_1",
    sampler: sampler.sampler,
    probe: () => probe.current,
    bridge: bridge.stream,
    client: client.stream,
    source: transcript.source,
    now: () => clock.value,
    timers: timers.timers,
    onState: (state) => states.push(state),
    onTick: (now) => ticks.push(now),
  })

  return { controller, clock, timers, sampler, bridge, client, transcript, states, ticks, probe }
}

describe("SessionController", () => {
  test("counts bridge deltas once and ignores the client copy", () => {
    const test = harness()
    test.controller.start()

    test.bridge.emit(5)
    test.client.emit(5)
    test.timers.tick()

    expect(test.sampler.deltas).toEqual([5])
    expect(test.states.at(-1)?.counters.bridge).toBe(1)
    expect(test.states.at(-1)?.counters.client).toBe(0)
  })

  test("lets the client stream win when it reports first", () => {
    const test = harness()
    test.controller.start()

    test.client.emit(7)
    test.bridge.emit(7)
    test.timers.tick()

    expect(test.sampler.deltas).toEqual([7])
    expect(test.states.at(-1)?.counters.client).toBe(1)
    expect(test.states.at(-1)?.counters.bridge).toBe(0)
  })

  test("feeds the store length while the transcript has not answered", () => {
    const test = harness()
    test.controller.start()
    test.probe.current = { streaming: { id: "msg_1", chars: 100 }, running: true }

    test.timers.tick()

    expect(test.sampler.ticks).toEqual([true])
    expect(test.sampler.totals).toEqual([{ id: "msg_1", chars: 100 }])
    expect(test.states.at(-1)?.counters.store).toBe(1)
    expect(test.ticks).toEqual([0])
  })

  test("polls the transcript and stops feeding the store once it answers", async () => {
    const test = harness()
    test.controller.start()
    test.probe.current = { streaming: { id: "msg_1", chars: 100 }, running: true }

    test.timers.tick()
    test.transcript.pending[0]?.({ id: "msg_1", chars: 120 })
    await flush()

    expect(test.sampler.totals).toEqual([
      { id: "msg_1", chars: 100 },
      { id: "msg_1", chars: 120 },
    ])
    expect(test.states.at(-1)).toMatchObject({ polled: true, counters: { http: 1 } })

    test.clock.value = 1000
    test.timers.tick()

    expect(test.sampler.totals).toHaveLength(2)
    expect(test.states.at(-1)?.counters.store).toBe(1)
  })

  test("does not poll while the session is idle", () => {
    const test = harness()
    test.controller.start()

    test.timers.tick()

    expect(test.transcript.calls).toHaveLength(0)
  })

  test("stop aborts the streams and the timer", () => {
    const test = harness()
    test.controller.start()

    const bridgeSignal = test.bridge.signal()
    const clientSignal = test.client.signal()
    test.controller.stop()

    expect(bridgeSignal?.aborted).toBe(true)
    expect(clientSignal?.aborted).toBe(true)
    expect(test.timers.running()).toBe(false)
  })

  test("publishes state on start and on ticks that changed", () => {
    const test = harness()
    test.controller.start()
    expect(test.states).toHaveLength(1)
    expect(test.states.at(-1)?.counters).toEqual({ bridge: 0, client: 0, store: 0, http: 0 })

    test.timers.tick()
    expect(test.states).toHaveLength(1)

    test.bridge.emit(5)
    expect(test.states).toHaveLength(1)

    test.timers.tick()
    expect(test.states).toHaveLength(2)
    expect(test.states.at(-1)?.counters.bridge).toBe(1)
  })

  test("replaces a source that stopped delivering after the grace window", () => {
    const test = harness()
    test.controller.start()

    test.bridge.emit(5)
    test.client.emit(7)
    expect(test.sampler.deltas).toEqual([5])

    test.clock.value += 11_000
    test.client.emit(7)
    expect(test.sampler.deltas).toEqual([5, 7])
  })
})
