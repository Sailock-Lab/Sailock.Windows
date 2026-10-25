// src/components/NotificationsBell.tsx
// Campana de la barra lateral y centro de notificaciones: una ventana tipo correo con la lista a la izquierda
// y el aviso completo (texto largo y botones de acción) a la derecha.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
  Mail,
  MailOpen,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppNotification,
  NotificationAction,
  NotificationSeverity,
  actionsOf,
  canDelete,
  clearNotifications,
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  severityOf,
  useNotifications,
} from "@/lib/notifications";
import type { View } from "@/components/layout/Sidebar";

const VIEWS: View[] = ["vault", "totp", "notes", "generator", "settings", "activity"];

const SEVERITY_STYLE: Record<NotificationSeverity, { icon: React.ElementType; text: string; bar: string }> = {
  info: { icon: Info, text: "text-sky-500", bar: "border-l-sky-500" },
  warning: { icon: AlertTriangle, text: "text-amber-500", bar: "border-l-amber-500" },
  security: { icon: ShieldAlert, text: "text-red-500", bar: "border-l-red-500" },
  success: { icon: CheckCircle2, text: "text-green-500", bar: "border-l-green-500" },
};

type Filter = "all" | "unread";

function relativeTime(ms: number, locale: string): string {
  const seconds = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "second");
}

