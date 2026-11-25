import { describe, expect, test } from "bun:test"
import type { OpenCodeClient } from "@opencode/client/promise"
import type { ServerRef } from "@opencode/plugin/gui"
import { bridgeStream, clientStream } from "#src/telemetry/streams"

type Handler = (event: { data: { sessionID: string; delta: string } }) => void

const fakeData = () => {
  const handlers = new Map<string, Handler[]>()
  const removed: string[] = []

  const data = {
    on(type: string, handler: Handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler])
      return () => removed.push(type)
    },
  } as unknown as ServerRef["data"]

  const emit = (type: string, sessionID: string, delta: string) => {
    for (const handler of handlers.get(type) ?? []) handler({ data: { sessionID, delta } })
  }

  return { data, emit, removed }
}

const fakeClient = (events: { sessionID: string; delta: string; type?: string }[]) => {
  const client = {
    event: {
      subscribe() {
        return (async function* () {
          for (const event of events) {
            if (event.type === "connected") {
              yield { type: "server.connected", data: {} }
              continue
            }
            yield { type: "session.text.delta", data: { sessionID: event.sessionID, delta: event.delta } }
          }
        })()
      },
    },
  } as unknown as OpenCodeClient

  return client
}

const collect = () => {
  const deltas: number[] = []
  return { deltas, push: (chars: number) => deltas.push(chars) }
}

describe("bridgeStream", () => {
  test("forwards text, reasoning and tool deltas of its session", () => {
    const data = fakeData()
    const sink = collect()

    bridgeStream(data.data, "ses_1").subscribe(sink.push, new AbortController().signal)

    data.emit("session.text.delta", "ses_1", "hello")
    data.emit("session.reasoning.delta", "ses_1", "think")
    data.emit("session.tool.input.delta", "ses_1", "{}")

    expect(sink.deltas).toEqual([5, 5, 2])
  })

  test("ignores other sessions", () => {
    const data = fakeData()
    const sink = collect()

    bridgeStream(data.data, "ses_1").subscribe(sink.push, new AbortController().signal)
    data.emit("session.text.delta", "ses_2", "hello")

    expect(sink.deltas).toEqual([])
  })

  test("unsubscribes on abort", () => {
    const data = fakeData()
    const controller = new AbortController()

    bridgeStream(data.data, "ses_1").subscribe(() => {}, controller.signal)
    controller.abort()

    expect(data.removed).toEqual(["session.text.delta", "session.reasoning.delta", "session.tool.input.delta"])
  })
})

describe("clientStream", () => {
  test("forwards deltas of its session and skips the connection event", async () => {
    const sink = collect()
    const client = fakeClient([
      { type: "connected", sessionID: "", delta: "" },
      { sessionID: "ses_1", delta: "hello" },
      { sessionID: "ses_2", delta: "other" },
    ])

    clientStream(client, "ses_1").subscribe(sink.push, new AbortController().signal)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sink.deltas).toEqual([5])
  })

  test("survives a stream that fails", async () => {
    const client = {
      event: {
        subscribe() {
          return {
            [Symbol.asyncIterator]() {
              return {
                next: () => Promise.reject(new Error("stream down")),
              }
            },
          }
        },
      },
    } as unknown as OpenCodeClient

    expect(() => clientStream(client, "ses_1").subscribe(() => {}, new AbortController().signal)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
