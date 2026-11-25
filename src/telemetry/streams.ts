import type { OpenCodeClient } from "@opencode/client/promise"
import type { ServerRef } from "@opencode/plugin/gui"

export type StreamSource = {
  subscribe(onDelta: (chars: number) => void, signal: AbortSignal): void
}

export const DELTA_TYPES = ["session.text.delta", "session.reasoning.delta", "session.tool.input.delta"] as const

/** Deltas forwarded to windows by the plugin host. */
export function bridgeStream(data: ServerRef["data"], sessionID: string): StreamSource {
  return {
    subscribe(onDelta, signal) {
      const offs = [
        data.on("session.text.delta", (event) => {
          if (event.data.sessionID === sessionID) onDelta(event.data.delta.length)
        }),
        data.on("session.reasoning.delta", (event) => {
          if (event.data.sessionID === sessionID) onDelta(event.data.delta.length)
        }),
        data.on("session.tool.input.delta", (event) => {
          if (event.data.sessionID === sessionID) onDelta(event.data.delta.length)
        }),
      ]

      signal.addEventListener(
        "abort",
        () => {
          for (const off of offs) off()
        },
        { once: true },
      )
    },
  }
}

/** The server's own event stream, for builds where the bridge stays silent. */
export function clientStream(client: OpenCodeClient, sessionID: string): StreamSource {
  return {
    subscribe(onDelta, signal) {
      void (async () => {
        try {
          const stream = client.event.subscribe({ types: [...DELTA_TYPES], signal })
          for await (const event of stream) {
            if (event.type === "server.connected") continue
            if (event.data.sessionID !== sessionID) continue
            onDelta(event.data.delta.length)
          }
        } catch {
          // The bridge or the polled transcript still feed the meter.
        }
      })()
    },
  }
}
