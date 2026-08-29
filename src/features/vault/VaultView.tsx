import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, KeyRound } from "lucide-react";

interface Entry {
  id: string;
  name: string;
  folder?: string | null;
  username?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
}

export function VaultView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Vault</h2>
      <p className="text-sm text-muted-foreground mb-6">Todos tus registros, organizados y seguros.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Todos los elementos</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Nuevo
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Aún no tienes ningún registro.</p>
            )}
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  setSelectedId(entry.id);
                  setCreating(false);
                }}
                className={`flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${
                  selectedId === entry.id ? "bg-muted" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{entry.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.username || entry.folder || "—"}
                  </p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div>
          {creating ? (
            <NewEntryForm
              onSaved={() => {
                setCreating(false);
                loadEntries();
              }}
              onCancel={() => setCreating(false)}
            />
          ) : selected ? (
            <EntryDetail entry={selected} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Selecciona un elemento o crea uno nuevo.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NewEntryForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!name) return;
    await invoke("save_entry", {
      name,
      folder: null,
      username: username || null,
      password: password || null,
      website: website || null,
      notes: notes || null,
    });
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo elemento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Nombre (ej: Gmail)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Usuario o email" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input
          placeholder="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input placeholder="Sitio web" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <textarea
          placeholder="Notas"
          className="border rounded p-2 bg-transparent text-sm min-h-20"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={handleSave}>Guardar</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryDetail({ entry }: { entry: Entry }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{entry.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {entry.username && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Usuario o email</p>
            <p>{entry.username}</p>
          </div>
        )}
        {entry.password && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Contraseña</p>
            <div className="flex items-center gap-2">
              <p className="font-mono">{showPassword ? entry.password : "•".repeat(10)}</p>
              <Button variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </Button>
            </div>
          </div>
        )}
        {entry.website && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Sitio web</p>
            <p className="text-primary">{entry.website}</p>
          </div>
        )}
        {entry.notes && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Notas</p>
            <p>{entry.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}