import {
  Command,
  type Context,
  type MountedSession,
  type Persisted,
  Plugin,
  SettingsPage,
  Slot,
  Store,
  Style,
} from "@opencode/plugin/gui"
import { createEffect, ErrorBoundary, For, onCleanup, Show } from "solid-js"
import { type Alerts, createAlerts } from "../meter/alerts"
import { GAUGES, type GaugeID } from "../meter/gauges"
import { createMeterModel } from "../meter/meter-model"
import { INITIAL_PREFS, type Prefs, PrefsSchema } from "../meter/prefs"
import { segmentTone } from "../meter/view"
import { DANGER_PERCENT, WARNING_PERCENT } from "../telemetry/metrics"
import { i18n } from "./i18n"
import { PLUGIN_ID } from "./id"

const CSS = `
[data-session-meter] {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 6px;
  color: var(--v2-text-text-faint);
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-session-meter] .sm-sep {
  margin: 0 6px;
  opacity: .4;
}
[data-session-meter] .sm-warn {
  color: var(--v2-state-fg-warning, #d97706);
}
[data-session-meter] .sm-danger {
  color: var(--v2-state-fg-danger, #dc2626);
  font-weight: 600;
}
[data-session-meter] .sm-muted,
[data-session-meter].sm-muted {
  opacity: .55;
}
.sm-tip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  max-width: 340px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.sm-tip .sm-tip-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.sm-tip .sm-tip-label {
  opacity: .6;
}
.sm-tip .sm-tip-value {
  text-align: right;
  white-space: nowrap;
}
.sm-tip .sm-tip-hint {
  opacity: .7;
}
.sm-tip .sm-tip-hint.sm-tip-warn {
  color: var(--v2-state-fg-warning, #d97706);
  opacity: 1;
}
.sm-tip .sm-tip-sep {
  height: 1px;
  margin: 2px 0;
  background: currentColor;
  opacity: .12;
}
.sm-tip .sm-spark {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .5px;
  white-space: pre;
  color: var(--v2-state-fg-success, currentColor);
}
`

const definition = Plugin.define({
  stores: {
    prefs: Store.global(PrefsSchema, INITIAL_PREFS),
  },
  i18n,
  setup(ctx) {
    const prefs = ctx.stores.prefs
    const warnPercent = percentOption(ctx.options.warnPercent, WARNING_PERCENT)
    const dangerPercent = percentOption(ctx.options.dangerPercent, DANGER_PERCENT)
    const thresholds =
      warnPercent < dangerPercent
        ? { warnPercent, dangerPercent }
        : { warnPercent: WARNING_PERCENT, dangerPercent: DANGER_PERCENT }

    const alerts = createAlerts({
      ...thresholds,
      deliver(session, level, percent) {
        const title = ctx.t(level === "danger" ? "notify.danger.title" : "notify.warn.title")
        const message = ctx.t(level === "danger" ? "notify.danger.message" : "notify.warn.message", { percent })

        ctx.toast.show({ title, description: message, variant: level === "danger" ? "error" : "default" })
        void ctx.attention.notify({
          title,
          message,
          variant: level === "danger" ? "error" : "default",
          session,
          id: `${PLUGIN_ID}:${session.server}/${session.id}/${level}`,
        })
      },
    })

    ctx.add(Style, CSS)

    ctx.add(Slot, {
      at: "session.header",
      order: 30,
      render: (input) => (
        <ErrorBoundary
          fallback={
            <span data-session-meter class="sm-muted">
              {ctx.t("header.failed")}
            </span>
          }
        >
          <SessionMeter
            ctx={ctx}
            session={input.session}
            active={input.active}
            prefs={() => prefs.value ?? INITIAL_PREFS}
            alerts={alerts}
            warnPercent={thresholds.warnPercent}
            dangerPercent={thresholds.dangerPercent}
          />
        </ErrorBoundary>
      ),
    })

    ctx.add(
      Command,
      (): Command => ({
        id: "toggle",
        title: ctx.t("command.toggle"),
        keywords: "tokens speed context cache meter токены контекст кэш",
        run: () =>
          prefs.update((draft) => {
            draft.enabled = !draft.enabled
          }),
      }),
    )

    ctx.add(
      Command,
      (): Command => ({
        id: "compact",
        title: ctx.t("command.compact"),
        keywords: "compact context summarize сжать контекст",
        enabled: !!ctx.sessions.current(),
        run: async () => {
          const session = ctx.sessions.current()
          if (!session) return
          try {
            await session.server.data.session.compact({ sessionID: session.id })
          } catch (cause) {
            ctx.toast.show({
              title: ctx.t("command.compactFailed"),
              description: cause instanceof Error ? cause.message : String(cause),
              variant: "error",
            })
          }
        },
      }),
    )

    ctx.add(SettingsPage, {
      id: "session-meter",
      icon: "waveform",
      get title() {
        return ctx.t("settings.title")
      },
      get entries() {
        return [
          { id: "enabled", title: ctx.t("settings.enabled") },
          ...GAUGES.map((gauge) => ({ id: gauge.id, title: ctx.t(gauge.title) })),
          { id: "notify", title: ctx.t("settings.notify") },
        ]
      },
      render: () => <MeterSettings ctx={ctx} prefs={prefs} />,
    })
  },
})

