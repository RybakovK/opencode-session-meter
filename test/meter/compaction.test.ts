import { describe, expect, test } from "bun:test"
import { compactionStatus } from "#src/meter/compaction"
import type { RunningCompaction } from "#src/telemetry/select"

const compaction = (patch: Partial<RunningCompaction> = {}): RunningCompaction =>
  ({
    type: "compaction",
    id: "msg_compaction" as never,
    status: "running",
    reason: "auto",
    summary: "",
    time: { created: 1000 },
    ...patch,
  }) as RunningCompaction

describe("compactionStatus", () => {
  test("is undefined without a running compaction", () => {
    expect(compactionStatus(undefined, 5000, 4)).toBeUndefined()
  })

  test("counts elapsed seconds and summarized tokens", () => {
    const status = compactionStatus(compaction({ summary: "x".repeat(8000) }), 4000, 4)

    expect(status?.seconds).toBe(3)
    expect(status?.tokens).toBe("2k")
    expect(status?.reason).toBe("auto")
  })

  test("animates the frame with the clock", () => {
    const first = compactionStatus(compaction(), 0, 4)
    const later = compactionStatus(compaction(), 180, 4)

    expect(first?.frame).not.toBe(later?.frame)
  })
})
