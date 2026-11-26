import React, { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, Eye, Layers, Building2, CheckCircle2, XCircle, Code, ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabDataSources: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<any | null>(null);

  // Transformations view state
  const [transformations, setTransformations] = useState<any[]>([]);
  const [loadingTransformations, setLoadingTransformations] = useState(false);
  const [selectedTransformSource, setSelectedTransformSource] = useState<any | null>(null);

  // Nested entity mapping modal
  const [nestedMappingModal, setNestedMappingModal] = useState<{ open: boolean; mappings: any[]; fieldName: string }>({
    open: false,
    mappings: [],
    fieldName: "",
  });

  const fetchSources = async () => {
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
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchSources();
    }
  }, [activeEnv, activeToken, activeTenantId, isLoggedIn]);

  const filteredSources = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sources;
    return sources.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q) ||
        s.applicationCode?.toLowerCase().includes(q) ||
        s.agentCode?.toLowerCase().includes(q)
    );
  }, [sources, search]);

  const openTransformations = async (ds: any) => {
    setSelectedTransformSource(ds);
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

  return (
    <div className="space-y-4">
      {/* Sources List Card */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🔌</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Data Sources ({filteredSources.length} z {sources.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Hledat název, ID, kód aplikace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900"
              />
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

        {/* Table */}
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

                  return (
                    <tr key={ds.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
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
                        {ds.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="neutral">{ds.applicationCode || "-"}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {ds.agentCode || ds.agentId || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {ds.accessLevel || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedSource(ds)}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Detail</span>
                        </Button>
                        <Button
                          variant="primary"
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

      {/* Selected DataSource Detail Modal */}
      {selectedSource && (
        <Dialog open={Boolean(selectedSource)} onOpenChange={(o) => !o && setSelectedSource(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>🔌 {selectedSource.name || selectedSource.id}</span>
              </DialogTitle>
              <DialogDescription>Kompletní parametry a metadata Data Source</DialogDescription>
            </DialogHeader>

            <div className="py-2 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {Object.entries(selectedSource).map(([k, v]) => {
                if (typeof v === "object" && v !== null) return null;
                return (
                  <div key={k} className="py-2 flex items-center justify-between">
                    <span className="font-semibold text-slate-500">{k}:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">{String(v ?? "-")}</span>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Transformations Drawer / Section */}
      {selectedTransformSource && (
        <Card className="border-teal-500/30 bg-teal-50/20 dark:bg-teal-950/10 shadow-md">
          <div className="p-3 border-b border-teal-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Transformace entit pro: <b>{selectedTransformSource.name || selectedTransformSource.id}</b>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedTransformSource(null)}
              className="h-7 text-xs"
            >
              ✕ Zavřít
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {loadingTransformations ? (
              <div className="py-8 text-center text-xs text-slate-400">Načítám transformace...</div>
            ) : transformations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Pro tento Data Source nebyly nalezeny žádné definice transformací.
              </div>
            ) : (
              transformations.map((t, idx) => {
                const mappings = t.mappings || t.fieldMappings || [];

                return (
                  <Card key={idx} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                        <span>{t.sourceEntity || t.sourceEntityName || "Zdrojová entita"}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-teal-700 dark:text-teal-400">
                          {t.targetEntity || t.targetEntityName || "Cílová entita"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral">Access: {t.accessLevel || "Auto"}</Badge>
                        <Badge variant="info">{mappings.length} mapovaných polí</Badge>
                      </div>
                    </div>

                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 px-3">Zdrojové pole</th>
                            <th className="py-2 px-3">Cílové pole</th>
                            <th className="py-2 px-3">Typ transformace</th>
                            <th className="py-2 px-3">Options / Vnořené</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {mappings.map((f: any, fIdx: number) => {
                            const isNested = f.transformationType === "NestedObjectMapping" || f.mappings;

                            return (
                              <tr key={fIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                  {f.sourceFieldName || f.source || "-"}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] text-teal-700 dark:text-teal-400">
                                  {f.targetFieldName || f.target || "-"}
                                </td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                                  {f.transformationType || "-"}
                                </td>
                                <td className="py-2 px-3">
                                  {isNested ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 text-teal-600 border-teal-300"
                                      onClick={() =>
                                        setNestedMappingModal({
                                          open: true,
                                          mappings: f.mappings || [],
                                          fieldName: f.targetFieldName || f.sourceFieldName,
                                        })
                                      }
                                    >
                                      Vnořené entity ({f.mappings?.length || 1})
                                    </Button>
                                  ) : (
                                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-xs block">
                                      {typeof f.options === "object" ? JSON.stringify(f.options) : f.options || "-"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* Nested Entities Mapping Modal */}
      {nestedMappingModal.open && (
        <Dialog open={nestedMappingModal.open} onOpenChange={(o) => setNestedMappingModal({ open: o, mappings: [], fieldName: "" })}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Vnořená entita: {nestedMappingModal.fieldName}</span>
              </DialogTitle>
              <DialogDescription>Detailní definice mapování vnořených atributů</DialogDescription>
            </DialogHeader>

            <div className="py-2 max-h-[60vh] overflow-y-auto">
              <pre className="p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg whitespace-pre-wrap">
                {JSON.stringify(nestedMappingModal.mappings, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
