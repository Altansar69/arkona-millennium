export type ArkonaRelease = {
  name: string;
  group: string | null;
  source: "SCENE" | "P2P";
  size_bytes: number;
  date: string | null;
  has_nfo: boolean;
  game_slug: string | null;
  category: "full_game" | "update_fix";
};

type CompactRelease = {
  n: string;
  g: string | null;
  s: "SCENE" | "P2P";
  z: number;
  h: boolean;
  l: string | null;
  c: "full_game" | "update_fix";
};

type BackendEnvelope = {
  success: boolean;
  status: number;
  items?: CompactRelease[];
  total?: number;
  error?: string;
};

type PublicReleasePage = {
  releases?: ArkonaRelease[];
};

export type ArkonaGameLink = {
  key: string;
  label: string;
  url: string;
};

export type ArkonaSteamGame = {
  slug: string;
  title: string;
  links: ArkonaGameLink[];
};

type IdentifierGame = {
  slug?: unknown;
  title?: unknown;
  links?: unknown;
  identifiers?: {
    csrin_urls?: unknown;
    online_fix_urls?: unknown;
  };
};

type IdentifierResponse = {
  games?: IdentifierGame[];
};

const LINK_HOSTS = new Set([
  "ag.ru",
  "cs.rin.ru",
  "egdata.app",
  "en.riotpixels.com",
  "gamecopyworld.com",
  "gog.com",
  "gogdb.org",
  "howlongtobeat.com",
  "igdb.com",
  "isthereanydeal.com",
  "mobygames.com",
  "online-fix.me",
  "origin.com",
  "pcgamingwiki.com",
  "riotpixels.com",
  "ru.riotpixels.com",
  "scream-db.web.app",
  "steamdb.info",
  "store.epicgames.com",
  "store.steampowered.com",
  "systemrequirementslab.com",
  "www.ag.ru",
  "www.ea.com",
  "www.epicgames.com",
  "www.gamecopyworld.com",
  "www.gog.com",
  "www.igdb.com",
  "www.mobygames.com",
  "www.origin.com",
  "www.pcgamingwiki.com",
  "www.systemrequirementslab.com",
]);

function safeLink(key: unknown, label: unknown, rawUrl: unknown): ArkonaGameLink | null {
  if (typeof key !== "string" || !key || typeof label !== "string" || !label || typeof rawUrl !== "string") return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
    return { key, label, url: url.toString() };
  } catch {
    return null;
  }
}

function safeUrls(value: unknown, key: string, label: string): ArkonaGameLink[] {
  if (!Array.isArray(value)) return [];
  return value.map((url) => safeLink(key, label, url)).filter((link): link is ArkonaGameLink => link !== null);
}

type RpcEnvelope<T> = {
  success: boolean;
  status: number;
  data?: T;
  error?: string;
};

function decodeResponse<T>(raw: unknown): T {
  if (typeof raw === "string") return JSON.parse(raw) as T;
  if (raw !== null && typeof raw === "object") return raw as T;
  throw new Error("invalid_response");
}

export function parseRpcResponse<T>(raw: unknown): T {
  const envelope = decodeResponse<RpcEnvelope<T>>(raw);
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.status === 429 ? "rate_limited" : envelope.error || "api_error");
  }
  return envelope.data;
}

export function parseBackendResponse(raw: unknown): ArkonaRelease[] {
  const envelope = decodeResponse<BackendEnvelope>(raw);
  if (!envelope.success || !Array.isArray(envelope.items)) {
    throw new Error(envelope.status === 429 ? "rate_limited" : envelope.error || "api_error");
  }
  return envelope.items
    .filter(
      (release) =>
        typeof release.n === "string" &&
        release.n.length > 0 &&
        (release.s === "SCENE" || release.s === "P2P"),
    )
    .map((release) => ({
      name: release.n,
      group: release.g,
      source: release.s,
      size_bytes: release.z,
      date: null,
      has_nfo: release.h,
      game_slug: release.l,
      category: release.c,
    }));
}

export function parsePublicApiResponse(raw: string): ArkonaRelease[] {
  const page = JSON.parse(raw) as PublicReleasePage;
  if (!Array.isArray(page.releases)) throw new Error("invalid_response");
  return page.releases.filter(
    (release) =>
      typeof release.name === "string" &&
      release.name.length > 0 &&
      (release.source === "SCENE" || release.source === "P2P"),
  );
}

export function parseIdentifierResponse(raw: string, steamAppId: number): ArkonaSteamGame[] {
  const response = JSON.parse(raw) as IdentifierResponse;
  if (!Array.isArray(response.games)) throw new Error("invalid_response");
  return response.games.flatMap((game) => {
    if (typeof game.slug !== "string" || !game.slug || typeof game.title !== "string" || !game.title) return [];
    const direct = Array.isArray(game.links)
      ? game.links.map((link) => {
          if (link === null || typeof link !== "object") return null;
          const item = link as Record<string, unknown>;
          return safeLink(item.key, item.label, item.url);
        }).filter((link): link is ArkonaGameLink => link !== null && link.key !== "steam")
      : [];
    const extras = [
      ...safeUrls(game.identifiers?.online_fix_urls, "online_fix", "Online-Fix"),
      ...safeUrls(game.identifiers?.csrin_urls, "csrin", "CS.RIN.RU"),
    ];
    if (!extras.some((link) => link.key === "csrin")) {
      const fallback = safeLink("csrin", "CS.RIN.RU", `https://cs.rin.ru/app/${steamAppId}`);
      if (fallback) extras.push(fallback);
    }
    const unique = new Map<string, ArkonaGameLink>();
    for (const link of [...direct, ...extras]) unique.set(link.url, link);
    return [{ slug: game.slug, title: game.title, links: [...unique.values()] }];
  });
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit < 2 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function releaseUrl(name: string): string {
  return `https://arkona.dev/release/${encodeURIComponent(name)}`;
}

export function downloadGuideUrl(release: Pick<ArkonaRelease, "name" | "category">): string {
  const name = release.name.toLowerCase();
  if (name.includes("trainer")) return "https://arkona.dev/tutorials/installation#trainer";
  if (release.category === "update_fix" || name.includes("update") || name.includes("crackfix")) {
    return "https://arkona.dev/tutorials/game-updates";
  }
  return "https://arkona.dev/tutorials/installation#iso";
}

export function nfoUrl(release: ArkonaRelease): string {
  const query = new URLSearchParams({ name: release.name, source: release.source });
  return `https://arkona.dev/api/v1/releases/nfo/download?${query.toString()}`;
}

export function nfoJsonUrl(release: ArkonaRelease): string {
  const query = new URLSearchParams({ name: release.name, source: release.source });
  return `https://arkona.dev/api/v1/releases/nfo?${query.toString()}`;
}
