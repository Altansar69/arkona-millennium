import { describe, expect, test } from "bun:test";
import { downloadGuideUrl, formatSize, nfoJsonUrl, nfoUrl, parseBackendResponse, parseIdentifierResponse, parsePublicApiResponse, parseRpcResponse, releaseUrl } from "./model";

const release = {
  name: "Game.Update.v1-RUNE",
  group: "RUNE",
  source: "SCENE" as const,
  size_bytes: 1610612736,
  date: "2026-11-10T00:00:00Z",
  has_nfo: true,
  game_slug: "game",
  category: "update_fix" as const,
};

describe("Arkona response model", () => {
  test("parses valid releases and ignores malformed rows", () => {
    const raw = JSON.stringify({
      success: true,
      status: 200,
      items: [
        { n: release.name, g: release.group, s: release.source, z: release.size_bytes, h: true, l: "game", c: "update_fix" },
        { n: "", s: "SCENE" },
      ],
      total: 2,
    });
    expect(parseBackendResponse(raw)).toEqual([{ ...release, date: null }]);
  });

  test("preserves a rate limit error", () => {
    const raw = JSON.stringify({ success: false, status: 429, error: "arkona_api_error" });
    expect(() => parseBackendResponse(raw)).toThrow("rate_limited");
  });

  test("accepts Millennium RPC envelopes as strings or objects", () => {
    const envelope = { success: true, status: 200, data: { challenge: "abc", difficulty: 1 } };
    expect(parseRpcResponse(JSON.stringify(envelope))).toEqual(envelope.data);
    expect(parseRpcResponse(envelope)).toEqual(envelope.data);
  });

  test("accepts Millennium release responses as objects", () => {
    expect(parseBackendResponse({
      success: true,
      status: 200,
      items: [{ n: release.name, g: release.group, s: release.source, z: release.size_bytes, h: true, l: "game", c: "update_fix" }],
    })).toEqual([{ ...release, date: null }]);
  });

  test("parses the public API response", () => {
    expect(parsePublicApiResponse(JSON.stringify({ releases: [release], total: 1 }))).toEqual([release]);
  });

  test("parses validated game links and adds the CS.RIN app resolver", () => {
    const games = parseIdentifierResponse(JSON.stringify({ games: [{
      slug: "game",
      title: "Game",
      links: [
        { key: "steam", label: "Steam", url: "https://store.steampowered.com/app/42" },
        { key: "igdb", label: "IGDB", url: "https://www.igdb.com/games/game" },
        { key: "gog", label: "GOG", url: "https://www.gog.com/game/game" },
        { key: "evil", label: "Evil", url: "https://example.com/steal" },
      ],
      identifiers: { online_fix_urls: ["https://online-fix.me/games/42-game.html"], csrin_urls: [] },
    }] }), 42);
    expect(games).toEqual([{ slug: "game", title: "Game", links: [
      { key: "igdb", label: "IGDB", url: "https://www.igdb.com/games/game" },
      { key: "gog", label: "GOG", url: "https://www.gog.com/game/game" },
      { key: "online_fix", label: "Online-Fix", url: "https://online-fix.me/games/42-game.html" },
      { key: "csrin", label: "CS.RIN.RU", url: "https://cs.rin.ru/app/42" },
    ] }]);
  });

  test("rejects unsafe identifier links", () => {
    expect(parseIdentifierResponse(JSON.stringify({ games: [{
      slug: "game", title: "Game",
      links: [{ key: "igdb", label: "IGDB", url: "javascript:alert(1)" }],
      identifiers: { csrin_urls: ["https://evil.example/app/42"] },
    }] }), 42)[0].links).toEqual([
      { key: "csrin", label: "CS.RIN.RU", url: "https://cs.rin.ru/app/42" },
    ]);
  });

  test("builds encoded public URLs", () => {
    expect(releaseUrl("Game & More-RUNE")).toBe("https://arkona.dev/release/Game%20%26%20More-RUNE");
    expect(nfoUrl(release)).toContain("name=Game.Update.v1-RUNE");
    expect(nfoUrl(release)).toContain("source=SCENE");
    expect(nfoJsonUrl(release)).toBe("https://arkona.dev/api/v1/releases/nfo?name=Game.Update.v1-RUNE&source=SCENE");
  });

  test("selects the same download guides as the Arkona site", () => {
    expect(downloadGuideUrl(release)).toBe("https://arkona.dev/tutorials/game-updates");
    expect(downloadGuideUrl({ name: "Game.Trainer-RUNE", category: "full_game" })).toEndWith("/tutorials/installation#trainer");
    expect(downloadGuideUrl({ name: "Game-RUNE", category: "full_game" })).toEndWith("/tutorials/installation#iso");
  });

  test("formats binary sizes", () => {
    expect(formatSize(1610612736)).toBe("1.5 GiB");
    expect(formatSize(0)).toBe("-");
  });
});
