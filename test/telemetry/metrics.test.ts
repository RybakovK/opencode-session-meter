import { describe, expect, test } from "bun:test"
import {
  cacheDiagnostic,
  cacheShare,
  charsPerToken,
  contentChars,
  contextTokens,
  contextTone,
  DEFAULT_CHARS_PER_TOKEN,
  formatTokens,
  sparkline,
  stepRate,
  streamRate,
} from "../../src/telemetry/metrics"

const tokens = (input: number, output: number, reasoning: number, read: number, write: number) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

describe("contextTokens", () => {
  test("sums every token bucket", () => {
    expect(contextTokens(tokens(100, 20, 5, 900, 30))).toBe(1055)
  })
})

describe("cacheShare", () => {
  test("is the cached part of the prompt", () => {
    expect(cacheShare(tokens(100, 20, 0, 900, 0))).toBe(0.9)
  })

  test("is undefined without a prompt", () => {
    expect(cacheShare(tokens(0, 20, 0, 0, 0))).toBeUndefined()
  })
})

describe("charsPerToken", () => {
  test("calibrates from a finished step", () => {
    expect(charsPerToken(3000, 1000)).toBe(3)
  })

  test("stays in a plausible range", () => {
    expect(charsPerToken(10_000, 1)).toBe(8)
    expect(charsPerToken(10, 10_000)).toBe(1.5)
  })

  test("falls back without data", () => {
    expect(charsPerToken(0, 0)).toBe(DEFAULT_CHARS_PER_TOKEN)
  })
})

describe("streamRate", () => {
  const samples = [
    { at: 0, tokens: 10 },
    { at: 500, tokens: 20 },
    { at: 1000, tokens: 20 },
  ]

  test("splits the window over elapsed time", () => {
    expect(streamRate(samples, 2000, 2500, 1200)).toBeCloseTo((50 / 2000) * 1000, 5)
  })

  test("drops the rate once generation pauses", () => {
    expect(streamRate(samples, 3000, 2500, 1200)).toBeUndefined()
  })

  test("ignores samples outside the window", () => {
    expect(streamRate(samples, 1200, 1000, 1200)).toBeCloseTo((40 / 700) * 1000, 5)
  })

  test("has no rate without samples", () => {
    expect(streamRate([], 1000, 2500, 1200)).toBeUndefined()
  })
})

describe("contentChars", () => {
  test("counts streamed text and reasoning", () => {
    expect(
      contentChars([{ type: "text", text: "hello" }, { type: "reasoning", text: "think" }, { type: "tool" }]),
    ).toBe(10)
  })
})

describe("contextTone", () => {
  test("stays neutral with room left", () => {
    expect(contextTone(74)).toBeUndefined()
    expect(contextTone(undefined)).toBeUndefined()
  })

  test("warns before the window fills", () => {
    expect(contextTone(75)).toBe("warning")
    expect(contextTone(89)).toBe("warning")
  })

  test("turns critical near the limit", () => {
    expect(contextTone(90)).toBe("danger")
    expect(contextTone(120)).toBe("danger")
  })
})

describe("stepRate", () => {
  test("measures generation after the first token", () => {
    expect(stepRate(tokens(0, 100, 20, 0, 0), { created: 0, firstToken: 500, completed: 3000 })).toBeCloseTo(48, 5)
  })

  test("falls back to the step start without a first-token mark", () => {
    expect(stepRate(tokens(0, 120, 0, 0, 0), { created: 0, completed: 3000 })).toBeCloseTo(40, 5)
  })

  test("needs a finished step and generated tokens", () => {
    expect(stepRate(tokens(0, 120, 0, 0, 0), { created: 0, firstToken: 100 })).toBeUndefined()
    expect(stepRate(undefined, { created: 0, completed: 100 })).toBeUndefined()
    expect(stepRate(tokens(0, 0, 0, 0, 0), { created: 0, completed: 100 })).toBeUndefined()
  })
})

describe("cacheDiagnostic", () => {
  test("flags a cold cache on a long prompt", () => {
    expect(cacheDiagnostic(tokens(10_000, 100, 0, 0, 0))).toBe(true)
  })

  test("ignores short prompts", () => {
    expect(cacheDiagnostic(tokens(500, 100, 0, 0, 0))).toBe(false)
  })

  test("ignores a healthy cache", () => {
    expect(cacheDiagnostic(tokens(3_000, 100, 0, 7_000, 0))).toBe(false)
  })

  test("treats exactly 40% as healthy", () => {
    expect(cacheDiagnostic(tokens(6_000, 100, 0, 4_000, 0))).toBe(false)
  })

  test("needs a message", () => {
    expect(cacheDiagnostic(undefined)).toBe(false)
  })
})

describe("sparkline", () => {
  test("scales values into block glyphs", () => {
    expect(sparkline([1, 2, 4, 8])).toBe("▂▃▅█")
  })

  test("keeps zero seconds as a baseline", () => {
    expect(sparkline([0, 4])).toBe("▁█")
  })

  test("is empty without movement", () => {
    expect(sparkline([0, 0, 0])).toBe("")
    expect(sparkline([])).toBe("")
  })
})

describe("formatTokens", () => {
  test("shortens thousands and millions", () => {
    expect(formatTokens(999)).toBe("999")
    expect(formatTokens(12_400)).toBe("12.4k")
    expect(formatTokens(200_000)).toBe("200k")
    expect(formatTokens(1_500_000)).toBe("1.5M")
  })
})
