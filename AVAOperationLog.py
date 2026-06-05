import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, time
import requests
import json
import os
import uuid
import hashlib
import base64

# Nastavení stránky
st.set_page_config(
    page_title="Avaplace Operating Log",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- SKRYTÍ VÝCHOZÍHO STREAMLIT MENU A TLAČÍTKA DEPLOY ---
hide_streamlit_style = """
<style>
    /* Skrytí horní lišty kompletně i s vyhrazeným místem */
    header {display: none !important;}
    /* Skrytí patičky "Made with Streamlit" */
    footer {display: none !important;}
    /* Odstranění obřího zbytečného prázdného místa nahoře (výchozí padding Streamlitu) */
    .block-container {
        padding-top: 2rem !important;
        padding-bottom: 2rem !important;
    }
</style>
"""
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# --- SPRÁVA KONFIGURACE A ŠIFROVÁNÍ ---
CONFIG_FILE = "avaplace_credentials.json"

DEFAULT_CREDS = {
    "tenant_id": "ASOLEU",
    "client_id": "ASOLEU-MMac-lEDNb6uHckiQb6qobW0eFQ",
    "client_secret": "VBLfjbIxwJvMJQJ5O69kdV6VQp2sNrGQkUmWmXExT4mPPiiQS3PjKBvys2aSixmE",
    "scope": ""
}

ENVIRONMENTS = {
    "Alpha": "alpha.avaplace.com",
    "Beta": "beta.avaplace.com",
    "Demo": "demo.avaplace.com",
    "Dev": "dev.avaplace.com",
    "Produkce": "avaplace.com"
}

def get_machine_key():
    """Vygeneruje unikátní šifrovací klíč vázaný na hardware tohoto počítače."""
    node_id = str(uuid.getnode())
    return hashlib.sha256(node_id.encode('utf-8')).digest()

def encrypt_secret(secret):
    if not secret: 
        return ""
    key = get_machine_key()
    encoded = secret.encode('utf-8')
    encrypted = bytearray(b ^ key[i % len(key)] for i, b in enumerate(encoded))
    return "🔑_encrypted_" + base64.b64encode(encrypted).decode('utf-8')

def decrypt_secret(encrypted_text):
    if not encrypted_text or not encrypted_text.startswith("🔑_encrypted_"):
        return encrypted_text
    try:
        key = get_machine_key()
        raw_cipher = encrypted_text.replace("🔑_encrypted_", "")
        decoded = base64.b64decode(raw_cipher.encode('utf-8'))
        decrypted = bytearray(b ^ key[i % len(key)] for i, b in enumerate(decoded))
        return decrypted.decode('utf-8')
    except Exception:
        return ""

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for env in data:
                    if "client_secret" in data[env]:
                        data[env]["client_secret"] = decrypt_secret(data[env]["client_secret"])
                return data
        except Exception:
            pass
    return {}

def save_config(config_data):
    try:
        export_data = json.loads(json.dumps(config_data))
        for env in export_data:
            if "client_secret" in export_data[env]:
                export_data[env]["client_secret"] = encrypt_secret(export_data[env]["client_secret"])
                
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=4)
    except Exception as e:
        st.sidebar.error(f"Nepodařilo se bezpečně uložit konfiguraci: {e}")

# Inicializace stavů v paměti aplikace
if 'fetched_logs' not in st.session_state:
    st.session_state['fetched_logs'] = []
if 'fetched_details' not in st.session_state:
    st.session_state['fetched_details'] = {}
if 'fetched_datasources' not in st.session_state:
    st.session_state['fetched_datasources'] = {}
if 'current_offset' not in st.session_state:
    st.session_state['current_offset'] = 0
if 'active_env' not in st.session_state:
    st.session_state['active_env'] = "Alpha"