export default definition

function SessionMeter(props: {
  ctx: Context
  session: MountedSession
  active: boolean
  prefs: () => Prefs
  alerts: Alerts
  warnPercent: number
  dangerPercent: number
}) {
  const ui = props.ctx.ui
  const t = props.ctx.t
  const model = createMeterModel({
    session: () => props.session,
    prefs: props.prefs,
    alerts: props.alerts,
    warnPercent: props.warnPercent,
    dangerPercent: props.dangerPercent,
    t,
  })

  onCleanup(() => model.stop())

  createEffect(() => {
    void props.session.id
    model.sync(props.active && props.prefs().enabled)
  })

  const surface = () => model.surface()
  const row = () => {
    const current = surface()
    return current.kind === "compaction" ? current.row : undefined
  }
  const aria = () => {
    const current = surface()
    if (current.kind === "compaction") return current.aria
    return current.kind === "metrics" || current.kind === "collecting" ? current.aria : ""
  }
  const collecting = () => surface().kind === "collecting"
  const segments = () => {
    const current = surface()
    return current.kind === "metrics" ? current.segments : []
  }

  const TooltipBody = () => {
    const current = surface()
    if (current.kind === "compaction") {
      return (
        <div class="sm-tip">
          <span>{current.tooltip}</span>
        </div>
      )
    }
    if (current.kind === "hidden") return null

    return (
      <div class="sm-tip">
        <For each={current.rows}>
          {(item) => {
            if (item.kind === "sep") return <div class="sm-tip-sep" />
            if (item.kind === "hint") return <div class="sm-tip-hint sm-tip-warn">{item.value}</div>
            return (
              <div class="sm-tip-row">
                <span class="sm-tip-label">{item.label}</span>
                <span class={item.kind === "spark" ? "sm-spark" : "sm-tip-value"}>{item.value}</span>
              </div>
            )
          }}
        </For>
      </div>
    )
  }

  return (
    <Show when={surface().kind !== "hidden"}>
      <ui.Tooltip value={<TooltipBody />} placement="bottom">
        <div data-session-meter role="img" aria-label={aria()}>
          <Show
            when={row()}
            fallback={
              <Show when={!collecting()} fallback={<span class="sm-muted">{t("header.collecting")}</span>}>
                <For each={segments()}>
                  {(segment, index) => (
                    <>
                      <Show when={index() > 0}>
                        <span class="sm-sep">·</span>
                      </Show>
                      <span
                        classList={{
                          "sm-warn": segmentTone(segment) === "warn",
                          "sm-danger": segmentTone(segment) === "danger",
                        }}
                      >
                        {segment.text}
                      </span>
                    </>
                  )}
                </For>
              </Show>
            }
          >
            {(text) => <span>{text()}</span>}
          </Show>
        </div>
      </ui.Tooltip>
    </Show>
  )
}

type SettingsRow = { id: "enabled" | GaugeID | "notify"; title: string; description: string }

function MeterSettings(props: { ctx: Context; prefs: Persisted<Prefs> }) {
  const ui = props.ctx.ui
  const t = props.ctx.t
  const prefs = props.prefs
  const current = () => prefs.value ?? INITIAL_PREFS

  const rows: SettingsRow[] = [
    { id: "enabled", title: "settings.enabled", description: "settings.enabled.description" },
    ...GAUGES.map((gauge) => ({ id: gauge.id, title: gauge.title, description: gauge.description })),
    { id: "notify", title: "settings.notify", description: "settings.notify.description" },
  ]

  return (
    <ui.SettingsLayout title={t("settings.title")} description={t("settings.description")}>
      <ui.SettingsSection title={t("settings.section")}>
        {rows.map((row) => (
          <ui.SettingsRow id={row.id} title={t(row.title)} description={t(row.description)}>
            <ui.Switch
              label={t(row.title)}
              hideLabel
              checked={current()[row.id] ?? true}
              onChange={(checked) =>
                prefs.update((draft) => {
                  draft[row.id] = checked
                })
              }
            />
          </ui.SettingsRow>
        ))}
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}

function percentOption(value: unknown, fallback: number) {
  return typeof value === "number" && value > 0 && value <= 100 ? value : fallback
}
