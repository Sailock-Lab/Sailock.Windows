import {
  Braces,
  Contact,
  CreditCard,
  FileKey,
  IdCard,
  Landmark,
  KeyRound,
  LifeBuoy,
  Lock,
  Server,
  ShieldCheck,
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
  group: "main" | "more";
  icon: LucideIcon;
  labelKey: string;
  nameLabelKey: string;
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

export function findTemplate(id: string | null | undefined): EntryTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id);
}

// Icono de un registro según su plantilla (los registros sin plantilla usan el de contraseña).
export function entryIcon(entryType?: string | null): LucideIcon {
  return findTemplate(entryType)?.icon ?? KeyRound;
}