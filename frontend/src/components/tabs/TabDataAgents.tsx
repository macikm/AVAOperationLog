import React, { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Eye, Bot, Radio, CheckCircle2, XCircle, Activity } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabDataAgents: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);

  // Consumers status
  const [consumers, setConsumers] = useState<{ grpc_consumers?: any[]; all_statuses?: any }>({});
  const [loadingConsumers, setLoadingConsumers] = useState(false);
  const [selectedConsumerStatus, setSelectedConsumerStatus] = useState<any | null>(null);
  const [loadingSingleStatus, setLoadingSingleStatus] = useState(false);

  const fetchAgents = async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getDataAgents(activeEnv, activeToken, activeTenantId, { fetch_all: "true" });
      setAgents(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConsumers = async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoadingConsumers(true);
    try {
      const res = await ApiClient.getAgentConsumers(activeEnv, activeToken, activeTenantId);
      setConsumers(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConsumers(false);
    }
  };

  const inspectConsumerStatus = async (consumer: any) => {
    const code = consumer.code || consumer.id;
    if (!code) return;
    setLoadingSingleStatus(true);
    try {
      const res = await ApiClient.getWebhookStatus(activeEnv, activeToken!, activeTenantId, code);
      setSelectedConsumerStatus({ consumer, status: res.status, log: res.log });
    } catch (err: any) {
      setSelectedConsumerStatus({ consumer, status: null, log: String(err.message || err) });
    } finally {
      setLoadingSingleStatus(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchAgents();
      fetchConsumers();
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const filteredAgents = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.code?.toLowerCase().includes(q) ||
        a.id?.toLowerCase().includes(q) ||
        a.customCode?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
    );
  }, [agents, search]);

  const grpcList = consumers.grpc_consumers || [];

  return (
    <div className="space-y-4">
      {/* 1. SEKCE: SEZNAM DATA AGENTŮ (PLNÁ ŠÍŘKA) */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Seznam Data Agentů (DataAgents)
            </span>
            <Badge variant="info">{filteredAgents.length} z {agents.length}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Hledat kód, CustomCode, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAgents}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Kód Agenta (Code)</th>
                <th className="py-2.5 px-3">Custom Code</th>
                <th className="py-2.5 px-3">Agent ID</th>
                <th className="py-2.5 px-3">Provider Codes</th>
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám Data Agenty..." : "Žádní Data Agenti nenalezeni."}
                  </td>
                </tr>
              ) : (
                filteredAgents.map((ag) => {
                  const isDeleted = ag.isDeleted || ag.deleted;
                  const providers = Array.isArray(ag.providerCodes)
                    ? ag.providerCodes.join(", ")
                    : String(ag.providerCodes || "-");

                  return (
                    <tr key={ag.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {ag.code || ag.id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                        {ag.customCode || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {ag.id}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {providers}
                      </td>
                      <td className="py-2.5 px-3">
                        {isDeleted ? (
                          <Badge variant="error">Smazáno</Badge>
                        ) : (
                          <Badge variant="success">Aktivní</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedAgent(ag)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Detail</span>
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

      {/* 2. SEKCE: PŘEHLED gRPC CONSUMERŮ V JEDNOTNÉ ČISTÉ TABULCE PŘES CELOU ŠÍŘKU */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Registrované gRPC Consumery (Message Gateway)
            </span>
            <Badge variant="info">{grpcList.length} consumerů</Badge>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchConsumers}
            disabled={loadingConsumers}
            className="gap-1 h-7 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${loadingConsumers ? "animate-spin" : ""}`} />
            <span>Obnovit stav</span>
          </Button>
        </div>

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
              {grpcList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    {loadingConsumers ? "Načítám gRPC consumery..." : "V Message Gateway nebyl nalezen žádný gRPC consumer pro aktivního tenanta."}
                  </td>
                </tr>
              ) : (
                grpcList.map((c: any, idx: number) => {
                  const isConnected = c.connected || c.status === "Healthy" || c.isConnected;
                  const code = c.code || c.id || `grpc-${idx}`;

                  return (
                    <tr key={code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3">
                        {isConnected ? (
                          <Badge variant="success" className="gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Připojen</span>
                          </Badge>
                        ) : (
                          <Badge variant="error" className="gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            <span>Odpojen</span>
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold font-mono text-slate-800 dark:text-slate-100">
                        {c.code || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {c.id || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                        {c.clientId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => inspectConsumerStatus(c)}
                          disabled={loadingSingleStatus}
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

      {/* Agent Detail Dialog */}
      {selectedAgent && (
        <Dialog open={Boolean(selectedAgent)} onOpenChange={(o) => !o && setSelectedAgent(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-teal-600" />
                <span>{selectedAgent.code || selectedAgent.id}</span>
              </DialogTitle>
              <DialogDescription>Kompletní parametry Data Agenta</DialogDescription>
            </DialogHeader>

            <div className="py-2 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {Object.entries(selectedAgent).map(([k, v]) => {
                if (typeof v === "object" && v !== null && !Array.isArray(v)) return null;
                return (
                  <div key={k} className="py-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-500">{k}:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {Array.isArray(v) ? v.join(", ") : String(v ?? "-")}
                    </span>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Consumer Detailed Status Dialog */}
      {selectedConsumerStatus && (
        <Dialog open={Boolean(selectedConsumerStatus)} onOpenChange={(o) => !o && setSelectedConsumerStatus(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-teal-600" />
                <span>Stav a diagnostika gRPC Consumera</span>
              </DialogTitle>
              <DialogDescription>
                Kód: <code>{selectedConsumerStatus.consumer?.code || selectedConsumerStatus.consumer?.id}</code>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {selectedConsumerStatus.status ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Konektivita</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {selectedConsumerStatus.status.connected ? "🟢 Připojen" : "🔴 Odpojen"}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Health Status</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {selectedConsumerStatus.status.status || "Healthy"}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ve frontě (Ready)</span>
                      <span className="font-bold text-amber-600 text-sm">
                        {selectedConsumerStatus.status.readyMessages ?? "-"}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Unacknowledged</span>
                      <span className="font-bold text-rose-600 text-sm">
                        {selectedConsumerStatus.status.unacknowledgedMessages ?? "-"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 text-cyan-300 font-mono text-xs rounded-lg overflow-y-auto max-h-60">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(selectedConsumerStatus.status, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-900 text-rose-300 font-mono text-xs rounded-lg whitespace-pre-wrap">
                  {selectedConsumerStatus.log || "Žádné informace o stavu nebyly vráceny."}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