if 'credentials' not in st.session_state:
    st.session_state['credentials'] = {
        'idp_url': f"https://{ENVIRONMENTS['Alpha']}/api/asol/idp",
        'api_url': f"https://{ENVIRONMENTS['Alpha']}/api/asol/ds/api/v1/OperatingLogs",
        'tenant_id': DEFAULT_CREDS['tenant_id'],
        'client_id': DEFAULT_CREDS['client_id'],
        'client_secret': DEFAULT_CREDS['client_secret'],
        'scope': DEFAULT_CREDS['scope']
    }
if 'access_token' not in st.session_state:
    st.session_state['access_token'] = None

# Výchozí stav pro serverové filtry
if 'api_filters' not in st.session_state:
    st.session_state['api_filters'] = {
        'operationId': "",
        'severity_level': "Všechny",
        'include_system': True,
        'agent_code': "",
        'agent_id': "",
        'source_id': "",
        'op_scope': "",
        'use_time': False,
        'date_from': None,
        'time_from': None,
        'date_to': None,
        'time_to': None
    }

# Fixní klíče pro lokální filtry detailu
if 'saved_detail_statuses' not in st.session_state:
    st.session_state['saved_detail_statuses'] = ['🔴 Error', '🟡 Warning', '🟢 Info']
if 'local_detail_status_widget' not in st.session_state:
    st.session_state['local_detail_status_widget'] = st.session_state['saved_detail_statuses']

def detail_status_changed():
    st.session_state['saved_detail_statuses'] = st.session_state['local_detail_status_widget']

