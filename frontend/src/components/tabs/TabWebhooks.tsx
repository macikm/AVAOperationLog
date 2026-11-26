import React, { useState, useEffect } from "react";
import { RefreshCw, Radio, CheckCircle2, AlertTriangle, XCircle, Eye, ExternalLink, Route } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabWebhooks: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<Record<string, any>>({});
  const [selectedWebhook, setSelectedWebhook] = useState<any | null>(null);

  // Message Types & Routing
  const [showRouting, setShowRouting] = useState(false);
  const [routingData, setRoutingData] = useState<{ message_types?: any[]; routings?: any[] }>({});
  const [loadingRouting, setLoadingRouting] = useState(false);

  const fetchWebhooks = async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getWebhooks(activeEnv, activeToken, activeTenantId);
      setWebhooks(res.items || []);
      setStatuses(res.statuses || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRouting = async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoadingRouting(true);
    try {
      const res = await ApiClient.getWebhookRouting(activeEnv, activeToken, activeTenantId);
      setRoutingData(res);
      setShowRouting(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRouting(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchWebhooks();
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  return (
    <div className="space-y-4">
      {/* Webhooks Card */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Webhook Consumery & Fronty ({webhooks.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRouting}
              disabled={loadingRouting}
              className="gap-1 h-8 text-xs"
            >
              <Route className="w-3.5 h-3.5 text-teal-600" />
              <span>Routování zpráv</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={fetchWebhooks}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit fronty</span>
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3">Kód / ID Consumera</th>
                <th className="py-2.5 px-3">Cílová Webhook URL</th>
                <th className="py-2.5 px-3">Typy zpráv</th>
                <th className="py-2.5 px-3 text-center">Připravené zprávy</th>
                <th className="py-2.5 px-3 text-center">Nepotvrzené (Unacked)</th>
                <th className="py-2.5 px-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {webhooks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    {loading ? "Zjišťuji webhook consumery..." : "V Message Gateway nebyl nalezen žádný registrovaný webhook."}
                  </td>
                </tr>
              ) : (
                webhooks.map((w) => {
                  const key = w.code || w.id;
                  const stat = statuses[key] || statuses[w.id] || {};
                  const isHealthy = stat.connected || stat.status === "Healthy";
                  const isDegraded = stat.status === "Degraded" || stat.status === "Unhealthy";

                  let stBadge = <Badge variant="neutral">Neověřeno</Badge>;
                  if (isHealthy) stBadge = <Badge variant="success">Healthy</Badge>;
                  else if (isDegraded) stBadge = <Badge variant="error">Degraded</Badge>;

                  const msgTypesCount = w.messageTypes?.length || 0;

                  return (
                    <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3">{stBadge}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{w.code || w.id}</div>
                        <div className="font-mono text-[10px] text-slate-400">{w.id}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400 max-w-xs truncate">
                        {w.webhookUrl || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{msgTypesCount} modelů</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {stat.readyMessages !== undefined ? (
                          <span className={stat.readyMessages > 0 ? "text-amber-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                            {stat.readyMessages}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {stat.unacknowledgedMessages !== undefined ? (
                          <span className={stat.unacknowledgedMessages > 0 ? "text-rose-600 font-bold" : "text-slate-600 dark:text-slate-400"}>
                            {stat.unacknowledgedMessages}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedWebhook({ ...w, stat })}
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

      {/* Webhook Detail Modal */}
      {selectedWebhook && (
        <Dialog open={Boolean(selectedWebhook)} onOpenChange={(o) => !o && setSelectedWebhook(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>🔔 Webhook: {selectedWebhook.code || selectedWebhook.id}</span>
              </DialogTitle>
              <DialogDescription>Konfigurace a živý stav fronty</DialogDescription>
            </DialogHeader>

            <div className="py-2 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2 flex justify-between">
                <span className="font-semibold text-slate-500">URL cíl:</span>
                <span className="font-mono text-teal-600 break-all">{selectedWebhook.webhookUrl}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="font-semibold text-slate-500">Consumer ID:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedWebhook.id}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="font-semibold text-slate-500">Odebírané typy zpráv:</span>
                <div className="text-right space-y-1">
                  {selectedWebhook.messageTypes?.map((mt: string) => (
                    <div key={mt} className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {mt}
                    </div>
                  )) || "-"}
                </div>
              </div>
              {selectedWebhook.stat && (
                <div className="py-2">
                  <span className="font-semibold text-slate-500 mb-1 block">Statistiky zpráv:</span>
                  <pre className="p-3 bg-slate-950 text-cyan-400 font-mono text-[11px] rounded-lg">
                    {JSON.stringify(selectedWebhook.stat, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Message Routing Modal */}
      {showRouting && (
        <Dialog open={showRouting} onOpenChange={setShowRouting}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Route className="w-5 h-5 text-teal-600" />
                <span>Směrování zpráv (Message Routing)</span>
              </DialogTitle>
              <DialogDescription>Přehled všech typů zpráv a routování v Message Gateway</DialogDescription>
            </DialogHeader>

            <div className="py-2 max-h-[60vh] overflow-y-auto space-y-3">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <th className="p-2">Typ zprávy (MessageType)</th>
                      <th className="p-2">Cílové consumery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(routingData.message_types || []).map((mt: any, idx: number) => {
                      const name = typeof mt === "string" ? mt : mt.name || mt.id;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-2 font-mono font-medium text-slate-800 dark:text-slate-200">{name}</td>
                          <td className="p-2 font-mono text-slate-500 text-[11px]">-</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
