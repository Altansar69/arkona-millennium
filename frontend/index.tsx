import {
  definePlugin,
  Field,
  findModuleExport,
  Navigation,
  routerHook,
} from "millennium";
import { useContext, useEffect, type Context } from "react";
import { ArkonaLibraryPage } from "./library";

const ROUTE = "/arkona";
const GLOBAL_COMPONENT = "arkona-library-navigation";
const NAV_ATTRIBUTE = "data-arkona-navigation";
const NAV_STYLE_ID = "arkona-navigation-style";

type SuperNavClasses = {
  SuperNav: string;
  SuperNavMenu: string;
  MenuButton: string;
  Selected?: string;
};

type OwnerWindowContextValue = {
  ownerWindow: Window;
};

const superNavClasses = findModuleExport(
  (candidate: unknown): candidate is SuperNavClasses => {
    if (!candidate || typeof candidate !== "object") return false;
    const value = candidate as Partial<SuperNavClasses>;
    return typeof value.SuperNav === "string" && typeof value.SuperNavMenu === "string" && typeof value.MenuButton === "string";
  },
);

const ownerWindowContext = findModuleExport(
  (candidate: unknown): candidate is Context<OwnerWindowContextValue> => {
    if (!candidate || typeof candidate !== "object") return false;
    const context = candidate as {
      Provider?: unknown;
      Consumer?: unknown;
      _currentValue?: Partial<OwnerWindowContextValue>;
    };
    return Boolean(context.Provider && context.Consumer && context._currentValue?.ownerWindow);
  },
);

let mountedSteamDocument: Document | null = null;
let mountedSteamWindow: Window | null = null;
let navigationObserver: MutationObserver | null = null;
let navigationInterval: number | null = null;
let navigationActive = false;
let observedNavigation: Element | null = null;

function installNavigationStyles(steamDocument: Document): void {
  if (steamDocument.getElementById(NAV_STYLE_ID)) return;
  const style = steamDocument.createElement("style");
  style.id = NAV_STYLE_ID;
  style.textContent = `[${NAV_ATTRIBUTE}] [data-arkona-navigation-label]{position:relative}[${NAV_ATTRIBUTE}][data-active="true"] [data-arkona-navigation-label]{color:#1a9fff!important}[${NAV_ATTRIBUTE}][data-active="true"] [data-arkona-navigation-label]::after{content:"";position:absolute;right:0;bottom:-3px;left:0;height:2px;background:#1a9fff}`;
  steamDocument.head.append(style);
}

function setNavigationActive(active: boolean): void {
  navigationActive = active;
  mountedSteamDocument?.querySelector<HTMLElement>(`[${NAV_ATTRIBUTE}]`)?.setAttribute("data-active", active ? "true" : "false");
}

function installNavigationButton(steamDocument: Document): Element | null {
  installNavigationStyles(steamDocument);
  let navigation = superNavClasses?.SuperNav
    ? steamDocument.querySelector(`.${superNavClasses.SuperNav}`)
    : null;
  if (!navigation) {
    const storeLabel = Array.from(steamDocument.querySelectorAll("*"))
      .find((element) => element.childElementCount === 0 && /^(store|magasin)$/i.test(element.textContent?.trim() || ""));
    navigation = storeLabel?.parentElement?.parentElement || null;
  }
  if (!navigation) return null;

  let storeItem = Array.from(navigation.children)
    .find((child) => /^(store|magasin)(\s|$)/i.test(child.textContent?.trim() || "")) || null;
  if (!storeItem && navigation.children.length >= 3) storeItem = navigation.children.item(2);
  if (!storeItem) return navigation;

  if (!navigation.hasAttribute("data-arkona-navigation-reset-bound")) {
    navigation.addEventListener("click", (event) => {
      const target = event.target as { closest?: (selector: string) => Element | null } | null;
      if (!target?.closest?.(`[${NAV_ATTRIBUTE}]`)) setNavigationActive(false);
    }, true);
    navigation.setAttribute("data-arkona-navigation-reset-bound", "true");
  }

  const existingButtons = Array.from(steamDocument.querySelectorAll<HTMLElement>(`[${NAV_ATTRIBUTE}]`));
  const item = existingButtons.shift() || steamDocument.createElement("div");
  existingButtons.forEach((duplicate) => duplicate.remove());
  item.className = superNavClasses?.SuperNavMenu || storeItem.className || "";
  item.removeAttribute("style");
  item.setAttribute(NAV_ATTRIBUTE, "true");
  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.removeAttribute("aria-label");
  item.removeAttribute("title");
  item.setAttribute("data-active", navigationActive ? "true" : "false");

  let label = item.querySelector<HTMLElement>("[data-arkona-navigation-label]");
  if (!label) {
    item.replaceChildren();
    label = steamDocument.createElement("div");
    label.setAttribute("data-arkona-navigation-label", "true");
    item.append(label);
  }
  const menuButtonClass = superNavClasses?.MenuButton || storeItem.firstElementChild?.className || "";
  label.className = menuButtonClass;
  label.removeAttribute("style");
  label.removeAttribute("aria-label");
  label.removeAttribute("title");
  if (label.textContent !== "ARKONA") label.textContent = "ARKONA";

  if (!item.hasAttribute("data-arkona-navigation-bound")) {
    const open = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      setNavigationActive(true);
      Navigation.Navigate(ROUTE);
    };
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") open(event);
    });
    item.setAttribute("data-arkona-navigation-bound", "true");
  }

  if (item.parentElement !== navigation || item.nextElementSibling) navigation.append(item);
  return navigation;
}

