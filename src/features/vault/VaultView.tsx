import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

interface Entry {
  id: string;
  name: string;
  password?: string | null;
}

export function VaultView() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleSave = async () => {
    if (!name || !password) return;
    await invoke("save_entry", {
      name,
      folder: null,
      username: null,
      password,
      website: null,
      notes: null,
    });
    setName("");
    setPassword("");
    loadEntries();
  };

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <h2 className="text-2xl font-bold">Vault</h2>
      <input
        className="border rounded p-2 bg-transparent"
        placeholder="Nombre (ej: Gmail)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="border rounded p-2 bg-transparent"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button onClick={handleSave}>Guardar</Button>
      <ul className="mt-4 space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="border rounded p-2">
            <strong>{entry.name}</strong>: {entry.password}
          </li>
        ))}
      </ul>
    </div>
  );
}