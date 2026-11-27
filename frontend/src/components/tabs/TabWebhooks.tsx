import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bell,
  RefreshCw,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  ExternalLink,
  Route,
  Search,
  Copy,
  Check,
  X,
  FileCode,
  FileJson,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  Send,
  Database,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabWebhooks: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");

  // Routings catalog
  const [routings, setRoutings] = useState<any[]>([]);
  const [loadingRouting, setLoadingRouting] = useState(false);
  const [showGlobalCatalog, setShowGlobalCatalog] = useState(false);

  // Selection state for Master-Detail view
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"models" | "template" | "diag">("models");

  // Single webhook live status loading
  const [loadingLiveStatus, setLoadingLiveStatus] = useState(false);
  const [liveStatusResult, setLiveStatusResult] = useState<{ status: any; log: string } | null>(null);

  // Copied indicator
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const fetchWebhooks = useCallback(async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getWebhooks(activeEnv, activeToken, activeTenantId);
      setWebhooks(res.items || []);
      setStatuses(res.statuses || {});
    } catch (err) {
      console.error(err);
      setWebhooks([]);
      setStatuses({});
    } finally {
      setLoading(false);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const fetchRouting = useCallback(async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoadingRouting(true);
    try {
      const res = await ApiClient.getWebhookRouting(activeEnv, activeToken, activeTenantId);
      setRoutings(res.routings || []);
    } catch (err) {
      console.error(err);
      setRoutings([]);
    } finally {
      setLoadingRouting(false);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchWebhooks();
      fetchRouting();
    }
  }, [isLoggedIn, fetchWebhooks, fetchRouting]);

  // Lookup map for Message Routings (paired by messageType)
  const routingMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of routings) {
      if (r && r.messageType) {
        map.set(String(r.messageType).trim(), r);
      }
    }
    return map;
  }, [routings]);

  // Auto-select first webhook
  useEffect(() => {
    if (webhooks.length > 0) {
      if (!selectedWebhookId || !webhooks.some((w) => w.id === selectedWebhookId)) {
        setSelectedWebhookId(webhooks[0].id);
      }
    } else {
      setSelectedWebhookId(null);
    }
  }, [webhooks, selectedWebhookId]);

  // Active selected webhook object
  const activeWebhook = useMemo(() => {
    if (!selectedWebhookId) return null;
    return webhooks.find((w) => w.id === selectedWebhookId) || null;
  }, [webhooks, selectedWebhookId]);

  // Query live queue status for active webhook
  const fetchLiveStatusForActive = async (w: any) => {
    if (!w || !activeToken) return;
    setLoadingLiveStatus(true);
    try {
      const res = await ApiClient.getWebhookStatus(activeEnv, activeToken, activeTenantId, w.code, w.id);
      setLiveStatusResult({ status: res.status, log: res.log || "" });
      if (res.status) {
        const key = w.code || w.id;
        setStatuses((prev) => ({ ...prev, [key]: res.status }));
      }
    } catch (err: any) {
      setLiveStatusResult({
        status: null,
        log: String(err?.message || err || "Chyba při komunikaci s Message Gateway."),
      });
    } finally {
      setLoadingLiveStatus(false);
    }
  };

  // When active webhook changes, reset live status result
  useEffect(() => {
    setLiveStatusResult(null);
  }, [selectedWebhookId]);

  // Filtered webhooks list
  const filteredWebhooks = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return webhooks;

    return webhooks.filter((w) => {
      const code = String(w.code || "").toLowerCase();
      const id = String(w.id || "").toLowerCase();
      const url = String(w.webhookUrl || "").toLowerCase();
      const matchMsgTypes = Array.isArray(w.messageTypes) && w.messageTypes.some((mt: string) => mt.toLowerCase().includes(q));

      return code.includes(q) || id.includes(q) || url.includes(q) || matchMsgTypes;
    });
  }, [webhooks, search]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    let totalModels = 0;
    let totalReady = 0;
    let totalUnacked = 0;
    let healthyCount = 0;
    let errorCount = 0;

    for (const w of webhooks) {
      const msgTypes = Array.isArray(w.messageTypes) ? w.messageTypes : [];
      totalModels += msgTypes.length;

      const key = w.code || w.id;
      const stat = statuses[key] || statuses[w.id] || {};
      const ready = typeof stat.readyMessages === "number" ? stat.readyMessages : 0;
      const unack = typeof stat.unacknowledgedMessages === "number" ? stat.unacknowledgedMessages : 0;

      totalReady += ready;
      totalUnacked += unack;

      if (stat.connected || stat.status === "Healthy") {
        healthyCount++;
      } else if (stat.status === "Degraded" || stat.status === "Unhealthy") {
        errorCount++;
      }
    }

    return {
      totalWebhooks: webhooks.length,
      totalModels,
      totalReady,
      totalUnacked,
      healthyCount,
      errorCount,
    };
  }, [webhooks, statuses]);

  // Subscribed models of active webhook with resolved routings and filters
  const activeWebhookModels = useMemo(() => {
    if (!activeWebhook) return [];
    const msgTypes = Array.isArray(activeWebhook.messageTypes) ? activeWebhook.messageTypes : [];
    const filtersMap = activeWebhook.messageTypesWithFilters || {};
    const exprFiltersMap = activeWebhook.messageTypesWithExpressionFilters || {};

    return msgTypes.map((mt: string) => {
      const routing = routingMap.get(mt);
      const hFilter = filtersMap[mt];
      const eFilter = exprFiltersMap[mt];

      return {
        messageType: mt,
        contractType: routing?.contractType || mt.split(".").pop() || "EventContract",
        exchange: routing?.rabbitMqExchange || "-",
        routingKey: routing?.rabbitMqRoutingKey || "-",
        hierarchicalFilter: hFilter ? JSON.stringify(hFilter, null, 2) : null,
        expressionFilter: eFilter ? String(eFilter) : null,
      };
    });
  }, [activeWebhook, routingMap]);

  return (
    <div className="space-y-4">
      {/* --- TOP KPI CARDS --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Registrované Webhooky
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {kpiStats.totalWebhooks}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center text-lg">
            🔔
          </div>
        </Card>

        <Card className="p-3 border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Odebíraných modelů celkem
            </span>
            <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
              {kpiStats.totalModels}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg">
            📋
          </div>
        </Card>

        <Card className="p-3 border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Zprávy ve frontě (Ready)
            </span>
            <span
              className={`text-xl font-bold ${
                kpiStats.totalReady > 0 ? "text-amber-600" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {kpiStats.totalReady}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg">
            📬
          </div>
        </Card>

        <Card className="p-3 border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Neakceptované (Unacked)
            </span>
            <span
              className={`text-xl font-bold ${
                kpiStats.totalUnacked > 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {kpiStats.totalUnacked}
            </span>
          </div>
          <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg">
            ⏳
          </div>
        </Card>
      </div>

      {/* --- MASTER SECTION: SEZNAM WEBHOOK CONSUMERŮ --- */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🗂️</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Seznam registrovaných Webhook Consumerů ({filteredWebhooks.length} z {webhooks.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Hledat kód, ID, URL, odebíraný model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs bg-white dark:bg-slate-900"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Vymazat filtr"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Button
              variant={showGlobalCatalog ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowGlobalCatalog(!showGlobalCatalog)}
              className="gap-1 h-8 text-xs"
            >
              <Route className="w-3.5 h-3.5 text-teal-600" />
              <span>Katalog směrování ({routings.length})</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchWebhooks();
                fetchRouting();
              }}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit fronty</span>
            </Button>
          </div>
        </div>

        {/* Master Table */}
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
              <tr>
                <th className="py-2.5 px-3 w-28">Stav</th>
                <th className="py-2.5 px-3">Kód consumera (code)</th>
                <th className="py-2.5 px-3">ID consumera (id)</th>
                <th className="py-2.5 px-3">Cílová Webhook URL</th>
                <th className="py-2.5 px-3 text-center">Odebírané modely</th>
                <th className="py-2.5 px-3 text-center">Ve frontě (Ready)</th>
                <th className="py-2.5 px-3 text-center">Neakceptováno (Unacked)</th>
                <th className="py-2.5 px-3 text-right">Výběr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredWebhooks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {loading ? "Zjišťuji webhook consumery z Message Gateway..." : "Nebyly nalezeny žádné webhooky."}
                  </td>
                </tr>
              ) : (
                filteredWebhooks.map((w) => {
                  const key = w.code || w.id;
                  const stat = statuses[key] || statuses[w.id] || {};
                  const isHealthy = Boolean(stat.connected || stat.status === "Healthy");
                  const isDegraded = Boolean(stat.status === "Degraded" || stat.status === "Unhealthy");

                  let stBadge = <Badge variant="neutral">⚪ Neověřeno</Badge>;
                  if (isHealthy) {
                    stBadge = (
                      <Badge variant="success" className="gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Healthy</span>
                      </Badge>
                    );
                  } else if (isDegraded) {
                    stBadge = (
                      <Badge variant="error" className="gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        <span>{stat.status || "Degraded"}</span>
                      </Badge>
                    );
                  }

                  const modelsCount = Array.isArray(w.messageTypes) ? w.messageTypes.length : 0;
                  const isSelected = selectedWebhookId === w.id;

                  return (
                    <tr
                      key={w.id}
                      onClick={() => setSelectedWebhookId(w.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-950/40 border-l-4 border-teal-500 font-medium"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="py-2 px-3">{stBadge}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100 font-mono">
                        {w.code || "—"}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <span>{w.id}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(w.id);
                            }}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Kopírovat ID"
                          >
                            {copiedText === w.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400 max-w-xs truncate" title={w.webhookUrl}>
                        {w.webhookUrl || "-"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant="info">{modelsCount} modelů</Badge>
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {stat.readyMessages !== undefined ? (
                          <span className={stat.readyMessages > 0 ? "text-amber-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                            {stat.readyMessages}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {stat.unacknowledgedMessages !== undefined ? (
                          <span className={stat.unacknowledgedMessages > 0 ? "text-rose-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                            {stat.unacknowledgedMessages}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWebhookId(w.id);
                          }}
                        >
                          Detail & modely
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- DETAIL SECTION: DETAIL VYBRANÉHO WEBHOOKU & ODEBÍRANÉ MODELY --- */}
      {activeWebhook && (
        <Card className="border-teal-500/40 bg-teal-50/15 dark:bg-teal-950/10 shadow-md overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-teal-500/20 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔍</span>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Detail Webhook Consumera:{" "}
                <span className="font-mono text-teal-600">{activeWebhook.code || activeWebhook.id}</span>
                <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
                  (ID: {activeWebhook.id})
                </span>
              </div>
              <Badge variant="info">{activeWebhookModels.length} odebíraných modelů</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLiveStatusForActive(activeWebhook)}
                disabled={loadingLiveStatus}
                className="h-7 text-xs gap-1 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300"
              >
                <Activity className={`w-3.5 h-3.5 ${loadingLiveStatus ? "animate-spin" : "text-teal-600"}`} />
                <span>Obnovit živý stav fronty</span>
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar for Selected Webhook */}
          {(() => {
            const key = activeWebhook.code || activeWebhook.id;
            const liveStat = liveStatusResult?.status || statuses[key] || statuses[activeWebhook.id] || {};
            const isConn = Boolean(liveStat.connected || liveStat.status === "Healthy");

            return (
              <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-semibold">Cílová URL:</span>
                  <span className="font-mono text-teal-700 dark:text-teal-300 break-all select-all">
                    {activeWebhook.webhookUrl || "-"}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant={isConn ? "success" : "neutral"} className="text-[11px]">
                    {isConn ? "🟢 Připojen (Healthy)" : "🔴 Odpojen / Neověřeno"}
                  </Badge>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500">Fronta (Ready):</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {liveStat.readyMessages ?? "-"}
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500">Čeká na ACK:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {liveStat.unacknowledgedMessages ?? "-"}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Sub-tabs */}
          <div className="p-4 space-y-3">
            <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDetailTab("models")}
                className={`pb-2 px-3 border-b-2 transition-colors ${
                  detailTab === "models"
                    ? "border-teal-500 text-teal-600 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                📋 Odebírané typy zpráv / modely ({activeWebhookModels.length})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("template")}
                className={`pb-2 px-3 border-b-2 transition-colors ${
                  detailTab === "template"
                    ? "border-teal-500 text-teal-600 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                🌐 Šablona doručení & URL Kontrakt
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("diag")}
                className={`pb-2 px-3 border-b-2 transition-colors ${
                  detailTab === "diag"
                    ? "border-teal-500 text-teal-600 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                🔍 Diagnostika & Raw JSON
              </button>
            </div>

            {/* TAB 1: ODEBÍRANÉ MODELY */}
            {detailTab === "models" && (
              <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Modely a události registrované pro webhook: <b>{activeWebhook.code || activeWebhook.id}</b>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Message Gateway při publikaci kteréhokoliv z těchto modelů okamžitě doručí notifikaci na cílovou URL
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                        <th className="py-2.5 px-3">Odebíraný typ zprávy / Model (messageType)</th>
                        <th className="py-2.5 px-3">C# Kontrakt (contractType)</th>
                        <th className="py-2.5 px-3">Hierarchický filtr</th>
                        <th className="py-2.5 px-3">Výrazový filtr (Expression)</th>
                        <th className="py-2.5 px-3">RabbitMQ Exchange / Routing Key</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeWebhookModels.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Tento webhook consumer zatím nemá explicitně přiřazeny žádné odebírané typy zpráv.
                          </td>
                        </tr>
                      ) : (
                        activeWebhookModels.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                              <span className="text-teal-700 dark:text-teal-400">{m.messageType}</span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              <Badge variant="neutral" className="text-[11px]">
                                {m.contractType}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              {m.hierarchicalFilter ? (
                                <pre className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[10px] max-w-xs overflow-auto">
                                  {m.hierarchicalFilter}
                                </pre>
                              ) : (
                                <span className="text-slate-400 text-[11px]">— Všechna data (bez filtru)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {m.expressionFilter ? (
                                <code className="p-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded font-mono text-[11px]">
                                  {m.expressionFilter}
                                </code>
                              ) : (
                                <span className="text-slate-400 text-[11px]">— Bez výrazu</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                              <div>{m.exchange}</div>
                              <div className="text-[10px] text-slate-400">{m.routingKey}</div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* TAB 2: ŠABLONA DORUČENÍ & URL KONTRAKT */}
            {detailTab === "template" && (
              <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
                  <Send className="w-4 h-4 text-teal-600" />
                  <span>Předpis HTTP POST volání z Message Gateway na partnera</span>
                </div>

                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Message Gateway doručuje události pomocí <b>HTTP POST</b> požadavku podle následujícího standardního REST schématu:
                </p>

                <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg font-mono text-teal-700 dark:text-teal-300 font-semibold select-all">
                  POST {activeWebhook.webhookUrl || "https://partner.cz/api/webhook"}/&#123;messageType&#125;/&#123;contractType&#125;/&#123;messageId&#125;
                </div>

                {(() => {
                  const sampleMt = activeWebhookModels[0]?.messageType || "ASOL.DataService.ProcessedDataResultsEnqueued";
                  const sampleContract = activeWebhookModels[0]?.contractType || "ProcessedDataResultsEnqueuedContract";
                  const targetUrl = activeWebhook.webhookUrl || "https://partner.cz/api/webhook";

                  const sampleHttp = `POST ${targetUrl}/${sampleMt}/${sampleContract}/c0eb0000-5dfe-0015-8604-08dbd6ef8bf7\nAuthorization: Bearer <IDP_RS256_Token>\nContent-Type: application/json; charset=utf-8\nX-Tenant-Id: ${activeTenantId || "tenant-uuid"}\nX-UserClaim-tid: ${activeTenantId || "tenant-uuid"}\nX-UserClaim-client_id: plaza-pass\n\n{\n  "messageId": "c0eb0000-5dfe-0015-8604-08dbd6ef8bf7",\n  "messageType": "${sampleMt}",\n  "timestamp": "${new Date().toISOString()}",\n  "data": {\n    "sourceId": "aaef66df-377f-45fe-96e9-74372a17450b",\n    "modelId": "8fa54450-534a-4698-b790-ea89eb75240b"\n  }\n}`;

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Příklad konkrétního volání pro tento webhook:
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] gap-1"
                          onClick={() => copyToClipboard(sampleHttp)}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Kopírovat ukázku</span>
                        </Button>
                      </div>

                      <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto whitespace-pre">
                        {sampleHttp}
                      </pre>
                    </div>
                  );
                })()}

                <div className="p-3 rounded-lg border border-teal-200 dark:border-teal-900/40 bg-teal-50/50 dark:bg-teal-950/20 text-slate-700 dark:text-slate-300 space-y-1">
                  <div className="font-semibold text-teal-800 dark:text-teal-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    <span>Návratový kontrakt partnera (HTTP Status & ACK):</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Cílový webhook partnera musí na tento požadavek odpovědět stavovým kódem <b>`200 OK`</b> nebo <b>`204 No Content`</b>.
                    Návratový kód 4xx, 5xx nebo vypršení timeoutu spojení způsobí zachování zprávy ve frontě RabbitMQ a její opakované doručení (redelivery s backoff politikou).
                  </p>
                </div>
              </Card>
            )}

            {/* TAB 3: DIAGNOSTIKA & RAW JSON */}
            {detailTab === "diag" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <Card className="p-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Konfigurace Webhook Consumera (Registration Model):
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => copyToClipboard(JSON.stringify(activeWebhook, null, 2))}
                    >
                      <Copy className="w-3 h-3" />
                      <span>Kopírovat</span>
                    </Button>
                  </div>
                  <pre className="p-3 bg-slate-950 text-cyan-300 font-mono text-xs rounded-lg max-h-72 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(activeWebhook, null, 2)}
                  </pre>
                </Card>

                <Card className="p-3 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Diagnostická odpověď stavu fronty:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(
                            liveStatusResult?.status ||
                              statuses[activeWebhook.code || activeWebhook.id] ||
                              {},
                            null,
                            2
                          )
                        )
                      }
                    >
                      <Copy className="w-3 h-3" />
                      <span>Kopírovat</span>
                    </Button>
                  </div>
                  <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg max-h-72 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(
                      liveStatusResult?.status || statuses[activeWebhook.code || activeWebhook.id] || {
                        info: "Klikněte na 'Obnovit živý stav fronty' pro načtení aktuálního stavu z Message Gateway.",
                      },
                      null,
                      2
                    )}
                  </pre>
                  {liveStatusResult?.log && (
                    <div className="p-2.5 bg-slate-900 text-slate-400 font-mono text-[11px] rounded overflow-auto max-h-24">
                      {liveStatusResult.log}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* --- EXPANDABLE PLATFORM MESSAGE ROUTING CATALOG --- */}
      {showGlobalCatalog && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Globální katalog všech typů zpráv a routování na platformě (MessageRouting)
              </span>
              <Badge variant="info">{routings.length} typů zpráv</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGlobalCatalog(false)}
              className="h-7 text-xs"
            >
              ✕ Zavřít katalog
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Typ zprávy (messageType)</th>
                  <th className="py-2.5 px-3">C# Kontrakt (contractType)</th>
                  <th className="py-2.5 px-3">RabbitMQ Exchange</th>
                  <th className="py-2.5 px-3">RabbitMQ Routing Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {routings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      {loadingRouting ? "Načítám katalog směrování z Message Gateway..." : "Nebyly nalezeny žádné záznamy o směrování."}
                    </td>
                  </tr>
                ) : (
                  routings.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {r.messageType || "-"}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-teal-700 dark:text-teal-300">
                        {r.contractType || "-"}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                        {r.rabbitMqExchange || "-"}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                        {r.rabbitMqRoutingKey || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
