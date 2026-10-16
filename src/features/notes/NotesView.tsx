// src/features/notes/NotesView.tsx
// Ventana Notas: notas seguras en markdown. Al verlas se muestran con formato; al editar, el texto en crudo.
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "@/components/MarkdownView";
import { Plus, Search, Star, Pencil, Trash2, Copy } from "lucide-react";

interface Note {
  id: string;
  title: string;
  content: string;
  favorite: boolean;
  created_at: number;
  updated_at: number;
}

const EMPTY_NOTE: Note = { id: "", title: "", content: "", favorite: false, created_at: 0, updated_at: 0 };

// Texto plano corto para la tarjeta: quita los símbolos de markdown más comunes.
function previewText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

type Popup = { note: Note; mode: "view" | "edit"; isNew: boolean };

export function NotesView() {
  const { t, i18n } = useTranslation("vault");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [popup, setPopup] = useState<Popup | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    try {
      setNotes(await invoke<Note[]>("load_notes"));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updated_at - a.updated_at),
    [notes]
  );
  const query = search.trim().toLowerCase();
  const visible = query
    ? sorted.filter((n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query))
    : sorted;

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" });

  const openNew = () => {
    setTitle("");
    setContent("");
    setPopup({ note: EMPTY_NOTE, mode: "edit", isNew: true });
  };
  const openView = (note: Note) => setPopup({ note, mode: "view", isNew: false });
  const startEdit = () => {
    if (!popup) return;
    setTitle(popup.note.title);
    setContent(popup.note.content);
    setPopup({ ...popup, mode: "edit" });
  };

  const dirty = popup?.mode === "edit" && (title !== popup.note.title || content !== popup.note.content);

  const closePopup = () => {
    setPopup(null);
    setDiscardOpen(false);
    setDeleteOpen(false);
  };
  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else closePopup();
  };
  const cancelEdit = () => {
    if (!popup) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    if (popup.isNew) closePopup();
    else setPopup({ ...popup, mode: "view" });
  };
  const discardChanges = () => {
    setDiscardOpen(false);
    closePopup();
  };

  const saveNote = async (note: Note) => invoke<Note>("save_note", { note });

  const handleSave = async () => {
    if (!popup) return;
    setSaving(true);
    try {
      const saved = await saveNote({ ...popup.note, title, content });
      toast.success(t("notesSavedToast"));
      setPopup({ note: saved, mode: "view", isNew: false });
      load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleFavorite = async (note: Note) => {
    try {
      const saved = await saveNote({ ...note, favorite: !note.favorite });
      setPopup((p) => (p && p.note.id === saved.id ? { ...p, note: saved } : p));
      load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDelete = async () => {
    if (!popup) return;
    try {
      await invoke("delete_note", { id: popup.note.id });
      toast.success(t("notesDeletedToast"));
      closePopup();
      load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleCopy = () => {
    if (!popup) return;
    navigator.clipboard
      .writeText(popup.note.content)
      .then(() => toast.success(t("notesCopiedToast")))
      .catch((e) => toast.error(String(e)));
  };

  const favoriteLabel = (n: Note) => (n.favorite ? t("notesFavoriteRemove") : t("notesFavoriteAdd"));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("notesViewTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("notesViewDescription")}</p>
        </div>
        <Button onClick={openNew} className="shrink-0">
          <Plus className="mr-1 h-4 w-4" /> {t("notesNewButton")}
        </Button>
      </div>

      {notes.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("notesSearchPlaceholder")}
            className="pl-9"
          />
        </div>
      )}

      {loaded && notes.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("notesEmpty")}</div>
      )}
      {loaded && notes.length > 0 && visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("notesNoResults")}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((note) => {
          const preview = previewText(note.content);
          return (
            <div
              key={note.id}
              role="button"
              tabIndex={0}
              onClick={() => openView(note)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openView(note);
                }
              }}
              className="flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold">{note.title}</p>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:bg-muted"
                  title={favoriteLabel(note)}
                  aria-label={favoriteLabel(note)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(note);
                  }}
                >
                  <Star className={`h-4 w-4 ${note.favorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground"}`} />
                </button>
              </div>
              <p className="line-clamp-3 min-h-[3.75rem] text-xs text-muted-foreground">{preview || t("notesEmptyContent")}</p>
              <p className="text-[11px] text-muted-foreground">{t("notesUpdatedOn", { date: formatDate(note.updated_at) })}</p>
            </div>
          );
        })}
      </div>

      <Dialog open={popup !== null} onOpenChange={(open) => !open && requestClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {popup && popup.mode === "view" && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <DialogTitle className="min-w-0 break-words">{popup.note.title}</DialogTitle>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleFavorite(popup.note)}
                      title={favoriteLabel(popup.note)}
                    >
                      <Star className={`h-4 w-4 ${popup.note.favorite ? "fill-yellow-400 text-yellow-500" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title={t("notesCopyButton")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEdit} title={t("notesEditButton")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteOpen(true)} title={t("notesDeleteButton")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <DialogDescription>{t("notesUpdatedOn", { date: formatDate(popup.note.updated_at) })}</DialogDescription>
              </DialogHeader>
              {popup.note.content.trim() ? (
                <MarkdownView source={popup.note.content} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("notesEmptyContent")}</p>
              )}
            </>
          )}

          {popup && popup.mode === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle>{popup.isNew ? t("notesNewTitle") : t("notesEditTitle")}</DialogTitle>
                <DialogDescription>{t("notesMarkdownHint")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("notesTitleLabel")}</label>
                  <Input
                    value={title}
                    maxLength={120}
                    placeholder={t("notesTitlePlaceholder")}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("notesContentLabel")}</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t("notesContentPlaceholder")}
                    spellCheck={false}
                    className="min-h-[18rem] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  {t("cancelButton")}
                </Button>
                <Button onClick={handleSave} disabled={!title.trim() || saving}>
                  {t("notesSaveButton")}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Diálogos anidados: van dentro del popup para no cerrarlo al interactuar con ellos. */}
          <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("notesDiscardTitle")}</DialogTitle>
                <DialogDescription>{t("notesDiscardDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDiscardOpen(false)}>
                  {t("notesDiscardKeepEditing")}
                </Button>
                <Button variant="destructive" onClick={discardChanges}>
                  {t("notesDiscardConfirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("notesDeleteTitle")}</DialogTitle>
                <DialogDescription>{t("notesDeleteDescription", { title: popup?.note.title ?? "" })}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  {t("cancelButton")}
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  {t("notesDeleteButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  );
}