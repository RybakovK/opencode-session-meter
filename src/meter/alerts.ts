export type AlertLevel = "warning" | "danger"

export type AlertSession = {
  server: string
  id: string
}

export type Alerts = {
  observe(session: AlertSession, percent: number | undefined, enabled: boolean): void
  reset(): void
}

export type AlertsOptions = {
  warnPercent: number
  dangerPercent: number
  deliver(session: AlertSession, level: AlertLevel, percent: number): void
}

export function createAlerts(options: AlertsOptions): Alerts {
  const previous = new Map<string, number>()
  const seen = new Set<string>()

  const keyOf = (session: AlertSession) => `${session.server}/${session.id}`

  return {
    observe(session, percent, enabled) {
      if (percent === undefined) return

      const key = keyOf(session)
      const last = previous.get(key)
      previous.set(key, percent)
      if (last === undefined || !enabled) return

      const level: AlertLevel | undefined =
        percent >= options.dangerPercent && last < options.dangerPercent
          ? "danger"
          : percent >= options.warnPercent && last < options.warnPercent
            ? "warning"
            : undefined
      if (!level) return

      const mark = `${key}/${level}`
      if (seen.has(mark)) return
      seen.add(mark)
      options.deliver(session, level, percent)
    },
    reset() {
      previous.clear()
      seen.clear()
    },
  }
}
