// src/features/vault/templates.ts
// Plantillas de registro como DATOS: cada una es una lista de campos con su tipo y sus ajustes.
// Para añadir una plantilla nueva basta con añadir un objeto a TEMPLATES (y sus textos a los idiomas).
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  Braces,
  Briefcase,
  Camera,
  Car,
  Cloud,
  Contact,
  CreditCard,
  Database,
  FileKey,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  Home,
  IdCard,
  Landmark,
  KeyRound,
  LifeBuoy,
  Lock,
  Mail,
  Phone,
  Plane,
  Server,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  StickyNote,
  Terminal,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { FieldType } from "@/components/EntryFields";

export interface TemplateFieldPreset {
  labelKey: string; // clave de traducción (namespace "vault") del nombre del campo
  type: FieldType;
  sensitive?: boolean; // el valor se oculta por defecto y pide la contraseña maestra
  config?: Record<string, unknown>; // ajustes del tipo (si no se indican, los del tipo)
  optionKeys?: string[]; // solo tipo "select": claves de traducción de las opciones
}

export interface EntryTemplate {
  id: string; // se guarda en el registro (entry_type): no cambiarlo una vez en uso
  group: "main" | "more" | "user";
  user?: boolean; // plantilla del usuario: sus textos son literales, no claves de traducción
  icon: LucideIcon;
  labelKey: string;
  nameLabelKey: string; // en plantillas del usuario puede ser "" (se usa el nombre por defecto)
  showUsername: boolean;
  showPassword: boolean;
  showWebsite: boolean;
  showTotp: boolean;
  presetFields: TemplateFieldPreset[];
}

