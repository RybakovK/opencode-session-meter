import { describe, expect, test } from "bun:test"
import { createSampler } from "#src/telemetry/sampler"

const clock = (start = 1_000_000) => {
  let current = start
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe("TokenSampler", () => {
  test("turns deltas into a rate over the window", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now })

    sampler.delta(40)
    time.advance(500)
    sampler.delta(40)

    expect(sampler.state().rate).toBeCloseTo((20 / 600) * 1000, 5)
  })

  test("keeps the last rate during the grace window", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, idleMs: 1200, freshMs: 3000 })

    sampler.delta(80)
    time.advance(500)
    sampler.delta(80)
    const live = sampler.state().rate

    time.advance(1500)
    const paused = sampler.state()

    expect(paused.rate).toBeUndefined()
    expect(paused.lastRate).toBeCloseTo(live ?? 0, 5)
  })

  test("drops a stale live rate after the grace window", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, freshMs: 3000 })

    sampler.delta(80)
    time.advance(500)
    sampler.delta(80)
    sampler.tick(false)

    time.advance(3500)
    sampler.tick(false)

    const state = sampler.state()
    expect(state.rate).toBeUndefined()
    expect(state.lastRate).toBeUndefined()
  })

  test("measures growth of a streamed message by total length", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now })

    sampler.total("msg_1", 1000)
    time.advance(500)
    sampler.total("msg_1", 1200)

    expect(sampler.state().history.at(-1)).toBe(50)
  })

  test("rebases when the streamed message changes", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now })

    sampler.total("msg_1", 1000)
    time.advance(500)
    sampler.total("msg_2", 5000)

    expect(sampler.state().history.at(-1)).toBe(0)
  })

  test("calibrates characters per token", () => {
    const sampler = createSampler({ now: clock().now })

    sampler.calibrate(3000, 1000)
    sampler.delta(30)

    expect(sampler.ratio()).toBe(3)
    expect(sampler.state().history.at(-1)).toBe(10)
  })

  test("rolls seconds into the chart while streaming", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, seconds: 4 })

    sampler.delta(100)
    time.advance(1000)
    sampler.tick(true)

    const history = sampler.state().history
    expect(history).toHaveLength(4)
    expect(history[2]).toBe(25)
    expect(history[3]).toBe(0)
  })

  test("ignores polled totals while deltas are live", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now })

    sampler.total("msg_1", 1000)
    time.advance(100)
    sampler.delta(40)
    time.advance(100)
    sampler.total("msg_1", 1400)

    expect(sampler.state().history.at(-1)).toBe(10)
  })

  test("counts every polled second", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, seconds: 4 })

    sampler.total("msg_1", 1000)
    time.advance(1000)
    sampler.total("msg_1", 1400)
    time.advance(1000)
    sampler.total("msg_1", 1800)

    expect(sampler.state().history.reduce((sum, value) => sum + value, 0)).toBe(200)
  })

  test("slides the chart while the session is idle", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, seconds: 4 })

    sampler.delta(100)
    time.advance(1000)
    sampler.tick(false)

    const history = sampler.state().history
    expect(history[2]).toBe(25)
    expect(history[3]).toBe(0)
  })

  test("resumes polled totals once deltas stop", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, idleMs: 1200 })

    sampler.total("msg_1", 1000)
    time.advance(100)
    sampler.delta(40)
    time.advance(2000)
    sampler.total("msg_1", 1400)

    expect(sampler.state().history.at(-1)).toBe(100)
  })

  test("reports that it is waiting for the first deltas", () => {
    const sampler = createSampler({ now: clock().now })

    sampler.tick(true)
    expect(sampler.state().waiting).toBe(true)

    sampler.delta(40)
    expect(sampler.state().waiting).toBe(false)
  })

  test("resets ratio, rate and chart", () => {
    const time = clock()
    const sampler = createSampler({ now: time.now, seconds: 4 })

    sampler.calibrate(3000, 1000)
    sampler.delta(90)
    time.advance(500)
    sampler.delta(90)
    sampler.reset()

    const state = sampler.state()
    expect(sampler.ratio()).toBe(4)
    expect(state.rate).toBeUndefined()
    expect(state.lastRate).toBeUndefined()
    expect(state.history).toEqual([0, 0, 0, 0])
  })
})
