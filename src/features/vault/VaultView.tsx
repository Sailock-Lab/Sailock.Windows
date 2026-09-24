import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  Plus,
  KeyRound,
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
  IdCard,
  CreditCard,
  StickyNote,
  Wifi,
  Sparkles,
  List,
  LayoutGrid,
  Folder,
  FolderPlus,
  Move,
  LucideIcon,
  Home,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useActivity } from "@/hooks/useActivity";

interface CustomFieldData {
  label: string;
  value: string;
  field_type: string; // "text" | "password" | "number" | "boolean"
  is_preset?: boolean;
  preset_key?: string | null;
}

interface FolderData {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
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
  favorite: boolean;
  trashed: boolean;
  created_at: number;
  updated_at: number;
}

type FormMode = "create" | "edit" | null;
type Filter = "all" | "favorites" | "trash";
type SearchCategory = "all" | "name" | "contact" | "website" | "custom";
type ViewMode = "list" | "gallery";

function normalizedFieldType(type: string | undefined): "text" | "password" | "number" | "boolean" {
  return type === "password" || type === "number" || type === "boolean" ? type : "text";
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
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

interface TemplateFieldPreset {
  labelKey: string;
  type: "text" | "password" | "number" | "boolean";
}

interface EntryTemplate {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  nameLabelKey: string;
  showUsername: boolean;
  showPassword: boolean;
  showWebsite: boolean;
  showTotp: boolean;
  presetFields: TemplateFieldPreset[];
}

const TEMPLATES: EntryTemplate[] = [
  {
    id: "password",
    icon: KeyRound,
    labelKey: "templatePassword",
    nameLabelKey: "fieldName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: true,
    presetFields: [{ labelKey: "presetEmail", type: "text" }],
  },
  {
    id: "identity",
    icon: IdCard,
    labelKey: "templateIdentity",
    nameLabelKey: "presetFullName",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetIdDocument", type: "password" },
      { labelKey: "presetDateOfBirth", type: "text" },
      { labelKey: "presetNationality", type: "text" },
      { labelKey: "presetAddress", type: "text" },
      { labelKey: "presetCity", type: "text" },
      { labelKey: "presetStateProvince", type: "text" },
      { labelKey: "presetPostalCode", type: "text" },
      { labelKey: "presetCountry", type: "text" },
      { labelKey: "presetPhone", type: "text" },
      { labelKey: "presetEmail", type: "text" },
    ],
  },
  {
    id: "card",
    icon: CreditCard,
    labelKey: "templateCard",
    nameLabelKey: "presetCardName",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetCardHolder", type: "text" },
      { labelKey: "presetCardNumber", type: "password" },
      { labelKey: "presetExpiryDate", type: "text" },
      { labelKey: "presetCvv", type: "password" },
      { labelKey: "presetPin", type: "password" },
      { labelKey: "presetBank", type: "text" },
      { labelKey: "presetCardType", type: "text" },
    ],
  },
  {
    id: "note",
    icon: StickyNote,
    labelKey: "templateNote",
    nameLabelKey: "presetTitle",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [],
  },
  {
    id: "wifi",
    icon: Wifi,
    labelKey: "templateWifi",
    nameLabelKey: "presetSsid",
    showUsername: false,
    showPassword: true,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetSecurityType", type: "text" },
      { labelKey: "presetWifiUsername", type: "text" },
      { labelKey: "presetAuthMethod", type: "text" },
    ],
  },
  {
    id: "custom",
    icon: Sparkles,
    labelKey: "templateCustom",
    nameLabelKey: "fieldName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: true,
    presetFields: [],
  },
];

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  password: KeyRound,
  identity: IdCard,
  card: CreditCard,
  note: StickyNote,
  wifi: Wifi,
  custom: Sparkles,
};