# --- API KOMUNIKACE ---
def fetch_token(idp_base_url, client_id, client_secret, tenant_id, scope):
    token_url = f"{idp_base_url.rstrip('/')}/connect/token"
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
    payload = {
        'grant_type': 'client_credentials',
        'client_id': client_id.strip(),
        'client_secret': client_secret.strip(),
        'tid': tenant_id.strip()
    }
    if scope and scope.strip():
        payload['scope'] = scope.strip()
        
    response = requests.post(token_url, data=payload, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json().get("access_token")

def fetch_logs_page(api_url, token, tenant_id, limit, offset, filters=None):
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    params = {
        'limit': limit,
        'offset': offset
    }
    
    if filters:
        if filters.get('operationId'): params['OperationId'] = filters['operationId'].strip()
        if filters.get('agent_code'): params['AgentCode'] = filters['agent_code'].strip()
        if filters.get('agent_id'): params['AgentId'] = filters['agent_id'].strip()
        if filters.get('source_id'): params['SourceId'] = filters['source_id'].strip()
        if filters.get('op_scope'): params['OperationScope'] = filters['op_scope'].strip()
        
        if filters.get('severity_level') and filters.get('severity_level') != "Všechny":
            params['SeverityLevel'] = filters['severity_level']
            
        params['IncludeSystemLevel'] = 'true' if filters.get('include_system', True) else 'false'
            
        if filters.get('use_time'):
            tz_local = 'Europe/Prague'
            d_from = filters.get('date_from')
            if d_from:
                t_from = filters.get('time_from') if filters.get('time_from') is not None else time(0, 0, 0)
                dt_from_local = pd.Timestamp(datetime.combine(d_from, t_from)).tz_localize(tz_local)
                params['createdFrom'] = dt_from_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
                
            d_to = filters.get('date_to')
            if d_to:
                t_to = filters.get('time_to') if filters.get('time_to') is not None else time(23, 59, 59)
                dt_to_local = pd.Timestamp(datetime.combine(d_to, t_to)).tz_localize(tz_local)
                params['createdTo'] = dt_to_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
            
    response = requests.get(api_url, headers=headers, params=params, timeout=15)
    response.raise_for_status()
    return response.json()

def fetch_datasource_info(api_base_url, token, tenant_id, source_id):
    base_url = api_base_url.split('/OperatingLogs')[0]
    ds_url = f"{base_url}/DataSources/{source_id.strip()}"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    response = requests.get(ds_url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()

# --- POMOCNÉ FUNKCE PRO ZPRACOVÁNÍ DAT ---
def determine_badge(severities):
    if isinstance(severities, str):
        severities = [severities]
    combined = " ".join(list(severities))
    if 'Error' in combined: return '🔴 Error'
    elif 'Warning' in combined: return '🟡 Warning'
    elif 'Info' in combined: return '🟢 Info'
    return '⚪ Unknown'

def clean_data(raw_list):
    df = pd.DataFrame(raw_list)
    if df.empty: return df
    
    required_columns = ['id', 'operationId', 'operationType', 'activityType', 'severity', 'createdOn', 'message', 'scopeId', 'sourceId', 'agentId', 'source']
    for col in required_columns:
        if col not in df.columns: df[col] = None

    df['severity'] = df['severity'].fillna('Unknown')
    df['severity'] = df['severity'].apply(determine_badge)

    for col in df.columns:
        if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
            df[col] = df[col].apply(lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else str(x) if pd.notna(x) else "")
        elif df[col].dtype == 'object' and col != 'createdOn':
            df[col] = df[col].astype(str).replace('nan', '')

    df['createdOn'] = pd.to_datetime(df['createdOn'], format='ISO8601', utc=True, errors='coerce')
    return df

# --- MODÁLNÍ DIALOGY ---
@st.dialog("🔑 Přihlášení k Avaplace API")
def show_login_dialog():
    config = load_config()
    env_names = list(ENVIRONMENTS.keys())
    
    selected_env = st.selectbox("Cílové prostředí (Stage):", env_names, index=env_names.index(st.session_state['active_env']))
    
    env_creds = config.get(selected_env, DEFAULT_CREDS if selected_env == "Alpha" else {"tenant_id": "", "client_id": "", "client_secret": "", "scope": ""})
    
    st.markdown("---")
    tenant_id = st.text_input("Tenant ID (tid):", value=env_creds.get('tenant_id', ''))
    client_id = st.text_input("Client ID:", value=env_creds.get('client_id', ''))
    client_secret = st.text_input("Client Secret:", type="password", value=env_creds.get('client_secret', ''))
    scope = st.text_input("Scope (volitelné):", value=env_creds.get('scope', ''))
    
    if st.button("Uložit do paměti stroje a přihlásit se", width="stretch"):
        config[selected_env] = {
            "tenant_id": tenant_id,
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": scope
        }
        save_config(config)
        
        base_domain = ENVIRONMENTS[selected_env]
        idp_url = f"https://{base_domain}/api/asol/idp"
        api_url = f"https://{base_domain}/api/asol/ds/api/v1/OperatingLogs"
        
        try:
            token = fetch_token(idp_url, client_id, client_secret, tenant_id, scope)
            st.session_state['access_token'] = token
            st.session_state['active_env'] = selected_env
            st.session_state['credentials'] = {
                'idp_url': idp_url,
                'api_url': api_url,
                'tenant_id': tenant_id,
                'client_id': client_id,
                'client_secret': client_secret,
                'scope': scope
            }
            st.session_state['fetched_logs'] = []
            st.session_state['fetched_details'] = {}
            st.session_state['fetched_datasources'] = {}
            st.session_state['current_offset'] = 0
            
            initial_data = fetch_logs_page(
                api_url, token, tenant_id, limit=100, offset=0, filters=st.session_state['api_filters']
            )
            
            if isinstance(initial_data, dict) and 'items' in initial_data:
                st.session_state['fetched_logs'] = initial_data['items']
            elif isinstance(initial_data, list):
                st.session_state['fetched_logs'] = initial_data
                
            st.rerun()
        except Exception as e:
            st.error(f"Přihlášení nebo stažení dat selhalo: {str(e)}")

@st.dialog("📋 Detail Custom Fields")
def show_custom_fields_modal(cf_string):
    try:
        # Převedeme string na JSON objekt
        cf_data = json.loads(cf_string)
        
        # Ošetření: někdy logovací systémy serializují JSON dvakrát, pokud to stále je string, dekódujeme znovu
        if isinstance(cf_data, str):
            cf_data = json.loads(cf_data)
            
        if isinstance(cf_data, list) and len(cf_data) > 0:
            df_cf = pd.DataFrame(cf_data)
            # Vykreslíme jako tabulku, aby šlo data myší označit a zkopírovat
            st.dataframe(df_cf, width="stretch", hide_index=True)
        else:
            st.info("Tento záznam sice pole Custom Fields obsahuje, ale nejsou v něm žádná data.")
    except Exception as e:
        st.error(f"Nepodařilo se rozparsovat JSON strukturu: {e}")
        st.code(cf_string)

# --- KOMPAKTNÍ HLAVIČKA ---
header_col1, header_col2 = st.columns([4, 1])
with header_col1:
    st.markdown("### 📊 Avaplace Operating Log")
with header_col2:
    env_badge = f"({st.session_state['active_env']})" if st.session_state['active_env'] else ""
    if st.button(f"🔑 Připojení {env_badge}", width="stretch"):
        show_login_dialog()

# Zastavení aplikace, POKUD NEJSME PŘIHLÁŠENI
if not st.session_state['access_token']:
    st.info("Aplikace není připojena k API. Klikněte na tlačítko připojení vpravo nahoře pro výběr prostředí a přihlášení.")
    st.stop()

is_empty_data = len(st.session_state['fetched_logs']) == 0

# --- SERVEROVÉ FILTRY ---
with st.expander("📡 API Filtry (Stahování dat ze serveru)", expanded=is_empty_data):
    
    f_col1, f_col2, f_col3 = st.columns([2, 1, 1])
    with f_col1:
        api_op_id = st.text_input("Operation ID:", value=st.session_state['api_filters']['operationId'])
    with f_col2:
        api_sev = st.selectbox("Minimální závažnost:", ["Všechny", "Info", "Warning", "Error"], 
                               index=["Všechny", "Info", "Warning", "Error"].index(st.session_state['api_filters']['severity_level']))
    with f_col3:
        st.markdown("<br>", unsafe_allow_html=True)
        api_sys = st.checkbox("IncludeSystemLevel", value=st.session_state['api_filters']['include_system'])

    a_col1, a_col2, a_col3, a_col4 = st.columns(4)
    with a_col1: api_agent_code = st.text_input("Agent Code:", value=st.session_state['api_filters']['agent_code'])
    with a_col2: api_agent_id = st.text_input("Agent ID:", value=st.session_state['api_filters']['agent_id'])
    with a_col3: api_source_id = st.text_input("Source ID:", value=st.session_state['api_filters']['source_id'])
    with a_col4: api_op_scope = st.text_input("Operation Scope:", value=st.session_state['api_filters']['op_scope'])

    st.markdown("---")

    use_time = st.checkbox("🗓️ Omezit stahování a zobrazení na konkrétní datum/čas", value=st.session_state['api_filters']['use_time'])
    api_date_from, api_time_from, api_date_to, api_time_to = None, None, None, None
    if use_time:
        t_col1, t_col2, t_col3, t_col4 = st.columns(4)
        with t_col1: api_date_from = st.date_input("Od data:", value=st.session_state['api_filters']['date_from'], format="DD.MM.YYYY")
        with t_col2: api_time_from = st.time_input("Čas od:", value=st.session_state['api_filters']['time_from'])
        with t_col3: api_date_to = st.date_input("Do data:", value=st.session_state['api_filters']['date_to'], format="DD.MM.YYYY")
        with t_col4: api_time_to = st.time_input("Čas do:", value=st.session_state['api_filters']['time_to'])
    
    if st.button("🚀 Použít API filtry a nově stáhnout", width="stretch"):
        st.session_state['api_filters'] = {
            'operationId': api_op_id,
            'severity_level': api_sev,
            'include_system': api_sys,
            'agent_code': api_agent_code,
            'agent_id': api_agent_id,
            'source_id': api_source_id,
            'op_scope': api_op_scope,
            'use_time': use_time,
            'date_from': api_date_from if use_time else None,
            'time_from': api_time_from if use_time else None,
            'date_to': api_date_to if use_time else None,
            'time_to': api_time_to if use_time else None
        }
        creds = st.session_state['credentials']
        token = st.session_state['access_token']
        
        with st.spinner("Stahuji data podle nových filtrů..."):
            try:
                initial_data = fetch_logs_page(
                    creds['api_url'], token, creds['tenant_id'], 
                    limit=100, offset=0, filters=st.session_state['api_filters']
                )
                st.session_state['fetched_logs'] = []
                st.session_state['fetched_details'] = {}
                st.session_state['fetched_datasources'] = {}
                st.session_state['current_offset'] = 0
                
                if isinstance(initial_data, dict) and 'items' in initial_data:
                    st.session_state['fetched_logs'] = initial_data['items']
                elif isinstance(initial_data, list):
                    st.session_state['fetched_logs'] = initial_data
                
                st.rerun()
            except Exception as e:
                st.error(f"Stažení dat selhalo: {str(e)}")

if is_empty_data:
    st.warning("Pro zadané API filtry nevrátil server žádná data. Upravte filtry výše.")
    st.stop()

# --- ZPRACOVÁNÍ DATA ---
df_raw = clean_data(st.session_state['fetched_logs'])

if df_raw.empty:
    st.stop()

# TVRDÁ LOKÁLNÍ POJISTKA DATA A ČASU
filters = st.session_state['api_filters']
if filters['use_time']:
    tz_local = 'Europe/Prague'
    if filters['date_from'] is not None:
        t_f = filters['time_from'] if filters['time_from'] is not None else time(0, 0, 0)
        dt_from_loc = pd.Timestamp(datetime.combine(filters['date_from'], t_f)).tz_localize(tz_local)
        df_raw = df_raw[df_raw['createdOn'] >= dt_from_loc.tz_convert('UTC')]
        
    if filters['date_to'] is not None:
        t_t = filters['time_to'] if filters['time_to'] is not None else time(23, 59, 59)
        dt_to_loc = pd.Timestamp(datetime.combine(filters['date_to'], t_t)).tz_localize(tz_local)
        df_raw = df_raw[df_raw['createdOn'] <= dt_to_loc.tz_convert('UTC')]

if df_raw.empty:
    st.warning("Data sice byla stažena, ale žádné události nespadají do přísného lokálního časového filtru.")
    st.stop()

df_clean = df_raw[df_raw['operationId'].notna() & (df_raw['operationId'] != '') & (df_raw['operationId'] != 'None')].copy()
df_system = df_raw[df_raw['operationId'].isna() | (df_raw['operationId'] == '') | (df_raw['operationId'] == 'None')].copy()

total_cnt = len(df_raw)
err_cnt = len(df_raw[df_raw['severity'].astype(str).str.contains('Error')])
warn_cnt = len(df_raw[df_raw['severity'].astype(str).str.contains('Warning')])
min_time = df_raw['createdOn'].min()
min_time_str = min_time.tz_convert('Europe/Prague').strftime('%Y-%m-%d %H:%M:%S') if pd.notna(min_time) else "N/A"

# --- STAVOVÝ ŘÁDEK A STRÁNKOVÁNÍ ---
info_col, chunk_input_col, btn_col = st.columns([6, 1, 2])

with info_col:
    st.markdown(f"ℹ️ **Aktuální stav paměti:** Načteno **{total_cnt}** událostí (🔴 {err_cnt} chyb, 🟡 {warn_cnt} varování). Nejstarší záznam: `{min_time_str}` (CZ)")

with chunk_input_col:
    chunk_size = st.number_input("Počet", min_value=10, max_value=5000, value=100, step=100, label_visibility="collapsed")

with btn_col:
    if st.button(f"📥 Načíst dalších {chunk_size} starších záznamů", width="stretch"):
        creds = st.session_state['credentials']
        token = st.session_state['access_token']
        
        if not token:
            st.error("Chybí token. Přihlaste se prosím znovu.")
        else:
            with st.spinner("Stahuji další data z Avaplace..."):
                try:
                    new_offset = st.session_state['current_offset'] + chunk_size
                    next_data = fetch_logs_page(
                        creds['api_url'], token, creds['tenant_id'], 
                        limit=chunk_size, offset=new_offset, filters=st.session_state['api_filters']
                    )
                    
                    new_items = []
                    if isinstance(next_data, dict) and 'items' in next_data:
                        new_items = next_data['items']
                    elif isinstance(next_data, list):
                        new_items = next_data
                        
                    if new_items:
                        combined_logs = st.session_state['fetched_logs'] + new_items
                        unique_logs = {item['id']: item for item in combined_logs if 'id' in item}.values()
                        st.session_state['fetched_logs'] = list(unique_logs)
                        st.session_state['current_offset'] = new_offset
                        st.rerun()
                    else:
                        st.info("Konec historie. Žádné další záznamy server nevrátil.")
                except Exception as e:
                    st.error(f"Nepodařilo se stáhnout další data: {str(e)}")

# --- HLAVNÍ SEZNACOVACÍ GRID ---
st.subheader("🗂️ Seznam operačních cyklů")

# Agregace dat pro Master tabulku
df_master_base = df_clean.groupby('operationId').agg(
    První_výskyt=('createdOn', 'min'),
    Počet_událostí=('id', 'count'),
    Vsechny_zavaznosti=('severity', lambda x: set(x))
).reset_index()

df_master_base['Stav'] = df_master_base['Vsechny_zavaznosti'].apply(determine_badge)
df_master_base = df_master_base[['Stav', 'operationId', 'První_výskyt', 'Počet_událostí']]

df_master_filtered = df_master_base.sort_values(by='První_výskyt', ascending=False).reset_index(drop=True)

selection_event = st.dataframe(
    df_master_filtered,
    width="stretch",
    hide_index=True,
    selection_mode="single-row",
    on_select="rerun"
)

active_op_id = None
if selection_event.selection.rows:
    selected_idx = selection_event.selection.rows[0]
    if selected_idx < len(df_master_filtered):
        active_op_id = df_master_filtered.iloc[selected_idx]['operationId']
elif not df_master_filtered.empty:
    active_op_id = df_master_filtered.iloc[0]['operationId']

# --- LAZY LOADING DETAILU ---
if active_op_id:
    if active_op_id not in st.session_state['fetched_details']:
        creds = st.session_state['credentials']
        token = st.session_state['access_token']
        full_context_filters = {'operationId': active_op_id}
        
        with st.spinner("Dotahuji kompletní kontext událostí pro tuto operaci..."):
            try:
                detail_data = fetch_logs_page(creds['api_url'], token, creds['tenant_id'], limit=1000, offset=0, filters=full_context_filters)
                
                new_items = []
                if isinstance(detail_data, dict) and 'items' in detail_data:
                    new_items = detail_data['items']
                elif isinstance(detail_data, list):
                    new_items = detail_data
                    
                st.session_state['fetched_details'][active_op_id] = new_items
            except Exception as e:
                st.error(f"Nepodařilo se stáhnout detail operace: {str(e)}")

# --- DETAILNÍ GRID A JEHO FILTR ---
if active_op_id:
    st.markdown("---")
    det_header_col, det_filter_col = st.columns([2, 1])
    
    with det_header_col:
        st.subheader(f"📄 Detailní výpis událostí pro OperationID: `{active_op_id}`")
        st.markdown("Kliknutím na řádek zobrazíte pod tabulkou **Custom Fields** nebo metadata k **SourceID**.")
        
    with det_filter_col:
        all_available_statuses = ['🔴 Error', '🟡 Warning', '🟢 Info']
        selected_detail_statuses = st.multiselect(
            "Filtrovat zobrazené události v detailu:",
            options=all_available_statuses,
            key="local_detail_status_widget",
            on_change=detail_status_changed
        )

    local_detail_logs = [item for item in st.session_state['fetched_logs'] if item.get('operationId') == active_op_id]
    downloaded_detail_logs = st.session_state['fetched_details'].get(active_op_id, [])
    
    combined_detail_logs = local_detail_logs + downloaded_detail_logs
    unique_detail_logs = {item['id']: item for item in combined_detail_logs if 'id' in item}.values()
    
    df_detail_raw = clean_data(list(unique_detail_logs))
    
    if df_detail_raw.empty:
        st.info("Pro vybranou operaci nebyly nalezeny žádné detailní události.")
    else:
        df_detail = df_detail_raw.copy()
        
        if len(selected_detail_statuses) > 0:
            df_detail = df_detail[df_detail['severity'].isin(selected_detail_statuses)]
            
        df_detail = df_detail.sort_values(by='createdOn').reset_index(drop=True)
        
        display_columns = ['severity', 'operationType', 'activityType', 'createdOn', 'message', 'source', 'scopeId', 'agentId', 'sourceId', 'customFields', 'details']
        existing_cols = [c for c in display_columns if c in df_detail.columns]
        other_cols = [c for c in df_detail.columns if c not in display_columns and c != 'Stav']
        
        df_display = df_detail[existing_cols + other_cols]
        
        detail_selection = st.dataframe(
            df_display,
            width="content",
            hide_index=True,
            selection_mode="single-row",
            on_select="rerun",
            column_config={
                "customFields": st.column_config.TextColumn("customFields", width="large"),
                "details": st.column_config.TextColumn("details", width="large")
            }
        )
        
        # --- ROZŠÍŘENÁ METADATA (LOOKUPS & CUSTOM FIELDS) ---
        active_detail_row = None
        if detail_selection.selection.rows:
            selected_det_idx = detail_selection.selection.rows[0]
            if selected_det_idx < len(df_display):
                active_detail_row = df_display.iloc[selected_det_idx]
                
        if active_detail_row is not None:
            st.markdown("#### 🔗 Rozšířené detaily vybraného řádku")
            
            # 1. Řešení pro Custom Fields (Spustí modální okno)
            custom_fields_raw = active_detail_row.get('customFields')
            if pd.notna(custom_fields_raw) and str(custom_fields_raw).strip() not in ['', '[]', 'None', 'null']:
                if st.button("📋 Otevřít 'Custom Fields' v přehledné tabulce", width="stretch"):
                    show_custom_fields_modal(str(custom_fields_raw))
            
            # 2. Řešení pro Source ID metadata (Automaticky dotáhne a vykreslí expander)
            source_id = active_detail_row.get('sourceId')
            if pd.notna(source_id) and str(source_id).strip().lower() not in ['', 'none', 'nan', 'null']:
                source_id_str = str(source_id).strip()
                creds = st.session_state['credentials']
                token = st.session_state['access_token']
                
                if source_id_str not in st.session_state['fetched_datasources']:
                    with st.spinner(f"Dotahuji metadata pro DataSource: {source_id_str}..."):
                        try:
                            ds_info = fetch_datasource_info(creds['api_url'], token, creds['tenant_id'], source_id_str)
                            st.session_state['fetched_datasources'][source_id_str] = ds_info
                        except Exception as e:
                            st.error(f"Nepodařilo se stáhnout metadata pro DataSource '{source_id_str}': {e}")
                
                ds_data = st.session_state['fetched_datasources'].get(source_id_str)
                if ds_data:
                    with st.expander(f"📦 API Data Source Info: {ds_data.get('name', source_id_str)}", expanded=True):
                        st.json(ds_data)

        with st.expander("⏱️ Časová osa událostí operace", expanded=False):
            for idx, row in df_detail.iterrows():
                t_val = row['createdOn']
                t_str = t_val.tz_convert('Europe/Prague').strftime('%H:%M:%S.%f')[:-3] if pd.notna(t_val) else "Neznámý čas"
                st.markdown(f"**{t_str}** | {row['severity']} `[{row.get('operationType', 'Unknown')}]` — **{row.get('activityType', 'Unknown')}** (*{row.get('source', 'Neznámý zdroj')}*)")
                st.caption(f"↳ {row.get('message', '')}")
else:
    st.info("Vyberte operaci v horní tabulce pro zobrazení detailu.")

# --- VOLITELNÉ POHLEDY (SCHOVANÉ) ---
with st.expander("📊 Globální analytické pohledy (Sankey & Výpočty trvání)", expanded=False):
    col_g1, col_g2 = st.columns(2)
    
    with col_g1:
        st.markdown("##### Doba zpracování Performance úseků (ScopeID)")
        if active_op_id and 'df_detail' in locals() and not df_detail.empty:
            
            mask_begin = df_detail['activityType'].astype(str).str.endswith('|Begin')
            mask_end = df_detail['activityType'].astype(str).str.endswith('|End')
            
            begins = df_detail[mask_begin].set_index('scopeId')
            ends = df_detail[mask_end].set_index('scopeId')
            
            durations = []
            for s_id in begins.index.intersection(ends.index):
                if pd.notna(s_id) and str(s_id) != 'None' and str(s_id) != '':
                    b_time = begins.loc[s_id, 'createdOn']
                    e_time = ends.loc[s_id, 'createdOn']
                    
                    if isinstance(b_time, pd.Series): b_time = b_time.iloc[0]
                    if isinstance(e_time, pd.Series): e_time = e_time.iloc[0]
                    
                    if pd.notna(b_time) and pd.notna(e_time):
                        durations.append({"ScopeId": s_id, "Trvání (s)": (e_time - b_time).total_seconds()})
                        
            if durations:
                df_dur = pd.DataFrame(durations)
                fig_dur = px.bar(df_dur, x='ScopeId', y='Trvání (s)', title="Časové úseky")
                st.plotly_chart(fig_dur, width="stretch")
            else:
                st.info("Vybraná operace neobsahuje spárované dvojice končící na |Begin a |End se shodným ScopeId.")
        else:
            st.info("Žádná data pro výpočet.")
            
    with col_g2:
        st.markdown("##### Tok fází a závažností (Sankey)")
        if not df_clean.empty and 'operationType' in df_clean.columns and 'severity' in df_clean.columns:
            sankey_data = df_clean.groupby(['operationType', 'severity']).size().reset_index(name='count')
            all_nodes = list(df_clean['operationType'].unique()) + list(df_clean['severity'].unique())
            node_indices = {node: idx for idx, node in enumerate(all_nodes)}
            
            sources = [node_indices[row['operationType']] for _, row in sankey_data.iterrows()]
            targets = [node_indices[row['severity']] for _, row in sankey_data.iterrows()]
            values = sankey_data['count'].tolist()
            
            if sources and targets:
                fig_sankey = go.Figure(data=[go.Sankey(
                    node=dict(pad=15, thickness=20, line=dict(color="black", width=0.5), label=all_nodes, color="royalblue"),
                    link=dict(source=sources, target=targets, value=values, color="rgba(100, 149, 237, 0.4)")
                )])
                st.plotly_chart(fig_sankey, width="stretch")

if 'df_system' in locals() and not df_system.empty:
    with st.expander("⚙️ Systémové/Infrastrukturní události platformy (bez OperationID)", expanded=False):
        st.dataframe(df_system, width="stretch", hide_index=True)