export function NotificationsBell({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate: (view: View) => void;
}) {
  const { t, i18n } = useTranslation("notifications");
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const unread = notifications.filter((n) => !n.read).length;
  const visible = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter]
  );
  const selected = notifications.find((n) => n.id === selectedId) ?? null;

  // Al cerrar la ventana vuelve a empezar sin nada seleccionado.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setFilter("all");
    }
  }, [open]);

  const run = (action: Promise<void>) => action.catch((e) => toast.error(String(e)));

  const textOf = (n: AppNotification, part: "title" | "body"): string => {
    const key = `kind_${n.kind}_${part}`;
    const values = n.data ?? {};
    return i18n.exists(key, { ns: "notifications" }) ? t(key, values) : t(`kind_unknown_${part}`);
  };

  const select = (n: AppNotification) => {
    setSelectedId(n.id);
    if (!n.read) run(markNotificationRead(n.id, true));
  };

  // Flechas arriba y abajo recorren la lista.
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const index = visible.findIndex((n) => n.id === selectedId);
    const next = visible[e.key === "ArrowDown" ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1)];
    if (!next) return;
    select(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-nid="${next.id}"]`)?.focus());
  };

  const handleDelete = (n: AppNotification) => {
    // Tras borrar se abre el siguiente de la lista, como en un correo.
    const index = visible.findIndex((x) => x.id === n.id);
    const following = visible[index + 1] ?? visible[index - 1] ?? null;
    run(deleteNotification(n.id));
    setSelectedId(following ? following.id : null);
    if (following && !following.read) run(markNotificationRead(following.id, true));
  };

  const handleAction = (n: AppNotification, action: NotificationAction) => {
    if (!n.read) run(markNotificationRead(n.id, true));
    const target = VIEWS.find((v) => v === action.target);
    if (target) {
      setOpen(false);
      onNavigate(target);
    }
  };

  const actionLabel = (action: NotificationAction) =>
    i18n.exists(`action_${action.id}`, { ns: "notifications" }) ? t(`action_${action.id}`) : t("action_open");

  const fullDate = (ms: number) => new Date(ms).toLocaleString(i18n.language, { dateStyle: "long", timeStyle: "short" });

  const label = unread > 0 ? `${t("bellLabel")} (${unread})` : t("bellLabel");

  return (
    <>
      <Button
        variant="ghost"
        className={`relative gap-2 transition-all duration-200 hover:bg-muted hover:scale-[1.02] ${
          collapsed ? "justify-center px-0" : "justify-start"
        }`}
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
      >
        <Bell className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">{t("bellLabel")}</span>}
        {unread > 0 && (
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ${
              collapsed ? "absolute right-1 top-0.5" : ""
            }`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[80vh] max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1">
            {/* Lista (en ventanas estrechas se oculta cuando hay un aviso abierto) */}
            <div className={`min-h-0 w-full flex-col border-r md:flex md:w-80 md:shrink-0 ${selected ? "hidden" : "flex"}`}>
              <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
                <div role="group" className="flex rounded-md border p-0.5">
                  {(["all", "unread"] as Filter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      className={`rounded-sm px-2 py-0.5 text-xs transition-colors ${
                        filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {f === "all" ? t("filterAll") : `${t("filterUnread")}${unread > 0 ? ` (${unread})` : ""}`}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={unread === 0}
                    onClick={() => run(markAllNotificationsRead())}
                    title={t("markAllRead")}
                    aria-label={t("markAllRead")}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={notifications.length === 0}
                    onClick={() => setClearOpen(true)}
                    title={t("clearAll")}
                    aria-label={t("clearAll")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-30" />
                  {t("emptyTitle")}
                </div>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto" onKeyDown={handleListKeyDown}>
                  {visible.map((n) => {
                    const style = SEVERITY_STYLE[severityOf(n)];
                    const Icon = style.icon;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          data-nid={n.id}
                          onClick={() => select(n)}
                          className={`flex w-full gap-3 border-b border-l-4 px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none ${
                            style.bar
                          } ${n.id === selectedId ? "bg-muted" : ""}`}
                        >
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className={`min-w-0 flex-1 truncate text-sm ${n.read ? "" : "font-semibold"}`}>
                                {textOf(n, "title")}
                              </span>
                              {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                              {textOf(n, "body")}
                            </span>
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              {relativeTime(n.created_at, i18n.language)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Detalle */}
            <div className={`min-w-0 flex-1 flex-col md:flex ${selected ? "flex" : "hidden"}`}>
              {selected ? (
                <>
                  <div className="flex shrink-0 items-center gap-1 border-b px-4 py-2">
                    <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSelectedId(null)}>
                      <ArrowLeft className="mr-1 h-4 w-4" /> {t("back")}
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => run(markNotificationRead(selected.id, !selected.read))}
                        title={selected.read ? t("markUnread") : t("markRead")}
                        aria-label={selected.read ? t("markUnread") : t("markRead")}
                      >
                        {selected.read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={!canDelete(selected)}
                        onClick={() => handleDelete(selected)}
                        title={canDelete(selected) ? t("delete") : t("notDismissibleHint")}
                        aria-label={t("delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {(() => {
                      const severity = severityOf(selected);
                      const style = SEVERITY_STYLE[severity];
                      const Icon = style.icon;
                      return (
                        <div className="mx-auto max-w-2xl">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                            <Icon className="h-4 w-4" /> {t(`severity_${severity}`)}
                          </span>
                          <h3 className="mt-2 text-xl font-semibold">{textOf(selected, "title")}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{fullDate(selected.created_at)}</p>
                          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed">{textOf(selected, "body")}</p>
                          {actionsOf(selected).length > 0 && (
                            <div className="mt-6 flex flex-wrap gap-2">
                              {actionsOf(selected).map((action, i) => (
                                <Button
                                  key={action.id}
                                  variant={i === 0 ? "default" : "outline"}
                                  onClick={() => handleAction(selected, action)}
                                >
                                  {actionLabel(action)}
                                </Button>
                              ))}
                            </div>
                          )}
                          {!canDelete(selected) && (
                            <p className="mt-4 text-xs text-muted-foreground">{t("notDismissibleHint")}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <MailOpen className="h-10 w-10 opacity-30" />
                  {notifications.length === 0 ? t("emptyTitle") : t("selectHint")}
                </div>
              )}
            </div>
          </div>

          {/* Diálogo anidado: va dentro de la ventana para no cerrarla al interactuar con él. */}
          <Dialog open={clearOpen} onOpenChange={setClearOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("clearTitle")}</DialogTitle>
                <DialogDescription>{t("clearDescription")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClearOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setClearOpen(false);
                    setSelectedId(null);
                    run(clearNotifications());
                  }}
                >
                  {t("clearAll")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  );
}