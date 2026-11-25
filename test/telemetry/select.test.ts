import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { lastAssistant, runningCompaction, streamingAssistant } from "#src/telemetry/select"

const tokens = { input: 100, output: 10, reasoning: 0, cache: { read: 0, write: 0 } }

const assistant = (id: string, patch: Record<string, unknown> = {}) =>
  ({
    id,
    type: "assistant",
    time: { created: 1 },
    content: [],
    model: { id: "model", providerID: "provider" },
    agent: "build",
    ...patch,
  }) as unknown as SessionMessageAssistant

const compaction = (id: string, status: string) =>
  ({
    id,
    type: "compaction",
    status,
    reason: "auto",
    summary: "",
    time: { created: 1 },
  }) as unknown as SessionMessageInfo

const list = (...items: unknown[]) => items as unknown as SessionMessageInfo[]

describe("lastAssistant", () => {
  test("takes the newest assistant message with usage", () => {
    const older = assistant("msg_1", { tokens })
    const newer = assistant("msg_2", { tokens: { ...tokens, output: 20 } })

    expect(lastAssistant(list(older, { type: "user" }, newer))).toBe(newer)
  })

  test("skips messages without usable usage", () => {
    const used = assistant("msg_1", { tokens })
    const empty = assistant("msg_2", { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })

    expect(lastAssistant(list(used, empty))).toBe(used)
  })

  test("returns nothing for an empty transcript", () => {
    expect(lastAssistant(list())).toBeUndefined()
  })
})

describe("streamingAssistant", () => {
  test("returns the assistant message that has not completed", () => {
    const running = assistant("msg_1")

    expect(streamingAssistant(list(running))).toBe(running)
  })

  test("returns nothing once the step completed", () => {
    expect(streamingAssistant(list(assistant("msg_1", { time: { created: 1, completed: 2 } })))).toBeUndefined()
  })
})

describe("runningCompaction", () => {
  test("returns the running compaction", () => {
    const running = compaction("msg_2", "running")

    expect(runningCompaction(list(compaction("msg_1", "completed"), running)) as unknown).toBe(running)
  })

  test("returns nothing when the transcript only has a finished compaction", () => {
    expect(runningCompaction(list(compaction("msg_1", "completed")))).toBeUndefined()
  })
})
