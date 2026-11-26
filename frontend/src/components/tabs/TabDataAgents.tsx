import React, { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Eye, Bot, Activity, CheckCircle2, AlertTriangle, Radio } from "lucide-react";
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

  return (
    <div className="space-y-4">
      {/* gRPC Consumers Status Strip */}
      {consumers.grpc_consumers && consumers.grpc_consumers.length > 0 && (
        <Card className="border-teal-500/20 bg-teal-50/20 dark:bg-teal-950/20 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-teal-600 animate-pulse" />
              <span>Aktivní gRPC Consumery (Message Gateway)</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchConsumers}
              disabled={loadingConsumers}
              className="h-6 text-[10px] gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingConsumers ? "animate-spin" : ""}`} />
              <span>Obnovit stav</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {consumers.grpc_consumers.map((c: any) => {
              const isConnected = c.connected || c.status === "Healthy";
              return (
                <div
                  key={c.code || c.id}
                  className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold truncate text-slate-800 dark:text-slate-100">{c.code || c.id}</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{c.id}</div>
                  </div>
                  <Badge variant={isConnected ? "success" : "warning"}>
                    {isConnected ? "Connected" : "Inactive"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Agents Card */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🤖</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Data Agenti ({filteredAgents.length} z {agents.length})
            </span>
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
    </div>
  );
};
