# 📊 AVAOperationLog (Avaplace Operation Log Explorer)

Interaktivní webová aplikace postavená na frameworku [Streamlit](https://streamlit.io/), která slouží k pohodlnému prohlížení, pokročilému filtrování a vizuální analýze provozních logů z integrací na platformě Avaplace (Data Service API).

Aplikace je navržena pro vývojáře, analytiky a konzultanty, kterým umožňuje rychlou diagnostiku integračních toků bez nutnosti ručně volat API přes Postman nebo analyzovat surové JSON soubory.

## ✨ Klíčové vlastnosti

* **Multi-Environment podpora:** Snadné přepínání mezi prostředími (Alpha, Beta, Demo, Dev, Produkce).
* **Bezpečná správa credentials:** Přihlašovací údaje (včetně Client Secret) se ukládají lokálně s využitím šifrování vázaného na hardware konkrétního počítače. Do Gitu se neodesílají.
* **Server-Side filtrování:** Omezení stahovaných dat už na úrovni Avaplace API (podle data, času s přesností na vteřiny, závažnosti, AgentID, SourceID atd.).
* **Lazy Loading kontextu:** Při kliknutí na operaci v Master gridu aplikace automaticky dotáhne kompletní historii událostí pro dané `OperationID`, i když byly nadřazené filtry omezeny například jen na chyby.
* **Propojení na DataSources API:** Možnost rozkliku `SourceID` pro okamžité dotažení detailních metadat o zdrojovém agentovi z přidružených endpointů Avaplace.
* **Vizuální analytika (Sankey & Časová osa):** Automatické generování Sankey diagramů toků a výpočet trvání jednotlivých `ScopeID` úseků.

---

## 🚀 Instalace a spuštění

Ke spuštění aplikace je potřeba mít nainstalovaný **Python (verze 3.8 nebo novější)**.

### 1. Stažení repozitáře
Naklonujte si tento repozitář na svůj lokální disk:
```bash
git clone https://github.com/macikm/AVAOperationLog.git
cd AVAOperationLog
```

### 2. Instalace závislostí
Doporučuje se používat virtuální prostředí (venv), ale není to podmínkou. Nainstalujte všechny potřebné Python knihovny pomocí `pip`:
```bash
pip install streamlit pandas plotly requests
```
*(Poznámka: Ostatní knihovny jako `json`, `os`, `hashlib`, `uuid`, `base64` a `datetime` jsou standardní součástí Pythonu).*

### 3. Spuštění aplikace
Aplikaci můžete spustit dvěma způsoby:

**Varianta A: Přes příkazovou řádku**
```bash
streamlit run AVAOperationLog.py
```

**Varianta B: Přes dávkový soubor (Windows)**
Pokud máte ve složce připravený soubor `run_test.bat`, stačí na něj dvakrát kliknout. Otevře se konzole a následně se aplikace automaticky načte ve vašem výchozím webovém prohlížeči.

---

## 🔐 Poznámka k bezpečnosti
Při prvním spuštění a přihlášení do aplikace se ve složce vytvoří soubor `avaplace_credentials.json`. Tento soubor obsahuje vaše zašifrovaná hesla k API. Soubor je ignorován pomocí `.gitignore` a **nesmí být nahráván na GitHub ani sdílen s jinými osobami** (díky hardwarovému šifrování by jim na jiném stroji stejně nefungoval).
