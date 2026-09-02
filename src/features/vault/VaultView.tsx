import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, KeyRound, X, Pencil, Trash2, Eye, EyeOff, Star, RotateCcw, Search } from "lucide-react";
import { useActivity } from "@/hooks/useActivity";

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
  favorite: boolean;
  trashed: boolean;
}

type FormMode = "create" | "edit" | null;
type Filter = "all" | "favorites" | "trash";
type SearchCategory = "all" | "name" | "contact" | "website" | "custom";

function matchesSearch(entry: Entry, term: string, category: SearchCategory): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  const inName = entry.name.toLowerCase().includes(t);
  const inContact = (entry.username ?? "").toLowerCase().includes(t);
  const inWebsite = (entry.website ?? "").toLowerCase().includes(t);
  const inCustom = (entry.custom_fields ?? []).some(
    (f) => f.label.toLowerCase().includes(t) || f.value.toLowerCase().includes(t)
  );
  switch (category) {
    case "name":
      return inName;
    case "contact":
      return inContact;
    case "website":
      return inWebsite;
    case "custom":
      return inCustom;
    default:
      return inName || inContact || inWebsite || inCustom;
  }
}

interface VaultViewProps {
  prefillPassword?: string | null;
  onPrefillConsumed?: () => void;
}

export function VaultView({ prefillPassword, onPrefillConsumed }: VaultViewProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const { saveActivity } = useActivity();

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  // Si llega una contraseña desde el Generador, abre directamente el formulario de "Nuevo" con ella rellenada
  useEffect(() => {
    if (prefillPassword) {
      setPendingPassword(prefillPassword);
      setFormMode("create");
      setSelectedId(null);
      onPrefillConsumed?.();
    }
  }, [prefillPassword, onPrefillConsumed]);

  const visible = entries.filter((e) => {
    if (filter === "trash" && !e.trashed) return false;
    if (filter === "favorites" && !(e.favorite && !e.trashed)) return false;
    if (filter === "all" && e.trashed) return false;
    return matchesSearch(e, search, searchCategory);
  });

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const panelOpen = formMode !== null || selectedId !== null;

  const closePanel = () => {
    setSelectedId(null);
    setFormMode(null);
    setPendingPassword(null);
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = entries.find((e) => e.id === id);
    await invoke("toggle_favorite", { id });
    if (entry) {
      await saveActivity(
        "edit",
        `${entry.favorite ? "Quitado de favoritos" : "Añadido a favoritos"}: ${entry.name}`,
        "vault"
      );
    }
    loadEntries();
  };

  const handleTrash = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("trash_entry", { id });
    if (entry) {
      await saveActivity("delete", `Movido a papelera: ${entry.name}`, "vault");
    }
    closePanel();
    loadEntries();
  };

  const handleRestore = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("restore_entry", { id });
    if (entry) {
      await saveActivity("restore", `Restaurada entrada: ${entry.name}`, "vault");
    }
    loadEntries();
  };

  const handleDeletePermanently = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("delete_entry", { id });
    if (entry) {
      await saveActivity("delete", `Eliminada permanentemente: ${entry.name}`, "vault");
    }
    closePanel();
    loadEntries();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Vault</h2>
      <p className="text-sm text-muted-foreground mb-6">Todos tus registros, organizados y seguros.</p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {filter === "trash" ? "Papelera" : filter === "favorites" ? "Favoritos" : "Todos los elementos"}
          </CardTitle>
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
        <CardContent>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en el vault..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={searchCategory} onValueChange={(v) => v && setSearchCategory(v as SearchCategory)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los campos</SelectItem>
                <SelectItem value="name">Nombre</SelectItem>
                <SelectItem value="contact">Usuario o email</SelectItem>
                <SelectItem value="website">Sitio web</SelectItem>
                <SelectItem value="custom">Campos personalizados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-1 mb-3">
            <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>
              Todos
            </Button>
            <Button
              variant={filter === "favorites" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter("favorites")}
            >
              <Star className="h-3.5 w-3.5 mr-1" /> Favoritos
            </Button>
            <Button variant={filter === "trash" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("trash")}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Papelera
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            {visible.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                {search ? "Nada coincide con tu búsqueda." : "No hay nada aquí."}
              </p>
            )}
            {visible.map((entry) => (
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{entry.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{entry.username || entry.folder || "—"}</p>
                </div>
                {!entry.trashed && (
                  <span
                    role="button"
                    onClick={(e) => handleToggleFavorite(entry.id, e)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Star className={`h-4 w-4 ${entry.favorite ? "fill-current text-yellow-500" : ""}`} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 w-full max-w-md z-50"
          >
            {formMode === "create" && (
              <EntryForm
                initialPassword={pendingPassword ?? undefined}
                onSaved={() => { setFormMode(null); setPendingPassword(null); loadEntries(); }}
                onClose={closePanel}
              />
            )}
            {formMode === "edit" && selected && (
              <EntryForm initial={selected} onSaved={() => { setFormMode(null); loadEntries(); }} onClose={closePanel} />
            )}
            {formMode === null && selected && (
              <EntryDetail
                entry={selected}
                onEdit={() => setFormMode("edit")}
                onTrash={() => handleTrash(selected.id)}
                onRestore={() => handleRestore(selected.id)}
                onDeletePermanently={() => handleDeletePermanently(selected.id)}
                onToggleFavorite={(e) => handleToggleFavorite(selected.id, e)}
                onClose={closePanel}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EntryForm({
  initial,
  initialPassword,
  onSaved,
  onClose,
}: {
  initial?: Entry;
  initialPassword?: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? initialPassword ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [customFields, setCustomFields] = useState<CustomFieldData[]>(initial?.custom_fields ?? []);
  const { saveActivity } = useActivity();

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
      await saveActivity("edit", `Editada entrada: ${name}`, "vault", username || undefined);
    } else {
      await invoke("save_entry", payload);
      await saveActivity("create", `Nueva entrada: ${name}`, "vault", username || undefined);
    }
    onSaved();
  };

  return (
    <Card className="h-full flex flex-col rounded-none border-l shadow-2xl">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle>{initial ? "Editar elemento" : "Nuevo elemento"}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto flex flex-col gap-3">
        {initialPassword && !initial && (
          <p className="text-xs text-muted-foreground bg-muted rounded p-2">
            Contraseña rellenada desde el Generador — ponle un nombre para guardarla.
          </p>
        )}
        <div>
          <label className="text-sm font-medium block mb-1">Nombre</label>
          <Input placeholder="ej: Gmail" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!!initialPassword} />
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

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave}>{initial ? "Guardar cambios" : "Guardar"}</Button>
          <Button variant="ghost" onClick={onClose}>
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
  onTrash,
  onRestore,
  onDeletePermanently,
  onToggleFavorite,
  onClose,
}: {
  entry: Entry;
  onEdit: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="h-full flex flex-col rounded-none border-l shadow-2xl">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle>{entry.name}</CardTitle>
        <div className="flex gap-1">
          {entry.trashed ? (
            <>
              <Button variant="ghost" size="icon" onClick={onRestore} title="Restaurar">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" size="icon" title="Eliminar definitivamente" />}>
                  <Trash2 className="h-4 w-4" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar "{entry.name}" para siempre?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. El elemento se borrará por completo, no quedará en la papelera.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeletePermanently}>Eliminar para siempre</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={onToggleFavorite} title="Favorito">
                <Star className={`h-4 w-4 ${entry.favorite ? "fill-current text-yellow-500" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onTrash} title="Mover a papelera">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto flex flex-col gap-3 text-sm">
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