# Inventura API Endpointů (AVA OperationLog)

Tento dokument obsahuje kompletizační inventuru všech HTTP REST API endpointů využívaných v aplikaci **AVAOperationLog** (`api_client.py`). Endpointy jsou rozděleny podle rozhraní na **Identity Provider (IDP)** a **Data Service (DS)**.

---

## 📊 Přehledová tabulka endpointů

| # | Služba | Metoda | Endpoint | Python Funkce | Hlavní Účel |
|---|--------|--------|----------|---------------|-------------|
| 1 | **IDP** | `POST` | `/connect/token` | `fetch_token` | Získání OAuth2 Access Tokenu (Client Credentials / Password) |
| 2 | **IDP** | `POST` | `/api/v1/Tokens/impersonation` | `fetch_impersonation_token` | Získání impersonačního tokenu pro child tenanta |
| 3 | **IDP** | `GET` | `/api/v1/UserTenants` | `fetch_user_tenants` | Načtení tenantů dostupných přihlášenému uživateli |
| 4 | **IDP** | `GET` | `/api/v1/Tenants/childTenants` | `fetch_user_tenants` | Načtení podřízených (child) tenantů |
| 5 | **IDP** | `GET` | `/api/v1/Tenants` | `fetch_user_tenants` | Načtení seznamu všech dostupných tenantů |
| 6 | **DS** | `GET` | `/api/v1/OperatingLogs` | `fetch_logs_page` | Načítání a filtrování provozních logů (Operating Logs) |
| 7 | **DS** | `GET` | `/api/v1/DataSources/{source_id}` | `fetch_datasource_info` | Detail konkrétního zdroje dat (Data Source) |
| 8 | **DS** | `GET` | `/api/v1/DataSources` | `fetch_data_sources` / `fetch_all_data_sources` | Seznam a filtrování všech Data Sources |
| 9 | **DS** | `GET` | `/api/v1/DataAgents` | `fetch_data_agents` / `fetch_all_data_agents` | Seznam a filtrování všech Data Agentů |
| 10 | **DS** | `GET` | `/api/v1/SourcingData/EnqueueDataBySourceId/{source_id}` | `fetch_input_queue` (v1) | Vstupní fronta (Sourcing Data) pro konkrétní zdroj |
| 11 | **DS** | `GET` | `/api/v2/SourcingData/EnqueueData` | `fetch_input_queue` (v2) | Vstupní fronta (Sourcing Data) obecně |
| 12 | **DS** | `GET` | `/api/v2/QueryingData/GetData` | `fetch_output_queue` | Výstupní fronta (Querying Data / GetData) |
| 13 | **DS** | `GET` | `/api/v1/UsageStatistics/GetTenantsUsingApplication` | `fetch_usage_statistics` | Statistiky využití aplikace podle tenantů |
| 14 | **DS** | `GET` | `/api/v1/UsageStatistics/GetApplicationsUsedByTenants` | `fetch_applications_used_by_tenants` | Přehled aplikací používaných zadanými tenanty |
| 15 | **DS** | `GET` | `/api/v1/IntegratedApplications` | `fetch_integrated_applications` | Seznam integrovaných aplikací |
| 16 | **DS** | `GET` | `/api/v1/SmartChecks/Results/{result_id}` | `fetch_smartcheck_result_details` | Detail výsledku SmartCheck kontroly |
| 17 | **DS** | `GET` | `/api/v1/SmartChecks/Results/{result_id}/adhocReport` | `fetch_smartcheck_report` | Stažení ad-hoc reportu SmartCheck (PDF/xlsx) |
| 18 | **MSGGW** | `GET` | `/api/v1/Consumer/gRPC` | `fetch_msggw_grpc_consumers` | Seznam gRPC consumerů pro tenanta v Message Gateway |
| 19 | **MSGGW** | `GET` | `/api/v1/Consumer/gRPC/code/{code}/status` | `fetch_msggw_consumer_status_by_code` | Stav a statistiky gRPC consumera podle kódu |

---

## 🔑 1. Identity Provider (IDP) Endpointy

