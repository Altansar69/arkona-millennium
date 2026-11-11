import { ffi } from "millennium";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { openArkonaGame } from "./game-route";

type Sort = "date" | "title" | "rating" | "most_releases";

type AdvancedFilters = {
  platform: string;
  genre: string;
  steam: string;
  date_min: string;
  date_max: string;
};

type CompactGame = {
  s: string;
  t: string;
  c: string | null;
  y: number | null;
  r: number | null;
  n: number;
  p: string | null;
  m: string | null;
};

type GamesEnvelope = {
  success: boolean;
  status: number;
  items?: CompactGame[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
};

type GamePreview = {
  m: string;
  g: string[];
  p: string[];
  st: string[];
};

type ActivePreview = {
  game: CompactGame;
  top: number;
  left: number;
  host: HTMLElement;
};

const fetchGames = ffi<[query: string, page: number, sort: Sort, filters: string], unknown>("FetchArkonaGames");
const fetchGamePreview = ffi<[slug: string], unknown>("FetchArkonaGamePreview");

const EMPTY_FILTERS: AdvancedFilters = {
  platform: "",
  genre: "",
  steam: "",
  date_min: "",
  date_max: "",
};

function decode(raw: unknown): GamesEnvelope {
  if (typeof raw === "string") return JSON.parse(raw) as GamesEnvelope;
  if (raw && typeof raw === "object") return raw as GamesEnvelope;
  throw new Error("invalid_response");
}

type LibraryLanguage = "en" | "fr" | "ru";

type LibraryCopy = {
  advancedFilters: string;
  advancedSearch: string;
  all: string;
  apply: string;
  clearSearch: string;
  dateFrom: string;
  dateTo: string;
  games: string;
  genre: string;
  intro: string;
  library: string;
  loading: string;
  metadataUnavailable: string;
  mostReleases: string;
  next: string;
  no: string;
  noGames: string;
  platforms: string;
  previous: string;
  recentlyAdded: string;
  release: string;
  releases: string;
  reset: string;
  retry: string;
  search: string;
  searchGames: string;
  sortGames: string;
  title: string;
  topRated: string;
  unavailable: string;
  yes: string;
};

const libraryCopy: Record<LibraryLanguage, LibraryCopy> = {
  en: {
    advancedFilters: "Advanced filters", advancedSearch: "Advanced search", all: "All", apply: "Apply", clearSearch: "Clear search",
    dateFrom: "Game releases date from", dateTo: "Game releases date to", games: "games", genre: "Genre",
    intro: "Browse games and their available Arkona releases.", library: "Library", loading: "Loading…",
    metadataUnavailable: "Detailed metadata unavailable.", mostReleases: "Most releases", next: "Next", no: "No", noGames: "No games found.",
    platforms: "Platforms", previous: "Previous", recentlyAdded: "Recently added", release: "release", releases: "releases",
    reset: "Reset", retry: "Retry", search: "Search", searchGames: "Search games", sortGames: "Sort games", title: "Title",
    topRated: "Top rated", unavailable: "The Arkona library is temporarily unavailable.", yes: "Yes",
  },
  fr: {
    advancedFilters: "Filtres avancés", advancedSearch: "Recherche avancée", all: "Tous", apply: "Appliquer", clearSearch: "Effacer la recherche",
    dateFrom: "Date des releases - du", dateTo: "Date des releases - au", games: "jeux", genre: "Genre",
    intro: "Parcourez les jeux et leurs releases disponibles sur Arkona.", library: "Bibliothèque", loading: "Chargement…",
    metadataUnavailable: "Métadonnées détaillées indisponibles.", mostReleases: "Plus de releases", next: "Suivant", no: "Non", noGames: "Aucun jeu trouvé.",
    platforms: "Plateformes", previous: "Précédent", recentlyAdded: "Ajouts récents", release: "release", releases: "releases",
    reset: "Réinitialiser", retry: "Réessayer", search: "Rechercher", searchGames: "Rechercher un jeu", sortGames: "Trier les jeux", title: "Titre",
    topRated: "Mieux notés", unavailable: "La bibliothèque Arkona est temporairement indisponible.", yes: "Oui",
  },
  ru: {
    advancedFilters: "Расширенные фильтры", advancedSearch: "Расширенный поиск", all: "Все", apply: "Применить", clearSearch: "Очистить поиск",
    dateFrom: "Дата релиза игры от", dateTo: "Дата релиза игры до", games: "игр", genre: "Жанр",
    intro: "Просматривайте игры и доступные релизы Arkona.", library: "Библиотека", loading: "Загрузка…",
    metadataUnavailable: "Подробные метаданные недоступны.", mostReleases: "Больше релизов", next: "Далее", no: "Нет", noGames: "Игры не найдены.",
    platforms: "Платформы", previous: "Назад", recentlyAdded: "Недавно добавленные", release: "релиз", releases: "релизов",
    reset: "Сбросить", retry: "Повторить", search: "Найти", searchGames: "Поиск игр", sortGames: "Сортировка игр", title: "Название",
    topRated: "Лучшие оценки", unavailable: "Библиотека Arkona временно недоступна.", yes: "Да",
  },
};

function currentLanguage(): LibraryLanguage {
  const language = (navigator.language || document.documentElement.lang || "en").toLowerCase();
  if (language.startsWith("fr") || language.includes("french")) return "fr";
  if (language.startsWith("ru") || language.includes("russian")) return "ru";
  return "en";
}

const shell: React.CSSProperties = {
  height: "100%",
  minHeight: 0,
  width: "100%",
  overflowY: "auto",
  overscrollBehavior: "contain",
  boxSizing: "border-box",
  color: "#d6d7d8",
  background: "linear-gradient(180deg, #192b3b 0, #0e151d 420px, #0b1016 100%)",
  padding: "46px clamp(28px, 5vw, 76px) 64px",
  fontFamily: '"Motiva Sans", Arial, sans-serif',
};

const button: React.CSSProperties = {
  border: 0,
  borderRadius: 2,
  minHeight: 34,
  padding: "0 16px",
  color: "#dfefff",
  background: "linear-gradient(90deg, #1a9fff, #167ac6)",
  fontWeight: 600,
  cursor: "pointer",
};

type SelectOption = { value: string; label: string };

function ArkonaSelect({ label, value, options, onChange, compact = false }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "arkona-select-control compact" : "arkona-select-control"}>
      <span className={compact ? "arkona-visually-hidden" : "arkona-control-label"}>{label}</span>
      <span className="arkona-select-shell">
        <select value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-label={label}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </span>
    </label>
  );
}

