import { formatTokens } from "../telemetry/metrics"
import type { RunningCompaction } from "../telemetry/select"

export const COMPACT_FRAMES = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"]

export type CompactionStatus = {
  reason: "auto" | "manual"
  frame: string
  seconds: number
  tokens: string
}

export function compactionStatus(
  message: RunningCompaction | undefined,
  now: number,
  ratio: number,
): CompactionStatus | undefined {
  if (!message) return undefined
  return {
    reason: message.reason,
    frame: COMPACT_FRAMES[Math.floor(now / 180) % COMPACT_FRAMES.length],
    seconds: Math.max(0, Math.round((now - message.time.created) / 1000)),
    tokens: formatTokens(message.summary.length / ratio),
  }
}
