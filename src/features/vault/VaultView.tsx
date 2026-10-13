import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Star,
  RotateCcw,
  Search,
  Copy,
  Check,
  List,
  LayoutGrid,
  Folder,
  FolderPlus,
  Move,
  History,
  Tags,
  ArrowUp,
  ArrowDown,
  Settings2,
  BookmarkPlus,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import {
  deleteUserTemplate,
  entryIcon,
  entryTypeLabel,
  findTemplate,
  getUserTemplateData,
  loadUserTemplates,
  MAIN_TEMPLATES,
  MORE_TEMPLATES,
  presetLabel,
  presetOption,
  templateLabel,
  templateNameLabel,
  TEMPLATES,
  useUserTemplates,
  type EntryTemplate,
  type UserTemplateData,
} from "./templates";
import { TemplateEditorDialog } from "./TemplateEditor";
import {
  AvatarMode,
  AvatarPicker,
  CustomFieldData,
  EntryAvatar,
  FIELD_TYPES,
  FIELD_TYPE_KEYS,
  FieldPlainValue,
  FieldType,
  FieldValueInput,
  OptionsEditor,
  UrlValue,
  defaultConfigFor,
  FieldConfigInput,
  isFieldSensitive,
  isValueCompatible,
  normalizedFieldType,
  resolveAvatarMode,
  useOpenUrl,
} from "@/components/EntryFields";
import {
  EMPTY_TAXONOMY,
  TagPicker,
  Taxonomy,
  TaxonomyDialog,
  TaxonomyItem,
  TaxonomyKind,
} from "@/components/EntryTaxonomy";
import { useActivity } from "@/hooks/useActivity";

// Código de error estable que devuelve el backend (Rust) cuando la contraseña maestra no es válida.
const WRONG_PASSWORD_CODE = "INVALID_MASTER_PASSWORD";

