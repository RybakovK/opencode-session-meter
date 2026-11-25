export type TranscriptMessage = {
  id: string
  chars: number
}

export type TranscriptSource = (sessionID: string, signal: AbortSignal) => Promise<TranscriptMessage | undefined>

export type PollerSnapshot = {
  answered: boolean
  error: string | undefined
}

export type TranscriptPoller = {
  poll(now: number): void
  stop(): void
}

export type PollerOptions = {
  sessionID: string
  source: TranscriptSource
  onLength(message: TranscriptMessage): void
  onState?(snapshot: PollerSnapshot): void
  intervalMs?: number
  timeoutMs?: number
}

export const POLL_INTERVAL_MS = 1000
export const POLL_TIMEOUT_MS = 5000

export function createTranscriptPoller(options: PollerOptions): TranscriptPoller {
  const interval = options.intervalMs ?? POLL_INTERVAL_MS
  const timeout = options.timeoutMs ?? POLL_TIMEOUT_MS

  let stopped = false
  let inFlight = false
  let lastAt = Number.NEGATIVE_INFINITY
  let answered = false
  let error: string | undefined
  const controllers = new Set<AbortController>()

  const snapshot = (): PollerSnapshot => ({ answered, error })

  return {
    poll(now) {
      if (stopped || inFlight || now - lastAt < interval) return

      lastAt = now
      inFlight = true

      const controller = new AbortController()
      controllers.add(controller)

      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error(`transcript timed out after ${timeout}ms`))
        }, timeout)
      })

      Promise.race([options.source(options.sessionID, controller.signal), deadline])
        .then((message) => {
          if (stopped) return
          error = undefined
          if (!message) return
          answered = true
          options.onLength(message)
        })
        .catch((cause) => {
          if (stopped) return
          error = cause instanceof Error ? cause.message : String(cause)
        })
        .finally(() => {
          if (timer) clearTimeout(timer)
          controllers.delete(controller)
          inFlight = false
          if (!stopped) options.onState?.(snapshot())
        })
    },
    stop() {
      stopped = true
      for (const controller of controllers) controller.abort()
      controllers.clear()
    },
  }
}
