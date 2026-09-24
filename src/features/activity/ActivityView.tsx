import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Trash2,
  Download,
  Key,
  Shield,
  ChevronLeft,
  ChevronRight,
  HistoryIcon,
  Wand2,
  Settings,
  RefreshCw,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useActivity, ActivityEntry, ActivityType, ActivitySource } from "@/hooks/useActivity";
import { LANGUAGE_LABELS } from "@/i18n/languages";
import type { TFunction } from "i18next";

const ITEMS_PER_PAGE = 16;

const SOURCE_ICONS: Record<ActivitySource, React.ReactNode> = {
  vault: <Key className="h-3 w-3" />,
  generator: <Wand2 className="h-3 w-3" />,
  settings: <Settings className="h-3 w-3" />,
  system: <Shield className="h-3 w-3" />,
};

const SOURCE_COLORS: Record<ActivitySource, string> = {
  vault: "bg-blue-500",
  generator: "bg-cyan-500",
  settings: "bg-purple-500",
  system: "bg-gray-500",
};

const TYPE_COLORS: Record<ActivityType, string> = {
  login: "bg-green-500",
  logout: "bg-red-500",
  create: "bg-blue-500",
  edit: "bg-yellow-500",
  delete: "bg-red-600",
  restore: "bg-purple-500",
  generate: "bg-cyan-500",
  download: "bg-indigo-500",
};

const THEME_KEY_MAP: Record<string, string> = { light: "themeLight", dark: "themeDark", system: "themeSystem" };
const DURATION_KEY_MAP: Record<string, string> = {
  never: "durationNever", "15s": "duration15s", "30s": "duration30s",
  "1m": "duration1m", "2m": "duration2m", "5m": "duration5m",
};
const MODE_KEY_MAP: Record<string, string> = {
  add_duplicates: "modeAddDuplicates", skip_duplicates: "modeSkipDuplicates", replace_all: "modeReplaceAll",
};

function resolveParams(t: TFunction, rawParams?: Record<string, string>): Record<string, string> {
  if (!rawParams) return {};
  const resolved: Record<string, string> = { ...rawParams };
  if ("theme" in resolved) resolved.theme = t(THEME_KEY_MAP[resolved.theme] ?? resolved.theme);
  if ("language" in resolved) resolved.language = LANGUAGE_LABELS[resolved.language] ?? resolved.language;
  if ("duration" in resolved) resolved.duration = t(DURATION_KEY_MAP[resolved.duration] ?? resolved.duration);
  if ("mode" in resolved) resolved.mode = t(MODE_KEY_MAP[resolved.mode] ?? resolved.mode);
  if ("state" in resolved) resolved.state = resolved.state === "on" ? t("stateOn") : t("stateOff");
  return resolved;
}

function activityDescription(activity: ActivityEntry, t: TFunction): string {
  if (activity.event_key) {
    return t(`event_${activity.event_key}`, resolveParams(t, activity.params));
  }
  return activity.description ?? "";
}