### 1.1 POST `/connect/token`
* **Python funkce:** [`fetch_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L32)
* **Účel:** Získání OAuth2 Bearer tokenu pro autentizaci API volání.
* **Hlavičky (Headers):**
  * `Content-Type: application/x-www-form-urlencoded`
  * `Accept: application/json`
  * `X-Tenant: {tenant_id}` *(zasílá se při nastaveném tenant_id)*

#### Parametry volané v aplikaci (Form Data):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `grant_type` | String | Typ autorizačního toku | `'client_credentials'` nebo `'password'` |
| `client_id` | String | ID klientské aplikace | `plaza-pass` (Password Grant) / `ava-monitor` (Client Credentials) |
| `client_secret` | String | Secret klientské aplikace | Konfigurováno v App / Env vars |
| `username` | String | Uživatelské jméno (při grant_type=password) | Zadáno v UI |
| `password` | String | Heslo uživatele (při grant_type=password) | Zadáno v UI |
| `tid` | String | Tenant ID | GUID tenanta |
| `scope` | String | Požadované OAuth scope (volitelné) | např. `offline_access` nebo vymezené rozsahy |

#### Další známe/podporované parametry endpointu (OAuth2 standard & IDP):
| Parametr | Typ | Popis |
|----------|-----|-------|
| `refresh_token` | String | Obnovovací token při `grant_type=refresh_token` |
| `code` | String | Autorizační kód při `grant_type=authorization_code` |
| `redirect_uri` | String | Presměrovací URI pro authorization code flow |
| `code_verifier` | String | PKCE kód pro ověření při authorization code flow |
| `acr_values` | String | Dodatečný autorizační kontext (MFA, IP restrictive policy) |

---

### 1.2 POST `/api/v1/Tokens/impersonation`
* **Python funkce:** [`fetch_impersonation_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L268)
* **Účel:** Získání impersonačního Access Tokenu pro přístup k child tenantovi v zastoupení podřízené organizace.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {master_token}`
  * `X-Tenant: {target_tenant_id}`
  * `x-api-version: 1.0` *(volitelně z definice Swaggeru)*
  * `Content-Type: application/json`
  * `Accept: application/json`

#### Struktura požadavku v aplikaci vs. Swagger Schema:
Ve Swagger UI je objekt `parameters` definován jako dynamický slovník (`Dictionary<string, string>`), kde Swagger zobrazuje zástupné klíče `additionalProp1`, `additionalProp2` atd. IDP server jako Tenant ID očekává klíč `"tid"`.

**Tělo požadavku (JSON Body v aplikaci):**
```json
{
  "grantType": "password",
  "parameters": {
    "tid": "<target_tenant_id>",
    "orgs_codes": "<owner_org_code>"
  }
}
```

**Kompletní DTO schema (dle Swagger OpenAPI):**
```json
{
  "grantType": "password",
  "address": "string",
  "clientId": "string",
  "clientSecret": "string",
  "clientAssertion": { "type": "string", "value": "string" },
  "clientCredentialStyle": "AuthorizationHeader",
  "authorizationHeaderStyle": "Rfc6749",
  "parameters": {
    "tid": "<target_tenant_id>",
    "orgs_codes": "<owner_org_code>"
  },
  "version": "string",
  "versionPolicy": "RequestVersionOrLower",
  "content": {},
  "method": { "method": "string" },
  "requestUri": "string"
}
```

#### Parametry volané v aplikaci:
| Parametr | Typ | Uložení | Popis |
|----------|-----|---------|-------|
| `grantType` | String | JSON Body | Typ grantu (hodnota `'password'`) |
| `parameters.tid` | String | JSON Body (`parameters` dict) | Target Tenant ID (GUID) |
| `parameters.orgs_codes` | String | JSON Body (`parameters` dict) | Kód organizace (`ownerOrgCode`, např. `31415629|CZ`) |
| `X-Tenant` | String | HTTP Header | Target Tenant ID (GUID) |

#### Další známé / podporované parametry endpointu (z DTO a IDP):
| Parametr | Typ | Popis |
|----------|-----|-------|
| `parameters.userId` | String | ID konkrétního uživatele k impersonaci |
| `parameters.scope` | String | Omezení rozsahu působnosti impersonovaného tokenu |
| `parameters.expirationSeconds` | Integer | Požadovaná doba platnosti tokenu v sekundách |
| `grantType` | String | Typ grantu |
| `clientId` / `clientSecret` | String | Klientské pověření (pokud není předáno v auth headeru) |

---

### 1.3 GET `/api/v1/UserTenants`
* **Python funkce:** [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L362)
* **Účel:** Získání seznamu tenantů, k nimž má přihlášený uživatel přímá oprávnění.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `Limit` | Integer | Počet záznamů na stránku | `1000` |
| `Offset` | Integer | Posun pro stránkování | `0`, `1000`, `2000`... |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `search` | String | Vyhledávací řetězec (název / kód tenanta) |
| `sortBy` | String | Pole pro řazení |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |
| `includeDisabled` | Boolean | Příznak pro zahrnutí neaktivních/deaktivovaných tenantů |

---

### 1.4 GET `/api/v1/Tenants/childTenants`
* **Python funkce:** [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L362)
* **Účel:** Získání podřízených tenantů v hierarchii.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `Limit` | Integer | Počet záznamů na stránku | `1000` |
| `Offset` | Integer | Posun pro stránkování | `0`, `1000`... |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `parentId` | String | Filtr podle ID nadřazeného tenanta |
| `search` | String | Vyhledávací řetězec |
| `sortBy` | String | Řazení výsledků |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |

---

### 1.5 GET `/api/v1/Tenants`
* **Python funkce:** [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L362)
* **Účel:** Získání celkového přehledu tenantů.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `Limit` | Integer | Stránkování - počet | `1000` |
| `Offset` | Integer | Stránkování - posun | `0`, `1000`... |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `includeDeleted` | Boolean | Zahrnout smazané tenanty |
| `search` | String | Vyhledávání dle textu |
| `sortBy` | String | Řazení výsledků |
| `sortOrder` | String | Směr řazení |

---

## 🛠️ 2. Data Service (DS) Endpointy

### 2.1 GET `/api/v1/OperatingLogs`
* **Python funkce:** [`fetch_logs_page()`](file:///c:/MM/Src/OperationLog/api_client.py#L82)
* **Účel:** Dotazování a filtr provozních logů integrací.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `limit` | Integer | Počet logů na stránku | `50`, `100`, `1000` |
| `offset` | Integer | Posun ve stránkování | `0`, `50`... |
| `OperationId` | String | ID operace | GUID operace |
| `AgentCode` | String | Kód agenta | `Agent-01` |
| `AgentId` | String | ID agenta | GUID agenta |
| `SourceId` | String | ID datového zdroje | GUID zdroje |
| `OperationScope` | String | Rozsah operace | Název/kod scope |
| `SeverityLevel` | String | Úroveň závažnosti logu | `Information`, `Warning`, `Error`, `Critical` |
| `IncludeSystemLevel` | String | Zahrnout systémové logy | `'true'` / `'false'` |
| `createdFrom` | String | Počáteční datum a čas (UTC ISO-8601) | `2026-08-01T00:00:00Z` |
| `createdTo` | String | Koncové datum a čas (UTC ISO-8601) | `2026-08-27T23:59:59Z` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `applicationCode` | String | Filtr podle kódu integrované aplikace |
| `mandantCode` | String | Filtr podle kódu mandanta |
| `correlationId` | String | Korelační ID napříč službami |
| `statusCode` | String | HTTP nebo doménový stavový kód |
| `sortBy` | String | Řazení (např. `createdTimestamp`) |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |

---

### 2.2 GET `/api/v1/DataSources/{source_id}`
* **Python funkce:** [`fetch_datasource_info()`](file:///c:/MM/Src/OperationLog/api_client.py#L123)
* **Účel:** Získání podrobných informací o konkrétním zdroji dat.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci:
| Parametr | Typ | Uložení | Popis | Příklad |
|----------|-----|---------|-------|---------|
| `source_id` | String | Path Param | ID zdroje dat | `d4e5f6...` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `includeDeleted` | Boolean | Vrátit i smazaný zdroj dat |
| `includeAgentDetails` | Boolean | Připojit kompletní objekt příslušného Data Agenta |

---

### 2.3 GET `/api/v1/DataSources`
* **Python funkce:** [`fetch_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L433), [`fetch_all_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L479)
* **Účel:** Načtení seznamu všech Data Sources (zdrojů dat) v daném tenantovi.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `Limit` | Integer | Počet položek na stránku | `500` |
| `Offset` | Integer | Posun pro stránkování | `0`, `500`... |
| `AgentId` | String | Filtr dle ID příslušného Data Agenta | GUID agenta |
| `ApplicationCode` | String | Filtr dle kódu integrované aplikace | `HELIOS_IN` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `customCode` | String | Uživatelský kód zdroje dat |
| `search` | String | Vyhledávací řetězec v názvu nebo kódu zdroje |
| `includeDeleted` | Boolean | Zahrnout smazané zdroje |
| `sortBy` | String | Pole pro řazení výsledků |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |

---

### 2.4 GET `/api/v1/DataAgents`
* **Python funkce:** [`fetch_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L408), [`fetch_all_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L456)
* **Účel:** Načtení seznamu registrovaných Data Agentů (integračních konektorů).
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `Limit` | Integer | Počet položek na stránku | `500` |
| `Offset` | Integer | Posun pro stránkování | `0`, `500`... |
| `ProviderCode` | String | Kód poskytovatele agenta | `ASOL` |
| `CustomCode` | String | Uživatelský kód agenta | `CUSTOM_01` |
| `includeDeleted` | String | Příznak pro zahrnutí smazaných agentů | `'true'` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `search` | String | Vyhledávání dle názvu nebo kódu agenta |
| `status` | String | Filtr stavu agenta (`Active`, `Inactive`, `Offline`) |
| `sortBy` | String | Pole pro řazení |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |

---

### 2.5 GET `/api/v1/SourcingData/EnqueueDataBySourceId/{source_id}`
* **Python funkce:** [`fetch_input_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L136) (pro verze `v1`)
* **Účel:** Získání dat z Vstupní fronty (Sourcing Data) vázaných na konkrétní Data Source ID.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci:
| Parametr | Typ | Uložení | Popis | Příklad |
|----------|-----|---------|-------|---------|
| `source_id` | String | Path Param | ID zdroje dat | `guid-source-id` |
| `limit` | Integer | Query Param | Počet položek | `100` |
| `offset` | Integer | Query Param | Posun | `0` |
| `agentId` | String | Query Param | ID agenta | GUID |
| `clientId` | String | Query Param | ID klienta | GUID / string |
| `operationId` | String | Query Param | ID operace | GUID |
| `createdFrom` | String | Query Param | Od data a času (UTC ISO-8601) | `2026-08-01T00:00:00Z` |
| `createdTo` | String | Query Param | Do data a času (UTC ISO-8601) | `2026-08-27T23:59:59Z` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `status` | String | Stav zprávy ve frontě (`Enqueued`, `Processed`, `Failed`) |
| `sortBy` | String | Řazení záznamů |
| `sortOrder` | String | Směr řazení |

