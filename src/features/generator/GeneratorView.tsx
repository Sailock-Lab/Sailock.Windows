import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Minus,
  Plus,
  RefreshCw,
  Save,
  Download,
  Trash2,
  Key,
  Type,
  LayoutGrid,
  History,
  SlidersHorizontal,
  ShieldCheck,
  User,
} from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { useVault } from "../../hooks/useVault";
import { useActivity } from "@/hooks/useActivity";
import { useGeneratorHistory, GeneratorHistoryEntry } from "@/hooks/useGeneratorHistory";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Aleatoriedad                                                       */
/* ------------------------------------------------------------------ */

// Genera un entero aleatorio en [0, max) sin sesgo de módulo: en vez de recortar
// un número de 32 bits con "% max" (lo que favorece ligeramente a los valores bajos
// cuando max no divide exactamente 2^32), descarta y vuelve a tirar hasta caer
// dentro del rango que sí se reparte exactamente entre todas las opciones.
function secureRandomInt(max: number): number {
  if (max <= 1) return 0; // evita división por cero y bucle infinito
  const array = new Uint32Array(1);
  const maxValid = Math.floor(0x100000000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= maxValid);
  return value % max;
}

function secureShuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Entropía y fuerza                                                  */
/* ------------------------------------------------------------------ */

function entropyBits(length: number, alphabetSize: number): number {
  if (alphabetSize <= 1 || length <= 0) return 0;
  return Math.round(length * Math.log2(alphabetSize));
}

interface Strength {
  label: string;
  textClass: string;
  barClass: string;
  pct: number;
}

/**
 * Una única escala de fuerza para toda la vista. `thresholds` permite
 * ajustarla por tipo de secreto (un código de respaldo de un solo uso no
 * necesita los mismos bits que una contraseña maestra).
 */
function strengthFromBits(
  bits: number,
  t: (key: string) => string,
  thresholds: [number, number, number] = [45, 65, 90]
): Strength {
  const [weak, fair, strong] = thresholds;
  const pct = Math.max(4, Math.min(100, Math.round((bits / (strong * 1.4)) * 100)));
  if (bits < weak) return { label: t("strengthWeak"), textClass: "text-red-500", barClass: "bg-red-500", pct };
  if (bits < fair) return { label: t("strengthFair"), textClass: "text-amber-500", barClass: "bg-amber-500", pct };
  if (bits < strong) return { label: t("strengthStrong"), textClass: "text-green-500", barClass: "bg-green-500", pct };
  return { label: t("strengthVeryStrong"), textClass: "text-emerald-600", barClass: "bg-emerald-600", pct };
}

