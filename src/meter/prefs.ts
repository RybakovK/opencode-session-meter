import { Schema } from "effect"
import type { GaugeID } from "./gauges"

export const PrefsSchema = Schema.Struct({
  enabled: Schema.Boolean,
  speed: Schema.Boolean,
  context: Schema.Boolean,
  cache: Schema.Boolean,
  notify: Schema.optional(Schema.Boolean),
})

export type Prefs = typeof PrefsSchema.Type

export const INITIAL_PREFS: Prefs = { enabled: true, speed: true, context: true, cache: true, notify: true }

export const gaugeEnabled = (prefs: Prefs, id: GaugeID) => prefs[id] !== false

export const notifyEnabled = (prefs: Prefs) => prefs.notify ?? true