---

### 2.6 GET `/api/v2/SourcingData/EnqueueData`
* **Python funkce:** [`fetch_input_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L136) (pro verze `v2`)
* **Účel:** Získání dat z Vstupní fronty (Sourcing Data) v2 API (globální nebo s filtrem sourceId v query).
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `limit` | Integer | Počet položek | `100` |
| `offset` | Integer | Posun | `0` |
| `agentId` | String | ID agenta | GUID |
| `clientId` | String | ID klienta | GUID |
| `operationId` | String | ID operace | GUID |
| `createdFrom` | String | Od data a času (UTC ISO-8601) | `2026-08-01T00:00:00Z` |
| `createdTo` | String | Do data a času (UTC ISO-8601) | `2026-08-27T23:59:59Z` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `sourceId` | String | ID zdroje dat (v2 předává `sourceId` v Query na rozdíl od v1 path paramu) |
| `mandantCode` | String | Filtr podle kódu mandanta |
| `status` | String | Stav položky ve frontě |
| `sortBy` | String | Řazení výsledků |
| `sortOrder` | String | Směr řazení |

---

### 2.7 GET `/api/v2/QueryingData/GetData`
* **Python funkce:** [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L185)
* **Účel:** Získání zpracovaných záznamů z Výstupní fronty (Querying Data / GetData).
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `limit` | Integer | Počet položek | `100` |
| `offset` | Integer | Posun | `0` |
| `modelId` | String | ID datového modelu | GUID / String |
| `sourceId` | String | ID datového zdroje | GUID |
| `mandantCode` | String | Kód mandanta | `MANDANT_CZ` |
| `modifiedFrom` | String | Od data změny (UTC ISO-8601) | `2026-08-01T00:00:00Z` |
| `modifiedTo` | String | Do data změny (UTC ISO-8601) | `2026-08-27T23:59:59Z` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `createdFrom` | String | Počáteční datum vytvoření zprávy |
| `createdTo` | String | Koncové datum vytvoření zprávy |
| `agentId` | String | ID zpracovatelského agenta |
| `status` | String | Stav záznamu (`Ready`, `Consumed`, `Archived`) |
| `sortBy` | String | Pole pro řazení výsledků |
| `sortOrder` | String | Směr řazení (`asc` / `desc`) |

---

### 2.8 GET `/api/v1/UsageStatistics/GetTenantsUsingApplication`
* **Python funkce:** [`fetch_usage_statistics()`](file:///c:/MM/Src/OperationLog/api_client.py#L224)
* **Účel:** Získání přehledu a počtu tenantů používajících zadanou aplikaci.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `applicationCode` | String | Kód integrované aplikace | `AVA_MONITOR`, `HELIOS_ERP` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `includeInactive` | Boolean | Zahrnout neaktivní uživatele/tenanty |
| `dateFrom` | String | Počáteční datum pro vyhodnocení aktivity |
| `dateTo` | String | Koncové datum pro vyhodnocení aktivity |

---

### 2.9 GET `/api/v1/UsageStatistics/GetApplicationsUsedByTenants`
* **Python funkce:** [`fetch_applications_used_by_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L251)
* **Účel:** Získání přehledu aplikací používaných konkrétním seznamem tenantů vč. stavu SmartChecků.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `includeSmartCheckStatus` | String | Zahrnout stavy SmartCheck kontroly | `'true'` / `'false'` |
| `tenantIds` | Array / List | Seznam tenant ID ke kontrole | `['tid-1', 'tid-2']` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `applicationCode` | String | Omezení pouze na konkrétní aplikaci |
| `dateFrom` | String | Filtrování aktivních aplikací od určitého data |
| `dateTo` | String | Filtrování aktivních aplikací do určitého data |

