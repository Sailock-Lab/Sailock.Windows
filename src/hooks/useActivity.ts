import { invoke } from "@tauri-apps/api/core";

export type ActivityType = "login" | "logout" | "create" | "edit" | "delete" | "restore" | "generate" | "download";
export type ActivitySource = "vault" | "generator" | "settings" | "system";

export interface ActivityEntry {
  id: string;
  activity_type: ActivityType;
  description?: string;
  event_key?: string;
  params?: Record<string, string>;
  source: ActivitySource;
  details?: string;
  timestamp: number;
}

export function useActivity() {
  const saveActivity = async (
    activityType: ActivityType,
    eventKey: string,
    source: ActivitySource,
    params?: Record<string, string>
  ) => {
    try {
      await invoke("save_activity", {
        activityType,
        eventKey,
        source,
        params: params || null,
      });
    } catch (error) {
      console.error("Error saving activity:", error);
    }
  };

  const loadActivities = async (): Promise<ActivityEntry[]> => {
    try {
      return await invoke<ActivityEntry[]>("load_activities");
    } catch (error) {
      console.error("Error loading activities:", error);
      return [];
    }
  };

  const clearActivities = async (): Promise<boolean> => {
    try {
      await invoke("clear_activities");
      return true;
    } catch (error) {
      console.error("Error clearing activities:", error);
      return false;
    }
  };

  return { saveActivity, loadActivities, clearActivities };
}