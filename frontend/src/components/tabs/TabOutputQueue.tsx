import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  RefreshCw,
  Eye,
  Copy,
  Database,
  Layers,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  Filter,
  FileJson,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  ArrowRight,
  Code2,
} from "lucide-react";
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
  onNavigateToLogs?: (operationId: string) => void;
}

export const TabOutputQueue: React.FC<TabOutputQueueProps> = ({
  initialFilters,
  onNavigateToLogs,
}) => {
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

  // Selected Item and Payload cache
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [payloadCache, setPayloadCache] = useState<Record<string, any>>({});
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"attributes" | "json" | "meta">("attributes");

  // Attribute inspector state
  const [attrFilterMode, setAttrFilterMode] = useState<"all" | "filled" | "empty">("all");
  const [attrSearch, setAttrSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  // Copy status
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);

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

      const newItems = res.items || [];
      setItems(newItems);
      setTotalCount(res.totalCount || 0);
      setOffset(currentOffset);

      if (res.resolved_model_id && !qModelId) {
        setModelId(res.resolved_model_id);
      }
      if (res.resolved_result_id && !qResultId) {
        setResultId(res.resolved_result_id);
      }

      // If we have items and none currently selected, keep previous or select first if user jumped from logs
      if (newItems.length > 0) {
        if (qResultId || qOperationId) {
          handleSelectItem(newItems[0]);
        }
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

  // Jump from parent (TabLogs)
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

  const getItemKey = (item: any) => {
    const recId = item.recordId || item.id || (typeof item.Id === "object" ? item.Id?.RecordId : item.Id) || "";
    const extId = item.externalId || item.ExternalId || "";
    const modId = item.modelId || modelId || "";
    return `${recId}_${extId}_${modId}`;
  };

  const handleSelectItem = async (item: any) => {
    setSelectedItem(item);
    const key = getItemKey(item);

    // Smooth scroll into detail section
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    if (payloadCache[key]) {
      return;
    }

    setPayloadLoading(true);
    try {
      const recId = item.recordId || item.id || (typeof item.Id === "object" ? item.Id?.RecordId : item.Id);
      const res = await ApiClient.getRecordPayload(activeEnv, activeToken!, activeTenantId, {
        model_id: item.modelId || modelId,
        record_id: recId,
        result_id: item.resultId || resultId,
        item_id: item.itemId || item.id,
        external_id: item.externalId || item.ExternalId,
        mandant_code: item.mandantCode || mandantCode,
      });

      if (res.payload) {
        setPayloadCache((prev) => ({ ...prev, [key]: res.payload }));
      } else {
        setPayloadCache((prev) => ({ ...prev, [key]: item }));
      }
    } catch (err) {
      console.warn("Could not fetch full payload from DataService, falling back to item row", err);
      setPayloadCache((prev) => ({ ...prev, [key]: item }));
    } finally {
      setPayloadLoading(false);
    }
  };

  const handleReloadPayload = async () => {
    if (!selectedItem) return;
    const key = getItemKey(selectedItem);
    setPayloadCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    await handleSelectItem(selectedItem);
  };

  // Inspect data: full model payload has precedence, fallback to selectedItem
  const activeInspectData = useMemo(() => {
    if (!selectedItem) return null;
    const key = getItemKey(selectedItem);
    return payloadCache[key] || selectedItem;
  }, [selectedItem, payloadCache]);

  const isFullModelLoaded = useMemo(() => {
    if (!selectedItem) return false;
    const key = getItemKey(selectedItem);
    const cached = payloadCache[key];
    return !!cached && cached !== selectedItem;
  }, [selectedItem, payloadCache]);

  // Parse attributes from activeInspectData
  interface ParsedAttribute {
    key: string;
    value: any;
    displayValue: string;
    type: string;
    isFilled: boolean;
    isObject: boolean;
    isArray: boolean;
  }

  const parsedAttributes = useMemo<ParsedAttribute[]>(() => {
    if (!activeInspectData || typeof activeInspectData !== "object") return [];

    const result: ParsedAttribute[] = [];
    for (const [k, v] of Object.entries(activeInspectData)) {
      let isFilled = false;
      let isObject = false;
      let isArray = false;
      let typeStr: string = typeof v;

      if (v !== null && v !== undefined) {
        if (Array.isArray(v)) {
          isArray = true;
          typeStr = "array";
          isFilled = v.length > 0;
        } else if (typeof v === "object") {
          isObject = true;
          typeStr = "object";
          isFilled = Object.keys(v).length > 0;
        } else {
          const sVal = String(v).trim();
          isFilled = sVal !== "" && sVal !== "null" && sVal !== "None" && sVal !== "N/A" && sVal !== "nan";
        }
      } else {
        typeStr = "null";
        isFilled = false;
      }

      let displayValue = "";
      if (v === null || v === undefined) {
        displayValue = "null";
      } else if (isArray) {
        displayValue = `[${(v as any[]).length} položek]`;
      } else if (isObject && typeof v === "object") {
        const objVal = v as Record<string, any>;
        // Special friendly formats for common AVA model structures
        if ("values" in objVal && Array.isArray(objVal.values)) {
          displayValue = objVal.values.map((item: any) => `${item.value} (${item.locale})`).join(", ");
        } else if ("Code" in objVal && "Name" in objVal) {
          displayValue = `${objVal.Code} - ${typeof objVal.Name === "object" ? JSON.stringify(objVal.Name) : objVal.Name}`;
        } else {
          displayValue = `{${Object.keys(objVal).length} vlastností}`;
        }
      } else {
        displayValue = String(v);
      }

      result.push({
        key: k,
        value: v,
        displayValue,
        type: typeStr,
        isFilled,
        isObject,
        isArray,
      });
    }

    return result;
  }, [activeInspectData]);

  // Attribute metrics
  const metrics = useMemo(() => {
    const total = parsedAttributes.length;
    const filled = parsedAttributes.filter((a) => a.isFilled).length;
    const empty = total - filled;
    const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { total, filled, empty, pct };
  }, [parsedAttributes]);

  // Filtered attributes
  const filteredAttributes = useMemo(() => {
    return parsedAttributes.filter((attr) => {
      if (attrFilterMode === "filled" && !attr.isFilled) return false;
      if (attrFilterMode === "empty" && attr.isFilled) return false;

      if (attrSearch.trim()) {
        const q = attrSearch.trim().toLowerCase();
        const matchesKey = attr.key.toLowerCase().includes(q);
        const matchesVal = attr.displayValue.toLowerCase().includes(q) || JSON.stringify(attr.value).toLowerCase().includes(q);
        if (!matchesKey && !matchesVal) return false;
      }

      return true;
    });
  }, [parsedAttributes, attrFilterMode, attrSearch]);

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

  const toggleExpandKey = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4">
      {/* 1. FILTERS TOOLBAR */}
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
              className="h-8 text-xs font-mono"
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
              className="h-8 text-xs font-mono"
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

          <div className="space-y-1">
            <label className="font-semibold text-slate-600 dark:text-slate-400">Mandant Code:</label>
            <Input
              placeholder="např. 64949541|CZ"
              value={mandantCode}
              onChange={(e) => setMandantCode(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 sm:col-span-2">
            <input
              type="checkbox"
              id="oq_inc_del"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="oq_inc_del" className="font-medium text-slate-700 dark:text-slate-300 cursor-pointer text-xs">
              Včetně zpracovaných a smazaných (IncludeDeleted)
            </label>
          </div>
        </div>

        {/* 2. TABLE OF ITEMS */}
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] border-t border-slate-100 dark:border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 shadow-sm border-b border-slate-200 dark:border-slate-800">
              <tr className="text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3">Změněno (Modified)</th>
                <th className="py-2.5 px-3">Item / Record ID</th>
                <th className="py-2.5 px-3">External ID</th>
                <th className="py-2.5 px-3">Model ID</th>
                <th className="py-2.5 px-3">Mandant</th>
                <th className="py-2.5 px-3">Result ID</th>
                <th className="py-2.5 px-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám výstupní data..." : "Žádné položky nenalezeny pro zadané filtry."}
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const itemId = item.id || item.recordId || (typeof item.Id === "object" ? item.Id?.RecordId : item.Id) || `row-${idx}`;
                  const isDeleted = item.isDeleted || item.deleted;
                  const isSelected = selectedItem && getItemKey(selectedItem) === getItemKey(item);

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
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isDeleted ? (
                          <Badge variant="error">🔴 Smazáno</Badge>
                        ) : item.changeType ? (
                          <Badge variant="neutral">{item.changeType}</Badge>
                        ) : (
                          <Badge variant="success">🟢 Platné</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.utcModifiedOn || item.modifiedOn || item.utcCreatedOn)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-800 dark:text-slate-200">
                        {item.recordId || item.id || (typeof item.Id === "object" ? item.Id?.RecordId : item.Id) || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                        {item.externalId || item.ExternalId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 truncate max-w-[150px]">
                        {item.modelId || modelId || "-"}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{item.mandantCode || "Všechny"}</Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-teal-600 dark:text-teal-400 truncate max-w-[150px]">
                        {item.resultId || resultId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant={isSelected ? "primary" : "outline"}
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleSelectItem(item)}
                        >
                          <Database className="w-3 h-3" />
                          <span>{isSelected ? "Otevřeno" : "Detail & atributy"}</span>
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
                    Detail vybraného záznamu & obsah datového modelu
                  </h3>
                  <Badge variant="neutral" className="font-mono text-xs">
                    {selectedItem.recordId || selectedItem.id || (typeof selectedItem.Id === "object" ? selectedItem.Id?.RecordId : selectedItem.Id)}
                  </Badge>
                  {selectedItem.mandantCode && (
                    <Badge variant="info">Mandant: {selectedItem.mandantCode}</Badge>
                  )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>External ID: <b className="font-mono text-slate-700 dark:text-slate-300">{selectedItem.externalId || selectedItem.ExternalId || "-"}</b></span>
                  <span>•</span>
                  <span>Model ID: <b className="font-mono text-slate-700 dark:text-slate-300">{selectedItem.modelId || modelId || "-"}</b></span>
                  {metrics.total > 0 && (
                    <>
                      <span>•</span>
                      <span>Atributy: <b className="text-slate-700 dark:text-slate-300">{metrics.filled}/{metrics.total}</b> ({metrics.pct} % vyplněno)</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReloadPayload}
                  disabled={payloadLoading}
                  className="h-8 text-xs gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${payloadLoading ? "animate-spin" : ""}`} />
                  <span>Znovu načíst z DataService</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadJson(activeInspectData, `model_${selectedItem.recordId || selectedItem.id || "record"}.json`)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Stáhnout JSON</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(activeInspectData, null, 2), "all_json")}
                  className="h-8 text-xs gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedKey === "all_json" ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                </Button>

                {/* Link to Operation Log if available */}
                {(selectedItem.operationId || operationId) && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const opToNav = selectedItem.operationId || operationId;
                      if (onNavigateToLogs) {
                        onNavigateToLogs(opToNav);
                      } else {
                        sessionStorage.setItem("ava_logs_op_id", opToNav);
                        window.location.reload();
                      }
                    }}
                    className="h-8 text-xs gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Zobrazit v Provozním logu</span>
                  </Button>
                )}

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

            {/* Status Banner */}
            <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {payloadLoading ? (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Načítám kompletní atributy a obsah modelu z DataService...
                  </span>
                ) : isFullModelLoaded ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Kompletní datový model (atributy) úspěšně načten z DataService
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Info className="w-3.5 h-3.5" />
                    Zobrazeny atributy položky výstupní fronty. Tělo modelu nebylo v DataService nalezeno nebo se používá základní záznam.
                  </span>
                )}
              </div>

              {metrics.total > 0 && (
                <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono">
                  <span>Vyplněno: <b className="text-emerald-600 dark:text-emerald-400 font-semibold">{metrics.filled}</b> / {metrics.total} ({metrics.pct} %)</span>
                  {metrics.empty > 0 && (
                    <span className="text-slate-400">• <b className="text-slate-500 font-semibold">{metrics.empty}</b> prázdné</span>
                  )}
                </div>
              )}
            </div>

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
                <span>Kontrola atributů modelu</span>
                <Badge variant="neutral" className="text-[10px] ml-1">
                  {metrics.filled}/{metrics.total}
                </Badge>
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

              <button
                onClick={() => setActiveDetailTab("meta")}
                className={`py-2 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeDetailTab === "meta"
                    ? "border-teal-600 text-teal-700 dark:text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
              >
                <span>ℹ️</span>
                <span>Systémová metadata</span>
              </button>
            </div>

            {/* TAB CONTENT: ATTRIBUTES INSPECTOR */}
            {activeDetailTab === "attributes" && (
              <div className="p-4 space-y-4">
                {/* Filters and search bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/30 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-slate-600 dark:text-slate-400 mr-1">Filtr:</span>
                    <button
                      onClick={() => setAttrFilterMode("all")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        attrFilterMode === "all"
                          ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      Všechny ({metrics.total})
                    </button>
                    <button
                      onClick={() => setAttrFilterMode("filled")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        attrFilterMode === "filled"
                          ? "bg-emerald-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      🟢 Vyplněné ({metrics.filled})
                    </button>
                    <button
                      onClick={() => setAttrFilterMode("empty")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        attrFilterMode === "empty"
                          ? "bg-slate-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      ⚪ Prázdné ({metrics.empty})
                    </button>
                  </div>

                  <div className="relative min-w-[240px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <Input
                      placeholder="Hledat v názvu nebo hodnotě atributu..."
                      value={attrSearch}
                      onChange={(e) => setAttrSearch(e.target.value)}
                      className="h-8 text-xs pl-8 w-full"
                    />
                  </div>
                </div>

                {/* Attributes Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold">
                        <th className="py-2 px-3 w-[220px]">Atribut</th>
                        <th className="py-2 px-3 w-[110px]">Stav</th>
                        <th className="py-2 px-3 w-[100px]">Typ</th>
                        <th className="py-2 px-3">Hodnota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {filteredAttributes.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Žádné atributy neodpovídají zadanému filtru.
                          </td>
                        </tr>
                      ) : (
                        filteredAttributes.map((attr) => {
                          const isExpanded = !!expandedKeys[attr.key];

                          return (
                            <React.Fragment key={attr.key}>
                              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="py-2.5 px-3 font-semibold font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                  {attr.isObject || attr.isArray ? (
                                    <button
                                      onClick={() => toggleExpandKey(attr.key)}
                                      className="text-teal-600 dark:text-teal-400 hover:text-teal-700"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="w-3.5" />
                                  )}
                                  <span>{attr.key}</span>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {attr.isFilled ? (
                                    <Badge variant="success">🟢 Vyplněno</Badge>
                                  ) : (
                                    <Badge variant="neutral">⚪ Prázdné</Badge>
                                  )}
                                </td>

                                <td className="py-2.5 px-3">
                                  <Badge variant="neutral" className="font-mono text-[10px]">
                                    {attr.type}
                                  </Badge>
                                </td>

                                <td className="py-2.5 px-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-mono text-slate-700 dark:text-slate-300 break-all select-all">
                                      {attr.displayValue}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      {(attr.isObject || attr.isArray) && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-[10px] px-2 text-teal-600"
                                          onClick={() => toggleExpandKey(attr.key)}
                                        >
                                          {isExpanded ? "Sbalit" : "Rozbalit JSON"}
                                        </Button>
                                      )}

                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        onClick={() =>
                                          copyToClipboard(
                                            typeof attr.value === "object"
                                              ? JSON.stringify(attr.value, null, 2)
                                              : String(attr.value),
                                            `attr_${attr.key}`
                                          )
                                        }
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </td>
                              </tr>

                              {/* Expanded nested JSON sub-row */}
                              {(attr.isObject || attr.isArray) && isExpanded && (
                                <tr className="bg-slate-900 text-cyan-300">
                                  <td colSpan={4} className="p-3 pl-8">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] text-slate-400">
                                      <span>Vnořená struktura: <b>{attr.key}</b></span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] text-slate-300"
                                        onClick={() => copyToClipboard(JSON.stringify(attr.value, null, 2), `nested_${attr.key}`)}
                                      >
                                        <Copy className="w-3 h-3 mr-1" />
                                        {copiedKey === `nested_${attr.key}` ? "Zkopírováno!" : "Kopírovat JSON"}
                                      </Button>
                                    </div>
                                    <pre className="mt-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                                      {JSON.stringify(attr.value, null, 2)}
                                    </pre>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT: RAW JSON */}
            {activeDetailTab === "json" && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Kompletní serializovaný JSON těla záznamu a modelu:</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => copyToClipboard(JSON.stringify(activeInspectData, null, 2), "tab_json_btn")}
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedKey === "tab_json_btn" ? "Zkopírováno!" : "Kopírovat JSON"}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => downloadJson(activeInspectData, `model_${selectedItem.recordId || selectedItem.id || "record"}.json`)}
                    >
                      <Download className="w-3 h-3" />
                      <span>Stáhnout</span>
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-950 text-cyan-300 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-[600px] border border-slate-800 shadow-inner">
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(activeInspectData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SYSTEM METADATA */}
            {activeDetailTab === "meta" && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Record ID</div>
                    <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-1 break-all">
                      {selectedItem.recordId || selectedItem.id || (typeof selectedItem.Id === "object" ? selectedItem.Id?.RecordId : selectedItem.Id) || "-"}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Data Model ID</div>
                    <div className="font-mono text-slate-800 dark:text-slate-200 mt-1 break-all">
                      {selectedItem.modelId || modelId || "-"}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Result ID / Balíček</div>
                    <div className="font-mono text-teal-600 dark:text-teal-400 mt-1 break-all">
                      {selectedItem.resultId || resultId || "-"}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">External ID</div>
                    <div className="font-mono text-slate-800 dark:text-slate-200 mt-1 break-all">
                      {selectedItem.externalId || selectedItem.ExternalId || "-"}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Mandant Code</div>
                    <div className="mt-1">
                      <Badge variant="info">{selectedItem.mandantCode || "Všechny"}</Badge>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Datum a čas modifikace (UTC / Místní)</div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mt-1">
                      {formatDateTime(selectedItem.utcModifiedOn || selectedItem.modifiedOn || selectedItem.utcCreatedOn)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Stav položky (Deleted / Active)</div>
                    <div className="mt-1">
                      {selectedItem.deleted || selectedItem.isDeleted ? (
                        <Badge variant="error">🔴 Smazáno (deleted)</Badge>
                      ) : (
                        <Badge variant="success">🟢 Aktivní (platné)</Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Typ změny (ChangeType)</div>
                    <div className="mt-1">
                      <Badge variant="neutral">{selectedItem.changeType || "N/A"}</Badge>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                    <div className="text-slate-400 font-medium">Operation ID</div>
                    <div className="font-mono text-teal-600 dark:text-teal-400 mt-1 break-all">
                      {selectedItem.operationId || operationId || "-"}
                    </div>
                  </div>
                </div>

                {/* Raw queue row item JSON */}
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    Raw záznam položky fronty:
                  </div>
                  <pre className="bg-slate-900 text-slate-300 p-3 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-48 border border-slate-800">
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
