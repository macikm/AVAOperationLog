import streamlit as st
import pandas as pd
import extra_streamlit_components as stx
import config_manager
import api_client
import ui_helpers
from tabs import tab_logs, tab_input_queue, tab_output_queue, tab_usage_stats, tab_tenant_statistics

# Inicializace CookieManageru pro ukládání přihlašovacích údajů v prohlížeči
cookie_manager = stx.CookieManager()

# Zajištění načtení cookies na startu (Streamlit custom component potřebuje čas na inicializaci)
all_cookies = cookie_manager.get_all(key="cookie_manager_init")

if 'cookies_initialized' not in st.session_state:
    st.session_state['cookies_initialized'] = False

if not st.session_state['cookies_initialized']:
    st.session_state['cookies_initialized'] = True
    import time as pytime
    pytime.sleep(0.5)
    st.rerun()

# Uložení dočasné konfigurace (pokud čeká na zápis na hlavní úrovni)
if 'pending_config_to_save' in st.session_state:
    config_manager.save_config(cookie_manager, st.session_state['pending_config_to_save'])
    st.session_state['loaded_config'] = st.session_state['pending_config_to_save']
    del st.session_state['pending_config_to_save']

# Načteme konfiguraci z cookies na hlavní úrovni
if 'loaded_config' not in st.session_state:
    st.session_state['loaded_config'] = config_manager.load_config(cookie_manager)

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
    xxxxheader {display: none !important;}
    /* Skrytí patičky "Made with Streamlit" */
    footer {display: none !important;}
    /* Odstranění obřího zbytečného prázdného místa nahoře (výchozí padding Streamlitu) */
    .block-container {
        padding-top: 2rem !important;
        padding-bottom: 2rem !important;
    }
    /* Odstranění stínu/okraje u popisků v Sankey grafu a nastavení černé barvy */
    .sankey .node-label-text-path,
    text.node-label,
    text.node-label-text-path {
        text-shadow: none !important;
        stroke: none !important;
        stroke-width: 0px !important;
        fill: red !important;
    }
