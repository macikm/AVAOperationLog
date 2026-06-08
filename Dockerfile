# Použijeme oficiální odlehčený Python image
FROM python:3.11-slim

# Nastavení pracovního adresáře v kontejneru
WORKDIR /app

# Instalace základních nástrojů pro zdraví kontejneru a git (volitelně)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Nejprve zkopírujeme requirements.txt a nainstalujeme závislosti
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Zkopírujeme zdrojový kód aplikace do kontejneru
COPY . .

# Exponujeme port pro Streamlit
EXPOSE 8501

# Nastavení kontroly stavu (healthcheck)
HEALTHCHECK CMD curl --fail http://localhost:8501/_stcore/health

# Spuštění aplikace
ENTRYPOINT ["streamlit", "run", "AVAOperationLog.py", "--server.port=8501", "--server.address=0.0.0.0"]
