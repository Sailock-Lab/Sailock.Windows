import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Minus, Plus, RefreshCw, Save, Download, Trash2, Key, Hash, Type, Shield, ListOrdered, LayoutGrid } from "lucide-react";
import { useVault } from "../../hooks/useVault";
import { toast } from "sonner";

// Número aleatorio criptográficamente seguro (mejor que Math.random para generadores)
function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}<>?";
const AMBIGUOUS = "l1I0O";

function generatePassword(
  length: number,
  uppercase: boolean,
  lowercase: boolean,
  numbers: boolean,
  symbols: boolean,
  exclude: string
) {
  let pool = "";
  if (uppercase) pool += UPPER;
  if (lowercase) pool += LOWER;
  if (numbers) pool += NUMBERS;
  if (symbols) pool += SYMBOLS;
  if (exclude) {
    const excludeSet = new Set(exclude.split(""));
    pool = pool.split("").filter((c) => !excludeSet.has(c)).join("");
  }
  if (pool.length === 0) return "";
  let result = "";
  for (let i = 0; i < length; i++) result += pool[secureRandomInt(pool.length)];
  return result;
}

const ADJECTIVES = ["Rapido", "Sereno", "Astuto", "Firme", "Nitido", "Sutil", "Vivido", "Claro", "Fuerte", "Ligero"];
const NOUNS = ["Lobo", "Halcon", "Roble", "Rio", "Faro", "Cedro", "Tigre", "Nube", "Puma", "Lince"];

function generateUsername(includeNumber: boolean) {
  const adjective = ADJECTIVES[secureRandomInt(ADJECTIVES.length)];
  const noun = NOUNS[secureRandomInt(NOUNS.length)];
  const number = includeNumber ? secureRandomInt(900) + 100 : "";
  return `${adjective}${noun}${number}`;
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
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-sm font-mono font-semibold">
          {icon}
        </div>
        <span className="text-sm">{label}</span>
      </div>
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
    </div>
  );
}

// ---------- Códigos de respaldo ----------

const ALPHABETS: Record<string, string> = {
  digits: "0123456789",
  letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alphanumeric: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};

// Caracteres que se confunden fácilmente entre sí al leerlos o escribirlos a mano
const AMBIGUOUS_CHARS = new Set(["0", "O", "1", "I", "5", "S", "2", "Z"]);

const SEPARATORS: Record<string, string> = { dash: "-", space: " ", none: "" };

interface BackupPreset {
  id: string;
  label: string;
  description: string;
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

// "Estilo Google/GitHub" son solo nombres orientativos por el formato típico, no una copia exacta de sus códigos reales
const PRESETS: BackupPreset[] = [
  {
    id: "google",
    label: "Estilo Google",
    description: "10 códigos · 8 dígitos · Agrupado 4-4",
    settings: { count: 10, length: 8, alphabet: "digits", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 4 },
  },
  {
    id: "github",
    label: "Estilo GitHub",
    description: "10 códigos · 10 caracteres · Agrupado 5-5",
    settings: { count: 10, length: 10, alphabet: "alphanumeric", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 5 },
  },
  {
    id: "custom",
    label: "Personalizado",
    description: "Configura cada opción a tu gusto",
    settings: { count: 10, length: 8, alphabet: "alphanumeric", avoidLookalikes: true, numberEach: true, separator: "dash", groupSize: 4 },
  },
];

function bitsPerCode(length: number, alphabetSize: number): number {
  if (alphabetSize <= 1) return 0;
  return Math.round(length * Math.log2(alphabetSize));
}

function strengthInfo(bits: number): { label: string; color: string } {
  if (bits < 20) return { label: "Débil", color: "text-red-500" };
  if (bits < 40) return { label: "Fuerte", color: "text-green-500" };
  return { label: "Muy fuerte", color: "text-green-600" };
}

function generateBackupCode(length: number, alphabet: string, avoidLookalikes: boolean, separator: string, groupSize: number) {
  let pool = alphabet;
  if (avoidLookalikes) {
    pool = pool.split("").filter((c) => !AMBIGUOUS_CHARS.has(c)).join("");
  }
  if (pool.length === 0) return "";
  let raw = "";
  for (let i = 0; i < length; i++) raw += pool[secureRandomInt(pool.length)];
  if (!separator || groupSize <= 0 || groupSize >= length) return raw;
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += groupSize) groups.push(raw.slice(i, i + groupSize));
  return groups.join(separator);
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
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-16 text-center"
      />
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function BackupCodesGenerator() {
  const [title, setTitle] = useState("Códigos de respaldo");
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

  const handleGenerate = () => {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(generateBackupCode(length, ALPHABETS[alphabet], avoidLookalikes, SEPARATORS[separator], groupSize));
    }
    setCodes(result);
  };

