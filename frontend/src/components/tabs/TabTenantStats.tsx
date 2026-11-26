import React, { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, BarChart3, Building2, CheckCircle2, AlertTriangle, XCircle, FileText } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient, TenantItem } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabTenantStats: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, tenantsList, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [tenantApps, setTenantApps] = useState<any[]>([]);
  const [includeSmartCheck, setIncludeSmartCheck] = useState(true);

  // Search & filter
  const [search, setSearch] = useState("");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [showTenantFilter, setShowTenantFilter] = useState(false);
  const [tenantFilterQuery, setTenantFilterQuery] = useState("");

  // SmartCheck report / details modal
  const [smartCheckModal, setSmartCheckModal] = useState<{ open: boolean; data: any | null; resultId?: string }>({
    open: false,
    data: null,
  });

  const fetchStats = async () => {
    if (!activeToken || !isLoggedIn) return;
    setLoading(true);
    try {
      const res = await ApiClient.getApplicationsUsedByTenants(
        activeEnv,
        activeToken,
        activeTenantId,
        selectedTenantIds.length > 0 ? selectedTenantIds : undefined,
        includeSmartCheck
      );
      setTenantApps(res.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats();
    }
  }, [activeEnv, activeToken, activeTenantId, selectedTenantIds, includeSmartCheck, isLoggedIn]);

  // Filtered tenants for multi-select popover
  const filteredTenantsForSelect = useMemo(() => {
    const q = tenantFilterQuery.toLowerCase().trim();
    if (!q) return tenantsList;
    return tenantsList.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q)
    );
  }, [tenantsList, tenantFilterQuery]);

  // Filtered rows for main table
  const filteredApps = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tenantApps;
    return tenantApps.filter(
      (item) =>
        item.tenantName?.toLowerCase().includes(q) ||
        item.tenantId?.toLowerCase().includes(q) ||
        item.applicationCode?.toLowerCase().includes(q) ||
        item.applicationName?.toLowerCase().includes(q)
    );
  }, [tenantApps, search]);

  const openSmartCheck = async (resultId: string) => {
    try {
      const res = await ApiClient.getSmartCheckDetails(activeEnv, activeToken!, activeTenantId, resultId);
      setSmartCheckModal({ open: true, data: res.data || res, resultId });
    } catch (err) {
      console.error(err);
      setSmartCheckModal({ open: true, data: { error: "Nepodařilo se načíst detail SmartCheck" }, resultId });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🏢</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Statistika aplikací používaných tenanty ({filteredApps.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrovat tenant nebo aplikaci..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTenantFilter(!showTenantFilter)}
              className="gap-1 h-8 text-xs"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Tenanti {selectedTenantIds.length > 0 ? `(${selectedTenantIds.length})` : "(Všichni)"}
              </span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
              className="gap-1 h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Obnovit</span>
            </Button>
          </div>
        </div>

        {/* Tenant Filter Popover / Box */}
        {showTenantFilter && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Přísný výběr tenantů ({selectedTenantIds.length} vybráno):
              </span>
              <div className="space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    setSelectedTenantIds(filteredTenantsForSelect.map((t) => t.id))
                  }
                >
                  Vybrat vyfiltrované
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-rose-600"
                  onClick={() => setSelectedTenantIds([])}
                >
                  Zrušit výběr
                </Button>
              </div>
            </div>

            <Input
              placeholder="Vyhledat v tenant listu..."
              value={tenantFilterQuery}
              onChange={(e) => setTenantFilterQuery(e.target.value)}
              className="h-8 text-xs"
            />

            <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 p-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
              {filteredTenantsForSelect.map((t) => {
                const checked = selectedTenantIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTenantIds([...selectedTenantIds, t.id]);
                        } else {
                          setSelectedTenantIds(selectedTenantIds.filter((id) => id !== t.id));
                        }
                      }}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="truncate">{t.name || t.id}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">Tenant</th>
                <th className="py-2.5 px-3">Tenant ID</th>
                <th className="py-2.5 px-3">Kód aplikace</th>
                <th className="py-2.5 px-3">Název aplikace</th>
                <th className="py-2.5 px-3">SmartCheck Status</th>
                <th className="py-2.5 px-3 text-right">Detail testu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {loading ? "Načítám statistiku..." : "Žádné záznamy nenalezeny."}
                  </td>
                </tr>
              ) : (
                filteredApps.map((item, idx) => {
                  const scStatus = item.smartCheckStatus || item.status || "Healthy";
                  const resultId = item.smartCheckResultId || item.resultId;

                  let scBadge = <Badge variant="neutral">{scStatus}</Badge>;
                  if (scStatus === "Healthy") scBadge = <Badge variant="success">🟢 Healthy</Badge>;
                  else if (scStatus === "Degraded") scBadge = <Badge variant="warning">🟡 Degraded</Badge>;
                  else if (scStatus === "Unhealthy") scBadge = <Badge variant="error">🔴 Unhealthy</Badge>;

                  return (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-100">
                        {item.tenantName || item.tenantId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {item.tenantId || "-"}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {item.applicationCode || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {item.applicationName || item.applicationCode || "-"}
                      </td>
                      <td className="py-2.5 px-3">{scBadge}</td>
                      <td className="py-2.5 px-3 text-right">
                        {resultId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => openSmartCheck(resultId)}
                          >
                            <FileText className="w-3 h-3 text-teal-600" />
                            <span>SmartCheck</span>
                          </Button>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SmartCheck Modal */}
      {smartCheckModal.open && (
        <Dialog open={smartCheckModal.open} onOpenChange={(o) => !o && setSmartCheckModal({ open: false, data: null })}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                <span>Výsledek testu SmartCheck: {smartCheckModal.resultId}</span>
              </DialogTitle>
              <DialogDescription>Detailní report testu funkčnosti</DialogDescription>
            </DialogHeader>

            <div className="py-2 max-h-[60vh] overflow-y-auto">
              <pre className="p-3 bg-slate-950 text-cyan-300 font-mono text-xs rounded-lg whitespace-pre-wrap">
                {JSON.stringify(smartCheckModal.data, null, 2)}
              </pre>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
