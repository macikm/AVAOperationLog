export interface AuthCredentials {
  environment: string;
  auth_mode: "password" | "client_credentials" | "sso";
  username?: string;
  password?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
  sso_token?: string;
}

export interface UserClaims {
  sub?: string;
  unique_name?: string;
  email?: string;
  role?: string | string[];
  roles?: string | string[];
  tid?: string;
  client_id?: string;
  exp?: number;
  [key: string]: any;
}

export interface ExpirationInfo {
  exp_timestamp?: number;
  remaining_seconds: number;
  is_expired: boolean;
  is_expiring: boolean;
  formatted: string;
}

export interface TenantItem {
  id: string;
  name: string;
  ownerOrgCode?: string;
  orgs?: string[];
}

export class ApiClient {
  private static getHeaders(token?: string, tenantId?: string): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (tenantId) {
      headers["X-Tenant"] = tenantId;
    }
    return headers;
  }

  static async getEnvironments() {
    const res = await fetch("/api/config/environments");
    if (!res.ok) throw new Error("Chyba při načítání prostředí");
    return res.json();
  }

  static async login(creds: AuthCredentials) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Přihlášení selhalo");
    }
    return res.json();
  }

  static async impersonate(env: string, masterToken: string, targetTenantId: string, targetOrgCode?: string) {
    const res = await fetch("/api/auth/impersonate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${masterToken}`,
      },
      body: JSON.stringify({
        environment: env,
        target_tenant_id: targetTenantId,
        target_org_code: targetOrgCode,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Impersonace selhala");
    }
    return res.json();
  }

  static async getTenants(env: string, token: string, tenantId: string): Promise<TenantItem[]> {
    const res = await fetch(`/api/tenants?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Nepodařilo se načíst seznam tenantů");
    const data = await res.json();
    return data.items || [];
  }

  // --- LOGS ---
  static async getLogs(env: string, token: string, tenantId: string, params: Record<string, any>) {
    const query = new URLSearchParams({ env });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    const res = await fetch(`/api/logs?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Načtení provozních logů selhalo");
    }
    return res.json();
  }

  // --- INPUT QUEUE ---
  static async getInputQueue(env: string, token: string, tenantId: string, params: Record<string, any>) {
    const query = new URLSearchParams({ env });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    const res = await fetch(`/api/input-queue?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Načtení vstupní fronty selhalo");
    }
    return res.json();
  }

  // --- OUTPUT QUEUE ---
  static async getOutputQueue(env: string, token: string, tenantId: string, params: Record<string, any>) {
    const query = new URLSearchParams({ env });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    const res = await fetch(`/api/output-queue?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Načtení výstupní fronty selhalo");
    }
    return res.json();
  }

  static async getRecordPayload(env: string, token: string, tenantId: string, params: Record<string, any>) {
    const query = new URLSearchParams({ env });
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    const res = await fetch(`/api/output-queue/payload?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení těla datového záznamu selhalo");
    return res.json();
  }

  // --- DATA SOURCES ---
  static async getDataSources(env: string, token: string, tenantId: string, params: Record<string, any> = {}) {
    const query = new URLSearchParams({ env, ...params });
    const res = await fetch(`/api/data-sources?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení Data Sources selhalo");
    return res.json();
  }

  static async getDatasourceInfo(env: string, token: string, tenantId: string, sourceId: string) {
    const res = await fetch(`/api/data-sources/${encodeURIComponent(sourceId)}/info?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení detailu Data Source selhalo");
    return res.json();
  }

  static async getTransformations(env: string, token: string, tenantId: string, sourceId: string, params: Record<string, any> = {}) {
    const query = new URLSearchParams({ env, ...params });
    const res = await fetch(`/api/data-sources/${encodeURIComponent(sourceId)}/transformations?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení transformací selhalo");
    return res.json();
  }

  // --- DATA AGENTS ---
  static async getDataAgents(env: string, token: string, tenantId: string, params: Record<string, any> = {}) {
    const query = new URLSearchParams({ env, ...params });
    const res = await fetch(`/api/data-agents?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení Data Agentů selhalo");
    return res.json();
  }

  static async getAgentConsumers(env: string, token: string, tenantId: string) {
    const res = await fetch(`/api/data-agents/consumers?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení stavu consumerů agentů selhalo");
    return res.json();
  }

  // --- gRPC CONSUMERS (MESSAGE GATEWAY) ---
  static async getGrpcConsumers(env: string, token: string, tenantId: string) {
    const res = await fetch(`/api/grpc-consumers?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení gRPC consumerů selhalo");
    return res.json();
  }

  static async getGrpcConsumerStatus(env: string, token: string, tenantId: string, code: string) {
    const res = await fetch(`/api/grpc-consumers/status?code=${encodeURIComponent(code)}&env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení stavu gRPC consumera selhalo");
    return res.json();
  }

  // --- WEBHOOKS ---
  static async getWebhooks(env: string, token: string, tenantId: string) {
    const res = await fetch(`/api/webhooks?env=${encodeURIComponent(env)}&fetch_statuses=true`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení webhooků selhalo");
    return res.json();
  }

  static async getWebhookDetail(env: string, token: string, tenantId: string, code?: string, id?: string) {
    const query = new URLSearchParams({ env });
    if (code) query.append("code", code);
    if (id) query.append("consumer_id", id);
    const res = await fetch(`/api/webhooks/detail?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení detailu webhooku selhalo");
    return res.json();
  }

  static async getWebhookStatus(env: string, token: string, tenantId: string, code?: string, id?: string) {
    const query = new URLSearchParams({ env });
    if (code) query.append("code", code);
    if (id) query.append("consumer_id", id);
    const res = await fetch(`/api/webhooks/status?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení stavu webhooku selhalo");
    return res.json();
  }

  static async getWebhookRouting(env: string, token: string, tenantId: string) {
    const res = await fetch(`/api/webhooks/routing?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení směrování zpráv selhalo");
    return res.json();
  }

  // --- TENANT STATISTICS ---
  static async getIntegratedApplications(env: string, token: string, tenantId: string) {
    const res = await fetch(`/api/usage-statistics/applications?env=${encodeURIComponent(env)}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení integrovaných aplikací selhalo");
    return res.json();
  }

  static async getTenantsUsingApplication(env: string, token: string, tenantId: string, appCode?: string) {
    const query = new URLSearchParams({ env });
    if (appCode) query.append("application_code", appCode);
    const res = await fetch(`/api/usage-statistics/tenants-using-application?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení využití aplikací selhalo");
    return res.json();
  }

  static async getApplicationsUsedByTenants(env: string, token: string, tenantId: string, tenantIds?: string[], includeSmartCheck: boolean = true) {
    const res = await fetch("/api/usage-statistics/applications-used-by-tenants", {
      method: "POST",
      headers: this.getHeaders(token, tenantId),
      body: JSON.stringify({
        env,
        tenant_ids: tenantIds && tenantIds.length > 0 ? tenantIds : null,
        include_smart_check_status: includeSmartCheck,
      }),
    });
    if (!res.ok) throw new Error("Načtení aplikací používaných tenanty selhalo");
    return res.json();
  }

  static async getSmartCheckDetails(
    env: string,
    token: string,
    tenantId: string,
    resultId: string,
    targetTenantId?: string,
    ownerOrgCode?: string
  ) {
    const query = new URLSearchParams({ env, result_id: resultId });
    if (targetTenantId) query.append("tenant_id", targetTenantId);
    if (ownerOrgCode) query.append("owner_org_code", ownerOrgCode);
    const res = await fetch(`/api/smartcheck/details?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení detailu SmartCheck selhalo");
    return res.json();
  }

  static async getSmartCheckReport(
    env: string,
    token: string,
    tenantId: string,
    resultId: string,
    targetTenantId?: string,
    groupCode?: string,
    ownerOrgCode?: string
  ) {
    const query = new URLSearchParams({ env, result_id: resultId });
    if (targetTenantId) query.append("tenant_id", targetTenantId);
    if (groupCode) query.append("group_code", groupCode);
    if (ownerOrgCode) query.append("owner_org_code", ownerOrgCode);
    const res = await fetch(`/api/smartcheck/report?${query.toString()}`, {
      headers: this.getHeaders(token, tenantId),
    });
    if (!res.ok) throw new Error("Načtení reportu SmartCheck selhalo");
    return res.text();
  }
}