function syncNavigation(): void {
  if (!mountedSteamDocument || !mountedSteamWindow) return;
  const navigation = installNavigationButton(mountedSteamDocument);
  if (!navigation || navigation === observedNavigation) return;
  navigationObserver?.disconnect();
  observedNavigation = navigation;
  navigationObserver = new mountedSteamWindow.MutationObserver(syncNavigation);
  navigationObserver.observe(navigation, { childList: true });
}

function stopNavigationPersistence(removeButton: boolean): void {
  navigationObserver?.disconnect();
  navigationObserver = null;
  observedNavigation = null;
  if (navigationInterval !== null && mountedSteamWindow) {
    mountedSteamWindow.clearInterval(navigationInterval);
  }
  navigationInterval = null;
  if (removeButton) {
    mountedSteamDocument?.querySelector(`[${NAV_ATTRIBUTE}]`)?.remove();
    mountedSteamDocument?.getElementById(NAV_STYLE_ID)?.remove();
  }
  mountedSteamDocument = null;
  mountedSteamWindow = null;
}

function startNavigationPersistence(ownerWindow: Window): void {
  if (mountedSteamDocument === ownerWindow.document && navigationObserver) {
    installNavigationButton(ownerWindow.document);
    return;
  }

  stopNavigationPersistence(true);
  mountedSteamWindow = ownerWindow;
  mountedSteamDocument = ownerWindow.document;
  navigationActive = ownerWindow.location.pathname.startsWith(ROUTE);
  syncNavigation();
  navigationInterval = ownerWindow.setInterval(syncNavigation, 1000);
}

function ArkonaNavigationMount() {
  const ownerWindow = useContext(ownerWindowContext).ownerWindow;
  useEffect(() => {
    startNavigationPersistence(ownerWindow);
  }, [ownerWindow]);
  return null;
}

function ArkonaRoute() {
  useEffect(() => {
    setNavigationActive(true);
    return () => setNavigationActive(false);
  }, []);
  return <ArkonaLibraryPage />;
}

const SiteLink = () => (
  <a
    href="steam://openurl_external/https://arkona.dev"
    style={{ color: "#67c1f5", textDecoration: "none" }}
  >
    arkona.dev
  </a>
);

const SettingsContent = () => (
  <div style={{ width: "100%", minWidth: 0 }}>
    <Field
      label="Arkona Releases"
      description="Displays releases associated with the current Steam AppID. Downloads and NFOs open inside Steam; protected links are only requested after Arkona verification."
      bottomSeparator="standard"
    >
      <SiteLink />
    </Field>
    <Field
      label="Refresh interval"
      description="Results are cached locally for five minutes to respect the public API rate limit."
      bottomSeparator="standard"
    />
  </div>
);

const Icon = () => (
  <div
    style={{
      alignItems: "center",
      background: "#67c1f5",
      borderRadius: "3px",
      color: "#0b1825",
      display: "flex",
      fontSize: "11px",
      fontWeight: 800,
      height: "16px",
      justifyContent: "center",
      width: "16px",
    }}
  >
    A
  </div>
);

export default definePlugin(async () => {
  routerHook.addRoute(ROUTE, ArkonaRoute);
  routerHook.addGlobalComponent(GLOBAL_COMPONENT, ArkonaNavigationMount);
  return {
    title: "Arkona Releases",
    icon: <Icon />,
    content: <SettingsContent />,
    onDismount() {
      routerHook.removeGlobalComponent(GLOBAL_COMPONENT);
      routerHook.removeRoute(ROUTE);
      stopNavigationPersistence(true);
    },
  };
});