---

### 2.10 GET `/api/v1/IntegratedApplications`
* **Python funkce:** [`fetch_integrated_applications()`](file:///c:/MM/Src/OperationLog/api_client.py#L239)
* **Účel:** Získání seznamu všech zaintegrovaných aplikací v systému Avaplace.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Hodnota v aplikaci |
|----------|-----|-------|-------------------------------|
| `limit` | Integer | Maximální počet vrácených záznamů | `333` (naevidováno natvrdo v aplikaci) |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `offset` | Integer | Posun pro stránkování |
| `search` | String | Vyhledávací text pro filtrování aplikací |
| `includeInactive` | Boolean | Příznak pro vrácení neaktivních aplikací |

---

### 2.11 GET `/api/v1/SmartChecks/Results/{result_id}`
* **Python funkce:** [`fetch_smartcheck_result_details()`](file:///c:/MM/Src/OperationLog/api_client.py#L344)
* **Účel:** Načtení podrobných výsledků konkrétního běhu SmartCheck kontroly.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci:
| Parametr | Typ | Uložení | Popis | Příklad |
|----------|-----|---------|-------|---------|
| `result_id` | String | Path Param | ID výsledku SmartCheck | GUID |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `includeDetails` | Boolean | Vztahuje se k vrácení podrobného stromu chyb a dílčích kontrol |

---

### 2.12 GET `/api/v1/SmartChecks/Results/{result_id}/adhocReport`
* **Python funkce:** [`fetch_smartcheck_report()`](file:///c:/MM/Src/OperationLog/api_client.py#L323)
* **Účel:** Stažení generovaného ad-hoc reportu (dokumentu / binárního souboru) k výstupům SmartChecku.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: */*`

#### Parametry volané v aplikaci:
| Parametr | Typ | Uložení | Popis | Příklad |
|----------|-----|---------|-------|---------|
| `result_id` | String | Path Param | ID výsledku SmartCheck | GUID |
| `groupCode` | String | Query Param | Kód skupiny kontroly (volitelné) | `GROUP_FIN` |

#### Další známe/podporované parametry endpointu:
| Parametr | Typ | Popis |
|----------|-----|-------|
| `format` | String | Výstupní formát reportu (`pdf`, `xlsx`, `html`) |

---

## 📌 Shrnutí architektonického předávání parametrů

1. **Autentizace & Tenant:**
   - **IDP Endpoints:** Využívají autentizační údaje v těle (Form Data nebo JSON payload).
   - **Data Service Endpoints:** Vyžadují HTTP hlavičku `Authorization: Bearer <Token>` a hlavičku `X-Tenant: <Tenant_ID>`.

2. **Časová razítka (Date/Time Filters):**
   - Všechny datové endpointy (`OperatingLogs`, `SourcingData`, `QueryingData`) převádějí lokální čas uživatele (např. `Europe/Prague`) do formátu **UTC ISO-8601** (`YYYY-MM-DDTHH:MM:SZ`).

3. **Stránkování:**
   - Standardně probíhá pomocí dvojice Query parametrů `limit` (nebo `Limit`) a `offset` (nebo `Offset`).
