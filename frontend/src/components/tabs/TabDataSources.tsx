import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Eye,
  Layers,
  Building2,
  CheckCircle2,
  XCircle,
  Code,
  ArrowRight,
  Copy,
  Check,
  ChevronRight,
  ArrowLeft,
  Box,
  FileJson,
  X,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { formatDateTime } from "../../lib/utils";

interface TabDataSourcesProps {
  initialSourceId?: string;
}

interface EntityMappingItem {
  transformationId: string;
  customCode?: string;
  released?: boolean;
  deleted?: boolean;
  entityId: string;
  entityMappingId?: string;
  priority: number;
  transformationType: string;
  modelId?: string;
  autoMapCommonFields?: boolean;
  autoMapCustomFields?: boolean;
  fields: any[];
  expressions: any[];
  rawMapping: any;
  rawTransformation: any;
}

interface NestedDrillItem {
  label: string;
  data: any;
}

// Extrahuje seznam vnořených mapování entit z pole mappings nebo options
function extractNestedMappings(field: any): any[] {
  if (!field || typeof field !== "object") return [];

  let m = field.mappings;
  if (typeof m === "string") {
    const clean = m.trim();
    if ((clean.startsWith("[") && clean.endsWith("]")) || (clean.startsWith("{") && clean.endsWith("}"))) {
      try {
        m = JSON.parse(clean);
      } catch {
        m = null;
      }
    } else {
      m = null;
    }
  }

  const results: any[] = [];
  if (m && typeof m === "object" && !Array.isArray(m)) {
    if (m.entityId || m.mappings || m.modelId) {
      results.push(m);
    }
  } else if (Array.isArray(m)) {
    for (const item of m) {
      if (item && typeof item === "object" && (item.entityId || item.mappings || item.modelId)) {
        results.push(item);
      } else if (typeof item === "string") {
        try {
          const p = JSON.parse(item);
          if (p && typeof p === "object" && (p.entityId || p.mappings || p.modelId)) {
            results.push(p);
          }
        } catch { }
      }
    }
  }

  if (results.length === 0 && field.transformationType === "NestedObjectMapping") {
    const hint = field.targetFieldName || field.sourceFieldName || "NestedObject";
    results.push({
      entityId: hint,
      mappings: [],
      _placeholder: true,
    });
  }

  return results;
}

