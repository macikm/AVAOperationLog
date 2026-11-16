# Inventura API Endpointů (AVA Monitor / AVAOperationLog)

Tento dokument obsahuje kompletní inventuru všech HTTP REST API endpointů využívaných v aplikaci **AVA Monitor** ([`api_client.py`](file:///c:/MM/Src/OperationLog/api_client.py)). Endpointy jsou rozděleny podle jednotlivých mikroslužeb a rozhraní platformy AVA:
1. **Identity Provider (IDP)** – autentizace, tokeny, impersonace, správa tenantů
2. **Data Service (DS)** – provozní logy, agenti, zdroje, vstupní/výstupní fronty, statistiky, SmartChecks
3. **Message Gateway (MSGGW)** – gRPC a Webhook consumery, RabbitMQ fronty, směrování a typy zpráv

---

## 📊 Přehledová tabulka všech endpointů

| # | Služba | Metoda | Endpoint | Python Funkce | Hlavní Účel |
|---|--------|--------|----------|---------------|-------------|
| **1** | **IDP** | `POST` | `/connect/token` | [`fetch_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L65) | Získání OAuth2 Access Tokenu (Client Credentials / Password) |
| **2** | **IDP** | `POST` | `/api/v1/Tokens/impersonation` | [`fetch_impersonation_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L360) | Získání impersonačního tokenu pro child tenanta |
| **3** | **IDP** | `GET` | `/api/v1/UserTenants` | [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L472) | Načtení tenantů s přímým oprávněním přihlášeného uživatele |
| **4** | **IDP** | `GET` | `/api/v1/Tenants/childTenants` | [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L472) | Načtení podřízených (child) tenantů v hierarchii |
| **5** | **IDP** | `GET` | `/api/v1/Tenants` | [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L472) | Načtení celkového seznamu všech dostupných tenantů |
| **6** | **DS** | `GET` | `/api/v1/OperatingLogs` | [`fetch_logs_page()`](file:///c:/MM/Src/OperationLog/api_client.py#L124) | Načítání a filtrování provozních logů (Operating Logs) |
| **7** | **DS** | `GET` | `/api/v1/DataSources/{source_id}` | [`fetch_datasource_info()`](file:///c:/MM/Src/OperationLog/api_client.py#L165) | Detail konkrétního datového zdroje (Data Source) |
| **8** | **DS** | `GET` | `/api/v1/DataSources` | [`fetch_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L560) / [`fetch_all_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L606) | Seznam a filtrování všech Data Sources |
| **9** | **DS** | `GET` | `/api/v1/DataAgents` | [`fetch_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L535) / [`fetch_all_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L583) | Seznam a filtrování všech Data Agentů |
| **10** | **DS** | `GET` | `/api/v1/SourcingData/EnqueueDataBySourceId/{source_id}` | [`fetch_input_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L178) (`v1`) | Vstupní fronta (SourcingData) pro konkrétní zdroj (legacy v1) |
| **11** | **DS** | `GET` | `/api/v2/SourcingData/EnqueueData` | [`fetch_input_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L178) (`v2`) | Vstupní fronta (SourcingData) obecně (moderní v2) |
| **12** | **DS** | `GET` | `/api/v2/QueryingData/GetData` | [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L229) (`v2`) | Výstupní fronta (QueryingData) dle Data Modelu (v2 standard) |
| **13** | **DS** | `GET` | `/api/v1/QueryingData/FindDataByModelId/{modelId}` | [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L229) (`v1`) | Výstupní fronta dle Data Modelu pro Legacy consumery (v1) |
| **14** | **DS** | `GET` | `/api/v2/QueryingData/GetData/{resultId}` | [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L229) (`result_id v2`) | Výstupní položky konkrétního zpracovaného balíčku (v2) |
| **15** | **DS** | `GET` | `/api/v1/QueryingData/ProcessedDataResults/{resultId}/Items` | [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L229) (`result_id v1`) | Výstupní položky zpracovaného balíčku pro Legacy režim (v1) |
| **16** | **DS** | `GET` | `/api/v1/UsageStatistics/GetTenantsUsingApplication` | [`fetch_usage_statistics()`](file:///c:/MM/Src/OperationLog/api_client.py#L316) | Statistiky využití aplikace podle tenantů |
| **17** | **DS** | `GET` | `/api/v1/UsageStatistics/GetApplicationsUsedByTenants` | [`fetch_applications_used_by_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L343) | Přehled aplikací používaných zadanými tenanty |
| **18** | **DS** | `GET` | `/api/v1/IntegratedApplications` | [`fetch_integrated_applications()`](file:///c:/MM/Src/OperationLog/api_client.py#L331) | Seznam zaintegrovaných aplikací na platformě |
| **19** | **DS** | `GET` | `/api/v1/SmartChecks/Results/{result_id}` | [`fetch_smartcheck_result_details()`](file:///c:/MM/Src/OperationLog/api_client.py#L454) | Detail výsledku kontroly integrity (SmartCheck) |
| **20** | **DS** | `GET` | `/api/v1/SmartChecks/Results/{result_id}/adhocReport` | [`fetch_smartcheck_report()`](file:///c:/MM/Src/OperationLog/api_client.py#L433) | Stažení vygenerovaného ad-hoc reportu SmartChecku |
| **21** | **MSGGW** | `GET` | `/api/v1/Consumer/gRPC` | [`fetch_msggw_grpc_consumers()`](file:///c:/MM/Src/OperationLog/api_client.py#L629) | Seznam registrovaných gRPC consumerů v Message Gateway |
| **22** | **MSGGW** | `GET` | `/api/v1/Consumer/gRPC/code/{code}/status` | [`fetch_msggw_consumer_status_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L651) | Stav a fronta konkrétního gRPC consumera dle kódu |
| **23** | **MSGGW** | `GET` | `/api/v1/Consumer/webhook` | [`fetch_msggw_webhook_consumers()`](file:///c:/MM/Src/OperationLog/api_client.py#L691) | Seznam všech registrovaných Webhook consumerů |
| **24** | **MSGGW** | `GET` | `/api/v1/Consumer/webhook/code/{code}` | [`fetch_msggw_webhook_consumer_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L713) | Detailní konfigurace webhooku (filtry, modely, URL) |
| **25** | **MSGGW** | `GET` | `/api/v1/Consumer/webhook/code/{code}/status` | [`fetch_msggw_webhook_consumer_status_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L733) | Živý stav a RabbitMQ statistiky webhooku dle kódu |
| **26** | **MSGGW** | `GET` | `/api/v1/Consumer/webhook/{id}/status` | [`fetch_msggw_webhook_consumer_status_by_id()`](file:///c:/MM/Src/OperationLog/api_client.py#L773) | Živý stav a RabbitMQ statistiky webhooku dle GUID |
| **27** | **MSGGW** | `GET` | `/api/v1/Consumer/status` | [`fetch_msggw_all_consumers_statuses()`](file:///c:/MM/Src/OperationLog/api_client.py#L868) | Globální přehled stavů všech consumerů platformy |
| **28** | **MSGGW** | `GET` | `/api/v1/MessageRouting/MessageType` | [`fetch_msggw_message_types()`](file:///c:/MM/Src/OperationLog/api_client.py#L882) | Katalog publikovaných typů zpráv (událostí) |
| **29** | **MSGGW** | `GET` | `/api/v1/MessageRouting` | [`fetch_msggw_message_routings()`](file:///c:/MM/Src/OperationLog/api_client.py#L897) | Kompletní konfigurace směrování zpráv (Exchanges & Routing Keys) |

---

## 🌐 Základní bázové URL adresy (Routing Služeb)

Aplikace dynamicky odvozuje bázové adresy jednotlivých mikroslužeb na základě zadané URL DataService v konfiguraci:
* **Identity Provider (IDP):** `https://identity.{domain}` nebo zadaná adresa IDP
* **Data Service (DS):** `https://{domain}/api/asol/ds` (z parametru `api_url` odříznutím cesty `/api/v1/OperatingLogs`)
* **Message Gateway (MSGGW):** `https://{domain}/api/asol/msggw` (z `api_url` nahrazením segmentu `/api/asol/ds` za `/api/asol/msggw`)

---

## 🔑 1. Identity Provider (IDP) Endpointy

### 1.1 POST `/connect/token`
* **Python funkce:** [`fetch_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L65)
* **Účel:** Získání OAuth2 Bearer tokenu pro autentizaci všech následných API volání.
* **Hlavičky (Headers):**
  * `Content-Type: application/x-www-form-urlencoded`
  * `Accept: application/json`
  * `X-Tenant: {tenant_id}` *(zasílá se při zadaném ID tenanta)*

#### Parametry v aplikaci (Form Data):
| Parametr | Typ | Popis | Příklad v aplikaci |
|----------|-----|-------|--------------------|
| `grant_type` | String | Typ autorizačního toku | `'client_credentials'` nebo `'password'` |
| `client_id` | String | ID klientské aplikace | `plaza-pass` / `ava-monitor` |
| `client_secret` | String | Secret klientské aplikace | ze vstupu uživatele / konfigurace |
| `username` | String | Uživatelské jméno (pro password grant) | `martin.macko@asol.cz` |
| `password` | String | Heslo uživatele (pro password grant) | ze vstupu uživatele |
| `tid` | String | Tenant ID | GUID tenanta |
| `scope` | String | Požadovaný OAuth scope | např. `offline_access` |

---

### 1.2 POST `/api/v1/Tokens/impersonation`
* **Python funkce:** [`fetch_impersonation_token()`](file:///c:/MM/Src/OperationLog/api_client.py#L360)
* **Účel:** Získání impersonačního tokenu pro přepnutí do kontextu child tenanta.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {master_token}`
  * `X-Tenant: {target_tenant_id}`
  * `Content-Type: application/json`
  * `Accept: application/json`

#### Tělo požadavku (JSON Body):
```json
{
  "grantType": "password",
  "parameters": {
    "tid": "<target_tenant_id>",
    "orgs_codes": "<owner_org_code>"
  }
}
```

---

### 1.3 GET `/api/v1/UserTenants`, `/api/v1/Tenants/childTenants`, `/api/v1/Tenants`
* **Python funkce:** [`fetch_user_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L472)
* **Účel:** Získání hierarchie a seznamu tenantů, ke kterým má uživatel přístup (s automatickým stránkováním po 1000 položkách).
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`
* **Query parametry:** `Limit=1000`, `Offset={offset}`

---

## 🛠️ 2. Data Service (DS) Endpointy

### 2.1 GET `/api/v1/OperatingLogs`
* **Python funkce:** [`fetch_logs_page()`](file:///c:/MM/Src/OperationLog/api_client.py#L124)
* **Účel:** Dotazování a filtrování záznamů provozního logu.
* **Hlavičky (Headers):**
  * `Authorization: Bearer {token}`
  * `X-Tenant: {tenant_id}`
  * `Accept: application/json`

#### Parametry volané v aplikaci (Query Params):
| Parametr | Typ | Popis | Příklad / Výchozí hodnota |
|----------|-----|-------|----------------------------|
| `limit` | Integer | Počet záznamů na stránku | `50`, `100`, `1000` |
| `offset` | Integer | Posun stránkování | `0`, `100`... |
| `OperationId` | String | ID konkrétní operace | GUID |
| `AgentCode` | String | Kód agenta | `ASOLEU-EKON-...` |
| `AgentId` | String | ID agenta | GUID |
| `SourceId` | String | ID datového zdroje | GUID |
| `OperationScope` | String | Rozsah operace | např. `PublishData`, `ConsumeData` |
| `SeverityLevel` | String | Filtrování závažnosti | `Information`, `Warning`, `Error` |
| `IncludeSystemLevel` | String | Zahrnout systémové záznamy | `'true'` / `'false'` |
| `createdFrom` | String | Počátek intervalu (UTC ISO-8601) | `2026-11-01T00:00:00Z` |
| `createdTo` | String | Konec intervalu (UTC ISO-8601) | `2026-11-09T23:59:59Z` |

---

### 2.2 GET `/api/v1/DataSources/{source_id}` a `/api/v1/DataSources`
* **Python funkce:** [`fetch_datasource_info()`](file:///c:/MM/Src/OperationLog/api_client.py#L165), [`fetch_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L560), [`fetch_all_data_sources()`](file:///c:/MM/Src/OperationLog/api_client.py#L606)
* **Účel:** Získání detailních metadat o zdrojích dat (včetně `consumerSettings`, `useIntegrationProfile`, `clientId` a `applicationCode`).

---

### 2.3 GET `/api/v1/DataAgents`
* **Python funkce:** [`fetch_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L535), [`fetch_all_data_agents()`](file:///c:/MM/Src/OperationLog/api_client.py#L583)
* **Účel:** Načtení registrovaných Data Agentů (kódy, přístupová úroveň, provider kódy).

---

### 2.4 Vstupní fronta (SourcingData) – v1 a v2
* **Python funkce:** [`fetch_input_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L178)
* **Endpointy:**
  * **v1:** `GET /api/v1/SourcingData/EnqueueDataBySourceId/{source_id}` (vyžaduje `source_id` v URL)
  * **v2:** `GET /api/v2/SourcingData/EnqueueData` (globální, podporuje `sourceId` v query)
* **Query parametry:** `limit`, `offset`, `agentId`, `clientId`, `operationId`, `createdFrom`, `createdTo`

---

### 2.5 Výstupní fronta (QueryingData) – v1, v2 a ResultId
* **Python funkce:** [`fetch_output_queue()`](file:///c:/MM/Src/OperationLog/api_client.py#L229)
* **Endpointy:**
  * **v2 (Standardní dle Data Modelu):** `GET /api/v2/QueryingData/GetData`
    * Parametry: `ModelId`, `Limit`, `Offset`, `clientId`, `SourceId` (consumer), `PublisherSourceId`, `operationId`, `IncludeDeleted`, `MandantCode`, `ModifiedFrom`, `ModifiedTo`
  * **v1 (Legacy dle Data Modelu):** `GET /api/v1/QueryingData/FindDataByModelId/{modelId}`
    * Parametry: `selfSourceId` (povinné ID consumera), `sourceId` (volitelné ID publishera), `Limit`, `Offset`, `IncludeDeleted`, `MandantCode`
  * **v2 (Dle ResultId / QueueItemId):** `GET /api/v2/QueryingData/GetData/{resultId}`
  * **v1 (Dle ResultId položky):** `GET /api/v1/QueryingData/ProcessedDataResults/{resultId}/Items`

---

### 2.6 Statistiky & SmartChecks
* **`GET /api/v1/UsageStatistics/GetTenantsUsingApplication`** ([`fetch_usage_statistics()`](file:///c:/MM/Src/OperationLog/api_client.py#L316)): Počet a seznam tenantů využívajících aplikaci.
* **`GET /api/v1/IntegratedApplications`** ([`fetch_integrated_applications()`](file:///c:/MM/Src/OperationLog/api_client.py#L331)): Katalog všech integrovaných aplikací (`limit=333`).
* **`GET /api/v1/UsageStatistics/GetApplicationsUsedByTenants`** ([`fetch_applications_used_by_tenants()`](file:///c:/MM/Src/OperationLog/api_client.py#L343)): Přehled aplikací se stavy SmartChecku.
* **`GET /api/v1/SmartChecks/Results/{result_id}`** ([`fetch_smartcheck_result_details()`](file:///c:/MM/Src/OperationLog/api_client.py#L454)): Detailní výsledky integrity kontrol.
* **`GET /api/v1/SmartChecks/Results/{result_id}/adhocReport`** ([`fetch_smartcheck_report()`](file:///c:/MM/Src/OperationLog/api_client.py#L433)): Stažení vygenerovaného protokolu kontroly.

---

## 📡 3. Message Gateway (MSGGW) Endpointy

Base URL: `https://{hostname}/api/asol/msggw`

### 3.1 GET `/api/v1/Consumer/gRPC`
* **Python funkce:** [`fetch_msggw_grpc_consumers()`](file:///c:/MM/Src/OperationLog/api_client.py#L629)
* **Účel:** Získání seznamu všech aktivních gRPC consumerů registrovaných pro tenanta.
* **Hlavičky:** `Authorization: Bearer {token}`, `X-Tenant: {tenant_id}`, `Accept: application/json`

### 3.2 GET `/api/v1/Consumer/gRPC/code/{code}/status`
* **Python funkce:** [`fetch_msggw_consumer_status_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L651)
* **Účel:** Stav konkrétního gRPC consumera a počty zpráv v RabbitMQ frontě.

### 3.3 GET `/api/v1/Consumer/webhook`
* **Python funkce:** [`fetch_msggw_webhook_consumers()`](file:///c:/MM/Src/OperationLog/api_client.py#L691)
* **Účel:** Získání seznamu registrovaných webhook consumerů pro tenanta (včetně cílové URL a odebíraných modelů).

### 3.4 GET `/api/v1/Consumer/webhook/code/{code}`
* **Python funkce:** [`fetch_msggw_webhook_consumer_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L713)
* **Účel:** Kompletní konfigurace konkrétního webhook consumera (filtry událostí, mapování).

### 3.5 GET `/api/v1/Consumer/webhook/code/{code}/status` a `/api/v1/Consumer/webhook/{id}/status`
* **Python funkce:** [`fetch_msggw_webhook_consumer_status_by_code()`](file:///c:/MM/Src/OperationLog/api_client.py#L733), [`fetch_msggw_webhook_consumer_status_by_id()`](file:///c:/MM/Src/OperationLog/api_client.py#L773), [`fetch_msggw_webhook_consumer_status_smart()`](file:///c:/MM/Src/OperationLog/api_client.py#L813), [`fetch_all_msggw_webhook_statuses()`](file:///c:/MM/Src/OperationLog/api_client.py#L834)
* **Účel:** Získání živého stavu zdraví (`Healthy`, `Degraded`, `Unhealthy`) a přesného počtu zpráv ve frontě RabbitMQ (`readyMessages`, `unacknowledgedMessages`, `totalMessages`).
* **Paralelní načítání:** Funkce `fetch_all_msggw_webhook_statuses()` využívá `ThreadPoolExecutor` pro bleskové načtení stavů všech webhooků současně do přehledové tabulky.

### 3.6 GET `/api/v1/Consumer/status`
* **Python funkce:** [`fetch_msggw_all_consumers_statuses()`](file:///c:/MM/Src/OperationLog/api_client.py#L868)
* **Účel:** Globální diagnostický přehled stavů consumerů napříč všemi instancemi.

### 3.7 GET `/api/v1/MessageRouting/MessageType`
* **Python funkce:** [`fetch_msggw_message_types()`](file:///c:/MM/Src/OperationLog/api_client.py#L882)
* **Účel:** Katalog všech typů událostí a zpráv registrovaných v Message Gateway.

### 3.8 GET `/api/v1/MessageRouting`
* **Python funkce:** [`fetch_msggw_message_routings()`](file:///c:/MM/Src/OperationLog/api_client.py#L897)
* **Účel:** Kompletní mapa směrování zpráv (vazby typu zprávy na RabbitMQ Exchange, Routing Key a C# contract).

---

## 📌 Shrnutí architektonických pravidel

1. **Autentizace & Kontext Tenanta:**
   - Každé volání Data Service a Message Gateway vyžaduje hlavičky:
     - `Authorization: Bearer <access_token>`
     - `X-Tenant: <tenant_id>`
   - Při impersonaci child tenanta se token získává z endpointu `/api/v1/Tokens/impersonation` a následně se předává s příslušným `X-Tenant`.

2. **Časové formáty:**
   - Veškeré filtry data a času (`createdFrom`, `createdTo`, `ModifiedFrom`, `ModifiedTo`) převádějí lokální čas uživatele (`Europe/Prague`) na striktní formát **UTC ISO-8601** (`YYYY-MM-DDTHH:MM:SZ`).

3. **Casing parametrů:**
   - U novějších v2 endpointů (jako `/api/v2/QueryingData/GetData`) je striktně dodržován OpenAPI PascalCase casing (`ModelId`, `Limit`, `Offset`, `IncludeDeleted`, `PublisherSourceId`, `SourceId`).
