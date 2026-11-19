// Installing the app (task 0104). Chrome (Android and desktop) and Edge tell a page it may offer the install by firing `beforeinstallprompt` ONCE, soon after the page loads; the page
// must keep that event and call its `prompt()` when the person asks. Safari on an iPhone or iPad never fires it: there the person uses Share, then Add to Home Screen, and the page can only say so.
// This module listens from the moment its code loads (the always-present ServiceWorkerRegister imports it, so no page misses the event) and keeps the one event for `InstallApp`.

/// What the install button should be, for the moment: running installed already, a browser prompt we can call, an Apple device that must be told how, or nothing to offer.
export type InstallState = "installed" | "ready" | "apple" | "none";

type SavedPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/// An iPhone, an iPod or an iPad. Since iPadOS 13 an iPad says it is a Mac ("MacIntel") in its user agent, but only an iPad has a touch screen among them.
export function isAppleTouch(userAgent: string, platform: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && touchPoints > 1);
}

/// The rule, apart from the browser: installed beats everything (nothing to offer), then a saved prompt, then the Apple how-to, else nothing.
export function installStateOf(facts: { running: boolean; installed: boolean; hasPrompt: boolean; apple: boolean }): InstallState {
  if (facts.running || facts.installed) return "installed";
  if (facts.hasPrompt) return "ready";
  return facts.apple ? "apple" : "none";
}

let saved: SavedPrompt | null = null;
let installedHere = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own button instead of the browser's mini bar
    saved = event as SavedPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    installedHere = true;
    emit();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/// The state now. Read from the browser each time (cheap), so a page opened from the home screen is told "installed" at once.
export function installState(): InstallState {
  const running =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return installStateOf({
    running,
    installed: installedHere,
    hasPrompt: saved !== null,
    apple: isAppleTouch(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
  });
}

export const serverInstallState = (): InstallState => "none";

/// Shows the browser's own install question. A saved prompt can be used once, so it is dropped first; Chrome fires a new event later if the person said no.
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = saved;
  if (!event) return "unavailable";
  saved = null;
  emit();
  await event.prompt();
  return (await event.userChoice).outcome;
}
