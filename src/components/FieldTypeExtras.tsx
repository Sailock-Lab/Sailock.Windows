// src/components/FieldTypeExtras.tsx
// Tipos de campo con ajustes propios: teléfono, divisa, porcentaje, IP, código postal y coordenadas.
// Cada tipo aporta un Editor (formulario), un Viewer (solo lectura) y, si tiene ajustes, un ConfigEditor.
// Los ajustes se guardan en `field.config` (el backend los guarda tal cual, sin conocer su forma).
// Se registran en FIELD_TYPE_DEFS, dentro de EntryFields.tsx.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CustomFieldData,
  FieldConfigEditorProps,
  FieldEditorProps,
  FieldViewerProps,
} from "./EntryFields";

type Config = Record<string, unknown>;

// ---------- Utilidades de ajustes ----------

function cfgString(field: CustomFieldData, key: string, fallback: string): string {
  const v = field.config?.[key];
  return typeof v === "string" ? v : fallback;
}

function cfgNumber(field: CustomFieldData, key: string, fallback: number): number {
  const v = field.config?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function withConfig(field: CustomFieldData, patch: Config): Config {
  return { ...(field.config ?? {}), ...patch };
}

// ---------- Utilidades de números ----------

// Deja solo dígitos y un separador decimal (acepta coma y la convierte en punto),
// limita los decimales y, si se permite, un "-" inicial.
function sanitizeDecimal(raw: string, decimals: number, allowNegative: boolean): string {
  const text = raw.replace(/,/g, ".");
  const negative = allowNegative && text.trimStart().startsWith("-");
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [int, ...rest] = cleaned.split(".");
  const sign = negative ? "-" : "";
  if (decimals === 0 || rest.length === 0) return sign + int;
  return `${sign}${int}.${rest.join("").slice(0, decimals)}`;
}

function clampNumberText(value: string, min: number, max: number): string {
  if (value === "" || value === "-") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const clamped = Math.min(hi, Math.max(lo, n));
  return clamped === n ? value : String(clamped);
}

// ---------- Piezas comunes de los ajustes ----------

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

interface SelectItemData {
  value: string;
  label: string;
}

function SimpleSelect({
  value,
  items,
  onChange,
  className,
}: {
  value: string;
  items: SelectItemData[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)} items={items}>
      <SelectTrigger className={className ?? "w-48"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Casilla numérica de un ajuste: guarda el texto mientras se escribe y solo avisa cuando es un número válido.
function NumberConfigInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <Input
      inputMode="decimal"
      className="w-24"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, ".");
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== "" && raw !== "-" && Number.isFinite(n)) onCommit(n);
      }}
    />
  );
}

function DecimalsSelect({
  field,
  options,
  fallback,
  onChange,
}: {
  field: CustomFieldData;
  options: number[];
  fallback: number;
  onChange: (config: Config) => void;
}) {
  const { t } = useTranslation("vault");
  return (
    <ConfigRow label={t("configDecimals")}>
      <SimpleSelect
        className="w-24"
        value={String(cfgNumber(field, "decimals", fallback))}
        items={options.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(v) => onChange(withConfig(field, { decimals: Number(v) }))}
      />
    </ConfigRow>
  );
}

// ---------- Países (prefijo telefónico y formato de código postal) ----------

interface CountryInfo {
  code: string; // ISO 3166-1 alfa-2
  dial: string; // prefijo telefónico, sin "+"
  postal: RegExp;
  postalExample: string;
  postalMax: number;
}

