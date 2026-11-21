import { ffi } from "millennium";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { openArkonaGame } from "./game-route";
import { detectLanguage, type LanguageKey } from "../webview/localization";

type Sort = "date" | "title" | "rating" | "most_releases";

type AdvancedFilters = {
  platform: string;
  genre: string;
  steam: string;
  multiplayer: string;
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
  multiplayer: "",
  date_min: "",
  date_max: "",
};

function decode(raw: unknown): GamesEnvelope {
  if (typeof raw === "string") return JSON.parse(raw) as GamesEnvelope;
  if (raw && typeof raw === "object") return raw as GamesEnvelope;
  throw new Error("invalid_response");
}

type LibraryLanguage = LanguageKey;

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
  multiplayer: string;
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
    metadataUnavailable: "Detailed metadata unavailable.", multiplayer: "Multiplayer (Online-Fix)", mostReleases: "Most releases", next: "Next", no: "No", noGames: "No games found.",
    platforms: "Platforms", previous: "Previous", recentlyAdded: "Recently added", release: "release", releases: "releases",
    reset: "Reset", retry: "Retry", search: "Search", searchGames: "Search games", sortGames: "Sort games", title: "Title",
    topRated: "Top rated", unavailable: "The Arkona library is temporarily unavailable.", yes: "Yes",
  },
  fr: {
    advancedFilters: "Filtres avancés", advancedSearch: "Recherche avancée", all: "Tous", apply: "Appliquer", clearSearch: "Effacer la recherche",
    dateFrom: "Date des releases - du", dateTo: "Date des releases - au", games: "jeux", genre: "Genre",
    intro: "Parcourez les jeux et leurs releases disponibles sur Arkona.", library: "Bibliothèque", loading: "Chargement…",
    metadataUnavailable: "Métadonnées détaillées indisponibles.", multiplayer: "Multijoueur (Online-Fix)", mostReleases: "Plus de releases", next: "Suivant", no: "Non", noGames: "Aucun jeu trouvé.",
    platforms: "Plateformes", previous: "Précédent", recentlyAdded: "Ajouts récents", release: "release", releases: "releases",
    reset: "Réinitialiser", retry: "Réessayer", search: "Rechercher", searchGames: "Rechercher un jeu", sortGames: "Trier les jeux", title: "Titre",
    topRated: "Mieux notés", unavailable: "La bibliothèque Arkona est temporairement indisponible.", yes: "Oui",
  },
  ru: {
    advancedFilters: "Расширенные фильтры", advancedSearch: "Расширенный поиск", all: "Все", apply: "Применить", clearSearch: "Очистить поиск",
    dateFrom: "Дата релиза игры от", dateTo: "Дата релиза игры до", games: "игр", genre: "Жанр",
    intro: "Просматривайте игры и доступные релизы Arkona.", library: "Библиотека", loading: "Загрузка…",
    metadataUnavailable: "Подробные метаданные недоступны.", multiplayer: "Сетевая игра (Online-Fix)", mostReleases: "Больше релизов", next: "Далее", no: "Нет", noGames: "Игры не найдены.",
    platforms: "Платформы", previous: "Назад", recentlyAdded: "Недавно добавленные", release: "релиз", releases: "релизов",
    reset: "Сбросить", retry: "Повторить", search: "Найти", searchGames: "Поиск игр", sortGames: "Сортировка игр", title: "Название",
    topRated: "Лучшие оценки", unavailable: "Библиотека Arkona временно недоступна.", yes: "Да",
  },
  ar: { advancedFilters: "فلاتر متقدمة", advancedSearch: "بحث متقدم", all: "الكل", apply: "تطبيق", clearSearch: "مسح البحث", dateFrom: "تاريخ الإصدار من", dateTo: "تاريخ الإصدار إلى", games: "لعبة", genre: "النوع", intro: "تصفح الألعاب وإصداراتها المتاحة على Arkona.", library: "المكتبة", loading: "جارٍ التحميل…", metadataUnavailable: "البيانات الوصفية التفصيلية غير متاحة.", multiplayer: "متعدد اللاعبين (Online-Fix)", mostReleases: "الأكثر إصدارات", next: "التالي", no: "لا", noGames: "لم يتم العثور على ألعاب.", platforms: "المنصات", previous: "السابق", recentlyAdded: "أضيفت مؤخرًا", release: "إصدار", releases: "إصدارات", reset: "إعادة تعيين", retry: "إعادة المحاولة", search: "بحث", searchGames: "البحث عن الألعاب", sortGames: "ترتيب الألعاب", title: "العنوان", topRated: "الأعلى تقييمًا", unavailable: "مكتبة Arkona غير متاحة مؤقتًا.", yes: "نعم" },
  bg: { advancedFilters: "Разширени филтри", advancedSearch: "Разширено търсене", all: "Всички", apply: "Приложи", clearSearch: "Изчисти търсенето", dateFrom: "Дата на излизане от", dateTo: "Дата на излизане до", games: "игри", genre: "Жанр", intro: "Разгледайте игрите и наличните им издания в Arkona.", library: "Библиотека", loading: "Зареждане…", metadataUnavailable: "Подробните метаданни не са налични.", multiplayer: "Мултиплейър (Online-Fix)", mostReleases: "Най-много издания", next: "Напред", no: "Не", noGames: "Няма намерени игри.", platforms: "Платформи", previous: "Назад", recentlyAdded: "Наскоро добавени", release: "издание", releases: "издания", reset: "Нулиране", retry: "Опитай отново", search: "Търси", searchGames: "Търсене на игри", sortGames: "Сортиране на игри", title: "Заглавие", topRated: "Най-високо оценени", unavailable: "Библиотеката на Arkona е временно недостъпна.", yes: "Да" },
  cs: { advancedFilters: "Pokročilé filtry", advancedSearch: "Pokročilé hledání", all: "Vše", apply: "Použít", clearSearch: "Vymazat hledání", dateFrom: "Datum vydání od", dateTo: "Datum vydání do", games: "her", genre: "Žánr", intro: "Procházejte hry a jejich dostupná vydání na Arkona.", library: "Knihovna", loading: "Načítání…", metadataUnavailable: "Podrobná metadata nejsou k dispozici.", multiplayer: "Hra více hráčů (Online-Fix)", mostReleases: "Nejvíce vydání", next: "Další", no: "Ne", noGames: "Nebyly nalezeny žádné hry.", platforms: "Platformy", previous: "Předchozí", recentlyAdded: "Nedávno přidané", release: "vydání", releases: "vydání", reset: "Obnovit", retry: "Zkusit znovu", search: "Hledat", searchGames: "Hledat hry", sortGames: "Řadit hry", title: "Název", topRated: "Nejlépe hodnocené", unavailable: "Knihovna Arkona je dočasně nedostupná.", yes: "Ano" },
  da: { advancedFilters: "Avancerede filtre", advancedSearch: "Avanceret søgning", all: "Alle", apply: "Anvend", clearSearch: "Ryd søgning", dateFrom: "Udgivelsesdato fra", dateTo: "Udgivelsesdato til", games: "spil", genre: "Genre", intro: "Gennemse spil og deres tilgængelige Arkona-releases.", library: "Bibliotek", loading: "Indlæser…", metadataUnavailable: "Detaljerede metadata er ikke tilgængelige.", multiplayer: "Multiplayer (Online-Fix)", mostReleases: "Flest releases", next: "Næste", no: "Nej", noGames: "Ingen spil fundet.", platforms: "Platforme", previous: "Forrige", recentlyAdded: "Senest tilføjet", release: "release", releases: "releases", reset: "Nulstil", retry: "Prøv igen", search: "Søg", searchGames: "Søg efter spil", sortGames: "Sortér spil", title: "Titel", topRated: "Bedst bedømt", unavailable: "Arkona-biblioteket er midlertidigt utilgængeligt.", yes: "Ja" },
  de: { advancedFilters: "Erweiterte Filter", advancedSearch: "Erweiterte Suche", all: "Alle", apply: "Anwenden", clearSearch: "Suche löschen", dateFrom: "Erscheinungsdatum von", dateTo: "Erscheinungsdatum bis", games: "Spiele", genre: "Genre", intro: "Durchsuche Spiele und ihre verfügbaren Arkona-Releases.", library: "Bibliothek", loading: "Wird geladen…", metadataUnavailable: "Detaillierte Metadaten nicht verfügbar.", multiplayer: "Mehrspieler (Online-Fix)", mostReleases: "Meiste Releases", next: "Weiter", no: "Nein", noGames: "Keine Spiele gefunden.", platforms: "Plattformen", previous: "Zurück", recentlyAdded: "Zuletzt hinzugefügt", release: "Release", releases: "Releases", reset: "Zurücksetzen", retry: "Erneut versuchen", search: "Suchen", searchGames: "Spiele suchen", sortGames: "Spiele sortieren", title: "Titel", topRated: "Am besten bewertet", unavailable: "Die Arkona-Bibliothek ist vorübergehend nicht verfügbar.", yes: "Ja" },
  el: { advancedFilters: "Σύνθετα φίλτρα", advancedSearch: "Σύνθετη αναζήτηση", all: "Όλα", apply: "Εφαρμογή", clearSearch: "Εκκαθάριση αναζήτησης", dateFrom: "Ημερομηνία κυκλοφορίας από", dateTo: "Ημερομηνία κυκλοφορίας έως", games: "παιχνίδια", genre: "Είδος", intro: "Περιηγηθείτε στα παιχνίδια και στις διαθέσιμες κυκλοφορίες τους στο Arkona.", library: "Βιβλιοθήκη", loading: "Φόρτωση…", metadataUnavailable: "Λεπτομερή μεταδεδομένα μη διαθέσιμα.", multiplayer: "Πολλοί παίκτες (Online-Fix)", mostReleases: "Περισσότερες κυκλοφορίες", next: "Επόμενη", no: "Όχι", noGames: "Δεν βρέθηκαν παιχνίδια.", platforms: "Πλατφόρμες", previous: "Προηγούμενη", recentlyAdded: "Πρόσφατες προσθήκες", release: "κυκλοφορία", releases: "κυκλοφορίες", reset: "Επαναφορά", retry: "Δοκιμή ξανά", search: "Αναζήτηση", searchGames: "Αναζήτηση παιχνιδιών", sortGames: "Ταξινόμηση παιχνιδιών", title: "Τίτλος", topRated: "Κορυφαία βαθμολογία", unavailable: "Η βιβλιοθήκη Arkona δεν είναι προσωρινά διαθέσιμη.", yes: "Ναι" },
  es: { advancedFilters: "Filtros avanzados", advancedSearch: "Búsqueda avanzada", all: "Todos", apply: "Aplicar", clearSearch: "Borrar búsqueda", dateFrom: "Fecha de lanzamiento desde", dateTo: "Fecha de lanzamiento hasta", games: "juegos", genre: "Género", intro: "Explora juegos y sus releases disponibles en Arkona.", library: "Biblioteca", loading: "Cargando…", metadataUnavailable: "Metadatos detallados no disponibles.", multiplayer: "Multijugador (Online-Fix)", mostReleases: "Más releases", next: "Siguiente", no: "No", noGames: "No se encontraron juegos.", platforms: "Plataformas", previous: "Anterior", recentlyAdded: "Añadidos recientemente", release: "release", releases: "releases", reset: "Restablecer", retry: "Reintentar", search: "Buscar", searchGames: "Buscar juegos", sortGames: "Ordenar juegos", title: "Título", topRated: "Mejor valorados", unavailable: "La biblioteca de Arkona no está disponible temporalmente.", yes: "Sí" },
  "es-419": { advancedFilters: "Filtros avanzados", advancedSearch: "Búsqueda avanzada", all: "Todos", apply: "Aplicar", clearSearch: "Borrar búsqueda", dateFrom: "Fecha de lanzamiento desde", dateTo: "Fecha de lanzamiento hasta", games: "juegos", genre: "Género", intro: "Explora juegos y sus releases disponibles en Arkona.", library: "Biblioteca", loading: "Cargando…", metadataUnavailable: "Metadatos detallados no disponibles.", multiplayer: "Multijugador (Online-Fix)", mostReleases: "Más releases", next: "Siguiente", no: "No", noGames: "No se encontraron juegos.", platforms: "Plataformas", previous: "Anterior", recentlyAdded: "Agregados recientemente", release: "release", releases: "releases", reset: "Restablecer", retry: "Reintentar", search: "Buscar", searchGames: "Buscar juegos", sortGames: "Ordenar juegos", title: "Título", topRated: "Mejor calificados", unavailable: "La biblioteca de Arkona no está disponible temporalmente.", yes: "Sí" },
  fi: { advancedFilters: "Tarkennetut suodattimet", advancedSearch: "Tarkennettu haku", all: "Kaikki", apply: "Käytä", clearSearch: "Tyhjennä haku", dateFrom: "Julkaisupäivä alkaen", dateTo: "Julkaisupäivä asti", games: "peliä", genre: "Lajityyppi", intro: "Selaa pelejä ja niiden saatavilla olevia Arkona-julkaisuja.", library: "Kirjasto", loading: "Ladataan…", metadataUnavailable: "Tarkempia metatietoja ei ole saatavilla.", multiplayer: "Moninpeli (Online-Fix)", mostReleases: "Eniten julkaisuja", next: "Seuraava", no: "Ei", noGames: "Pelejä ei löytynyt.", platforms: "Alustat", previous: "Edellinen", recentlyAdded: "Äskettäin lisätyt", release: "julkaisu", releases: "julkaisua", reset: "Palauta", retry: "Yritä uudelleen", search: "Hae", searchGames: "Hae pelejä", sortGames: "Lajittele pelit", title: "Nimi", topRated: "Parhaiten arvioidut", unavailable: "Arkona-kirjasto ei ole tilapäisesti käytettävissä.", yes: "Kyllä" },
  hu: { advancedFilters: "Speciális szűrők", advancedSearch: "Részletes keresés", all: "Összes", apply: "Alkalmaz", clearSearch: "Keresés törlése", dateFrom: "Megjelenés dátuma ettől", dateTo: "Megjelenés dátuma eddig", games: "játék", genre: "Műfaj", intro: "Böngészd a játékokat és az elérhető Arkona-kiadásokat.", library: "Könyvtár", loading: "Betöltés…", metadataUnavailable: "Részletes metaadatok nem érhetők el.", multiplayer: "Többjátékos (Online-Fix)", mostReleases: "Legtöbb kiadás", next: "Következő", no: "Nem", noGames: "Nem található játék.", platforms: "Platformok", previous: "Előző", recentlyAdded: "Nemrég hozzáadott", release: "kiadás", releases: "kiadás", reset: "Visszaállítás", retry: "Újra", search: "Keresés", searchGames: "Játékok keresése", sortGames: "Játékok rendezése", title: "Cím", topRated: "Legjobbra értékelt", unavailable: "Az Arkona-könyvtár átmenetileg nem érhető el.", yes: "Igen" },
  id: { advancedFilters: "Filter lanjutan", advancedSearch: "Pencarian lanjutan", all: "Semua", apply: "Terapkan", clearSearch: "Hapus pencarian", dateFrom: "Tanggal rilis dari", dateTo: "Tanggal rilis sampai", games: "game", genre: "Genre", intro: "Jelajahi game dan rilis yang tersedia di Arkona.", library: "Pustaka", loading: "Memuat…", metadataUnavailable: "Metadata terperinci tidak tersedia.", multiplayer: "Multipemain (Online-Fix)", mostReleases: "Rilis terbanyak", next: "Berikutnya", no: "Tidak", noGames: "Tidak ada game yang ditemukan.", platforms: "Platform", previous: "Sebelumnya", recentlyAdded: "Baru ditambahkan", release: "rilis", releases: "rilis", reset: "Atur ulang", retry: "Coba lagi", search: "Cari", searchGames: "Cari game", sortGames: "Urutkan game", title: "Judul", topRated: "Nilai tertinggi", unavailable: "Pustaka Arkona untuk sementara tidak tersedia.", yes: "Ya" },
  it: { advancedFilters: "Filtri avanzati", advancedSearch: "Ricerca avanzata", all: "Tutti", apply: "Applica", clearSearch: "Cancella ricerca", dateFrom: "Data di uscita dal", dateTo: "Data di uscita al", games: "giochi", genre: "Genere", intro: "Sfoglia i giochi e le release disponibili su Arkona.", library: "Libreria", loading: "Caricamento…", metadataUnavailable: "Metadati dettagliati non disponibili.", multiplayer: "Multigiocatore (Online-Fix)", mostReleases: "Più release", next: "Avanti", no: "No", noGames: "Nessun gioco trovato.", platforms: "Piattaforme", previous: "Indietro", recentlyAdded: "Aggiunti di recente", release: "release", releases: "release", reset: "Reimposta", retry: "Riprova", search: "Cerca", searchGames: "Cerca giochi", sortGames: "Ordina giochi", title: "Titolo", topRated: "Più votati", unavailable: "La libreria Arkona è temporaneamente non disponibile.", yes: "Sì" },
  ja: { advancedFilters: "詳細フィルター", advancedSearch: "詳細検索", all: "すべて", apply: "適用", clearSearch: "検索をクリア", dateFrom: "発売日（開始）", dateTo: "発売日（終了）", games: "件のゲーム", genre: "ジャンル", intro: "ゲームと Arkona で利用可能なリリースを閲覧します。", library: "ライブラリ", loading: "読み込み中…", metadataUnavailable: "詳細なメタデータは利用できません。", multiplayer: "マルチプレイヤー (Online-Fix)", mostReleases: "リリース数順", next: "次へ", no: "いいえ", noGames: "ゲームが見つかりません。", platforms: "プラットフォーム", previous: "前へ", recentlyAdded: "最近追加", release: "リリース", releases: "リリース", reset: "リセット", retry: "再試行", search: "検索", searchGames: "ゲームを検索", sortGames: "ゲームを並べ替え", title: "タイトル", topRated: "高評価順", unavailable: "Arkona ライブラリは一時的に利用できません。", yes: "はい" },
  ko: { advancedFilters: "고급 필터", advancedSearch: "고급 검색", all: "전체", apply: "적용", clearSearch: "검색 지우기", dateFrom: "출시일 시작", dateTo: "출시일 종료", games: "개 게임", genre: "장르", intro: "게임과 Arkona에서 이용 가능한 릴리스를 둘러보세요.", library: "라이브러리", loading: "불러오는 중…", metadataUnavailable: "상세 메타데이터를 사용할 수 없습니다.", multiplayer: "멀티플레이어 (Online-Fix)", mostReleases: "릴리스 많은 순", next: "다음", no: "아니요", noGames: "게임을 찾을 수 없습니다.", platforms: "플랫폼", previous: "이전", recentlyAdded: "최근 추가됨", release: "릴리스", releases: "릴리스", reset: "초기화", retry: "다시 시도", search: "검색", searchGames: "게임 검색", sortGames: "게임 정렬", title: "제목", topRated: "최고 평점", unavailable: "Arkona 라이브러리를 일시적으로 사용할 수 없습니다.", yes: "예" },
  ms: { advancedFilters: "Penapis lanjutan", advancedSearch: "Carian lanjutan", all: "Semua", apply: "Guna", clearSearch: "Kosongkan carian", dateFrom: "Tarikh keluaran dari", dateTo: "Tarikh keluaran hingga", games: "permainan", genre: "Genre", intro: "Layari permainan dan keluaran yang tersedia di Arkona.", library: "Pustaka", loading: "Memuatkan…", metadataUnavailable: "Metadata terperinci tidak tersedia.", multiplayer: "Berbilang pemain (Online-Fix)", mostReleases: "Keluaran terbanyak", next: "Seterusnya", no: "Tidak", noGames: "Tiada permainan ditemui.", platforms: "Platform", previous: "Sebelumnya", recentlyAdded: "Baru ditambah", release: "keluaran", releases: "keluaran", reset: "Set semula", retry: "Cuba lagi", search: "Cari", searchGames: "Cari permainan", sortGames: "Isih permainan", title: "Tajuk", topRated: "Penilaian tertinggi", unavailable: "Pustaka Arkona tidak tersedia buat sementara waktu.", yes: "Ya" },
  nl: { advancedFilters: "Geavanceerde filters", advancedSearch: "Geavanceerd zoeken", all: "Alle", apply: "Toepassen", clearSearch: "Zoekopdracht wissen", dateFrom: "Releasedatum vanaf", dateTo: "Releasedatum tot", games: "games", genre: "Genre", intro: "Blader door games en hun beschikbare Arkona-releases.", library: "Bibliotheek", loading: "Laden…", metadataUnavailable: "Gedetailleerde metadata niet beschikbaar.", multiplayer: "Multiplayer (Online-Fix)", mostReleases: "Meeste releases", next: "Volgende", no: "Nee", noGames: "Geen games gevonden.", platforms: "Platforms", previous: "Vorige", recentlyAdded: "Recent toegevoegd", release: "release", releases: "releases", reset: "Herstellen", retry: "Opnieuw proberen", search: "Zoeken", searchGames: "Games zoeken", sortGames: "Games sorteren", title: "Titel", topRated: "Best beoordeeld", unavailable: "De Arkona-bibliotheek is tijdelijk niet beschikbaar.", yes: "Ja" },
  no: { advancedFilters: "Avanserte filtre", advancedSearch: "Avansert søk", all: "Alle", apply: "Bruk", clearSearch: "Tøm søk", dateFrom: "Utgivelsesdato fra", dateTo: "Utgivelsesdato til", games: "spill", genre: "Sjanger", intro: "Bla gjennom spill og tilgjengelige Arkona-releaser.", library: "Bibliotek", loading: "Laster inn…", metadataUnavailable: "Detaljerte metadata er ikke tilgjengelige.", multiplayer: "Flerspiller (Online-Fix)", mostReleases: "Flest releaser", next: "Neste", no: "Nei", noGames: "Fant ingen spill.", platforms: "Plattformer", previous: "Forrige", recentlyAdded: "Nylig lagt til", release: "release", releases: "releaser", reset: "Tilbakestill", retry: "Prøv igjen", search: "Søk", searchGames: "Søk etter spill", sortGames: "Sorter spill", title: "Tittel", topRated: "Best vurdert", unavailable: "Arkona-biblioteket er midlertidig utilgjengelig.", yes: "Ja" },
  pl: { advancedFilters: "Filtry zaawansowane", advancedSearch: "Wyszukiwanie zaawansowane", all: "Wszystkie", apply: "Zastosuj", clearSearch: "Wyczyść wyszukiwanie", dateFrom: "Data premiery od", dateTo: "Data premiery do", games: "gier", genre: "Gatunek", intro: "Przeglądaj gry i ich dostępne wydania na Arkona.", library: "Biblioteka", loading: "Wczytywanie…", metadataUnavailable: "Szczegółowe metadane są niedostępne.", multiplayer: "Wieloosobowa (Online-Fix)", mostReleases: "Najwięcej wydań", next: "Dalej", no: "Nie", noGames: "Nie znaleziono gier.", platforms: "Platformy", previous: "Wstecz", recentlyAdded: "Ostatnio dodane", release: "wydanie", releases: "wydań", reset: "Resetuj", retry: "Spróbuj ponownie", search: "Szukaj", searchGames: "Szukaj gier", sortGames: "Sortuj gry", title: "Tytuł", topRated: "Najwyżej oceniane", unavailable: "Biblioteka Arkona jest tymczasowo niedostępna.", yes: "Tak" },
  pt: { advancedFilters: "Filtros avançados", advancedSearch: "Pesquisa avançada", all: "Todos", apply: "Aplicar", clearSearch: "Limpar pesquisa", dateFrom: "Data de lançamento de", dateTo: "Data de lançamento até", games: "jogos", genre: "Género", intro: "Explora jogos e as suas releases disponíveis no Arkona.", library: "Biblioteca", loading: "A carregar…", metadataUnavailable: "Metadados detalhados indisponíveis.", multiplayer: "Multijogador (Online-Fix)", mostReleases: "Mais releases", next: "Seguinte", no: "Não", noGames: "Nenhum jogo encontrado.", platforms: "Plataformas", previous: "Anterior", recentlyAdded: "Adicionados recentemente", release: "release", releases: "releases", reset: "Repor", retry: "Tentar novamente", search: "Pesquisar", searchGames: "Pesquisar jogos", sortGames: "Ordenar jogos", title: "Título", topRated: "Mais bem avaliados", unavailable: "A biblioteca Arkona está temporariamente indisponível.", yes: "Sim" },
  "pt-BR": { advancedFilters: "Filtros avançados", advancedSearch: "Busca avançada", all: "Todos", apply: "Aplicar", clearSearch: "Limpar busca", dateFrom: "Data de lançamento de", dateTo: "Data de lançamento até", games: "jogos", genre: "Gênero", intro: "Explore jogos e seus releases disponíveis no Arkona.", library: "Biblioteca", loading: "Carregando…", metadataUnavailable: "Metadados detalhados indisponíveis.", multiplayer: "Multijogador (Online-Fix)", mostReleases: "Mais releases", next: "Próxima", no: "Não", noGames: "Nenhum jogo encontrado.", platforms: "Plataformas", previous: "Anterior", recentlyAdded: "Adicionados recentemente", release: "release", releases: "releases", reset: "Redefinir", retry: "Tentar novamente", search: "Buscar", searchGames: "Buscar jogos", sortGames: "Ordenar jogos", title: "Título", topRated: "Mais bem avaliados", unavailable: "A biblioteca Arkona está temporariamente indisponível.", yes: "Sim" },
  ro: { advancedFilters: "Filtre avansate", advancedSearch: "Căutare avansată", all: "Toate", apply: "Aplică", clearSearch: "Șterge căutarea", dateFrom: "Data lansării de la", dateTo: "Data lansării până la", games: "jocuri", genre: "Gen", intro: "Răsfoiește jocurile și release-urile disponibile pe Arkona.", library: "Bibliotecă", loading: "Se încarcă…", metadataUnavailable: "Metadate detaliate indisponibile.", multiplayer: "Multiplayer (Online-Fix)", mostReleases: "Cele mai multe release-uri", next: "Următoarea", no: "Nu", noGames: "Niciun joc găsit.", platforms: "Platforme", previous: "Anterioara", recentlyAdded: "Adăugate recent", release: "release", releases: "release-uri", reset: "Resetează", retry: "Reîncearcă", search: "Caută", searchGames: "Caută jocuri", sortGames: "Sortează jocurile", title: "Titlu", topRated: "Cele mai apreciate", unavailable: "Biblioteca Arkona este temporar indisponibilă.", yes: "Da" },
  sv: { advancedFilters: "Avancerade filter", advancedSearch: "Avancerad sökning", all: "Alla", apply: "Använd", clearSearch: "Rensa sökning", dateFrom: "Släppdatum från", dateTo: "Släppdatum till", games: "spel", genre: "Genre", intro: "Bläddra bland spel och deras tillgängliga Arkona-releaser.", library: "Bibliotek", loading: "Laddar…", metadataUnavailable: "Detaljerad metadata är inte tillgänglig.", multiplayer: "Flerspelare (Online-Fix)", mostReleases: "Flest releaser", next: "Nästa", no: "Nej", noGames: "Inga spel hittades.", platforms: "Plattformar", previous: "Föregående", recentlyAdded: "Nyligen tillagda", release: "release", releases: "releaser", reset: "Återställ", retry: "Försök igen", search: "Sök", searchGames: "Sök spel", sortGames: "Sortera spel", title: "Titel", topRated: "Högst betyg", unavailable: "Arkona-biblioteket är tillfälligt otillgängligt.", yes: "Ja" },
  th: { advancedFilters: "ตัวกรองขั้นสูง", advancedSearch: "ค้นหาขั้นสูง", all: "ทั้งหมด", apply: "ใช้", clearSearch: "ล้างการค้นหา", dateFrom: "วันที่วางจำหน่ายตั้งแต่", dateTo: "วันที่วางจำหน่ายถึง", games: "เกม", genre: "ประเภท", intro: "เรียกดูเกมและรีลีสที่มีใน Arkona", library: "คลัง", loading: "กำลังโหลด…", metadataUnavailable: "ไม่มีข้อมูลเมตาโดยละเอียด", multiplayer: "ผู้เล่นหลายคน (Online-Fix)", mostReleases: "รีลีสมากที่สุด", next: "ถัดไป", no: "ไม่", noGames: "ไม่พบเกม", platforms: "แพลตฟอร์ม", previous: "ก่อนหน้า", recentlyAdded: "เพิ่มล่าสุด", release: "รีลีส", releases: "รีลีส", reset: "รีเซ็ต", retry: "ลองอีกครั้ง", search: "ค้นหา", searchGames: "ค้นหาเกม", sortGames: "เรียงเกม", title: "ชื่อ", topRated: "คะแนนสูงสุด", unavailable: "คลัง Arkona ไม่พร้อมใช้งานชั่วคราว", yes: "ใช่" },
  tr: { advancedFilters: "Gelişmiş filtreler", advancedSearch: "Gelişmiş arama", all: "Tümü", apply: "Uygula", clearSearch: "Aramayı temizle", dateFrom: "Çıkış tarihi başlangıç", dateTo: "Çıkış tarihi bitiş", games: "oyun", genre: "Tür", intro: "Oyunlara ve mevcut Arkona sürümlerine göz at.", library: "Kütüphane", loading: "Yükleniyor…", metadataUnavailable: "Ayrıntılı meta veriler kullanılamıyor.", multiplayer: "Çok oyunculu (Online-Fix)", mostReleases: "En çok sürüm", next: "Sonraki", no: "Hayır", noGames: "Oyun bulunamadı.", platforms: "Platformlar", previous: "Önceki", recentlyAdded: "Son eklenenler", release: "sürüm", releases: "sürüm", reset: "Sıfırla", retry: "Tekrar dene", search: "Ara", searchGames: "Oyun ara", sortGames: "Oyunları sırala", title: "Başlık", topRated: "En yüksek puanlı", unavailable: "Arkona kütüphanesi geçici olarak kullanılamıyor.", yes: "Evet" },
  uk: { advancedFilters: "Розширені фільтри", advancedSearch: "Розширений пошук", all: "Усі", apply: "Застосувати", clearSearch: "Очистити пошук", dateFrom: "Дата виходу від", dateTo: "Дата виходу до", games: "ігор", genre: "Жанр", intro: "Переглядайте ігри та доступні релізи Arkona.", library: "Бібліотека", loading: "Завантаження…", metadataUnavailable: "Детальні метадані недоступні.", multiplayer: "Мережева гра (Online-Fix)", mostReleases: "Найбільше релізів", next: "Далі", no: "Ні", noGames: "Ігор не знайдено.", platforms: "Платформи", previous: "Назад", recentlyAdded: "Нещодавно додані", release: "реліз", releases: "релізів", reset: "Скинути", retry: "Повторити", search: "Знайти", searchGames: "Пошук ігор", sortGames: "Сортування ігор", title: "Назва", topRated: "Найкращі оцінки", unavailable: "Бібліотека Arkona тимчасово недоступна.", yes: "Так" },
  vi: { advancedFilters: "Bộ lọc nâng cao", advancedSearch: "Tìm kiếm nâng cao", all: "Tất cả", apply: "Áp dụng", clearSearch: "Xóa tìm kiếm", dateFrom: "Ngày phát hành từ", dateTo: "Ngày phát hành đến", games: "trò chơi", genre: "Thể loại", intro: "Duyệt trò chơi và các bản phát hành có trên Arkona.", library: "Thư viện", loading: "Đang tải…", metadataUnavailable: "Không có siêu dữ liệu chi tiết.", multiplayer: "Nhiều người chơi (Online-Fix)", mostReleases: "Nhiều bản phát hành nhất", next: "Tiếp", no: "Không", noGames: "Không tìm thấy trò chơi.", platforms: "Nền tảng", previous: "Trước", recentlyAdded: "Mới thêm gần đây", release: "bản phát hành", releases: "bản phát hành", reset: "Đặt lại", retry: "Thử lại", search: "Tìm", searchGames: "Tìm trò chơi", sortGames: "Sắp xếp trò chơi", title: "Tên", topRated: "Đánh giá cao nhất", unavailable: "Thư viện Arkona tạm thời không khả dụng.", yes: "Có" },
  "zh-CN": { advancedFilters: "高级筛选", advancedSearch: "高级搜索", all: "全部", apply: "应用", clearSearch: "清除搜索", dateFrom: "游戏发售日期从", dateTo: "游戏发售日期至", games: "款游戏", genre: "类型", intro: "浏览游戏及其在 Arkona 上可用的发布。", library: "库", loading: "正在加载…", metadataUnavailable: "详细元数据不可用。", multiplayer: "多人游戏 (Online-Fix)", mostReleases: "发布最多", next: "下一页", no: "否", noGames: "未找到游戏。", platforms: "平台", previous: "上一页", recentlyAdded: "最近添加", release: "个发布", releases: "个发布", reset: "重置", retry: "重试", search: "搜索", searchGames: "搜索游戏", sortGames: "游戏排序", title: "标题", topRated: "评分最高", unavailable: "Arkona 库暂时不可用。", yes: "是" },
  "zh-TW": { advancedFilters: "進階篩選", advancedSearch: "進階搜尋", all: "全部", apply: "套用", clearSearch: "清除搜尋", dateFrom: "遊戲發售日期從", dateTo: "遊戲發售日期至", games: "款遊戲", genre: "類型", intro: "瀏覽遊戲及其在 Arkona 上可用的發行版。", library: "收藏庫", loading: "載入中…", metadataUnavailable: "詳細中繼資料無法使用。", multiplayer: "多人遊戲 (Online-Fix)", mostReleases: "發行版最多", next: "下一頁", no: "否", noGames: "找不到遊戲。", platforms: "平台", previous: "上一頁", recentlyAdded: "最近新增", release: "個發行版", releases: "個發行版", reset: "重設", retry: "重試", search: "搜尋", searchGames: "搜尋遊戲", sortGames: "排序遊戲", title: "標題", topRated: "評價最高", unavailable: "Arkona 收藏庫暫時無法使用。", yes: "是" },
};

function currentLanguage(): LibraryLanguage {
  return detectLanguage();
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
    () => `${total.toLocaleString(language)} ${copy.games}`,
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
              <ArkonaSelect label={copy.multiplayer} value={draftFilters.multiplayer} onChange={(value) => updateDraftFilter("multiplayer", value)} options={[
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