function StrengthMeter({ strength, bits, unitLabel }: { strength: Strength; bits: number; unitLabel: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-sm font-medium ${strength.textClass}`}>
          <span className="h-2 w-2 rounded-full bg-current inline-block" />
          {strength.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {bits} {unitLabel}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${strength.barClass}`} style={{ width: `${strength.pct}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Alfabetos y generadores                                            */
/* ------------------------------------------------------------------ */

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}<>?";
const AMBIGUOUS = "l1I0O";

/** Devuelve un grupo de caracteres por cada clase activa, ya filtrado. */
function buildPasswordPools(
  uppercase: boolean,
  lowercase: boolean,
  numbers: boolean,
  symbols: boolean,
  exclude: string
): string[] {
  const excludeSet = new Set(exclude.split(""));
  const clean = (source: string) =>
    source
      .split("")
      .filter((c) => !excludeSet.has(c))
      .join("");

  const pools: string[] = [];
  if (uppercase) pools.push(clean(UPPER));
  if (lowercase) pools.push(clean(LOWER));
  if (numbers) pools.push(clean(NUMBERS));
  if (symbols) pools.push(clean(SYMBOLS));
  return pools.filter((p) => p.length > 0);
}

/**
 * Garantiza al menos un carácter de cada clase activa y luego baraja,
 * en vez de sortear del pool entero (donde una contraseña podía salir
 * sin ningún símbolo pese a tener los símbolos activados).
 */
function generatePassword(
  length: number,
  uppercase: boolean,
  lowercase: boolean,
  numbers: boolean,
  symbols: boolean,
  exclude: string
): string {
  const pools = buildPasswordPools(uppercase, lowercase, numbers, symbols, exclude);
  if (pools.length === 0) return "";
  const full = pools.join("");

  const chars: string[] = [];
  for (const pool of pools) {
    if (chars.length >= length) break;
    chars.push(pool[secureRandomInt(pool.length)]);
  }
  while (chars.length < length) chars.push(full[secureRandomInt(full.length)]);

  return secureShuffle(chars).join("");
}

const ADJECTIVES = ["Rapido", "Sereno", "Astuto", "Firme", "Nitido", "Sutil", "Vivido", "Claro", "Fuerte", "Ligero"];
const NOUNS = ["Lobo", "Halcon", "Roble", "Rio", "Faro", "Cedro", "Tigre", "Nube", "Puma", "Lince"];

function generateUsername(includeNumber: boolean): string {
  const adjective = ADJECTIVES[secureRandomInt(ADJECTIVES.length)];
  const noun = NOUNS[secureRandomInt(NOUNS.length)];
  const number = includeNumber ? secureRandomInt(900) + 100 : "";
  return `${adjective}${noun}${number}`;
}

const WORDLIST = [
  "arbol", "rio", "luna", "sol", "mar", "monte", "nube", "piedra", "flor", "hoja",
  "rama", "fuego", "agua", "tierra", "aire", "cielo", "estrella", "camino", "puente", "ciudad",
  "pueblo", "calle", "plaza", "jardin", "bosque", "desierto", "valle", "colina", "isla", "playa",
  "ola", "roca", "arena", "nieve", "hielo", "viento", "lluvia", "trueno", "rayo", "alba",
  "ocaso", "sombra", "luz", "espejo", "puerta", "ventana", "techo", "muro", "escalera", "patio",
  "balcon", "granja", "campo", "trigo", "maiz", "uva", "manzana", "naranja", "limon", "platano",
  "pera", "cereza", "fresa", "aceituna", "aceite", "pan", "queso", "leche", "miel", "sal",
  "azucar", "cafe", "te", "vino", "cerveza", "jugo", "sopa", "arroz", "pasta", "carne",
  "pescado", "pollo", "huevo", "mantequilla", "harina", "canela", "pimienta", "ajo", "cebolla", "tomate",
  "lechuga", "zanahoria", "papa", "calabaza", "pepino", "pimiento", "brocoli", "espinaca", "perejil", "romero",
  "tomillo", "lobo", "halcon", "aguila", "tigre", "leon", "oso", "zorro", "ciervo", "conejo",
  "tortuga", "delfin", "ballena", "tiburon", "pulpo", "cangrejo", "mariposa", "abeja", "hormiga", "arana",
  "buho", "cuervo", "paloma", "gorrion", "pavo", "cisne", "pato", "gallo", "caballo", "vaca",
  "cabra", "oveja", "cerdo", "perro", "gato", "raton", "elefante", "jirafa", "cebra", "mono",
  "canguro", "koala", "panda", "pinguino", "foca", "nutria", "castor", "ardilla", "erizo", "tucan",
];

function generatePassphrase(numWords: number, separator: string, capitalize: boolean, includeNumber: boolean): string {
  const words: string[] = [];
  for (let i = 0; i < numWords; i++) {
    let word = WORDLIST[secureRandomInt(WORDLIST.length)];
    if (capitalize) word = word.charAt(0).toUpperCase() + word.slice(1);
    words.push(word);
  }
  if (includeNumber) {
    const idx = secureRandomInt(words.length);
    words[idx] = words[idx] + secureRandomInt(100);
  }
  return words.join(separator);
}

const ALPHABETS: Record<string, string> = {
  digits: "0123456789",
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};

const AMBIGUOUS_CHARS = new Set(["0", "O", "1", "I", "5", "S", "2", "Z"]);

const SEPARATORS: Record<string, string> = { dash: "-", space: " ", none: "" };

function generateBackupCode(
  length: number,
  alphabet: string,
  avoidLookalikes: boolean,
  separator: string,
  groupSize: number
): string {
  let pool = alphabet;
  if (avoidLookalikes) {
    pool = pool
      .split("")
      .filter((c) => !AMBIGUOUS_CHARS.has(c))
      .join("");
  }
  if (pool.length === 0) return "";
  let raw = "";
  for (let i = 0; i < length; i++) raw += pool[secureRandomInt(pool.length)];
  if (!separator || groupSize <= 0 || groupSize >= length) return raw;
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += groupSize) groups.push(raw.slice(i, i + groupSize));
  return groups.join(separator);
}

/* ------------------------------------------------------------------ */
/*  Piezas de UI compartidas                                           */
/* ------------------------------------------------------------------ */

/**
 * Esqueleto único para las cuatro pestañas: panel de opciones a la
 * izquierda (scroll propio + botón fijo abajo) y panel de resultado a la
 * derecha. Todo lo que antes cambiaba de pestaña a pestaña —paddings,
 * altura, sitio del botón, dónde vive el historial— queda decidido aquí.
 */
function GeneratorShell({
  title,
  description,
  options,
  generateLabel,
  onGenerate,
  resultTitle,
  result,
  footer,
}: {
  title: string;
  description: string;
  options: React.ReactNode;
  generateLabel: string;
  onGenerate: () => void;
  resultTitle: string;
  result: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-4 md:gap-6 h-full min-h-0">
      <Card className="flex flex-col h-full min-h-0">
        <CardHeader className="shrink-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col gap-4 pb-2">{options}</div>
        </CardContent>

        <div className="shrink-0 border-t px-6 py-4">
          <Button onClick={onGenerate} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            {generateLabel}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col h-full min-h-0">
        <CardHeader className="shrink-0">
          <CardTitle className="text-base">{resultTitle}</CardTitle>
        </CardHeader>

        <div className="flex-1 flex flex-col min-h-0 px-6 pb-6">
          {result}
          {footer && <div className="shrink-0 pt-4 border-t mt-4">{footer}</div>}
        </div>
      </Card>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="text-sm font-semibold mb-3 flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </p>
  );
}

function Field({ icon, label, hint, children }: { icon?: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 flex items-center gap-2">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function OptionRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 max-w-full">
        <label className="text-sm">{label}</label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex h-8 w-14 items-center justify-center rounded-md border bg-muted text-sm font-mono">{value}</div>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} min={min} max={max} step={1} />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

interface CriteriaRowProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function CriteriaRow({ icon, label, checked, onCheckedChange }: CriteriaRowProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-mono font-semibold">{icon}</div>
        <span className="text-sm">{label}</span>
      </div>
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
    </div>
  );
}

function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 999,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v));
        }}
        className="w-16 text-center"
      />
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmptyState({ hint }: { hint: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-[32ch]">{hint}</p>
    </div>
  );
}

function OutputBox({ value, actions }: { value: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-4">
      <span className="font-mono text-base leading-relaxed break-all">{value}</span>
      {actions && <div className="flex gap-1 shrink-0">{actions}</div>}
    </div>
  );
}

function HistoryList({ history, emptyLabel, title }: { history: GeneratorHistoryEntry[]; emptyLabel: string; title: string }) {
  return (
    <div className="flex flex-col min-h-0">
      <SectionTitle icon={<History className="h-4 w-4" />}>{title}</SectionTitle>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {history.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
              <span className="font-mono text-xs truncate">{entry.value}</span>
              <CopyButton value={entry.value} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Contraseña                                                         */
/* ------------------------------------------------------------------ */

function PasswordGenerator({
  historyHook,
  onAddToVault,
}: {
  historyHook: ReturnType<typeof useGeneratorHistory>;
  onAddToVault: (password: string) => void;
}) {
  const { t } = useTranslation("generator");
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeSimilar, setExcludeSimilar] = useState(true);
  const [exclude, setExclude] = useState("");
  const [value, setValue] = useState("");
  const { saveActivity } = useActivity();

  const finalExclude = exclude + (excludeSimilar ? AMBIGUOUS : "");
  const poolSize = useMemo(
    () => buildPasswordPools(uppercase, lowercase, numbers, symbols, finalExclude).join("").length,
    [uppercase, lowercase, numbers, symbols, finalExclude]
  );

  const bits = entropyBits(length, poolSize);
  const strength = strengthFromBits(bits, t);

  const handleGenerate = () => {
    const result = generatePassword(length, uppercase, lowercase, numbers, symbols, finalExclude);
    if (!result) {
      toast.warning(t("toastEmptyPool"));
      return;
    }
    setValue(result);
    historyHook.addEntry(result);
    saveActivity("generate", "passwordGenerated", "generator", { length: String(length) });
  };

  return (
    <GeneratorShell
      title={t("tabPassword")}
      description={t("descPassword")}
      generateLabel={t("generatePasswordButton")}
      onGenerate={handleGenerate}
      resultTitle={t("generatedPasswordTitle")}
      options={
        <>
          <SliderField label={t("lengthLabel")} value={length} onChange={setLength} min={8} max={64} />

          <div className="border-t pt-4">
            <SectionTitle icon={<Key className="h-4 w-4" />}>{t("codeOptionsTitle")}</SectionTitle>
            <div className="flex flex-col">
              <CriteriaRow icon="A" label={t("criteriaUppercase")} checked={uppercase} onCheckedChange={setUppercase} />
              <CriteriaRow icon="a" label={t("criteriaLowercase")} checked={lowercase} onCheckedChange={setLowercase} />
              <CriteriaRow icon="1" label={t("criteriaNumbers")} checked={numbers} onCheckedChange={setNumbers} />
              <CriteriaRow icon="#" label={t("criteriaSymbols")} checked={symbols} onCheckedChange={setSymbols} />
              <CriteriaRow icon="∅" label={t("criteriaExcludeSimilar")} checked={excludeSimilar} onCheckedChange={setExcludeSimilar} />
            </div>
          </div>

          <div className="border-t pt-4">
            <SectionTitle icon={<SlidersHorizontal className="h-4 w-4" />}>{t("formatTitle")}</SectionTitle>
            <Field label={t("excludeOtherLabel")} hint={t("excludeOtherHint")}>
              <Input placeholder={t("excludeOtherPlaceholder")} value={exclude} onChange={(e) => setExclude(e.target.value)} />
            </Field>
          </div>
        </>
      }
      result={
        value ? (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            <div className="shrink-0 flex flex-col gap-4">
              <StrengthMeter strength={strength} bits={bits} unitLabel={t("bitsLabel")} />
              <OutputBox
                value={value}
                actions={
                  <Button variant="ghost" size="icon" onClick={() => onAddToVault(value)} title={t("addToVaultTooltip")}>
                    <Save className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 border-t pt-4">
              <HistoryList history={historyHook.history} title={t("recentTitle")} emptyLabel={t("recentEmpty")} />
            </div>
          </div>
        ) : (
          <EmptyState hint={t("emptyStatePassword")} />
        )
      }
      footer={
        value ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={value} label={t("copyButton")} variant="outline" size="sm" iconClassName="h-3.5 w-3.5" />
            <Button variant="outline" size="sm" onClick={() => onAddToVault(value)}>
              <Save className="h-3.5 w-3.5 mr-1" /> {t("saveToVaultButton")}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setValue("")} title={t("clearResultTooltip")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Usuario                                                            */
/* ------------------------------------------------------------------ */

function UsernameGenerator({ historyHook }: { historyHook: ReturnType<typeof useGeneratorHistory> }) {
  const { t } = useTranslation("generator");
  const [includeNumber, setIncludeNumber] = useState(true);
  const [value, setValue] = useState("");
  const { saveActivity } = useActivity();

  const handleGenerate = () => {
    const result = generateUsername(includeNumber);
    setValue(result);
    historyHook.addEntry(result);
    saveActivity("generate", "usernameGenerated", "generator");
  };

  return (
    <GeneratorShell
      title={t("tabUsername")}
      description={t("descUsername")}
      generateLabel={t("generateUsernameButton")}
      onGenerate={handleGenerate}
      resultTitle={t("generatedUsernameTitle")}
      options={
        <div className="border-t pt-4 first:border-t-0 first:pt-0">
          <SectionTitle icon={<User className="h-4 w-4" />}>{t("codeOptionsTitle")}</SectionTitle>
          <OptionRow label={t("addNumberLabel")} hint={t("addNumberHint")}>
            <Switch checked={includeNumber} onCheckedChange={setIncludeNumber} />
          </OptionRow>
        </div>
      }
      result={
        value ? (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            <div className="shrink-0">
              <OutputBox value={value} />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 border-t pt-4">
              <HistoryList history={historyHook.history} title={t("recentTitle")} emptyLabel={t("recentEmpty")} />
            </div>
          </div>
        ) : (
          <EmptyState hint={t("emptyStateUsername")} />
        )
      }
      footer={
        value ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={value} label={t("copyButton")} variant="outline" size="sm" iconClassName="h-3.5 w-3.5" />
            <Button variant="outline" size="icon" onClick={() => setValue("")} title={t("clearResultTooltip")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Frase de contraseña                                                */
/* ------------------------------------------------------------------ */

function PassphraseGenerator({ historyHook }: { historyHook: ReturnType<typeof useGeneratorHistory> }) {
  const { t } = useTranslation("generator");
  const [numWords, setNumWords] = useState(5);
  const [separator, setSeparator] = useState("-");
  const [capitalize, setCapitalize] = useState(true);
  const [includeNumber, setIncludeNumber] = useState(true);
  const [value, setValue] = useState("");
  const { saveActivity } = useActivity();

  const handleGenerate = () => {
    const result = generatePassphrase(numWords, separator, capitalize, includeNumber);
    setValue(result);
    historyHook.addEntry(result);
    saveActivity("generate", "passphraseGenerated", "generator", { count: String(numWords) });
  };

  return (
    <GeneratorShell
      title={t("tabPassphrase")}
      description={t("descPassphrase")}
      generateLabel={t("generatePassphraseButton")}
      onGenerate={handleGenerate}
      resultTitle={t("generatedPassphraseTitle")}
      options={
        <>
          <SliderField label={t("numWordsLabel")} value={numWords} onChange={setNumWords} min={3} max={10} />

          <div className="border-t pt-4">
            <SectionTitle icon={<Key className="h-4 w-4" />}>{t("codeOptionsTitle")}</SectionTitle>
            <div className="flex flex-col gap-3">
              <OptionRow label={t("capitalizeLabel")} hint={t("capitalizeHint")}>
                <Switch checked={capitalize} onCheckedChange={setCapitalize} />
              </OptionRow>
              <OptionRow label={t("addNumberPassphraseLabel")} hint={t("addNumberPassphraseHint")}>
                <Switch checked={includeNumber} onCheckedChange={setIncludeNumber} />
              </OptionRow>
            </div>
          </div>

          <div className="border-t pt-4">
            <SectionTitle icon={<LayoutGrid className="h-4 w-4" />}>{t("formatTitle")}</SectionTitle>
            <OptionRow label={t("separatorLabel")}>
              <Select value={separator} onValueChange={(v) => v && setSeparator(v)}>
                <SelectTrigger className="w-32 max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">{t("separatorDash")}</SelectItem>
                  <SelectItem value="_">{t("separatorUnderscore")}</SelectItem>
                  <SelectItem value=".">{t("separatorDot")}</SelectItem>
                  <SelectItem value=" ">{t("separatorSpace")}</SelectItem>
                </SelectContent>
              </Select>
            </OptionRow>
          </div>
        </>
      }
      result={
        value ? (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            <div className="shrink-0">
              <OutputBox value={value} />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 border-t pt-4">
              <HistoryList history={historyHook.history} title={t("recentTitle")} emptyLabel={t("recentEmpty")} />
            </div>
          </div>
        ) : (
          <EmptyState hint={t("emptyStatePassphrase")} />
        )
      }
      footer={
        value ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={value} label={t("copyButton")} variant="outline" size="sm" iconClassName="h-3.5 w-3.5" />
            <Button variant="outline" size="icon" onClick={() => setValue("")} title={t("clearResultTooltip")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Códigos de respaldo                                                */
/* ------------------------------------------------------------------ */

interface BackupPreset {
  id: string;
  settings: {
    count: number;
    length: number;
    alphabet: string;
    avoidLookalikes: boolean;
    numberEach: boolean;
    separator: string;
    groupSize: number;
  };
}

const PRESETS: BackupPreset[] = [
  {
    id: "google",
    settings: { count: 10, length: 8, alphabet: "digits", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 4 },
  },
  {
    id: "github",
    settings: { count: 10, length: 10, alphabet: "alphanumeric", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 5 },
  },
  {
    id: "custom",
    settings: { count: 10, length: 8, alphabet: "alphanumeric", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 4 },
  },
];

function BackupCodesGenerator() {
  const { t } = useTranslation("generator");
  const [title, setTitle] = useState("");
  const [presetId, setPresetId] = useState("google");
  const [count, setCount] = useState(10);
  const [length, setLength] = useState(8);
  const [alphabet, setAlphabet] = useState<"digits" | "letters" | "alphanumeric">("digits");
  const [avoidLookalikes, setAvoidLookalikes] = useState(true);
  const [numberEach, setNumberEach] = useState(true);
  const [separator, setSeparator] = useState<"dash" | "space" | "none">("dash");
  const [groupSize, setGroupSize] = useState(4);
  const [codes, setCodes] = useState<string[]>([]);

  const { saveBackupBatch } = useVault();
  const { saveActivity } = useActivity();

  const presetLabels: Record<string, string> = {
    google: t("presetGoogleLabel"),
    github: t("presetGithubLabel"),
    custom: t("presetCustomLabel"),
  };
  const presetDescriptions: Record<string, string> = {
    google: t("presetGoogleDescription"),
    github: t("presetGithubDescription"),
    custom: t("presetCustomDescription"),
  };

  const applyPreset = (id: string | null) => {
    if (!id) return;
    setPresetId(id);
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setCount(preset.settings.count);
    setLength(preset.settings.length);
    setAlphabet(preset.settings.alphabet as typeof alphabet);
    setAvoidLookalikes(preset.settings.avoidLookalikes);
    setNumberEach(preset.settings.numberEach);
    setSeparator(preset.settings.separator as typeof separator);
    setGroupSize(preset.settings.groupSize);
  };

  const effectiveTitle = title || t("backupTitle");

  const handleGenerate = () => {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(generateBackupCode(length, ALPHABETS[alphabet], avoidLookalikes, SEPARATORS[separator], groupSize));
    }
    setCodes(result);

    if (result.length > 0 && result[0]) {
      saveActivity("generate", "backupBatchGenerated", "generator", {
        title: effectiveTitle,
        count: String(count),
        length: String(length),
      });
    }
  };

  const handleSaveToVault = async () => {
    if (codes.length === 0) {
      toast.warning(t("toastNothingToSave"));
      return;
    }

    const result = await saveBackupBatch({
      title: effectiveTitle,
      codes,
      alphabet,
      length,
      count,
      hasSeparator: separator !== "none",
    });

    if (result.success) {
      toast.success(t("toastSavedToVault", { title: effectiveTitle }));
      saveActivity("create", "backupSavedToVault", "generator", { title: effectiveTitle });
      setCodes([]);
    } else {
      toast.error(t("toastSaveError", { error: result.error || t("unknownError") }));
    }
  };

  const downloadTxt = () => {
    if (codes.length === 0) {
      toast.warning(t("toastNothingToDownload"));
      return;
    }

    try {
      const content = codes.map((c, i) => (numberEach ? `${String(i + 1).padStart(2, "0")}. ${c}` : c)).join("\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${effectiveTitle}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(t("toastDownloaded", { file: `${effectiveTitle}.txt` }));
      saveActivity("download", "backupDownloaded", "generator", { title: effectiveTitle });
    } catch (error) {
      console.error("Error al descargar:", error);
      toast.error(t("toastDownloadError"));
    }
  };

  return (
    <GeneratorShell
      title={t("backupTitle")}
      description={t("backupDescription")}
      generateLabel={t("generateBatchButton")}
      onGenerate={handleGenerate}
      resultTitle={t("generatedCodesTitle")}
      options={
        <>
          <Field icon={<Type className="h-4 w-4" />} label={t("batchTitleLabel")} hint={t("batchTitleHint")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("batchTitlePlaceholder")} />
          </Field>

          <Field icon={<LayoutGrid className="h-4 w-4" />} label={t("presetLabel")} hint={presetDescriptions[presetId]}>
            <Select value={presetId} onValueChange={applyPreset}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("presetPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="min-w-[300px]">
                {PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{presetLabels[p.id]}</span>
                      <span className="text-xs text-muted-foreground">{presetDescriptions[p.id]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="border-t pt-4">
            <SectionTitle icon={<Key className="h-4 w-4" />}>{t("codeOptionsTitle")}</SectionTitle>
            <div className="flex flex-col gap-3">
              <OptionRow label={t("numCodesLabel")}>
                <NumberStepper value={count} onChange={setCount} min={1} max={50} />
              </OptionRow>
              <OptionRow label={t("charsPerCodeLabel")}>
                <NumberStepper value={length} onChange={setLength} min={4} max={32} />
              </OptionRow>
              <OptionRow label={t("alphabetLabel")}>
                <Select value={alphabet} onValueChange={(v) => v && setAlphabet(v as typeof alphabet)}>
                  <SelectTrigger className="w-32 max-w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="digits">{t("alphabetDigits")}</SelectItem>
                    <SelectItem value="letters">{t("alphabetLetters")}</SelectItem>
                    <SelectItem value="alphanumeric">{t("alphabetAlphanumeric")}</SelectItem>
                  </SelectContent>
                </Select>
              </OptionRow>
              <OptionRow label={t("avoidLookalikesLabel")} hint={t("avoidLookalikesHint")}>
                <Switch checked={avoidLookalikes} onCheckedChange={setAvoidLookalikes} />
              </OptionRow>
              <OptionRow label={t("numberEachLabel")} hint={t("numberEachHint")}>
                <Switch checked={numberEach} onCheckedChange={setNumberEach} />
              </OptionRow>
            </div>
          </div>

          <div className="border-t pt-4">
            <SectionTitle icon={<LayoutGrid className="h-4 w-4" />}>{t("formatTitle")}</SectionTitle>
            <div className="flex flex-col gap-3">
              <OptionRow label={t("groupSeparatorLabel")}>
                <Select value={separator} onValueChange={(v) => v && setSeparator(v as typeof separator)}>
                  <SelectTrigger className="w-32 max-w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dash">{t("groupSeparatorDash")}</SelectItem>
                    <SelectItem value="space">{t("groupSeparatorSpace")}</SelectItem>
                    <SelectItem value="none">{t("groupSeparatorNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </OptionRow>
              <OptionRow label={t("groupSizeLabel")}>
                <NumberStepper value={groupSize} onChange={setGroupSize} min={2} max={16} />
              </OptionRow>
            </div>
          </div>
        </>
      }
      result={
        codes.length > 0 ? (
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground">{t("singleUseNotice")}</p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 border-t pt-2">
              <div className="flex flex-col divide-y">
                {codes.map((code, i) => (
                  <div key={`${i}-${code}`} className="flex items-center justify-between py-2">
                    <span className="font-mono text-sm">
                      {numberEach && <span className="text-muted-foreground mr-2">{String(i + 1).padStart(2, "0")}.</span>}
                      {code}
                    </span>
                    <CopyButton value={code} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState hint={t("emptyStateHint")} />
        )
      }
      footer={
        codes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={codes.join("\n")} label={t("copyAllButton")} variant="outline" size="sm" iconClassName="h-3.5 w-3.5" />
            <Button variant="outline" size="sm" onClick={handleSaveToVault}>
              <Save className="h-3.5 w-3.5 mr-1" /> {t("saveToVaultButton")}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTxt}>
              <Download className="h-3.5 w-3.5 mr-1" /> {t("downloadTxtButton")}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCodes([])} title={t("deleteBatchTooltip")}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Vista principal                                                    */
/* ------------------------------------------------------------------ */

type GeneratorTab = "password" | "username" | "code" | "passphrase";

interface GeneratorViewProps {
  onAddToVault: (password: string) => void;
}

export function GeneratorView({ onAddToVault }: GeneratorViewProps) {
  const { t } = useTranslation("generator");
  const [tab, setTab] = useState<GeneratorTab>("password");
  const passwordHistory = useGeneratorHistory("password");
  const usernameHistory = useGeneratorHistory("username");
  const passphraseHistory = useGeneratorHistory("passphrase");

  const TABS: { id: GeneratorTab; label: string }[] = [
    { id: "password", label: t("tabPassword") },
    { id: "username", label: t("tabUsername") },
    { id: "code", label: t("tabCode") },
    { id: "passphrase", label: t("tabPassphrase") },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0">
        <h2 className="text-2xl font-bold mb-1">{t("pageTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-6">{t("pageSubtitle")}</p>

        <div className="flex gap-1 mb-6 border-b overflow-x-auto" role="tablist">
          {TABS.map((tItem) => (
            <button
              key={tItem.id}
              role="tab"
              aria-selected={tab === tItem.id}
              onClick={() => setTab(tItem.id)}
              className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors rounded-t-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab === tItem.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tItem.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 pb-1">
        {tab === "password" && <PasswordGenerator historyHook={passwordHistory} onAddToVault={onAddToVault} />}
        {tab === "username" && <UsernameGenerator historyHook={usernameHistory} />}
        {tab === "code" && <BackupCodesGenerator />}
        {tab === "passphrase" && <PassphraseGenerator historyHook={passphraseHistory} />}
      </div>
    </div>
  );
}