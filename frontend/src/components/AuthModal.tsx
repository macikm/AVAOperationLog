import React, { useState, useEffect } from "react";
import { Key, Shield, Globe, Lock, User, Eye, EyeOff, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { AuthCredentials, ApiClient } from "../lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onOpenChange }) => {
  const { activeEnv, setActiveEnv, login, logout, isLoggedIn, expiration } = useAuth();

  const [environments, setEnvironments] = useState<Record<string, string>>({
    Produkce: "avaplace.com",
    Beta: "beta.avaplace.com",
    Alpha: "alpha.avaplace.com",
    Dev: "dev.avaplace.com",
    Demo: "demo.avaplace.com",
  });

  const [selectedEnv, setSelectedEnv] = useState<string>(activeEnv);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [tenantId, setTenantId] = useState("ASOLEU");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scope, setScope] = useState("");
  const [ssoToken, setSsoToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load environments from API on open
  useEffect(() => {
    if (open) {
      ApiClient.getEnvironments().then((data) => {
        if (data.environments) setEnvironments(data.environments);
      }).catch(console.error);

      // Load saved creds from localStorage if available
      const saved = localStorage.getItem("ava_creds");
      if (saved) {
        try {
          const creds: AuthCredentials = JSON.parse(saved);
          if (creds.username) setUsername(creds.username);
          if (creds.password) setPassword(creds.password);
          if (creds.tenant_id) setTenantId(creds.tenant_id);
          if (creds.client_id) setClientId(creds.client_id);
          if (creds.client_secret) setClientSecret(creds.client_secret);
          if (creds.scope) setScope(creds.scope);
          if (creds.sso_token) setSsoToken(creds.sso_token);
        } catch {}
      }
      setSelectedEnv(activeEnv);
      setErrorMsg(null);
    }
  }, [open, activeEnv]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    let auth_mode: "password" | "client_credentials" | "sso" = "password";
    if (ssoToken.trim()) {
      auth_mode = "sso";
    } else if (username.trim() && password) {
      auth_mode = "password";
    } else if (clientId.trim() && clientSecret.trim()) {
      auth_mode = "client_credentials";
    }

    try {
      if (selectedEnv !== activeEnv) {
        setActiveEnv(selectedEnv);
      }

      await login({
        environment: selectedEnv,
        auth_mode,
        username,
        password,
        tenant_id: tenantId || "ASOLEU",
        client_id: clientId,
        client_secret: clientSecret,
        scope,
        sso_token: ssoToken,
      });

      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Přihlášení selhalo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400">
            <Key className="w-5 h-5 shrink-0" />
            <DialogTitle>Autentikace & Nastavení prostředí</DialogTitle>
          </div>
          <DialogDescription>
            Zvolte cílové prostředí Avaplace a zadejte přihlašovací údaje nebo existující Bearer Token.
          </DialogDescription>
        </DialogHeader>

        {isLoggedIn && expiration && (
          <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Aktivní relace: Token platný ještě <b>{expiration.formatted}</b></span>
            </div>
            <Badge variant="success">Auto-refresh aktivní</Badge>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Environment selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              Prostředí (API Base URL):
            </label>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {Object.entries(environments).map(([name, domain]) => (
                <option key={name} value={name}>
                  {name} (https://{domain})
                </option>
              ))}
            </select>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Uživatelské jméno:
              </label>
              <Input
                type="text"
                placeholder="jan.novak@firma.cz"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Heslo:
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Advanced accordion */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
            >
              <span>{showAdvanced ? "▼ Skrýt pokročilé parametry (Tenant ID, Client Secret)" : "▶ Upřesnit Tenant ID a klientské klíče (volitelné)"}</span>
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 dark:text-slate-300">Tenant ID (tid):</label>
                  <Input
                    type="text"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="ASOLEU"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 dark:text-slate-300">Client ID:</label>
                    <Input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Výchozí klientský klíč"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-600 dark:text-slate-300">Client Secret:</label>
                    <Input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Client Secret"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-600 dark:text-slate-300">Scope:</label>
                  <Input
                    type="text"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder="např. offline_access"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-bold tracking-wider text-slate-400">
              nebo Přímý Bearer Token
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          {/* SSO Token */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Existující Bearer Token (AccessToken):
            </label>
            <textarea
              value={ssoToken}
              onChange={(e) => setSsoToken(e.target.value)}
              placeholder="eyJhbGciOi..."
              rows={2}
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-mono text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <DialogFooter className="pt-2 gap-2 flex-col-reverse sm:flex-row">
            {isLoggedIn && (
              <Button
                type="button"
                variant="destructive"
                className="gap-1 sm:mr-auto"
                onClick={() => {
                  logout();
                  onOpenChange(false);
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Odhlásit
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Zavřít
            </Button>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="gap-1"
            >
              {loading ? (
                <>Připojuji...</>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  Přihlásit & Načíst
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