function formatTimestamp(timestamp: number, t: TFunction): string {
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 60000) {
    return t("justNow");
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return t("minutesAgo", { count: mins });
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return t("hoursAgo", { count: hours });
  } else {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

type ConfirmAction = "clear" | "export" | null;

type ConfirmStep = "password" | "totp";

function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirmed: () => void | Promise<void>;
}) {
  const { t } = useTranslation("activity");
  const [step, setStep] = useState<ConfirmStep>("password");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setStep("password");
      setPassword("");
      setTotpCode("");
      setError("");
      setVerifying(false);
    }
  };

  const handleVerifyPassword = async () => {
    if (!password) {
      setError(t("passwordRequiredError"));
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const ok = await invoke<boolean>("verify_master_password", { masterPassword: password });
      if (!ok) {
        setError(t("wrongPasswordError"));
        setVerifying(false);
        return;
      }
      const totpEnabled = await invoke<boolean>("totp_status").catch(() => false);
      if (totpEnabled) {
        setStep("totp");
        setVerifying(false);
      } else {
        await onConfirmed();
        handleOpenChange(false);
      }
    } catch (e) {
      setError(String(e));
      setVerifying(false);
    }
  };

  const handleVerifyTotp = async () => {
    setVerifying(true);
    setError("");
    try {
      const ok = await invoke<boolean>("totp_verify_unlock", { code: totpCode });
      if (!ok) {
        setError(t("totpWrongCodeError"));
        setVerifying(false);
        return;
      }
      await onConfirmed();
      handleOpenChange(false);
    } catch (e) {
      setError(String(e));
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{step === "password" ? description : t("totpStepDescription")}</DialogDescription>
        </DialogHeader>
        {step === "password" ? (
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              placeholder={t("masterPasswordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleVerifyPassword} disabled={verifying}>
              {verifying ? t("verifyingButton") : t("confirmButton")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              placeholder="123456"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyTotp()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleVerifyTotp} disabled={verifying}>
              {verifying ? t("verifyingButton") : t("confirmButton")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ActivityView() {
  const { t } = useTranslation("activity");
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const { loadActivities, clearActivities } = useActivity();

  const TYPE_LABELS: Record<ActivityType, string> = {
    login: t("typeLogin"),
    logout: t("typeLogout"),
    create: t("typeCreate"),
    edit: t("typeEdit"),
    delete: t("typeDelete"),
    restore: t("typeRestore"),
    generate: t("typeGenerate"),
    download: t("typeDownload"),
  };

  const SOURCE_LABELS: Record<ActivitySource, string> = {
    vault: t("sourceVault"),
    generator: t("sourceGenerator"),
    settings: t("sourceSettings"),
    system: t("sourceSystem"),
  };

  const loadData = async () => {
    setLoading(true);
    const data = await loadActivities();
    setActivities(data.sort((a, b) => b.timestamp - a.timestamp));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredActivities = activities.filter((activity) => {
    if (filter !== "all" && activity.activity_type !== filter) return false;
    if (search) {
      const query = search.toLowerCase();
      const desc = activityDescription(activity, t).toLowerCase();
      return desc.includes(query) || (activity.details && activity.details.toLowerCase().includes(query));
    }
    return true;
  });

  const totalPages = Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleClearAll = () => {
    if (activities.length === 0) {
      toast.info(t("clearNothingToast"));
      return;
    }
    setConfirmAction("clear");
  };

  const handleExport = () => {
    if (activities.length === 0) {
      toast.warning(t("exportNothingToast"));
      return;
    }
    setConfirmAction("export");
  };

  const doClear = async () => {
    const success = await clearActivities();
    if (success) {
      setActivities([]);
      toast.success(t("clearSuccessToast"));
    } else {
      toast.error(t("clearErrorToast"));
    }
  };

  const doExport = () => {
    const content = activities
      .map((a) => {
        const date = new Date(a.timestamp).toLocaleString();
        const source = SOURCE_LABELS[a.source];
        const desc = activityDescription(a, t);
        const legacyDetails = !a.event_key && a.details ? ` (${a.details})` : "";
        return `[${date}] [${source}] ${a.activity_type.toUpperCase()} - ${desc}${legacyDetails}`;
      })
      .join("\n");

    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success(t("exportSuccessToast", { count: activities.length }));
    } catch (error) {
      console.error("Error al exportar:", error);
      toast.error(t("exportErrorToast"));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">{t("pageTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {t("refreshButton")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 pb-6 px-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">
                {t("logTitle")}
                {activities.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {t("eventsCount", { count: activities.length })}
                  </span>
                )}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5 mr-1" /> {t("exportButton")}
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearAll}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("clearButton")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div className="flex flex-wrap gap-2">
                <Select value={filter} onValueChange={(v) => v && setFilter(v as ActivityType | "all")}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("filterTypePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        {t("filterAllLabel")}
                      </div>
                    </SelectItem>
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[key as ActivityType]}`} />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>

            <div className="-mx-4 px-4">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
                    <p className="text-sm text-muted-foreground">{t("loadingLabel")}</p>
                  </div>
                </div>
              ) : paginatedActivities.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <HistoryIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      {search || filter !== "all" ? t("emptyFiltered") : t("emptyNone")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {paginatedActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 py-2.5 hover:bg-muted/50 rounded-md px-2 -mx-2 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${TYPE_COLORS[activity.activity_type]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{activityDescription(activity, t)}</span>
                          <span className={`flex items-center gap-1 text-[10px] font-medium text-white px-1.5 py-0.5 rounded ${SOURCE_COLORS[activity.source]} shrink-0`}>
                            {SOURCE_ICONS[activity.source]}
                            {SOURCE_LABELS[activity.source]}
                          </span>
                          <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded shrink-0">
                            {TYPE_LABELS[activity.activity_type]}
                          </span>
                        </div>
                        {!activity.event_key && activity.details && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.details}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(activity.timestamp, t)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t mt-3">
                <p className="text-xs text-muted-foreground">
                  {t("showingRange", {
                    from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                    to: Math.min(currentPage * ITEMS_PER_PAGE, filteredActivities.length),
                    total: filteredActivities.length,
                  })}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          className="h-8 w-8 text-xs"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PasswordConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(isOpen) => !isOpen && setConfirmAction(null)}
        title={confirmAction === "clear" ? t("clearButton") : t("exportButton")}
        description={confirmAction === "clear" ? t("clearPasswordDescription") : t("exportPasswordDescription")}
        onConfirmed={async () => {
          if (confirmAction === "clear") await doClear();
          else if (confirmAction === "export") doExport();
        }}
      />
    </div>
  );
}