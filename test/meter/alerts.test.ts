import { describe, expect, test } from "bun:test"
import { type AlertSession, createAlerts } from "../../src/meter/alerts"

const session = (id: string): AlertSession => ({ server: "desktop", id })

const setup = () => {
  const calls: { session: AlertSession; level: string; percent: number }[] = []
  const alerts = createAlerts({
    warnPercent: 75,
    dangerPercent: 90,
    deliver: (target, level, percent) => calls.push({ session: target, level, percent }),
  })
  return { alerts, calls }
}

describe("ContextAlerts", () => {
  test("fires once when the context crosses the warning threshold", () => {
    const { alerts, calls } = setup()
    const target = session("ses_1")

    alerts.observe(target, 60, true)
    alerts.observe(target, 76, true)
    alerts.observe(target, 80, true)

    expect(calls).toEqual([{ session: target, level: "warning", percent: 76 }])
  })

  test("fires danger independently of warning", () => {
    const { alerts, calls } = setup()
    const target = session("ses_1")

    alerts.observe(target, 60, true)
    alerts.observe(target, 76, true)
    alerts.observe(target, 91, true)
    alerts.observe(target, 95, true)

    expect(calls.map((call) => call.level)).toEqual(["warning", "danger"])
  })

  test("does not fire on the first observation", () => {
    const { alerts, calls } = setup()
    alerts.observe(session("ses_1"), 95, true)
    expect(calls).toHaveLength(0)
  })

  test("keeps tracking while alerts are disabled", () => {
    const { alerts, calls } = setup()
    const target = session("ses_1")

    alerts.observe(target, 60, false)
    alerts.observe(target, 76, false)
    alerts.observe(target, 80, true)

    expect(calls).toHaveLength(0)
  })

  test("keeps sessions independent", () => {
    const { alerts, calls } = setup()

    alerts.observe(session("ses_1"), 60, true)
    alerts.observe(session("ses_2"), 60, true)
    alerts.observe(session("ses_1"), 76, true)
    alerts.observe(session("ses_2"), 76, true)

    expect(calls.map((call) => call.session.id)).toEqual(["ses_1", "ses_2"])
  })

  test("reset forgets thresholds and sessions", () => {
    const { alerts, calls } = setup()
    const target = session("ses_1")

    alerts.observe(target, 60, true)
    alerts.observe(target, 76, true)
    alerts.reset()
    alerts.observe(target, 60, true)
    alerts.observe(target, 76, true)

    expect(calls).toHaveLength(2)
  })
})
