export type Tokens = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export type RateSample = { at: number; tokens: number }

export const DEFAULT_CHARS_PER_TOKEN = 4
export const WARNING_PERCENT = 75
export const DANGER_PERCENT = 90
export const CACHE_LOW_SHARE = 0.4
export const CACHE_MIN_PROMPT = 2000

const SPARK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

export type ContextTone = "warning" | "danger"

export const contextTokens = (tokens: Tokens) =>
  tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write

export const promptTokens = (tokens: Tokens) => tokens.input + tokens.cache.read + tokens.cache.write

export const generationTokens = (tokens: Tokens) => tokens.output + tokens.reasoning

export const cacheShare = (tokens: Tokens) => {
  const prompt = promptTokens(tokens)
  return prompt > 0 ? tokens.cache.read / prompt : undefined
}

export const charsPerToken = (chars: number, tokens: number) =>
  chars > 0 && tokens > 0 ? clamp(chars / tokens, 1.5, 8) : DEFAULT_CHARS_PER_TOKEN

export type StepTime = { created: number; firstToken?: number; completed?: number }

export const stepRate = (tokens: Tokens | undefined, time: StepTime | undefined) => {
  if (!tokens || !time?.completed) return undefined
  const started = time.firstToken ?? time.created
  if (time.completed <= started) return undefined
  const generated = generationTokens(tokens)
  if (generated <= 0) return undefined
  return (generated / (time.completed - started)) * 1000
}

export const contextPercent = (tokens: Tokens, limit: number | undefined) =>
  limit ? Math.round((contextTokens(tokens) / limit) * 100) : undefined

export const cacheDiagnostic = (tokens: Tokens | undefined) => {
  if (!tokens || promptTokens(tokens) < CACHE_MIN_PROMPT) return false
  const share = cacheShare(tokens)
  return share !== undefined && share < CACHE_LOW_SHARE
}

export const sparkline = (values: readonly number[]) => {
  const peak = values.reduce((max, value) => Math.max(max, value), 0)
  if (peak <= 0) return ""
  return values
    .map((value) => SPARK_GLYPHS[Math.min(SPARK_GLYPHS.length - 1, Math.floor((value / peak) * SPARK_GLYPHS.length))])
    .join("")
}

export const contextTone = (
  percent: number | undefined,
  warning: number = WARNING_PERCENT,
  danger: number = DANGER_PERCENT,
): ContextTone | undefined => {
  if (percent === undefined) return undefined
  if (percent >= danger) return "danger"
  if (percent >= warning) return "warning"
}

export const streamRate = (samples: readonly RateSample[], now: number, windowMs: number, idleMs: number) => {
  const last = samples[samples.length - 1]
  if (!last || now - last.at > idleMs) return undefined

  const recent = samples.filter((sample) => now - sample.at <= windowMs)
  if (recent.length === 0) return undefined

  const span = Math.max(now - recent[0].at, 600)
  const tokens = recent.reduce((sum, sample) => sum + sample.tokens, 0)
  return (tokens / span) * 1000
}

export type StreamContent = { type: string; text?: string }

export const contentChars = (content: readonly StreamContent[]) =>
  content.reduce(
    (sum, part) => (part.type === "text" || part.type === "reasoning" ? sum + (part.text?.length ?? 0) : sum),
    0,
  )

export const formatTokens = (value: number) => {
  if (value >= 1_000_000) return `${oneDecimal(value / 1_000_000)}M`
  if (value >= 1000) return `${oneDecimal(value / 1000)}k`
  return String(Math.round(value))
}

const oneDecimal = (value: number) => {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
