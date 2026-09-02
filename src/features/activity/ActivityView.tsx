import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  RefreshCw
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useActivity, ActivityEntry, ActivityType, ActivitySource } from "@/hooks/useActivity";

const ITEMS_PER_PAGE = 15;

const TYPE_LABELS: Record<ActivityType, string> = {
  login: "Inicio sesión",
  logout: "Cierre sesión",
  create: "Creación",
  edit: "Edición",
  delete: "Eliminación",
  restore: "Restauración",
  generate: "Generación",
  download: "Descarga",
};

const SOURCE_LABELS: Record<ActivitySource, string> = {
  vault: "Vault",
  generator: "Generador",
  settings: "Ajustes",
  system: "Sistema",
};

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

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  
  if (diff < 60000) {
    return "Hace unos segundos";
  } else if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `Hace ${mins} ${mins === 1 ? "minuto" : "minutos"}`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  } else {
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export function ActivityView() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const { loadActivities, clearActivities } = useActivity();

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
      return (
        activity.description.toLowerCase().includes(query) ||
        (activity.details && activity.details.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleClearAll = async () => {
    if (activities.length === 0) {
      toast.info("No hay actividades para limpiar");
      return;
    }
    
    if (confirm("¿Estás seguro de que quieres eliminar todo el historial de actividades?")) {
      const success = await clearActivities();
      if (success) {
        setActivities([]);
        toast.success("Historial de actividades limpiado");
      } else {
        toast.error("Error al limpiar el historial");
      }
    }
  };

  const handleRefresh = () => {
    loadData();
    toast.info("Historial actualizado");
  };

  const handleExport = () => {
    if (activities.length === 0) {
      toast.warning("No hay actividades para exportar");
      return;
    }

    const content = activities.map((a) => {
      const date = new Date(a.timestamp).toLocaleString("es-ES");
      const source = SOURCE_LABELS[a.source];
      return `[${date}] [${source}] ${a.activity_type.toUpperCase()} - ${a.description}${a.details ? ` (${a.details})` : ""}`;
    }).join("\n");

    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      toast.success(`Exportados ${activities.length} eventos de auditoría`);
    } catch (error) {
      console.error("Error al exportar:", error);
      toast.error("Error al exportar el historial");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">Auditoría</h2>
            <p className="text-sm text-muted-foreground">
              Historial de todas las acciones realizadas en Sailock.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
        <CardHeader className="shrink-0 pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              Registro de actividades
              {activities.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({activities.length} eventos)
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpiar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden pt-0">
          {/* Filtros */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 shrink-0">
            <div className="flex flex-wrap gap-2">
              <Select value={filter} onValueChange={(v) => v && setFilter(v as ActivityType | "all")}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      Todos
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
                placeholder="Buscar en auditoría..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Lista de actividades */}
          <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <RefreshCw className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-muted-foreground">Cargando historial...</p>
                </div>
              </div>
            ) : paginatedActivities.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <HistoryIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    {search || filter !== "all" 
                      ? "No hay actividades que coincidan con los filtros"
                      : "No hay actividades registradas aún"}
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
                        <span className="font-medium text-sm truncate">{activity.description}</span>
                        <span className={`flex items-center gap-1 text-[10px] font-medium text-white px-1.5 py-0.5 rounded ${SOURCE_COLORS[activity.source]} shrink-0`}>
                          {SOURCE_ICONS[activity.source]}
                          {SOURCE_LABELS[activity.source]}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {TYPE_LABELS[activity.activity_type]}
                        </span>
                      </div>
                      {activity.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.details}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t shrink-0 mt-3">
              <p className="text-xs text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredActivities.length)} de {filteredActivities.length}
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
  );
}