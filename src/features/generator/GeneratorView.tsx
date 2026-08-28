import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Copy } from "lucide-react";

// Genera un número aleatorio seguro (mejor que Math.random para contraseñas)
function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}<>?";

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

export function GeneratorView() {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [exclude, setExclude] = useState("");
  const [value, setValue] = useState("");

  const handleGenerate = () => {
    setValue(generatePassword(length, uppercase, lowercase, numbers, symbols, exclude));
  };

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <h2 className="text-2xl font-bold">Generador</h2>

      <div className="flex items-center gap-4">
        <label className="text-sm w-32">Longitud: {length}</label>
        <Slider value={[length]} onValueChange={(v) => setLength(v[0])} min={4} max={64} step={1} />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm">Mayúsculas (A-Z)</label>
        <Switch checked={uppercase} onCheckedChange={setUppercase} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Minúsculas (a-z)</label>
        <Switch checked={lowercase} onCheckedChange={setLowercase} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Números (0-9)</label>
        <Switch checked={numbers} onCheckedChange={setNumbers} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Símbolos (!@#$...)</label>
        <Switch checked={symbols} onCheckedChange={setSymbols} />
      </div>

      <div>
        <label className="text-sm block mb-1">Excluir caracteres</label>
        <Input placeholder="ej: 0O1lI" value={exclude} onChange={(e) => setExclude(e.target.value)} />
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