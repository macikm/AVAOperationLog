import React, { useState, useEffect } from "react";
import { Search, RefreshCw, Eye, Copy, Database, Layers, ExternalLink, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { formatDateTime } from "../../lib/utils";

interface TabOutputQueueProps {
  initialFilters?: {
    operation_id?: string;
    result_id?: string;
    model_id?: string;
    client_id?: string;
    consumer_source_id?: string;
    publisher_source_id?: string;
    timestamp?: number;
  };
}

export const TabOutputQueue: React.FC<TabOutputQueueProps> = ({ initialFilters }) => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  // Filters
  const [version, setVersion] = useState("v2");
  const [modelId, setModelId] = useState(initialFilters?.model_id || "");
  const [clientId, setClientId] = useState(initialFilters?.client_id || "");
  const [consumerSourceId, setConsumerSourceId] = useState(initialFilters?.consumer_source_id || "");
  const [publisherSourceId, setPublisherSourceId] = useState(initialFilters?.publisher_source_id || "");
  const [resultId, setResultId] = useState(initialFilters?.result_id || "");
  const [operationId, setOperationId] = useState(initialFilters?.operation_id || "");
  const [mandantCode, setMandantCode] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(true);

  // Full Record Payload inspection
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [inspectedPayload, setInspectedPayload] = useState<{ record: any; fullPayload?: any } | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  const fetchQueueWithParams = async (
    currentOffset = 0,
    overrideParams?: Partial<{
      version: string;
      model_id: string;
      client_id: string;
      consumer_source_id: string;
      publisher_source_id: string;
      result_id: string;
      operation_id: string;
      mandant_code: string;
      include_deleted: boolean;
    }>
  ) => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);

    const qVersion = overrideParams?.version ?? version;
    const qModelId = overrideParams?.model_id ?? modelId;
    const qClientId = overrideParams?.client_id ?? clientId;
    const qConsumerSourceId = overrideParams?.consumer_source_id ?? consumerSourceId;
    const qPublisherSourceId = overrideParams?.publisher_source_id ?? publisherSourceId;
    const qResultId = overrideParams?.result_id ?? resultId;
    const qOperationId = overrideParams?.operation_id ?? operationId;
    const qMandantCode = overrideParams?.mandant_code ?? mandantCode;
    const qIncludeDeleted = overrideParams?.include_deleted ?? includeDeleted;

    try {
      const res = await ApiClient.getOutputQueue(activeEnv, activeToken, activeTenantId, {
        limit,
        offset: currentOffset,
        version: qVersion,
        model_id: qModelId,
        client_id: qClientId,
        consumer_source_id: qConsumerSourceId,
        publisher_source_id: qPublisherSourceId,
        result_id: qResultId,
        operation_id: qOperationId,
        mandant_code: qMandantCode,
        include_deleted: qIncludeDeleted,
      });

      setItems(res.items || []);
      setTotalCount(res.totalCount || 0);
      setOffset(currentOffset);

      if (res.resolved_model_id && !qModelId) {
        setModelId(res.resolved_model_id);
      }
      if (res.resolved_result_id && !qResultId) {
        setResultId(res.resolved_result_id);
      }
    } catch (err) {
      console.error(err);
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async (currentOffset = offset) => {
    await fetchQueueWithParams(currentOffset);
  };

  // When initialFilters change from parent jump
  useEffect(() => {
    if (
      !initialFilters ||
      (!initialFilters.operation_id &&
        !initialFilters.result_id &&
        !initialFilters.model_id &&
        !initialFilters.client_id)
    ) {
      return;
    }

    const newOpId = initialFilters.operation_id ?? "";
    const newResId = initialFilters.result_id ?? "";
    const newModelId = initialFilters.model_id ?? "";
    const newClientId = initialFilters.client_id ?? "";
    const newConsumerSourceId = initialFilters.consumer_source_id ?? "";
    const newPublisherSourceId = initialFilters.publisher_source_id ?? "";

    setOperationId(newOpId);
    setResultId(newResId);
    setModelId(newModelId);
    setClientId(newClientId);
    setConsumerSourceId(newConsumerSourceId);
    setPublisherSourceId(newPublisherSourceId);

    // Immediately trigger search with newly received filters
    fetchQueueWithParams(0, {
      version,
      model_id: newModelId,
      client_id: newClientId,
      consumer_source_id: newConsumerSourceId,
      publisher_source_id: newPublisherSourceId,
      result_id: newResId,
      operation_id: newOpId,
      mandant_code: mandantCode,
      include_deleted: includeDeleted,
    });
  }, [initialFilters]);

  useEffect(() => {
    if (isLoggedIn) {
      if (!initialFilters?.operation_id && !initialFilters?.result_id && !initialFilters?.model_id) {
        fetchQueueWithParams(0);
      }
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const fetchFullPayload = async (item: any) => {
    setPayloadLoading(true);
    setInspectedPayload({ record: item, fullPayload: null });
    try {
      const res = await ApiClient.getRecordPayload(activeEnv, activeToken!, activeTenantId, {
        model_id: item.modelId || modelId,
        record_id: item.recordId || item.id,
        result_id: item.resultId || resultId,
        item_id: item.itemId || item.id,
        external_id: item.externalId,
        mandant_code: item.mandantCode || mandantCode,
      });
      setInspectedPayload({ record: item, fullPayload: res.payload || item });
    } catch (err) {
      console.error("Payload fetch error, falling back to item body", err);
      setInspectedPayload({ record: item, fullPayload: item });
    } finally {
      setPayloadLoading(false);
    }
  };

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
            <span className="text-base">📤</span>
            <span>Výstupní fronta (QueryingData) - Publikované datové zprávy</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => fetchQueue(0)}
            disabled={loading}
            className="gap-1 h-8 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Načíst výstupní data</span>
          </Button>
        </div>

        {/* Filter inputs */}
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs bg-white dark:bg-slate-900">
          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">API Verze:</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
            >
              <option value="v2">v2 (GetData - moderní)</option>
              <option value="v1">v1 (FindDataByModelId - legacy)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Data Model ID:</label>
            <Input
              placeholder="UUID datového modelu..."
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Result ID / Balíček:</label>
            <Input
              placeholder="UUID výsledku..."
              value={resultId}
              onChange={(e) => setResultId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Operation ID:</label>
            <Input
              placeholder="Filtrovat podle operace..."
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Client ID / Kód:</label>
            <Input
              placeholder="Client ID agenta..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Consumer ID:</label>
            <Input
              placeholder="Source ID consumera..."
              value={consumerSourceId}
              onChange={(e) => setConsumerSourceId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Publisher Source ID:</label>
            <Input
              placeholder="Source ID publishera..."
              value={publisherSourceId}
              onChange={(e) => setPublisherSourceId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              id="oq_inc_del"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="oq_inc_del" className="font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Včetně smazaných (IncludeDeleted)
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Item / Record ID</th>
                <th className="py-2.5 px-3">Result ID</th>
                <th className="py-2.5 px-3">Model ID</th>
                <th className="py-2.5 px-3">Mandant</th>
                <th className="py-2.5 px-3">Změněno (Modified)</th>
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3 text-right">Datové tělo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám výstupní data..." : "Žádné položky nenalezeny pro zadané filtry."}
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const itemId = item.id || item.recordId || item.itemId || `row-${idx}`;
                  const isDeleted = item.isDeleted || item.deleted;

                  return (
                    <tr key={itemId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {item.recordId || item.id || item.externalId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400">
                        {item.resultId || resultId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.modelId || modelId || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{item.mandantCode || "Všechny"}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.utcModifiedOn || item.modifiedOn || item.utcCreatedOn)}
                      </td>
                      <td className="py-2.5 px-3">
                        {isDeleted ? (
                          <Badge variant="error">Smazáno</Badge>
                        ) : (
                          <Badge variant="success">Platné</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => fetchFullPayload(item)}
                        >
                          <Database className="w-3 h-3 text-teal-600" />
                          <span>Zobrazit payload</span>
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

      {/* Full Record Payload Modal */}
      {inspectedPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-teal-600" />
                <span>
                  Kompletní datový model: {inspectedPayload.record?.recordId || inspectedPayload.record?.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(JSON.stringify(inspectedPayload.fullPayload || inspectedPayload.record, null, 2))}
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedText ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setInspectedPayload(null)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs bg-slate-950 text-cyan-300 rounded-b-xl flex-grow">
              {payloadLoading ? (
                <div className="py-12 text-center text-slate-400">Načítám kompletní atributy a vnořené entity...</div>
              ) : (
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(inspectedPayload.fullPayload || inspectedPayload.record, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