// Lidsky čitelné formátování options (key: value)
function formatFieldOptions(opts: any): string {
  if (!opts) return "-";
  if (typeof opts === "string") {
    const s = opts.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        opts = JSON.parse(s);
      } catch {
        return opts;
      }
    } else {
      return opts;
    }
  }
  if (Array.isArray(opts)) {
    return opts
      .map((x) => (typeof x === "object" && x !== null ? `${x.key || ""}: ${x.value ?? ""}` : String(x)))
      .join(", ");
  }
  if (typeof opts === "object" && opts !== null) {
    return Object.entries(opts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  return String(opts);
}

export const TabDataSources: React.FC<TabDataSourcesProps> = ({ initialSourceId }) => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [search, setSearch] = useState(initialSourceId || "");

  // Detail modal state
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [loadingDetailInfo, setLoadingDetailInfo] = useState(false);
  const [detailTab, setDetailTab] = useState<"props" | "json">("props");

  // Transformations drawer / section state
  const [transformations, setTransformations] = useState<any[]>([]);
  const [loadingTransformations, setLoadingTransformations] = useState(false);
  const [selectedTransformSource, setSelectedTransformSource] = useState<any | null>(null);
  const [selectedEntityKey, setSelectedEntityKey] = useState<string | null>(null);

  // Nested entity mapping modal (with hierarchical stack drilldown)
  const [nestedDrillStack, setNestedDrillStack] = useState<NestedDrillItem[]>([]);
  const [nestedShowRawJson, setNestedShowRawJson] = useState(false);

  // Generic JSON inspection modal
  const [jsonModal, setJsonModal] = useState<{ open: boolean; title: string; data: any }>({
    open: false,
    title: "",
    data: null,
  });

  // Copied indicator
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  useEffect(() => {
    if (initialSourceId) {
      setSearch(initialSourceId);
    }
  }, [initialSourceId]);

  const fetchSources = useCallback(async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getDataSources(activeEnv, activeToken, activeTenantId, { fetch_all: "true" });
      setSources(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchSources();
    }
  }, [isLoggedIn, fetchSources]);

  const filteredSources = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sources;
    return sources.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q) ||
        s.applicationCode?.toLowerCase().includes(q) ||
        s.agentCode?.toLowerCase().includes(q) ||
        (s.agent && typeof s.agent === "object" && s.agent.code?.toLowerCase().includes(q))
    );
  }, [sources, search]);

  // Open detail modal with live info fetch
  const openDetailModal = async (ds: any) => {
    setSelectedSource(ds);
    setDetailTab("props");
    if (ds.id && activeToken) {
      setLoadingDetailInfo(true);
      try {
        const res = await ApiClient.getDatasourceInfo(activeEnv, activeToken, activeTenantId, ds.id);
        if (res?.data) {
          setSelectedSource((prev: any) => ({ ...prev, ...res.data }));
        }
      } catch {
        // Keep initial ds
      } finally {
        setLoadingDetailInfo(false);
      }
    }
  };

  // Open transformations section
  const openTransformations = async (ds: any) => {
    setSelectedTransformSource(ds);
    setSelectedEntityKey(null);
    setLoadingTransformations(true);
    try {
      const res = await ApiClient.getTransformations(activeEnv, activeToken!, activeTenantId, ds.id);
      setTransformations(res.items || []);
    } catch (err) {
      console.error(err);
      setTransformations([]);
    } finally {
      setLoadingTransformations(false);
    }
  };

  // Flatten all entity mappings across all transformation definitions
  const allEntityMappings = useMemo<EntityMappingItem[]>(() => {
    const result: EntityMappingItem[] = [];

    for (const tr of transformations) {
      const trId = tr.id || "";
      const customCode = tr.customCode || "";
      const released = tr.released;
      const deleted = tr.deleted;
      const mappingsList = Array.isArray(tr.mappings) ? tr.mappings : [];

      for (const m of mappingsList) {
        if (!m || typeof m !== "object") continue;

        const fieldMaps = Array.isArray(m.mappings) ? m.mappings : [];
        const exprs = Array.isArray(m.expressions) ? m.expressions : [];

        result.push({
          transformationId: trId,
          customCode,
          released,
          deleted,
          entityId: String(m.entityId || "Neznámá entita").trim(),
          entityMappingId: String(m.entityMappingId || "").trim(),
          priority: typeof m.priority === "number" ? m.priority : 0,
          transformationType: String(m.transformationType || "Default"),
          modelId: String(m.modelId || "").trim(),
          autoMapCommonFields: Boolean(m.autoMapCommonFields),
          autoMapCustomFields: Boolean(m.autoMapCustomFields),
          fields: fieldMaps,
          expressions: exprs,
          rawMapping: m,
          rawTransformation: tr,
        });
      }
    }

    // Sort by entityId, entityMappingId, priority ascending
    return result.sort((a, b) => {
      const cmpEntity = a.entityId.localeCompare(b.entityId);
      if (cmpEntity !== 0) return cmpEntity;
      const cmpMapping = (a.entityMappingId || "").localeCompare(b.entityMappingId || "");
      if (cmpMapping !== 0) return cmpMapping;
      return a.priority - b.priority;
    });
  }, [transformations]);

  // Auto-select first entity mapping if none selected
  useEffect(() => {
    if (allEntityMappings.length > 0) {
      const keys = allEntityMappings.map((m) => `${m.entityId}::${m.entityMappingId}::${m.priority}`);
      if (!selectedEntityKey || !keys.includes(selectedEntityKey)) {
        setSelectedEntityKey(keys[0]);
      }
    } else {
      setSelectedEntityKey(null);
    }
  }, [allEntityMappings, selectedEntityKey]);

  // Selected Entity Mapping object
  const activeEntityMapping = useMemo(() => {
    if (!selectedEntityKey || allEntityMappings.length === 0) return null;
    return (
      allEntityMappings.find((m) => `${m.entityId}::${m.entityMappingId}::${m.priority}` === selectedEntityKey) ||
      allEntityMappings[0]
    );
  }, [allEntityMappings, selectedEntityKey]);

  // Find nested mappings in active entity for top banner shortcuts
  const activeEntityNestedShortcuts = useMemo(() => {
    if (!activeEntityMapping) return [];
    const shortcuts: { label: string; field: any; nestedItem: any }[] = [];

    for (const f of activeEntityMapping.fields) {
      if (!f || typeof f !== "object") continue;
      const nestedList = extractNestedMappings(f);
      const fieldName = f.targetFieldName || f.sourceFieldName || "Vnořené pole";
      for (const nItem of nestedList) {
        const nId = nItem.entityId || fieldName;
        shortcuts.push({
          label: `${fieldName} (${nId})`,
          field: f,
          nestedItem: nItem,
        });
      }
    }
    return shortcuts;
  }, [activeEntityMapping]);

  // Start drilling into a nested mapping
  const startNestedDrill = (title: string, nestedData: any) => {
    setNestedDrillStack([
      {
        label: title,
        data: nestedData,
      },
    ]);
    setNestedShowRawJson(false);
  };

  // Push deeper into nested stack
  const pushNestedDrill = (title: string, deeperData: any) => {
    setNestedDrillStack((prev) => [
      ...prev,
      {
        label: title,
        data: deeperData,
      },
    ]);
    setNestedShowRawJson(false);
  };

  // Pop from nested stack
  const popNestedDrill = () => {
    setNestedDrillStack((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : prev));
  };

  const currentNestedItem = nestedDrillStack.length > 0 ? nestedDrillStack[nestedDrillStack.length - 1] : null;

  return (
    <div className="space-y-4">
      {/* --- SOURCES LIST CARD --- */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🔌</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Data Sources ({filteredSources.length} z {sources.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Hledat název, ID, kód aplikace, agenta..."
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
              variant="outline"
              size="sm"
              onClick={fetchSources}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </Button>
          </div>
        </div>

        {/* Table of DataSources */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Stav</th>
                <th className="py-2.5 px-3">Název (Name)</th>
                <th className="py-2.5 px-3">Source ID</th>
                <th className="py-2.5 px-3">Aplikace</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Úroveň přístupu</th>
                <th className="py-2.5 px-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSources.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám Data Sources..." : "Nebyly nalezeny žádné zdroje."}
                  </td>
                </tr>
              ) : (
                filteredSources.map((ds) => {
                  const isEnabled = ds.enabled !== false;
                  const agentCode = ds.agentCode || (ds.agent && typeof ds.agent === "object" ? ds.agent.code : "") || ds.agentId || "-";
                  const isSelectedForTransform = selectedTransformSource?.id === ds.id;

                  return (
                    <tr
                      key={ds.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        isSelectedForTransform ? "bg-teal-50/40 dark:bg-teal-950/20" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        {isEnabled ? (
                          <Badge variant="success">Povoleno</Badge>
                        ) : (
                          <Badge variant="neutral">Vypnuto</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {ds.name || ds.id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <span>{ds.id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(ds.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Kopírovat Source ID"
                          >
                            {copiedText === ds.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{ds.applicationCode || "-"}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {agentCode}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {ds.accessLevel || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => openDetailModal(ds)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Detail</span>
                        </Button>
                        <Button
                          variant={isSelectedForTransform ? "primary" : "secondary"}
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => openTransformations(ds)}
                        >
                          <Layers className="w-3 h-3" />
                          <span>Transformace</span>
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

      {/* --- TRANSFORMATIONS & ENTITY MAPPINGS SECTION --- */}
      {selectedTransformSource && (
        <Card className="border-teal-500/40 bg-teal-50/15 dark:bg-teal-950/10 shadow-md overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-teal-500/20 bg-white/80 dark:bg-slate-900/80 backdrop-blur flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Datové transformace pro: <b>{selectedTransformSource.name || selectedTransformSource.id}</b>
                <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
                  ({selectedTransformSource.id})
                </span>
              </div>
              <Badge variant="info" className="ml-1">
                {allEntityMappings.length} mapování entit
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openTransformations(selectedTransformSource)}
                disabled={loadingTransformations}
                className="h-7 text-xs gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingTransformations ? "animate-spin" : ""}`} />
                <span>Obnovit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTransformSource(null)}
                className="h-7 text-xs"
              >
                ✕ Zavřít
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {loadingTransformations ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>Načítám definice transformací z AVA API...</span>
              </div>
            ) : allEntityMappings.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">
                  ⚠️ Pro tento Data Source nebyly nalezeny žádné definice transformací.
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Pokud v provozních logách vznikají chyby typu <i>"ENTITY MAPPINGS: No transformation for ... entity-mapping identifier"</i>,
                  znamená to, že pro tento DataSource chybí příslušná definice mapování v AVA.
                </p>
              </div>
            ) : (
              <>
                {/* 1. SEZNAM MAPOVÁNÍ ENTIT (ENTITY MAPPINGS) */}
                <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Seznam mapování entit ({allEntityMappings.length})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Kliknutím na řádek zobrazíte detailní mapování polí a atributů dané entity
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                        <tr>
                          <th className="py-2 px-3">Entity ID</th>
                          <th className="py-2 px-3">Entity Mapping ID</th>
                          <th className="py-2 px-3 text-center">Priorita</th>
                          <th className="py-2 px-3">Typ transformace</th>
                          <th className="py-2 px-3">Model ID</th>
                          <th className="py-2 px-3 text-center">Počet polí</th>
                          <th className="py-2 px-3 text-center">Výrazy</th>
                          <th className="py-2 px-3">Auto Map</th>
                          <th className="py-2 px-3">Stav</th>
                          <th className="py-2 px-3 text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allEntityMappings.map((m) => {
                          const key = `${m.entityId}::${m.entityMappingId}::${m.priority}`;
                          const isSelected = selectedEntityKey === key;

                          return (
                            <tr
                              key={key}
                              onClick={() => setSelectedEntityKey(key)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-teal-50 dark:bg-teal-950/40 border-l-4 border-teal-500 font-medium"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                                <Badge variant="info" className="font-mono text-[11px]">
                                  {m.entityId}
                                </Badge>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {m.entityMappingId || "-"}
                              </td>
                              <td className="py-2 px-3 text-center font-mono">
                                <Badge variant="neutral">{m.priority}</Badge>
                              </td>
                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                {m.transformationType}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                {m.modelId ? `${m.modelId.substring(0, 8)}...` : "-"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge variant="neutral">{m.fields.length} polí</Badge>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {m.expressions.length > 0 ? (
                                  <Badge variant="warning">{m.expressions.length} výrazů</Badge>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                              <td className="py-2 px-3 space-x-1">
                                {m.autoMapCommonFields && (
                                  <Badge variant="neutral" className="text-[10px] px-1 py-0">
                                    Common
                                  </Badge>
                                )}
                                {m.autoMapCustomFields && (
                                  <Badge variant="neutral" className="text-[10px] px-1 py-0">
                                    Custom
                                  </Badge>
                                )}
                                {!m.autoMapCommonFields && !m.autoMapCustomFields && (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {m.released ? (
                                  <Badge variant="success">Vydáno</Badge>
                                ) : (
                                  <Badge variant="warning">Návrh</Badge>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <Button
                                  variant={isSelected ? "primary" : "outline"}
                                  size="sm"
                                  className="h-6 text-[11px] px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEntityKey(key);
                                  }}
                                >
                                  Zobrazit pole
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* 2. DETAIL VYBRANÉHO MAPOVÁNÍ ENTITY (POLÍ A VÝRAZŮ) */}
                {activeEntityMapping && (
                  <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🔍</span>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Detail mapování pro entitu: <span className="text-teal-600">{activeEntityMapping.entityId}</span>
                          {activeEntityMapping.entityMappingId && activeEntityMapping.entityMappingId !== activeEntityMapping.entityId && (
                            <span className="ml-1 text-slate-400 font-mono font-normal">
                              ({activeEntityMapping.entityMappingId})
                            </span>
                          )}
                        </div>
                        <Badge variant="info">{activeEntityMapping.fields.length} atributů / polí</Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            setJsonModal({
                              open: true,
                              title: `JSON Definice transformace (${activeEntityMapping.transformationId})`,
                              data: activeEntityMapping.rawTransformation,
                            })
                          }
                        >
                          <FileJson className="w-3.5 h-3.5 text-slate-500" />
                          <span>JSON transformace</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            setJsonModal({
                              open: true,
                              title: `JSON Mapování entity: ${activeEntityMapping.entityId}`,
                              data: activeEntityMapping.rawMapping,
                            })
                          }
                        >
                          <FileJson className="w-3.5 h-3.5 text-slate-500" />
                          <span>JSON mapování entity</span>
                        </Button>
                      </div>
                    </div>

                    {/* Quick drilldown shortcuts if nested entities exist */}
                    {activeEntityNestedShortcuts.length > 0 && (
                      <div className="p-3 bg-teal-50/50 dark:bg-teal-950/20 border-b border-teal-100 dark:border-teal-900/30">
                        <div className="text-[11px] font-semibold text-teal-800 dark:text-teal-200 mb-1.5 flex items-center gap-1.5">
                          <Box className="w-3.5 h-3.5 text-teal-600" />
                          <span>Nalezena vnořená mapování entit ({activeEntityNestedShortcuts.length}):</span>
                          <span className="font-normal text-slate-500">Kliknutím prozkoumáte vnořenou entitu do hloubky</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeEntityNestedShortcuts.map((sc, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 bg-white dark:bg-slate-800 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50"
                              onClick={() =>
                                startNestedDrill(
                                  `${activeEntityMapping.entityId} ➔ ${sc.label}`,
                                  sc.nestedItem
                                )
                              }
                            >
                              <Box className="w-3 h-3 text-teal-600" />
                              <span>{sc.label}</span>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attributes / Fields Table */}
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 px-3">Zdrojové pole (sourceFieldName)</th>
                            <th className="py-2 px-3">Cílové pole (targetFieldName)</th>
                            <th className="py-2 px-3">Typ transformace</th>
                            <th className="py-2 px-3">Agregační funkce</th>
                            <th className="py-2 px-3">Options</th>
                            <th className="py-2 px-3 text-right">Vnořené / Mappings</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {activeEntityMapping.fields.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400">
                                Toto mapování nemá žádná explicitně vyjmenovaná pole (spoléhá na auto-mapping nebo výrazy).
                              </td>
                            </tr>
                          ) : (
                            activeEntityMapping.fields.map((f: any, fIdx: number) => {
                              const nestedList = extractNestedMappings(f);
                              const hasNested = nestedList.length > 0;
                              const srcName = f.sourceFieldName || f.source || "-";
                              const tgtName = f.targetFieldName || f.target || "-";

                              return (
                                <tr key={fIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="py-2 px-3 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    {srcName}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] text-teal-700 dark:text-teal-400">
                                    {tgtName}
                                  </td>
                                  <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                    <Badge variant="neutral" className="text-[10px]">
                                      {f.transformationType || "Default"}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                                    {f.aggregateFunction || "-"}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 font-mono text-[11px] max-w-xs truncate" title={formatFieldOptions(f.options)}>
                                    {formatFieldOptions(f.options)}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    {hasNested ? (
                                      <div className="flex items-center justify-end gap-1 flex-wrap">
                                        {nestedList.map((nItem, nIdx) => {
                                          const nLabel = nItem.entityId || tgtName || "Vnořená entita";
                                          const nSubCount = Array.isArray(nItem.mappings) ? nItem.mappings.length : 0;
                                          return (
                                            <Button
                                              key={nIdx}
                                              variant="outline"
                                              size="sm"
                                              className="h-6 text-[10px] px-2 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700 hover:bg-teal-50"
                                              onClick={() =>
                                                startNestedDrill(
                                                  `${activeEntityMapping.entityId} ➔ ${tgtName} (${nLabel})`,
                                                  nItem
                                                )
                                              }
                                              title={`Otevřít mapování vnořené entity ${nLabel}`}
                                            >
                                              <Box className="w-3 h-3 mr-1 text-teal-600" />
                                              <span>{nLabel} ({nSubCount} polí)</span>
                                            </Button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-[11px]">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Expressions if present */}
                    {activeEntityMapping.expressions.length > 0 && (
                      <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          🔣 Výrazy (Expressions - {activeEntityMapping.expressions.length}):
                        </div>
                        <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto">
                          {JSON.stringify(activeEntityMapping.expressions, null, 2)}
                        </pre>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {/* --- DATASOURCE DETAIL MODAL --- */}
      {selectedSource && (
        <Dialog open={Boolean(selectedSource)} onOpenChange={(o) => !o && setSelectedSource(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between pr-6">
                <span className="flex items-center gap-2">
                  <span>🔌</span>
                  <span>{selectedSource.name || selectedSource.id}</span>
                </span>
                <div className="space-x-1">
                  {selectedSource.enabled !== false ? (
                    <Badge variant="success">Povoleno</Badge>
                  ) : (
                    <Badge variant="neutral">Vypnuto</Badge>
                  )}
                  {selectedSource.isRegistered ? (
                    <Badge variant="info">Registrované</Badge>
                  ) : (
                    <Badge variant="neutral">Neregistrované</Badge>
                  )}
                </div>
              </DialogTitle>
              <DialogDescription>
                Kompletní parametry a systémová metadata Data Source ze serveru
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              {/* Tab Switcher */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDetailTab("props")}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                    detailTab === "props"
                      ? "border-teal-500 text-teal-600 dark:text-teal-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  Přehled vlastností
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("json")}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                    detailTab === "json"
                      ? "border-teal-500 text-teal-600 dark:text-teal-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  Surový JSON
                </button>
              </div>

              {detailTab === "props" ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 px-3 w-1/3">Vlastnost (Property)</th>
                        <th className="py-2 px-3">Hodnota (Value)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Source ID (id)</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-900 dark:text-slate-100 flex items-center justify-between">
                          <span>{selectedSource.id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(selectedSource.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            title="Kopírovat ID"
                          >
                            {copiedText === selectedSource.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Název (name)</td>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">{selectedSource.name || "-"}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Agent ID (agentId)</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {selectedSource.agentId || "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Kód agenta (agentCode)</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {selectedSource.agentCode || (selectedSource.agent && typeof selectedSource.agent === "object" ? selectedSource.agent.code : "") || "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Aplikace (applicationCode)</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {selectedSource.applicationCode || "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Client ID (clientId)</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {selectedSource.clientId || "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Povoleno (enabled)</td>
                        <td className="py-2 px-3">
                          {selectedSource.enabled !== false ? (
                            <span className="text-emerald-600 font-medium">🟢 Ano</span>
                          ) : (
                            <span className="text-rose-600 font-medium">🔴 Ne</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Registrované (isRegistered)</td>
                        <td className="py-2 px-3">
                          {selectedSource.isRegistered ? (
                            <span className="text-emerald-600 font-medium">🟢 Ano</span>
                          ) : (
                            <span className="text-slate-400 font-medium">⚪ Ne</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Typ consumera (consumerType)</td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">{selectedSource.consumerType || "-"}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Úroveň přístupu (accessLevel)</td>
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">{selectedSource.accessLevel || "-"}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Vytvořeno (utcCreatedOn)</td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {selectedSource.utcCreatedOn ? formatDateTime(selectedSource.utcCreatedOn) : "-"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">Změněno (utcModifiedOn)</td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                          {selectedSource.utcModifiedOn ? formatDateTime(selectedSource.utcModifiedOn) : "-"}
                        </td>
                      </tr>

                      {/* Additional properties from payload */}
                      {Object.entries(selectedSource).map(([k, v]) => {
                        const standardKeys = [
                          "id", "name", "agentId", "agentCode", "agent", "applicationCode",
                          "clientId", "enabled", "isRegistered", "consumerType", "accessLevel",
                          "utcCreatedOn", "utcModifiedOn"
                        ];
                        if (standardKeys.includes(k) || typeof v === "object") return null;

                        return (
                          <tr key={k}>
                            <td className="py-2 px-3 font-semibold text-slate-600 dark:text-slate-400">{k}</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-800 dark:text-slate-200">{String(v ?? "-")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => copyToClipboard(JSON.stringify(selectedSource, null, 2))}
                    >
                      <Copy className="w-3 h-3" />
                      <span>Kopírovat JSON</span>
                    </Button>
                  </div>
                  <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg max-h-96 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedSource, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- VNOŘENÁ ENTITA MODAL (HIERARCHICKÁ NAVIGACE DO HLOUBKY N) --- */}
      {nestedDrillStack.length > 0 && currentNestedItem && (
        <Dialog open={nestedDrillStack.length > 0} onOpenChange={(o) => !o && setNestedDrillStack([])}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <DialogTitle className="flex items-center gap-2">
                  <span>🧩</span>
                  <span>Vnořená entita (Nested Entity Mapping)</span>
                </DialogTitle>
                {nestedDrillStack.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={popNestedDrill}
                    className="h-7 text-xs gap-1 border-teal-400 text-teal-700 dark:text-teal-300"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>O úroveň výš</span>
                  </Button>
                )}
              </div>
              <DialogDescription>
                Hierarchická definice a mapování atributů vnořené entity
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              {/* Breadcrumbs */}
              <div className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-slate-500">Hierarchie vnoření:</span>
                {nestedDrillStack.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                    <span
                      className={`font-mono ${
                        idx === nestedDrillStack.length - 1
                          ? "font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 rounded"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {item.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>

              {/* Metadata strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400">Entity ID:</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                    {currentNestedItem.data?.entityId || "N/A"}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400">Model ID:</div>
                  <div className="font-mono text-slate-700 dark:text-slate-300 truncate" title={currentNestedItem.data?.modelId}>
                    {currentNestedItem.data?.modelId ? `${String(currentNestedItem.data.modelId).substring(0, 8)}...` : "-"}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400">Priorita:</div>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {currentNestedItem.data?.priority ?? 0}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Surový JSON:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setNestedShowRawJson(!nestedShowRawJson)}
                  >
                    {nestedShowRawJson ? "Zavřít JSON" : "Ukázat JSON"}
                  </Button>
                </div>
              </div>

              {nestedShowRawJson && (
                <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg max-h-60 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(currentNestedItem.data, null, 2)}
                </pre>
              )}

              {/* Sub-attributes Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <div className="p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-700 dark:text-slate-300">
                  Mapování atributů vnořené entity (
                  {Array.isArray(currentNestedItem.data?.mappings) ? currentNestedItem.data.mappings.length : 0})
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Zdrojové pole</th>
                        <th className="py-2 px-3">Cílové pole</th>
                        <th className="py-2 px-3">Typ transformace</th>
                        <th className="py-2 px-3">Options</th>
                        <th className="py-2 px-3 text-right">Další zanoření</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {!Array.isArray(currentNestedItem.data?.mappings) || currentNestedItem.data.mappings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Tato vnořená entita nemá definována žádná explicitní pole (mappings je prázdné).
                          </td>
                        </tr>
                      ) : (
                        currentNestedItem.data.mappings.map((sf: any, sfIdx: number) => {
                          const deeperNested = extractNestedMappings(sf);
                          const sSrc = sf.sourceFieldName || sf.source || "-";
                          const sTgt = sf.targetFieldName || sf.target || "-";

                          return (
                            <tr key={sfIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-2 px-3 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                {sSrc}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-teal-700 dark:text-teal-400">
                                {sTgt}
                              </td>
                              <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                {sf.transformationType || "Default"}
                              </td>
                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px] max-w-xs truncate" title={formatFieldOptions(sf.options)}>
                                {formatFieldOptions(sf.options)}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {deeperNested.length > 0 ? (
                                  <div className="flex items-center justify-end gap-1 flex-wrap">
                                    {deeperNested.map((dItem, dIdx) => {
                                      const dLabel = dItem.entityId || sTgt || "Hlubší entita";
                                      const dCount = Array.isArray(dItem.mappings) ? dItem.mappings.length : 0;
                                      return (
                                        <Button
                                          key={dIdx}
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-[10px] px-2 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-700"
                                          onClick={() =>
                                            pushNestedDrill(
                                              `${currentNestedItem.label} ➔ ${sTgt} (${dLabel})`,
                                              dItem
                                            )
                                          }
                                        >
                                          <Box className="w-3 h-3 mr-1 text-teal-600" />
                                          <span>{dLabel} ({dCount}) ➔</span>
                                        </Button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* --- GENERIC JSON PREVIEW MODAL --- */}
      {jsonModal.open && (
        <Dialog open={jsonModal.open} onOpenChange={(o) => setJsonModal({ open: o, title: "", data: null })}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between pr-6">
                <span>{jsonModal.title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(JSON.stringify(jsonModal.data, null, 2))}
                >
                  <Copy className="w-3 h-3" />
                  <span>Kopírovat JSON</span>
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="pt-2">
              <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg whitespace-pre-wrap max-h-[60vh] overflow-auto">
                {JSON.stringify(jsonModal.data, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