const COUNTRIES: CountryInfo[] = [
  { code: "ES", dial: "34", postal: /^\d{5}$/, postalExample: "28001", postalMax: 5 },
  { code: "PT", dial: "351", postal: /^\d{4}-\d{3}$/, postalExample: "1000-001", postalMax: 8 },
  { code: "FR", dial: "33", postal: /^\d{5}$/, postalExample: "75001", postalMax: 5 },
  { code: "DE", dial: "49", postal: /^\d{5}$/, postalExample: "10115", postalMax: 5 },
  { code: "IT", dial: "39", postal: /^\d{5}$/, postalExample: "00100", postalMax: 5 },
  { code: "GB", dial: "44", postal: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/, postalExample: "SW1A 1AA", postalMax: 8 },
  { code: "IE", dial: "353", postal: /^[A-Z]\d{2}\s?[A-Z\d]{4}$/, postalExample: "D02 X285", postalMax: 8 },
  { code: "NL", dial: "31", postal: /^\d{4}\s?[A-Z]{2}$/, postalExample: "1012 AB", postalMax: 7 },
  { code: "BE", dial: "32", postal: /^\d{4}$/, postalExample: "1000", postalMax: 4 },
  { code: "CH", dial: "41", postal: /^\d{4}$/, postalExample: "8001", postalMax: 4 },
  { code: "AT", dial: "43", postal: /^\d{4}$/, postalExample: "1010", postalMax: 4 },
  { code: "US", dial: "1", postal: /^\d{5}(-\d{4})?$/, postalExample: "90210", postalMax: 10 },
  { code: "CA", dial: "1", postal: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/, postalExample: "K1A 0B1", postalMax: 7 },
  { code: "MX", dial: "52", postal: /^\d{5}$/, postalExample: "06600", postalMax: 5 },
  { code: "AR", dial: "54", postal: /^([A-Z]\d{4}[A-Z]{3}|\d{4})$/, postalExample: "1425", postalMax: 8 },
  { code: "CO", dial: "57", postal: /^\d{6}$/, postalExample: "110111", postalMax: 6 },
  { code: "CL", dial: "56", postal: /^\d{7}$/, postalExample: "8320000", postalMax: 7 },
  { code: "PE", dial: "51", postal: /^\d{5}$/, postalExample: "15001", postalMax: 5 },
  { code: "BR", dial: "55", postal: /^\d{5}-?\d{3}$/, postalExample: "01310-100", postalMax: 9 },
];

function getCountry(code: string): CountryInfo {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function CountrySelect({
  field,
  showDial,
  onChange,
}: {
  field: CustomFieldData;
  showDial: boolean;
  onChange: (config: Config) => void;
}) {
  const { t } = useTranslation("vault");
  const items = COUNTRIES.map((c) => ({
    value: c.code,
    label: showDial ? `${countryName(c.code)} (+${c.dial})` : countryName(c.code),
  }));
  return (
    <ConfigRow label={t("configCountry")}>
      <SimpleSelect
        value={getCountry(cfgString(field, "country", "ES")).code}
        items={items}
        onChange={(v) => onChange(withConfig(field, { country: v }))}
      />
    </ConfigRow>
  );
}

// ---------- Mensaje de validación (solo aviso: no impide guardar) ----------

function InvalidHint({ messageKey }: { messageKey: string }) {
  const { t } = useTranslation("vault");
  return <p className="mt-1 text-xs text-destructive">{t(messageKey)}</p>;
}

// ============================================================
// Teléfono
// ============================================================

export const PHONE_DEFAULT_CONFIG: Config = { country: "ES" };

function phonePrefix(field: CustomFieldData): string {
  return `+${getCountry(cfgString(field, "country", "ES")).dial}`;
}

export function PhoneEditor({ field, onChange }: FieldEditorProps) {
  const { t } = useTranslation("vault");
  // Si se escribe el número ya en formato internacional (+34...), no se antepone el prefijo.
  const international = field.value.trimStart().startsWith("+");
  return (
    <div className="flex gap-2">
      {!international && (
        <span className="flex shrink-0 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
          {phonePrefix(field)}
        </span>
      )}
      <Input
        type="tel"
        inputMode="tel"
        placeholder={t("customFieldValuePlaceholder")}
        value={field.value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s\-().+]/g, ""))}
      />
    </div>
  );
}

export function PhoneViewer({ field }: FieldViewerProps) {
  const value = field.value.trim();
  return <p className="font-mono">{value.startsWith("+") ? value : `${phonePrefix(field)} ${value}`}</p>;
}

export function PhoneConfigEditor({ field, onChange }: FieldConfigEditorProps) {
  return <CountrySelect field={field} showDial onChange={onChange} />;
}

// ============================================================
// Divisa / importe
// ============================================================

