import { Millennium } from "millennium";
import {
  type ArkonaGameLink,
  type ArkonaRelease,
  downloadGuideUrl,
  formatSize,
  nfoJsonUrl,
  nfoUrl,
  parseBackendResponse,
  parseIdentifierResponse,
  parsePublicApiResponse,
  parseRpcResponse,
  releaseUrl,
} from "./model";
import { copyForLanguage, interpolate, type Copy } from "./localization";
import { solveAltcha, solveSessionProof, type AltchaChallenge } from "./security";

const LOG = "[Arkona]";
const PANEL_ID = "arkona-releases-panel";
const HEADER_LINKS_ID = "arkona-store-header-links";
const STYLE_ID = "arkona-releases-styles";
const STORE_APP = /store\.steampowered\.com\/app\/(\d+)/;

function copy(): Copy {
  return copyForLanguage(document.documentElement.lang || navigator.language || "en");
}

function external(url: string): string {
  return `steam://openurl_external/${url}`;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function steamButton(label: string, action: () => void, secondary = false): HTMLButtonElement {
  const button = element("button", `${secondary ? "btnv6_lightblue_blue" : "btnv6_blue_hoverfade"} btn_medium arkona-steam-button`);
  button.type = "button";
  button.append(element("span", "", label));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

function externalButton(label: string, url: string, secondary = false): HTMLAnchorElement {
  const link = element("a", `${secondary ? "btnv6_lightblue_blue" : "btnv6_blue_hoverfade"} btn_medium arkona-steam-button`);
  link.href = external(url);
  link.rel = "noopener noreferrer";
  link.append(element("span", "", label));
  return link;
}

type ModalShell = { body: HTMLElement; close: () => void; isOpen: () => boolean };

function openModal(title: string, strings: Copy, wide = false, onClose?: () => void): ModalShell {
  const backdrop = element("div", "newmodal_background arkona-modal-backdrop");
  const dialog = element("section", `newmodal arkona-modal${wide ? " arkona-modal-wide" : ""}`);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  const titleId = `arkona-modal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  dialog.setAttribute("aria-labelledby", titleId);

  const header = element("header", "newmodal_header arkona-modal-header");
  const heading = element("h2", "arkona-modal-title", title);
  heading.id = titleId;
  const closeButton = element("button", "newmodal_close arkona-modal-close", "×");
  closeButton.type = "button";
  closeButton.title = strings.close;
  closeButton.setAttribute("aria-label", strings.close);
  header.append(heading, closeButton);
  const body = element("div", "newmodal_content arkona-modal-body");
  dialog.append(header, body);
  backdrop.append(dialog);

  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    onClose?.();
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
    previous?.focus?.();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],[tabindex='0']"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (event) => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop);
  closeButton.focus();
  return { body, close, isOpen: () => open };
}

function status(body: HTMLElement, text: string, busy = false): void {
  body.replaceChildren();
  const row = element("div", "arkona-status");
  if (busy) row.append(element("span", "arkona-spinner"));
  row.append(element("span", "", text));
  body.append(row);
}

function errorMessage(body: HTMLElement, text: string): void {
  body.replaceChildren(element("div", "arkona-error", text));
}

async function copyText(value: string, button: HTMLButtonElement, strings: Copy): Promise<void> {
  await navigator.clipboard.writeText(value);
  const span = button.querySelector("span");
  if (!span) return;
  const label = span.textContent;
  span.textContent = strings.copied;
  window.setTimeout(() => { if (button.isConnected) span.textContent = label; }, 1400);
}

function passwordControl(value: string, strings: Copy): HTMLElement {
  const block = element("div", "arkona-password-block");
  block.append(element("div", "arkona-field-label", strings.password));
  const button = element("button", "arkona-password", "••••••••");
  button.type = "button";
  button.title = strings.revealPassword;
  let visible = false;
  let timer = 0;
  button.addEventListener("click", async () => {
    if (!visible) {
      visible = true;
      button.textContent = value;
      button.title = strings.copy;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        visible = false;
        if (button.isConnected) {
          button.textContent = "••••••••";
          button.title = strings.revealPassword;
        }
      }, 3000);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = strings.copied;
    } catch {
      button.textContent = value;
    }
  });
  block.append(button);
  return block;
}

type SecurityChallenge = { challenge: string; difficulty: number; expires_in: number };
type PreparedDownload = { release_id: number; password?: string | null; challenge: AltchaChallenge };
type DownloadPart = { part?: number; filename?: string; link: string; password?: string; size_bytes?: number };
type DownloadResult = { link?: string; links?: DownloadPart[] };

function validDownloadLink(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "1fichier.com";
  } catch {
    return false;
  }
}

function renderDownloads(body: HTMLElement, result: DownloadResult, prepared: PreparedDownload, release: ArkonaRelease, strings: Copy): void {
  const parts = Array.isArray(result.links) && result.links.length
    ? result.links
    : validDownloadLink(result.link) ? [{ link: result.link, password: prepared.password ?? undefined }] : [];
  const files = parts.filter((part) => validDownloadLink(part.link));
  if (!files.length) throw new Error("invalid_download");
  body.replaceChildren();
  const list = element("div", "arkona-download-list");
  files.forEach((file, index) => {
    const item = element("article", "arkona-download-item");
    const top = element("div", "arkona-download-name");
    top.append(element("strong", "", file.filename || (files.length > 1
      ? interpolate(strings.part, { part: file.part || index + 1, count: files.length })
      : "1fichier")));
    if (file.size_bytes) top.append(element("span", "", formatSize(file.size_bytes)));
    const link = element("div", "arkona-download-link", file.link);
    const actions = element("div", "arkona-download-actions");
    actions.append(externalButton(strings.open, file.link));
    const copyButton = steamButton(strings.copy, () => { void copyText(file.link, copyButton, strings); }, true);
    actions.append(copyButton);
    item.append(top, link, actions);
    const password = file.password || (files.length === 1 ? prepared.password : null);
    if (password) item.append(passwordControl(password, strings));
    else item.append(element("div", "arkona-no-password", strings.noPassword));
    list.append(item);
  });
  body.append(list);
  const guide = externalButton(strings.guide, downloadGuideUrl(release), true);
  if (files.length === 1) {
    list.querySelector(".arkona-download-actions")?.append(guide);
  } else {
    const footer = element("div", "arkona-download-guide");
    footer.append(guide);
    body.append(footer);
  }
}

async function showDownload(release: ArkonaRelease, strings: Copy): Promise<void> {
  const controller = new AbortController();
  const modal = openModal(`${strings.download} — ${release.name}`, strings, false, () => controller.abort());
  status(modal.body, strings.verifying, true);
  try {
    const challenge = parseRpcResponse<SecurityChallenge>(await backend.GetArkonaSecurityChallenge());
    const nonce = await solveSessionProof(challenge.challenge, challenge.difficulty, controller.signal);
    parseRpcResponse(await backend.CreateArkonaSession(challenge.challenge, nonce));
    const prepared = parseRpcResponse<PreparedDownload>(await backend.PrepareArkonaDownload(release.name, release.source));
    status(modal.body, strings.preparing, true);
    const captchaToken = await solveAltcha(prepared.challenge, controller.signal);
    const result = parseRpcResponse<DownloadResult>(await backend.ResolveArkonaDownload(prepared.release_id, captchaToken));
    if (modal.isOpen()) renderDownloads(modal.body, result, prepared, release, strings);
  } catch (error) {
    if (!controller.signal.aborted && modal.isOpen()) {
      const text = error instanceof Error && error.message === "rate_limited" ? strings.rateLimited : strings.downloadError;
      console.error(LOG, "Download flow failed", error);
      errorMessage(modal.body, text);
    }
  }
}

async function showNfo(release: ArkonaRelease, strings: Copy): Promise<void> {
  const controller = new AbortController();
  const modal = openModal(`${strings.nfo} — ${release.name}`, strings, true, () => controller.abort());
  status(modal.body, `${strings.nfo}…`, true);
  try {
    const response = await fetch(nfoJsonUrl(release), { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "nfo_error");
    const data = await response.json() as { nfo?: unknown };
    if (typeof data.nfo !== "string" || !data.nfo.trim()) throw new Error("nfo_error");
    if (!modal.isOpen()) return;
    const toolbar = element("div", "arkona-nfo-toolbar");
    const nfo = data.nfo;
    const copyButton = steamButton(strings.copy, () => { void copyText(nfo, copyButton, strings); }, true);
    toolbar.append(externalButton(`${strings.download} NFO`, nfoUrl(release), true), copyButton);
    const viewer = element("textarea", "arkona-nfo-viewer") as HTMLTextAreaElement;
    viewer.readOnly = true;
    viewer.spellcheck = false;
    viewer.wrap = "off";
    viewer.value = nfo;
    viewer.setAttribute("aria-label", `${strings.nfo} - ${release.name}`);
    modal.body.replaceChildren(toolbar, viewer);
  } catch (error) {
    if (!controller.signal.aborted && modal.isOpen()) {
      const text = error instanceof Error && error.message === "rate_limited" ? strings.rateLimited : strings.nfoError;
      errorMessage(modal.body, text);
    }
  }
}

function releaseRow(release: ArkonaRelease, strings: Copy): HTMLElement {
  const row = element("article", "arkona-release");
  const title = element("a", "arkona-release-name", release.name);
  title.href = external(releaseUrl(release.name));
  title.rel = "noopener noreferrer";
  const meta = element("div", "arkona-release-meta");
  meta.append(
    element("span", "arkona-badge", release.source === "SCENE" ? "Scene" : "P2P"),
    element("span", "arkona-badge", release.category === "full_game" ? strings.fullGame : strings.update),
  );
  if (release.group) meta.append(element("span", "arkona-group", release.group));
  meta.append(element("span", "arkona-size", formatSize(release.size_bytes)));
  const actions = element("div", "arkona-actions");
  actions.append(steamButton(strings.download, () => { void showDownload(release, strings); }));
  if (release.has_nfo) actions.append(steamButton(strings.nfo, () => { void showNfo(release, strings); }, true));
  row.append(title, meta, actions);
  return row;
}

function panel(releases: ArkonaRelease[], strings: Copy, gameSlug?: string): HTMLElement {
  const root = element("section", "game_area_purchase_game arkona-panel");
  root.id = PANEL_ID;
  root.dataset.arkonaPanel = "true";
  const heading = element("div", "arkona-heading");
  heading.append(element("span", "arkona-wordmark", "ARKONA"));
  if (releases.length > 0) heading.append(element("span", "arkona-heading-label", `${strings.available} (${releases.length})`));
  const slug = gameSlug || releases.find((release) => release.game_slug)?.game_slug;
  if (slug) {
    const viewAll = element("a", "arkona-view-all", strings.viewAll);
    viewAll.href = external(`https://arkona.dev/game/${encodeURIComponent(slug)}`);
    viewAll.rel = "noopener noreferrer";
    heading.append(viewAll);
  }
  const list = element("div", "arkona-list");
  for (const release of releases) list.append(releaseRow(release, strings));
  root.append(heading);
  if (releases.length > 0) root.append(list);
  return root;
}

const DUPLICATE_PROVIDER_IDS: Record<string, string> = {
  csrin: "csrin-button",
  pcgamingwiki: "csrin-pcgw-button",
  steamdb: "csrin-steamdb-button",
};

const PROVIDER_ICONS: Record<string, string> = {
  epic: "https://cdn.simpleicons.org/epicgames/white",
  gog: "https://cdn.simpleicons.org/gogdotcom/white",
  igdb: "https://cdn.simpleicons.org/igdb/white",
};

type MillenniumWindow = Window & {
  MILLENNIUM_PLUGIN_SETTINGS_STORE?: Record<string, unknown>;
  PLUGIN_LIST?: Record<string, unknown>;
};

function csrinEnhancedActive(): boolean {
  const client = window as MillenniumWindow;
  return Boolean(
    client.PLUGIN_LIST?.["cs-rin-ru-enhanced"]
    || client.MILLENNIUM_PLUGIN_SETTINGS_STORE?.["cs-rin-ru-enhanced"]
    || document.getElementById("csrin-button"),
  );
}

function iconFor(item: ArkonaGameLink): string {
  if (PROVIDER_ICONS[item.key]) return PROVIDER_ICONS[item.key];
  try {
    const host = new URL(item.url).hostname.toLowerCase().replace(/^www\./, "");
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return "";
  }
}

function directFavicon(item: ArkonaGameLink): string {
  try {
    return `${new URL(item.url).origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function headerLink(item: ArkonaGameLink): HTMLAnchorElement {
  const link = element("a", "btnv6_blue_hoverfade btn_medium arkona-header-link");
  link.href = external(item.url);
  link.rel = "noopener noreferrer";
  link.title = item.label;
  link.dataset.arkonaProvider = item.key;
  link.style.marginRight = "0.28em";
  const content = element("span");
  content.dataset.tooltipText = item.label;
  const icon = element("img", "ico16") as HTMLImageElement;
  icon.src = iconFor(item);
  icon.alt = "";
  icon.style.cssText = "width:22px;height:22px;object-fit:contain;vertical-align:middle;background:none";
  icon.addEventListener("error", () => {
    const fallback = directFavicon(item);
    if (fallback && icon.dataset.fallback !== "direct") {
      icon.dataset.fallback = "direct";
      icon.src = fallback;
      return;
    }
    icon.remove();
    content.textContent = item.label.slice(0, 2).toUpperCase();
    content.classList.add("arkona-icon-fallback");
  });
  content.append(icon);
  link.append(content);
  return link;
}

async function insertHeaderLinks(links: ArkonaGameLink[]): Promise<void> {
  if (!links.length || document.getElementById(HEADER_LINKS_ID)) return;
  let host: Element;
  try {
    const found = await Millennium.findElement(document, ".apphub_OtherSiteInfo", 10_000);
    host = (found?.[0] || found) as Element;
  } catch {
    console.warn(LOG, "Steam store header not found");
    return;
  }
  if (!(host instanceof HTMLElement) || document.getElementById(HEADER_LINKS_ID)) return;

  const enhancedActive = csrinEnhancedActive();
  const priority = new Map([
    ["csrin", 0], ["online_fix", 1], ["steamdb", 2], ["pcgamingwiki", 3],
    ["epic", 4], ["egdata", 5], ["screamdb", 6],
    ["gog", 7], ["gogdb", 8], ["igdb", 9],
  ]);
  const duplicateKeys = enhancedActive ? new Set(Object.keys(DUPLICATE_PROVIDER_IDS)) : new Set<string>();
  const available = links.filter((item) => !duplicateKeys.has(item.key));
  const onlineFix = enhancedActive ? available.find((item) => item.key === "online_fix") : undefined;
  const ordered = available
    .filter((item) => item !== onlineFix)
    .sort((a, b) => (priority.get(a.key) ?? 20) - (priority.get(b.key) ?? 20));
  if (!ordered.length && !onlineFix) return;
  const root = element("span", "arkona-header-links");
  root.id = HEADER_LINKS_ID;
  root.dataset.arkonaExternalLinks = "true";
  const primary = element("span", "arkona-header-primary");
  const overflow = element("span", "arkona-header-overflow");
  overflow.id = `${HEADER_LINKS_ID}-overflow`;
  const toggle = element("a", "btnv6_blue_hoverfade btn_medium arkona-header-more");
  toggle.href = "#";
  toggle.setAttribute("role", "button");
  toggle.title = "More Arkona links";
  toggle.setAttribute("aria-label", "More Arkona links");
  toggle.setAttribute("aria-controls", overflow.id);
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", "false");
  toggle.hidden = true;
  toggle.append(element("span", "", "+"));
  const buttons = ordered.map(headerLink);
  const onlineFixButton = onlineFix ? headerLink(onlineFix) : null;
  if (onlineFixButton) onlineFixButton.id = "arkona-online-fix-button";
  primary.append(...buttons);
  root.append(primary, toggle, overflow);
  if (!ordered.length) root.hidden = true;

  const place = () => {
    const csrin = document.getElementById("csrin-button");
    if (onlineFixButton) {
      if (csrin?.parentElement === host) {
        if (csrin.nextSibling !== onlineFixButton) host.insertBefore(onlineFixButton, csrin.nextSibling);
      } else if (onlineFixButton.parentElement !== host) {
        host.insertBefore(onlineFixButton, host.firstChild);
      }
    }
    const csrinTail = ["csrin-pcgw-button", "csrin-steamdb-button", "csrin-button"]
      .map((id) => document.getElementById(id))
      .find((node) => node?.parentElement === host);
    if (root.hidden) return;
    if (csrinTail) {
      if (csrinTail.nextSibling !== root) host.insertBefore(root, csrinTail.nextSibling);
    } else if (root.parentElement !== host) {
      host.insertBefore(root, host.firstChild);
    }
  };
  place();

  const syncDuplicates = () => {
    for (const button of buttons) {
      const duplicateId = DUPLICATE_PROVIDER_IDS[button.dataset.arkonaProvider || ""];
      const duplicate = Boolean(duplicateId && document.getElementById(duplicateId));
      button.hidden = duplicate;
      button.style.display = duplicate ? "none" : "";
    }
  };
  const layout = () => {
    syncDuplicates();
    overflow.replaceChildren();
    primary.replaceChildren(...buttons);
    toggle.hidden = true;
    root.classList.remove("arkona-expanded");
    toggle.setAttribute("aria-expanded", "false");
    const visible = buttons.filter((button) => !button.hidden);
    if (visible.length <= 2) return;

    const title = document.getElementById("appHubAppName") || document.querySelector<HTMLElement>(".apphub_AppName");
    const hostRect = host.getBoundingClientRect();
    const titleRight = title?.getBoundingClientRect().right ?? hostRect.left;
    const otherWidth = Array.from(host.children)
      .filter((child) => child !== root && child instanceof HTMLElement && !child.hidden)
      .reduce((sum, child) => sum + child.getBoundingClientRect().width + 5, 0);
    const budget = Math.max(120, hostRect.right - titleRight - otherWidth - 12);
    const toggleWidth = 35;
    let used = 0;
    let keep = 0;
    for (const button of visible) {
      const width = button.getBoundingClientRect().width + 5;
      if (keep >= 2 && used + width + toggleWidth > budget) break;
      used += width;
      keep += 1;
    }
    if (keep >= visible.length) return;
    toggle.hidden = false;
    for (const button of visible.slice(keep)) overflow.append(button);
  };
  const setExpanded = (expanded: boolean) => {
    root.classList.toggle("arkona-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
  };
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setExpanded(!root.classList.contains("arkona-expanded"));
  });
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) setExpanded(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !root.classList.contains("arkona-expanded")) return;
    setExpanded(false);
    toggle.focus();
  });
  const observer = new MutationObserver(() => {
    place();
    layout();
  });
  observer.observe(host, { childList: true });
  const resize = new ResizeObserver(() => layout());
  resize.observe(host);
  requestAnimationFrame(layout);
}

function message(text: string): HTMLElement {
  const root = element("section", "game_area_purchase_game arkona-panel arkona-message", text);
  root.id = PANEL_ID;
  return root;
}

function addStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = element("style");
  style.id = STYLE_ID;
  style.textContent = `
#${PANEL_ID}.arkona-panel { background: rgba(0,0,0,.2); border: 0; border-radius: 0; box-sizing: border-box; clear: both; color: #d6d7d8; float: none; margin: 0 0 12px; overflow: hidden; padding: 0; width: 100%; }
.arkona-heading { align-items: center; background: rgba(0,0,0,.16); border-bottom: 1px solid rgba(255,255,255,.08); display: flex; gap: 9px; padding: 11px 12px; }
.arkona-wordmark { color: #67c1f5; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.arkona-heading-label { color: #c7d5e0; font-size: 12px; }
.arkona-header-links { display: inline-block; line-height: normal; position: relative; vertical-align: top; white-space: nowrap; }
.arkona-header-primary { display: inline; }
.arkona-header-link { text-decoration: none; vertical-align: top; }
.arkona-header-link > span { box-sizing: border-box; min-width: 36px; text-align: center; white-space: nowrap; }
.arkona-header-link .ico16 { display: inline-block; margin: 0 !important; max-height: 22px; max-width: 22px; vertical-align: middle; }
.arkona-icon-fallback { color: #fff; font-size: 10px; font-weight: 700; }
.arkona-header-more { cursor: pointer; text-decoration: none; vertical-align: top; }
.arkona-header-more > span { box-sizing: border-box; min-width: 36px; text-align: center; transform: rotate(0deg); transition: transform 160ms cubic-bezier(.23,1,.32,1); }
.arkona-header-overflow { align-items: center; background: rgba(27,40,56,.97); box-shadow: 0 8px 20px rgba(0,0,0,.45); display: inline-flex; opacity: 0; padding: 5px 2px 2px 5px; pointer-events: none; position: absolute; right: 0; top: calc(100% + 3px); transform: translateY(-4px) scale(.97); transform-origin: top right; transition: opacity 180ms cubic-bezier(.23,1,.32,1),transform 180ms cubic-bezier(.23,1,.32,1),visibility 0s linear 180ms; visibility: hidden; white-space: nowrap; z-index: 1000; }
.arkona-header-links.arkona-expanded .arkona-header-more > span { transform: rotate(45deg); }
.arkona-header-links.arkona-expanded .arkona-header-overflow { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); transition-delay: 0s; visibility: visible; }
@media (prefers-reduced-motion: reduce) {
  .arkona-header-more > span { transition: none; }
  .arkona-header-overflow { transform: none; transition: opacity 120ms ease-out,visibility 0s linear 120ms; }
  .arkona-header-links.arkona-expanded .arkona-header-overflow { transform: none; transition-delay: 0s; }
}
.arkona-list { max-height: 420px; overflow-y: auto; }
.arkona-release { align-items: center; border-bottom: 1px solid rgba(255,255,255,.06); column-gap: 16px; display: grid; grid-template-columns: minmax(0,1fr) auto; padding: 11px 12px; }
.arkona-release:last-child { border-bottom: 0; }
.arkona-release-name { color: #fff; display: block; font-size: 12px; font-weight: 600; grid-column: 1; line-height: 1.35; overflow-wrap: anywhere; text-decoration: none; }
.arkona-release-name:hover,.arkona-view-all:hover { color: #fff; }
.arkona-release-meta { align-items: center; display: flex; flex-wrap: wrap; gap: 5px; grid-column: 1; margin-top: 6px; }
.arkona-badge { background: rgba(103,193,245,.12); color: #8ed1f7; font-size: 9px; padding: 2px 5px; text-transform: uppercase; }
.arkona-group,.arkona-size { color: #8f98a0; font-size: 10px; }
.arkona-size { margin-left: auto; }
.arkona-actions { display: flex; gap: 6px; grid-column: 2; grid-row: 1 / span 2; }
.arkona-steam-button { border: 0; cursor: pointer; margin: 0; min-width: 88px; padding: 0; text-align: center; }
.arkona-steam-button > span { box-sizing: border-box; display: block; min-height: 30px; padding: 7px 12px; }
.arkona-view-all { border: 1px solid rgba(103,193,245,.28); color: #67c1f5; flex: none; font-size: 10px; margin-left: auto; padding: 5px 9px; text-decoration: none; transition: background-color 140ms ease,border-color 140ms ease,color 140ms ease; }
.arkona-view-all:hover { background: rgba(103,193,245,.12); border-color: rgba(103,193,245,.55); color: #fff; }
.arkona-message { color: #8f98a0; font-size: 11px; padding: 12px !important; }
.arkona-modal-backdrop { align-items: center; background: rgba(0,0,0,.72); display: flex; inset: 0; justify-content: center; position: fixed; z-index: 2147483000; }
.arkona-modal { background: linear-gradient(135deg,#2a475e 0%,#1b2838 58%,#16202d 100%); border: 1px solid #000; box-shadow: 0 0 0 1px rgba(255,255,255,.08),0 18px 60px rgba(0,0,0,.8); color: #d6d7d8; max-height: min(760px,90vh); max-width: min(600px,92vw); min-width: min(520px,92vw); overflow: hidden; padding: 0; position: relative; width: 100%; }
.arkona-modal-wide { max-width: min(980px,94vw); }
.arkona-modal-header { align-items: center; background: rgba(0,0,0,.22); border-bottom: 1px solid rgba(255,255,255,.08); display: flex; min-height: 52px; padding: 0 52px 0 20px; position: relative; }
.arkona-modal-title { color: #fff; font-size: 16px; font-weight: 400; line-height: 1.35; margin: 0; overflow-wrap: anywhere; }
.arkona-modal-close { background: transparent; border: 0; color: #8f98a0; cursor: pointer; font-size: 27px; height: 44px; line-height: 1; position: absolute; right: 6px; top: 4px; width: 44px; }
.arkona-modal-close:hover { color: #fff; }
.arkona-modal-body { box-sizing: border-box; max-height: calc(min(760px,90vh) - 52px); overflow: auto; padding: 18px 20px 20px; }
.arkona-status { align-items: center; color: #c7d5e0; display: flex; gap: 12px; min-height: 88px; justify-content: center; }
.arkona-spinner { animation: arkona-spin .8s linear infinite; border: 2px solid rgba(103,193,245,.25); border-radius: 50%; border-top-color: #67c1f5; height: 18px; width: 18px; }
.arkona-error { background: rgba(163,53,37,.25); border-left: 3px solid #d94126; color: #f4c6bf; padding: 13px 14px; }
.arkona-download-list { display: grid; gap: 12px; }
.arkona-download-item { background: rgba(0,0,0,.2); border: 1px solid rgba(255,255,255,.07); padding: 14px; }
.arkona-download-name { align-items: baseline; color: #fff; display: flex; font-size: 12px; gap: 12px; justify-content: space-between; overflow-wrap: anywhere; }
.arkona-download-name span { color: #8f98a0; flex: none; font-size: 10px; }
.arkona-download-link { background: rgba(0,0,0,.2); color: #8f98a0; font-family: Consolas,'Courier New',monospace; font-size: 10px; margin-top: 10px; overflow: hidden; padding: 8px; text-overflow: ellipsis; white-space: nowrap; }
.arkona-download-actions { display: flex; gap: 7px; margin-top: 10px; }
.arkona-download-guide { display: flex; justify-content: flex-end; margin-top: 12px; }
.arkona-field-label { color: #8f98a0; font-size: 10px; margin: 12px 0 5px; text-transform: uppercase; }
.arkona-password { background: rgba(0,0,0,.24); border: 1px solid rgba(255,255,255,.1); color: #c7d5e0; cursor: pointer; font-family: Consolas,'Courier New',monospace; min-height: 34px; overflow-wrap: anywhere; padding: 7px 9px; text-align: left; width: 100%; }
.arkona-password:hover { border-color: rgba(103,193,245,.5); color: #fff; }
.arkona-no-password { color: #8f98a0; font-size: 10px; margin-top: 11px; }
.arkona-nfo-toolbar { display: flex; gap: 7px; justify-content: flex-end; margin-bottom: 10px; }
.arkona-nfo-viewer { background: #07090b; border: 1px solid #000; box-sizing: border-box; color: #c7d5e0; contain: strict; display: block; font-family: 'Lucida Console','Courier New',monospace; font-size: 12px; height: min(620px, calc(90vh - 150px)); letter-spacing: 0; line-height: 14px; margin: 0; min-height: 360px; overflow: auto; overscroll-behavior: contain; padding: 16px; resize: none; tab-size: 8; white-space: pre; width: 100%; }
@keyframes arkona-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .arkona-spinner { animation-duration: 1.6s; } }
@media (max-width:700px) { .arkona-heading { flex-wrap:wrap; }.arkona-view-all { margin-left:0; }.arkona-release { display:block; }.arkona-actions { margin-top:8px; }.arkona-steam-button { flex:1; }.arkona-modal { min-width:92vw; }.arkona-download-actions { flex-wrap:wrap; } }
`;
  document.head.append(style);
}

function insert(node: HTMLElement): boolean {
  const purchase = document.querySelector("#game_area_purchase");
  if (!purchase?.parentElement) return false;
  purchase.parentElement.insertBefore(node, purchase);
  return true;
}

async function render(appId: number): Promise<void> {
  addStyles();
  try { await Millennium.findElement(document, "#game_area_purchase", 30_000); }
  catch { console.warn(LOG, "Steam purchase area not found"); return; }
  if (document.getElementById(PANEL_ID)) return;
  const strings = copy();
  try {
    const identifierRequest = fetch(`https://arkona.dev/api/v1/identifiers/steam/${appId}`, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "api_error");
        return parseIdentifierResponse(await response.text(), appId);
      })
      .catch((error) => {
        console.warn(LOG, "Game links lookup failed", error);
        return [];
      });
    let releases: ArkonaRelease[];
    try {
      const response = await fetch(`https://arkona.dev/api/v1/releases?q=steam%3A${appId}&limit=100`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "api_error");
      releases = parsePublicApiResponse(await response.text());
    } catch (directError) {
      console.warn(LOG, "Direct API lookup failed, using the Millennium backend", directError);
      releases = parseBackendResponse(await backend.FetchArkonaReleases(appId));
    }
    const games = await identifierRequest;
    const links = [...new Map(games.flatMap((game) => game.links).map((link) => [link.url, link])).values()];
    await insertHeaderLinks(links);
    if (releases.length > 0) insert(panel(releases, strings, games[0]?.slug));
  } catch (error) {
    console.error(LOG, error);
    insert(message(error instanceof Error && error.message === "rate_limited" ? strings.rateLimited : strings.error));
  }
}

export default async function main(): Promise<void> {
  const match = window.location.href.match(STORE_APP);
  if (!match) return;
  const appId = Number(match[1]);
  if (Number.isSafeInteger(appId) && appId > 0) await render(appId);
}
