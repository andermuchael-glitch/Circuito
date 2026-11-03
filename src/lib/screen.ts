type ScreenBridge = { stayOn: (on: boolean) => void };

function bridge() {
  return (window as Window & { Circuito?: ScreenBridge }).Circuito;
}

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export async function holdScreen() {
  wanted = true;
  bridge()?.stayOn(true);
  if (sentinel || !("wakeLock" in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
      if (wanted && document.visibilityState === "visible") void holdScreen();
    });
  } catch {
    sentinel = null;
  }
}

export async function releaseScreen() {
  wanted = false;
  bridge()?.stayOn(false);
  const current = sentinel;
  sentinel = null;
  try {
    await current?.release();
  } catch {
    /* already released */
  }
}
