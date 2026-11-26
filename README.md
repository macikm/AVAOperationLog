# 📊 AVA Monitor (AVAOperationLog)

Moderní webová aplikace pro monitorování a analýzu integrační platformy Avaplace (Data Service API, Message Gateway, SmartChecks).
Postavena na moderním technologickém stacku: **FastAPI (Python backend) + React / Vite / TypeScript + Tailwind CSS + shadcn/ui**.

Aplikace slouží vývojářům, analytikům a konzultantům pro rychlou diagnostiku integračních toků, prohlížení a filtrování provozních logů, sledování vstupních a výstupních front a monitoring webhooků a agentů.

## ✨ Klíčové vlastnosti

* **Moderní frontend v shadcn/ui**: Čistý, bleskově rychlý design s podporou tmavého/světlého režimu a Lucide ikon.
* **Kompaktní hlavička**:
  * Stav a expirace tokenu v reálném čase s automatickým transparentním prodlužováním (silent refresh).
  * **Plnohodnotný shadcn/ui Combobox pro výběr a impersonaci tenanta** s bleskovým vyhledáváním (název/ID), podporou přímého vložení UUID a tlačítkem pro zrušení impersonace.
  * Přepínání prostředí (Produkce, Beta, Alpha, Dev, Demo).
* **7 kompletních monitorovacích modulů**:
  1. **Provozní logy**: Přehled cyklů, filtry (Agent, Source, Scope, Závažnost), časová osa událostí, JSON payload náhledy.
  2. **Vstupní fronta (SourcingData)**: Přehled příchozích balíčků (v1 i v2), stavy, detailní JSON payload.
  3. **Výstupní fronta (QueryingData)**: Přehled publikovaných zpráv, proklik z logů, dotažení kompletního datového modelu (payload).
  4. **Data Sources**: Přehled zdrojů, mapování a transformace entit, podpora vnořených objektů (nested mappings).
  5. **Data Agenti**: Seznam agentů, status gRPC consumerů z Message Gateway.
  6. **Webhooky**: Seznam webhook consumerů, live čítače front (připravené, nepotvrzené zprávy), Message Types a routing.
  7. **Statistika tenantů**: Přehled využití aplikací tenanty, přísný multiselect filtr, SmartCheck statusy a reporty.
* **Docker Multi-Stage Build**:
  * Fáze 1: Node.js sestaví frontend (`npm run build`).
  * Fáze 2: Python (FastAPI/Uvicorn) servíruje statické soubory i REST API na portu `8501`.

---

## 🚀 Instalace a spuštění

### 1. Spuštění v Docker kontejneru (doporučeno)

```bash
# Příprava .env souboru (volitelné)
cp .env.example .env

# Sestavení a spuštění
docker compose up -d --build
```
Aplikace běží na portu `http://localhost:8501`.

### 2. Lokální spuštění pro vývoj

**Backend (FastAPI):**
```bash
pip install -r requirements.txt
python server.py
```
Backend běží na `http://localhost:8501` (REST API pod `/api`, dokumentace Swagger pod `/docs`).

**Frontend (React/Vite):**
```bash
cd frontend
npm install
npm run dev
```
Vite vývojový server běží na `http://localhost:5173` a požadavky `/api` automaticky proxyuje na backend `localhost:8501`.

---

## 🔐 Bezpečnost a Autentikace
Aplikace podporuje:
- Přihlašování uživatelským jménem a heslem (OAuth password grant flow).
- Klientské klíče (Client Credentials grant flow).
- Přímé vložení SSO Bearer JWT tokenu.
- Automatické bezvýpadkové prodlužování tokenů před expirací.
