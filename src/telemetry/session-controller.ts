import type { Sampler } from "./sampler"
import type { StreamSource } from "./streams"
import { createTranscriptPoller, POLL_INTERVAL_MS, POLL_TIMEOUT_MS, type TranscriptSource } from "./transport"

export type SessionProbe = () => {
  streaming: { id: string; chars: number } | undefined
  running: boolean
}

export type Timers = {
  every(ms: number, run: () => void): () => void
}

export type ControllerCounters = {
  bridge: number
  client: number
  store: number
  http: number
}

export type ControllerState = {
  counters: ControllerCounters
  polled: boolean
  error: string | undefined
}

export type SessionControllerOptions = {
  sessionID: string
  sampler: Sampler
  probe: SessionProbe
  bridge: StreamSource
  client: StreamSource
  source: TranscriptSource
  onState?(state: ControllerState): void
  onTick?(now: number): void
  now?: () => number
  tickMs?: number
  pollIntervalMs?: number
  pollTimeoutMs?: number
  timers?: Timers
}

export type SessionController = {
  start(): void
  stop(): void
}

export const CONTROLLER_TICK_MS = 500
export const SOURCE_TTL_MS = 10_000

const realTimers: Timers = {
  every(ms, run) {
    const handle = setInterval(run, ms)
    return () => clearInterval(handle)
  },
}

export function createSessionController(options: SessionControllerOptions): SessionController {
  const now = options.now ?? Date.now
  const counters: ControllerCounters = { bridge: 0, client: 0, store: 0, http: 0 }
  const controllers = new Set<AbortController>()

  let polled = false
  let error: string | undefined
  let started = false
  let stopTimer: (() => void) | undefined
  let source: "bridge" | "client" | undefined
  let sourceAt = 0

  let published = ""
  const push = () => {
    const next: ControllerState = { counters: { ...counters }, polled, error }
    const key = `${counters.bridge}/${counters.client}/${counters.store}/${counters.http}|${polled}|${error ?? ""}`
    if (key === published) return
    published = key
    options.onState?.(next)
  }

  const poller = createTranscriptPoller({
    sessionID: options.sessionID,
    source: options.source,
    intervalMs: options.pollIntervalMs ?? POLL_INTERVAL_MS,
    timeoutMs: options.pollTimeoutMs ?? POLL_TIMEOUT_MS,
    onLength(message) {
      counters.http += 1
      options.sampler.total(message.id, message.chars)
    },
    onState(snapshot) {
      polled = snapshot.answered
      error = snapshot.error
      push()
    },
  })

  // Two event streams can deliver the same deltas. The first one that reports
  // wins, so the sampler never counts a delta twice.
  const accept = (chars: number, from: "bridge" | "client") => {
    const at = now()
    // A source that stopped delivering may be replaced after a grace window.
    if (source !== from) {
      if (source && at - sourceAt <= SOURCE_TTL_MS) return
      source = from
    }
    sourceAt = at
    counters[from] += 1
    options.sampler.delta(chars)
  }

  const tick = () => {
    const at = now()
    options.onTick?.(at)

    const probe = options.probe()
    options.sampler.tick(probe.running)

    if (probe.streaming && !polled) {
      counters.store += 1
      options.sampler.total(probe.streaming.id, probe.streaming.chars)
    }

    if (probe.running) poller.poll(at)
    push()
  }

  return {
    start() {
      if (started) return
      started = true

      const controller = new AbortController()
      controllers.add(controller)
      options.bridge.subscribe((chars) => accept(chars, "bridge"), controller.signal)
      options.client.subscribe((chars) => accept(chars, "client"), controller.signal)

      stopTimer = (options.timers ?? realTimers).every(options.tickMs ?? CONTROLLER_TICK_MS, tick)
      push()
    },
    stop() {
      started = false
      stopTimer?.()
      stopTimer = undefined
      for (const controller of controllers) controller.abort()
      controllers.clear()
      poller.stop()
    },
  }
}
