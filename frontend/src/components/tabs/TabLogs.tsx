import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Copy,
  ExternalLink,
  Info,
  Calendar,
  Database,
  ArrowRight,
  ChevronRight,
  Activity,
  Bot,
  SlidersHorizontal,
  FileJson,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { formatDateTime, formatDuration } from "../../lib/utils";

interface TabLogsProps {
  initialOperationId?: string;
  onNavigateToOutputQueue?: (filters: {
    operation_id?: string;
    result_id?: string;
    model_id?: string;
    client_id?: string;
    consumer_source_id?: string;
    publisher_source_id?: string;
  }) => void;
  onNavigateToInputQueue?: (filters: { operation_id?: string; source_id?: string; version?: string }) => void;
  onNavigateToDataSources?: (sourceId: string) => void;
}

interface DistinctOperation {
  operationId: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  severities: Set<string>;
  status: "Error" | "Warning" | "Info";
  agentCode?: string;
  agentId?: string;
  sourceName?: string;
  sourceId?: string;
}

export const TabLogs: React.FC<TabLogsProps> = ({
  initialOperationId,
  onNavigateToOutputQueue,
  onNavigateToInputQueue,
  onNavigateToDataSources,
}) => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  // Loading states
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingOpDetails, setLoadingOpDetails] = useState(false);

  // Raw downloaded log items (memory cache of all fetched logs)
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [chunkSize] = useState(100);

  // Map of operationId -> full context events (lazy loaded)
  const [fetchedDetailsMap, setFetchedDetailsMap] = useState<Record<string, any[]>>({});

  // Filter toolbar inputs (API filters)
  const [apiOpId, setApiOpId] = useState(() => {
    return initialOperationId || sessionStorage.getItem("ava_logs_op_id") || "";
  });
  const [apiSeverity, setApiSeverity] = useState("Všechny");
  const [apiIncludeSystem, setApiIncludeSystem] = useState(true);
  const [apiAgentId, setApiAgentId] = useState("");
  const [apiSourceId, setApiSourceId] = useState("");
  const [apiOpScope, setApiOpScope] = useState("");
  const [showApiFilters, setShowApiFilters] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("ava_logs_op_id", apiOpId);
  }, [apiOpId]);

  // Time filters
  const [useTime, setUseTime] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [timeFrom, setTimeFrom] = useState("00:00:00");
  const [dateTo, setDateTo] = useState("");
  const [timeTo, setTimeTo] = useState("23:59:59");

  // Selection states (The 3 zones!)
  // Zone 1: Selected Operation
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);

  // Zone 2: Filter in Detail Events
  const [detailSeverityFilter, setDetailSeverityFilter] = useState<string>("Všechny");
  const [detailSearch, setDetailSearch] = useState("");

  // Zone 3: Selected Event Row in the selected operation
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Source metadata cache for Inspector
  const [sourceMetadata, setSourceMetadata] = useState<Record<string, any>>({});
  const [loadingSourceInfo, setLoadingSourceInfo] = useState(false);

  // Modal for inspecting arbitrary JSON payloads
  const [jsonModal, setJsonModal] = useState<{ open: boolean; title: string; data: any }>({
    open: false,
    title: "",
    data: null,
  });
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Dropdown options & lookups
  const [dataAgents, setDataAgents] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<any[]>([]);

  const agentsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const ag of dataAgents) {
      if (ag.id) map[String(ag.id).trim()] = ag;
      if (ag.agentId) map[String(ag.agentId).trim()] = ag;
    }
    return map;
  }, [dataAgents]);

  const sourcesMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const s of dataSources) {
      if (s.id) map[String(s.id).trim()] = s;
      if (s.sourceId) map[String(s.sourceId).trim()] = s;
    }
    return map;
  }, [dataSources]);

  // Expanded message IDs in table
  const [expandedMsgIds, setExpandedMsgIds] = useState<Record<string, boolean>>({});
  const toggleExpandMessage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMsgIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Load agents and sources for dropdowns
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

  // Initial and refreshed fetch
  const fetchLogs = async (offset = 0, append = false) => {
    if (!activeToken || !isLoggedIn) return;
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await ApiClient.getLogs(activeEnv, activeToken, activeTenantId, {
        limit: chunkSize,
        offset,
        operation_id: apiOpId,
        severity_level: apiSeverity === "Všechny" ? undefined : apiSeverity,
        include_system: apiIncludeSystem,
        agent_id: apiAgentId,
        source_id: apiSourceId,
        op_scope: apiOpScope,
        use_time: useTime,
      });

      const newItems = res.items || [];
      if (append) {
        // Merge with existing avoiding duplicates
        const existingMap = new Map(rawLogs.map((l) => [l.id || Math.random(), l]));
        for (const item of newItems) {
          existingMap.set(item.id || Math.random(), item);
        }
        setRawLogs(Array.from(existingMap.values()));
      } else {
        setRawLogs(newItems);
        setCurrentOffset(0);
        setFetchedDetailsMap({});
        setSelectedOpId(null);
        setSelectedEventId(null);
      }

      setTotalCount(res.totalCount || 0);
      setCurrentOffset(offset);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchLogs(0, false);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  // Aggregate operations from current fetched logs (ZONE 1)
  const distinctOperations = useMemo(() => {
    const opMap = new Map<string, DistinctOperation>();

    for (const log of rawLogs) {
      const opId = log.operationId;
      if (!opId || opId === "None" || opId === "null") continue;

      const sev = log.severity || log.severityLevel || "Info";
      const created = log.createdOn || log.startedOn || "";

      if (!opMap.has(opId)) {
        opMap.set(opId, {
          operationId: opId,
          firstSeen: created,
          lastSeen: created,
          count: 1,
          severities: new Set([sev]),
          status: sev === "Error" ? "Error" : sev === "Warning" ? "Warning" : "Info",
          agentCode: log.agentCode,
          agentId: log.agentId,
          sourceName: log.sourceName,
          sourceId: log.sourceId,
        });
      } else {
        const op = opMap.get(opId)!;
        op.count += 1;
        op.severities.add(sev);
        if (created && (!op.firstSeen || new Date(created) < new Date(op.firstSeen))) {
          op.firstSeen = created;
        }
        if (created && (!op.lastSeen || new Date(created) > new Date(op.lastSeen))) {
          op.lastSeen = created;
        }
        if (op.severities.has("Error")) {
          op.status = "Error";
        } else if (op.severities.has("Warning")) {
          op.status = "Warning";
        }
      }
    }

    // Merge detail counts for active operations in opMap if loaded
    for (const [opId, events] of Object.entries(fetchedDetailsMap)) {
      if (opMap.has(opId) && Array.isArray(events) && events.length > 0) {
        const op = opMap.get(opId)!;
        op.count = Math.max(op.count, events.length);
        for (const ev of events) {
          const s = ev.severity || ev.severityLevel || "";
          if (s) op.severities.add(s);
        }
        if (op.severities.has("Error")) op.status = "Error";
        else if (op.severities.has("Warning")) op.status = "Warning";
      }
    }

    let result = Array.from(opMap.values());

    // Local filter by operationId query if provided
    if (apiOpId.trim()) {
      const q = apiOpId.trim().toLowerCase();
      result = result.filter((op) => op.operationId.toLowerCase().includes(q));
    }

    // Sort distinct operations by firstSeen descending (newest first)
    return result.sort((a, b) => {
      const da = a.firstSeen ? new Date(a.firstSeen).getTime() : 0;
      const db = b.firstSeen ? new Date(b.firstSeen).getTime() : 0;
      return db - da;
    });
  }, [rawLogs, fetchedDetailsMap, apiOpId]);

  // System events without operationId
  const systemLogs = useMemo(() => {
    return rawLogs.filter(
      (log) => !log.operationId || log.operationId === "None" || log.operationId === "null"
    );
  }, [rawLogs]);

  // Auto-select first operation if none selected or if previously selected is gone
  useEffect(() => {
    if (distinctOperations.length > 0) {
      if (!selectedOpId || !distinctOperations.some((op) => op.operationId === selectedOpId)) {
        setSelectedOpId(distinctOperations[0].operationId);
      }
    } else {
      setSelectedOpId(null);
    }
  }, [distinctOperations, selectedOpId]);

  // Lazy loading full events when an operation is selected
  const fetchFullOperationEvents = useCallback(
    async (opId: string) => {
      if (!opId || fetchedDetailsMap[opId] || !activeToken) return;
      setLoadingOpDetails(true);
      try {
        const res = await ApiClient.getLogs(activeEnv, activeToken, activeTenantId, {
          operation_id: opId,
          limit: 1000,
          offset: 0,
        });
        const events = res.items || [];
        setFetchedDetailsMap((prev) => ({ ...prev, [opId]: events }));
      } catch (err) {
        console.error("Failed to lazy load operation context", err);
      } finally {
        setLoadingOpDetails(false);
      }
    },
    [activeEnv, activeToken, activeTenantId, fetchedDetailsMap]
  );

  useEffect(() => {
    if (selectedOpId) {
      fetchFullOperationEvents(selectedOpId);
    }
  }, [selectedOpId, fetchFullOperationEvents]);

  // Events for selected operation (ZONE 2)
  const operationEvents = useMemo(() => {
    if (!selectedOpId) return [];
    const directEvents = rawLogs.filter((log) => log.operationId === selectedOpId);
    const downloadedEvents = fetchedDetailsMap[selectedOpId] || [];

    const map = new Map<string, any>();
    for (const ev of [...directEvents, ...downloadedEvents]) {
      const id = ev.id || `${ev.operationId}-${ev.createdOn}-${ev.activityType}`;
      map.set(id, ev);
    }

    let result = Array.from(map.values());

    // Filter by severity
    if (detailSeverityFilter !== "Všechny") {
      result = result.filter((ev) => {
        const s = ev.severity || ev.severityLevel || "";
        return s === detailSeverityFilter;
      });
    }

    // Filter by search query
    if (detailSearch.trim()) {
      const q = detailSearch.toLowerCase().trim();
      result = result.filter(
        (ev) =>
          ev.message?.toLowerCase().includes(q) ||
          ev.activityType?.toLowerCase().includes(q) ||
          ev.operationType?.toLowerCase().includes(q) ||
          ev.source?.toLowerCase().includes(q) ||
          ev.scopeId?.toLowerCase().includes(q)
      );
    }

    // Sort chronologically ascending
    return result.sort((a, b) => {
      const da = a.createdOn ? new Date(a.createdOn).getTime() : 0;
      const db = b.createdOn ? new Date(b.createdOn).getTime() : 0;
      return da - db;
    });
  }, [selectedOpId, rawLogs, fetchedDetailsMap, detailSeverityFilter, detailSearch]);

  // Auto-select first event when operation events change
  useEffect(() => {
    if (operationEvents.length > 0) {
      if (!selectedEventId || !operationEvents.some((ev) => ev.id === selectedEventId)) {
        setSelectedEventId(operationEvents[0].id || null);
      }
    } else {
      setSelectedEventId(null);
    }
  }, [operationEvents, selectedEventId]);

  // Selected event object (ZONE 3)
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return operationEvents.find((ev) => ev.id === selectedEventId) || null;
  }, [operationEvents, selectedEventId]);

  // Auto-fetch Data Source info for selected event's sourceId
  useEffect(() => {
    if (!selectedEvent) return;
    const sId = selectedEvent.sourceId || selectedEvent.SourceId;
    if (sId && !sourceMetadata[sId] && activeToken) {
      setLoadingSourceInfo(true);
      ApiClient.getDatasourceInfo(activeEnv, activeToken, activeTenantId, sId)
        .then((res) => {
          if (res?.data) {
            setSourceMetadata((prev) => ({ ...prev, [sId]: res.data }));
          }
        })
        .catch(() => { })
        .finally(() => setLoadingSourceInfo(false));
    }
  }, [selectedEvent, activeEnv, activeToken, activeTenantId, sourceMetadata]);

  // Calculate ScopeId durations for performance analytics
  const scopeDurations = useMemo(() => {
    if (!selectedOpId || operationEvents.length === 0) return [];

    const begins = new Map<string, Date>();
    const ends = new Map<string, Date>();

    for (const ev of operationEvents) {
      const act = String(ev.activityType || "");
      const sc = ev.scopeId;
      if (!sc || sc === "None") continue;

      const t = ev.createdOn ? new Date(ev.createdOn) : null;
      if (!t) continue;

      if (act.endsWith("|Begin")) {
        begins.set(sc, t);
      } else if (act.endsWith("|End")) {
        ends.set(sc, t);
      }
    }

    const items: { scopeId: string; durationSec: number }[] = [];
    for (const [sc, bTime] of begins.entries()) {
      if (ends.has(sc)) {
        const eTime = ends.get(sc)!;
        const dur = (eTime.getTime() - bTime.getTime()) / 1000;
        items.push({ scopeId: sc, durationSec: Math.max(0, dur) });
      }
    }

    return items;
  }, [selectedOpId, operationEvents]);

  // Extract JSON strings from selected event
  const eventJsonFields = useMemo(() => {
    if (!selectedEvent) return {};
    const res: Record<string, any> = {};

    for (const [key, val] of Object.entries(selectedEvent)) {
      if (typeof val === "object" && val !== null) {
        res[key] = val;
      } else if (typeof val === "string") {
        const s = val.trim();
        if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
          try {
            res[key] = JSON.parse(s);
          } catch { }
        }
      }
    }
    return res;
  }, [selectedEvent]);

  // Overall KPIs
  const kpiStats = useMemo(() => {
    let errs = 0;
    let warns = 0;
    for (const l of rawLogs) {
      const s = String(l.severity || l.severityLevel || "");
      if (s.includes("Error")) errs++;
      else if (s.includes("Warning")) warns++;
    }

    const oldest = rawLogs.reduce((acc, l) => {
      const d = l.createdOn ? new Date(l.createdOn).getTime() : Infinity;
      return d < acc ? d : acc;
    }, Infinity);

    return {
      totalLogs: rawLogs.length,
      distinctOps: distinctOperations.length,
      errors: errs,
      warnings: warns,
      oldestStr: oldest !== Infinity ? formatDateTime(new Date(oldest).toISOString()) : "-",
    };
  }, [rawLogs, distinctOperations]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* --- TOP BAR: FILTRY & STRÁNKOVÁNÍ --- */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 flex-grow max-w-lg">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrovat podle Operation ID..."
                value={apiOpId}
                onChange={(e) => setApiOpId(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs bg-white dark:bg-slate-900"
                onKeyDown={(e) => e.key === "Enter" && fetchLogs(0, false)}
              />
              {apiOpId && (
                <button
                  type="button"
                  onClick={() => {
                    setApiOpId("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Vymazat filtr"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              variant={showApiFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowApiFilters(!showApiFilters)}
              className="gap-1 h-8 text-xs shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Parametry API</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => fetchLogs(0, false)}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Použít filtry</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs(currentOffset + chunkSize, true)}
              disabled={loadingMore}
              className="gap-1 h-8 text-xs"
              title="Načte dalších 100 starších záznamů ze serveru do paměti"
            >
              <Clock className={`w-3.5 h-3.5 ${loadingMore ? "animate-spin" : ""}`} />
              <span>Načíst dalších {chunkSize}</span>
            </Button>
          </div>
        </div>

        {/* Collapsible API Filter Inputs */}
        {showApiFilters && (
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Minimální závažnost:</label>
              <select
                value={apiSeverity}
                onChange={(e) => setApiSeverity(e.target.value)}
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
                value={apiAgentId}
                onChange={(e) => setApiAgentId(e.target.value)}
                className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs truncate"
              >
                <option value="">--- Všichni agenti ---</option>
                {dataAgents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.code || ag.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Data Source:</label>
              <select
                value={apiSourceId}
                onChange={(e) => setApiSourceId(e.target.value)}
                className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs truncate"
              >
                <option value="">--- Všechny zdroje ---</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name || ds.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Operation Scope:</label>
              <Input
                placeholder="Scope..."
                value={apiOpScope}
                onChange={(e) => setApiOpScope(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {/* KPI Strip */}
        <div className="px-3 py-2 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Stav paměti:</span>
          <Badge variant="info">{kpiStats.totalLogs} událostí</Badge>
          <Badge variant="neutral">{kpiStats.distinctOps} operačních cyklů</Badge>
          {kpiStats.errors > 0 && <Badge variant="error">{kpiStats.errors} chyb</Badge>}
          {kpiStats.warnings > 0 && <Badge variant="warning">{kpiStats.warnings} varování</Badge>}
          <span className="text-slate-400 text-[11px] ml-auto">
            Nejstarší načtený záznam: <b>{kpiStats.oldestStr}</b>
          </span>
        </div>
      </Card>

      {/* --- HLAVNÍ 3-ZÓNOVÝ ROZVRH (MASTER / DETAIL / INSPECTOR) --- */}

      {/* ZÓNA 1: MASTER GRID - SEZNAM OPERAČNÍCH CYKLŮ */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🗂️</span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              1. Seznam operačních cyklů
            </span>
            <Badge variant="info" className="ml-1">
              {distinctOperations.length} cyklů
            </Badge>
          </div>
          <span className="text-[11px] text-slate-400">
            Kliknutím na řádek zobrazíte detailní sled událostí operace
          </span>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-60">
          <table className="w-full text-left text-xs border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/90 backdrop-blur z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
              <tr>
                <th className="py-2 px-3 w-28">Stav</th>
                <th className="py-2 px-3">Operation ID</th>
                <th className="py-2 px-3">První výskyt (Zahájeno)</th>
                <th className="py-2 px-3">Poslední záznam</th>
                <th className="py-2 px-3 text-center">Počet událostí</th>
                <th className="py-2 px-3">Agent / Zdroj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {distinctOperations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {loading ? "Načítám data z API..." : "Žádné operační cykly pro zadané filtry."}
                  </td>
                </tr>
              ) : (
                distinctOperations.map((op) => {
                  const isSelected = selectedOpId === op.operationId;
                  let stBadge = <Badge variant="success">🟢 Info</Badge>;
                  if (op.status === "Error") stBadge = <Badge variant="error">🔴 Error</Badge>;
                  else if (op.status === "Warning") stBadge = <Badge variant="warning">🟡 Warning</Badge>;

                  return (
                    <tr
                      key={op.operationId}
                      onClick={() => setSelectedOpId(op.operationId)}
                      className={`cursor-pointer transition-colors ${isSelected
                          ? "bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 font-medium border-l-4 border-teal-600"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                    >
                      <td className="py-2 px-3">{stBadge}</td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        {isSelected && <ChevronRight className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                        <span>{op.operationId}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTime(op.firstSeen)}
                      </td>
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(op.lastSeen)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant="neutral" className="font-semibold">
                          {op.count}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 truncate max-w-xs">
                        {op.agentCode || op.sourceName || op.agentId || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ZÓNA 2: DETAIL GRID - SEZNAM VŠECH OPERACÍ / UDÁLOSTÍ VYBRANÉHO OPERATION ID */}
      {selectedOpId && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📄</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                2. Sled událostí pro OperationID:
              </span>
              <code className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                {selectedOpId}
              </code>
              <Badge variant="info">{operationEvents.length} událostí</Badge>
              {loadingOpDetails && (
                <span className="text-[10px] text-teal-600 animate-pulse flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Dotahuji kompletní kontext...
                </span>
              )}
            </div>

            {/* In-table filters for events */}
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Hledat ve zprávě, aktivitě..."
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  className="pl-7 h-7 text-[11px]"
                />
              </div>

              <select
                value={detailSeverityFilter}
                onChange={(e) => setDetailSeverityFilter(e.target.value)}
                className="h-7 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[11px]"
              >
                <option value="Všechny">Všechny závažnosti</option>
                <option value="Error">Pouze chyby (Error)</option>
                <option value="Warning">Pouze varování (Warning)</option>
                <option value="Info">Pouze info (Info)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse min-w-[1750px]">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 shadow-sm z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                <tr>
                  <th className="py-2.5 px-3 w-24">Závažnost</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Čas (createdOn)</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Fáze (operationType)</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Aktivita (activityType)</th>
                  <th className="py-2.5 px-3 min-w-[420px] max-w-2xl">Zpráva (message)</th>
                  <th className="py-2.5 px-3 min-w-[90px]">Zdroj</th>
                  <th className="py-2.5 px-3 min-w-[170px]">Source ID</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Název zdroje (sourceName)</th>
                  <th className="py-2.5 px-3 min-w-[170px]">Agent ID</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Kód agenta (agentCode)</th>
                  <th className="py-2.5 px-3 min-w-[130px]">Scope ID</th>
                  <th className="py-2.5 px-3 min-w-[130px]">JSON Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {operationEvents.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">
                      Žádné události neodpovídají lokálnímu filtru.
                    </td>
                  </tr>
                ) : (
                  operationEvents.map((ev, idx) => {
                    const evId = ev.id || `${selectedOpId}-${idx}`;
                    const isSelected = selectedEventId === evId;
                    const sev = ev.severity || ev.severityLevel || "Info";

                    let b = <Badge variant="success">🟢 Info</Badge>;
                    if (sev === "Error") b = <Badge variant="error">🔴 Error</Badge>;
                    else if (sev === "Warning") b = <Badge variant="warning">🟡 Warning</Badge>;

                    const sourceLookupName = ev.sourceName || (ev.sourceId && sourcesMap[String(ev.sourceId).trim()]?.name) || "-";
                    const agentLookupCode = ev.agentCode || (ev.agentId && (agentsMap[String(ev.agentId).trim()]?.code || agentsMap[String(ev.agentId).trim()]?.customCode)) || "-";
                    const hasCustom = Boolean(ev.customFields && ev.customFields !== "{}" && ev.customFields !== "null");
                    const hasDetails = Boolean(ev.details && ev.details !== "{}" && ev.details !== "null");

                    return (
                      <tr
                        key={evId}
                        onClick={() => setSelectedEventId(evId)}
                        className={`cursor-pointer transition-colors ${isSelected
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-medium border-l-4 border-amber-500"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                      >
                        <td className="py-2 px-3 whitespace-nowrap">{b}</td>
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                          {formatDateTime(ev.createdOn)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {ev.operationType || "-"}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-teal-700 dark:text-teal-400 whitespace-nowrap">
                          {ev.activityType || "-"}
                        </td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200 min-w-[420px] max-w-2xl">
                          <div className="flex flex-col gap-1">
                            <div
                              className={`font-mono text-xs leading-relaxed select-text ${
                                expandedMsgIds[evId] ? "whitespace-pre-wrap break-all" : "line-clamp-2 break-words"
                              }`}
                              title={ev.message || ""}
                            >
                              {ev.message || "-"}
                            </div>
                            {ev.message && ev.message.length > 60 && (
                              <button
                                type="button"
                                onClick={(e) => toggleExpandMessage(evId, e)}
                                className="self-start text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-0.5"
                              >
                                {expandedMsgIds[evId] ? (
                                  <>
                                    <ChevronUp className="w-3 h-3" /> Zkrátit zprávu
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3" /> Zobrazit celou zprávu
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {ev.source || "-"}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap" title={ev.sourceId || ""}>
                          {ev.sourceId ? String(ev.sourceId) : "-"}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap" title={sourceLookupName}>
                          {sourceLookupName}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap" title={ev.agentId || ""}>
                          {ev.agentId ? String(ev.agentId) : "-"}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap" title={agentLookupCode}>
                          {agentLookupCode}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap" title={ev.scopeId || ""}>
                          {ev.scopeId ? String(ev.scopeId) : "-"}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {hasCustom && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 rounded font-mono font-medium"
                                title="Obsahuje customFields"
                              >
                                customFields
                              </span>
                            )}
                            {hasDetails && (
                              <span
                                className="px-1.5 py-0.5 text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded font-mono font-medium"
                                title="Obsahuje details"
                              >
                                details
                              </span>
                            )}
                            {!hasCustom && !hasDetails && <span className="text-slate-400">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ZÓNA 3: DETAIL KONKRÉTNÍHO ŘÁDKU (ROW INSPECTOR + RYCHLÉ AKCE + JSON NÁHLEDY) */}
      {selectedEvent && (
        <Card className="border-teal-500/30 bg-white dark:bg-slate-900 shadow-md">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-teal-50/20 dark:bg-teal-950/20">
            <div className="flex items-center gap-2">
              <span className="text-base">🔍</span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                3. Detaily a rychlé akce pro vybraný řádek události
              </span>
              <code className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                ID: {selectedEvent.id || "-"}
              </code>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Jump to SourcingData v1 */}
              {onNavigateToInputQueue && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-teal-700 dark:text-teal-300 border-teal-300 hover:bg-teal-50"
                  onClick={() =>
                    onNavigateToInputQueue({
                      operation_id: selectedEvent.operationId || selectedOpId || undefined,
                      source_id: selectedEvent.sourceId || undefined,
                      version: "v1",
                    })
                  }
                  title="Předvyplní SourceID a OperationID a přepne na Vstupní frontu (v1)"
                >
                  <span>📥 Do Vstupní fronty</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}

              {/* Jump to Output Queue */}
              {onNavigateToOutputQueue && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-teal-700 dark:text-teal-300 border-teal-300 hover:bg-teal-50"
                  onClick={() => {
                    const opId = selectedOpId || selectedEvent?.operationId || "";

                    let foundModelId = selectedEvent?.modelId || "";
                    let foundClientId = selectedEvent?.agentCode || "";
                    let foundResultId = selectedEvent?.resultId || "";
                    let foundConsumerSourceId = selectedEvent?.sourceId || "";
                    let foundPublisherSourceId = "";

                    // Scan all events of this operation to detect result_id, publisher_source_id, model_id, client_id
                    for (const ev of operationEvents) {
                      const msg = String(ev.message || "");
                      const evOp = String(ev.operationType || "").toLowerCase();

                      // 1. Result ID / QueueItem ID
                      if (!foundResultId) {
                        const mQ = msg.match(/enqueued to '([a-f0-9\-]{36})'/i);
                        if (mQ) foundResultId = mQ[1];
                      }

                      // 2. Publisher Source ID
                      if (!foundPublisherSourceId) {
                        const mP = msg.match(/started for '([a-f0-9\-]{36})' data/i);
                        if (mP) foundPublisherSourceId = mP[1];
                      }

                      // 3. Model ID
                      if (!foundModelId) {
                        const mT =
                          msg.match(/Transform\s+'([a-f0-9\-]{36})/i) ||
                          msg.match(/Processed data package\s+'([a-f0-9\-]{36})'/i) ||
                          msg.match(/model\s*['":\s]+([a-f0-9\-]{36})/i);
                        if (mT) foundModelId = mT[1];
                        else if (ev.modelId) foundModelId = ev.modelId;
                      }

                      // 4. Client ID: agentCode in ConsumeData
                      if (!foundClientId && (evOp.includes("consumedata") || evOp.includes("consumeddata"))) {
                        if (ev.agentCode) foundClientId = String(ev.agentCode).trim();
                      }

                      // 5. Source ID if missing
                      if (!foundConsumerSourceId && ev.sourceId) {
                        foundConsumerSourceId = String(ev.sourceId).trim();
                      }
                    }

                    onNavigateToOutputQueue({
                      operation_id: opId || undefined,
                      result_id: foundResultId || undefined,
                      model_id: foundModelId || undefined,
                      client_id: foundClientId || undefined,
                      consumer_source_id: foundConsumerSourceId || undefined,
                      publisher_source_id: foundPublisherSourceId || undefined,
                    });
                  }}
                  title="Přepne na Výstupní frontu, předvyplní kontext operace a ihned vyhledá data"
                >
                  <span>📤 Do Výstupní fronty</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}

              {/* Jump to Data Sources */}
              {onNavigateToDataSources && selectedEvent.sourceId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => onNavigateToDataSources(selectedEvent.sourceId)}
                  title="Zobrazit detail v Data Sources"
                >
                  <span>🔌 V Data Sources</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          <CardContent className="p-4 space-y-4">
            {/* Primary Event Properties Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Aktivita:</span>
                <span className="font-mono font-bold text-teal-700 dark:text-teal-400">{selectedEvent.activityType || "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Typ operace:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedEvent.operationType || "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Čas vzniku:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">{formatDateTime(selectedEvent.createdOn)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Scope ID:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400 break-all">{selectedEvent.scopeId || "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Zdroj (Source):</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {selectedEvent.source || "-"}
                  {(selectedEvent.sourceName || (selectedEvent.sourceId && sourcesMap[String(selectedEvent.sourceId).trim()]?.name)) && (
                    <span className="text-slate-500 ml-1">
                      ({selectedEvent.sourceName || sourcesMap[String(selectedEvent.sourceId).trim()]?.name})
                    </span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Source ID:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{selectedEvent.sourceId || "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Agent ID:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{selectedEvent.agentId || "-"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Kód agenta:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedEvent.agentCode || (selectedEvent.agentId && (agentsMap[String(selectedEvent.agentId).trim()]?.code || agentsMap[String(selectedEvent.agentId).trim()]?.customCode)) || "-"}
                </span>
              </div>
            </div>

            {/* Kompletní znění zprávy (full message viewer bez ořezání) */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  <span>Kompletní znění zprávy (Message):</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  onClick={() => {
                    if (selectedEvent.message) {
                      navigator.clipboard.writeText(selectedEvent.message);
                      setCopiedNotification(true);
                      setTimeout(() => setCopiedNotification(false), 2000);
                    }
                  }}
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedNotification ? "Zkopírováno!" : "Kopírovat zprávu"}</span>
                </Button>
              </div>
              <div className="p-3 bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed select-text text-slate-900 dark:text-slate-100 max-h-64 overflow-y-auto shadow-inner">
                {selectedEvent.message || "(Prázdná zpráva)"}
              </div>
            </div>

            {/* JSON Fields Inspectors Buttons & Previews */}
            {Object.keys(eventJsonFields).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileJson className="w-3.5 h-3.5 text-teal-600" />
                  <span>Strukturovaná JSON pole řádku (customFields, details, payload...):</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(eventJsonFields).map(([fieldName, jsonVal]) => (
                    <Button
                      key={fieldName}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8 border-teal-500/30 hover:bg-teal-50 dark:hover:bg-teal-950/50"
                      onClick={() =>
                        setJsonModal({
                          open: true,
                          title: `Obsah pole '${fieldName}' (ID: ${selectedEvent.id})`,
                          data: jsonVal,
                        })
                      }
                    >
                      <FileJson className="w-3 h-3 text-teal-600" />
                      <span>Zobrazit '{fieldName}'</span>
                      <Badge variant="neutral" className="text-[10px] py-0 px-1">
                        {typeof jsonVal === "object" && jsonVal !== null ? Object.keys(jsonVal).length : "JSON"}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Data Source Lookup Card (if sourceId is present) */}
            {selectedEvent.sourceId && sourceMetadata[selectedEvent.sourceId] && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-teal-600" />
                    <span>Metadata Data Source ({sourceMetadata[selectedEvent.sourceId].name || selectedEvent.sourceId})</span>
                  </span>
                  <Badge variant="info">Dotaženo z API</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <div>Aplikace: <b>{sourceMetadata[selectedEvent.sourceId].applicationCode || "-"}</b></div>
                  <div>Agent: <b>{sourceMetadata[selectedEvent.sourceId].agentCode || "-"}</b></div>
                  <div>Povoleno: <b>{sourceMetadata[selectedEvent.sourceId].enabled ? "Ano" : "Ne"}</b></div>
                  <div>Typ: <b>{sourceMetadata[selectedEvent.sourceId].consumerType || "-"}</b></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* --- STATISTIKA A ANALYTIKA TRVÁNÍ (SCOPE ID PERFORMANCE) --- */}
      {selectedOpId && scopeDurations.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="p-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>Analýza doby zpracování Performance úseků (ScopeID): {selectedOpId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="space-y-2">
              {scopeDurations.map((item, idx) => {
                const maxDur = Math.max(...scopeDurations.map((s) => s.durationSec), 0.001);
                const pct = Math.min(100, Math.max(5, (item.durationSec / maxDur) * 100));

                return (
                  <div key={idx} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{item.scopeId}</span>
                      <span className="font-mono font-bold text-teal-700 dark:text-teal-400">
                        {item.durationSec.toFixed(3)} s
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-teal-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- SYSTÉMOVÉ UDÁLOSTI BEZ OPERATION ID --- */}
      {systemLogs.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span>⚙️</span>
              <span>Systémové a infrastrukturní události platformy (bez OperationID)</span>
            </div>
            <Badge variant="neutral">{systemLogs.length} záznamů</Badge>
          </div>

          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3">Závažnost</th>
                  <th className="py-2 px-3">Čas</th>
                  <th className="py-2 px-3">Zpráva</th>
                  <th className="py-2 px-3">Zdroj</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {systemLogs.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-1.5 px-3">
                      <Badge variant={l.severity === "Error" ? "error" : "neutral"}>{l.severity || "Info"}</Badge>
                    </td>
                    <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatDateTime(l.createdOn)}
                    </td>
                    <td className="py-1.5 px-3 text-slate-800 dark:text-slate-200">{l.message || "-"}</td>
                    <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap">{l.source || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* --- MODÁLNÍ DIALOG PRO DETAIL JSONU --- */}
      {jsonModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileJson className="w-4 h-4 text-teal-600" />
                <span>{jsonModal.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(JSON.stringify(jsonModal.data, null, 2))}
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedNotification ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setJsonModal({ open: false, title: "", data: null })}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs bg-slate-950 text-emerald-400 rounded-b-xl flex-grow">
              <pre className="whitespace-pre-wrap">{JSON.stringify(jsonModal.data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
