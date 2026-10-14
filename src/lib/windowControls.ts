import { invoke } from "@tauri-apps/api/core";

const ZOOM_KEY = "sailock.zoom";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getStoredZoom(): number {
  try {
    const raw = Number(localStorage.getItem(ZOOM_KEY));
    if (Number.isFinite(raw) && raw >= ZOOM_MIN && raw <= ZOOM_MAX) return round(raw);
  } catch {
  }
  return 1;
}

async function applyZoom(factor: number): Promise<number> {
  const next = round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor)));
  await invoke("window_set_zoom", { factor: next });
  try {
    if (next === 1) localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, String(next));
  } catch {
  }
  return next;
}

export async function restoreZoom(): Promise<void> {
  const zoom = getStoredZoom();
  if (zoom !== 1) await invoke("window_set_zoom", { factor: zoom }).catch(() => {});
}

export const zoomIn = () => applyZoom(getStoredZoom() + ZOOM_STEP);
export const zoomOut = () => applyZoom(getStoredZoom() - ZOOM_STEP);
export const zoomReset = () => applyZoom(1);

export const toggleFullscreen = () => invoke<boolean>("window_toggle_fullscreen");
export const minimizeWindow = () => invoke<void>("window_minimize");
export const quitApp = () => invoke<void>("quit_app");

let alwaysOnTop = false;
export async function toggleAlwaysOnTop(): Promise<boolean> {
  const next = !alwaysOnTop;
  await invoke("window_set_always_on_top", { enabled: next });
  alwaysOnTop = next;
  return next;
}
