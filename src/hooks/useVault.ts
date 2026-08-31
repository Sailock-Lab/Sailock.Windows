import { invoke } from "@tauri-apps/api/core";

export interface BackupBatch {
  title: string;
  codes: string[];
  alphabet: string;
  length: number;
  count: number;
  hasSeparator: boolean;
}

export function useVault() {
  const saveBackupBatch = async (batch: BackupBatch) => {
    try {
      await invoke("save_backup_batch", {
        title: batch.title,
        codes: batch.codes,
        alphabet: batch.alphabet,
        length: batch.length,
        count: batch.count,
        hasSeparator: batch.hasSeparator,
      });
      return { success: true, error: null };
    } catch (error) {
      console.error("Error saving backup batch:", error);
      return { success: false, error: String(error) };
    }
  };

  return { saveBackupBatch };
}