import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Building2, Key, X, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { cn } from "../lib/utils";

export const TenantCombobox: React.FC = () => {
  const {
    masterTenantId,
    impersonatedTenantId,
    activeTenantId,
    targetOrgCode,
    tenantsList,
    isLoadingTenants,
    refreshTenants,
    isImpersonated,
    impersonate,
    clearImpersonation,
    isLoggedIn,
  } = useAuth();

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorModal, setErrorModal] = useState<{ open: boolean; log: string; targetId: string }>({
    open: false,
    log: "",
    targetId: "",
  });

  // Multiorg selection state if user clicked a tenant with multiple orgs
  const [multiOrgModal, setMultiOrgModal] = useState<{
    open: boolean;
    tenant: any | null;
  }>({
    open: false,
    tenant: null,
  });

  // Filtered and sorted tenants
  const filteredTenants = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tenantsList;
    return tenantsList.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.ownerOrgCode?.toLowerCase().includes(q)
    );
  }, [tenantsList, searchQuery]);

  // Is search input a raw UUID or custom ID?
  const isDirectIdCandidate = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 3) return false;
    const isAlreadyInList = tenantsList.some(
      (t) => t.id.toLowerCase() === q.toLowerCase()
    );
    return !isAlreadyInList;
  }, [searchQuery, tenantsList]);

  // Active tenant display label
  const activeTenantName = useMemo(() => {
    if (!isImpersonated) {
      return `Tenant: ${masterTenantId} (Výchozí)`;
    }
    const found = tenantsList.find((t) => t.id === impersonatedTenantId);
    if (found) {
      return `${found.name || found.id} (${found.id.slice(0, 8)}...)`;
    }
    return `Impersonace: ${impersonatedTenantId.slice(0, 10)}...`;
  }, [isImpersonated, masterTenantId, impersonatedTenantId, tenantsList]);

  const handleSelectTenant = async (tenantId: string, orgCode?: string) => {
    if (tenantId === masterTenantId && !orgCode) {
      clearImpersonation();
      setOpen(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await impersonate(tenantId, orgCode);
      if (!res.success) {
        setErrorModal({ open: true, log: res.log, targetId: tenantId });
      } else {
        setOpen(false);
        setSearchQuery("");
      }
    } catch (err: any) {
      setErrorModal({ open: true, log: String(err.message || err), targetId: tenantId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectIdSubmit = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    let targetId = q;
    let orgCode = undefined;
    if (q.includes("|")) {
      const parts = q.split("|");
      targetId = parts[0].trim();
      orgCode = parts[1].trim();
    }

    await handleSelectTenant(targetId, orgCode);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center text-xs text-slate-400">
        <Building2 className="w-4 h-4 mr-1.5 opacity-50" />
        <span>Nepřihlášen</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "h-9 min-w-[210px] max-w-[280px] justify-between text-xs font-medium border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors",
                isImpersonated && "border-amber-400/80 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300"
              )}
              disabled={isSubmitting}
            >
              <div className="flex items-center gap-1.5 truncate">
                {isImpersonated ? (
                  <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                )}
                <span className="truncate">{activeTenantName}</span>
              </div>
              <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[340px] p-0 shadow-xl border-slate-200 dark:border-slate-800" align="start">
            {/* Search header */}
            <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50/50 dark:bg-slate-900/50">
              <Search className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Hledat název, ID nebo vložit UUID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-1 hover:text-slate-600 dark:hover:text-slate-200 text-slate-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="p-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1 text-[11px]">
              <button
                onClick={() => handleSelectTenant(masterTenantId)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium",
                  !isImpersonated && "text-teal-700 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-950/40"
                )}
              >
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                <span>Výchozí: {masterTenantId}</span>
              </button>

              <button
                onClick={refreshTenants}
                disabled={isLoadingTenants}
                title="Znovu načíst seznam tenantů z IDP"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
              >
                <RefreshCw className={cn("w-3 h-3", isLoadingTenants && "animate-spin")} />
              </button>
            </div>

            {/* Direct ID paste action */}
            {isDirectIdCandidate && (
              <div className="p-2 border-b border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
                <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-300 mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3 text-amber-600" />
                  <span>Ruční zadání / přímé UUID:</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="text-[10px] bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 truncate max-w-[200px]">
                    {searchQuery.trim()}
                  </code>
                  <Button
                    size="sm"
                    variant="primary"
                    className="h-6 text-[10px] px-2 ml-auto"
                    onClick={handleDirectIdSubmit}
                    disabled={isSubmitting}
                  >
                    Impersonovat
                  </Button>
                </div>
              </div>
            )}

            {/* Tenants list */}
            <div className="max-h-64 overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredTenants.length === 0 && !isDirectIdCandidate ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  {isLoadingTenants ? "Načítám tenanty..." : "Žádný tenant nenalezen."}
                </div>
              ) : (
                filteredTenants.map((tenant) => {
                  const isSelected = isImpersonated && impersonatedTenantId === tenant.id;
                  const orgCount = tenant.orgs?.length || 0;

                  return (
                    <div
                      key={tenant.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer text-xs transition-colors",
                        isSelected && "bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 font-medium"
                      )}
                      onClick={() => {
                        if (orgCount > 1) {
                          setMultiOrgModal({ open: true, tenant });
                        } else {
                          const singleOrg = tenant.orgs?.[0] || tenant.ownerOrgCode;
                          handleSelectTenant(tenant.id, singleOrg);
                        }
                      }}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold truncate text-slate-800 dark:text-slate-200">
                          {tenant.name || tenant.id}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {tenant.id}
                        </div>
                        {tenant.ownerOrgCode && (
                          <div className="text-[10px] text-teal-600 dark:text-teal-400">
                            Org: {tenant.ownerOrgCode}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {orgCount > 1 && (
                          <Badge variant="neutral" className="text-[9px] py-0 px-1">
                            {orgCount} orgs
                          </Badge>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with status */}
            {isImpersonated && (
              <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Aktivní: <b>{impersonatedTenantId.slice(0, 12)}...</b>
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    clearImpersonation();
                    setOpen(false);
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Zrušit impersonaci
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Quick Cancel Impersonation Button directly on header */}
        {isImpersonated && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-2 text-[11px] gap-1 shadow-sm"
            onClick={clearImpersonation}
            title="Zrušit impersonaci a vrátit se na výchozího tenanta"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Zrušit</span>
          </Button>
        )}
      </div>

      {/* Multi-Org Selection Modal */}
      {multiOrgModal.open && multiOrgModal.tenant && (
        <Dialog open={multiOrgModal.open} onOpenChange={(o) => setMultiOrgModal({ open: o, tenant: null })}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Výběr organizace pro tenanta</DialogTitle>
              <DialogDescription>
                Tenant <b>{multiOrgModal.tenant.name}</b> má více přiřazených organizací. Vyberte, pod kterou organizací chcete vystupovat:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {multiOrgModal.tenant.orgs?.map((org: string) => (
                <button
                  key={org}
                  onClick={() => {
                    const tId = multiOrgModal.tenant.id;
                    setMultiOrgModal({ open: false, tenant: null });
                    handleSelectTenant(tId, org);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-all flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Kód org.: {org}</span>
                  <Badge variant="info">Vybrat</Badge>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Impersonation Error Response Log Modal */}
      {errorModal.open && (
        <Dialog open={errorModal.open} onOpenChange={(o) => setErrorModal({ open: o, log: "", targetId: "" })}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <DialogTitle>Impersonace za tenant '{errorModal.targetId}' selhala</DialogTitle>
              </div>
              <DialogDescription>
                Server IDP vrátil následující detailní chybové hlášení:
              </DialogDescription>
            </DialogHeader>

            <div className="bg-slate-900 text-rose-300 p-4 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-96">
              {errorModal.log}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
