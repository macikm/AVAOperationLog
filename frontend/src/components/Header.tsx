import React, { useState } from "react";
import { Settings, Moon, Sun, Shield, User, Globe, LogIn, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { TenantCombobox } from "./TenantCombobox";
import { AuthModal } from "./AuthModal";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export const Header: React.FC = () => {
  const {
    activeEnv,
    userClaims,
    expiration,
    isLoggedIn,
    theme,
    toggleTheme,
    logout,
  } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);

  // User display name & roles
  const userName =
    userClaims?.email ||
    userClaims?.unique_name ||
    userClaims?.sub ||
    (isLoggedIn ? "Uživatel" : "");

  const roles = userClaims?.role || userClaims?.roles || [];
  const rolesStr = Array.isArray(roles) ? roles.join(", ") : String(roles || "");

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-sm">
        <div className="max-w-[1720px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Brand logo & Title + User Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-700 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-teal-700/20 shrink-0">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-teal-800 dark:text-teal-400 tracking-tight font-sans">
                  AVA Monitor
                </span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 rounded">
                  v2.0
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Monitor operačního logu, front & agentů
              </div>
            </div>

            {/* User Claims Badges */}
            {isLoggedIn && userName && (
              <div className="hidden lg:flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-200 dark:border-slate-800">
                <Badge variant="neutral" className="gap-1 text-[11px] py-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  <span className="max-w-[140px] truncate">{userName}</span>
                </Badge>
                {rolesStr && (
                  <Badge variant="neutral" className="gap-1 text-[11px] py-0.5">
                    <Shield className="w-3 h-3 text-teal-600" />
                    <span className="max-w-[120px] truncate">{rolesStr}</span>
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Center: Tenant Combobox */}
          <div className="flex items-center gap-2">
            <TenantCombobox />
          </div>

          {/* Right: Environment, Token Status, Settings & Theme */}
          <div className="flex items-center gap-2">
            {/* Environment Badge */}
            <Badge variant="info" className="gap-1 font-mono text-[11px]">
              <Globe className="w-3 h-3" />
              <span>{activeEnv}</span>
            </Badge>

            {/* Token Status / Expiration Badge */}
            {isLoggedIn ? (
              <Badge
                variant={expiration?.is_expiring ? "warning" : "success"}
                className="gap-1 text-[11px] cursor-help"
                title={`Token expirace: ${expiration?.formatted || "Online"} (auto-refresh je aktivní)`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                <span>{expiration?.formatted || "Online"}</span>
              </Badge>
            ) : (
              <Badge variant="error" className="gap-1 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>Odpojeno</span>
              </Badge>
            )}

            {/* Settings Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAuthModalOpen(true)}
              className="gap-1 text-xs"
              title="Autentikace a nastavení prostředí"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nastavení</span>
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 text-slate-600 dark:text-slate-300"
              title={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* Quick login / logout */}
            {!isLoggedIn ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setAuthModalOpen(true)}
                className="gap-1"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Přihlásit se</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="h-8 w-8 text-slate-500 hover:text-rose-600"
                title="Odhlásit"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
};
