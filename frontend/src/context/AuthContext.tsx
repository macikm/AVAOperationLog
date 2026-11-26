import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ApiClient, AuthCredentials, UserClaims, ExpirationInfo, TenantItem } from "../lib/api";

interface AuthContextType {
  activeEnv: string;
  setActiveEnv: (env: string) => void;
  masterToken: string | null;
  impersonatedToken: string | null;
  activeToken: string | null;
  masterTenantId: string;
  impersonatedTenantId: string | null;
  activeTenantId: string;
  targetOrgCode: string | null;
  userClaims: UserClaims | null;
  expiration: ExpirationInfo | null;
  tenantsList: TenantItem[];
  isLoadingTenants: boolean;
  refreshTenants: () => Promise<void>;
  isLoggedIn: boolean;
  isImpersonated: boolean;
  impersonate: (targetTenantId: string, orgCode?: string) => Promise<{ success: boolean; log: string }>;
  clearImpersonation: () => void;
  login: (creds: AuthCredentials) => Promise<void>;
  logout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeEnv, setActiveEnvState] = useState<string>(() => {
    return localStorage.getItem("ava_active_env") || "Produkce";
  });

  const [masterToken, setMasterToken] = useState<string | null>(() => {
    return localStorage.getItem("ava_master_token") || null;
  });

  const [impersonatedToken, setImpersonatedToken] = useState<string | null>(() => {
    return localStorage.getItem("ava_imp_token") || null;
  });

  const [masterTenantId, setMasterTenantId] = useState<string>(() => {
    return localStorage.getItem("ava_master_tenant_id") || "ASOLEU";
  });

  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(() => {
    return localStorage.getItem("ava_imp_tenant_id") || null;
  });

  const [targetOrgCode, setTargetOrgCode] = useState<string | null>(() => {
    return localStorage.getItem("ava_imp_org_code") || null;
  });

  const [userClaims, setUserClaims] = useState<UserClaims | null>(() => {
    const saved = localStorage.getItem("ava_user_claims");
    return saved ? JSON.parse(saved) : null;
  });

  const [expiration, setExpiration] = useState<ExpirationInfo | null>(() => {
    const saved = localStorage.getItem("ava_token_exp");
    return saved ? JSON.parse(saved) : null;
  });

  const [tenantsList, setTenantsList] = useState<TenantItem[]>([]);
  const [isLoadingTenants, setIsLoadingTenants] = useState<boolean>(false);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ava_theme") as "light" | "dark") || "light";
  });

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("ava_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setActiveEnv = (env: string) => {
    setActiveEnvState(env);
    localStorage.setItem("ava_active_env", env);
    // Clearing tokens on environment switch to prevent stale queries
    logout();
  };

  const activeToken = impersonatedToken || masterToken;
  const activeTenantId = impersonatedTenantId || masterTenantId;
  const isLoggedIn = Boolean(masterToken);
  const isImpersonated = Boolean(impersonatedTenantId);

  // Fetch tenants list
  const refreshTenants = useCallback(async () => {
    if (!masterToken) return;
    setIsLoadingTenants(true);
    try {
      const items = await ApiClient.getTenants(activeEnv, masterToken, masterTenantId);
      setTenantsList(items);
    } catch (err) {
      console.warn("Failed to load user tenants:", err);
    } finally {
      setIsLoadingTenants(false);
    }
  }, [activeEnv, masterToken, masterTenantId]);

  useEffect(() => {
    if (masterToken) {
      refreshTenants();
    } else {
      setTenantsList([]);
    }
  }, [masterToken, refreshTenants]);

  // Real-time token expiration ticker & auto-refresh
  useEffect(() => {
    if (!activeToken) return;

    const interval = setInterval(() => {
      // Calculate remaining seconds if exp exists in claims
      if (userClaims?.exp) {
        const now = Math.floor(Date.now() / 1000);
        const rem = userClaims.exp - now;
        let fmt = "Vypršel";
        if (rem > 3600) {
          fmt = `${Math.floor(rem / 3600)} h ${Math.floor((rem % 3600) / 60)} min`;
        } else if (rem > 60) {
          fmt = `${Math.floor(rem / 60)} min`;
        } else if (rem > 0) {
          fmt = `${rem} s`;
        }

        setExpiration({
          exp_timestamp: userClaims.exp,
          remaining_seconds: Math.max(0, rem),
          is_expired: rem <= 0,
          is_expiring: rem > 0 && rem < 300,
          formatted: fmt,
        });

        // Trigger auto-refresh silently if expiring in < 5 mins
        if (rem > 0 && rem < 300) {
          const savedCreds = localStorage.getItem("ava_creds");
          if (savedCreds) {
            try {
              const creds: AuthCredentials = JSON.parse(savedCreds);
              ApiClient.login(creds).then((data) => {
                setMasterToken(data.access_token);
                localStorage.setItem("ava_master_token", data.access_token);
                if (data.user_claims) {
                  setUserClaims(data.user_claims);
                  localStorage.setItem("ava_user_claims", JSON.stringify(data.user_claims));
                }
              }).catch((e) => console.error("Silent token refresh failed", e));
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeToken, userClaims]);

  const login = async (creds: AuthCredentials) => {
    const data = await ApiClient.login(creds);
    setMasterToken(data.access_token);
    localStorage.setItem("ava_master_token", data.access_token);
    localStorage.setItem("ava_creds", JSON.stringify(creds));

    const tId = creds.tenant_id || data.tenant_id || "ASOLEU";
    setMasterTenantId(tId);
    localStorage.setItem("ava_master_tenant_id", tId);

    if (data.user_claims) {
      setUserClaims(data.user_claims);
      localStorage.setItem("ava_user_claims", JSON.stringify(data.user_claims));
    }
    if (data.expiration) {
      setExpiration(data.expiration);
      localStorage.setItem("ava_token_exp", JSON.stringify(data.expiration));
    }

    // Reset any impersonation on new login
    clearImpersonation();
  };

  const logout = () => {
    setMasterToken(null);
    setImpersonatedToken(null);
    setImpersonatedTenantId(null);
    setTargetOrgCode(null);
    setUserClaims(null);
    setExpiration(null);
    setTenantsList([]);

    localStorage.removeItem("ava_master_token");
    localStorage.removeItem("ava_imp_token");
    localStorage.removeItem("ava_imp_tenant_id");
    localStorage.removeItem("ava_imp_org_code");
    localStorage.removeItem("ava_user_claims");
    localStorage.removeItem("ava_token_exp");
  };

  const impersonate = async (targetTenantId: string, orgCode?: string) => {
    if (!masterToken) throw new Error("Nelze provést impersonaci bez přihlášení.");

    const res = await ApiClient.impersonate(activeEnv, masterToken, targetTenantId, orgCode);
    if (res.success && res.access_token) {
      setImpersonatedToken(res.access_token);
      setImpersonatedTenantId(targetTenantId);
      setTargetOrgCode(orgCode || null);

      localStorage.setItem("ava_imp_token", res.access_token);
      localStorage.setItem("ava_imp_tenant_id", targetTenantId);
      if (orgCode) localStorage.setItem("ava_imp_org_code", orgCode);
      else localStorage.removeItem("ava_imp_org_code");

      return { success: true, log: res.log };
    } else {
      return { success: false, log: res.log || "Impersonace selhala" };
    }
  };

  const clearImpersonation = () => {
    setImpersonatedToken(null);
    setImpersonatedTenantId(null);
    setTargetOrgCode(null);
    localStorage.removeItem("ava_imp_token");
    localStorage.removeItem("ava_imp_tenant_id");
    localStorage.removeItem("ava_imp_org_code");
  };

  return (
    <AuthContext.Provider
      value={{
        activeEnv,
        setActiveEnv,
        masterToken,
        impersonatedToken,
        activeToken,
        masterTenantId,
        impersonatedTenantId,
        activeTenantId,
        targetOrgCode,
        userClaims,
        expiration,
        tenantsList,
        isLoadingTenants,
        refreshTenants,
        isLoggedIn,
        isImpersonated,
        impersonate,
        clearImpersonation,
        login,
        logout,
        theme,
        toggleTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
