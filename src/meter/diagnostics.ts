import type { ControllerState } from "../telemetry/session-controller"

export type Diagnostics = {
  observe(waiting: boolean, progress: ControllerState, at: number): void
  hint(at: number): string | undefined
}

export const DIAGNOSTIC_DELAY_MS = 5000

export function createDiagnostics(options: { delayMs?: number } = {}): Diagnostics {
  const delay = options.delayMs ?? DIAGNOSTIC_DELAY_MS

  let since: number | undefined
  let latest: ControllerState | undefined

  return {
    observe(waiting, progress, at) {
      if (!waiting) {
        since = undefined
        return
      }
      since ??= at
      latest = progress
    },
    hint(at) {
      if (since === undefined || !latest) return undefined
      if (at - since < delay) return undefined

      const { counters, error } = latest
      const counts = `bridge ${counters.bridge} · stream ${counters.client} · store ${counters.store} · http ${counters.http}`
      return error ? `${counts} · ${error}` : counts
    },
  }
}
