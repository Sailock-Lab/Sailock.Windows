// src/features/vault/TemplateEditor.tsx
// Diálogo para crear una plantilla propia (nombre, icono, campos incluidos y campos personalizados).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CustomFieldData,
  FIELD_TYPES,
  FIELD_TYPE_KEYS,
  FieldConfigInput,
  FieldType,
  OptionsEditor,
  defaultConfigFor,
  isFieldSensitive,
  normalizedFieldType,
} from "@/components/EntryFields";
import { ICON_CHOICES, ICON_KEYS, saveUserTemplate, type UserTemplateData } from "./templates";

export const EMPTY_USER_TEMPLATE: UserTemplateData = {
  id: "",
  name: "",
  icon: "sparkles",
  name_label: "",
  show_username: true,
  show_password: true,
  show_website: true,
  show_totp: false,
  fields: [],
};

function toFormFields(data: UserTemplateData): CustomFieldData[] {
  return data.fields.map((f) => {
    const type = normalizedFieldType(f.field_type);
    return {
      label: f.label,
      value: "",
      field_type: type,
      is_preset: false,
      preset_key: null,
      options: f.options,
      sensitive: f.sensitive,
      config: f.config ?? defaultConfigFor(type),
    };
  });
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: UserTemplateData; // datos de partida (p. ej. los campos de un registro)
  onSaved?: (saved: UserTemplateData) => void;
}) {
  const { t } = useTranslation("vault");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("sparkles");
  const [nameLabel, setNameLabel] = useState("");
  const [showUsername, setShowUsername] = useState(true);
  const [showPassword, setShowPassword] = useState(true);
  const [showWebsite, setShowWebsite] = useState(true);
  const [showTotp, setShowTotp] = useState(false);
  const [fields, setFields] = useState<CustomFieldData[]>([]);
  const [saving, setSaving] = useState(false);

  // Cada vez que se abre se parte de los datos iniciales (o de una plantilla vacía).
  useEffect(() => {
    if (!open) return;
    const base = initial ?? EMPTY_USER_TEMPLATE;
    setName(base.name);
    setIcon(base.icon || "sparkles");
    setNameLabel(base.name_label);
    setShowUsername(base.show_username);
    setShowPassword(base.show_password);
    setShowWebsite(base.show_website);
    setShowTotp(base.show_totp);
    setFields(toFormFields(base));
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addField = () => {
    setFields([
      ...fields,
      { label: "", value: "", field_type: "text", is_preset: false, preset_key: null, options: [], sensitive: false, config: null },
    ]);
  };
  const patchField = (index: number, patch: Partial<CustomFieldData>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  const changeType = (index: number, type: FieldType) => {
    const current = fields[index];
    patchField(index, {
      field_type: type,
      sensitive: isFieldSensitive(current),
      config: defaultConfigFor(type),
      options: type === "select" ? current.options ?? [] : [],
    });
  };
  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  };
  const removeField = (index: number) => setFields(fields.filter((_, i) => i !== index));

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveUserTemplate({
        id: initial?.id ?? "",
        name,
        icon,
        name_label: nameLabel,
        show_username: showUsername,
        show_password: showPassword,
        show_website: showWebsite,
        show_totp: showTotp,
        fields: fields
          .filter((f) => f.label.trim())
          .map((f) => {
            const type = normalizedFieldType(f.field_type);
            return {
              label: f.label.trim(),
              field_type: type,
              sensitive: !!f.sensitive,
              config: f.config ?? null,
              options: type === "select" ? f.options ?? [] : [],
            };
          }),
      });
      toast.success(t("templateSavedToast", { name: saved.name }));
      onOpenChange(false);
      onSaved?.(saved);
    } catch (e) {
      toast.error(String(e));
      setSaving(false);
    }
  };

  const builtinToggles = [
    { key: "username", label: t("fieldUsername"), value: showUsername, set: setShowUsername },
    { key: "password", label: t("fieldPassword"), value: showPassword, set: setShowPassword },
    { key: "website", label: t("fieldWebsite"), value: showWebsite, set: setShowWebsite },
    { key: "totp", label: t("fieldTotpSecret"), value: showTotp, set: setShowTotp },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? t("templateEditorTitleEdit") : t("templateEditorTitle")}</DialogTitle>
          <DialogDescription>{t("templateEditorDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("templateNameLabel")}</label>
            <Input
              value={name}
              maxLength={60}
              placeholder={t("templateNamePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("templateIconLabel")}</label>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {ICON_KEYS.map((key) => {
                const Icon = ICON_CHOICES[key];
                const active = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-pressed={active}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-muted ${
                      active ? "border-primary bg-muted" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("templateNameFieldLabel")}</label>
            <Input
              value={nameLabel}
              placeholder={t("templateNameFieldPlaceholder")}
              onChange={(e) => setNameLabel(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("templateBuiltinFields")}</label>
            <div className="grid grid-cols-2 gap-2">
              {builtinToggles.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <Switch checked={item.value} onCheckedChange={item.set} />
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">{t("templateFieldsLabel")}</label>
            {fields.map((field, i) => {
              const type = normalizedFieldType(field.field_type);
              return (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder={t("customFieldNamePlaceholder")}
                      value={field.label}
                      onChange={(e) => patchField(i, { label: e.target.value })}
                      className="flex-1"
                    />
                    <Select
                      value={type}
                      onValueChange={(v) => v && changeType(i, v as FieldType)}
                      items={FIELD_TYPES.map((tp) => ({ value: tp, label: t(FIELD_TYPE_KEYS[tp]) }))}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((tp) => (
                          <SelectItem key={tp} value={tp}>
                            {t(FIELD_TYPE_KEYS[tp])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={i === 0}
                        onClick={() => moveField(i, -1)}
                        title={t("moveFieldUp")}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={i === fields.length - 1}
                        onClick={() => moveField(i, 1)}
                        title={t("moveFieldDown")}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeField(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {type === "select" && (
                    <OptionsEditor
                      options={field.options ?? []}
                      onChange={(options) => patchField(i, { options })}
                    />
                  )}
                  <FieldConfigInput field={field} onChange={(config) => patchField(i, { config })} />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isFieldSensitive(field)}
                      disabled={type === "password"}
                      onCheckedChange={(v) => patchField(i, { sensitive: v })}
                    />
                    <span className="text-xs text-muted-foreground">{t("fieldSensitiveLabel")}</span>
                  </div>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" className="self-start" onClick={addField}>
              <Plus className="mr-1 h-4 w-4" /> {t("addFieldButton")}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {t("templateSaveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}