export function ArkonaLibraryPage() {
  const language = currentLanguage();
  const copy = libraryCopy[language];
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [games, setGames] = useState<CompactGame[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<Record<string, GamePreview>>({});
  const [activePreview, setActivePreview] = useState<ActivePreview | null>(null);

  const loadPreview = useCallback((game: CompactGame) => {
    if (Object.hasOwn(previews, game.s)) return;
    setPreviews((current) => ({ ...current, [game.s]: { m: game.m || "", g: [], p: ["PC"], st: [] } }));
    void fetchGamePreview(game.s).then((raw) => {
      const envelope = typeof raw === "string" ? JSON.parse(raw) as { success?: boolean; data?: Partial<GamePreview> } : raw as { success?: boolean; data?: Partial<GamePreview> };
      const data = envelope.success ? envelope.data : undefined;
      setPreviews((current) => ({ ...current, [game.s]: {
        m: typeof data?.m === "string" ? data.m : game.m || "",
        g: Array.isArray(data?.g) ? data.g.filter((value): value is string => typeof value === "string").slice(0, 6) : [],
        p: Array.isArray(data?.p) ? data.p.filter((value): value is string => typeof value === "string") : ["PC"],
        st: Array.isArray(data?.st) ? data.st.filter((value): value is string => typeof value === "string") : [],
      } }));
    }).catch(() => undefined);
  }, [previews]);

  const showPreview = (element: HTMLElement, game: CompactGame) => {
    const rect = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView;
    const viewportWidth = view?.innerWidth || 1280;
    const viewportHeight = view?.innerHeight || 720;
    const width = 330;
    const gutter = 12;
    const left = rect.right + gutter + width <= viewportWidth ? rect.right + gutter : Math.max(gutter, rect.left - width - gutter);
    const top = Math.max(58, Math.min(rect.top - 8, viewportHeight - 400));
    setActivePreview({ game, top, left, host: element.ownerDocument.body });
    loadPreview(game);
  };

  useEffect(() => {
    if (!activePreview) return;
    const view = activePreview.host.ownerDocument.defaultView;
    const hide = () => setActivePreview(null);
    view?.addEventListener("scroll", hide, true);
    view?.addEventListener("resize", hide);
    return () => {
      view?.removeEventListener("scroll", hide, true);
      view?.removeEventListener("resize", hide);
    };
  }, [activePreview]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = decode(await fetchGames(query, page, sort, JSON.stringify(filters)));
      if (!data.success || !Array.isArray(data.items)) throw new Error(data.error || "api_error");
      setGames(data.items);
      setTotal(data.total || 0);
      setLimit(data.limit || 60);
    } catch {
      setGames([]);
      setError(copy.unavailable);
    } finally {
      setLoading(false);
    }
  }, [copy.unavailable, filters, page, query, sort]);

  useEffect(() => { void load(); }, [load]);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const resultLabel = useMemo(
    () => `${total.toLocaleString(language === "fr" ? "fr-FR" : language === "ru" ? "ru-RU" : "en-US")} ${copy.games}`,
    [copy.games, language, total],
  );
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value.trim() !== "").length,
    [filters],
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setQuery(draft.trim());
    setFilters({ ...draftFilters, genre: draftFilters.genre.trim() });
  };

  const updateDraftFilter = (name: keyof AdvancedFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [name]: value }));
  };

  const clearAdvanced = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <main style={shell} data-arkona-library>
      <style>{libraryStyles}</style>
      <header style={{ maxWidth: 1460, margin: "0 auto 30px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
          <h1 style={{ margin: 0, color: "#fff", fontSize: 34, fontWeight: 300, letterSpacing: 0 }}>ARKONA</h1>
          <span style={{ color: "#66c0f4", fontSize: 15, textTransform: "uppercase" }}>
            {copy.library}
          </span>
        </div>
        <p style={{ margin: 0, color: "#8f98a0", fontSize: 14 }}>
          {copy.intro}
        </p>
      </header>

      <section style={{ maxWidth: 1460, margin: "0 auto" }}>
        <form onSubmit={submit} className="arkona-search-form">
          <input
            className="arkona-search-input"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder={copy.searchGames}
            aria-label={copy.searchGames}
          />
          <ArkonaSelect
            compact
            label={copy.sortGames}
            value={sort}
            onChange={(value) => { setSort(value as Sort); setPage(1); }}
            options={[
              { value: "date", label: copy.recentlyAdded },
              { value: "most_releases", label: copy.mostReleases },
              { value: "rating", label: copy.topRated },
              { value: "title", label: copy.title },
            ]}
          />
          <button className="arkona-library-action" type="submit" style={button}>{copy.search}</button>
          <button
            className="arkona-advanced-toggle"
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            {copy.advancedSearch}
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            <b aria-hidden>{advancedOpen ? "▴" : "▾"}</b>
          </button>

          {advancedOpen && (
            <fieldset className="arkona-advanced-panel">
              <legend className="arkona-visually-hidden">{copy.advancedFilters}</legend>
              <ArkonaSelect label={copy.platforms} value={draftFilters.platform} onChange={(value) => updateDraftFilter("platform", value)} options={[
                { value: "", label: copy.all }, { value: "windows", label: "Windows" }, { value: "linux", label: "Linux" }, { value: "macos", label: "macOS" },
              ]} />
              <label className="arkona-text-control"><span className="arkona-control-label">{copy.genre}</span><input value={draftFilters.genre} onChange={(event) => updateDraftFilter("genre", event.currentTarget.value)} placeholder="Action, RPG…" /></label>
              <ArkonaSelect label="Steam" value={draftFilters.steam} onChange={(value) => updateDraftFilter("steam", value)} options={[
                { value: "", label: copy.all }, { value: "yes", label: copy.yes }, { value: "no", label: copy.no },
              ]} />
              <label className="arkona-text-control"><span className="arkona-control-label">{copy.dateFrom}</span><input type="date" value={draftFilters.date_min} onChange={(event) => updateDraftFilter("date_min", event.currentTarget.value)} style={{ colorScheme: "dark" }} /></label>
              <label className="arkona-text-control"><span className="arkona-control-label">{copy.dateTo}</span><input type="date" value={draftFilters.date_max} onChange={(event) => updateDraftFilter("date_max", event.currentTarget.value)} style={{ colorScheme: "dark" }} /></label>
              <div className="arkona-advanced-actions" style={{ gridColumn: "1 / -1" }}>
                <button type="button" onClick={clearAdvanced}>{copy.reset}</button>
                <button className="primary" type="submit">{copy.apply}</button>
              </div>
            </fieldset>
          )}
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 30, marginBottom: 12, color: "#8f98a0", fontSize: 12 }}>
          <span>{loading ? copy.loading : resultLabel}</span>
          {(query || activeFilterCount > 0) && <button type="button" onClick={() => { setDraft(""); setQuery(""); clearAdvanced(); }} style={{ border: 0, color: "#66c0f4", background: "transparent", cursor: "pointer" }}>{copy.clearSearch}</button>}
        </div>

        {error ? (
          <div role="alert" style={{ padding: 20, borderLeft: "3px solid #c44848", color: "#f0caca", background: "rgba(104, 27, 27, .26)" }}>
            {error} <button type="button" onClick={() => void load()} style={{ border: 0, color: "#66c0f4", background: "transparent", cursor: "pointer" }}>{copy.retry}</button>
          </div>
        ) : (
          <div className="arkona-library-grid" style={{ opacity: loading ? .5 : 1 }}>
            {games.map((game) => (
              <button
                key={game.s}
                type="button"
                className="arkona-library-tile"
                onClick={() => { void openArkonaGame(game.s); }}
                onMouseEnter={(event) => showPreview(event.currentTarget, game)}
                onMouseLeave={() => setActivePreview(null)}
                onFocus={(event) => showPreview(event.currentTarget, game)}
                onBlur={() => setActivePreview(null)}
                title={game.t}
                style={{ minWidth: 0, padding: 0, overflow: "hidden", border: "1px solid #263b4d", borderRadius: 3, color: "inherit", background: "#162431", textAlign: "left", cursor: "pointer", boxShadow: "0 5px 14px rgba(0, 0, 0, .24)" }}
              >
                <div style={{ position: "relative", aspectRatio: "3 / 4", overflow: "hidden", background: "#101820" }}>
                  {game.c ? <img src={game.c} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 12, color: "#526979", textAlign: "center", fontSize: 12 }}>{game.t}</div>}
                  <span style={{ position: "absolute", right: 6, top: 6, padding: "3px 6px", color: "#fff", background: "rgba(0, 0, 0, .78)", fontSize: 11 }}>{game.n} {game.n === 1 ? copy.release : copy.releases}</span>
                </div>
                <div style={{ minHeight: 58, padding: "10px 10px 9px", boxSizing: "border-box" }}>
                  <div style={{ overflow: "hidden", color: "#fff", fontSize: 13, fontWeight: 600, lineHeight: 1.25, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.t}</div>
                  <div style={{ marginTop: 5, color: "#8f98a0", fontSize: 11 }}>{game.y || ""}{game.r != null ? ` · ${Math.round(game.r)}/100` : ""}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {activePreview && createPortal(
          <GamePreviewCard game={activePreview.game} details={previews[activePreview.game.s]} top={activePreview.top} left={activePreview.left} copy={copy} />,
          activePreview.host,
        )}

        {!loading && !error && games.length === 0 && <p style={{ padding: "54px 0", color: "#8f98a0", textAlign: "center" }}>{copy.noGames}</p>}

        {pageCount > 1 && (
          <nav aria-label="Pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 28 }}>
            <button className="arkona-library-action" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} style={{ ...button, opacity: page <= 1 || loading ? .4 : 1 }}>{copy.previous}</button>
            <span style={{ color: "#8f98a0", fontSize: 12 }}>{page} / {pageCount}</span>
            <button className="arkona-library-action" type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} style={{ ...button, opacity: page >= pageCount || loading ? .4 : 1 }}>{copy.next}</button>
          </nav>
        )}
      </section>
    </main>
  );
}

