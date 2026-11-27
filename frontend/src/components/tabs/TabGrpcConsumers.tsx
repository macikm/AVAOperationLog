import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Radio,
  Search,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  X,
  ExternalLink,
  SlidersHorizontal,
  FileText,
  FileJson,
  Layers,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabGrpcConsumers: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [allStatuses, setAllStatuses] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "disconnected">("all");

  // Selected consumer live metrics inspection
  const [selectedConsumer, setSelectedConsumer] = useState<any | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [consumerStatusData, setConsumerStatusData] = useState<{ status: any; log: string } | null>(null);
  const [modalTab, setModalTab] = useState<"metrics" | "log" | "json">("metrics");

  // Manual code entry
  const [manualCode, setManualCode] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  // Copied indicator
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const fetchConsumers = useCallback(async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getGrpcConsumers(activeEnv, activeToken, activeTenantId);
      setConsumers(res.grpc_consumers || []);
      setAllStatuses(res.all_statuses || {});
    } catch (err) {
      console.error(err);
      setConsumers([]);
      setAllStatuses({});
    } finally {
      setLoading(false);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchConsumers();
    }
  }, [isLoggedIn, fetchConsumers]);

  // Inspect live status by consumer code
  const inspectConsumer = async (c: any) => {
    const code = c.code || c.id;
    if (!code || !activeToken) return;

    setSelectedConsumer(c);
    setModalTab("metrics");
    setLoadingStatus(true);
    setConsumerStatusData(null);

    try {
      const res = await ApiClient.getGrpcConsumerStatus(activeEnv, activeToken, activeTenantId, code);
      setConsumerStatusData({ status: res.status, log: res.log || "" });
    } catch (err: any) {
      setConsumerStatusData({
        status: null,
        log: String(err?.message || err || "Chyba při komunikaci s Message Gateway."),
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  // Inspect manual custom code
  const inspectManualCode = () => {
    if (!manualCode.trim()) return;
    inspectConsumer({ code: manualCode.trim(), id: manualCode.trim() });
  };

  // Filtered consumers list
  const filteredConsumers = useMemo(() => {
    const q = search.toLowerCase().trim();

    return consumers.filter((c: any) => {
      const isConnected = Boolean(
        c.connected ||
        c.isConnected ||
        c.status === "Healthy" ||
        (allStatuses[c.code]?.connected ?? false)
      );

      // Status filter
      if (statusFilter === "connected" && !isConnected) return false;
      if (statusFilter === "disconnected" && isConnected) return false;

      // Text search
      if (!q) return true;
      return (
        String(c.code || "").toLowerCase().includes(q) ||
        String(c.id || "").toLowerCase().includes(q) ||
        String(c.clientId || "").toLowerCase().includes(q)
      );
    });
  }, [consumers, allStatuses, search, statusFilter]);

  // KPIs
  const stats = useMemo(() => {
    let connected = 0;
    let disconnected = 0;

    for (const c of consumers) {
      const isConn = Boolean(
        c.connected ||
        c.isConnected ||
        c.status === "Healthy" ||
        (allStatuses[c.code]?.connected ?? false)
      );
      if (isConn) connected++;
      else disconnected++;
    }

    return {
      total: consumers.length,
      connected,
      disconnected,
    };
  }, [consumers, allStatuses]);

  return (
    <div className="space-y-4">
      {/* --- TOP BAR: FILTRY & STRÁNKOVÁNÍ --- */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Registrované gRPC Consumery (Message Gateway)
            </span>
            <Badge variant="info">{filteredConsumers.length} z {consumers.length}</Badge>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter Pill buttons */}
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "all"
                    ? "bg-teal-500 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Všechny ({consumers.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("connected")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "connected"
                    ? "bg-emerald-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                🟢 Připojeno ({stats.connected})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("disconnected")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "disconnected"
                    ? "bg-rose-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                🔴 Odpojeno ({stats.disconnected})
              </button>
            </div>

            {/* Fulltext Search input */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrovat kód, ID, client ID..."
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

            {/* Manual Code Entry Toggle */}
            <Button
              variant={showManualInput ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowManualInput(!showManualInput)}
              className="h-8 text-xs gap-1"
              title="Ruční zadání kódu consumera"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Ruční zadání</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchConsumers}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit stav</span>
            </Button>
          </div>
        </div>

        {/* Collapsible Manual Code Input */}
        {showManualInput && (
          <div className="p-3 bg-teal-50/40 dark:bg-teal-950/20 border-b border-teal-100 dark:border-teal-900/30 flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
              Test libovolného kódu consumera:
            </span>
            <div className="relative flex-grow max-w-md">
              <Input
                placeholder="Zadejte kód consumera (např. PURTEX_s_r-f66c1e8d-...)..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-slate-900 font-mono"
                onKeyDown={(e) => e.key === "Enter" && inspectManualCode()}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={inspectManualCode}
              disabled={!manualCode.trim() || loadingStatus}
              className="h-8 text-xs gap-1"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Načíst stav ze serveru</span>
            </Button>
          </div>
        )}

        {/* KPI Strip */}
        <div className="px-3 py-2 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Souhrn:</span>
          <Badge variant="neutral">{stats.total} celkem</Badge>
          <Badge variant="success">🟢 {stats.connected} připojeno (online)</Badge>
          <Badge variant="error">🔴 {stats.disconnected} odpojeno (offline)</Badge>
          <span className="text-slate-400 text-[11px] ml-auto">
            Data z Message Gateway: <code>/api/v1/Consumer/gRPC/code/&#123;code&#125;/status</code>
          </span>
        </div>

        {/* --- TABLE OF CONSUMERS --- */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-2.5 px-3 w-32">Stav konektivity</th>
                <th className="py-2.5 px-3">Kód Consumera (code)</th>
                <th className="py-2.5 px-3">Consumer ID</th>
                <th className="py-2.5 px-3">Client ID</th>
                <th className="py-2.5 px-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredConsumers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám gRPC consumery..." : "Nebyly nalezeny žádné záznamy odpovídající zadaným filtrům."}
                  </td>
                </tr>
              ) : (
                filteredConsumers.map((c: any, idx: number) => {
                  const isConnected = Boolean(
                    c.connected ||
                    c.isConnected ||
                    c.status === "Healthy" ||
                    (allStatuses[c.code]?.connected ?? false)
                  );
                  const code = c.code || c.id || `grpc-${idx}`;

                  return (
                    <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3">
                        {isConnected ? (
                          <Badge variant="success" className="gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Připojen</span>
                          </Badge>
                        ) : (
                          <Badge variant="error" className="gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            <span>Odpojen</span>
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold font-mono text-slate-800 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>{c.code || "-"}</span>
                          {c.code && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(c.code)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Kopírovat kód"
                            >
                              {copiedText === c.code ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span>{c.id || "-"}</span>
                          {c.id && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(c.id)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Kopírovat ID"
                            >
                              {copiedText === c.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                        {c.clientId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50"
                          onClick={() => inspectConsumer(c)}
                        >
                          <Activity className="w-3 h-3 text-teal-600" />
                          <span>Zobrazit stav & metriky</span>
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

      {/* --- CONSUMER DETAILED STATUS MODAL --- */}
      {selectedConsumer && (
        <Dialog open={Boolean(selectedConsumer)} onOpenChange={(o) => !o && setSelectedConsumer(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-600" />
                <span>Stav a diagnostika gRPC Consumera</span>
              </DialogTitle>
              <DialogDescription className="font-mono text-[11px] break-all">
                Kód: <b>{selectedConsumer.code || selectedConsumer.id}</b>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {loadingStatus ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  <span>Dotazuji Message Gateway na aktuální stav...</span>
                </div>
              ) : consumerStatusData?.status ? (
                <>
                  {/* KPI Metrics Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Konektivita</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {consumerStatusData.status.connected || consumerStatusData.status.isConnected ? "🟢 Připojen" : "🔴 Odpojen"}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Health Status</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {consumerStatusData.status.status || consumerStatusData.status.health || "Healthy"}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Ve frontě (Ready)</span>
                      <span className="font-bold text-amber-600 text-base">
                        {consumerStatusData.status.readyMessages ?? consumerStatusData.status.totalMessages ?? "-"}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Nedoručené</span>
                      <span className="font-bold text-rose-600 text-base">
                        {consumerStatusData.status.unacknowledgedMessages ?? "-"}
                      </span>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setModalTab("metrics")}
                      className={`pb-2 px-3 border-b-2 transition-colors ${
                        modalTab === "metrics"
                          ? "border-teal-500 text-teal-600 dark:text-teal-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      📊 Přehledová tabulka
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab("log")}
                      className={`pb-2 px-3 border-b-2 transition-colors ${
                        modalTab === "log"
                          ? "border-teal-500 text-teal-600 dark:text-teal-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      🔍 Diagnostický log
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab("json")}
                      className={`pb-2 px-3 border-b-2 transition-colors ${
                        modalTab === "json"
                          ? "border-teal-500 text-teal-600 dark:text-teal-400"
                          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      📦 Surový JSON
                    </button>
                  </div>

                  {modalTab === "metrics" && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <tr>
                            <th className="py-2 px-3 w-1/3">Vlastnost / Metrika</th>
                            <th className="py-2 px-3">Hodnota</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {Object.entries(consumerStatusData.status).map(([k, v]) => (
                            <tr key={k}>
                              <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">{k}</td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                                {typeof v === "object" ? JSON.stringify(v) : String(v ?? "-")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {modalTab === "log" && (
                    <div className="p-3 bg-slate-950 text-cyan-300 font-mono text-xs rounded-lg max-h-72 overflow-auto whitespace-pre-wrap">
                      {consumerStatusData.log || "Žádné doplňující diagnostické logy ze serveru."}
                    </div>
                  )}

                  {modalTab === "json" && (
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => copyToClipboard(JSON.stringify(consumerStatusData.status, null, 2))}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Kopírovat JSON</span>
                        </Button>
                      </div>
                      <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg max-h-72 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(consumerStatusData.status, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-lg text-xs text-rose-800 dark:text-rose-200 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    <span>Získání stavu consumera selhalo nebo consumer nebyl v Message Gateway nalezen</span>
                  </div>
                  <pre className="p-2.5 bg-slate-950 text-rose-300 font-mono text-xs rounded overflow-auto whitespace-pre-wrap">
                    {consumerStatusData?.log || "Server vrátil chybu."}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
