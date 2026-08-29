import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy } from "lucide-react";

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
  for (let i = 0; i < length; i++) {
    result += pool[secureRandomInt(pool.length)];
  }
  return result;
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

export function GeneratorView() {
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
    <div>
      <h2 className="text-2xl font-bold mb-1">Generador</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Crea contraseñas seguras y difíciles de adivinar.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Contraseña</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Longitud</label>
                <div className="flex h-8 w-14 items-center justify-center rounded-md border bg-muted text-sm font-mono">
                  {length}
                </div>
              </div>
              <Slider
                value={[length]}
                onValueChange={(v) => setLength(Array.isArray(v) ? v[0] : v)}
                min={8}
                max={64}
                step={1}
              />
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
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sobre este generador</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Crea contraseñas aleatorias y difíciles de adivinar para mantener tus cuentas seguras.
              </CardDescription>
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
    </div>
  );
}