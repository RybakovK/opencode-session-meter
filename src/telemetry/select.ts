import type { SessionMessageInfo } from "@opencode/client/promise"
import { contextTokens } from "./metrics"

type List = readonly SessionMessageInfo[]

export type Assistant = Extract<SessionMessageInfo, { type: "assistant" }>
export type RunningCompaction = Extract<SessionMessageInfo, { type: "compaction"; status: "running" }>

export const lastAssistant = (list: List): Assistant | undefined => {
  for (let index = list.length - 1; index >= 0; index--) {
    const message = list[index]
    if (message.type !== "assistant") continue
    if (!message.tokens || contextTokens(message.tokens) <= 0) continue
    return message
  }
}

export const streamingAssistant = (list: List): Assistant | undefined => {
  for (let index = list.length - 1; index >= 0; index--) {
    const message = list[index]
    if (message.type !== "assistant") continue
    return message.time.completed ? undefined : message
  }
}

export const runningCompaction = (list: List): RunningCompaction | undefined => {
  for (let index = list.length - 1; index >= 0; index--) {
    const message = list[index]
    if (message.type !== "compaction") continue
    return message.status === "running" ? message : undefined
  }
}
