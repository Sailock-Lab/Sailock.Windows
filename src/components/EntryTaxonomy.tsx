// src/components/EntryTaxonomy.tsx
// Etiquetas (varias por registro) y categorías (una por registro), reutilizables en toda la bóveda.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TaxonomyItem {
  id: string;
  name: string;
}

export interface Taxonomy {
  tags: TaxonomyItem[];
  categories: TaxonomyItem[];
}

export type TaxonomyKind = "tag" | "category";

export const EMPTY_TAXONOMY: Taxonomy = { tags: [], categories: [] };

// ---------- Selector de etiquetas: selección múltiple con creación al vuelo ----------

export function TagPicker({
  tags,
  selectedIds,
  onChange,
  onCreate,
}: {
  tags: TaxonomyItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<TaxonomyItem | null>;
}) {
  const { t } = useTranslation("vault");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = selectedIds
    .map((id) => tags.find((x) => x.id === id))
    .filter((x): x is TaxonomyItem => !!x);
  const q = query.trim().toLowerCase();
  const suggestions = tags.filter((x) => !selectedIds.includes(x.id) && x.name.toLowerCase().includes(q));
  const exact = tags.find((x) => x.name.toLowerCase() === q);
  const canCreate = q !== "" && !exact;

  const add = (id: string) => {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    setQuery("");
  };

  const create = async () => {
    const item = await onCreate(query.trim());
    if (item) add(item.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (exact) add(exact.id);
      else if (canCreate) void create();
    } else if (e.key === "Backspace" && query === "" && selectedIds.length > 0) {
      onChange(selectedIds.slice(0, -1));
    } else if (e.key === "Escape" && open) {
      e.stopPropagation(); // cierra la lista, no el popup
      setOpen(false);
    }
  };

  return (
    <div className="rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
            {tag.name}
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((id) => id !== tag.id))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={t("tagsPlaceholder")}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {open && (suggestions.length > 0 || canCreate) && (
        // onMouseDown evita que el input pierda el foco antes de registrar el clic
        <div onMouseDown={(e) => e.preventDefault()} className="mt-2 flex max-h-36 flex-col overflow-y-auto border-t pt-1">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => add(tag.id)}
              className="rounded px-2 py-1 text-left text-sm hover:bg-muted"
            >
              {tag.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={() => void create()}
              className="rounded px-2 py-1 text-left text-sm text-primary hover:bg-muted"
            >
              {t("tagCreate", { name: query.trim(), interpolation: { escapeValue: false } })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Gestor: crear, renombrar y eliminar etiquetas y categorías ----------

function TaxonomySection({
  kind,
  title,
  items,
  placeholder,
  onCreate,
  onRename,
  onDelete,
}: {
  kind: TaxonomyKind;
  title: string;
  items: TaxonomyItem[];
  placeholder: string;
  onCreate: (kind: TaxonomyKind, name: string) => Promise<TaxonomyItem | null>;
  onRename: (kind: TaxonomyKind, id: string, name: string) => Promise<boolean>;
  onDelete: (kind: TaxonomyKind, id: string) => Promise<void>;
}) {
  const { t } = useTranslation("vault");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const add = async () => {
    const value = draft.trim();
    if (!value) return;
    if (await onCreate(kind, value)) setDraft("");
  };

  const saveRename = async (id: string) => {
    const value = editValue.trim();
    if (!value) return;
    if (await onRename(kind, id, value)) setEditingId(null);
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>

      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button variant="outline" onClick={add} disabled={!draft.trim()}>
          {t("taxonomyAdd")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("taxonomyEmpty")}</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1 rounded-md border px-2 py-1">
              {editingId === item.id ? (
                <>
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(item.id);
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    className="h-8 flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveRename(item.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : confirmId === item.id ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t("taxonomyDeleteConfirm")}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-destructive"
                    onClick={async () => {
                      await onDelete(kind, item.id);
                      setConfirmId(null);
                    }}
                  >
                    {t("taxonomyDelete")}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t("taxonomyRename")}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditValue(item.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t("taxonomyDelete")}
                    onClick={() => setConfirmId(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TaxonomyDialog({
  open,
  onOpenChange,
  taxonomy,
  onCreate,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxonomy: Taxonomy;
  onCreate: (kind: TaxonomyKind, name: string) => Promise<TaxonomyItem | null>;
  onRename: (kind: TaxonomyKind, id: string, name: string) => Promise<boolean>;
  onDelete: (kind: TaxonomyKind, id: string) => Promise<void>;
}) {
  const { t } = useTranslation("vault");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("taxonomyDialogTitle")}</DialogTitle>
          <DialogDescription>{t("taxonomyDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <TaxonomySection
            kind="tag"
            title={t("taxonomyTagsTitle")}
            items={taxonomy.tags}
            placeholder={t("taxonomyNewTag")}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
          />
          <TaxonomySection
            kind="category"
            title={t("taxonomyCategoriesTitle")}
            items={taxonomy.categories}
            placeholder={t("taxonomyNewCategory")}
            onCreate={onCreate}
            onRename={onRename}
            onDelete={onDelete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}