</style>
"""
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

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
        'idp_url': f"https://{config_manager.ENVIRONMENTS['Alpha']}/api/asol/idp",
        'api_url': f"https://{config_manager.ENVIRONMENTS['Alpha']}/api/asol/ds/api/v1/OperatingLogs",
        'tenant_id': config_manager.DEFAULT_CREDS['tenant_id'],
        'client_id': config_manager.DEFAULT_CREDS['client_id'],
        'client_secret': config_manager.DEFAULT_CREDS['client_secret'],
        'scope': config_manager.DEFAULT_CREDS['scope']
    }
if 'access_token' not in st.session_state:
    st.session_state['access_token'] = None

# Vstupní fronta (SourcingData)
if 'input_queue_items' not in st.session_state:
    st.session_state['input_queue_items'] = []
if 'input_queue_offset' not in st.session_state:
    st.session_state['input_queue_offset'] = 0
if 'input_queue_filters' not in st.session_state:
    st.session_state['input_queue_filters'] = {
        'agent_id': '',
        'client_id': '',
        'status': 'Všechny',
        'sourcing_api_version': 'v2',
        'source_id': '',
        'operation_id': '',
        'use_time': False,
        'date_from': None,
        'time_from': None,
        'date_to': None,
        'time_to': None
    }

# Výstupní fronta (QueryingData)
if 'output_queue_items' not in st.session_state:
    st.session_state['output_queue_items'] = []
if 'output_queue_offset' not in st.session_state:
    st.session_state['output_queue_offset'] = 0
if 'output_queue_filters' not in st.session_state:
    st.session_state['output_queue_filters'] = {
        'model_id': 'b6530960-bb27-4980-b1bf-80ba28e78e0e',
        'source_id': '',
        'mandant_code': '',
        'use_time': False,
        'date_from': None,
        'time_from': None,
        'date_to': None,
        'time_to': None
    }

if 'usage_stats_items' not in st.session_state:
    st.session_state['usage_stats_items'] = []
if 'usage_stats_application_code' not in st.session_state:
    st.session_state['usage_stats_application_code'] = ''
if 'usage_stats_application_options' not in st.session_state:
    st.session_state['usage_stats_application_options'] = []
if 'usage_stats_tenant_app_items' not in st.session_state:
    st.session_state['usage_stats_tenant_app_items'] = []
if 'usage_stats_include_smart_check_status' not in st.session_state:
    st.session_state['usage_stats_include_smart_check_status'] = True

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

# Pokus o automatické přihlášení z konfigurace při prvním spuštění
if st.session_state['access_token'] is None:
    try:
        config = config_manager.load_config(cookie_manager)
        saved_env = config.get("active_env") or "Produkce"
        if saved_env not in config:
            for env in config_manager.ENVIRONMENTS:
                if env in config and config[env].get("client_id"):
                    saved_env = env
                    break
        
        if saved_env in config and config[saved_env].get("client_id") and config[saved_env].get("client_secret"):
            env_creds = config[saved_env]
            tenant_id = env_creds["tenant_id"]
            client_id = env_creds["client_id"]
            client_secret = env_creds["client_secret"]
            scope = env_creds.get("scope", "")
            
            base_domain = config_manager.ENVIRONMENTS[saved_env]
            idp_url = f"https://{base_domain}/api/asol/idp"
            api_url = f"https://{base_domain}/api/asol/ds/api/v1/OperatingLogs"
            
            token = api_client.fetch_token(idp_url, client_id, client_secret, tenant_id, scope)
            st.session_state['access_token'] = token
            st.session_state['active_env'] = saved_env
            st.session_state['credentials'] = {
                'idp_url': idp_url,
                'api_url': api_url,
                'tenant_id': tenant_id,
                'client_id': client_id,
                'client_secret': client_secret,
                'scope': scope
            }
            initial_data = api_client.fetch_logs_page(
                api_url, token, tenant_id, limit=100, offset=0, filters=st.session_state['api_filters']
            )
            if isinstance(initial_data, dict) and 'items' in initial_data:
                st.session_state['fetched_logs'] = initial_data['items']
            elif isinstance(initial_data, list):
                st.session_state['fetched_logs'] = initial_data
    except Exception:
        pass

# --- MODÁLNÍ DIALOGY ---
@st.dialog("🔑 Přihlášení k Avaplace API")
def show_login_dialog():
    config = config_manager.load_config(cookie_manager)
    env_names = list(config_manager.ENVIRONMENTS.keys())
    
    # Callback pro změnu prostředí
    def on_env_change():
        sel_env = st.session_state['login_selected_env']
        creds = config.get(sel_env, {"tenant_id": "", "client_id": "", "client_secret": "", "scope": ""})
        st.session_state['login_tenant_id'] = creds.get('tenant_id', '')
        st.session_state['login_client_id'] = creds.get('client_id', '')
        st.session_state['login_client_secret'] = creds.get('client_secret', '')
        st.session_state['login_scope'] = creds.get('scope', '')

    # Inicializace hodnot v session state při prvním otevření dialogu
    if 'login_tenant_id' not in st.session_state or not st.session_state.get('login_selected_env'):
        init_env = st.session_state.get('active_env', 'Alpha')
        init_creds = config.get(init_env, {"tenant_id": "", "client_id": "", "client_secret": "", "scope": ""})
        st.session_state['login_tenant_id'] = init_creds.get('tenant_id', '')
        st.session_state['login_client_id'] = init_creds.get('client_id', '')
        st.session_state['login_client_secret'] = init_creds.get('client_secret', '')
        st.session_state['login_scope'] = init_creds.get('scope', '')
    
    selected_env = st.selectbox(
        "Cílové prostředí (Stage):", 
        env_names, 
        index=env_names.index(st.session_state.get('active_env', 'Alpha')),
        key='login_selected_env',
        on_change=on_env_change
    )
    
    st.markdown("---")
    tenant_id = st.text_input("Tenant ID (tid):", key="login_tenant_id")
    client_id = st.text_input("Client ID:", key="login_client_id")
    client_secret = st.text_input("Client Secret:", type="password", key="login_client_secret")
    scope = st.text_input("Scope (volitelné):", key="login_scope")
    
    if st.button("Uložit do prohlížeče a přihlásit se", width="stretch"):
        config[selected_env] = {
            "tenant_id": tenant_id,
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": scope
        }
        config["active_env"] = selected_env
        st.session_state['pending_config_to_save'] = config
        
        base_domain = config_manager.ENVIRONMENTS[selected_env]
        idp_url = f"https://{base_domain}/api/asol/idp"
        api_url = f"https://{base_domain}/api/asol/ds/api/v1/OperatingLogs"
        
        try:
            token = api_client.fetch_token(idp_url, client_id, client_secret, tenant_id, scope)
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
            st.session_state['input_queue_items'] = []
            st.session_state['input_queue_offset'] = 0
            st.session_state['output_queue_items'] = []
            st.session_state['output_queue_offset'] = 0
            
            initial_data = api_client.fetch_logs_page(
                api_url, token, tenant_id, limit=100, offset=0, filters=st.session_state['api_filters']
            )
            
            if isinstance(initial_data, dict) and 'items' in initial_data:
                st.session_state['fetched_logs'] = initial_data['items']
            elif isinstance(initial_data, list):
                st.session_state['fetched_logs'] = initial_data
                
            st.rerun()
        except Exception as e:
            st.error(f"Přihlášení nebo stažení dat selhalo: {str(e)}")

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

# --- TABS MONITORINGU ---
tab_logs_elem, tab_input_queue_elem, tab_output_queue_elem, tab_usage_stats_elem, tab_tenant_stats_elem = st.tabs([
    "📊 Provozní logy",
    "📥 Vstupní fronta (SourcingData)",
    "📤 Výstupní fronta (QueryingData)",
    "📈 Statistika použití (UsageStatistics)",
    "🏢 Statistika tenantů"
])

with tab_logs_elem:
    tab_logs.render_tab()

with tab_input_queue_elem:
    tab_input_queue.render_tab()

with tab_output_queue_elem:
    tab_output_queue.render_tab()

with tab_usage_stats_elem:
    tab_usage_stats.render_tab()

with tab_tenant_stats_elem:
    tab_tenant_statistics.render_tab(cookie_manager)