export const TEMPLATES: EntryTemplate[] = [
  // ---------- Principales ----------
  {
    id: "password",
    group: "main",
    icon: KeyRound,
    labelKey: "templatePassword",
    nameLabelKey: "fieldName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: true,
    presetFields: [],
  },
  {
    id: "identity",
    group: "main",
    icon: IdCard,
    labelKey: "templateIdentity",
    nameLabelKey: "presetFullName",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetIdDocument", type: "password" },
      { labelKey: "presetDateOfBirth", type: "date" },
      { labelKey: "presetNationality", type: "text" },
      { labelKey: "presetAddress", type: "text" },
      { labelKey: "presetCity", type: "text" },
      { labelKey: "presetStateProvince", type: "text" },
      { labelKey: "presetPostalCode", type: "text" },
      { labelKey: "presetCountry", type: "text" },
      { labelKey: "presetPhone", type: "text" },
      { labelKey: "presetEmail", type: "text" },
    ],
  },
  {
    id: "card",
    group: "main",
    icon: CreditCard,
    labelKey: "templateCard",
    nameLabelKey: "presetCardName",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetCardHolder", type: "text" },
      { labelKey: "presetCardNumber", type: "password" },
      { labelKey: "presetExpiryDate", type: "text" },
      { labelKey: "presetCvv", type: "password" },
      { labelKey: "presetPin", type: "password" },
      { labelKey: "presetBank", type: "text" },
      { labelKey: "presetCardType", type: "text" },
    ],
  },
  {
    id: "note",
    group: "main",
    icon: StickyNote,
    labelKey: "templateNote",
    nameLabelKey: "presetTitle",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [],
  },
  {
    id: "wifi",
    group: "main",
    icon: Wifi,
    labelKey: "templateWifi",
    nameLabelKey: "presetSsid",
    showUsername: false,
    showPassword: true,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetSecurityType", type: "text" },
      { labelKey: "presetWifiUsername", type: "text" },
      { labelKey: "presetAuthMethod", type: "text" },
    ],
  },
  {
    id: "custom",
    group: "main",
    icon: Sparkles,
    labelKey: "templateCustom",
    nameLabelKey: "fieldName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: true,
    presetFields: [],
  },

  // ---------- Más plantillas ----------
  {
    id: "bank",
    group: "more",
    icon: Landmark,
    labelKey: "templateBank",
    nameLabelKey: "presetAccountName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetAccountHolder", type: "text" },
      { labelKey: "presetBank", type: "text" },
      { labelKey: "presetIban", type: "text", sensitive: true },
      { labelKey: "presetSwift", type: "text" },
      { labelKey: "presetAccountNumber", type: "text", sensitive: true },
    ],
  },
  {
    id: "license",
    group: "more",
    icon: FileKey,
    labelKey: "templateLicense",
    nameLabelKey: "presetSoftwareName",
    showUsername: false,
    showPassword: false,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetLicenseKey", type: "text", sensitive: true },
      { labelKey: "presetVersion", type: "text" },
      { labelKey: "presetLicensedTo", type: "text" },
      { labelKey: "presetPurchaseDate", type: "date" },
      { labelKey: "presetExpirationDate", type: "date" },
      { labelKey: "presetSeats", type: "number" },
    ],
  },
  {
    id: "server",
    group: "more",
    icon: Server,
    labelKey: "templateServer",
    nameLabelKey: "presetServerName",
    showUsername: true,
    showPassword: true,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetHost", type: "text" },
      { labelKey: "presetIpAddress", type: "ip" },
      { labelKey: "presetPort", type: "number" },
      { labelKey: "presetProvider", type: "text" },
    ],
  },
  {
    id: "apikey",
    group: "more",
    icon: Braces,
    labelKey: "templateApiKey",
    nameLabelKey: "presetServiceName",
    showUsername: false,
    showPassword: false,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetApiKey", type: "text", sensitive: true },
      { labelKey: "presetApiSecret", type: "text", sensitive: true },
      { labelKey: "presetBaseUrl", type: "url" },
      {
        labelKey: "presetEnvironment",
        type: "select",
        optionKeys: ["presetEnvProduction", "presetEnvStaging", "presetEnvDevelopment"],
      },
      { labelKey: "presetExpirationDate", type: "date" },
    ],
  },
  {
    id: "ssh",
    group: "more",
    icon: Terminal,
    labelKey: "templateSsh",
    nameLabelKey: "presetConnectionName",
    showUsername: true,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [
      { labelKey: "presetHost", type: "text" },
      { labelKey: "presetPort", type: "number" },
      { labelKey: "presetPrivateKey", type: "longtext", sensitive: true },
      { labelKey: "presetPassphrase", type: "password" },
    ],
  },
  {
    id: "recovery",
    group: "more",
    icon: LifeBuoy,
    labelKey: "templateRecovery",
    nameLabelKey: "presetServiceName",
    showUsername: false,
    showPassword: false,
    showWebsite: true,
    showTotp: true,
    presetFields: [
      { labelKey: "presetRecoveryCodes", type: "longtext", sensitive: true },
      { labelKey: "presetRecoveryEmail", type: "text" },
      { labelKey: "presetRecoveryPhone", type: "phone" },
      { labelKey: "presetGeneratedOn", type: "date" },
    ],
  },
  {
    id: "contact",
    group: "more",
    icon: Contact,
    labelKey: "templateContact",
    nameLabelKey: "presetFullName",
    showUsername: false,
    showPassword: false,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetOrganization", type: "text" },
      { labelKey: "presetJobTitle", type: "text" },
      { labelKey: "presetPhone", type: "phone" },
      { labelKey: "presetEmail", type: "text" },
      { labelKey: "presetAddress", type: "text" },
      { labelKey: "presetDateOfBirth", type: "date" },
    ],
  },
  {
    id: "insurance",
    group: "more",
    icon: ShieldCheck,
    labelKey: "templateInsurance",
    nameLabelKey: "presetPolicyName",
    showUsername: false,
    showPassword: false,
    showWebsite: true,
    showTotp: false,
    presetFields: [
      { labelKey: "presetInsurer", type: "text" },
      { labelKey: "presetPolicyNumber", type: "text" },
      { labelKey: "presetPremium", type: "currency" },
      { labelKey: "presetRenewalDate", type: "date" },
      { labelKey: "presetAssistancePhone", type: "phone" },
    ],
  },
  {
    id: "securenote",
    group: "more",
    icon: Lock,
    labelKey: "templateSecureNote",
    nameLabelKey: "presetTitle",
    showUsername: false,
    showPassword: false,
    showWebsite: false,
    showTotp: false,
    presetFields: [{ labelKey: "presetContent", type: "longtext", sensitive: true }],
  },
];

export const MAIN_TEMPLATES = TEMPLATES.filter((tpl) => tpl.group === "main");
export const MORE_TEMPLATES = TEMPLATES.filter((tpl) => tpl.group === "more");

// ---------- Plantillas del usuario ----------
// Se guardan cifradas en el backend (templates.json) y se mantienen aquí en memoria para que
// findTemplate / entryIcon las vean igual que a las plantillas incluidas.

export interface UserTemplateField {
  label: string;
  field_type: string;
  sensitive: boolean;
  config: Record<string, unknown> | null;
  options: string[];
}

