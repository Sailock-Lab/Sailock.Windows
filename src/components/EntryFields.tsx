// src/components/EntryFields.tsx
// Piezas reutilizables de la Bóveda: tipos de campo, avatar/logo del registro
// y apertura segura de enlaces en el navegador.
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Eye, EyeOff, ExternalLink, ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------- Tipos de campo ----------

export type FieldType = "text" | "password" | "number" | "boolean" | "date" | "time" | "url" | "select";

export const FIELD_TYPES: FieldType[] = ["text", "password", "number", "boolean", "date", "time", "url", "select"];

// Clave de traducción (namespace "vault") de cada tipo
export const FIELD_TYPE_KEYS: Record<FieldType, string> = {
  text: "fieldTypeText",
  password: "fieldTypePassword",
  number: "fieldTypeNumber",
  boolean: "fieldTypeBoolean",
  date: "fieldTypeDate",
  time: "fieldTypeTime",
  url: "fieldTypeUrl",
  select: "fieldTypeSelect",
};

export interface CustomFieldData {
  label: string;
  value: string;
  field_type: string; // uno de FIELD_TYPES
  is_preset?: boolean;
  preset_key?: string | null;
  options?: string[]; // solo para el tipo "select": opciones definidas por el usuario para este campo
}

export function normalizedFieldType(type: string | undefined): FieldType {
  return (FIELD_TYPES as string[]).includes(type ?? "") ? (type as FieldType) : "text";
}

// Tipos cuyo valor es texto libre: al cambiar entre ellos se conserva el valor.
const TEXT_LIKE: FieldType[] = ["text", "password", "url"];
export function isValueCompatible(from: string | undefined, to: FieldType): boolean {
  return TEXT_LIKE.includes(normalizedFieldType(from)) && TEXT_LIKE.includes(to);
}

function formatDateValue(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- Entrada de hora: dos casillas con ":" en medio ----------

function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [h, m] = value.includes(":") ? value.split(":") : ["", ""];

  const emit = (nh: string, nm: string) => onChange(nh === "" && nm === "" ? "" : `${nh}:${nm}`);
  const clean = (raw: string, max: number) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    return digits !== "" && Number(digits) > max ? String(max) : digits;
  };
  const pad = (v: string) => (v.length === 1 ? `0${v}` : v);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputMode="numeric"
        placeholder="HH"
        aria-label="HH"
        maxLength={2}
        value={h}
        onChange={(e) => emit(clean(e.target.value, 23), m)}
        onBlur={() => emit(pad(h), m)}
        className="w-16 text-center"
      />
      <span className="text-muted-foreground">:</span>
      <Input
        inputMode="numeric"
        placeholder="MM"
        aria-label="MM"
        maxLength={2}
        value={m}
        onChange={(e) => emit(h, clean(e.target.value, 59))}
        onBlur={() => emit(h, pad(m))}
        className="w-16 text-center"
      />
    </div>
  );
}

// ---------- Entrada de valor según el tipo (formularios) ----------

