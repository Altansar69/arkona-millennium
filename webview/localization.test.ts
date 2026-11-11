import { describe, expect, test } from "bun:test";
import { copyForLanguage, interpolate, steamLanguageCodes } from "./localization";

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

  test("interpolates multipart labels", () => {
    expect(interpolate(copyForLanguage("fr").part, { part: 2, count: 3 })).toBe("Partie 2 sur 3");
  });
});
