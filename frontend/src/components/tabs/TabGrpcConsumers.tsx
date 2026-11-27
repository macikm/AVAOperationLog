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
  HelpCircle,
  Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

type ConnectionStatus = "connected" | "disconnected" | "unverified";

export const TabGrpcConsumers: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [consumers, setConsumers] = useState<any[]>([]);
  const [allStatuses, setAllStatuses] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ConnectionStatus>("all");

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

  // Background batch verification
  const [isVerifyingBatch, setIsVerifyingBatch] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<{ current: number; total: number } | null>(null);

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

  const verifyAllInBackground = async () => {
    if (!activeToken || !isLoggedIn || isVerifyingBatch) return;

    // Seznam všech kódů consumerů
    const codesToCheck = consumers
      .map((c) => c.code || c.id)
      .filter((c): c is string => Boolean(c && typeof c === "string" && c.trim()));

    if (codesToCheck.length === 0) return;

    setIsVerifyingBatch(true);
    setVerifyProgress({ current: 0, total: codesToCheck.length });

    // Dávkování po 25 kusech pro rychlé a plynulé aktualizace stavů v UI
    const batchSize = 25;
    for (let i = 0; i < codesToCheck.length; i += batchSize) {
      const chunk = codesToCheck.slice(i, i + batchSize);
      try {
        const res = await ApiClient.verifyGrpcConsumersBatch(
          activeEnv,
          activeToken,
          activeTenantId,
          chunk
        );
        if (res.statuses) {
          setAllStatuses((prev) => ({
            ...prev,
            ...res.statuses,
          }));
        }
      } catch (err) {
        console.error("Chyba při hromadném ověřování:", err);
      }
      setVerifyProgress({
        current: Math.min(i + batchSize, codesToCheck.length),
        total: codesToCheck.length,
      });
    }

    setIsVerifyingBatch(false);
    setTimeout(() => setVerifyProgress(null), 3000);
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchConsumers();
    }
  }, [isLoggedIn, fetchConsumers]);

  // Helper to determine accurate connectivity status
  const getConsumerStatus = useCallback(
    (c: any): ConnectionStatus => {
      const code = c.code || "";
      const id = c.id || "";
      const stat = allStatuses[code] || allStatuses[id];

      if (stat) {
        if (
          stat.connected === true ||
          stat.isConnected === true ||
          stat.status === "Healthy" ||
          stat.healthy === true
        ) {
          return "connected";
        }
        if (
          stat.connected === false ||
          stat.isConnected === false ||
          stat.status === "Degraded" ||
          stat.status === "Unhealthy" ||
          stat.healthy === false
        ) {
          return "disconnected";
        }
      }

      if (c.connected === true || c.isConnected === true || c.status === "Healthy" || c.healthy === true) {
        return "connected";
      }
      if (c.connected === false || c.isConnected === false || c.status === "Degraded" || c.status === "Unhealthy") {
        return "disconnected";
      }

      return "unverified";
    },
    [allStatuses]
  );

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

      // Update live status map so the row in table updates dynamically
      if (res.status) {
        setAllStatuses((prev) => ({
          ...prev,
          [code]: res.status,
          ...(c.id ? { [c.id]: res.status } : {}),
        }));
      }
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
      const status = getConsumerStatus(c);

      // Status filter
      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      // Text search
      if (!q) return true;
      return (
        String(c.code || "").toLowerCase().includes(q) ||
        String(c.id || "").toLowerCase().includes(q) ||
        String(c.clientId || "").toLowerCase().includes(q)
      );
    });
  }, [consumers, getConsumerStatus, search, statusFilter]);

  // KPIs
  const stats = useMemo(() => {
    let connected = 0;
    let disconnected = 0;
    let unverified = 0;

    for (const c of consumers) {
      const status = getConsumerStatus(c);
      if (status === "connected") connected++;
      else if (status === "disconnected") disconnected++;
      else unverified++;
    }

    return {
      total: consumers.length,
      connected,
      disconnected,
      unverified,
    };
  }, [consumers, getConsumerStatus]);

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
              <button
                type="button"
                onClick={() => setStatusFilter("unverified")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "unverified"
                    ? "bg-slate-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                ⚪ Neověřeno ({stats.unverified})
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

            {/* Batch Background Verification Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={verifyAllInBackground}
              disabled={isVerifyingBatch || loading}
              className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Ověří stavy gRPC konzumentů na pozadí přes Message Gateway"
            >
              {isVerifyingBatch ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>
                {isVerifyingBatch
                  ? `Ověřuji (${verifyProgress?.current}/${verifyProgress?.total})...`
                  : `Ověřit vše na pozadí (${stats.unverified})`}
              </span>
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

        {/* Live Progress Bar for Background Batch Check */}
        {verifyProgress && (
          <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
              <span className="font-medium">
                Probíhá hromadné ověřování konektivity gRPC konzumentů na pozadí:
              </span>
              <span className="font-bold">
                {verifyProgress.current} z {verifyProgress.total} hotovo
              </span>
            </div>
            <div className="w-36 bg-emerald-200 dark:bg-emerald-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all duration-300"
                style={{ width: `${(verifyProgress.current / verifyProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

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
          <Badge variant="neutral">⚪ {stats.unverified} neověřeno</Badge>
          <span className="text-slate-400 text-[11px] ml-auto">
            Data z Message Gateway: <code>/api/v1/Consumer/gRPC/code/&#123;code&#125;/status</code>
          </span>
        </div>

        {/* --- TABLE OF CONSUMERS --- */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-2.5 px-3 w-36">Stav konektivity</th>
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
                  const status = getConsumerStatus(c);
                  const code = c.code || c.id || `grpc-${idx}`;

                  return (
                    <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-3">
                        {status === "connected" ? (
                          <Badge variant="success" className="gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Připojen</span>
                          </Badge>
                        ) : status === "disconnected" ? (
                          <Badge variant="error" className="gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            <span>Odpojen</span>
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="gap-1.5 text-slate-500" title="Konektivita nebyla hromadným dotazem ověřena. Klikněte na 'Zobrazit stav & metriky'.">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            <span>Neověřeno</span>
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

      {/* --- DETAIL / INSPECTION MODAL --- */}
      {selectedConsumer && (
        <Dialog open={Boolean(selectedConsumer)} onOpenChange={(open) => !open && setSelectedConsumer(null)}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-teal-600" />
                  <div>
                    <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Live stav a metriky gRPC consumera
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500 font-mono">
                      {selectedConsumer.code || selectedConsumer.id}
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {consumerStatusData?.status && (
                    consumerStatusData.status.connected ||
                    consumerStatusData.status.isConnected ||
                    consumerStatusData.status.status === "Healthy" ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Online</span>
                      </Badge>
                    ) : (
                      <Badge variant="error" className="gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Offline</span>
                      </Badge>
                    )
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inspectConsumer(selectedConsumer)}
                    disabled={loadingStatus}
                    className="h-7 text-xs gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingStatus ? "animate-spin" : ""}`} />
                    <span>Obnovit</span>
                  </Button>
                </div>
              </div>

              {/* Modal Tabs */}
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setModalTab("metrics")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                    modalTab === "metrics"
                      ? "bg-teal-500 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Stav & Metriky</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("log")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                    modalTab === "log"
                      ? "bg-teal-500 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Protokol zprávy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("json")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                    modalTab === "json"
                      ? "bg-teal-500 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Surový JSON</span>
                </button>
              </div>
            </DialogHeader>

            <div className="p-4 flex-grow overflow-y-auto max-h-[60vh] text-xs">
              {loadingStatus ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                  <span>Dotazuji Message Gateway na stav consumera...</span>
                </div>
              ) : modalTab === "metrics" ? (
                <div className="space-y-4">
                  {/* Grid attributes */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Kód consumera</div>
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200 break-all">
                        {selectedConsumer.code || "-"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Client ID</div>
                      <div className="font-mono text-teal-600 dark:text-teal-400 break-all">
                        {selectedConsumer.clientId || "-"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Stav konektivity</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {consumerStatusData?.status?.status ||
                          (consumerStatusData?.status?.connected ? "Healthy (Připojen)" : "Odpojen")}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Consumer ID</div>
                      <div className="font-mono text-slate-600 dark:text-slate-400 break-all">
                        {selectedConsumer.id || "-"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Odeslané / Přijaté zprávy</div>
                      <div className="font-mono text-slate-800 dark:text-slate-200">
                        {consumerStatusData?.status?.messagesProcessed ?? consumerStatusData?.status?.messageCount ?? "-"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Poslední aktivita</div>
                      <div className="text-slate-800 dark:text-slate-200">
                        {consumerStatusData?.status?.lastActivity || consumerStatusData?.status?.lastSeen || "-"}
                      </div>
                    </div>
                  </div>

                  {/* Additional info or errors */}
                  {consumerStatusData?.status?.error && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-300">
                      <div className="font-bold flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" />
                        <span>Hlášení chyby ze serveru:</span>
                      </div>
                      <p className="mt-1 font-mono text-[11px]">{consumerStatusData.status.error}</p>
                    </div>
                  )}

                  {/* Summary tip */}
                  <div className="p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 rounded-lg text-teal-800 dark:text-teal-300 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Informace o gRPC kanálu:</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        gRPC spojení je drženo oboustranným streamem mezi on-premise agentem a Message Gateway. V případě offline stavu ověřte, zda proces agenta na hostitelském serveru běží a má povolen odchozí port na Message Gateway.
                      </p>
                    </div>
                  </div>
                </div>
              ) : modalTab === "log" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Protokol komunikace z Message Gateway:
                    </span>
                    {consumerStatusData?.log && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(consumerStatusData.log)}
                        className="h-6 text-[10px] gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Kopírovat protokol</span>
                      </Button>
                    )}
                  </div>
                  <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[45vh]">
                    {consumerStatusData?.log || "Žádný doplňující protokol není k dispozici."}
                  </pre>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      JSON odpověď ze serveru:
                    </span>
                    {consumerStatusData?.status && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(consumerStatusData.status, null, 2))}
                        className="h-6 text-[10px] gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Kopírovat JSON</span>
                      </Button>
                    )}
                  </div>
                  <pre className="p-3 bg-slate-950 text-cyan-300 font-mono text-[11px] rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[45vh]">
                    {JSON.stringify(consumerStatusData?.status || selectedConsumer, null, 2)}
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
