"use client";

import { useEffect, useMemo, useState } from "react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const SNOOZE_KEY = "vdc_pwa_install_snooze_until";
const DISMISS_KEY = "vdc_pwa_install_never";
const SNOOZE_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const nav = navigator as NavigatorWithStandalone;
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function detectPlatform() {
  const ua = navigator.userAgent;
  const iPadLike = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadLike) return "ios" as const;
  if (/Android/i.test(ua)) return "android" as const;
  return "desktop" as const;
}

function canShowPrompt() {
  if (typeof window === "undefined") return false;
  if (isStandalone()) return false;
  if (localStorage.getItem(DISMISS_KEY) === "1") return false;

  const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) ?? "0");
  return !Number.isFinite(snoozeUntil) || snoozeUntil <= Date.now();
}

export function PwaInstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation remains usable where the browser does not require a service worker.
      });
    }

    const detected = detectPlatform();
    setPlatform(detected);

    if (detected === "ios" && canShowPrompt()) {
      const timer = window.setTimeout(() => setVisible(true), 900);
      return () => window.clearTimeout(timer);
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      setPromptEvent(installEvent);
      if (canShowPrompt()) setVisible(true);
    }

    function onInstalled() {
      localStorage.removeItem(SNOOZE_KEY);
      localStorage.setItem(DISMISS_KEY, "1");
      setVisible(false);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const copy = useMemo(() => {
    if (platform === "ios") {
      return {
        eyebrow: "iPhone / iPad",
        title: "VDC Club als App installieren",
        description: "Lege VDC Club auf deinen Home-Bildschirm und öffne die Vereinszentrale künftig wie eine normale App.",
      };
    }

    if (platform === "android") {
      return {
        eyebrow: "Android",
        title: "VDC Club als App installieren",
        description: "Installiere VDC Club auf deinem Smartphone für schnellen Zugriff ohne den normalen Browserweg.",
      };
    }

    return {
      eyebrow: "App installieren",
      title: "VDC Club auf diesem Gerät installieren",
      description: "Öffne VDC Club künftig direkt aus deinen Apps und nutze die Vereinszentrale im eigenen Fenster.",
    };
  }, [platform]);

  function snooze() {
    localStorage.setItem(
      SNOOZE_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
    );
    setVisible(false);
  }

  function neverShow() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (platform === "ios") {
      setShowIosHelp(true);
      return;
    }

    if (!promptEvent) return;

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    if (choice.outcome === "accepted") {
      localStorage.setItem(DISMISS_KEY, "1");
      setVisible(false);
    } else {
      localStorage.setItem(
        SNOOZE_KEY,
        String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
      );
      setVisible(false);
    }

    setPromptEvent(null);
  }

  if (!visible || isStandalone()) return null;

  const canInstall = platform === "ios" || Boolean(promptEvent);

  return (
    <aside className="pwa-install-prompt" role="dialog" aria-modal="false" aria-label="VDC Club installieren">
      <div className="pwa-install-icon" aria-hidden="true">
        <span>VDC</span>
      </div>

      <div className="pwa-install-content">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>

        {platform === "ios" && showIosHelp && (
          <div className="pwa-ios-steps">
            <div><b>1</b><span>In Safari unten auf <strong>Teilen</strong> tippen.</span></div>
            <div><b>2</b><span><strong>Zum Home-Bildschirm</strong> auswählen.</span></div>
            <div><b>3</b><span>Oben rechts mit <strong>Hinzufügen</strong> bestätigen.</span></div>
          </div>
        )}

        <div className="pwa-install-actions">
          <button
            type="button"
            className="primary-button"
            onClick={platform === "ios" && showIosHelp ? snooze : install}
            disabled={!canInstall}
          >
            {platform === "ios"
              ? showIosHelp ? "Verstanden" : "So installierst du die App"
              : "App installieren"}
          </button>
          <button type="button" className="ghost-button" onClick={snooze}>
            Später
          </button>
        </div>

        <button type="button" className="pwa-install-never" onClick={neverShow}>
          Nicht mehr anzeigen
        </button>
      </div>

      <button type="button" className="pwa-install-close" onClick={snooze} aria-label="Schließen">
        ×
      </button>
    </aside>
  );
}