interface FolderData {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

// Evento del historial de un registro. Nunca guarda valores, solo qué cambió.
interface HistoryEvent {
  timestamp: number;
  action: string;
  field?: string | null; // etiqueta del campo, o "builtin:<clave>" para los campos fijos
  extra?: string | null; // p. ej. el nombre nuevo de un campo o la carpeta de destino
}

interface Entry {
  id: string;
  name: string;
  folder?: string | null;
  folder_id?: string | null;
  username?: string | null;
  password?: string | null;
  website?: string | null;
  notes?: string | null;
  custom_fields?: CustomFieldData[];
  totp_secret?: string | null;
  entry_type?: string | null;
  logo?: string | null; // imagen subida por el usuario (data URL pequeña)
  avatar_mode?: string | null; // "type" | "initial" | "image"
  tag_ids?: string[]; // etiquetas (varias)
  category_id?: string | null; // categoría (una)
  history?: HistoryEvent[];
  favorite: boolean;
  trashed: boolean;
  created_at: number;
  updated_at: number;
}

type FormMode = "create" | "edit" | null;
type Filter = "all" | "favorites" | "trash";
type SearchCategory = "all" | "name" | "contact" | "website" | "custom";
type ViewMode = "list" | "gallery";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function buildBreadcrumb(folders: FolderData[], currentId: string | null): FolderData[] {
  const trail: FolderData[] = [];
  let cursor = currentId;
  while (cursor) {
    const f = folders.find((x) => x.id === cursor);
    if (!f) break;
    trail.unshift(f);
    cursor = f.parent_id;
  }
  return trail;
}

function folderPath(folders: FolderData[], id: string): string {
  const trail: string[] = [];
  let cursor: string | null = id;
  while (cursor) {
    const f = folders.find((x) => x.id === cursor);
    if (!f) break;
    trail.unshift(f.name);
    cursor = f.parent_id;
  }
  return trail.join(" / ");
}

// ---------- Historial: texto legible de cada evento ----------

// Campos fijos del registro -> clave de traducción de su nombre
const BUILTIN_FIELD_KEYS: Record<string, string> = {
  name: "fieldName",
  username: "detailUsername",
  password: "detailPassword",
  website: "detailWebsite",
  notes: "detailNotes",
  totp: "detailTotp",
  tags: "tagsLabel",
  category: "categoryLabel",
};

type TFn = (key: string, options?: Record<string, unknown>) => string;

function describeHistory(t: TFn, ev: HistoryEvent): string {
  // Las etiquetas y carpetas son texto del usuario: sin escapado HTML.
  const opts = (values: Record<string, string>) => ({ ...values, interpolation: { escapeValue: false } });
  const field = ev.field?.startsWith("builtin:")
    ? t(BUILTIN_FIELD_KEYS[ev.field.slice(8)] ?? "fieldName")
    : ev.field ?? "";

  switch (ev.action) {
    case "created":
      return t("historyCreated");
    case "field_modified":
      return t("historyFieldModified", opts({ field }));
    case "field_added":
      return t("historyFieldAdded", opts({ field }));
    case "field_removed":
      return t("historyFieldRemoved", opts({ field }));
    case "field_renamed":
      return t("historyFieldRenamed", opts({ from: field, to: ev.extra ?? "" }));
    case "field_type_changed":
      return t("historyFieldTypeChanged", opts({ field }));
    case "logo_changed":
      return t("historyLogoChanged");
    case "avatar_changed":
      return t("historyAvatarChanged");
    case "field_options_changed":
      return t("historyOptionsChanged", opts({ field }));
    case "field_sensitivity_changed":
      return t("historySensitivityChanged", opts({ field }));
    case "field_config_changed":
      return t("historyConfigChanged", opts({ field }));
    case "moved":
      return ev.extra ? t("historyMoved", opts({ folder: ev.extra })) : t("historyMovedRoot");
    case "trashed":
      return t("historyTrashed");
    case "restored":
      return t("historyRestored");
    case "favorite_added":
      return t("historyFavoriteAdded");
    case "favorite_removed":
      return t("historyFavoriteRemoved");
    default:
      return ev.action;
  }
}

// Base UI muestra el VALOR del desplegable ("root", un id numérico...) salvo que le des la lista
// de {value, label} en la prop `items`: con ella, SelectValue pinta la etiqueta ya traducida.
function folderSelectItems(folders: FolderData[], rootLabel: string) {
  return [
    { value: "root", label: rootLabel },
    ...folders.map((f) => ({ value: f.id, label: folderPath(folders, f.id) })),
  ];
}

interface VaultViewProps {
  prefillPassword?: string | null;
  onPrefillConsumed?: () => void;
}

export function VaultView({ prefillPassword, onPrefillConsumed }: VaultViewProps) {
  const { t } = useTranslation("vault");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EntryTemplate | null>(null);
  const userTemplates = useUserTemplates();
  // Editor de plantillas propias: {} = plantilla nueva, {initial} = editar una existente.
  const [templateEditor, setTemplateEditor] = useState<{ initial?: UserTemplateData } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateToDelete, setTemplateToDelete] = useState<EntryTemplate | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<FolderData | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingFolder, setMovingFolder] = useState<FolderData | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<string>("root");
  const [trashAuthOpen, setTrashAuthOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const { saveActivity } = useActivity();

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  const loadFolders = async () => {
    const result = await invoke<FolderData[]>("load_folders");
    setFolders(result);
  };

  const loadTaxonomy = async () => {
    const result = await invoke<Taxonomy>("load_taxonomy");
    setTaxonomy(result);
  };

  useEffect(() => {
    loadEntries();
    loadFolders();
    loadTaxonomy();
    loadUserTemplates();
  }, []);

  // El buscador del selector empieza vacío cada vez que se abre.
  useEffect(() => {
    if (!templatePickerOpen) setTemplateSearch("");
  }, [templatePickerOpen]);

  useEffect(() => {
    if (prefillPassword) {
      setPendingPassword(prefillPassword);
      setSelectedTemplate(findTemplate("password") ?? null);
      setFormMode("create");
      setSelectedId(null);
    }
  }, [prefillPassword]);

  // Con un filtro de categoría o etiqueta se busca en toda la bóveda, no solo en la carpeta actual.
  const browsingMode = filter === "all" && !search && categoryFilter === "all" && tagFilter === "all";
  const breadcrumbTrail = buildBreadcrumb(folders, currentFolderId);
  const currentSubfolders = browsingMode ? folders.filter((f) => f.parent_id === currentFolderId) : [];

  const visible = entries.filter((e) => {
    if (filter === "trash" && !e.trashed) return false;
    if (filter === "favorites" && !(e.favorite && !e.trashed)) return false;
    if (filter === "all" && e.trashed) return false;
    if (typeFilter !== "all") {
      const entryTypeKey = e.entry_type || "uncategorized";
      if (entryTypeKey !== typeFilter) return false;
    }
    if (categoryFilter !== "all" && e.category_id !== categoryFilter) return false;
    if (tagFilter !== "all" && !(e.tag_ids ?? []).includes(tagFilter)) return false;
    if (browsingMode && (e.folder_id ?? null) !== currentFolderId) return false;
    return matchesSearch(e, search, searchCategory);
  });

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  // El popup de la entrada se abre al crear, editar o ver un registro.
  const panelOpen = formMode !== null || selectedId !== null;

  const closePanel = () => {
    setSelectedId(null);
    setFormMode(null);
    setPendingPassword(null);
    setSelectedTemplate(null);
    onPrefillConsumed?.();
  };

  const handleToggleFavorite = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const entry = entries.find((x) => x.id === id);
    await invoke("toggle_favorite", { id });
    if (entry) {
      await saveActivity("edit", entry.favorite ? "favoriteRemoved" : "favoriteAdded", "vault", { name: entry.name });
    }
    loadEntries();
  };

  const handleTrash = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("trash_entry", { id });
    if (entry) {
      await saveActivity("delete", "entryTrashed", "vault", { name: entry.name });
    }
    closePanel();
    loadEntries();
  };

  const handleRestore = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("restore_entry", { id });
    if (entry) {
      await saveActivity("restore", "entryRestored", "vault", { name: entry.name });
    }
    loadEntries();
  };

  // Abrir el diálogo de contraseña maestra; el borrado real se hace al confirmarlo.
  const handleRequestDeletePermanently = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) setDeleteTarget(entry);
  };

  // El backend vuelve a verificar la contraseña: si es incorrecta, delete_entry falla
  // con WRONG_PASSWORD_CODE y el diálogo muestra el error sin borrar nada.
  const handleConfirmDeletePermanently = async (masterPassword: string) => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    await invoke("delete_entry", { id: target.id, masterPassword });
    setDeleteTarget(null);
    closePanel();
    loadEntries();
    try {
      await saveActivity("delete", "entryDeletedForever", "vault", { name: target.name });
    } catch {
      // El registro de actividad es secundario: la entrada ya se ha borrado.
    }
  };

  // La papelera se abre solo tras verificar la contraseña maestra.
  const handleOpenTrash = () => {
    if (filter === "trash") return;
    setTrashAuthOpen(true);
  };

  const handleConfirmTrashAccess = async (masterPassword: string) => {
    const ok = await invoke<boolean>("verify_master_password", { masterPassword });
    if (!ok) throw new Error(WRONG_PASSWORD_CODE);
    setTrashAuthOpen(false);
    setFilter("trash");
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await invoke("create_folder", { name: newFolderName.trim(), parentId: currentFolderId });
    await saveActivity("create", "folderCreated", "vault", { name: newFolderName.trim() });
    setNewFolderName("");
    setNewFolderOpen(false);
    loadFolders();
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim()) return;
    await invoke("rename_folder", { id: renamingFolder.id, name: renameValue.trim() });
    setRenamingFolder(null);
    loadFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await invoke("delete_folder", { id });
      loadFolders();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const folderDescendantIds = (rootId: string): Set<string> => {
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const current = stack.pop()!;
      folders.filter((f) => f.parent_id === current).forEach((f) => {
        ids.add(f.id);
        stack.push(f.id);
      });
    }
    return ids;
  };

  const handleMoveFolder = async (targetId: string | null) => {
    if (!movingFolder) return;
    try {
      await invoke("move_folder", { id: movingFolder.id, parentId: targetId });
      await saveActivity("edit", "folderMoved", "vault", {
        name: movingFolder.name,
        folder: targetId ? folderPath(folders, targetId) : t("vaultRootLabel"),
      });
      setMovingFolder(null);
      loadFolders();
    } catch (e) {
      toast.error(String(e));
    }
  };

  // ---------- Etiquetas y categorías ----------

  const handleCreateTaxonomyItem = async (kind: TaxonomyKind, name: string): Promise<TaxonomyItem | null> => {
    const list = kind === "tag" ? taxonomy.tags : taxonomy.categories;
    const existing = list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    try {
      const item = await invoke<TaxonomyItem>("create_taxonomy_item", { kind, name });
      setTaxonomy((prev) =>
        kind === "tag"
          ? { ...prev, tags: [...prev.tags, item] }
          : { ...prev, categories: [...prev.categories, item] }
      );
      return item;
    } catch (e) {
      toast.error(String(e));
      return null;
    }
  };

  const handleRenameTaxonomyItem = async (kind: TaxonomyKind, id: string, name: string): Promise<boolean> => {
    try {
      await invoke("rename_taxonomy_item", { kind, id, name });
      await loadTaxonomy();
      return true;
    } catch (e) {
      toast.error(String(e));
      return false;
    }
  };

  const handleDeleteTaxonomyItem = async (kind: TaxonomyKind, id: string): Promise<void> => {
    try {
      await invoke("delete_taxonomy_item", { kind, id });
      await loadTaxonomy();
      await loadEntries(); // los registros que la usaban ya no la tienen
      if (kind === "tag" && tagFilter === id) setTagFilter("all");
      if (kind === "category" && categoryFilter === id) setCategoryFilter("all");
    } catch (e) {
      toast.error(String(e));
    }
  };

  // Se pasa tal cual al formulario, que puede crear y gestionar etiquetas y categorías sin salir del popup.
  const taxonomyProps = {
    taxonomy,
    onCreateTaxonomyItem: handleCreateTaxonomyItem,
    onRenameTaxonomyItem: handleRenameTaxonomyItem,
    onDeleteTaxonomyItem: handleDeleteTaxonomyItem,
  };

  const renderFavoriteStar = (entry: Entry) =>
    !entry.trashed && (
      <span
        role="button"
        onClick={(e) => handleToggleFavorite(entry.id, e)}
        className={`shrink-0 text-muted-foreground hover:text-foreground transition-opacity ${entry.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
      >
        <Star className={`h-4 w-4 ${entry.favorite ? "fill-current text-yellow-500" : ""}`} />
      </span>
    );

  // Tarjetas de subcarpetas (misma pieza para la vista de lista y la de galería).
  const renderSubfolders = (containerClassName: string) => (
    <div className={containerClassName}>
      {currentSubfolders.map((f) => (
        <div
          key={f.id}
          onClick={() => setCurrentFolderId(f.id)}
          className="group relative flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2 hover:bg-muted hover:border-primary/50 transition-colors cursor-pointer"
        >
          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate flex-1 min-w-0">{f.name}</span>
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 absolute right-1 top-1/2 -translate-y-1/2 bg-muted pl-1 rounded">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setMovingFolder(f);
                setMoveFolderTarget(f.parent_id ?? "root");
              }}
              title={t("moveToFolderTooltip")}
            >
              <Move className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingFolder(f);
                setRenameValue(f.name);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(f.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );

  const categoryName = (entry: Entry) => taxonomy.categories.find((c) => c.id === entry.category_id)?.name;

  const typeBadgeLabel = (entryType?: string | null) =>
    entryTypeLabel(t, entryType);

  // Selector de plantillas: secciones filtradas por el buscador (nombre de la plantilla o de sus campos).
  // Sin tildes, mayúsculas, espacios ni guiones: "wifi" encuentra "Wi-Fi".
  const normalizeText = (text: string) =>
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const templateQuery = normalizeText(templateSearch);
  // Por el nombre de la plantilla; por sus campos solo con 3 letras o más y al inicio de una palabra.
  const matchesTemplate = (tpl: EntryTemplate) =>
    !templateQuery ||
    normalizeText(templateLabel(t, tpl)).includes(templateQuery) ||
    (templateQuery.length >= 3 &&
      tpl.presetFields.some((f) =>
        presetLabel(t, tpl, f)
          .split(/[^\p{L}\p{N}]+/u)
          .some((word) => normalizeText(word).startsWith(templateQuery))
      ));
  const pickerSections = [
    { id: "main", title: t("templatesMain"), templates: MAIN_TEMPLATES.filter(matchesTemplate) },
    { id: "more", title: t("templatesMore"), templates: MORE_TEMPLATES.filter(matchesTemplate) },
    { id: "user", title: t("templatesMine"), templates: userTemplates.filter(matchesTemplate) },
  ].filter((section) => section.templates.length > 0 || (section.id === "user" && !templateQuery));

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">{t("title")}</h2>
      <p className="text-sm text-muted-foreground mb-6">{t("subtitle")}</p>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {filter === "trash" ? t("listTrash") : filter === "favorites" ? t("listFavorites") : t("listAll")}
          </CardTitle>
          <div className="flex gap-2">
            {browsingMode && (
              <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1" /> {t("newFolderButton")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setTaxonomyOpen(true)}>
              <Tags className="h-4 w-4 mr-1" /> {t("manageTaxonomyButton")}
            </Button>
            <Button size="sm" onClick={() => setTemplatePickerOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t("newButton")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={searchCategory}
              onValueChange={(v) => v && setSearchCategory(v as SearchCategory)}
              items={[
                { value: "all", label: t("searchAll") },
                { value: "name", label: t("searchName") },
                { value: "contact", label: t("searchContact") },
                { value: "website", label: t("searchWebsite") },
                { value: "custom", label: t("searchCustom") },
              ]}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("searchAll")}</SelectItem>
                <SelectItem value="name">{t("searchName")}</SelectItem>
                <SelectItem value="contact">{t("searchContact")}</SelectItem>
                <SelectItem value="website">{t("searchWebsite")}</SelectItem>
                <SelectItem value="custom">{t("searchCustom")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex gap-1 flex-wrap">
              <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>
                {t("filterAll")}
              </Button>
              <Button
                variant={filter === "favorites" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter("favorites")}
              >
                <Star className="h-3.5 w-3.5 mr-1" /> {t("filterFavorites")}
              </Button>
              <Button variant={filter === "trash" ? "secondary" : "ghost"} size="sm" onClick={handleOpenTrash}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("filterTrash")}
              </Button>
              <Select
                value={typeFilter}
                onValueChange={(v) => v && setTypeFilter(v)}
                items={[
                  { value: "all", label: t("typeFilterAll") },
                  ...[...TEMPLATES, ...userTemplates].map((tpl) => ({ value: tpl.id, label: templateLabel(t, tpl) })),
                  { value: "uncategorized", label: t("templateUncategorized") },
                ]}
              >
                <SelectTrigger className="w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("typeFilterAll")}</SelectItem>
                  {[...TEMPLATES, ...userTemplates].map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {templateLabel(t, tpl)}
                    </SelectItem>
                  ))}
                  <SelectItem value="uncategorized">{t("templateUncategorized")}</SelectItem>
                </SelectContent>
              </Select>
              {taxonomy.categories.length > 0 && (
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => v && setCategoryFilter(v)}
                  items={[
                    { value: "all", label: t("filterAllCategories") },
                    ...taxonomy.categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                >
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filterAllCategories")}</SelectItem>
                    {taxonomy.categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {taxonomy.tags.length > 0 && (
                <Select
                  value={tagFilter}
                  onValueChange={(v) => v && setTagFilter(v)}
                  items={[
                    { value: "all", label: t("filterAllTags") },
                    ...taxonomy.tags.map((tg) => ({ value: tg.id, label: tg.name })),
                  ]}
                >
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filterAllTags")}</SelectItem>
                    {taxonomy.tags.map((tg) => (
                      <SelectItem key={tg.id} value={tg.id}>
                        {tg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                title={t("viewList")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "gallery" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("gallery")}
                title={t("viewGallery")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {browsingMode && currentFolderId !== null && (
            <div className="flex items-center gap-1.5 text-sm mb-3 flex-wrap">
              <button
                onClick={() => setCurrentFolderId(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("vaultRootLabel")}
              </button>
              {breadcrumbTrail.map((f) => (
                <span key={f.id} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    onClick={() => setCurrentFolderId(f.id)}
                    className={`hover:text-foreground transition-colors ${f.id === currentFolderId ? "font-semibold text-foreground" : "text-muted-foreground"
                      }`}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {visible.length === 0 && currentSubfolders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{search ? t("emptySearch") : t("emptyList")}</p>
          ) : viewMode === "list" ? (
            <div className="flex max-h-[max(16rem,calc(100vh-19rem))] flex-col gap-1 overflow-y-auto rounded-lg border p-2">
              {currentSubfolders.length > 0 &&
                renderSubfolders("grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-1")}
              {currentSubfolders.length > 0 && visible.length > 0 && <div className="my-2 border-t" />}
              {visible.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setSelectedId(entry.id);
                    setFormMode(null);
                  }}
                  className={`group flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${selectedId === entry.id ? "bg-muted" : ""
                    }`}
                >
                  <EntryAvatar
                    name={entry.name}
                    logo={entry.logo}
                    mode={entry.avatar_mode}
                    icon={entryIcon(entry.entry_type)}
                    className="h-9 w-9"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                        {typeBadgeLabel(entry.entry_type)}
                      </span>
                      {categoryName(entry) && (
                        <span className="max-w-28 truncate text-[10px] border text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                          {categoryName(entry)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {t("editedLabel")}: {formatDate(entry.updated_at)}
                    </p>
                  </div>
                  {renderFavoriteStar(entry)}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid max-h-[max(16rem,calc(100vh-19rem))] grid-cols-3 content-start gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {currentSubfolders.length > 0 &&
                renderSubfolders("col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-1")}
              {currentSubfolders.length > 0 && visible.length > 0 && <div className="col-span-full my-1 border-t" />}
              {visible.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => {
                    setSelectedId(entry.id);
                    setFormMode(null);
                  }}
                  className={`group flex flex-col gap-1.5 rounded-lg border p-2.5 text-left hover:border-primary hover:bg-muted/50 transition-colors ${selectedId === entry.id ? "border-primary bg-muted/50" : ""
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <EntryAvatar
                      name={entry.name}
                      logo={entry.logo}
                      mode={entry.avatar_mode}
                      icon={entryIcon(entry.entry_type)}
                      className="h-8 w-8"
                      textClassName="text-xs"
                    />
                    {renderFavoriteStar(entry)}
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate">{entry.name}</p>
                    <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded inline-block mt-1">
                      {typeBadgeLabel(entry.entry_type)}
                    </span>
                    {categoryName(entry) && (
                      <span className="ml-1 mt-1 inline-block max-w-24 truncate align-bottom text-[10px] border text-muted-foreground px-1.5 py-0.5 rounded">
                        {categoryName(entry)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-auto pt-2 border-t">
                    <p>{t("createdLabel")}: {formatDate(entry.created_at)}</p>
                    <p>{t("editedLabel")}: {formatDate(entry.updated_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("newFolderDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              placeholder={t("folderNamePlaceholder")}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
            />
            <Button onClick={handleCreateFolder}>{t("createFolderButton")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renamingFolder !== null} onOpenChange={(isOpen) => !isOpen && setRenamingFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("renameFolderDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
              autoFocus
            />
            <Button onClick={handleRenameFolder}>{t("saveChangesButton")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={movingFolder !== null} onOpenChange={(isOpen) => !isOpen && setMovingFolder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("moveFolderDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select
              value={moveFolderTarget}
              onValueChange={(v) => v && setMoveFolderTarget(v)}
              items={folderSelectItems(folders, t("vaultRootLabel"))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">{t("vaultRootLabel")}</SelectItem>
                {movingFolder &&
                  folders
                    .filter(
                      (f) => f.id !== movingFolder.id && !folderDescendantIds(movingFolder.id).has(f.id)
                    )
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {folderPath(folders, f.id)}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <Button onClick={() => handleMoveFolder(moveFolderTarget === "root" ? null : moveFolderTarget)}>
              {t("moveButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("templatePickerTitle")}</DialogTitle>
            <DialogDescription>{t("templatePickerDescription")}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={templateSearch}
              placeholder={t("templateSearchPlaceholder")}
              onChange={(e) => setTemplateSearch(e.target.value)}
            />
          </div>
          {templateQuery && pickerSections.every((s) => s.templates.length === 0) && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("templateNoResults")}</p>
          )}
          {pickerSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {section.templates.map((tpl) => {
                  const Icon = tpl.icon;
                  return (
                    <div
                      key={tpl.id}
                      className="flex flex-col rounded-lg border transition-colors hover:border-primary"
                    >
                      <button
                        onClick={() => {
                          setSelectedTemplate(tpl);
                          setTemplatePickerOpen(false);
                          setFormMode("create");
                          setSelectedId(null);
                        }}
                        className="flex w-full flex-1 flex-col items-center gap-1.5 rounded-lg p-3 text-center transition-colors hover:bg-muted"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="break-words text-xs font-medium">{templateLabel(t, tpl)}</span>
                      </button>
                      {tpl.user && (
                        <div className="flex justify-center gap-1 px-1 pb-1.5">
                          <button
                            type="button"
                            onClick={() => setTemplateEditor({ initial: getUserTemplateData(tpl.id) })}
                            title={t("templateEditTooltip")}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setTemplateToDelete(tpl)}
                            title={t("templateDeleteTooltip")}
                            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {section.id === "user" && !templateQuery && (
                  <button
                    onClick={() => setTemplateEditor({})}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-center text-muted-foreground transition-colors hover:border-primary hover:bg-muted hover:text-foreground"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md">
                      <Plus className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium">{t("templateNewCard")}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      <TemplateEditorDialog
        open={templateEditor !== null}
        onOpenChange={(isOpen) => !isOpen && setTemplateEditor(null)}
        initial={templateEditor?.initial}
      />

      <Dialog open={templateToDelete !== null} onOpenChange={(isOpen) => !isOpen && setTemplateToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("templateDeleteTitle", { name: templateToDelete ? templateLabel(t, templateToDelete) : "" })}
            </DialogTitle>
            <DialogDescription>{t("templateDeleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateToDelete(null)}>
              {t("cancelButton")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = templateToDelete;
                setTemplateToDelete(null);
                if (!target) return;
                try {
                  await deleteUserTemplate(target.id);
                  toast.success(t("templateDeletedToast"));
                } catch (e) {
                  toast.error(String(e));
                }
              }}
            >
              {t("templateDeleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaxonomyDialog
        open={taxonomyOpen}
        onOpenChange={setTaxonomyOpen}
        taxonomy={taxonomy}
        onCreate={handleCreateTaxonomyItem}
        onRename={handleRenameTaxonomyItem}
        onDelete={handleDeleteTaxonomyItem}
      />

      {/* Popup de la entrada: ver (detalle), crear y editar. */}
      <Dialog open={panelOpen} onOpenChange={(isOpen) => !isOpen && closePanel()}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          {formMode === "create" && (
            <EntryForm
              initialPassword={pendingPassword ?? undefined}
              template={selectedTemplate ?? findTemplate("custom")!}
              defaultFolderId={currentFolderId}
              folders={folders}
              {...taxonomyProps}
              onSaved={() => {
                setFormMode(null);
                setPendingPassword(null);
                setSelectedTemplate(null);
                onPrefillConsumed?.();
                loadEntries();
              }}
              onClose={closePanel}
            />
          )}
          {formMode === "edit" && selected && (
            <EntryForm
              initial={selected}
              folders={folders}
              {...taxonomyProps}
              onSaved={() => {
                setFormMode(null);
                loadEntries();
              }}
              onClose={closePanel}
            />
          )}
          {formMode === null && selected && (
            <EntryDetail
              key={selected.id}
              entry={selected}
              folders={folders}
              taxonomy={taxonomy}
              onEdit={() => setFormMode("edit")}
              onTrash={() => handleTrash(selected.id)}
              onRestore={() => handleRestore(selected.id)}
              onDeletePermanently={() => handleRequestDeletePermanently(selected.id)}
              onToggleFavorite={(e) => handleToggleFavorite(selected.id, e)}
              onMoveToFolder={async (folderId) => {
                await invoke("move_entry_to_folder", { id: selected.id, folderId });
                await saveActivity("edit", "entryMoved", "vault", {
                  name: selected.name,
                  folder: folderId ? folderPath(folders, folderId) : t("vaultRootLabel"),
                });
                loadEntries();
              }}
              onClose={closePanel}
            />
          )}

          {/* Va dentro del popup para que sea un diálogo anidado y no cierre el popup al interactuar. */}
          <MasterPasswordDialog
            open={deleteTarget !== null}
            title={t("deleteConfirmTitle", { name: deleteTarget?.name ?? "" })}
            description={`${t("deleteConfirmDescription")} ${t("deleteAuthHint")}`}
            confirmLabel={t("deleteConfirmAction")}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleConfirmDeletePermanently}
          />
        </DialogContent>
      </Dialog>

      <MasterPasswordDialog
        open={trashAuthOpen}
        title={t("trashDialogTitle")}
        description={t("trashDialogDescription")}
        confirmLabel={t("revealConfirmButton")}
        onCancel={() => setTrashAuthOpen(false)}
        onConfirm={handleConfirmTrashAccess}
      />
    </div>
  );
}

// Diálogo reutilizable que pide la contraseña maestra antes de una acción sensible.
// Quien lo usa decide qué hacer en onConfirm; si lanza un error, se muestra aquí.
function MasterPasswordDialog({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (masterPassword: string) => Promise<void>;
}) {
  const { t } = useTranslation("vault");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const reset = () => {
    setPassword("");
    setError("");
    setVerifying(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleConfirm = async () => {
    if (verifying) return;
    if (!password) {
      setError(t("revealPasswordRequiredError"));
      return;
    }
    setVerifying(true);
    setError("");
    try {
      await onConfirm(password);
      reset();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message.includes(WRONG_PASSWORD_CODE) ? t("revealWrongPasswordError") : message);
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={verifying}>
              {t("cancelButton")}
            </Button>
            <Button onClick={handleConfirm} disabled={verifying}>
              {verifying ? t("revealVerifyingButton") : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TotpDisplay({ secret, accountName }: { secret: string; accountName: string }) {
  const { t } = useTranslation("vault");
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const fetchCode = async () => {
    try {
      const [newCode, ttl] = await invoke<[string, number]>("get_totp_code", {
        secretBase32: secret,
        accountName,
      });
      setCode(newCode);
      setSecondsLeft(ttl);
    } catch {
      setCode("");
    }
  };

  useEffect(() => {
    fetchCode();
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          fetchCode();
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, accountName]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-mono text-lg tracking-widest">{code || "------"}</p>
        <p className="text-xs text-muted-foreground">{t("totpRenews", { seconds: secondsLeft })}</p>
      </div>
      <CopyButton value={code} />
    </div>
  );
}

// Formulario de crear / editar. Se pinta dentro del popup (DialogContent) de VaultView.
interface TaxonomyProps {
  taxonomy: Taxonomy;
  onCreateTaxonomyItem: (kind: TaxonomyKind, name: string) => Promise<TaxonomyItem | null>;
  onRenameTaxonomyItem: (kind: TaxonomyKind, id: string, name: string) => Promise<boolean>;
  onDeleteTaxonomyItem: (kind: TaxonomyKind, id: string) => Promise<void>;
}

type FormTab = "general" | "credentials" | "fields" | "notes";

function EntryForm({
  initial,
  initialPassword,
  template,
  defaultFolderId,
  folders,
  taxonomy,
  onCreateTaxonomyItem,
  onRenameTaxonomyItem,
  onDeleteTaxonomyItem,
  onSaved,
  onClose,
}: TaxonomyProps & {
  initial?: Entry;
  initialPassword?: string;
  template?: EntryTemplate;
  defaultFolderId?: string | null;
  folders: FolderData[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("vault");
  const activeTemplate = initial ? undefined : template;

  const [name, setName] = useState(initial?.name ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? initialPassword ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [totpSecret, setTotpSecret] = useState(initial?.totp_secret ?? "");
  const [logo, setLogo] = useState<string | null>(initial?.logo ?? null);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>(resolveAvatarMode(initial?.avatar_mode, initial?.logo));
  const [tagIds, setTagIds] = useState<string[]>(initial?.tag_ids ?? []);
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "none");
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [folderTarget, setFolderTarget] = useState<string>(
    initial ? initial.folder_id ?? "root" : defaultFolderId ?? "root"
  );
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [saving, setSaving] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldData[]>(() => {
    if (initial) {
      return (initial.custom_fields ?? []).map((f) => ({ ...f, field_type: normalizedFieldType(f.field_type) }));
    }
    if (activeTemplate) {
      return activeTemplate.presetFields.map((f) => ({
        label: presetLabel(t, activeTemplate, f),
        value: "",
        field_type: f.type,
        is_preset: true,
        preset_key: activeTemplate.user ? null : f.labelKey,
        sensitive: f.sensitive ?? false,
        config: f.config ?? defaultConfigFor(f.type),
        options: (f.optionKeys ?? []).map((key) => presetOption(t, activeTemplate, key)),
      }));
    }
    return [];
  });
  const { saveActivity } = useActivity();
  // Con muchos campos (plantillas largas, registros con 4 o más campos) el formulario se organiza en pestañas.
  // Se decide al abrirlo y no cambia mientras se edita, para que las pestañas no aparezcan ni desaparezcan.
  const [useTabs] = useState(() => customFields.length >= 4);
  const [tab, setTab] = useState<FormTab>("general");

  // Al editar se respeta la plantilla del registro, pero nunca se oculta un dato que ya tenga valor.
  // Los registros sin plantilla (o cuya plantilla se borró) muestran todos los campos.
  const formTemplate = initial ? findTemplate(initial.entry_type) : activeTemplate;
  const showUsername = formTemplate ? formTemplate.showUsername || !!initial?.username : true;
  const showPasswordField = formTemplate ? formTemplate.showPassword || !!initial?.password : true;
  const showWebsite = formTemplate ? formTemplate.showWebsite || !!initial?.website : true;
  const showTotp = formTemplate ? formTemplate.showTotp || !!initial?.totp_secret : true;
  const nameLabel = formTemplate ? templateNameLabel(t, formTemplate) : t("fieldName");
  const notesLabel = formTemplate?.id === "note" ? t("presetContent") : t("fieldNotes");
  const entryTypeToSave = initial ? initial.entry_type ?? null : activeTemplate ? activeTemplate.id : null;
  const HeaderIcon = entryIcon(entryTypeToSave);
  const headerTypeLabel = entryTypeLabel(t, entryTypeToSave);
  // Borrador de plantilla con los campos actuales del formulario (sin sus valores).
  const [templateDraft, setTemplateDraft] = useState<UserTemplateData | null>(null);
  const openTemplateDraft = () => {
    setTemplateDraft({
      id: "",
      name: "",
      icon: "sparkles",
      name_label: "",
      show_username: showUsername,
      show_password: showPasswordField,
      show_website: showWebsite,
      show_totp: showTotp,
      fields: customFields
        .filter((f) => f.label.trim())
        .map((f) => ({
          label: f.label.trim(),
          field_type: normalizedFieldType(f.field_type),
          sensitive: !!f.sensitive,
          config: f.config ?? null,
          options: f.options ?? [],
        })),
    });
  };

  const indexedFields = customFields.map((field, i) => ({ field, i }));
  const presetIndexed = indexedFields.filter((x) => x.field.is_preset);
  const extraIndexed = indexedFields.filter((x) => !x.field.is_preset);
  // Si una etiqueta o categoría se elimina mientras el formulario está abierto, deja de contar.
  const validTagIds = tagIds.filter((id) => taxonomy.tags.some((tg) => tg.id === id));
  const effectiveCategory = taxonomy.categories.some((c) => c.id === categoryId) ? categoryId : "none";

  const addExtraField = () => {
    setCustomFields([
      ...customFields,
      { label: "", value: "", field_type: "text", is_preset: false, preset_key: null, options: [] },
    ]);
  };
  // Si se quita la opción elegida en un campo de lista, el valor se vacía.
  const updateFieldOptions = (index: number, options: string[]) => {
    setCustomFields(
      customFields.map((f, i) =>
        i === index ? { ...f, options, value: options.includes(f.value) ? f.value : "" } : f
      )
    );
  };
  // Sube o baja un campo adicional una posición (los de la plantilla mantienen su sitio).
  const moveExtraField = (pos: number, direction: -1 | 1) => {
    const from = extraIndexed[pos]?.i;
    const to = extraIndexed[pos + direction]?.i;
    if (from === undefined || to === undefined) return;
    const next = [...customFields];
    [next[from], next[to]] = [next[to], next[from]];
    setCustomFields(next);
  };
  const updateField = (index: number, key: "label" | "value", val: string) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, [key]: val } : f)));
  };
  // Al cambiar de tipo se vacía el valor si el nuevo tipo no puede reutilizarlo (p. ej. texto -> fecha).
  const updateFieldType = (index: number, type: FieldType) => {
    setCustomFields(
      customFields.map((f, i) =>
        i === index
          ? {
              ...f,
              field_type: type,
              // Un campo que ya era sensible (p. ej. de tipo contraseña) no pasa a verse al cambiar de tipo.
              sensitive: isFieldSensitive(f),
              config: defaultConfigFor(type),
              value: isValueCompatible(f.field_type, type) ? f.value : "",
            }
          : f
      )
    );
  };
  const updateFieldSensitive = (index: number, sensitive: boolean) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, sensitive } : f)));
  };
  const updateFieldConfig = (index: number, config: Record<string, unknown>) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, config } : f)));
  };
  const removeField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name || saving) return;
    setSaving(true);
    try {
      const folderId = folderTarget === "root" ? null : folderTarget;
      const payload = {
        name,
        folder: initial?.folder ?? null,
        username: (showUsername ? username : "") || null,
        password: (showPasswordField ? password : "") || null,
        website: (showWebsite ? website : "") || null,
        notes: notes || null,
        customFields: customFields
          .filter((f) => f.is_preset || f.label.trim() !== "")
          .map((f) => ({ ...f, options: normalizedFieldType(f.field_type) === "select" ? f.options ?? [] : [] })),
        totpSecret: (showTotp ? totpSecret : "").trim() || null,
        entryType: entryTypeToSave,
        logo: logo ?? null,
        avatarMode,
        tagIds: validTagIds,
        categoryId: effectiveCategory === "none" ? null : effectiveCategory,
      };
      if (initial) {
        await invoke("update_entry", { id: initial.id, ...payload });
        if ((initial.folder_id ?? null) !== folderId) {
          await invoke("move_entry_to_folder", { id: initial.id, folderId });
        }
        if (favorite !== initial.favorite) {
          await invoke("toggle_favorite", { id: initial.id });
        }
        await saveActivity("edit", "entryEdited", "vault", { name });
      } else {
        // save_entry devuelve el id de la nueva entrada.
        const newId = await invoke<string | null>("save_entry", { ...payload, folderId });
        if (favorite && newId) {
          await invoke("toggle_favorite", { id: newId });
        }
        await saveActivity("create", "entryCreated", "vault", { name });
      }
      onSaved();
    } catch (e) {
      toast.error(String(e));
      setSaving(false);
    }
  };

  const hasCredentials = showUsername || showPasswordField || showTotp || showWebsite;
  const tabs: { id: FormTab; label: string }[] = [
    { id: "general", label: t("tabGeneral") },
    ...(hasCredentials ? [{ id: "credentials" as FormTab, label: t("tabCredentials") }] : []),
    { id: "fields", label: `${t("tabFields")} (${customFields.length})` },
    { id: "notes", label: t("tabNotes") },
  ];
  const activeTab: FormTab = tabs.some((x) => x.id === tab) ? tab : "general";

  // ---- Bloques del formulario: se colocan en dos columnas o en pestañas ----

  const avatarBlock = (
      <AvatarPicker
        name={name}
        icon={HeaderIcon}
        logo={logo}
        mode={avatarMode}
        onChange={(next) => {
          setLogo(next.logo);
          setAvatarMode(next.mode);
        }}
      />
  );

  const nameBlock = (
      <div>
        <label className="mb-1 block text-sm font-medium">{nameLabel}</label>
        <Input
          placeholder={t("fieldNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
  );

  const usernameBlock = showUsername && (
    <div>
      <label className="mb-1 block text-sm font-medium">{t("fieldUsername")}</label>
      <Input placeholder={t("optional")} value={username} onChange={(e) => setUsername(e.target.value)} />
    </div>
  );

  const passwordBlock = showPasswordField && (
    <div>
      <label className="mb-1 block text-sm font-medium">{t("fieldPassword")}</label>
      <div className="relative">
        <Input
          placeholder={t("optional")}
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
  );

  const totpBlock = showTotp && (
    <div>
      <label className="mb-1 block text-sm font-medium">{t("fieldTotpSecret")}</label>
      <Input
        placeholder={t("fieldTotpPlaceholder")}
        value={totpSecret}
        onChange={(e) => setTotpSecret(e.target.value)}
      />
      <p className="mt-1 text-xs text-muted-foreground">{t("fieldTotpHint")}</p>
    </div>
  );

  const presetBlocks = presetIndexed.map(({ field, i }) => {
      const isSecurityTypeField = field.preset_key === "presetSecurityType";
      return (
        <div key={i}>
          <label className="mb-1 block text-sm font-medium">{field.label}</label>
          {isSecurityTypeField ? (
            <Select value={field.value} onValueChange={(v) => v && updateField(i, "value", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("customFieldValuePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WPA/WPA2">WPA/WPA2</SelectItem>
                <SelectItem value="WPA3">WPA3</SelectItem>
                <SelectItem value="WEP">WEP</SelectItem>
                <SelectItem value={t("presetSecurityOpen")}>{t("presetSecurityOpen")}</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <FieldValueInput field={field} onChange={(val) => updateField(i, "value", val)} />
          )}
        </div>
      );
  });
  const folderBlock = (
      <div>
        <label className="mb-1 block text-sm font-medium">{t("folderLabel")}</label>
        <Select
          value={folderTarget}
          onValueChange={(v) => v && setFolderTarget(v)}
          items={folderSelectItems(folders, t("vaultRootLabel"))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="root">{t("vaultRootLabel")}</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {folderPath(folders, f.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
  );

  const websiteBlock = showWebsite && (
    <div>
      <label className="mb-1 block text-sm font-medium">{t("fieldWebsite")}</label>
      <Input placeholder={t("optional")} value={website} onChange={(e) => setWebsite(e.target.value)} />
    </div>
  );

  const categoryBlock = (
      <div>
        <label className="mb-1 block text-sm font-medium">{t("categoryLabel")}</label>
        <div className="flex gap-2">
          <Select
            value={effectiveCategory}
            onValueChange={(v) => v && setCategoryId(v)}
            items={[
              { value: "none", label: t("categoryNone") },
              ...taxonomy.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("categoryNone")}</SelectItem>
              {taxonomy.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setTaxonomyOpen(true)}
            title={t("manageTaxonomyButton")}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
  );

  const tagsBlock = (
      <div>
        <label className="mb-1 block text-sm font-medium">{t("tagsLabel")}</label>
        <TagPicker
          tags={taxonomy.tags}
          selectedIds={validTagIds}
          onChange={setTagIds}
          onCreate={(name) => onCreateTaxonomyItem("tag", name)}
        />
      </div>
  );

  const notesBlock = (
      <div>
        <label className="mb-1 block text-sm font-medium">{notesLabel}</label>
        <textarea
          placeholder={t("optional")}
          className={`w-full rounded border bg-transparent p-2 text-sm ${useTabs ? "min-h-64" : "min-h-28"}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
  );

  const extrasBlock = (
      <div className="flex flex-col gap-2">
        {initial && extraIndexed.length > 0 && (
          <label className="text-sm font-medium">{t("additionalFieldsLabel")}</label>
        )}
        {extraIndexed.map(({ field, i }, pos) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
            <div className="flex items-center gap-1.5">
              <Input
                placeholder={t("customFieldNamePlaceholder")}
                value={field.label}
                onChange={(e) => updateField(i, "label", e.target.value)}
                className="flex-1"
              />
              <Select
                value={normalizedFieldType(field.field_type)}
                onValueChange={(v) => v && updateFieldType(i, v as FieldType)}
                items={FIELD_TYPES.map((type) => ({ value: type, label: t(FIELD_TYPE_KEYS[type]) }))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(FIELD_TYPE_KEYS[type])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={pos === 0}
                  onClick={() => moveExtraField(pos, -1)}
                  title={t("moveFieldUp")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={pos === extraIndexed.length - 1}
                  onClick={() => moveExtraField(pos, 1)}
                  title={t("moveFieldDown")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeField(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {normalizedFieldType(field.field_type) === "select" && (
              <OptionsEditor options={field.options ?? []} onChange={(options) => updateFieldOptions(i, options)} />
            )}
            <FieldConfigInput field={field} onChange={(config) => updateFieldConfig(i, config)} />
            <div className="flex items-center gap-2">
              <Switch
                checked={isFieldSensitive(field)}
                disabled={normalizedFieldType(field.field_type) === "password"}
                onCheckedChange={(v) => updateFieldSensitive(i, v)}
              />
              <span className="text-xs text-muted-foreground">{t("fieldSensitiveLabel")}</span>
            </div>
            <FieldValueInput field={field} onChange={(val) => updateField(i, "value", val)} />
          </div>
        ))}
        <Button variant="ghost" size="sm" className="self-start" onClick={addExtraField}>
          <Plus className="mr-1 h-4 w-4" /> {t("addFieldButton")}
        </Button>
      </div>
  );

  return (
    <>
      <DialogHeader className="shrink-0 flex-row items-center gap-3 border-b px-6 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <HeaderIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base">
            {initial ? t("formTitleEdit") : t("formTitleNew")}
          </DialogTitle>
          <DialogDescription className="mt-1 truncate text-xs">{headerTypeLabel}</DialogDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} title={t("closeTooltip")}>
          <X className="h-4 w-4" />
        </Button>
      </DialogHeader>

      {useTabs && (
        <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b px-6">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={activeTab === x.id}
              onClick={() => setTab(x.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === x.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {x.label}
              {x.id === "general" && !name && <span className="ml-1 text-destructive">*</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {initialPassword && !initial && (
          <p className="mb-4 rounded bg-muted p-2 text-xs text-muted-foreground">{t("prefillNotice")}</p>
        )}

        {useTabs ? (
          <div className="flex min-h-[22rem] flex-col gap-3">
            {activeTab === "general" && (
              <>
                {avatarBlock}
                {nameBlock}
                {folderBlock}
                {categoryBlock}
                {tagsBlock}
              </>
            )}
            {activeTab === "credentials" && (
              <>
                {usernameBlock}
                {passwordBlock}
                {totpBlock}
                {websiteBlock}
              </>
            )}
            {activeTab === "fields" && (
              <>
                {presetBlocks}
                {extrasBlock}
              </>
            )}
            {activeTab === "notes" && notesBlock}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Columna izquierda: información básica */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("sectionBasicInfo")}</h3>
              {avatarBlock}
              {nameBlock}
              {usernameBlock}
              {passwordBlock}
              {totpBlock}
              {presetBlocks}
              {folderBlock}
            </section>

            {/* Columna derecha: opciones, notas y campos adicionales */}
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("sectionOptions")}</h3>
              {websiteBlock}
              {categoryBlock}
              {tagsBlock}
              {notesBlock}
              {extrasBlock}
            </section>
          </div>
        )}
      </div>

      <DialogFooter className="shrink-0 items-center border-t px-6 py-4 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setFavorite(!favorite)}
          aria-pressed={favorite}
          title={favorite ? t("removeFromFavorites") : t("addToFavorites")}
        >
          <Star className={`h-4 w-4 ${favorite ? "fill-current text-yellow-500" : ""}`} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openTemplateDraft}
          title={t("saveAsTemplateTooltip")}
        >
          <BookmarkPlus className="mr-1 h-4 w-4" /> {t("saveAsTemplate")}
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleSave} disabled={!name || saving}>
            {initial ? t("saveChangesButton") : t("saveButton")}
          </Button>
        </div>
      </DialogFooter>

      <TemplateEditorDialog
        open={templateDraft !== null}
        onOpenChange={(isOpen) => !isOpen && setTemplateDraft(null)}
        initial={templateDraft ?? undefined}
      />

      <TaxonomyDialog
        open={taxonomyOpen}
        onOpenChange={setTaxonomyOpen}
        taxonomy={taxonomy}
        onCreate={onCreateTaxonomyItem}
        onRename={onRenameTaxonomyItem}
        onDelete={onDeleteTaxonomyItem}
      />
    </>
  );
}

interface RevealRequest {
  action: "view" | "copy";
  customFieldIndex?: number;
}

// Vista de solo lectura de un registro. Se pinta dentro del popup (DialogContent) de VaultView.
function EntryDetail({
  entry,
  folders,
  taxonomy,
  onEdit,
  onTrash,
  onRestore,
  onDeletePermanently,
  onToggleFavorite,
  onMoveToFolder,
  onClose,
}: {
  entry: Entry;
  folders: FolderData[];
  taxonomy: Taxonomy;
  onEdit: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onMoveToFolder: (folderId: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation("vault");
  const { requestOpen, dialog: openUrlDialog } = useOpenUrl();
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visibleCustomFields, setVisibleCustomFields] = useState<Record<number, boolean>>({});
  const [copiedCustomField, setCopiedCustomField] = useState<number | null>(null);
  const [revealRequest, setRevealRequest] = useState<RevealRequest | null>(null);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealError, setRevealError] = useState("");
  const [revealVerifying, setRevealVerifying] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>("root");
  const [historyOpen, setHistoryOpen] = useState(false);

  const closeRevealDialog = () => {
    setRevealRequest(null);
    setRevealPassword("");
    setRevealError("");
    setRevealVerifying(false);
  };

  const triggerCopiedFeedback = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const triggerCustomCopiedFeedback = (index: number) => {
    setCopiedCustomField(index);
    setTimeout(() => setCopiedCustomField(null), 1500);
  };

  const handleToggleShow = () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    setRevealRequest({ action: "view" });
  };

  const handleCopyClick = () => {
    if (showPassword && entry.password) {
      navigator.clipboard.writeText(entry.password);
      triggerCopiedFeedback();
      return;
    }
    setRevealRequest({ action: "copy" });
  };

  const handleToggleCustomShow = (index: number) => {
    if (visibleCustomFields[index]) {
      setVisibleCustomFields((prev) => ({ ...prev, [index]: false }));
      return;
    }
    setRevealRequest({ action: "view", customFieldIndex: index });
  };

  const handleCopyCustomClick = (index: number, value: string) => {
    if (visibleCustomFields[index]) {
      navigator.clipboard.writeText(value);
      triggerCustomCopiedFeedback(index);
      return;
    }
    setRevealRequest({ action: "copy", customFieldIndex: index });
  };

  const handleConfirmReveal = async () => {
    if (!revealPassword) {
      setRevealError(t("revealPasswordRequiredError"));
      return;
    }
    setRevealVerifying(true);
    setRevealError("");
    try {
      const ok = await invoke<boolean>("verify_master_password", { masterPassword: revealPassword });
      if (!ok) {
        setRevealError(t("revealWrongPasswordError"));
        setRevealVerifying(false);
        return;
      }
      if (!revealRequest) return;
      if (revealRequest.customFieldIndex === undefined) {
        setShowPassword(true);
        if (revealRequest.action === "copy" && entry.password) {
          navigator.clipboard.writeText(entry.password);
          triggerCopiedFeedback();
        }
      } else {
        const idx = revealRequest.customFieldIndex;
        setVisibleCustomFields((prev) => ({ ...prev, [idx]: true }));
        const value = entry.custom_fields?.[idx]?.value;
        if (revealRequest.action === "copy" && value) {
          navigator.clipboard.writeText(value);
          triggerCustomCopiedFeedback(idx);
        }
      }
      closeRevealDialog();
    } catch (e) {
      setRevealError(String(e));
      setRevealVerifying(false);
    }
  };

  const indexedFields = (entry.custom_fields ?? []).map((field, i) => ({ field, i }));
  const presetFields = indexedFields.filter((x) => x.field.is_preset);
  const extraFields = indexedFields.filter((x) => !x.field.is_preset);

  const typeLabel = entryTypeLabel(t, entry.entry_type);
  const folderLabel = entry.folder_id ? folderPath(folders, entry.folder_id) : t("vaultRootLabel");
  // Del más reciente al más antiguo (los eventos se guardan en orden cronológico).
  const historyEvents = [...(entry.history ?? [])].reverse();
  const entryCategory = taxonomy.categories.find((c) => c.id === entry.category_id);
  const entryTags = (entry.tag_ids ?? [])
    .map((id) => taxonomy.tags.find((tg) => tg.id === id))
    .filter((tg): tg is TaxonomyItem => !!tg);

  const renderFieldRow = (field: CustomFieldData, i: number) => {
    const sensitive = isFieldSensitive(field);
    return (
      <div key={i} className="rounded-md border bg-muted/30 p-3">
        <p className="mb-1 text-xs text-muted-foreground">{field.label}</p>
        {sensitive ? (
          <div className="flex items-center gap-1">
            <div className="mr-1 min-w-0 font-mono">
              {visibleCustomFields[i] ? (
                <FieldPlainValue field={field} onOpenUrl={requestOpen} />
              ) : (
                "•".repeat(10)
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleToggleCustomShow(i)}
              title={visibleCustomFields[i] ? t("hideButton") : t("showButton")}
            >
              {visibleCustomFields[i] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopyCustomClick(i, field.value)}
              title={t("copyTooltip")}
            >
              {copiedCustomField === i ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : (
          <FieldPlainValue field={field} onOpenUrl={requestOpen} />
        )}
      </div>
    );
  };

  return (
    <>
      <DialogHeader className="shrink-0 flex-row items-center gap-3 border-b px-6 py-4">
        <EntryAvatar
          name={entry.name}
          logo={entry.logo}
          mode={entry.avatar_mode}
          icon={entryIcon(entry.entry_type)}
          className="h-10 w-10"
          textClassName="text-base"
          iconClassName="h-5 w-5"
        />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base">{entry.name}</DialogTitle>
          <DialogDescription className="mt-1 truncate text-xs">
            {typeLabel} · {folderLabel}
          </DialogDescription>
        </div>
        <div className="flex shrink-0 gap-1">
          {entry.trashed ? (
            <>
              <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} title={t("historyTooltip")}>
                <History className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onRestore} title={t("restoreTooltip")}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDeletePermanently} title={t("deleteForeverTooltip")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={onToggleFavorite} title={t("favoriteTooltip")}>
                <Star className={`h-4 w-4 ${entry.favorite ? "fill-current text-yellow-500" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} title={t("historyTooltip")}>
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setMoveTarget(entry.folder_id ?? "root");
                  setMoveOpen(true);
                }}
                title={t("moveToFolderTooltip")}
              >
                <Move className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onEdit} title={t("editTooltip")}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onTrash} title={t("trashTooltip")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} title={t("closeTooltip")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5 text-sm">
        {(entryCategory || entryTags.length > 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {entryCategory && (
              <span className="rounded-full border px-2 py-0.5 text-xs">{entryCategory.name}</span>
            )}
            {entryTags.map((tg) => (
              <span key={tg.id} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                {tg.name}
              </span>
            ))}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {entry.username && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("detailUsername")}</p>
              <p className="break-words">{entry.username}</p>
            </div>
          )}
          {entry.password && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("detailPassword")}</p>
              <div className="flex items-center gap-1">
                <p className="mr-1 font-mono">{showPassword ? entry.password : "•".repeat(10)}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleShow}
                  title={showPassword ? t("hideButton") : t("showButton")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCopyClick} title={t("copyTooltip")}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
          {entry.totp_secret && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("detailTotp")}</p>
              <TotpDisplay secret={entry.totp_secret} accountName={entry.name} />
            </div>
          )}
          {entry.website && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("detailWebsite")}</p>
              <UrlValue value={entry.website} onOpen={requestOpen} />
            </div>
          )}
          {presetFields.map(({ field, i }) => renderFieldRow(field, i))}
          {entry.notes && (
            <div className="rounded-md border bg-muted/30 p-3 md:col-span-2">
              <p className="mb-1 text-xs text-muted-foreground">
                {entry.entry_type === "note" ? t("presetContent") : t("detailNotes")}
              </p>
              <p className="whitespace-pre-wrap break-words">{entry.notes}</p>
            </div>
          )}
        </div>

        {extraFields.length > 0 && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-3 text-xs font-semibold text-muted-foreground">{t("additionalFieldsLabel")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {extraFields.map(({ field, i }) => renderFieldRow(field, i))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="shrink-0 border-t px-6 py-3 text-xs text-muted-foreground sm:justify-between">
        <span>
          {t("createdLabel")}: {formatDate(entry.created_at)}
        </span>
        <span>
          {t("editedLabel")}: {formatDate(entry.updated_at)}
        </span>
      </DialogFooter>

      {openUrlDialog}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("historyDialogTitle")}</DialogTitle>
            <DialogDescription>{t("historyDialogDescription")}</DialogDescription>
          </DialogHeader>
          {historyEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
          ) : (
            <ol className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
              {historyEvents.map((ev, i) => (
                <li key={i} className="border-l-2 pl-3">
                  <p className="text-sm">{describeHistory(t as TFn, ev)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(ev.timestamp)}</p>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revealRequest !== null} onOpenChange={(isOpen) => !isOpen && closeRevealDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("revealDialogTitle")}</DialogTitle>
            <DialogDescription>{t("revealDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={revealPassword}
              onChange={(e) => setRevealPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmReveal()}
              autoFocus
            />
            {revealError && <p className="text-sm text-destructive">{revealError}</p>}
            <Button onClick={handleConfirmReveal} disabled={revealVerifying}>
              {revealVerifying ? t("revealVerifyingButton") : t("revealConfirmButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("moveToFolderDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select
              value={moveTarget}
              onValueChange={(v) => v && setMoveTarget(v)}
              items={folderSelectItems(folders, t("vaultRootLabel"))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">{t("vaultRootLabel")}</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {folderPath(folders, f.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={async () => {
                await onMoveToFolder(moveTarget === "root" ? null : moveTarget);
                setMoveOpen(false);
              }}
            >
              {t("moveButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}