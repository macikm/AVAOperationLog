# Použijeme oficiální odlehčený Python image
FROM python:3.11-slim

# Nastavení pracovního adresáře v kontejneru
WORKDIR /app

# Nejprve zkopírujeme requirements.txt a nainstalujeme závislosti
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Zkopírujeme zdrojový kód aplikace do kontejneru
COPY . .

# Exponujeme port pro Streamlit
EXPOSE 8501

# Nastavení kontroly stavu (healthcheck pomocí vestavěného pythonu bez nutnosti externího curl)
HEALTHCHECK CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8501/_stcore/health')" || exit 1

# Spuštění aplikace
ENTRYPOINT ["streamlit", "run", "AVAOperationLog.py", "--server.port=8501", "--server.address=0.0.0.0"]
