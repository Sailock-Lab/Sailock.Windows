import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, KeyRound, X, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

interface CustomFieldData {
  label: string;
  value: string;
}

interface Entry {
  id: string;
  name: string;
  folder?: string | null;
  username?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
  custom_fields?: CustomFieldData[];
}

type FormMode = "create" | "edit" | null;

export function VaultView() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este elemento? No se puede deshacer.")) return;
    await invoke("delete_entry", { id });
    setSelectedId(null);
    setFormMode(null);
    loadEntries();
  };

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
                setFormMode("create");
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
                  setFormMode(null);
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
          {formMode === "create" && (
            <EntryForm onSaved={() => { setFormMode(null); loadEntries(); }} onCancel={() => setFormMode(null)} />
          )}
          {formMode === "edit" && selected && (
            <EntryForm
              initial={selected}
              onSaved={() => { setFormMode(null); loadEntries(); }}
              onCancel={() => setFormMode(null)}
            />
          )}
          {formMode === null && selected && (
            <EntryDetail
              entry={selected}
              onEdit={() => setFormMode("edit")}
              onDelete={() => handleDelete(selected.id)}
            />
          )}
          {formMode === null && !selected && (
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

function EntryForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Entry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [customFields, setCustomFields] = useState<CustomFieldData[]>(initial?.custom_fields ?? []);

  const addCustomField = () => setCustomFields([...customFields, { label: "", value: "" }]);
  const updateCustomField = (index: number, key: "label" | "value", val: string) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, [key]: val } : f)));
  };
  const removeCustomField = (index: number) => setCustomFields(customFields.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!name) return;
    const payload = {
      name,
      folder: initial?.folder ?? null,
      username: username || null,
      password: password || null,
      website: website || null,
      notes: notes || null,
      customFields: customFields.filter((f) => f.label.trim() !== ""),
    };
    if (initial) {
      await invoke("update_entry", { id: initial.id, ...payload });
    } else {
      await invoke("save_entry", payload);
    }
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Editar elemento" : "Nuevo elemento"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Nombre</label>
          <Input placeholder="ej: Gmail" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Usuario o email</label>
          <Input placeholder="Opcional" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Contraseña</label>
          <div className="relative">
            <Input
              placeholder="Opcional"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Sitio web</label>
          <Input placeholder="Opcional" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1">Notas</label>
          <textarea
            placeholder="Opcional"
            className="border rounded p-2 bg-transparent text-sm min-h-20 w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Campos personalizados</label>
            <Button variant="ghost" size="sm" onClick={addCustomField}>
              <Plus className="h-4 w-4 mr-1" /> Añadir campo
            </Button>
          </div>
          {customFields.map((field, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Nombre (ej: Código de recuperación)"
                value={field.label}
                onChange={(e) => updateCustomField(i, "label", e.target.value)}
              />
              <Input placeholder="Valor" value={field.value} onChange={(e) => updateCustomField(i, "value", e.target.value)} />
              <Button variant="ghost" size="icon" onClick={() => removeCustomField(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave}>{initial ? "Guardar cambios" : "Guardar"}</Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EntryDetail({
  entry,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{entry.name}</CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
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
        {entry.custom_fields?.map((field, i) => (
          <div key={i}>
            <p className="text-muted-foreground text-xs mb-1">{field.label}</p>
            <p>{field.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}