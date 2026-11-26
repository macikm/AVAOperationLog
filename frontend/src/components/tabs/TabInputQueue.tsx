import React, { useState, useEffect } from "react";
import { Search, Filter, RefreshCw, Eye, Copy, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { formatDateTime } from "../../lib/utils";

export const TabInputQueue: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  // Filters
  const [version, setVersion] = useState("v2");
  const [sourceId, setSourceId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [clientId, setClientId] = useState("");
  const [operationId, setOperationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("Všechny");

  // Selected item payload modal
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  const fetchQueue = async (currentOffset = offset) => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getInputQueue(activeEnv, activeToken, activeTenantId, {
        limit,
        offset: currentOffset,
        version,
        source_id: sourceId,
        agent_id: agentId,
        client_id: clientId,
        operation_id: operationId,
        status: statusFilter,
      });
      setItems(res.items || []);
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
      fetchQueue(0);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <span className="text-base">📥</span>
            <span>Vstupní fronta (SourcingData) - Příchozí datové balíčky</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => fetchQueue(0)}
            disabled={loading}
            className="gap-1 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Načíst frontu</span>
          </Button>
        </div>

        {/* Filter inputs */}
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs bg-white dark:bg-slate-900">
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Verze endpointu:</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
            >
              <option value="v2">v2 (EnqueueData)</option>
              <option value="v1">v1 (EnqueueDataBySourceId)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">
              Source ID {version === "v1" && <span className="text-rose-500">*</span>}:
            </label>
            <Input
              placeholder={version === "v1" ? "Povinné pro v1..." : "Volitelné..."}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Agent ID:</label>
            <Input
              placeholder="Filtrovat agenta..."
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Client ID:</label>
            <Input
              placeholder="Filtrovat klienta..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Operation ID:</label>
            <Input
              placeholder="Filtrovat operaci..."
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Stav balíčku:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
            >
              <option value="Všechny">Všechny stavy</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
              <option value="Pending">Pending</option>
              <option value="Canceled">Canceled</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3">ID Balíčku / Záznamu</th>
                <th className="py-2.5 px-3">Source ID</th>
                <th className="py-2.5 px-3">Operation ID</th>
                <th className="py-2.5 px-3">Agent / Client ID</th>
                <th className="py-2.5 px-3">Čas vytvoření</th>
                <th className="py-2.5 px-3">Položky</th>
                <th className="py-2.5 px-3 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám položky vstupní fronty..." : "Žádné položky ve vstupní frontě."}
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const status = item.status || "Pending";
                  let statusBadge = <Badge variant="neutral">{status}</Badge>;
                  if (status === "Success") {
                    statusBadge = <Badge variant="success">Success</Badge>;
                  } else if (status === "Failed") {
                    statusBadge = <Badge variant="error">Failed</Badge>;
                  } else if (status === "Pending") {
                    statusBadge = <Badge variant="warning">Pending</Badge>;
                  }

                  const itemId = item.id || item.batchId || item.queueItemId || `item-${idx}`;

                  return (
                    <tr key={itemId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3">{statusBadge}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {item.id || item.batchId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.sourceId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                        {item.operationId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {item.agentId || item.clientId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.createdOn || item.utcCreatedOn || item.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{item.itemCount || item.recordsCount || (item.items ? item.items.length : 1)}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedPayload(item)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Payload</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div>
            Zobrazeno <b>{items.length}</b> záznamů
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => fetchQueue(Math.max(0, offset - limit))}
              className="h-8 px-2.5 text-xs"
            >
              ◀ Předchozí
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={items.length < limit}
              onClick={() => fetchQueue(offset + limit)}
              className="h-8 px-2.5 text-xs"
            >
              Další ▶
            </Button>
          </div>
        </div>
      </Card>

      {/* Payload Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Payload položky vstupní fronty</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(JSON.stringify(selectedPayload, null, 2))}
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedText ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setSelectedPayload(null)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs bg-slate-950 text-emerald-400 rounded-b-xl flex-grow">
              <pre className="whitespace-pre-wrap">{JSON.stringify(selectedPayload, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
