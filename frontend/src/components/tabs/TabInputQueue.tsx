import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Eye,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ExternalLink,
  Download,
  X,
  Database,
  Layers,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { formatDateTime } from "../../lib/utils";

interface TabInputQueueProps {
  initialFilters?: { operation_id?: string; source_id?: string; version?: string };
  onNavigateToOutputQueue?: (filters: {
    operation_id?: string;
    result_id?: string;
    model_id?: string;
    client_id?: string;
    consumer_source_id?: string;
    publisher_source_id?: string;
  }) => void;
  onNavigateToLogs?: (operationId: string) => void;
}

export const TabInputQueue: React.FC<TabInputQueueProps> = ({
  initialFilters,
  onNavigateToOutputQueue,
  onNavigateToLogs,
}) => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  // Filters
  const [version, setVersion] = useState(initialFilters?.version || "v2");
  const [sourceId, setSourceId] = useState(initialFilters?.source_id || "");
  const [agentId, setAgentId] = useState("");
  const [clientId, setClientId] = useState("");
  const [operationId, setOperationId] = useState(initialFilters?.operation_id || "");
  const [statusFilter, setStatusFilter] = useState("Všechny");

  // Selection
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"attributes" | "json">("attributes");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const fetchQueue = async (
    currentOffset = offset,
    overrides?: { version?: string; source_id?: string; operation_id?: string }
  ) => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const v = overrides?.version ?? version;
      const sId = overrides?.source_id ?? sourceId;
      const opId = overrides?.operation_id ?? operationId;

      const res = await ApiClient.getInputQueue(activeEnv, activeToken, activeTenantId, {
        limit,
        offset: currentOffset,
        version: v,
        source_id: sId,
        agent_id: agentId,
        client_id: clientId,
        operation_id: opId,
        status: statusFilter !== "Všechny" ? statusFilter : undefined,
      });

      const newItems = res.items || [];
      setItems(newItems);
      setTotalCount(res.totalCount || 0);
      setOffset(currentOffset);
    } catch (err) {
      console.error(err);
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFilters) {
      const v = initialFilters.version || version;
      const s = initialFilters.source_id ?? sourceId;
      const op = initialFilters.operation_id ?? operationId;
      if (initialFilters.version) setVersion(initialFilters.version);
      if (initialFilters.source_id !== undefined) setSourceId(initialFilters.source_id);
      if (initialFilters.operation_id !== undefined) setOperationId(initialFilters.operation_id);

      if (isLoggedIn) {
        fetchQueue(0, { version: v, source_id: s, operation_id: op });
      }
    }
  }, [initialFilters]);

  useEffect(() => {
    if (isLoggedIn && !initialFilters) {
      fetchQueue(0);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  // Client-side filtering as fallback if API ignores filter params
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (operationId && operationId.trim()) {
        const itemOpId = String(item.operationId || item.operation_id || "").toLowerCase();
        if (!itemOpId.includes(operationId.trim().toLowerCase())) return false;
      }
      if (statusFilter && statusFilter !== "Všechny") {
        const itemStatus = String(item.status || "").toLowerCase();
        if (itemStatus !== statusFilter.toLowerCase()) return false;
      }
      if (clientId && clientId.trim()) {
        const itemClientId = String(item.clientId || item.client_id || "").toLowerCase();
        if (!itemClientId.includes(clientId.trim().toLowerCase())) return false;
      }
      if (agentId && agentId.trim()) {
        const itemAgentId = String(item.agentId || item.agent_id || "").toLowerCase();
        if (!itemAgentId.includes(agentId.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [items, operationId, statusFilter, clientId, agentId]);

  // Auto-select matching item when items or filters change
  useEffect(() => {
    if (filteredItems.length > 0) {
      const isCurrentSelectedStillInList =
        selectedItem && filteredItems.some((it, idx) => getItemId(it, idx) === getItemId(selectedItem, -1));
      if (!isCurrentSelectedStillInList) {
        setSelectedItem(filteredItems[0]);
      }
    } else {
      setSelectedItem(null);
    }
  }, [filteredItems]);

  const handleSelectItem = (item: any) => {
    setSelectedItem(item);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const downloadJson = (data: any, filename: string) => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getItemId = (item: any, idx: number) => {
    return item.id || item.batchId || item.queueItemId || `item-${idx}`;
  };

  return (
    <div className="space-y-4">
      {/* 1. FILTERS */}
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
            <span>Načíst data fronty</span>
          </Button>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs bg-white dark:bg-slate-900">
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Endpoint verze:</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
            >
              <option value="v2">v2 (moderní)</option>
              <option value="v1">v1 (legacy)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Source ID:</label>
            <Input
              placeholder="UUID zdroje..."
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Agent ID:</label>
            <Input
              placeholder="ID agenta..."
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Client ID:</label>
            <Input
              placeholder="Client ID..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-600 dark:text-slate-400">Operation ID:</label>
              {operationId && (
                <button
                  type="button"
                  onClick={() => setOperationId("")}
                  className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-0.5"
                  title="Vymazat filtr"
                >
                  <X className="w-3 h-3" /> Vymazat
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                placeholder="Filtrovat operaci..."
                value={operationId}
                onChange={(e) => setOperationId(e.target.value)}
                className="h-8 text-xs font-mono pr-7"
              />
              {operationId && (
                <button
                  type="button"
                  onClick={() => setOperationId("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Vymazat"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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

        {/* Warning if filteredItems is 0 but items > 0 */}
        {filteredItems.length === 0 && items.length > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border-t border-b border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                V načtených {items.length} položkách nebyl nalezen žádný záznam odpovídající zadaným filtrům (např. Operation ID).
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => {
                setOperationId("");
                setStatusFilter("Všechny");
                setClientId("");
                setAgentId("");
              }}
            >
              <X className="w-3 h-3" /> Zrušit filtry
            </Button>
          </div>
        )}

        {/* 2. TABLE */}
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] border-t border-slate-100 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm border-b border-slate-200 dark:border-slate-800">
              <tr className="text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3">ID Balíčku / Záznamu</th>
                <th className="py-2.5 px-3">Source ID</th>
                <th className="py-2.5 px-3">Operation ID</th>
                <th className="py-2.5 px-3">Agent / Client ID</th>
                <th className="py-2.5 px-3">Čas vytvoření</th>
                <th className="py-2.5 px-3">Položky</th>
                <th className="py-2.5 px-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {loading
                      ? "Načítám položky vstupní fronty..."
                      : items.length > 0
                      ? "Žádný záznam neodpovídá zadanému filtru."
                      : "Žádné položky ve vstupní frontě."}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const status = item.status || "Pending";
                  let statusBadge = <Badge variant="neutral">{status}</Badge>;
                  if (status === "Success") {
                    statusBadge = <Badge variant="success">Success</Badge>;
                  } else if (status === "Failed") {
                    statusBadge = <Badge variant="error">Failed</Badge>;
                  } else if (status === "Pending") {
                    statusBadge = <Badge variant="warning">Pending</Badge>;
                  }

                  const itemId = getItemId(item, idx);
                  const isSelected = selectedItem && getItemId(selectedItem, -1) === itemId;

                  return (
                    <tr
                      key={itemId}
                      onClick={() => handleSelectItem(item)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-teal-50/80 dark:bg-teal-950/40 border-l-4 border-teal-600 font-medium"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {item.id || item.batchId || item.queueItemId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 truncate max-w-[150px]">
                        {item.sourceId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400 truncate max-w-[150px]">
                        {item.operationId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                        {item.agentId || item.clientId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.createdOn || item.utcCreatedOn || item.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{item.itemCount || item.recordsCount || (item.items ? item.items.length : 1)}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleSelectItem(item)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>{isSelected ? "Otevřeno" : "Detail"}</span>
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
            Zobrazeno <b>{filteredItems.length}</b> záznamů
            {filteredItems.length !== items.length && (
              <span className="text-slate-400 ml-1">
                (filtrováno z {items.length} načtených z API)
              </span>
            )}
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

      {/* 3. DEDICATED IN-PAGE DETAIL SECTION */}
      {selectedItem && (
        <div ref={detailSectionRef} className="scroll-mt-4">
          <Card className="border border-teal-200 dark:border-teal-900 shadow-md bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base">🔍</span>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Detail položky vstupní fronty:
                  </h3>
                  <Badge variant="neutral" className="font-mono text-xs">
                    {selectedItem.id || selectedItem.batchId || selectedItem.queueItemId}
                  </Badge>
                  {selectedItem.status === "Success" ? (
                    <Badge variant="success">Success</Badge>
                  ) : selectedItem.status === "Failed" ? (
                    <Badge variant="error">Failed</Badge>
                  ) : (
                    <Badge variant="warning">{selectedItem.status || "Pending"}</Badge>
                  )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>Source ID: <b className="font-mono text-slate-700 dark:text-slate-300">{selectedItem.sourceId || "-"}</b></span>
                  <span>•</span>
                  <span>Operation ID: <b className="font-mono text-slate-700 dark:text-slate-300">{selectedItem.operationId || "-"}</b></span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Link to Output Queue */}
                {(selectedItem.queueItemId || selectedItem.id || selectedItem.operationId) && onNavigateToOutputQueue && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onNavigateToOutputQueue({
                        result_id: selectedItem.queueItemId || selectedItem.id,
                        operation_id: selectedItem.operationId,
                      })
                    }
                    className="h-8 text-xs gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    <span>Otevřít ve Výstupní frontě</span>
                  </Button>
                )}

                {/* Link to Logs */}
                {selectedItem.operationId && onNavigateToLogs && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigateToLogs(selectedItem.operationId)}
                    className="h-8 text-xs gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Zobrazit v Provozním logu</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadJson(selectedItem, `input_queue_${selectedItem.id || "item"}.json`)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Stáhnout</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(selectedItem, null, 2), "iq_json")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === "iq_json" ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItem(null)}
                  className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Error banner if failed */}
            {selectedItem.errorMessage && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Chybová zpráva:</div>
                  <div className="font-mono mt-0.5 whitespace-pre-wrap">{selectedItem.errorMessage}</div>
                </div>
              </div>
            )}

            {/* Sub-tabs header */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 flex items-center gap-2">
              <button
                onClick={() => setActiveDetailTab("attributes")}
                className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeDetailTab === "attributes"
                    ? "border-teal-600 text-teal-700 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <span>📋</span>
                <span>Strukturovaný přehled</span>
              </button>

              <button
                onClick={() => setActiveDetailTab("json")}
                className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeDetailTab === "json"
                    ? "border-teal-600 text-teal-700 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <span>📦</span>
                <span>Celý JSON záznamu</span>
              </button>
            </div>

            {/* Tab content: Structured */}
            {activeDetailTab === "attributes" && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {Object.entries(selectedItem).map(([k, v]) => {
                    if (k === "items" || k === "errorMessage") return null;
                    return (
                      <div
                        key={k}
                        className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30"
                      >
                        <div className="text-slate-400 font-medium">{k}</div>
                        <div className="font-mono text-slate-800 dark:text-slate-200 mt-1 break-all">
                          {v !== null && v !== undefined
                            ? typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v)
                            : "null"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab content: JSON */}
            {activeDetailTab === "json" && (
              <div className="p-4 space-y-3">
                <div className="bg-slate-950 text-cyan-300 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[500px] border border-slate-800 shadow-inner">
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(selectedItem, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