export const CURRENCY_DEFAULT_CONFIG: Config = { currency: "EUR", decimals: 2 };

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "MXN", "ARS", "COP", "CLP", "BRL"];

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

function formatCurrency(value: string, currency: string, decimals: number): string {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) return value;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    return `${value} ${currency}`;
  }
}

export function CurrencyEditor({ field, onChange }: FieldEditorProps) {
  const { t } = useTranslation("vault");
  const currency = cfgString(field, "currency", "EUR");
  const decimals = cfgNumber(field, "decimals", 2);
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        placeholder={t("customFieldValuePlaceholder")}
        value={field.value}
        onChange={(e) => onChange(sanitizeDecimal(e.target.value, decimals, true))}
        className="pr-14"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {currencySymbol(currency)}
      </span>
    </div>
  );
}

export function CurrencyViewer({ field }: FieldViewerProps) {
  return (
    <p>
      {formatCurrency(field.value, cfgString(field, "currency", "EUR"), cfgNumber(field, "decimals", 2))}
    </p>
  );
}

export function CurrencyConfigEditor({ field, onChange }: FieldConfigEditorProps) {
  const { t } = useTranslation("vault");
  return (
    <div className="flex flex-col gap-2">
      <ConfigRow label={t("configCurrency")}>
        <SimpleSelect
          value={cfgString(field, "currency", "EUR")}
          items={CURRENCIES.map((c) => ({ value: c, label: `${c} (${currencySymbol(c)})` }))}
          onChange={(v) => onChange(withConfig(field, { currency: v }))}
        />
      </ConfigRow>
      <DecimalsSelect field={field} options={[0, 2, 3]} fallback={2} onChange={onChange} />
    </div>
  );
}

// ============================================================
// Porcentaje
// ============================================================

export const PERCENTAGE_DEFAULT_CONFIG: Config = { min: 0, max: 100, decimals: 2 };

export function PercentageEditor({ field, onChange }: FieldEditorProps) {
  const { t } = useTranslation("vault");
  const min = cfgNumber(field, "min", 0);
  const max = cfgNumber(field, "max", 100);
  const decimals = cfgNumber(field, "decimals", 2);
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        placeholder={t("customFieldValuePlaceholder")}
        value={field.value}
        onChange={(e) => onChange(sanitizeDecimal(e.target.value, decimals, Math.min(min, max) < 0))}
        onBlur={() => {
          const clamped = clampNumberText(field.value, min, max);
          if (clamped !== field.value) onChange(clamped);
        }}
        className="pr-10"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

export function PercentageViewer({ field }: FieldViewerProps) {
  const n = Number(field.value);
  if (field.value.trim() === "" || !Number.isFinite(n)) return <p>{field.value}</p>;
  const decimals = cfgNumber(field, "decimals", 2);
  return <p>{`${n.toLocaleString(undefined, { maximumFractionDigits: decimals })} %`}</p>;
}

export function PercentageConfigEditor({ field, onChange }: FieldConfigEditorProps) {
  const { t } = useTranslation("vault");
  return (
    <div className="flex flex-col gap-2">
      <ConfigRow label={t("configMin")}>
        <NumberConfigInput
          value={cfgNumber(field, "min", 0)}
          onCommit={(n) => onChange(withConfig(field, { min: n }))}
        />
      </ConfigRow>
      <ConfigRow label={t("configMax")}>
        <NumberConfigInput
          value={cfgNumber(field, "max", 100)}
          onCommit={(n) => onChange(withConfig(field, { max: n }))}
        />
      </ConfigRow>
      <DecimalsSelect field={field} options={[0, 1, 2]} fallback={2} onChange={onChange} />
    </div>
  );
}

// ============================================================
// Dirección IP
// ============================================================

export const IP_DEFAULT_CONFIG: Config = { version: "any" };

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9a-fA-F:.]+$/.test(value)) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

function isValidIp(value: string, version: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (version === "v4") return isValidIpv4(v);
  if (version === "v6") return isValidIpv6(v);
  return isValidIpv4(v) || isValidIpv6(v);
}