function entryIcon(entryType?: string | null): LucideIcon {
  return (entryType && TEMPLATE_ICONS[entryType]) || KeyRound;
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
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<FolderData | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { saveActivity } = useActivity();

  const loadEntries = async () => {
    const result = await invoke<Entry[]>("load_entries");
    setEntries(result);
  };

  const loadFolders = async () => {
    const result = await invoke<FolderData[]>("load_folders");
    setFolders(result);
  };

  useEffect(() => {
    loadEntries();
    loadFolders();
  }, []);

  useEffect(() => {
    if (prefillPassword) {
      setPendingPassword(prefillPassword);
      setSelectedTemplate(TEMPLATES.find((tpl) => tpl.id === "password") ?? null);
      setFormMode("create");
      setSelectedId(null);
    }
  }, [prefillPassword]);

  const browsingMode = filter === "all" && !search;
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
    if (browsingMode && (e.folder_id ?? null) !== currentFolderId) return false;
    return matchesSearch(e, search, searchCategory);
  });

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const panelOpen = formMode !== null || selectedId !== null;

  const closePanel = () => {
    setSelectedId(null);
    setFormMode(null);
    setPendingPassword(null);
    setSelectedTemplate(null);
    onPrefillConsumed?.();
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const entry = entries.find((e) => e.id === id);
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

  const handleDeletePermanently = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    await invoke("delete_entry", { id });
    if (entry) {
      await saveActivity("delete", "entryDeletedForever", "vault", { name: entry.name });
    }
    closePanel();
    loadEntries();
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
            <Select value={searchCategory} onValueChange={(v) => v && setSearchCategory(v as SearchCategory)}>
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
              <Button variant={filter === "trash" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("trash")}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("filterTrash")}
              </Button>
              <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("typeFilterAll")}</SelectItem>
                  {TEMPLATES.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {t(tpl.labelKey)}
                    </SelectItem>
                  ))}
                  <SelectItem value="uncategorized">{t("templateUncategorized")}</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="flex flex-col gap-1">
              {currentSubfolders.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-1">
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
              )}
              {currentSubfolders.length > 0 && visible.length > 0 && (
                <div className="my-2 border-t" />
              )}
              {visible.map((entry) => {
                const Icon = entryIcon(entry.entry_type);
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setSelectedId(entry.id);
                      setFormMode(null);
                    }}
                    className={`group flex items-center gap-3 rounded-md p-2 text-left hover:bg-muted ${selectedId === entry.id ? "bg-muted" : ""
                      }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
                          {entry.entry_type ? t(TEMPLATES.find((tp) => tp.id === entry.entry_type)?.labelKey ?? "templateUncategorized") : t("templateUncategorized")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {t("editedLabel")}: {formatDate(entry.updated_at)}
                      </p>
                    </div>
                    {renderFavoriteStar(entry)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {currentSubfolders.length > 0 && (
                <div className="col-span-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-1">
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
              )}
              {currentSubfolders.length > 0 && visible.length > 0 && (
                <div className="col-span-full my-1 border-t" />
              )}
              {visible.map((entry) => {
                const Icon = entryIcon(entry.entry_type);
                return (
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      {renderFavoriteStar(entry)}
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate">{entry.name}</p>
                      <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded inline-block mt-1">
                        {entry.entry_type ? t(TEMPLATES.find((tp) => tp.id === entry.entry_type)?.labelKey ?? "templateUncategorized") : t("templateUncategorized")}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-auto pt-2 border-t">
                      <p>{t("createdLabel")}: {formatDate(entry.created_at)}</p>
                      <p>{t("editedLabel")}: {formatDate(entry.updated_at)}</p>
                    </div>
                  </button>
                );
              })}
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

      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("templatePickerTitle")}</DialogTitle>
            <DialogDescription>{t("templatePickerDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setTemplatePickerOpen(false);
                    setFormMode("create");
                    setSelectedId(null);
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center hover:bg-muted hover:border-primary transition-colors"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium">{t(tpl.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

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
                template={selectedTemplate ?? TEMPLATES.find((tpl) => tpl.id === "custom")!}
                defaultFolderId={currentFolderId}
                onSaved={() => { setFormMode(null); setPendingPassword(null); setSelectedTemplate(null); loadEntries(); }}
                onClose={closePanel}
              />
            )}
            {formMode === "edit" && selected && (
              <EntryForm initial={selected} onSaved={() => { setFormMode(null); loadEntries(); }} onClose={closePanel} />
            )}
            {formMode === null && selected && (
              <EntryDetail
                key={selected.id}
                entry={selected}
                folders={folders}
                onEdit={() => setFormMode("edit")}
                onTrash={() => handleTrash(selected.id)}
                onRestore={() => handleRestore(selected.id)}
                onDeletePermanently={() => handleDeletePermanently(selected.id)}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

function CustomFieldValueInput({
  field,
  onChange,
}: {
  field: CustomFieldData;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("vault");
  const [visible, setVisible] = useState(false);
  const type = normalizedFieldType(field.field_type);

  if (type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch checked={field.value === "true"} onCheckedChange={(v) => onChange(v ? "true" : "false")} />
        <span className="text-sm text-muted-foreground">
          {field.value === "true" ? t("fieldValueYes") : t("fieldValueNo")}
        </span>
      </div>
    );
  }

  if (type === "number") {
    return (
      <Input
        type="number"
        placeholder={t("customFieldValuePlaceholder")}
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (type === "password") {
    return (
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          placeholder={t("customFieldValuePlaceholder")}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <Input
      placeholder={t("customFieldValuePlaceholder")}
      value={field.value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function EntryForm({
  initial,
  initialPassword,
  template,
  defaultFolderId,
  onSaved,
  onClose,
}: {
  initial?: Entry;
  initialPassword?: string;
  template?: EntryTemplate;
  defaultFolderId?: string | null;
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
  const [customFields, setCustomFields] = useState<CustomFieldData[]>(() => {
    if (initial) {
      return (initial.custom_fields ?? []).map((f) => ({ ...f, field_type: normalizedFieldType(f.field_type) }));
    }
    if (activeTemplate) {
      return activeTemplate.presetFields.map((f) => ({
        label: t(f.labelKey),
        value: "",
        field_type: f.type,
        is_preset: true,
        preset_key: f.labelKey,
      }));
    }
    return [];
  });
  const { saveActivity } = useActivity();

  const showUsername = initial ? true : activeTemplate ? activeTemplate.showUsername : true;
  const showPasswordField = initial ? true : activeTemplate ? activeTemplate.showPassword : true;
  const showWebsite = initial ? true : activeTemplate ? activeTemplate.showWebsite : true;
  const showTotp = initial ? true : activeTemplate ? activeTemplate.showTotp : true;
  const nameLabel = !initial && activeTemplate ? t(activeTemplate.nameLabelKey) : t("fieldName");
  const notesLabel = !initial && activeTemplate?.id === "note" ? t("presetContent") : t("fieldNotes");
  const entryTypeToSave = initial ? initial.entry_type ?? null : activeTemplate ? activeTemplate.id : null;

  const indexedFields = customFields.map((field, i) => ({ field, i }));
  const presetIndexed = indexedFields.filter((x) => x.field.is_preset);
  const customIndexed = indexedFields.filter((x) => !x.field.is_preset);

  const addCustomField = () => {
    setCustomFields([...customFields, { label: "", value: "", field_type: "text", is_preset: false, preset_key: null }]);
  };
  const updateCustomField = (index: number, key: "label" | "value" | "field_type", val: string) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, [key]: val } : f)));
  };
  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name) return;
    const payload = {
      name,
      folder: initial?.folder ?? null,
      username: (showUsername ? username : "") || null,
      password: (showPasswordField ? password : "") || null,
      website: (showWebsite ? website : "") || null,
      notes: notes || null,
      customFields: customFields.filter((f) => f.is_preset || f.label.trim() !== ""),
      totpSecret: (showTotp ? totpSecret : "").trim() || null,
      entryType: entryTypeToSave,
    };
    if (initial) {
      await invoke("update_entry", { id: initial.id, ...payload });
      await saveActivity("edit", "entryEdited", "vault", { name });
    } else {
      await invoke("save_entry", { ...payload, folderId: defaultFolderId ?? null });
      await saveActivity("create", "entryCreated", "vault", { name });
    }
    onSaved();
  };

  return (
    <Card className="h-full flex flex-col rounded-none border-l shadow-2xl">
      <CardHeader className="flex flex-row items-center justify-between shrink-0">
        <CardTitle>{initial ? t("formTitleEdit") : t("formTitleNew")}</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto flex flex-col gap-3">
        {initialPassword && !initial && (
          <p className="text-xs text-muted-foreground bg-muted rounded p-2">{t("prefillNotice")}</p>
        )}
        <div>
          <label className="text-sm font-medium block mb-1">{nameLabel}</label>
          <Input
            placeholder={t("fieldNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!!initialPassword}
          />
        </div>

        {showUsername && (
          <div>
            <label className="text-sm font-medium block mb-1">{t("fieldUsername")}</label>
            <Input placeholder={t("optional")} value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        )}

        {showPasswordField && (
          <div>
            <label className="text-sm font-medium block mb-1">{t("fieldPassword")}</label>
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
        )}

        {showWebsite && (
          <div>
            <label className="text-sm font-medium block mb-1">{t("fieldWebsite")}</label>
            <Input placeholder={t("optional")} value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        )}

        {showTotp && (
          <div>
            <label className="text-sm font-medium block mb-1">{t("fieldTotpSecret")}</label>
            <Input
              placeholder={t("fieldTotpPlaceholder")}
              value={totpSecret}
              onChange={(e) => setTotpSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{t("fieldTotpHint")}</p>
          </div>
        )}

        {presetIndexed.map(({ field, i }) => {
          const isSecurityTypeField = field.preset_key === "presetSecurityType";
          return (
            <div key={i}>
              <label className="text-sm font-medium block mb-1">{field.label}</label>
              {isSecurityTypeField ? (
                <Select value={field.value} onValueChange={(v) => v && updateCustomField(i, "value", v)}>
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
                <CustomFieldValueInput field={field} onChange={(val) => updateCustomField(i, "value", val)} />
              )}
            </div>
          );
        })}

        <div>
          <label className="text-sm font-medium block mb-1">{notesLabel}</label>
          <textarea
            placeholder={t("optional")}
            className="border rounded p-2 bg-transparent text-sm min-h-20 w-full"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t("customFieldsLabel")}</label>
            <Button variant="ghost" size="sm" onClick={addCustomField}>
              <Plus className="h-4 w-4 mr-1" /> {t("addFieldButton")}
            </Button>
          </div>
          {customIndexed.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("customFieldsEmptyHint")}</p>
          )}
          {customIndexed.map(({ field, i }) => (
            <div key={i} className="border rounded-md p-2 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <Input
                  placeholder={t("customFieldNamePlaceholder")}
                  value={field.label}
                  onChange={(e) => updateCustomField(i, "label", e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={normalizedFieldType(field.field_type)}
                  onValueChange={(v) => v && updateCustomField(i, "field_type", v)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t("fieldTypeText")}</SelectItem>
                    <SelectItem value="password">{t("fieldTypePassword")}</SelectItem>
                    <SelectItem value="number">{t("fieldTypeNumber")}</SelectItem>
                    <SelectItem value="boolean">{t("fieldTypeBoolean")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeCustomField(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CustomFieldValueInput field={field} onChange={(val) => updateCustomField(i, "value", val)} />
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave}>{initial ? t("saveChangesButton") : t("saveButton")}</Button>
          <Button variant="ghost" onClick={onClose}>
            {t("cancelButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface RevealRequest {
  action: "view" | "copy";
  customFieldIndex?: number;
}

function EntryDetail({
  entry,
  folders,
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
  onEdit: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onMoveToFolder: (folderId: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation("vault");
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
  const customFields = indexedFields.filter((x) => !x.field.is_preset);

  const renderFieldRow = (field: CustomFieldData, i: number) => {
    const type = normalizedFieldType(field.field_type);
    return (
      <div key={i}>
        <p className="text-muted-foreground text-xs mb-1">{field.label}</p>
        {type === "boolean" ? (
          <p>{field.value === "true" ? t("fieldValueYes") : t("fieldValueNo")}</p>
        ) : type === "password" ? (
          <div className="flex items-center gap-1">
            <p className="font-mono mr-1">{visibleCustomFields[i] ? field.value : "•".repeat(10)}</p>
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
          <p>{field.value}</p>
        )}
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col rounded-none border-l shadow-2xl"><CardHeader className="flex flex-row items-center justify-between shrink-0">
      <CardTitle>{entry.name}</CardTitle>
      <div className="flex gap-1">
        {entry.trashed ? (
          <>
            <Button variant="ghost" size="icon" onClick={onRestore} title={t("restoreTooltip")}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="icon" title={t("deleteForeverTooltip")} />}>
                <Trash2 className="h-4 w-4" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteConfirmTitle", { name: entry.name })}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("deleteConfirmCancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeletePermanently}>{t("deleteConfirmAction")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" onClick={onToggleFavorite} title={t("favoriteTooltip")}>
              <Star className={`h-4 w-4 ${entry.favorite ? "fill-current text-yellow-500" : ""}`} />
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
    </CardHeader>
      <CardContent className="flex-1 overflow-y-auto flex flex-col gap-3 text-sm">
        {entry.username && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">{t("detailUsername")}</p>
            <p>{entry.username}</p>
          </div>
        )}
        {entry.password && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">{t("detailPassword")}</p>
            <div className="flex items-center gap-1">
              <p className="font-mono mr-1">{showPassword ? entry.password : "•".repeat(10)}</p>
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
          <div>
            <p className="text-muted-foreground text-xs mb-1">{t("detailTotp")}</p>
            <TotpDisplay secret={entry.totp_secret} accountName={entry.name} />
          </div>
        )}
        {entry.website && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">{t("detailWebsite")}</p>
            <p className="text-primary">{entry.website}</p>
          </div>
        )}
        {entry.notes && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">
              {entry.entry_type === "note" ? t("presetContent") : t("detailNotes")}
            </p>
            <p>{entry.notes}</p>
          </div>
        )}
        {presetFields.map(({ field, i }) => renderFieldRow(field, i))}

        {customFields.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              {t("customFieldsLabel")}
            </p>
            <div className="flex flex-col gap-3">
              {customFields.map(({ field, i }) => renderFieldRow(field, i))}
            </div>
          </div>
        )}
      </CardContent>

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
            <Select value={moveTarget} onValueChange={(v) => v && setMoveTarget(v)}>
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
    </Card>
  );
}