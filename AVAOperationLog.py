import streamlit as st
import pandas as pd
import extra_streamlit_components as stx
import config_manager
import api_client
import ui_helpers
from tabs import tab_logs, tab_input_queue, tab_output_queue, tab_usage_stats, tab_tenant_statistics, tab_data_agents, tab_data_sources, tab_msggw, tab_webhooks

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
    page_title="AVA Monitor",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# --- BANKAPP INSPECTOR THEME & STYLES ---
hide_streamlit_style = """
<!-- Google Fonts: Inter & JetBrains Mono -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<style>
    /* 1. Globální typografie a podklad aplikace ve stylu BankApp Inspectoru */
    html, body, [data-testid="stAppViewContainer"], .stApp {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        background-color: #f2f6f8 !important;
        color: #1e293b !important;
    }

    /* Skrytí horní lišty a patičky Streamlitu */
    header[data-testid="stHeader"] {display: none !important;}
    footer {display: none !important;}
    .block-container {
        padding-top: 1.25rem !important;
        padding-bottom: 2rem !important;
        max-width: 98% !important;
    }

    /* Nadpisy */
    h1, h2, h3, h4, h5, h6 {
        font-family: 'Inter', sans-serif !important;
        color: #0f172a !important;
        font-weight: 700 !important;
        letter-spacing: -0.02em !important;
    }

    /* Kód a monospace texty */
    code, pre, kbd, samp {
        font-family: 'JetBrains Mono', Consolas, monospace !important;
    }

    /* Tmavý kódový blok ve stylu BankApp inspectoru */
    div[data-testid="stCodeBlock"] pre {
        background-color: #0b1120 !important;
        border: 1px solid #1e293b !important;
        border-radius: 12px !important;
        color: #38bdf8 !important;
        font-family: 'JetBrains Mono', Consolas, monospace !important;
        padding: 1rem !important;
    }

    /* 2. Formulářové prvky - vstupy, selectboxy, textarey */
    div[data-baseweb="input"] > div,
    div[data-baseweb="select"] > div,
    div[data-baseweb="textarea"] {
        background-color: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 10px !important;
        color: #0f172a !important;
        font-family: 'Inter', sans-serif !important;
        transition: all 0.2s ease !important;
    }
    div[data-baseweb="input"]:focus-within,
    div[data-baseweb="select"] > div:focus-within,
    div[data-baseweb="textarea"]:focus-within {
        border-color: #009688 !important;
        box-shadow: 0 0 0 2px rgba(0, 150, 136, 0.2) !important;
    }
    input, textarea {
        color: #0f172a !important;
        font-family: 'Inter', sans-serif !important;
    }

    /* 3. Tlačítka (Buttons) - Korporátní Teal (#009688) & Světlé tóny */
    div[data-testid="stButton"] button {
        background-color: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        color: #1e293b !important;
        border-radius: 10px !important;
        font-family: 'Inter', sans-serif !important;
        font-weight: 600 !important;
        font-size: 0.85rem !important;
        padding: 0.45rem 1rem !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
        transition: all 0.15s ease !important;
    }
    div[data-testid="stButton"] button:hover {
        background-color: #f1f5f9 !important;
        border-color: #94a3b8 !important;
        color: #0f172a !important;
    }

    /* Primární tlačítka (AVAplace Corporate Teal) */
    div[data-testid="stButton"] button[kind="primary"],
    button[kind="primary"] {
        background: linear-gradient(135deg, #009688 0%, #008080 100%) !important;
        color: #ffffff !important;
        border: 1px solid #00796b !important;
        border-radius: 10px !important;
        font-weight: 600 !important;
        box-shadow: 0 2px 6px rgba(0, 150, 136, 0.25) !important;
    }
    div[data-testid="stButton"] button[kind="primary"]:hover,
    button[kind="primary"]:hover {
        background: linear-gradient(135deg, #008080 0%, #00695c 100%) !important;
        box-shadow: 0 4px 10px rgba(0, 150, 136, 0.35) !important;
        color: #ffffff !important;
    }

    /* 4. Modální okna (Dialogs) */
    div[data-testid="stDialog"] > div {
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 18px !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
        padding: 1.5rem !important;
        font-family: 'Inter', sans-serif !important;
    }
    div[data-testid="stDialog"] h2,
    div[data-testid="stDialog"] h3 {
        color: #0f172a !important;
        font-weight: 700 !important;
    }

    /* 5. Karty, panely a expandery */
    div[data-testid="stExpander"] {
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 2px 8px -2px rgba(15, 23, 42, 0.05) !important;
        margin-bottom: 0.75rem !important;
    }
    div[data-testid="stExpander"] summary {
        font-weight: 600 !important;
        color: #0f172a !important;
        font-family: 'Inter', sans-serif !important;
    }
    div[data-testid="stExpander"] summary:hover {
        color: #009688 !important;
    }

    /* 6. Tabulky (Dataframe) - Čistý BankApp styl bez duplicitních rolovátek */
    div[data-testid="stDataFrame"] {
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 2px 8px -2px rgba(15, 23, 42, 0.05) !important;
        overflow: hidden !important;
    }
    div[data-testid="stDataFrame"] > div {
        overflow: hidden !important;
    }

    /* Vzhled selectboxu tenanta v horní liště ve stylu BankApp Inspectoru */
    div[data-testid="column"]:nth-child(2) div[data-baseweb="select"] > div {
        background-color: #e6f4f1 !important;
        border: 1px solid #99d8cb !important;
        border-radius: 10px !important;
        color: #00796b !important;
        font-weight: 600 !important;
        font-family: 'Inter', sans-serif !important;
    }
    div[data-testid="column"]:nth-child(2) div[data-baseweb="select"] span {
        color: #00796b !important;
        font-weight: 600 !important;
    }
    div[data-testid="column"]:nth-child(2) div[data-baseweb="select"] svg {
        fill: #00796b !important;
    }

    /* 7. Navigační lišta záložek (Radio styled as BankApp Inspector Tabs) */
    div[data-testid="stRadio"] > div {
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 0.5rem !important;
        padding: 0.25rem 0 0.75rem 0 !important;
    }
    div[data-testid="stRadio"] label {
        background-color: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        padding: 0.5rem 1rem !important;
        border-radius: 9px !important;
        cursor: pointer !important;
        font-weight: 600 !important;
        font-size: 0.84rem !important;
        color: #475569 !important;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
        transition: all 0.2s ease !important;
    }
    div[data-testid="stRadio"] label:hover {
        background-color: #e6f4f1 !important;
        border-color: #99d8cb !important;
        color: #00796b !important;
    }
    div[data-testid="stRadio"] label[data-checked="true"] {
        background-color: #e6f4f1 !important;
        color: #00796b !important;
        border: 1px solid #99d8cb !important;
        border-bottom: 2px solid #009688 !important;
        font-weight: 700 !important;
        box-shadow: 0 2px 6px rgba(0, 150, 136, 0.2) !important;
    }
    div[data-testid="stRadio"] label[data-checked="true"] p {
        color: #00796b !important;
        font-weight: 700 !important;
    }

    /* Sankey diagram text styles */
    .sankey .node-label-text-path,
    text.node-label,
    text.node-label-text-path {
        text-shadow: none !important;
        stroke: none !important;
        stroke-width: 0px !important;
        fill: #0f172a !important;
        font-family: 'Inter', sans-serif !important;
    }

    /* 8. Metriky a KPI karty (BankApp Inspector styl) */
    div[data-testid="stMetric"] {
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        padding: 0.85rem 1.1rem !important;
        box-shadow: 0 2px 6px -1px rgba(15, 23, 42, 0.05) !important;
    }
    div[data-testid="stMetric"] label {
        color: #64748b !important;
        font-family: 'Inter', sans-serif !important;
        font-weight: 500 !important;
        font-size: 0.8rem !important;
    }
    div[data-testid="stMetric"] div[data-testid="stMetricValue"] {
        color: #0f172a !important;
        font-family: 'Inter', sans-serif !important;
        font-weight: 700 !important;
    }

    /* 9. Sjednocení výšek a vertikální zarovnání pro nástrojové lišty a stránkování */
    div[data-testid="stNumberInput"] div[data-baseweb="input"] {
        height: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
    }
    div[data-testid="stNumberInput"] input {
        height: 38px !important;
        line-height: 38px !important;
        font-family: 'Inter', sans-serif !important;
        font-size: 0.85rem !important;
    }
    div[data-testid="stButton"] button {
        height: 38px !important;
        min-height: 38px !important;
        max-height: 38px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        line-height: 1 !important;
    }
    div[data-testid="stWidgetLabel"]:empty {
        display: none !important;
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
    st.session_state['active_env'] = "Produkce"

if 'credentials' not in st.session_state:
    st.session_state['credentials'] = {
        'idp_url': f"https://{config_manager.ENVIRONMENTS['Produkce']}/api/asol/idp",
        'api_url': f"https://{config_manager.ENVIRONMENTS['Produkce']}/api/asol/ds/api/v1/OperatingLogs",
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

# Pokus o obnovení relace výhradně z uložených uživatelských cookies v prohlížeči
if st.session_state['access_token'] is None:
    try:
        cookies_data = cookie_manager.get_all(key="cookie_manager_init")
        if cookies_data and "avaplace_config" in cookies_data:
            config = config_manager.load_config(cookie_manager)
            saved_env = config.get("active_env") or "Produkce"
            if saved_env in config:
                env_creds = config[saved_env]
                tenant_id = env_creds.get("tenant_id", "")
                client_id = env_creds.get("client_id", "")
                client_secret = env_creds.get("client_secret", "")
                auth_mode = env_creds.get("auth_mode", "password")
                username = env_creds.get("username", "")
                password = env_creds.get("password", "")
                sso_token = env_creds.get("sso_token", "")
                scope = env_creds.get("scope", "")
                
                # Obnovení relace proběhne POUZE pokud jsou v cookie výslovně uloženy platné údaje uživatele
                should_auto_login = False
                if auth_mode == "sso" and sso_token.strip():
                    should_auto_login = True
                elif auth_mode == "password" and username.strip() and password:
                    should_auto_login = True
                elif auth_mode == "client_credentials" and client_id.strip() and client_secret.strip():
                    should_auto_login = True
                    
                if should_auto_login:
                    base_domain = config_manager.ENVIRONMENTS[saved_env]
                    idp_url = f"https://{base_domain}/api/asol/idp"
                    api_url = f"https://{base_domain}/api/asol/ds/api/v1/OperatingLogs"
                    
                    if auth_mode == "sso":
                        token = sso_token.replace("Bearer ", "").strip()
                    else:
                        token = api_client.fetch_token(
                            idp_url, client_id, client_secret, tenant_id, scope,
                            auth_mode=auth_mode, username=username, password=password
                        )
                        
                    if token:
                        st.session_state['access_token'] = token
                        st.session_state['active_env'] = saved_env
                        st.session_state['user_claims'] = api_client.parse_jwt_token(token)
                        st.session_state['credentials'] = {
                            'idp_url': idp_url,
                            'api_url': api_url,
                            'tenant_id': tenant_id,
                            'client_id': client_id,
                            'client_secret': client_secret,
                            'auth_mode': auth_mode,
                            'username': username,
                            'password': password,
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
@st.dialog("🔑 Autentikace & Nastavení")
def show_login_dialog():
    config = config_manager.load_config(cookie_manager)
    env_names = list(config_manager.ENVIRONMENTS.keys())
    
    # 1. Vybereme aktivní prostředí (výchozí podle session state nebo prvního v seznamu)
    default_env = st.session_state.get('active_env', 'Produkce')
    if default_env not in env_names:
        default_env = 'Produkce'
        
    selected_env = st.selectbox(
        "Prostředí (API Base URL)", 
        env_names, 
        index=env_names.index(default_env),
        format_func=lambda e: f"{e} (https://{config_manager.ENVIRONMENTS[e]})",
        filter_mode="contains"
    )
    
    # 2. Získáme uložené přihlašovací údaje pro dané prostředí
    creds = config.get(selected_env, {
        "auth_mode": "password",
        "tenant_id": "ASOLEU",
        "client_id": "",
        "client_secret": "",
        "username": "",
        "password": "",
        "scope": ""
    })

    base_domain = config_manager.ENVIRONMENTS[selected_env]

    # Uživatelské jméno a Heslo vedle sebe přesně jako v BankApp Inspectoru
    col_u, col_p = st.columns(2)
    with col_u:
        username = st.text_input("Uživatelské jméno", value=creds.get('username', ''), placeholder="jan.novak@firma.cz")
    with col_p:
        password = st.text_input("Heslo", type="password", value=creds.get('password', ''), placeholder="••••••••")

    with st.expander("🔧 Upřesnit Tenant ID a klientské klíče (volitelné)", expanded=False):
        tenant_id = st.text_input("Tenant ID (tid):", value=creds.get('tenant_id', 'ASOLEU'))
        c_cid, c_csec = st.columns(2)
        with c_cid:
            client_id = st.text_input("Client ID:", value=creds.get('client_id', ''), help="Ponechte prázdné pro výchozí klientský klíč platformy")
        with c_csec:
            client_secret = st.text_input("Client Secret:", type="password", value=creds.get('client_secret', ''), help="Ponechte prázdné pro výchozí klientský klíč platformy")
        scope = st.text_input("Scope:", value=creds.get('scope', ''))

    if 'tenant_id' not in locals():
        tenant_id = creds.get('tenant_id', 'ASOLEU')
    if 'client_id' not in locals():
        client_id = creds.get('client_id', '')
    if 'client_secret' not in locals():
        client_secret = creds.get('client_secret', '')
    if 'scope' not in locals():
        scope = creds.get('scope', '')

    # Oddělovač přesně podle BankApp inspectoru
    ui_helpers.render_html("""
    <div style="display: flex; align-items: center; margin: 14px 0 10px 0;">
        <div style="flex-grow: 1; border-top: 1px solid #cbd5e1;"></div>
        <span style="margin: 0 12px; font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Inter', sans-serif;">nebo Přímý Bearer Token</span>
        <div style="flex-grow: 1; border-top: 1px solid #cbd5e1;"></div>
    </div>
    """)

    sso_token = st.text_area(
        "Existující Bearer Token (AccessToken)", 
        value=creds.get('sso_token', ''), 
        placeholder="eyJhbGciOi...", 
        height=75
    )

    st.markdown("<div style='height: 8px;'></div>", unsafe_allow_html=True)

    # Řádek tlačítek dole: Odhlásit vlevo, Zavřít a Přihlásit & Načíst vpravo
    btn_cols = st.columns([1.2, 1.0, 1.8])
    with btn_cols[0]:
        if st.session_state.get('access_token'):
            if st.button("↪ Odhlásit", key="dlg_btn_logout", width="stretch"):
                st.session_state['access_token'] = None
                st.session_state['impersonated_access_token'] = None
                st.session_state['impersonated_tenant_id'] = None
                st.session_state['impersonated_key'] = None
                st.session_state['user_claims'] = None
                st.toast("Byl jste úspěšně odhlášen.", icon="↪️")
                st.rerun()
    with btn_cols[1]:
        if st.button("Zavřít", key="dlg_btn_close", width="stretch"):
            st.rerun()
    with btn_cols[2]:
        do_login = st.button("🔌 Přihlásit & Načíst", type="primary", key="dlg_btn_login", width="stretch")

    if do_login:
        # Detekce použitého režimu podle vyplnění polí
        if sso_token.strip():
            auth_mode = 'sso'
        elif username.strip() and password:
            auth_mode = 'password'
        elif client_id.strip() and client_secret.strip():
            auth_mode = 'client_credentials'
        else:
            auth_mode = 'password'

        config[selected_env] = {
            "auth_mode": auth_mode,
            "tenant_id": tenant_id,
            "sso_token": sso_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username,
            "password": password,
            "scope": scope
        }
        config["active_env"] = selected_env
        st.session_state['pending_config_to_save'] = config
        
        idp_url = f"https://{base_domain}/api/asol/idp"
        api_url = f"https://{base_domain}/api/asol/ds/api/v1/OperatingLogs"
        
        try:
            if auth_mode == 'sso':
                token = sso_token.replace("Bearer ", "").strip()
                if not token:
                    st.error("Zadejte platný přístupový token (Bearer JWT).")
                    return
            elif auth_mode == 'password':
                if not username.strip() or not password:
                    st.error("Zadejte uživatelské jméno a heslo.")
                    return
                token = api_client.fetch_token(
                    idp_url, client_id, client_secret, tenant_id, scope,
                    auth_mode='password', username=username, password=password
                )
            else:
                if not client_id.strip() or not client_secret.strip():
                    st.error("Zadejte Client ID a Client Secret.")
                    return
                token = api_client.fetch_token(
                    idp_url, client_id, client_secret, tenant_id, scope,
                    auth_mode='client_credentials'
                )

            # Dekódování nároků (claims) a rolí z JWT tokenu
            claims = api_client.parse_jwt_token(token)
            st.session_state['user_claims'] = claims
            st.session_state['access_token'] = token
            st.session_state['active_env'] = selected_env
            st.session_state['credentials'] = {
                'idp_url': idp_url,
                'api_url': api_url,
                'tenant_id': tenant_id,
                'client_id': client_id,
                'client_secret': client_secret,
                'auth_mode': auth_mode,
                'username': username,
                'password': password,
                'scope': scope
            }
            # Signal tenant tab to refresh tenant list
            st.session_state['refresh_tenant_list'] = True
            st.session_state['fetched_logs'] = []
            st.session_state['fetched_details'] = {}
            st.session_state['fetched_datasources'] = {}
            st.session_state['current_offset'] = 0
            st.session_state['input_queue_items'] = []
            st.session_state['input_queue_offset'] = 0
            st.session_state['output_queue_items'] = []
            st.session_state['output_queue_offset'] = 0
            st.session_state.pop('cached_data_agents', None)
            st.session_state.pop('cached_data_sources', None)
            
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

# Načtení seznamu tenantů z IDP pro rychlou impersonaci v hlavičce (pokud ještě není načten)
if 'user_tenants_list' not in st.session_state:
    st.session_state['user_tenants_list'] = []

if not st.session_state['user_tenants_list'] and st.session_state.get('access_token'):
    try:
        t_data = api_client.fetch_user_tenants(
            st.session_state['credentials']['api_url'],
            st.session_state['access_token'],
            st.session_state['credentials']['tenant_id']
        )
        if isinstance(t_data, list):
            st.session_state['user_tenants_list'] = t_data
    except Exception:
        pass

# --- KOMPAKTNÍ HLAVIČKA (VE STYLU BANKAPP INSPECTOR) ---
is_logged_in = bool(st.session_state.get('access_token'))

if is_logged_in:
    header_col1, header_col2, header_col3 = st.columns([1.5, 2.2, 2.3], vertical_alignment="center")
else:
    header_col1, header_col2, header_col3 = st.columns([1.6, 1.4, 2.6], vertical_alignment="center")

with header_col1:
    ui_helpers.render_html("""
    <div style="display: flex; align-items: center; gap: 12px; padding: 2px 0;">
        <div style="width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #009688 0%, #10b981 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.25rem; box-shadow: 0 4px 10px rgba(0, 150, 136, 0.28); flex-shrink: 0;">
            📊
        </div>
        <div>
            <div style="font-size: 1.2rem; font-weight: 800; color: #00796b; line-height: 1.2; letter-spacing: -0.02em; font-family: 'Inter', sans-serif;">
                AVA Monitor
            </div>
            <div style="font-size: 0.73rem; color: #64748b; font-weight: 500; font-family: 'Inter', sans-serif;">
                Monitor operačního logu, front & agentů
            </div>
        </div>
    </div>
    """)
    if st.session_state.get('user_claims'):
        claims = st.session_state['user_claims']
        email = claims.get('email') or claims.get('unique_name') or claims.get('sub') or 'Platformní uživatel'
        roles = claims.get('role') or claims.get('roles') or []
        roles_str = ", ".join(roles) if isinstance(roles, list) else str(roles)
        role_badge = f"{ui_helpers.render_badge(f'Role: {roles_str}', 'neutral', icon='🛡️')}" if roles_str else ""
        ui_helpers.render_html(f"""
        <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
            {ui_helpers.render_badge(email, 'neutral', icon='👤')}
            {role_badge}
        </div>
        """)

with header_col2:
    if is_logged_in:
        master_tid = st.session_state.get('credentials', {}).get('tenant_id', '')
        imp_tid = st.session_state.get('impersonated_tenant_id')
        active_tid = imp_tid if imp_tid else master_tid
        known_tenants = st.session_state.get('user_tenants_list', [])
        
        # Abecední řazení tenantů A-Z podle názvu a ID
        sorted_tenants = sorted(known_tenants, key=lambda t: str(t.get('name') or t.get('id') or '').lower())

        # Sestavení možností pro rozevírací seznam (seřazeno A-Z)
        default_lbl = f"🏢 Tenant: {master_tid} (Výchozí)"
        tenant_options = [default_lbl]
        tenant_lookup = {default_lbl: None}
        for t in sorted_tenants:
            tid = t.get('id')
            if tid and tid != master_tid:
                lbl = f"🏢 {t.get('name')} ({tid})"
                tenant_options.append(lbl)
                tenant_lookup[lbl] = t
        tenant_options.append("✏️ Ruční zadání ID...")

        # Detekce výchozího indexu podle aktivní impersonace
        cur_tenant_idx = 0
        if imp_tid:
            for idx_t, opt_t in enumerate(tenant_options):
                if opt_t != default_lbl and opt_t != "✏️ Ruční zadání ID...":
                    t_info = tenant_lookup.get(opt_t)
                    if t_info and t_info.get('id') == imp_tid:
                        cur_tenant_idx = idx_t
                        break

        c_imp1, c_imp2 = st.columns([1.9, 1.0], vertical_alignment="center")
        with c_imp1:
            sel_imp_tenant = st.selectbox(
                "Výběr tenanta:",
                options=tenant_options,
                index=cur_tenant_idx,
                key="header_imp_selectbox",
                filter_mode="contains",
                label_visibility="collapsed"
            )
        
        target_tid = ""
        target_org = ""

        if sel_imp_tenant == "✏️ Ruční zadání ID...":
            with c_imp1:
                input_imp_val = st.text_input(
                    "Tenant ID:",
                    value=st.session_state.get('header_impersonation_val', ''),
                    placeholder="Tenant ID...",
                    key="header_impersonation_val"
                ).strip()
            with c_imp2:
                input_org_val = st.text_input(
                    "🏢 Kód org.:",
                    value=st.session_state.get('header_impersonation_org_val', ''),
                    placeholder="KódOrg...",
                    key="header_impersonation_org_val"
                ).strip()
            target_tid = input_imp_val
            target_org = input_org_val
            if '|' in target_tid:
                parts = target_tid.split('|', 1)
                target_tid = parts[0].strip()
                if not target_org:
                    target_org = parts[1].strip()
        elif sel_imp_tenant != default_lbl and sel_imp_tenant in tenant_lookup:
            t_obj = tenant_lookup[sel_imp_tenant]
            target_tid = t_obj['id']
            orgs = sorted(t_obj.get('orgs') or ([t_obj['ownerOrgCode']] if t_obj.get('ownerOrgCode') else []), key=lambda x: str(x).lower())
            if len(orgs) > 1:
                with c_imp2:
                    target_org = st.selectbox("🏢 Kód org.:", options=orgs, key=f"hdr_org_select_{target_tid}", filter_mode="contains", label_visibility="collapsed")
            elif len(orgs) == 1:
                target_org = orgs[0]
                with c_imp2:
                    st.text_input("🏢 Kód org.:", value=target_org, disabled=True, key=f"hdr_org_disp_{target_tid}", label_visibility="collapsed")
            else:
                with c_imp2:
                    target_org = st.text_input("🏢 Kód org.:", value="", key=f"hdr_org_empty_{target_tid}", label_visibility="collapsed").strip()
        else:
            with c_imp2:
                if imp_tid:
                    ui_helpers.render_html(f'<div style="display: flex; align-items: center; height: 38px;">{ui_helpers.render_badge(f"Impersonace: {imp_tid[:12]}...", "warning", icon="🔑")}</div>')
                else:
                    ui_helpers.render_html(f'<div style="display: flex; align-items: center; height: 38px;">{ui_helpers.render_badge("Režim přihlášeného tenanta", "teal")}</div>')

        imp_key = f"{target_tid}::{target_org}" if target_org else target_tid

        # Vyhodnocení spuštění nebo zrušení impersonace
        if target_tid and target_tid != master_tid:
            if st.session_state.get('impersonated_key') != imp_key and st.session_state.get('failed_impersonated_key') != imp_key:
                with st.spinner(f"Provádím impersonaci za tenant ID '{target_tid}'..."):
                    master_token = st.session_state['access_token']
                    master_cid = st.session_state['credentials'].get('client_id')
                    api_url = st.session_state['credentials']['api_url']
                    
                    imp_token, imp_log = api_client.fetch_impersonation_token(
                        api_url, master_token, target_tid, target_org_code=target_org, client_id=master_cid
                    )
                    if imp_token:
                        st.session_state['impersonated_access_token'] = imp_token
                        st.session_state['impersonated_tenant_id'] = target_tid
                        st.session_state['impersonated_key'] = imp_key
                        st.session_state['header_imp_error_log'] = None
                        st.session_state['failed_impersonated_key'] = None
                        st.session_state[f"imp_log_v3_{target_tid}"] = imp_log
                        # Vyčištění keše datových záložek pro načtení nového tenanta
                        for cache_k in ['fetched_logs', 'cached_data_agents', 'cached_data_sources', 'input_queue_items', 'output_queue_items']:
                            st.session_state.pop(cache_k, None)
                        st.toast(f"✅ Impersonace ÚSPĚŠNÁ za tenant: {target_tid}", icon="🔑")
                        st.rerun()
                    else:
                        st.session_state['impersonated_access_token'] = None
                        st.session_state['impersonated_tenant_id'] = None
                        st.session_state['impersonated_key'] = None
                        st.session_state['failed_impersonated_key'] = imp_key
                        st.session_state['header_imp_error_log'] = (target_tid, imp_log)
                        st.rerun()
        else:
            if st.session_state.get('impersonated_key') is not None or st.session_state.get('failed_impersonated_key') is not None:
                st.session_state['impersonated_access_token'] = None
                st.session_state['impersonated_tenant_id'] = None
                st.session_state['impersonated_key'] = None
                st.session_state['failed_impersonated_key'] = None
                st.session_state['header_imp_error_log'] = None
                for cache_k in ['fetched_logs', 'cached_data_agents', 'cached_data_sources', 'input_queue_items', 'output_queue_items']:
                    st.session_state.pop(cache_k, None)
                st.toast("ℹ️ Impersonace zrušena. Návrat k přihlášenému tenantovi.", icon="ℹ️")
                st.rerun()

with header_col3:
    env_name = st.session_state.get('active_env', 'Produkce')
    env_domain = config_manager.ENVIRONMENTS.get(env_name, 'avaplace.com')

    if is_logged_in:
        # Přihlášený stav: Všechny 3 prvky v jednom vodorovném řádku
        h_sub1, h_sub2, h_sub3 = st.columns([1.3, 1.1, 0.9], vertical_alignment="center")
        with h_sub1:
            ui_helpers.render_html(f"""
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; height: 38px;">
                {ui_helpers.render_badge(f"https://{env_domain}", 'teal', icon='🌐')}
                {ui_helpers.render_badge("Online", 'success', icon='●')}
            </div>
            """)
        with h_sub2:
            if st.button("⚙️ Nastavení", key="hdr_btn_settings", width="stretch", help="Otevřít autentikaci a nastavení prostředí"):
                show_login_dialog()
        with h_sub3:
            if st.button("↪ Odhlásit", key="hdr_btn_logout", width="stretch", help="Odhlásit z platformy"):
                st.session_state['access_token'] = None
                st.session_state['impersonated_access_token'] = None
                st.session_state['impersonated_tenant_id'] = None
                st.session_state['impersonated_key'] = None
                st.session_state['user_claims'] = None
                st.toast("Byl jste úspěšně odhlášen.", icon="↪️")
                st.rerun()
    else:
        # Nepřihlášený stav: Informace o prostředí a tlačítko Přihlášení na JEDNOM řádku
        h_sub1, h_sub2 = st.columns([1.5, 1.2], vertical_alignment="center")
        with h_sub1:
            ui_helpers.render_html(f"""
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 5px; height: 38px;">
                {ui_helpers.render_badge(f"https://{env_domain}", 'teal', icon='🌐')}
                {ui_helpers.render_badge("Odpojeno", 'error', icon='○')}
            </div>
            """)
        with h_sub2:
            if st.button("🔑 Přihlásit se", type="primary", key="hdr_btn_login_main", width="stretch", help="Přihlásit se k Avaplace platformě"):
                show_login_dialog()

# Zobrazení detailní chybové odpovědi ze serveru při selhání impersonace
if st.session_state.get('header_imp_error_log'):
    err_tid, err_log = st.session_state['header_imp_error_log']
    st.error(f"❌ Impersonace za tenant '{err_tid}' selhala.")
    with st.expander(f"🔍 Detailní chybová odpověď IDP serveru pro tenant '{err_tid}'", expanded=True):
        st.markdown(err_log)

# Zastavení aplikace, POKUD NEJSME PŘIHLÁŠENI
if not st.session_state['access_token']:
    st.info("Aplikace není připojena k API. Klikněte na tlačítko nastavení vpravo nahoře pro výběr prostředí a přihlášení.")
    st.stop()

# --- TABS MONITORINGU (S PROGRAMOVÝM PŘEPÍNÁNÍM) ---
TAB_OPTIONS = [
    "📊 Provozní logy",
    "📥 Vstupní fronta (SourcingData)",
    "📤 Výstupní fronta (QueryingData)",
    "🤖 Data Agenti",
    "🔌 Data Sources",
    "📡 Status Consumerů (MSGGW)",
    "🔗 Webhooky & Routing",
    "📈 Statistika použití (UsageStatistics)",
    "🏢 Statistika tenantů"
]

if 'pending_nav_tab' in st.session_state and st.session_state['pending_nav_tab'] in TAB_OPTIONS:
    st.session_state["main_active_tab"] = st.session_state['pending_nav_tab']
    del st.session_state['pending_nav_tab']

if "main_active_tab" not in st.session_state or st.session_state["main_active_tab"] not in TAB_OPTIONS:
    st.session_state["main_active_tab"] = TAB_OPTIONS[0]

st.components.v1.html("""
<script>
    const parentDoc = window.parent.document;
    function autoSelectComboboxText() {
        parentDoc.addEventListener('focusin', function(e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.getAttribute('role') === 'combobox')) {
                setTimeout(function() {
                    if (typeof e.target.select === 'function') {
                        e.target.select();
                    }
                }, 30);
            }
        }, true);
        parentDoc.addEventListener('click', function(e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.getAttribute('role') === 'combobox')) {
                setTimeout(function() {
                    if (typeof e.target.select === 'function') {
                        e.target.select();
                    }
                }, 30);
            }
        }, true);
    }
    autoSelectComboboxText();
</script>
""", height=0)

active_tab_selected = st.radio(
    "Hlavní navigace:",
    options=TAB_OPTIONS,
    key="main_active_tab",
    horizontal=True,
    label_visibility="collapsed"
)

if active_tab_selected == TAB_OPTIONS[0]:
    tab_logs.render_tab()
elif active_tab_selected == TAB_OPTIONS[1]:
    tab_input_queue.render_tab()
elif active_tab_selected == TAB_OPTIONS[2]:
    tab_output_queue.render_tab()
elif active_tab_selected == TAB_OPTIONS[3]:
    tab_data_agents.render_tab()
elif active_tab_selected == TAB_OPTIONS[4]:
    tab_data_sources.render_tab()
elif active_tab_selected == TAB_OPTIONS[5]:
    tab_msggw.render_tab()
elif active_tab_selected == TAB_OPTIONS[6]:
    tab_webhooks.render_tab()
elif active_tab_selected == TAB_OPTIONS[7]:
    tab_usage_stats.render_tab()
elif active_tab_selected == TAB_OPTIONS[8]:
    tab_tenant_statistics.render_tab(cookie_manager)