export function IpEditor({ field, onChange }: FieldEditorProps) {
  const version = cfgString(field, "version", "any");
  return (
    <div>
      <Input
        placeholder={version === "v6" ? "2001:db8::1" : "192.168.1.1"}
        value={field.value}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
        className="font-mono"
        spellCheck={false}
      />
      {!isValidIp(field.value, version) && <InvalidHint messageKey="invalidIp" />}
    </div>
  );
}

export function IpViewer({ field }: FieldViewerProps) {
  return <p className="break-all font-mono">{field.value}</p>;
}

export function IpConfigEditor({ field, onChange }: FieldConfigEditorProps) {
  const { t } = useTranslation("vault");
  return (
    <ConfigRow label={t("configIpVersion")}>
      <SimpleSelect
        className="w-32"
        value={cfgString(field, "version", "any")}
        items={[
          { value: "any", label: t("configIpAny") },
          { value: "v4", label: "IPv4" },
          { value: "v6", label: "IPv6" },
        ]}
        onChange={(v) => onChange(withConfig(field, { version: v }))}
      />
    </ConfigRow>
  );
}

// ============================================================
// Código postal
// ============================================================

export const POSTAL_DEFAULT_CONFIG: Config = { country: "ES" };

export function PostalEditor({ field, onChange }: FieldEditorProps) {
  const country = getCountry(cfgString(field, "country", "ES"));
  const value = field.value.trim();
  return (
    <div>
      <Input
        placeholder={country.postalExample}
        maxLength={country.postalMax}
        value={field.value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        spellCheck={false}
      />
      {value !== "" && !country.postal.test(value) && <InvalidHint messageKey="invalidPostalCode" />}
    </div>
  );
}

export function PostalViewer({ field }: FieldViewerProps) {
  return <p className="font-mono">{field.value}</p>;
}

export function PostalConfigEditor({ field, onChange }: FieldConfigEditorProps) {
  return <CountrySelect field={field} showDial={false} onChange={onChange} />;
}

// ============================================================
// Coordenadas (latitud / longitud en grados decimales)
// ============================================================

// El valor se guarda como "latitud, longitud", p. ej. "41.6476, 1.1396".
function splitCoordinates(value: string): [string, string] {
  const i = value.indexOf(",");
  return i < 0 ? [value.trim(), ""] : [value.slice(0, i).trim(), value.slice(i + 1).trim()];
}

function joinCoordinates(lat: string, lon: string): string {
  return lat === "" && lon === "" ? "" : `${lat}, ${lon}`;
}

function inRange(text: string, limit: number): boolean {
  if (text === "") return true;
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= limit;
}

export function CoordinatesEditor({ field, onChange }: FieldEditorProps) {
  const { t } = useTranslation("vault");
  const [lat, lon] = splitCoordinates(field.value);
  const invalid = !inRange(lat, 90) || !inRange(lon, 180);
  return (
    <div>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          placeholder={`${t("coordinatesLatitude")} (41.6476)`}
          aria-label={t("coordinatesLatitude")}
          value={lat}
          onChange={(e) => onChange(joinCoordinates(sanitizeDecimal(e.target.value, 8, true), lon))}
        />
        <Input
          inputMode="decimal"
          placeholder={`${t("coordinatesLongitude")} (1.1396)`}
          aria-label={t("coordinatesLongitude")}
          value={lon}
          onChange={(e) => onChange(joinCoordinates(lat, sanitizeDecimal(e.target.value, 8, true)))}
        />
      </div>
      {invalid && <InvalidHint messageKey="invalidCoordinates" />}
    </div>
  );
}

export function CoordinatesViewer({ field, onOpenUrl }: FieldViewerProps) {
  const { t } = useTranslation("vault");
  const [lat, lon] = splitCoordinates(field.value);
  const valid = lat !== "" && lon !== "" && inRange(lat, 90) && inRange(lon, 180);
  if (!valid) return <p className="break-words">{field.value}</p>;
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
  return (
    <button
      type="button"
      onClick={() => onOpenUrl(url)}
      title={t("openInMaps")}
      className="inline-flex max-w-full items-start gap-1.5 break-all text-left text-primary hover:underline"
    >
      <span className="font-mono">{`${lat}, ${lon}`}</span>
      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    </button>
  );
}