export function FieldValueInput({
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

  if (type === "select") {
    const options = field.options ?? [];
    if (options.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("selectNoOptions")}</p>;
    }
    return (
      <Select value={field.value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder={t("selectPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

  if (type === "date") {
    // El selector de calendario lo aporta el propio sistema (WebView).
    return (
      <Input
        type="date"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
        className="dark:[color-scheme:dark]"
      />
    );
  }

  if (type === "time") {
    return <TimeInput value={field.value} onChange={onChange} />;
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

  if (type === "url") {
    return (
      <Input
        inputMode="url"
        placeholder="https://"
        value={field.value}
        onChange={(e) => onChange(e.target.value)}
      />
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

// ---------- Editor de opciones de un campo de lista desplegable ----------

export function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const { t } = useTranslation("vault");
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (!options.some((o) => o.toLowerCase() === value.toLowerCase())) {
      onChange([...options, value]);
    }
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{t("selectOptionsLabel")}</label>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={t("selectOptionPlaceholder")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <span key={option} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              {option}
              <button
                type="button"
                onClick={() => onChange(options.filter((o) => o !== option))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Enlaces: aviso antes de salir de Sailock ----------

const SKIP_PROMPT_KEY = "sailock.openLinksWithoutAsking";

function readSkipPrompt(): boolean {
  try {
    return localStorage.getItem(SKIP_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

// Para poder deshacer "No volver a preguntar" desde Ajustes.
export function resetOpenLinkPrompt() {
  try {
    localStorage.removeItem(SKIP_PROMPT_KEY);
  } catch {
    // sin almacenamiento disponible: no hay nada que borrar
  }
}

// Solo se permiten http(s). Si no trae esquema se asume https.
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Devuelve requestOpen(url) y el diálogo de confirmación, que hay que pintar en el JSX.
export function useOpenUrl() {
  const { t } = useTranslation("vault");
  const [pending, setPending] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);

  const openNow = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const requestOpen = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) {
      toast.error(t("urlInvalid"));
      return;
    }
    if (readSkipPrompt()) {
      void openNow(url);
      return;
    }
    setRemember(false);
    setPending(url);
  };

  const confirm = () => {
    if (!pending) return;
    if (remember) {
      try {
        localStorage.setItem(SKIP_PROMPT_KEY, "1");
      } catch {
        // si no se puede guardar, simplemente se volverá a preguntar
      }
    }
    const url = pending;
    setPending(null);
    void openNow(url);
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(isOpen) => !isOpen && setPending(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("openLinkTitle")}</DialogTitle>
          <DialogDescription>{t("openLinkDescription")}</DialogDescription>
        </DialogHeader>
        <p className="break-all rounded-md bg-muted p-2 font-mono text-xs">{pending}</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t("openLinkRemember")}
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)}>
            {t("cancelButton")}
          </Button>
          <Button onClick={confirm}>{t("openLinkConfirm")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { requestOpen, dialog };
}

export function UrlValue({ value, onOpen }: { value: string; onOpen: (url: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(value)}
      className="inline-flex max-w-full items-start gap-1.5 break-all text-left text-primary hover:underline"
    >
      <span>{value}</span>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    </button>
  );
}

// ---------- Valor de solo lectura según el tipo (detalle) ----------
// Las contraseñas las gestiona quien lo usa (necesitan pedir la contraseña maestra).

export function FieldPlainValue({
  field,
  onOpenUrl,
}: {
  field: CustomFieldData;
  onOpenUrl: (url: string) => void;
}) {
  const { t } = useTranslation("vault");
  const type = normalizedFieldType(field.field_type);

  if (type === "boolean") return <p>{field.value === "true" ? t("fieldValueYes") : t("fieldValueNo")}</p>;
  if (!field.value) return <p className="text-muted-foreground">—</p>;
  if (type === "date") return <p>{formatDateValue(field.value)}</p>;
  if (type === "time") return <p className="font-mono">{field.value}</p>;
  if (type === "url") return <UrlValue value={field.value} onOpen={onOpenUrl} />;
  return <p className="break-words">{field.value}</p>;
}

// ---------- Avatar del registro: icono del tipo, inicial o imagen del usuario ----------

export type AvatarMode = "type" | "initial" | "image";

// Sin modo guardado: con imagen se muestra la imagen, sin ella el icono del tipo.
export function resolveAvatarMode(mode: string | null | undefined, logo: string | null | undefined): AvatarMode {
  if (mode === "image") return logo ? "image" : "type";
  if (mode === "type" || mode === "initial") return mode;
  return logo ? "image" : "type";
}

function hueFromName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

type IconComponent = React.ComponentType<{ className?: string }>;

export function EntryAvatar({
  name,
  logo,
  mode,
  icon: Icon,
  className = "h-9 w-9",
  textClassName = "text-sm",
  iconClassName = "h-4 w-4",
}: {
  name: string;
  logo?: string | null;
  mode?: string | null;
  icon: IconComponent;
  className?: string;
  textClassName?: string;
  iconClassName?: string;
}) {
  const resolved = resolveAvatarMode(mode, logo);

  if (resolved === "image" && logo) {
    return <img src={logo} alt="" draggable={false} className={`${className} shrink-0 rounded-md object-cover`} />;
  }

  if (resolved === "initial") {
    const initial = (Array.from(name.trim())[0] ?? "?").toUpperCase();
    const hue = hueFromName(name);
    return (
      <div
        className={`${className} ${textClassName} flex shrink-0 items-center justify-center rounded-md font-semibold`}
        style={{ backgroundColor: `hsl(${hue} 55% 50% / 0.15)`, color: `hsl(${hue} 55% 42%)` }}
      >
        {initial}
      </div>
    );
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground`}>
      <Icon className={iconClassName} />
    </div>
  );
}

// Reduce la imagen que sube el usuario a un cuadrado de 128 px (recorte centrado)
// para que el registro pese poco. No se descarga ni se incluye ninguna imagen de fuera.
async function fileToLogoDataUrl(file: File, size = 128): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("too large");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("invalid image"));
      image.src = objectUrl;
    });
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AvatarPicker({
  name,
  icon,
  logo,
  mode,
  onChange,
}: {
  name: string;
  icon: IconComponent;
  logo: string | null;
  mode: AvatarMode;
  onChange: (next: { logo: string | null; mode: AvatarMode }) => void;
}) {
  const { t } = useTranslation("vault");
  const inputRef = useRef<HTMLInputElement>(null);

  const options: { id: AvatarMode; label: string }[] = [
    { id: "type", label: t("avatarType") },
    { id: "initial", label: t("avatarInitial") },
    { id: "image", label: t("avatarImage") },
  ];

  const choose = (id: AvatarMode) => {
    if (id === "image" && !logo) {
      inputRef.current?.click(); // sin imagen todavía: se pide una
      return;
    }
    onChange({ logo, mode: id });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      onChange({ logo: await fileToLogoDataUrl(file), mode: "image" });
    } catch {
      toast.error(t("logoInvalid"));
    }
  };

  return (
    <div className="flex items-center gap-3">
      <EntryAvatar name={name} logo={logo} mode={mode} icon={icon} className="h-14 w-14" textClassName="text-xl" iconClassName="h-6 w-6" />
      <div className="flex flex-col gap-1.5">
        <div className="inline-flex self-start rounded-md border p-0.5">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={mode === option.id}
              onClick={() => choose(option.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === option.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {logo ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <ImagePlus className="mr-1 h-4 w-4" />
              {t("logoChange")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ logo: null, mode: mode === "image" ? "type" : mode })}
            >
              <X className="mr-1 h-4 w-4" />
              {t("logoRemove")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}