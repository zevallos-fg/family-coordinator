"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Android/Chrome fires `beforeinstallprompt` when the app is installable.
 * iOS Safari never fires it — there, Add to Home Screen is a manual menu action,
 * so this button simply never appears rather than showing instructions nobody
 * can act on from inside the page.
 *
 * Rendering nothing until the event arrives also means this is self-verifying:
 * if the button never shows on Android, the manifest is not passing Chrome's
 * install criteria and that is worth knowing.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
      className="rounded-full border border-amber-700 px-3 py-1 text-xs text-amber-700"
    >
      Install
    </button>
  );
}
