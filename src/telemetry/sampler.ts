import { charsPerToken, DEFAULT_CHARS_PER_TOKEN, type RateSample, streamRate } from "./metrics"

export type SamplerState = {
  rate: number | undefined
  lastRate: number | undefined
  history: readonly number[]
  waiting: boolean
}

export type SamplerConfig = {
  windowMs: number
  idleMs: number
  seconds: number
  emitMs: number
  freshMs: number
  now: () => number
}

export type Sampler = {
  delta(chars: number): void
  total(messageID: string, chars: number): void
  calibrate(chars: number, tokens: number): void
  tick(streaming: boolean): void
  state(): SamplerState
  ratio(): number
  reset(): void
}

export const SAMPLER_DEFAULTS: Omit<SamplerConfig, "now"> = {
  windowMs: 2500,
  idleMs: 1200,
  seconds: 30,
  emitMs: 120,
  freshMs: 3000,
}

export function createSampler(
  options: Partial<SamplerConfig> & { onChange?: (state: SamplerState) => void } = {},
): Sampler {
  const config: SamplerConfig = { ...SAMPLER_DEFAULTS, now: () => Date.now(), ...options }

  let ratio = DEFAULT_CHARS_PER_TOKEN
  let samples: RateSample[] = []
  let completed: number[] = new Array(config.seconds).fill(0)
  let bucket = Math.floor(config.now() / 1000)
  let bucketTokens = 0
  let lastMessageID = ""
  let lastChars = 0
  let lastDeltaAt = Number.NEGATIVE_INFINITY
  let lastRate: number | undefined
  let lastRateAt = 0
  let lastEmit = 0
  let streaming = false

  const frame = () => [...completed.slice(1), bucketTokens]

  // Roll the chart only while a step is streaming, so the last window of
  // generation stays on screen instead of draining away while the session idles.
  const roll = (now: number) => {
    const shift = Math.min(Math.floor(now / 1000) - bucket, config.seconds)
    if (shift <= 0) return
    completed = [...completed.slice(shift), ...new Array<number>(shift - 1).fill(0), bucketTokens]
    bucket = Math.floor(now / 1000)
    bucketTokens = 0
  }

  const state = (): SamplerState => {
    const now = config.now()
    const rate = streamRate(samples, now, config.windowMs, config.idleMs)
    // A live reading older than the grace window becomes stale: the header then
    // falls back to the finished step average instead of showing a frozen rate.
    const fresh = lastRate !== undefined && now - lastRateAt <= config.freshMs ? lastRate : undefined
    return {
      rate,
      lastRate: fresh,
      history: frame(),
      waiting: streaming && rate === undefined && fresh === undefined,
    }
  }

  const emit = (now: number, force: boolean) => {
    if (!force && now - lastEmit < config.emitMs) return
    lastEmit = now
    const next = state()
    if (next.rate !== undefined) {
      lastRate = next.rate
      lastRateAt = now
    }
    options.onChange?.(next)
  }

  const accept = (chars: number) => {
    const now = config.now()
    roll(now)
    const tokens = chars / ratio
    samples.push({ at: now, tokens })
    bucketTokens += tokens
    emit(now, false)
  }

  return {
    delta(chars) {
      lastDeltaAt = config.now()
      accept(chars)
    },
    total(messageID, chars) {
      if (messageID !== lastMessageID) {
        lastMessageID = messageID
        lastChars = chars
        return
      }
      const grown = chars - lastChars
      lastChars = chars
      // Deltas are the live source; the polled length only fills in when this
      // build does not forward them. Keep the baseline fresh either way.
      if (config.now() - lastDeltaAt < config.idleMs) return
      if (grown > 0) accept(grown)
    },
    calibrate(chars, tokens) {
      if (chars > 0 && tokens > 0) ratio = charsPerToken(chars, tokens)
    },
    tick(active) {
      const now = config.now()
      streaming = active
      roll(now)
      emit(now, true)
    },
    state,
    ratio: () => ratio,
    reset() {
      ratio = DEFAULT_CHARS_PER_TOKEN
      samples = []
      completed = new Array(config.seconds).fill(0)
      bucket = Math.floor(config.now() / 1000)
      bucketTokens = 0
      lastMessageID = ""
      lastChars = 0
      lastDeltaAt = Number.NEGATIVE_INFINITY
      lastRate = undefined
      lastRateAt = 0
      streaming = false
      lastEmit = 0
      emit(config.now(), true)
    },
  }
}
