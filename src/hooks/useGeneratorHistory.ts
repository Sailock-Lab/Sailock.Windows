import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface GeneratorHistoryEntry {
  id: string;
  generator_type: string;
  value: string;
  created_at: number;
}

export function useGeneratorHistory(generatorType: string) {
  const [history, setHistory] = useState<GeneratorHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const all = await invoke<GeneratorHistoryEntry[]>("get_generator_history");
      setHistory(
        all
          .filter((e) => e.generator_type === generatorType)
          .sort((a, b) => b.created_at - a.created_at)
      );
    } catch (error) {
      console.error("Error loading generator history:", error);
      setHistory([]);
    }
  }, [generatorType]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEntry = useCallback(
    async (value: string) => {
      try {
        await invoke("add_generator_history_entry", { generatorType, value });
        refresh();
      } catch (error) {
        console.error("Error saving generator history:", error);
      }
    },
    [generatorType, refresh]
  );

  return { history, addEntry, refresh };
}