function storeName(value: string): string {
  if (value === "steam") return "Steam";
  if (value === "gog") return "GOG";
  if (value === "epic") return "Epic Games";
  if (value === "online_fix") return "Online-Fix";
  return value;
}

function GamePreviewCard({ game, details, top, left, copy }: { game: CompactGame; details?: GamePreview; top: number; left: number; copy: LibraryCopy }) {
  return (
    <aside className="arkona-game-preview" style={{ top, left }} aria-hidden>
      <strong>{game.t}</strong>
      <div className="arkona-game-preview-meta">
        {game.y && <span>{game.y}</span>}
        {game.r != null && <span>★ {Math.round(game.r)}/100</span>}
        <span>PC</span>
        <span className="accent">{game.n} {game.n === 1 ? copy.release : copy.releases}</span>
      </div>
      {!details ? <div className="arkona-game-preview-loading" /> : <>
        {details.m && <p>{details.m}</p>}
        {details.g.length > 0 && <div className="arkona-game-preview-tags">{details.g.map((genre) => <span key={genre}>{genre}</span>)}</div>}
        {details.st.length > 0 && <div className="arkona-game-preview-stores">{details.st.map(storeName).join(" · ")}</div>}
        {!details.m && details.g.length === 0 && <p>{copy.metadataUnavailable}</p>}
      </>}
    </aside>
  );
}

