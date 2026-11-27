import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Copy,
  Check,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  Layers,
  FileCode,
  Download,
  X,
  Activity,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiClient } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const TabTenantStats: React.FC = () => {
  const { activeEnv, activeToken, activeTenantId, tenantsList, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [tenantsData, setTenantsData] = useState<any[]>([]);
  const [includeSmartCheck, setIncludeSmartCheck] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Healthy" | "Degraded" | "Unhealthy">("all");
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [showTenantFilter, setShowTenantFilter] = useState(false);
  const [tenantFilterQuery, setTenantFilterQuery] = useState("");

  // Master-Detail selection
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);

  // SmartCheck Modal state
  const [smartCheckModal, setSmartCheckModal] = useState<{
    open: boolean;
    loading: boolean;
    resultId: string;
    tenantId: string;
    tenantName?: string;
    appCode?: string;
    data: any | null;
    htmlReport: string | null;
    impersonationLog?: string | null;
    error?: string | null;
  }>({
    open: false,
    loading: false,
    resultId: "",
    tenantId: "",
    data: null,
    htmlReport: null,
  });

  const [modalTab, setModalTab] = useState<"tests" | "html" | "json">("tests");
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const fetchStats = useCallback(async () => {
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
      const items = res.items || [];
      setTenantsData(items);

      // Auto-select first or keep current selected tenant
      if (items.length > 0) {
        setSelectedTenant((prev: any) => {
          if (!prev) return items[0];
          const found = items.find((t: any) => t.tenantId === prev.tenantId);
          return found || items[0];
        });
      } else {
        setSelectedTenant(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeEnv, activeToken, activeTenantId, selectedTenantIds, includeSmartCheck, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats();
    }
  }, [fetchStats, isLoggedIn]);

  // Filtered tenants for multi-select popover
  const filteredTenantsForSelect = useMemo(() => {
    const q = tenantFilterQuery.toLowerCase().trim();
    if (!q) return tenantsList;
    return tenantsList.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q)
    );
  }, [tenantsList, tenantFilterQuery]);

  // Filtered tenants for master table
  const filteredTenants = useMemo(() => {
    const q = search.toLowerCase().trim();

    return tenantsData.filter((item: any) => {
      const scStatus = item.smartCheckStatus || "Neuvedeno";

      if (statusFilter !== "all" && scStatus !== statusFilter) {
        return false;
      }

      if (!q) return true;
      return (
        String(item.tenantName || "").toLowerCase().includes(q) ||
        String(item.tenantId || "").toLowerCase().includes(q) ||
        String(item.ownerOrgCode || "").toLowerCase().includes(q) ||
        String(item.ownerOrgName || "").toLowerCase().includes(q)
      );
    });
  }, [tenantsData, search, statusFilter]);

  // KPIs
  const stats = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    for (const t of tenantsData) {
      const st = t.smartCheckStatus || "";
      if (st === "Healthy") healthy++;
      else if (st === "Degraded") degraded++;
      else if (st === "Unhealthy") unhealthy++;
    }

    return {
      total: tenantsData.length,
      healthy,
      degraded,
      unhealthy,
    };
  }, [tenantsData]);

  // Open SmartCheck dialog with impersonalization and rich reports
  const openSmartCheck = async (
    resultId: string,
    targetTenantId: string,
    tenantName?: string,
    ownerOrgCode?: string,
    appCode?: string,
    groupCode?: string
  ) => {
    if (!resultId) return;

    setSmartCheckModal({
      open: true,
      loading: true,
      resultId,
      tenantId: targetTenantId,
      tenantName,
      appCode,
      data: null,
      htmlReport: null,
      impersonationLog: null,
      error: null,
    });
    setModalTab("tests");

    try {
      // 1. Fetch structured details (with automatic child impersonation in server.py)
      const detailsPromise = ApiClient.getSmartCheckDetails(
        activeEnv,
        activeToken!,
        activeTenantId,
        resultId,
        targetTenantId,
        ownerOrgCode
      );

      // 2. Fetch HTML adhoc report (with impersonation)
      const reportPromise = ApiClient.getSmartCheckReport(
        activeEnv,
        activeToken!,
        activeTenantId,
        resultId,
        targetTenantId,
        groupCode,
        ownerOrgCode
      );

      const [detailsRes, htmlRes] = await Promise.allSettled([detailsPromise, reportPromise]);

      let parsedData: any = null;
      let impLog: string | null = null;
      let htmlText: string | null = null;
      let errMsg: string | null = null;

      if (detailsRes.status === "fulfilled") {
        parsedData = detailsRes.value?.data || detailsRes.value;
        impLog = detailsRes.value?.impersonation_log || null;
      }

      if (htmlRes.status === "fulfilled") {
        htmlText = htmlRes.value;
      }

      if (!parsedData && !htmlText) {
        errMsg = "Nepodařilo se načíst diagnostiku testu ani HTML protokol SmartCheck: " +
          (detailsRes.status === "rejected" ? detailsRes.reason?.message : "") + " " +
          (htmlRes.status === "rejected" ? htmlRes.reason?.message : "");
      } else if (!parsedData && htmlText) {
        // Pokud je dostupný pouze HTML protokol, přepneme přímo na záložku protokolu
        setModalTab("html");
      }

      setSmartCheckModal((prev) => ({
        ...prev,
        loading: false,
        data: parsedData,
        htmlReport: htmlText,
        impersonationLog: impLog,
        error: errMsg,
      }));
    } catch (err: any) {
      setSmartCheckModal((prev) => ({
        ...prev,
        loading: false,
        error: "Chyba při komunikaci: " + (err?.message || err),
      }));
    }
  };

  // Helper download handler
  const downloadReport = (content: string, type: "html" | "txt") => {
    const blob = new Blob([content], { type: type === "html" ? "text/html" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartcheck_report_${smartCheckModal.resultId}.${type}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* --- TOP BAR: FILTRY & KPI --- */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Statistika a SmartCheck tenantů ({filteredTenants.length} z {tenantsData.length})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter Pill buttons */}
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "all"
                    ? "bg-teal-500 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                Všichni ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("Healthy")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "Healthy"
                    ? "bg-emerald-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                🟢 Healthy ({stats.healthy})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("Degraded")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "Degraded"
                    ? "bg-amber-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                🟡 Degraded ({stats.degraded})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("Unhealthy")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === "Unhealthy"
                    ? "bg-rose-600 text-white font-medium shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                🔴 Unhealthy ({stats.unhealthy})
              </button>
            </div>

            {/* Fulltext Search input */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Filtrovat tenant nebo organizaci..."
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

            {/* Tenant multi-filter button */}
            <Button
              variant={selectedTenantIds.length > 0 ? "secondary" : "outline"}
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
              variant="outline"
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

        {/* Tenant Filter Popover */}
        {showTenantFilter && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Omezit dotaz na vybrané tenanty ({selectedTenantIds.length} vybráno):
              </span>
              <div className="space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setSelectedTenantIds(filteredTenantsForSelect.map((t) => t.id))}
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
              placeholder="Vyhledat v seznamu dostupných tenantů..."
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

        {/* --- SEZNAM TENANTŮ (MASTER TABULKA) --- */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
              1. Seznam tenantů (kliknutím na řádek zobrazíte přidružené aplikace)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Vybráno: <strong className="text-slate-700 dark:text-slate-200">{selectedTenant?.tenantName || selectedTenant?.tenantId || "Žádný"}</strong>
          </span>
        </div>

        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold z-10">
              <tr>
                <th className="py-2 px-3">Tenant</th>
                <th className="py-2 px-3">Tenant ID</th>
                <th className="py-2 px-3">Organizace</th>
                <th className="py-2 px-3 text-center">Aplikací</th>
                <th className="py-2 px-3">SmartCheck Stav</th>
                <th className="py-2 px-3">Poslední test</th>
                <th className="py-2 px-3 text-right">SmartCheck</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {loading ? "Načítám statistiku tenantů..." : "Žádní tenanti nenalezeni."}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((item: any, idx: number) => {
                  const isSelected = selectedTenant?.tenantId === item.tenantId;
                  const scStatus = item.smartCheckStatus || "Neuvedeno";
                  const resultId = item.smartCheckResultId;
                  const appCount = Array.isArray(item.applications) ? item.applications.length : item.appCount || 0;

                  return (
                    <tr
                      key={item.tenantId || idx}
                      onClick={() => setSelectedTenant(item)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-teal-50 dark:bg-teal-950/40 font-medium border-l-4 border-l-teal-500"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className={`w-3.5 h-3.5 ${isSelected ? "text-teal-600" : "text-slate-400"}`} />
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.tenantName || item.tenantId || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <span>{item.tenantId || "-"}</span>
                          {item.tenantId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(item.tenantId);
                              }}
                              className="text-slate-400 hover:text-slate-600"
                              title="Kopírovat Tenant ID"
                            >
                              {copiedText === item.tenantId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {item.ownerOrgCode || item.ownerOrgName || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="neutral" className="text-[11px] font-mono">
                          {appCount}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        {scStatus === "Healthy" ? (
                          <Badge variant="success">🟢 Healthy</Badge>
                        ) : scStatus === "Degraded" ? (
                          <Badge variant="warning">🟡 Degraded</Badge>
                        ) : scStatus === "Unhealthy" ? (
                          <Badge variant="error">🔴 Unhealthy</Badge>
                        ) : (
                          <Badge variant="neutral">⚪ {scStatus}</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {item.smartCheckCreatedOn ? new Date(item.smartCheckCreatedOn).toLocaleString() : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {resultId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] gap-1 text-teal-700 border-teal-300 dark:border-teal-700 hover:bg-teal-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSmartCheck(
                                resultId,
                                item.tenantId,
                                item.tenantName,
                                item.ownerOrgCode
                              );
                            }}
                          >
                            <FileText className="w-3 h-3 text-teal-600" />
                            <span>Report</span>
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

      {/* --- DETAIL SEKCE: APLIKACE VYBRANÉHO TENANTA --- */}
      {selectedTenant && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-3 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                2. Aplikace tenanta: <span className="text-teal-700 dark:text-teal-400">{selectedTenant.tenantName || selectedTenant.tenantId}</span>
              </span>
              <Badge variant="info">
                {Array.isArray(selectedTenant.applications) ? selectedTenant.applications.length : 0} aplikací
              </Badge>
            </div>
            {selectedTenant.smartCheckResultId && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-teal-400 text-teal-700 dark:text-teal-300 hover:bg-teal-50"
                onClick={() =>
                  openSmartCheck(
                    selectedTenant.smartCheckResultId,
                    selectedTenant.tenantId,
                    selectedTenant.tenantName,
                    selectedTenant.ownerOrgCode
                  )
                }
              >
                <FileText className="w-3 h-3 text-teal-600" />
                <span>Zobrazit celkový SmartCheck report tenanta</span>
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Kód aplikace (applicationCode)</th>
                  <th className="py-2.5 px-3">Název aplikace</th>
                  <th className="py-2.5 px-3">SmartCheck Status</th>
                  <th className="py-2.5 px-3">Group Code</th>
                  <th className="py-2.5 px-3">ID aplikace</th>
                  <th className="py-2.5 px-3 text-right">Diagnostika</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {!Array.isArray(selectedTenant.applications) || selectedTenant.applications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Tento tenant nemá evidovány žádné přidružené aplikace.
                    </td>
                  </tr>
                ) : (
                  selectedTenant.applications.map((app: any, idx: number) => {
                    const appScStatus = app.smartCheckStatus || "Neuvedeno";
                    const appResultId = app.smartCheckResultId || selectedTenant.smartCheckResultId;

                    return (
                      <tr key={app.applicationCode || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-semibold font-mono text-teal-700 dark:text-teal-400">
                          {app.applicationCode || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          {app.applicationName || app.applicationCode || "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          {appScStatus === "Healthy" ? (
                            <Badge variant="success">🟢 Healthy</Badge>
                          ) : appScStatus === "Degraded" ? (
                            <Badge variant="warning">🟡 Degraded</Badge>
                          ) : appScStatus === "Unhealthy" ? (
                            <Badge variant="error">🔴 Unhealthy</Badge>
                          ) : (
                            <Badge variant="neutral">⚪ {appScStatus}</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {app.smartCheckGroupCode || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                          {app.applicationId || app.id || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {appResultId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50"
                              onClick={() =>
                                openSmartCheck(
                                  appResultId,
                                  selectedTenant.tenantId,
                                  selectedTenant.tenantName,
                                  selectedTenant.ownerOrgCode,
                                  app.applicationCode,
                                  app.smartCheckGroupCode
                                )
                              }
                            >
                              <FileText className="w-3 h-3 text-teal-600" />
                              <span>SmartCheck report</span>
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
      )}

      {/* --- STRUKTUROVANÝ SMARTCHECK REPORT INSPECTOR --- */}
      {smartCheckModal.open && (
        <Dialog
          open={smartCheckModal.open}
          onOpenChange={(o) =>
            !o &&
            setSmartCheckModal({
              open: false,
              loading: false,
              resultId: "",
              tenantId: "",
              data: null,
              htmlReport: null,
            })
          }
        >
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
            {/* Modal Header */}
            <DialogHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        SmartCheck Report
                      </DialogTitle>
                      {smartCheckModal.data?.status && (
                        smartCheckModal.data.status === "Healthy" ? (
                          <Badge variant="success">🟢 Healthy</Badge>
                        ) : smartCheckModal.data.status === "Degraded" ? (
                          <Badge variant="warning">🟡 Degraded</Badge>
                        ) : (
                          <Badge variant="error">🔴 Unhealthy</Badge>
                        )
                      )}
                    </div>
                    <DialogDescription className="text-xs text-slate-500 font-mono mt-0.5">
                      Result ID: {smartCheckModal.resultId}
                      {smartCheckModal.tenantName ? ` | Tenant: ${smartCheckModal.tenantName}` : ""}
                      {smartCheckModal.appCode ? ` | Aplikace: ${smartCheckModal.appCode}` : ""}
                    </DialogDescription>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => copyToClipboard(smartCheckModal.resultId)}
                  >
                    {copiedText === smartCheckModal.resultId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>Kopírovat ID</span>
                  </Button>
                </div>
              </div>

              {/* Impersonation Banner if present */}
              {smartCheckModal.impersonationLog && (
                <div className="mt-2.5 p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold">Impersonace:</span>
                  <span className="font-mono truncate">{smartCheckModal.impersonationLog}</span>
                </div>
              )}

              {/* Error Banner if any */}
              {smartCheckModal.error && (
                <div className="mt-2.5 p-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-md text-[11px] text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                  <span>{smartCheckModal.error}</span>
                </div>
              )}

              {/* Tabs Navigation */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalTab("tests")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                      modalTab === "tests"
                        ? "bg-teal-500 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Diagnostika testů ({smartCheckModal.data?.childResults?.length || 0})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab("html")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                      modalTab === "html"
                        ? "bg-teal-500 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>HTML Protokol</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab("json")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors ${
                      modalTab === "json"
                        ? "bg-teal-500 text-white"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Kompletní JSON</span>
                  </button>
                </div>

                {modalTab === "html" && smartCheckModal.htmlReport && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReport(smartCheckModal.htmlReport!, "html")}
                      className="h-6 text-[10px] gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Stáhnout HTML</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadReport(smartCheckModal.htmlReport!, "txt")}
                      className="h-6 text-[10px] gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Stáhnout TXT</span>
                    </Button>
                  </div>
                )}
              </div>
            </DialogHeader>

            {/* Modal Body */}
            <div className="p-4 flex-grow overflow-y-auto max-h-[65vh] text-xs">
              {smartCheckModal.loading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <RefreshCw className="w-7 h-7 animate-spin text-teal-600" />
                  <span className="font-medium">Načítám a autorizuji detail testu SmartCheck...</span>
                </div>
              ) : modalTab === "tests" ? (
                /* Tab 1: Diagnostika jednotlivých dílčích testů */
                <div className="space-y-3">
                  {!smartCheckModal.data?.childResults || smartCheckModal.data.childResults.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      {smartCheckModal.data ? (
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            Výsledek neobsahuje pole dílčích testů (childResults).
                          </p>
                          <p className="text-[11px] mt-1">Zkontrolujte záložku 'HTML Protokol' nebo 'Kompletní JSON'.</p>
                        </div>
                      ) : (
                        "Žádná data diagnostiky nejsou dostupná."
                      )}
                    </div>
                  ) : (
                    smartCheckModal.data.childResults.map((sub: any, idx: number) => {
                      const status = sub.status || "Healthy";
                      const testName =
                        sub.name?.values?.[0]?.value ||
                        sub.code ||
                        `Test #${idx + 1}`;
                      const isUnhealthy = status === "Unhealthy";
                      const isDegraded = status === "Degraded";

                      return (
                        <div
                          key={sub.id || idx}
                          className={`p-3 rounded-lg border transition-all ${
                            isUnhealthy
                              ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50"
                              : isDegraded
                              ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {isUnhealthy ? (
                                <Badge variant="error" className="gap-1">
                                  <XCircle className="w-3 h-3" />
                                  <span>Unhealthy</span>
                                </Badge>
                              ) : isDegraded ? (
                                <Badge variant="warning" className="gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Degraded</span>
                                </Badge>
                              ) : (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Healthy</span>
                                </Badge>
                              )}
                              <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                                {testName}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                              {sub.duration && <span>Trvání: {sub.duration}</span>}
                              {sub.code && <span className="text-teal-600 dark:text-teal-400">{sub.code}</span>}
                            </div>
                          </div>

                          {/* Failure / Issue callout box */}
                          {(isUnhealthy || isDegraded || sub.description) && (
                            <div
                              className={`mt-2.5 p-2.5 rounded border text-xs font-mono leading-relaxed ${
                                isUnhealthy
                                  ? "bg-rose-100/70 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                                  : isDegraded
                                  ? "bg-amber-100/70 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                                  : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              <div className="font-bold font-sans flex items-center gap-1.5 mb-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Detail nálezu testu:</span>
                              </div>
                              <div className="whitespace-pre-wrap">{sub.description || "Nebyly specifikovány doplňující detaily chyby."}</div>
                            </div>
                          )}

                          {/* Optional Extra sub data */}
                          {sub.data && Object.keys(sub.data).length > 0 && (
                            <details className="mt-2 text-[11px] text-slate-500">
                              <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none">
                                Zobrazit doplňková technická data testu
                              </summary>
                              <pre className="mt-1 p-2 bg-slate-950 text-cyan-300 font-mono text-[10px] rounded overflow-x-auto">
                                {JSON.stringify(sub.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : modalTab === "html" ? (
                /* Tab 2: HTML adhoc report protokol */
                <div className="space-y-2 h-full">
                  {!smartCheckModal.htmlReport ? (
                    <div className="p-8 text-center text-slate-400">
                      HTML protokol není pro tento test k dispozici.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
                      <iframe
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                          <head>
                            <meta charset="utf-8" />
                            <style>
                              body, pre, code, p, span, div, td, th, li {
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                                white-space: pre-wrap !important;
                                word-break: break-word !important;
                                font-size: 13px !important;
                                line-height: 1.5 !important;
                                color: #1e293b;
                              }
                              table { width: 100% !important; border-collapse: collapse !important; }
                              th, td { padding: 6px 8px !important; border-bottom: 1px solid #e2e8f0 !important; }
                              th { background-color: #f8fafc !important; text-align: left !important; }
                            </style>
                          </head>
                          <body>
                            ${smartCheckModal.htmlReport}
                          </body>
                          </html>
                        `}
                        title="SmartCheck Report"
                        className="w-full h-[55vh] border-0"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Tab 3: Surový JSON */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Kompletní JSON data SmartChecku:
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(smartCheckModal.data, null, 2))}
                      className="h-6 text-[10px] gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Kopírovat JSON</span>
                    </Button>
                  </div>
                  <pre className="p-3 bg-slate-950 text-cyan-300 font-mono text-[11px] rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[50vh]">
                    {JSON.stringify(smartCheckModal.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