export interface UserTemplateData {
  id: string; // "" al crear; lo asigna el backend
  name: string;
  icon: string; // clave de ICON_CHOICES
  name_label: string;
  show_username: boolean;
  show_password: boolean;
  show_website: boolean;
  show_totp: boolean;
  fields: UserTemplateField[];
}

// Iconos que se pueden elegir para una plantilla propia.
export const ICON_CHOICES: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  key: KeyRound,
  "id-card": IdCard,
  card: CreditCard,
  note: StickyNote,
  wifi: Wifi,
  bank: Landmark,
  lock: Lock,
  shield: ShieldCheck,
  server: Server,
  terminal: Terminal,
  braces: Braces,
  database: Database,
  cloud: Cloud,
  globe: Globe,
  mail: Mail,
  phone: Phone,
  smartphone: Smartphone,
  contact: Contact,
  briefcase: Briefcase,
  home: Home,
  car: Car,
  plane: Plane,
  heart: Heart,
  gift: Gift,
  cart: ShoppingCart,
  book: BookOpen,
  school: GraduationCap,
  camera: Camera,
  lifebuoy: LifeBuoy,
  "file-key": FileKey,
};
export const ICON_KEYS = Object.keys(ICON_CHOICES);

export function toEntryTemplate(u: UserTemplateData): EntryTemplate {
  return {
    id: u.id,
    group: "user",
    user: true,
    icon: ICON_CHOICES[u.icon] ?? Sparkles,
    labelKey: u.name,
    nameLabelKey: u.name_label,
    showUsername: u.show_username,
    showPassword: u.show_password,
    showWebsite: u.show_website,
    showTotp: u.show_totp,
    presetFields: u.fields.map((f) => ({
      labelKey: f.label,
      type: f.field_type as FieldType,
      sensitive: f.sensitive,
      config: f.config ?? undefined,
      optionKeys: f.options,
    })),
  };
}

let userData: UserTemplateData[] = [];
let userTemplates: EntryTemplate[] = [];
const listeners = new Set<() => void>();

function setUserData(list: UserTemplateData[]) {
  userData = list;
  userTemplates = list.map(toEntryTemplate);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Plantillas del usuario (se actualiza solo cuando cambian).
export function useUserTemplates(): EntryTemplate[] {
  return useSyncExternalStore(subscribe, () => userTemplates);
}

export function getUserTemplateData(id: string): UserTemplateData | undefined {
  return userData.find((u) => u.id === id);
}

export async function loadUserTemplates(): Promise<void> {
  try {
    setUserData(await invoke<UserTemplateData[]>("load_templates"));
  } catch {
    setUserData([]);
  }
}

// Crea (id "") o actualiza una plantilla. Lanza el error del backend si no es válida.
export async function saveUserTemplate(template: UserTemplateData): Promise<UserTemplateData> {
  const saved = await invoke<UserTemplateData>("save_template", { template });
  await loadUserTemplates();
  return saved;
}

export async function deleteUserTemplate(id: string): Promise<void> {
  await invoke("delete_template", { id });
  await loadUserTemplates();
}

export function findTemplate(id: string | null | undefined): EntryTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id) ?? userTemplates.find((tpl) => tpl.id === id);
}

// Icono de un registro según su plantilla (los registros sin plantilla usan el de contraseña).
export function entryIcon(entryType?: string | null): LucideIcon {
  return findTemplate(entryType)?.icon ?? KeyRound;
}

// ---------- Textos ----------
// Solo se necesita la función t del namespace "vault".
type Translate = (key: string) => string;

// Las plantillas incluidas guardan claves de traducción; las del usuario, texto literal.

export function templateLabel(t: Translate, tpl: EntryTemplate): string {
  return tpl.user ? tpl.labelKey : t(tpl.labelKey);
}

export function templateNameLabel(t: Translate, tpl: EntryTemplate): string {
  if (tpl.user) return tpl.nameLabelKey || t("fieldName");
  return t(tpl.nameLabelKey);
}

export function presetLabel(t: Translate, tpl: EntryTemplate, f: TemplateFieldPreset): string {
  return tpl.user ? f.labelKey : t(f.labelKey);
}

export function presetOption(t: Translate, tpl: EntryTemplate, key: string): string {
  return tpl.user ? key : t(key);
}

// Nombre de la plantilla de un registro (o "Sin categoría" si no tiene o ya no existe).
export function entryTypeLabel(t: Translate, entryType?: string | null): string {
  const tpl = findTemplate(entryType);
  return tpl ? templateLabel(t, tpl) : t("templateUncategorized");
}