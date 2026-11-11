import { ffi, Navigation } from "millennium";

type DestinationEnvelope = {
  success?: boolean;
  data?: { steam?: unknown; arkona?: unknown };
};

const fetchDestination = ffi<[slug: string], unknown>("FetchArkonaGameDestination");

function validSlug(value: string | null): value is string {
  return Boolean(value && value.length <= 192 && /^[a-zA-Z0-9_-]+$/.test(value));
}

function decode(raw: unknown): DestinationEnvelope {
  if (typeof raw === "string") return JSON.parse(raw) as DestinationEnvelope;
  return raw && typeof raw === "object" ? raw as DestinationEnvelope : {};
}

function openExternal(url: string): void {
  const link = document.createElement("a");
  link.href = `steam://openurl_external/${url}`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}

export async function openArkonaGame(slug: string): Promise<void> {
  if (!validSlug(slug)) return;
  try {
    const result = decode(await fetchDestination(slug));
    const steam = result.success && typeof result.data?.steam === "string" && /^\d+$/.test(result.data.steam)
      ? result.data.steam
      : null;
    if (steam) {
      Navigation.NavigateToSteamWeb(`https://store.steampowered.com/app/${steam}`);
      return;
    }
    if (result.success && typeof result.data?.arkona === "string") {
      openExternal(result.data.arkona);
      return;
    }
  } catch {
    // Fall through to the public Arkona page if destination lookup fails.
  }
  openExternal(`https://arkona.dev/game/${encodeURIComponent(slug)}`);
}
