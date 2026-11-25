import type { CompactionStatus } from "./compaction"
import type { Prefs } from "./prefs"
import type { Translate } from "./translate"
import type { MeterView, Row } from "./view"

export type Surface =
  | { kind: "hidden" }
  | { kind: "compaction"; row: string; tooltip: string; aria: string }
  | { kind: "collecting"; rows: Row[]; aria: string }
  | { kind: "metrics"; segments: MeterView["segments"]; rows: Row[]; aria: string }

export type SurfaceInput = {
  view: MeterView
  status: CompactionStatus | undefined
  prefs: Prefs
  t: Translate
}

export function buildSurface(input: SurfaceInput): Surface {
  if (!input.prefs.enabled) return { kind: "hidden" }

  const status = input.status
  if (status) {
    return {
      kind: "compaction",
      row: `${status.frame} ${input.t("header.compact", { seconds: status.seconds })}`,
      aria: input.t("header.compact", { seconds: status.seconds }),
      tooltip: input.t("tooltip.compact", {
        reason: input.t(status.reason === "manual" ? "reason.manual" : "reason.auto"),
        seconds: status.seconds,
        tokens: status.tokens,
      }),
    }
  }

  const view = input.view
  if (view.collecting) return { kind: "collecting", rows: view.rows, aria: view.aria }
  if (view.segments.length === 0 && view.rows.length === 0) return { kind: "hidden" }

  return { kind: "metrics", segments: view.segments, rows: view.rows, aria: view.aria }
}