  const handleSaveToVault = async () => {
    if (codes.length === 0) {
      toast.warning("No hay códigos para guardar");
      return;
    }

    const result = await saveBackupBatch({
      title: title || "Códigos de respaldo",
      codes,
      alphabet,
      length,
      count,
      hasSeparator: separator !== "none",
    });

    if (result.success) {
      toast.success("Códigos guardados en el Vault");
      setCodes([]);
    } else {
      toast.error("Error al guardar los códigos");
    }
  };

  const effectiveAlphabetSize = avoidLookalikes
    ? ALPHABETS[alphabet].split("").filter((c) => !AMBIGUOUS_CHARS.has(c)).length
    : ALPHABETS[alphabet].length;
  const bits = bitsPerCode(length, effectiveAlphabetSize);
  const strength = strengthInfo(bits);

  const copyAll = () => navigator.clipboard.writeText(codes.join("\n"));

  const downloadTxt = () => {
    const content = codes.map((c, i) => (numberEach ? `${String(i + 1).padStart(2, "0")}. ${c}` : c)).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "codigos"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 h-full">
      {/* Card izquierdo: configuración */}
      <Card className="flex flex-col h-full">
        <CardHeader className="shrink-0">
          <CardTitle>Códigos de respaldo</CardTitle>
          <CardDescription>
            Genera códigos de recuperación de un solo uso
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 pb-4">
            {/* Título del lote */}
            <div>
              <label className="text-sm font-medium block mb-1 flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                Título del lote
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ej: Códigos de recuperación de Google"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ponle un nombre para identificarlo fácilmente si lo guardas en el vault.
              </p>
            </div>

            {/* Preajuste */}
            <div>
              <label className="text-sm font-medium block mb-1 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                Preajuste
              </label>
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un preajuste" />
                </SelectTrigger>
                <SelectContent className="min-w-[300px]">
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{PRESETS.find((p) => p.id === presetId)?.description}</p>
            </div>

            {/* Opciones del código */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                Opciones del código
              </p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm">Número de códigos</label>
                  <NumberStepper value={count} onChange={setCount} min={1} max={50} />
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm">Caracteres por código</label>
                  <NumberStepper value={length} onChange={setLength} min={4} max={32} />
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm">Alfabeto</label>
                  <Select value={alphabet} onValueChange={(v) => v && setAlphabet(v as typeof alphabet)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="digits">Solo números</SelectItem>
                      <SelectItem value="letters">Solo letras</SelectItem>
                      <SelectItem value="alphanumeric">Alfanumérico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <div>
                    <label className="text-sm">Evitar caracteres parecidos</label>
                    <p className="text-xs text-muted-foreground">Quita 0, O, 1, I, 5, S, 2, Z</p>
                  </div>
                  <Switch checked={avoidLookalikes} onCheckedChange={setAvoidLookalikes} />
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <div>
                    <label className="text-sm">Numerar cada código</label>
                    <p className="text-xs text-muted-foreground">Añade 01., 02., 03. a cada uno</p>
                  </div>
                  <Switch checked={numberEach} onCheckedChange={setNumberEach} />
                </div>
              </div>
            </div>

            {/* Formato */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                Formato
              </p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm">Separador de grupos</label>
                  <Select value={separator} onValueChange={(v) => v && setSeparator(v as typeof separator)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dash">Guion (-)</SelectItem>
                      <SelectItem value="space">Espacio</SelectItem>
                      <SelectItem value="none">Ninguno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between col-span-2">
                  <label className="text-sm">Tamaño de grupo</label>
                  <NumberStepper value={groupSize} onChange={setGroupSize} min={2} max={16} />
                </div>
              </div>
            </div>

            <Button onClick={handleGenerate} className="shrink-0 mt-2">
              <RefreshCw className="h-4 w-4 mr-2" /> Generar lote nuevo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card derecho: códigos generados */}
      <Card className="flex flex-col h-full">
        <CardHeader className="flex flex-row items-center justify-between shrink-0">
          <CardTitle className="text-base">Códigos generados</CardTitle>
          {codes.length > 0 && (
            <Button variant="outline" size="sm" onClick={copyAll}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar todo
            </Button>
          )}
        </CardHeader>

        <div className="flex-1 flex flex-col min-h-0 px-6 pb-6">
          {/* Info fija */}
          {codes.length > 0 && (
            <div className="shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <span className={`flex items-center gap-1 text-sm font-medium ${strength.color}`}>
                  <span className="h-2 w-2 rounded-full bg-current inline-block" /> {strength.label}
                </span>
                <span className="text-xs text-muted-foreground">{bits} bits por código</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Cada código es de un solo uso. Guarda la lista en un sitio seguro.
              </p>
            </div>
          )}

          {/* Scroll de códigos */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {codes.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center">
                  Configura las opciones y pulsa "Generar lote nuevo".
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {codes.map((code, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="font-mono text-sm">
                      {numberEach && <span className="text-muted-foreground mr-2">{String(i + 1).padStart(2, "0")}.</span>}
                      {code}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(code)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botones fijos */}
          {codes.length > 0 && (
            <div className="shrink-0 pt-4 border-t mt-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyAll}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar todo
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveToVault}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Guardar en el Vault
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTxt}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Descargar .txt
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCodes([])} title="Borrar lote">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------- Vista principal ----------

type GeneratorTab = "password" | "username" | "code" | "passphrase" | "totp";

const TABS: { id: GeneratorTab; label: string }[] = [
  { id: "password", label: "Contraseña" },
  { id: "username", label: "Usuario" },
  { id: "code", label: "Códigos de respaldo" },
  { id: "passphrase", label: "Frase" },
  { id: "totp", label: "TOTP" },
];

const DESCRIPTIONS: Partial<Record<GeneratorTab, string>> = {
  password: "Crea contraseñas aleatorias y difíciles de adivinar para mantener tus cuentas seguras.",
  username: "Genera nombres de usuario aleatorios, sin datos personales que te identifiquen.",
  passphrase: "Próximamente: frases de varias palabras, fáciles de recordar y también seguras.",
  totp: "Próximamente: generación de códigos TOTP de verificación en dos pasos.",
};

export function GeneratorView() {
  const [tab, setTab] = useState<GeneratorTab>("password");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0">
        <h2 className="text-2xl font-bold mb-1">Generador</h2>
        <p className="text-sm text-muted-foreground mb-6">Crea contraseñas, usuarios, códigos y más.</p>

        <div className="flex gap-1 mb-6 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "code" ? (
          <BackupCodesGenerator />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <Card>
              <CardHeader>
                <CardTitle>{TABS.find((t) => t.id === tab)?.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {tab === "password" && <PasswordGenerator />}
                {tab === "username" && <UsernameGenerator />}
                {(tab === "passphrase" || tab === "totp") && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Próximamente.</p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sobre este generador</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{DESCRIPTIONS[tab]}</CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recientes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Aún no has generado nada. (Esto lo conectamos de verdad en el paso del historial.)
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeSimilar, setExcludeSimilar] = useState(true);
  const [exclude, setExclude] = useState("");
  const [value, setValue] = useState("");

  const handleGenerate = () => {
    const finalExclude = exclude + (excludeSimilar ? AMBIGUOUS : "");
    setValue(generatePassword(length, uppercase, lowercase, numbers, symbols, finalExclude));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Longitud</label>
          <div className="flex h-8 w-14 items-center justify-center rounded-md border bg-muted text-sm font-mono">
            {length}
          </div>
        </div>
        <Slider value={[length]} onValueChange={(v) => setLength(Array.isArray(v) ? v[0] : v)} min={8} max={64} step={1} />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>8</span>
          <span>64</span>
        </div>
      </div>

      <div className="flex flex-col">
        <CriteriaRow icon="A" label="Mayúsculas (A-Z)" checked={uppercase} onCheckedChange={setUppercase} />
        <CriteriaRow icon="a" label="Minúsculas (a-z)" checked={lowercase} onCheckedChange={setLowercase} />
        <CriteriaRow icon="1" label="Números (0-9)" checked={numbers} onCheckedChange={setNumbers} />
        <CriteriaRow icon="#" label="Símbolos (!@#$...)" checked={symbols} onCheckedChange={setSymbols} />
        <CriteriaRow
          icon="∅"
          label="Excluir caracteres similares (l 1 I 0 O)"
          checked={excludeSimilar}
          onCheckedChange={setExcludeSimilar}
        />
      </div>

      <div>
        <label className="text-sm block mb-1">Excluir otros caracteres</label>
        <Input placeholder="ej: {}[]" value={exclude} onChange={(e) => setExclude(e.target.value)} />
      </div>

      <Button onClick={handleGenerate}>Generar contraseña</Button>

      {value && (
        <div className="flex items-center justify-between border rounded p-2 font-mono break-all">
          <span>{value}</span>
          <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(value)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function UsernameGenerator() {
  const [includeNumber, setIncludeNumber] = useState(true);
  const [value, setValue] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="text-sm">Añadir número al final</label>
        <Switch checked={includeNumber} onCheckedChange={setIncludeNumber} />
      </div>
      <Button onClick={() => setValue(generateUsername(includeNumber))}>Generar usuario</Button>
      {value && (
        <div className="flex items-center justify-between border rounded p-2 font-mono break-all">
          <span>{value}</span>
          <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(value)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}