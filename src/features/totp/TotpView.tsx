// src/features/totp/TotpView.tsx
// Ventana TOTP: los códigos de los registros (solo lectura) y los que se añaden aquí sueltos.
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Copy, Pencil, Trash2, Eye, EyeOff, KeyRound, ShieldCheck, Lock, LockOpen } from "lucide-react";
import { MasterPasswordDialog } from "@/components/MasterPasswordDialog";

interface VaultEntry {
  id: string;
  name: string;
  username?: string | null;
  totp_secret?: string | null;
  trashed: boolean;
}

interface TotpAccount {
  id: string;
  name: string;
  account: string;
  secret: string;
  created_at: number;
}

// Un código que se muestra: viene de un registro o es suelto.
interface TotpItem {
  key: string;
  source: "entry" | "standalone";
  name: string;
  subtitle: string;
  secret: string;
  account?: TotpAccount; // solo los sueltos se pueden editar o borrar aquí
}

// "123456" -> "123 456"; "12345678" -> "1234 5678"
function groupCode(code: string): string {
  if (code.length < 6) return code;
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

function TotpCard({
  item,
  onEdit,
  onDelete,
  hidden,
}: {
  item: TotpItem;
  hidden: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation("vault");
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [period, setPeriod] = useState(30);
  const [failed, setFailed] = useState(false);

  const fetchCode = async () => {
    try {
      const [newCode, ttl] = await invoke<[string, number]>("get_totp_code", {
        secretBase32: item.secret,
        accountName: item.name,
      });
      setCode(newCode);
      setSecondsLeft(ttl);
      setPeriod(ttl <= 30 ? 30 : ttl <= 60 ? 60 : ttl);
      setFailed(false);
    } catch {
      setCode("");
      setFailed(true);
    }
  };

  // Pide un código al montar o si cambia el secreto, y otro cada vez que el actual caduca.
  // Con la vista bloqueada no se genera ningún código y se descarta el que hubiera en memoria.
  useEffect(() => {
    if (hidden) {
      setCode("");
      setSecondsLeft(0);
      setFailed(false);
      return;
    }
    fetchCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.secret, hidden]);

  useEffect(() => {
    if (failed || hidden) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          fetchCode();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, hidden, item.secret]);

  const handleCopy = () => {
    if (!code || hidden) return;
    navigator.clipboard
      .writeText(code)
      .then(() => toast.success(t("totpCopiedToast")))
      .catch((e) => toast.error(String(e)));
  };

  const low = secondsLeft > 0 && secondsLeft <= 5;

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="truncate text-xs text-muted-foreground">{item.subtitle || " "}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.source === "entry" ? <KeyRound className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          {item.source === "entry" ? t("totpFromEntry") : t("totpStandalone")}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        {hidden ? (
          <p className="select-none font-mono text-2xl font-semibold tracking-wider blur-sm" aria-hidden>
            000 000
          </p>
        ) : failed ? (
          <p className="text-sm text-destructive">{t("totpCodeError")}</p>
        ) : (
          <p
            className={`font-mono text-2xl font-semibold tracking-wider tabular-nums ${low ? "text-destructive" : ""}`}
            aria-live="off"
          >
            {code ? groupCode(code) : "••• •••"}
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!failed && !hidden && (
            <span className={`w-8 text-right text-xs tabular-nums ${low ? "text-destructive" : "text-muted-foreground"}`}>
              {t("totpExpiresIn", { seconds: secondsLeft })}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} disabled={!code || hidden} title={t("totpCopyTooltip")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!failed && !hidden && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${low ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (secondsLeft / period) * 100)}%` }}
          />
        </div>
      )}

      {item.source === "standalone" && (
        <div className="absolute right-2 top-9 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title={t("editTooltip")}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} title={t("totpDeleteButton")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function TotpDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: TotpAccount | null; // null = nuevo
  onSaved: () => void;
}) {
  const { t } = useTranslation("vault");
  const [name, setName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setAccountName(account?.account ?? "");
    setSecret(""); // el secreto nunca se rellena al editar
    setShowSecret(false);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSave = name.trim() !== "" && (account !== null || secret.trim() !== "") && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await invoke<TotpAccount>("save_totp_account", {
        account: {
          id: account?.id ?? "",
          name,
          account: accountName,
          // Al editar, un campo vacío conserva el secreto actual.
          secret: secret.trim() || account?.secret || "",
          created_at: account?.created_at ?? 0,
        },
      });
      toast.success(t("totpSavedToast", { name: saved.name }));
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(String(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? t("totpDialogTitleEdit") : t("totpDialogTitleNew")}</DialogTitle>
          <DialogDescription>{t("totpDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t("totpNameLabel")}</label>
            <Input value={name} maxLength={60} placeholder={t("totpNamePlaceholder")} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("totpAccountLabel")}</label>
            <Input
              value={accountName}
              maxLength={100}
              placeholder={t("totpAccountPlaceholder")}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t("totpSecretLabel")}</label>
            <div className="flex items-center gap-1.5">
              <Input
                type={showSecret ? "text" : "password"}
                value={secret}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setSecret(e.target.value)}
                className="flex-1 font-mono"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {account && <p className="mt-1 text-xs text-muted-foreground">{t("totpSecretKeepHint")}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t("totpSaveButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LOCK_KEY = "sailock.totpProtected";
const REVEAL_MS = 120_000; // los códigos vuelven a ocultarse solos pasado este tiempo

function readLock(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function TotpView() {
  const { t } = useTranslation("vault");
  const [locked, setLocked] = useState(readLock);
  const [revealed, setRevealed] = useState(false);
  const [unlockDialog, setUnlockDialog] = useState<"reveal" | "disable" | null>(null);
  const hidden = locked && !revealed;

  const persistLock = (value: boolean) => {
    try {
      if (value) localStorage.setItem(LOCK_KEY, "1");
      else localStorage.removeItem(LOCK_KEY);
    } catch {
      /* sin almacenamiento: el ajuste solo dura esta sesión */
    }
    setLocked(value);
  };

  // Al salir de la vista se vuelve a ocultar; y también tras un rato visible.
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  const handleLockButton = () => {
    if (!locked) {
      persistLock(true);
      setRevealed(false);
      toast.success(t("totpLockEnabledToast"));
    } else {
      setUnlockDialog("disable");
    }
  };

  const handleVerified = () => {
    if (unlockDialog === "disable") {
      persistLock(false);
      setRevealed(false);
      toast.success(t("totpLockDisabledToast"));
    } else {
      setRevealed(true);
    }
  };
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [accounts, setAccounts] = useState<TotpAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ account: TotpAccount | null } | null>(null);
  const [toDelete, setToDelete] = useState<TotpAccount | null>(null);

  const load = async () => {
    try {
      const [e, a] = await Promise.all([
        invoke<VaultEntry[]>("load_entries"),
        invoke<TotpAccount[]>("load_totp_accounts"),
      ]);
      setEntries(e);
      setAccounts(a);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const items = useMemo<TotpItem[]>(() => {
    const fromEntries: TotpItem[] = entries
      .filter((e) => !e.trashed && e.totp_secret && e.totp_secret.trim())
      .map((e) => ({
        key: `e-${e.id}`,
        source: "entry",
        name: e.name,
        subtitle: e.username ?? "",
        secret: e.totp_secret as string,
      }));
    const standalone: TotpItem[] = accounts.map((a) => ({
      key: `s-${a.id}`,
      source: "standalone",
      name: a.name,
      subtitle: a.account,
      secret: a.secret,
      account: a,
    }));
    return [...fromEntries, ...standalone].sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: "base" }));
  }, [entries, accounts]);

  const query = search.trim().toLowerCase();
  const visible = query
    ? items.filter((i) => i.name.toLowerCase().includes(query) || i.subtitle.toLowerCase().includes(query))
    : items;

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await invoke("delete_totp_account", { id: toDelete.id });
      toast.success(t("totpDeletedToast"));
      setToDelete(null);
      load();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("totpViewTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("totpViewDescription")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleLockButton}
            title={locked ? t("totpUnlockButton") : t("totpLockButton")}
            aria-label={locked ? t("totpUnlockButton") : t("totpLockButton")}
          >
            {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </Button>
          <Button onClick={() => setDialog({ account: null })}>
            <Plus className="mr-1 h-4 w-4" /> {t("totpAddButton")}
          </Button>
        </div>
      </div>

      {locked && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" /> {t("totpHiddenBanner")}
          </span>
          {hidden ? (
            <Button size="sm" onClick={() => setUnlockDialog("reveal")}>
              {t("totpShowCodesButton")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setRevealed(false)}>
              {t("totpHideCodesButton")}
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("totpSearchPlaceholder")}
            className="pl-9"
          />
        </div>
      )}

      {loaded && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("totpEmpty")}</div>
      )}
      {loaded && items.length > 0 && visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t("totpNoResults")}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((item) => (
          <TotpCard
            key={item.key}
            item={item}
            hidden={hidden}
            onEdit={() => setDialog({ account: item.account ?? null })}
            onDelete={() => item.account && setToDelete(item.account)}
          />
        ))}
      </div>

      <MasterPasswordDialog
        open={unlockDialog !== null}
        onOpenChange={(open) => !open && setUnlockDialog(null)}
        onVerified={handleVerified}
      />

      <TotpDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        account={dialog?.account ?? null}
        onSaved={load}
      />

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("totpDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("totpDeleteDescription", { name: toDelete?.name ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              {t("cancelButton")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("totpDeleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}