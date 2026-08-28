import { useState } from "react";
import { Button } from "@/components/ui/button";

function generatePassword(length: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function GeneratorView() {
  const [length, setLength] = useState(16);
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <h2 className="text-2xl font-bold">Generador</h2>
      <div className="flex items-center gap-4">
        <label className="text-sm">Longitud: {length}</label>
        <input
          type="range"
          min={8}
          max={32}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
        />
      </div>
      <Button onClick={() => setPassword(generatePassword(length))}>Generar</Button>
      {password && <div className="border rounded p-2 font-mono break-all">{password}</div>}
    </div>
  );
}