const libraryStyles = `
[data-arkona-library]::-webkit-scrollbar{width:10px}[data-arkona-library]::-webkit-scrollbar-track{background:#0a1118}[data-arkona-library]::-webkit-scrollbar-thumb{background:#31536c}.arkona-search-form{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.arkona-search-input{flex:1 1 340px;min-height:38px;box-sizing:border-box;border:1px solid #000;border-radius:2px;padding:0 12px;color:#fff;background:rgba(8,13,18,.86);outline-color:#66c0f4;font-size:14px}.arkona-select-control{display:flex;min-width:0;flex-direction:column;gap:6px}.arkona-select-control.compact{flex:0 0 190px}.arkona-control-label{color:#8f98a0;font-size:10px;text-transform:uppercase}.arkona-select-shell{position:relative;display:block;min-width:0}.arkona-select-shell::after{content:"▾";position:absolute;right:11px;top:50%;transform:translateY(-52%);pointer-events:none;color:#67c1f5;font-size:12px}.arkona-select-shell select{appearance:none;-webkit-appearance:none;box-sizing:border-box;width:100%;min-height:38px;border:1px solid #000;border-radius:2px;padding:0 34px 0 11px;color:#d6d7d8;background:#162431;outline-color:#66c0f4;color-scheme:dark;font:13px "Motiva Sans",Arial,sans-serif;cursor:pointer}.arkona-select-shell select:hover,.arkona-select-shell select:focus{border-color:#416681;background:#1c3141}.arkona-advanced-toggle{display:flex;align-items:center;gap:8px;min-height:38px;border:1px solid #29465d;border-radius:2px;padding:0 12px;color:#b8d9ed;background:#172a39;cursor:pointer}.arkona-advanced-toggle:hover,.arkona-advanced-toggle:focus-visible{border-color:#66c0f4;color:#fff;outline:none}.arkona-advanced-toggle span{display:grid;place-items:center;min-width:18px;height:18px;border-radius:9px;background:#1a9fff;color:#fff;font-size:10px}.arkona-advanced-toggle b{color:#67c1f5;font-size:11px}.arkona-advanced-panel{display:grid;grid-template-columns:repeat(5,minmax(145px,1fr));gap:14px;width:100%;margin:4px 0 0;padding:16px;box-sizing:border-box;border:1px solid #29465d;background:rgba(8,15,21,.72)}.arkona-text-control{display:flex;min-width:0;flex-direction:column;gap:6px}.arkona-text-control input{box-sizing:border-box;width:100%;min-height:38px;border:1px solid #000;border-radius:2px;padding:0 11px;color:#fff;background:#162431;outline-color:#66c0f4;font-size:13px}.arkona-text-control input:hover,.arkona-text-control input:focus{border-color:#416681;background:#1c3141}.arkona-advanced-actions{display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;grid-column:-3/-1}.arkona-advanced-actions button{min-height:38px;border:0;border-radius:2px;padding:0 14px;color:#dfefff;background:#29455c;cursor:pointer}.arkona-advanced-actions button:hover{filter:brightness(1.15)}.arkona-advanced-actions button.primary{background:linear-gradient(90deg,#1a9fff,#167ac6);color:#fff}.arkona-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.arkona-library-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;transition:opacity 160ms ease}.arkona-library-tile{transition:transform 170ms ease,border-color 170ms ease,box-shadow 170ms ease}.arkona-library-tile:hover,.arkona-library-tile:focus-visible{transform:translateY(-3px);border-color:#66c0f4!important;box-shadow:0 11px 24px rgba(0,0,0,.42)!important;outline:none}.arkona-library-tile img{transition:transform 220ms ease}.arkona-library-tile:hover img,.arkona-library-tile:focus-visible img{transform:scale(1.035)}.arkona-library-action{transition:filter 150ms ease,transform 150ms ease}.arkona-library-action:hover:not(:disabled){filter:brightness(1.16);transform:translateY(-1px)}.arkona-game-preview{position:fixed;z-index:2147482000;pointer-events:none;box-sizing:border-box;width:330px;max-height:390px;overflow:hidden;padding:16px;background:linear-gradient(145deg,#24445b,#152431 58%,#101923);border:1px solid rgba(103,193,245,.35);box-shadow:0 18px 48px rgba(0,0,0,.7);color:#d6d7d8;animation:arkona-preview-in 140ms ease-out}.arkona-game-preview>strong{display:block;color:#fff;font-size:17px;line-height:1.25}.arkona-game-preview-meta,.arkona-game-preview-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.arkona-game-preview-meta span,.arkona-game-preview-tags span{padding:4px 7px;background:rgba(255,255,255,.07);color:#b8c7d2;font-size:10px}.arkona-game-preview-meta span.accent{background:rgba(103,193,245,.13);color:#8ed1f7}.arkona-game-preview p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:7;overflow:hidden;margin:14px 0 0;color:#aebbc5;font-size:12px;line-height:1.55}.arkona-game-preview-stores{margin-top:14px;padding-top:11px;border-top:1px solid rgba(255,255,255,.08);color:#8f98a0;font-size:10px}.arkona-game-preview-loading{height:74px;margin-top:14px;background:rgba(255,255,255,.06);animation:arkona-preview-pulse 1s ease-in-out infinite alternate}@keyframes arkona-preview-in{from{opacity:0;transform:translateY(5px) scale(.98)}to{opacity:1;transform:none}}@keyframes arkona-preview-pulse{to{opacity:.45}}@media(max-width:1250px){.arkona-library-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.arkona-advanced-panel{grid-template-columns:repeat(4,minmax(145px,1fr))}}@media(max-width:1050px){.arkona-library-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.arkona-advanced-panel{grid-template-columns:repeat(3,minmax(145px,1fr))}.arkona-advanced-actions{grid-column:auto}}@media(max-width:800px){.arkona-library-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.arkona-advanced-panel{grid-template-columns:repeat(2,minmax(140px,1fr))}}@media(max-width:600px){.arkona-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.arkona-select-control.compact{flex:1 1 170px}.arkona-advanced-panel{grid-template-columns:1fr}.arkona-advanced-actions{justify-content:stretch}.arkona-advanced-actions button{flex:1}}@media(prefers-reduced-motion:reduce){.arkona-library-grid,.arkona-library-tile,.arkona-library-tile img,.arkona-library-action,.arkona-game-preview,.arkona-game-preview-loading{transition:none!important;animation:none!important;transform:none!important}}`;
