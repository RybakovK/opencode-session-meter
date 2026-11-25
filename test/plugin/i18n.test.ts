import { describe, expect, test } from "bun:test"
import { i18n } from "../../src/plugin/i18n"

const placeholders = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort()

describe("i18n catalogs", () => {
  test("ships exactly English and Russian", () => {
    expect(Object.keys(i18n).sort()).toEqual(["en", "ru"])
  })

  test("Russian covers every English key", () => {
    expect(Object.keys(i18n.ru).sort()).toEqual(Object.keys(i18n.en).sort())
  })

  test("no message is empty", () => {
    for (const catalog of [i18n.en, i18n.ru] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(key.trim(), "empty key").not.toBe("")
        expect(value.trim(), key).not.toBe("")
      }
    }
  })

  test("both locales interpolate the same parameters", () => {
    const en = i18n.en as Record<string, string>
    const ru = i18n.ru as Record<string, string>
    for (const key of Object.keys(en)) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]))
    }
  })
})
