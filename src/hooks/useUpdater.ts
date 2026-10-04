import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus = "idle" | "checking" | "available" | "downloading";

export interface UpdaterState {
  status: UpdaterStatus;
  version: string | null;
  currentVersion: string | null;
  progress: number | null;
  dialogOpen: boolean;
}

export type CheckResult = "available" | "upToDate" | "error" | "busy";

const DISMISSED_KEY = "sailock.update.dismissedVersion";

let state: UpdaterState = {
  status: "idle",
  version: null,
  currentVersion: null,
  progress: null,
  dialogOpen: false,
};
let pendingUpdate: Update | null = null;
let automaticCheckDone = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
  }
}

export async function checkForUpdates(options: { manual: boolean }): Promise<CheckResult> {
  if (state.status === "checking" || state.status === "downloading") return "busy";

  if (state.status === "available" && options.manual) {
    setState({ dialogOpen: true });
    return "available";
  }

  setState({ status: "checking" });
  try {
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      setState({ status: "idle", version: null, currentVersion: null, progress: null });
      return "upToDate";
    }
    pendingUpdate = update;
    const alreadyDismissed = !options.manual && readDismissedVersion() === update.version;
    setState({
      status: "available",
      version: update.version,
      currentVersion: update.currentVersion,
      progress: null,
      dialogOpen: !alreadyDismissed,
    });
    return "available";
  } catch (error) {
    console.error("[updater] check failed:", error);
    pendingUpdate = null;
    setState({ status: "idle", version: null, currentVersion: null, progress: null });
    return "error";
  }
}

export async function runAutomaticCheckOnce(): Promise<void> {
  if (automaticCheckDone) return;
  automaticCheckDone = true;
  await checkForUpdates({ manual: false });
}

export async function installUpdate(): Promise<boolean> {
  if (!pendingUpdate) return false;

  setState({ status: "downloading", progress: 0 });
  let totalBytes = 0;
  let downloadedBytes = 0;

  try {
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          setState({ progress: Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) });
        }
      } else if (event.event === "Finished") {
        setState({ progress: 100 });
      }
    });
  } catch (error) {
    console.error("[updater] install failed:", error);
    setState({ status: "available", progress: null });
    return false;
  }

  try {
    await relaunch();
  } catch {
  }
  return true;
}

export function dismissUpdate() {
  if (state.version) writeDismissedVersion(state.version);
  setState({ dialogOpen: false });
}

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}