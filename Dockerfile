# ==========================================
# Fáze 1: Sestavení React frontendu (Node.js)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build

# Zkopírování definice závislostí frontendu
COPY frontend/package.json ./
RUN npm install

# Zkopírování zdrojových kódů a sestavení produkčního bundle
COPY frontend/ ./
RUN npm run build

# ==========================================
# Fáze 2: Python FastAPI backend + statické soubory
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# Instalace Python závislostí
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Zkopírování backendového kódu
COPY . .

# Zkopírování sestaveného frontendu z fáze 1
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Exponujeme port 8501
EXPOSE 8501

# Nastavení kontroly stavu (healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8501/health')" || exit 1

# Spuštění aplikace přes Uvicorn
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8501"]
