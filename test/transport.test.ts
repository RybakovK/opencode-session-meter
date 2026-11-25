import { describe, expect, test } from "bun:test"
import { createTranscriptPoller, type PollerSnapshot, type TranscriptMessage } from "../src/telemetry/transport"

const deferred = () => {
  let resolve!: (message: TranscriptMessage | undefined) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<TranscriptMessage | undefined>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const setup = (options: { intervalMs?: number; timeoutMs?: number } = {}) => {
  const calls: { sessionID: string; signal: AbortSignal }[] = []
  const lengths: TranscriptMessage[] = []
  const states: PollerSnapshot[] = []
  const pending: ReturnType<typeof deferred>[] = []

  const poller = createTranscriptPoller({
    sessionID: "ses_1",
    intervalMs: options.intervalMs ?? 1000,
    timeoutMs: options.timeoutMs ?? 5000,
    source: (sessionID, signal) => {
      calls.push({ sessionID, signal })
      const next = deferred()
      pending.push(next)
      return next.promise
    },
    onLength: (message) => lengths.push(message),
    onState: (snapshot) => states.push(snapshot),
  })

  return { poller, calls, lengths, states, pending, snapshot: () => states.at(-1) }
}

describe("TranscriptPoller", () => {
  test("reports the polled length once the source answers", async () => {
    const { poller, lengths, states, pending, snapshot } = setup()

    poller.poll(0)
    pending[0].resolve({ id: "msg_1", chars: 1200 })
    await flush()

    expect(lengths).toEqual([{ id: "msg_1", chars: 1200 }])
    expect(snapshot()).toEqual({ answered: true, error: undefined })
    expect(states.at(-1)?.answered).toBe(true)
  })

  test("keeps the error of a failed poll and retries later", async () => {
    const { poller, calls, pending, snapshot } = setup()

    poller.poll(0)
    pending[0].reject(new Error("offline"))
    await flush()

    expect(snapshot()).toEqual({ answered: false, error: "offline" })

    poller.poll(1000)
    pending[1].resolve({ id: "msg_1", chars: 40 })
    await flush()

    expect(calls).toHaveLength(2)
    expect(snapshot()).toEqual({ answered: true, error: undefined })
  })

  test("does nothing without an assistant message", async () => {
    const { poller, lengths, pending, snapshot } = setup()

    poller.poll(0)
    pending[0].resolve(undefined)
    await flush()

    expect(lengths).toHaveLength(0)
    expect(snapshot()?.answered).toBe(false)
    expect(snapshot()?.error).toBeUndefined()
  })

  test("respects the poll interval", async () => {
    const { poller, calls, pending } = setup()

    poller.poll(0)
    pending[0].resolve({ id: "msg_1", chars: 10 })
    await flush()

    poller.poll(400)
    expect(calls).toHaveLength(1)

    poller.poll(1000)
    expect(calls).toHaveLength(2)
  })

  test("does not overlap polls", async () => {
    const { poller, calls, pending } = setup()

    poller.poll(0)
    poller.poll(5000)
    expect(calls).toHaveLength(1)

    pending[0].resolve({ id: "msg_1", chars: 10 })
    await flush()

    poller.poll(6000)
    expect(calls).toHaveLength(2)
  })

  test("times out a silent source", async () => {
    const { poller, calls, snapshot } = setup({ timeoutMs: 20 })

    poller.poll(0)
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(calls[0].signal.aborted).toBe(true)
    expect(snapshot()?.error).toContain("timed out")
  })

  test("stops polling and aborts the request", async () => {
    const { poller, calls, lengths, pending } = setup()

    poller.poll(0)
    poller.stop()

    expect(calls[0].signal.aborted).toBe(true)

    pending[0].resolve({ id: "msg_1", chars: 99 })
    await flush()

    expect(lengths).toHaveLength(0)
    poller.poll(10_000)
    expect(calls).toHaveLength(1)
  })
})
