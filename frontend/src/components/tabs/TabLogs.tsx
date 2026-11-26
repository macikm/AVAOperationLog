import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Info,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatDateTime, formatDuration } from "../../lib/utils";

interface TabLogsProps {
  onNavigateToOutputQueue?: (filters: { operation_id?: string; result_id?: string }) => void;
}

export const TabLogs: React.FC<TabLogsProps> = ({ onNavigateToOutputQueue }) => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);

  // Filters
  const [operationId, setOperationId] = useState("");
  const [severityLevel, setSeverityLevel] = useState("Všechny");
  const [includeSystem, setIncludeSystem] = useState(true);
  const [agentId, setAgentId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [opScope, setOpScope] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Expanded cycle row
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedEventPayload, setSelectedEventPayload] = useState<any | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Data agents & sources for filter selection
  const [dataAgents, setDataAgents] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<any[]>([]);

  // Load available agents & sources for select dropdowns
  useEffect(() => {
    if (activeToken && isLoggedIn) {
      ApiClient.getDataAgents(activeEnv, activeToken, activeTenantId, { fetch_all: "true" })
        .then((res) => setDataAgents(res.items || []))
        .catch(console.error);
      ApiClient.getDataSources(activeEnv, activeToken, activeTenantId, { fetch_all: "true" })
        .then((res) => setDataSources(res.items || []))
        .catch(console.error);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const fetchLogs = async (currentOffset = offset) => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getLogs(activeEnv, activeToken, activeTenantId, {
        limit,
        offset: currentOffset,
        operation_id: operationId,
        severity_level: severityLevel === "Všechny" ? undefined : severityLevel,
        include_system: includeSystem,
        agent_id: agentId,
        source_id: sourceId,
        op_scope: opScope,
      });
      setLogs(res.items || []);
      setTotalCount(res.totalCount || 0);
      setOffset(currentOffset);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchLogs(0);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  // Aggregate cycle metrics
  const metrics = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const log of logs) {
      const severities = log.severities || [];
      const sevStr = Array.isArray(severities) ? severities.join(" ") : String(severities);
      if (sevStr.includes("Error")) errors++;
      else if (sevStr.includes("Warning")) warnings++;
      else infos++;
    }

    return { total: logs.length, errors, warnings, infos };
  }, [logs]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 bg-white dark:bg-slate-900 shadow-sm border-slate-200 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500">Načteno cyklů</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {metrics.total} <span className="text-xs font-normal text-slate-400">/ {totalCount}</span>
          </div>
        </Card>
        <Card className="p-3 bg-white dark:bg-slate-900 shadow-sm border-rose-200 dark:border-rose-950">
          <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Cykly s chybou
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{metrics.errors}</div>
        </Card>
        <Card className="p-3 bg-white dark:bg-slate-900 shadow-sm border-amber-200 dark:border-amber-950">
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Varování
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{metrics.warnings}</div>
        </Card>
        <Card className="p-3 bg-white dark:bg-slate-900 shadow-sm border-emerald-200 dark:border-emerald-950">
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Bez závad (Info)
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{metrics.infos}</div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-grow max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrovat podle Operation ID..."
                value={operationId}
                onChange={(e) => setOperationId(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900"
                onKeyDown={(e) => e.key === "Enter" && fetchLogs(0)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1 h-8 text-xs"
            >
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filtry</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchLogs(0)}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Vyhledat</span>
            </Button>
          </div>
        </div>

        {/* Extended Filters */}
        {showFilters && (
          <div className="p-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Minimální závažnost:</label>
              <select
                value={severityLevel}
                onChange={(e) => setSeverityLevel(e.target.value)}
                className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              >
                <option value="Všechny">Všechny úrovně</option>
                <option value="Info">Info</option>
                <option value="Warning">Warning</option>
                <option value="Error">Error</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Data Agent:</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs truncate"
              >
                <option value="">--- Všichni agenti ---</option>
                {dataAgents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.code || ag.id} ({ag.id?.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Data Source:</label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs truncate"
              >
                <option value="">--- Všechny zdroje ---</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name || ds.id} ({ds.id?.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Rozsah (Scope):</label>
              <Input
                placeholder="Operation Scope..."
                value={opScope}
                onChange={(e) => setOpScope(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id="inc_sys"
                checked={includeSystem}
                onChange={(e) => setIncludeSystem(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="inc_sys" className="font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                IncludeSystemLevel
              </label>
            </div>
          </div>
        )}

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3 w-8"></th>
                <th className="py-2.5 px-3">Závažnost</th>
                <th className="py-2.5 px-3">Operation ID</th>
                <th className="py-2.5 px-3">Data Agent</th>
                <th className="py-2.5 px-3">Data Source</th>
                <th className="py-2.5 px-3">Zahájeno</th>
                <th className="py-2.5 px-3">Doba trvání</th>
                <th className="py-2.5 px-3">Události</th>
                <th className="py-2.5 px-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám provozní logy..." : "Pro zadané filtry nebyly nalezeny žádné provozní cykly."}
                  </td>
                </tr>
              ) : (
                logs.map((cycle, idx) => {
                  const opId = cycle.operationId || `cycle-${idx}`;
                  const isExpanded = expandedRow === opId;
                  const severities = cycle.severities || [];
                  const sevStr = Array.isArray(severities) ? severities.join(" ") : String(severities);

                  let sevBadge = <Badge variant="success">Info</Badge>;
                  if (sevStr.includes("Error")) {
                    sevBadge = <Badge variant="error">Error</Badge>;
                  } else if (sevStr.includes("Warning")) {
                    sevBadge = <Badge variant="warning">Warning</Badge>;
                  }

                  const events = cycle.items || cycle.events || [];

                  return (
                    <React.Fragment key={opId}>
                      <tr
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                          isExpanded ? "bg-teal-50/40 dark:bg-teal-950/20" : ""
                        }`}
                        onClick={() => setExpandedRow(isExpanded ? null : opId)}
                      >
                        <td className="py-2.5 px-3 text-slate-400">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="py-2.5 px-3">{sevBadge}</td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                          {cycle.operationId || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {cycle.agentCode || cycle.agentId || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {cycle.sourceName || cycle.sourceId || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {formatDateTime(cycle.startedOn || cycle.createdOn)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {formatDuration(cycle.duration)}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="neutral">{events.length} událostí</Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {onNavigateToOutputQueue && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                              onClick={() =>
                                onNavigateToOutputQueue({
                                  operation_id: cycle.operationId,
                                })
                              }
                              title="Zobrazit výstupní frontu pro tuto operaci"
                            >
                              <span>Výstup</span>
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Events Timeline / Table */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60 dark:bg-slate-900/40">
                          <td colSpan={9} className="p-4 pl-10">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-teal-600" />
                                  <span>Detailní sled událostí v cyklu ({events.length}):</span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Operation ID: <code className="font-mono text-teal-600">{cycle.operationId}</code>
                                </div>
                              </div>

                              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                                      <th className="p-2 w-24">Úroveň</th>
                                      <th className="p-2 w-36">Čas</th>
                                      <th className="p-2 w-32">Kód události</th>
                                      <th className="p-2">Zpráva</th>
                                      <th className="p-2 w-28 text-right">Detail</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {events.length === 0 ? (
                                      <tr>
                                        <td colSpan={5} className="p-4 text-center text-slate-400">
                                          Žádné zaznamenané události v tomto cyklu.
                                        </td>
                                      </tr>
                                    ) : (
                                      events.map((ev: any, evIdx: number) => {
                                        const sev = ev.severity || ev.severityLevel || "Info";
                                        let b = <Badge variant="success">Info</Badge>;
                                        if (sev === "Error") b = <Badge variant="error">Error</Badge>;
                                        else if (sev === "Warning") b = <Badge variant="warning">Warning</Badge>;

                                        return (
                                          <tr key={evIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="p-2">{b}</td>
                                            <td className="p-2 text-slate-500 whitespace-nowrap">
                                              {formatDateTime(ev.createdOn || ev.timestamp)}
                                            </td>
                                            <td className="p-2 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                              {ev.eventCode || ev.code || "-"}
                                            </td>
                                            <td className="p-2 text-slate-700 dark:text-slate-300">
                                              {ev.message || ev.description || "-"}
                                            </td>
                                            <td className="p-2 text-right">
                                              {ev.payload || ev.data || ev.details ? (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 text-[10px] px-2"
                                                  onClick={() => setSelectedEventPayload(ev.payload || ev.data || ev.details)}
                                                >
                                                  JSON
                                                </Button>
                                              ) : (
                                                <span className="text-slate-400 text-[10px]">—</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>
            Zobrazeno <b>{logs.length}</b> z celkem <b>{totalCount}</b> záznamů
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => fetchLogs(Math.max(0, offset - limit))}
              className="h-8 px-2.5 text-xs"
            >
              ◀ Předchozí
            </Button>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Strana {Math.floor(offset / limit) + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= totalCount}
              onClick={() => fetchLogs(offset + limit)}
              className="h-8 px-2.5 text-xs"
            >
              Další ▶
            </Button>
          </div>
        </div>
      </Card>

      {/* JSON Payload Modal */}
      {selectedEventPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Info className="w-4 h-4 text-teal-600" />
                <span>Detail payloadu události</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(JSON.stringify(selectedEventPayload, null, 2))}
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedText ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setSelectedEventPayload(null)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs bg-slate-950 text-emerald-400 rounded-b-xl flex-grow">
              <pre className="whitespace-pre-wrap">{JSON.stringify(selectedEventPayload, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
