import type { MountedSession } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal } from "solid-js"
import { contentChars, contextPercent, generationTokens, stepRate } from "../telemetry/metrics"
import { createSampler, SAMPLER_DEFAULTS, type Sampler } from "../telemetry/sampler"
import { lastAssistant, runningCompaction, streamingAssistant } from "../telemetry/select"
import {
  type ControllerState,
  createSessionController,
  type SessionController,
  type Timers,
} from "../telemetry/session-controller"
import { bridgeStream, clientStream } from "../telemetry/streams"
import type { Alerts } from "./alerts"
import { compactionStatus } from "./compaction"
import { createDiagnostics } from "./diagnostics"
import { notifyEnabled, type Prefs } from "./prefs"
import { buildSurface, type Surface } from "./surface"
import type { Translate } from "./translate"
import { buildView } from "./view"

export type MeterModelOptions = {
  session: () => MountedSession
  prefs: () => Prefs
  alerts: Alerts
  warnPercent: number
  dangerPercent: number
  t: Translate
  now?: () => number
  timers?: Timers
  tickMs?: number
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

export type MeterModel = {
  surface(): Surface
  sync(active: boolean): void
  stop(): void
}

const EMPTY_PROGRESS: ControllerState = {
  counters: { bridge: 0, client: 0, store: 0, http: 0 },
  polled: false,
  error: undefined,
}

export function createMeterModel(options: MeterModelOptions): MeterModel {
  const t = options.t
  const data = () => options.session().server.data
  const messages = () => data().session.message.list(options.session().id)

  const last = createMemo(() => lastAssistant(messages()))
  const compaction = createMemo(() => runningCompaction(messages()))
  const step = createMemo(() => stepRate(last()?.tokens, last()?.time))

  const models = createMemo(() => {
    const location = options.session().location
    return location ? (data().location.model.list(location) ?? []) : []
  })

  const limit = createMemo(() => {
    const model = last()?.model ?? data().session.get(options.session().id)?.model
    if (!model) return undefined
    return models().find((item) => item.providerID === model.providerID && item.modelID === model.id)?.limit.context
  })

  const [measured, setMeasured] = createSignal<number>()
  const [waiting, setWaiting] = createSignal(false)
  const [progress, setProgress] = createSignal<ControllerState>(EMPTY_PROGRESS)
  const [history, setHistory] = createSignal<readonly number[]>(new Array(SAMPLER_DEFAULTS.seconds).fill(0))
  const [now, setNow] = createSignal(options.now?.() ?? Date.now())
  const [diagnostic, setDiagnostic] = createSignal<string>()

  const sampler: Sampler = createSampler({
    onChange(state) {
      setMeasured(state.rate ?? state.lastRate)
      setHistory(state.history)
      setWaiting(state.waiting)
    },
  })

  const diagnostics = createDiagnostics()

  createEffect(() => {
    const location = options.session().location
    if (!location) return
    if (data().location.model.list(location)) return
    void data()
      .location.model.sync(location)
      .catch(() => {})
  })

  createEffect(() => {
    const message = last()
    if (!message?.tokens) return
    sampler.calibrate(contentChars(message.content), generationTokens(message.tokens))
  })

  createEffect(() => {
    const at = now()
    diagnostics.observe(waiting(), progress(), at)
    setDiagnostic(diagnostics.hint(at))
  })

  createEffect(() => {
    const tokens = last()?.tokens
    const window = limit()
    // Seed the baseline at 0 once the window is known, so a first answer that
    // already crosses a threshold still alerts.
    const percent = tokens ? contextPercent(tokens, window) : window ? 0 : undefined
    options.alerts.observe(
      { server: options.session().server.id, id: options.session().id },
      percent,
      notifyEnabled(options.prefs()),
    )
  })

  let controller: SessionController | undefined
  let key = ""

  const stop = () => {
    controller?.stop()
    controller = undefined
    key = ""
  }

  const sync = (active: boolean) => {
    const session = options.session()
    const next = `${session.server.id}/${session.id}`

    if (!active) {
      stop()
      return
    }
    if (next === key && controller) return

    stop()
    key = next
    sampler.reset()
    setProgress(EMPTY_PROGRESS)

    controller = createSessionController({
      sessionID: session.id,
      sampler,
      probe: () => {
        const message = streamingAssistant(messages())
        return {
          streaming: message ? { id: message.id, chars: contentChars(message.content) } : undefined,
          running: message !== undefined || data().session.status(session.id) === "running",
        }
      },
      bridge: bridgeStream(data(), session.id),
      client: clientStream(session.server.client, session.id),
      source: async (id, signal) => {
        const response = await session.server.client.message.list(
          { sessionID: id, limit: 4, order: "desc" },
          { signal },
        )
        const message = response.data.find((item) => item.type === "assistant")
        return message ? { id: message.id, chars: contentChars(message.content) } : undefined
      },
      now: options.now,
      timers: options.timers,
      tickMs: options.tickMs,
      pollIntervalMs: options.pollIntervalMs,
      pollTimeoutMs: options.pollTimeoutMs,
      onTick: (at) => setNow(at),
      onState: (state) => setProgress(state),
    })

    controller.start()
  }

  const view = createMemo(() =>
    buildView(
      {
        tokens: last()?.tokens,
        limit: limit(),
        measured: measured(),
        step: step(),
        history: history(),
        seconds: SAMPLER_DEFAULTS.seconds,
        collecting: waiting(),
        diagnostic: diagnostic(),
        warnPercent: options.warnPercent,
        dangerPercent: options.dangerPercent,
      },
      options.prefs(),
      t,
    ),
  )

  const status = createMemo(() => compactionStatus(compaction(), now(), sampler.ratio()))

  const surface = createMemo(() => buildSurface({ view: view(), status: status(), prefs: options.prefs(), t }))

  return { surface, sync, stop }
}
