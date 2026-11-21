import { describe, expect, test } from "bun:test";
import { copyForLanguage, interpolate, languageKey, steamLanguageCodes } from "./localization";

describe("Steam localization", () => {
  test("provides complete copy for every Steam language code", () => {
    for (const language of steamLanguageCodes) {
      const copy = copyForLanguage(language);
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  test("resolves Steam aliases and regional browser locales", () => {
    expect(copyForLanguage("schinese").download).toBe("下载");
    expect(copyForLanguage("koreana").download).toBe("다운로드");
    expect(copyForLanguage("pt-BR").password).toBe("Senha");
    expect(copyForLanguage("zh-HK").copy).toBe("複製");
    expect(copyForLanguage("unknown").download).toBe("Download");
  });

  test("maps Steam names and browser locales to a language key", () => {
    expect(languageKey("french")).toBe("fr");
    expect(languageKey("fr-FR")).toBe("fr");
    expect(languageKey("es-MX")).toBe("es-419");
    expect(languageKey("es-ES")).toBe("es");
    expect(languageKey("nb-NO")).toBe("no");
    expect(languageKey("zh-Hant-TW")).toBe("zh-TW");
    expect(languageKey("")).toBeNull();
    expect(languageKey(undefined)).toBeNull();
    expect(languageKey("xx-YY")).toBeNull();
  });

  test("interpolates multipart labels", () => {
    expect(interpolate(copyForLanguage("fr").part, { part: 2, count: 3 })).toBe("Partie 2 sur 3");
  });
});
