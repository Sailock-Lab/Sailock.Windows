// src/features/notes/NotesView.tsx
// Ventana Notas: notas seguras en markdown. Al verlas se muestran con formato; al editar, el texto en crudo.
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Plus, Search, Star, Pencil, Trash2, Copy, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, ListChecks, Quote, Code, SquareCode, Link2, Minus, Table2,
} from "lucide-react";
import {
  Align, EditResult, ListKind, codeBlock, insertDivider, insertLink, insertTable, setAlign, setHeading,
  toggleList, wrapSelection,
} from "@/lib/markdownEditing";

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
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

// Botón de la barra de formato. Al pulsarlo no le quita el foco al texto, para conservar la selección.
function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolSeparator() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />;
}

type EditorView = "write" | "split" | "preview";

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
  const [editorView, setEditorView] = useState<EditorView>("split");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Aplica una operación del editor sobre la selección actual. Se usa execCommand para que Ctrl+Z
  // siga deshaciendo los cambios; si no estuviera disponible, se cambia el texto directamente.
  const applyEdit = (operation: (value: string, start: number, end: number) => EditResult) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const current = ta.value;
    const result = operation(current, ta.selectionStart, ta.selectionEnd);
    if (result.value === current) return;
    ta.focus();
    let p = 0;
    while (p < current.length && p < result.value.length && current[p] === result.value[p]) p++;
    let a = current.length;
    let b = result.value.length;
    while (a > p && b > p && current[a - 1] === result.value[b - 1]) {
      a--;
      b--;
    }
    ta.setSelectionRange(p, a);
    const inserted = result.value.slice(p, b);
    const done = inserted === "" ? document.execCommand("delete") : document.execCommand("insertText", false, inserted);
    if (!done || ta.value !== result.value) setContent(result.value);
    requestAnimationFrame(() => ta.setSelectionRange(result.start, result.end));
  };

  const fmt = {
    bold: () => applyEdit((v, s, e) => wrapSelection(v, s, e, "**", "**", t("notesPhText"))),
    italic: () => applyEdit((v, s, e) => wrapSelection(v, s, e, "_", "_", t("notesPhText"))),
    underline: () => applyEdit((v, s, e) => wrapSelection(v, s, e, "<u>", "</u>", t("notesPhText"))),
    strike: () => applyEdit((v, s, e) => wrapSelection(v, s, e, "~~", "~~", t("notesPhText"))),
    code: () => applyEdit((v, s, e) => wrapSelection(v, s, e, "`", "`", t("notesPhCode"))),
    codeBlock: () => applyEdit((v, s, e) => codeBlock(v, s, e, t("notesPhCode"))),
    link: () => applyEdit((v, s, e) => insertLink(v, s, e, t("notesPhLink"))),
    heading: (level: number) => applyEdit((v, s, e) => setHeading(v, s, e, level)),
    align: (align: Align) => applyEdit((v, s, e) => setAlign(v, s, e, align)),
    list: (kind: ListKind) => applyEdit((v, s, e) => toggleList(v, s, e, kind)),
    divider: () => applyEdit((v, _s, e) => insertDivider(v, e)),
    table: () =>
      applyEdit((v, _s, e) => insertTable(v, e, (n) => t("notesPhTableColumn", { n }), t("notesPhTableCell"))),
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (!e.shiftKey && key === "b") {
      e.preventDefault();
      fmt.bold();
    } else if (!e.shiftKey && key === "i") {
      e.preventDefault();
      fmt.italic();
    } else if (!e.shiftKey && key === "u") {
      e.preventDefault();
      fmt.underline();
    } else if (!e.shiftKey && key === "s") {
      e.preventDefault();
      if (title.trim() && !saving) handleSave();
    }
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
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${popup?.mode === "edit" ? "sm:max-w-5xl" : "sm:max-w-3xl"}`}
        >
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
                <DialogDescription>{t("notesEditorHint")}</DialogDescription>
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
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-medium">{t("notesContentLabel")}</label>
                    <div role="group" className="flex rounded-md border p-0.5">
                      {(["write", "split", "preview"] as EditorView[]).map((view) => (
                        <button
                          key={view}
                          type="button"
                          aria-pressed={editorView === view}
                          onClick={() => setEditorView(view)}
                          className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
                            editorView === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {t(view === "write" ? "notesViewWrite" : view === "split" ? "notesViewSplit" : "notesViewPreview")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editorView !== "preview" && (
                    <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border bg-muted/30 p-1">
                      <ToolButton label={`${t("notesBold")} (Ctrl+B)`} onClick={fmt.bold}><Bold className="h-4 w-4" /></ToolButton>
                      <ToolButton label={`${t("notesItalic")} (Ctrl+I)`} onClick={fmt.italic}><Italic className="h-4 w-4" /></ToolButton>
                      <ToolButton label={`${t("notesUnderline")} (Ctrl+U)`} onClick={fmt.underline}><Underline className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesStrike")} onClick={fmt.strike}><Strikethrough className="h-4 w-4" /></ToolButton>
                      <ToolSeparator />
                      {[1, 2, 3, 4, 5, 6].map((level) => (
                        <ToolButton key={level} label={t("notesHeading", { level })} onClick={() => fmt.heading(level)}>
                          <span className="text-xs font-semibold">H{level}</span>
                        </ToolButton>
                      ))}
                      <ToolSeparator />
                      <ToolButton label={t("notesAlignLeft")} onClick={() => fmt.align("left")}><AlignLeft className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesAlignCenter")} onClick={() => fmt.align("center")}><AlignCenter className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesAlignRight")} onClick={() => fmt.align("right")}><AlignRight className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesAlignJustify")} onClick={() => fmt.align("justify")}><AlignJustify className="h-4 w-4" /></ToolButton>
                      <ToolSeparator />
                      <ToolButton label={t("notesBulletList")} onClick={() => fmt.list("ul")}><List className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesNumberedList")} onClick={() => fmt.list("ol")}><ListOrdered className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesTaskList")} onClick={() => fmt.list("task")}><ListChecks className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesQuote")} onClick={() => fmt.list("quote")}><Quote className="h-4 w-4" /></ToolButton>
                      <ToolSeparator />
                      <ToolButton label={t("notesInlineCode")} onClick={fmt.code}><Code className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesCodeBlock")} onClick={fmt.codeBlock}><SquareCode className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesLink")} onClick={fmt.link}><Link2 className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesDivider")} onClick={fmt.divider}><Minus className="h-4 w-4" /></ToolButton>
                      <ToolButton label={t("notesTable")} onClick={fmt.table}><Table2 className="h-4 w-4" /></ToolButton>
                    </div>
                  )}

                  <div className={`grid gap-3 ${editorView === "split" ? "md:grid-cols-2" : ""}`}>
                    {editorView !== "preview" && (
                      <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleEditorKeyDown}
                        placeholder={t("notesContentPlaceholder")}
                        spellCheck={false}
                        className="h-[50vh] min-h-[18rem] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                    )}
                    {editorView !== "write" && (
                      <div
                        className="h-[50vh] min-h-[18rem] overflow-y-auto rounded-md border bg-muted/20 px-3 py-2"
                        aria-label={t("notesPreviewLabel")}
                      >
                        {content.trim() ? (
                          <MarkdownView source={content} />
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("notesPreviewEmpty")}</p>
                        )}
                      </div>
                    )}
                  </div>
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