import streamlit as st
import pandas as pd
import extra_streamlit_components as stx
import config_manager
import api_client
import ui_helpers
from tabs import tab_logs, tab_input_queue, tab_output_queue, tab_usage_stats, tab_tenant_statistics, tab_data_agents, tab_data_sources

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
    /* Povolí drag & drop změnu výšky (chycením za pravý spodní roh) u všech tabulek */
    div[data-testid="stDataFrame"] {
        resize: vertical !important;
        overflow: auto !important;
        min-height: 250px !important;
    }
    div[data-testid="stDataFrame"] > div {
        height: 100% !important;
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
@st.dialog("🔑 Přihlášení k Avaplace API")
def show_login_dialog():
    config = config_manager.load_config(cookie_manager)
    env_names = list(config_manager.ENVIRONMENTS.keys())
    
    # 1. Vybereme aktivní prostředí (výchozí podle session state nebo prvního v seznamu)
    default_env = st.session_state.get('active_env', 'Produkce')
    if default_env not in env_names:
        default_env = 'Produkce'
        
    selected_env = st.selectbox(
        "Cílové prostředí (Stage):", 
        env_names, 
        index=env_names.index(default_env)
    )
    
    # 2. Získáme uložené přihlašovací údaje pro dané prostředí
    creds = config.get(selected_env, {
        "auth_mode": "client_credentials",
        "tenant_id": "",
        "client_id": "",
        "client_secret": "",
        "username": "",
        "password": "",
        "scope": ""
    })

    auth_options = [
        "👤 Uživatelské přihlášení (Jméno a Heslo)",
        "🏢 Klientské údaje (Client ID & Client Secret)",
        "🌐 Platformní SSO / OIDC (Bearer token z prohlížeče)"
    ]
    saved_auth_mode = creds.get('auth_mode', 'password')
    if saved_auth_mode == 'client_credentials':
        auth_idx = 1
    elif saved_auth_mode == 'sso':
        auth_idx = 2
    else:
        auth_idx = 0
        
    selected_auth_str = st.radio("Způsob přihlášení k platformě:", auth_options, index=auth_idx)
    if selected_auth_str == auth_options[1]:
        auth_mode = 'client_credentials'
    elif selected_auth_str == auth_options[2]:
        auth_mode = 'sso'
    else:
        auth_mode = 'password'
    
    st.markdown("---")
    tenant_id = st.text_input("Tenant ID (tid):", value=creds.get('tenant_id', 'ASOLEU'))
    base_domain = config_manager.ENVIRONMENTS[selected_env]

    if auth_mode == 'password':
        username = st.text_input("Uživatelské jméno / E-mail:", value=creds.get('username', ''))
        password = st.text_input("Heslo:", type="password", value=creds.get('password', ''))
        with st.expander("🔧 Klientské klíče aplikace (volitelně)", expanded=False):
            client_id = st.text_input("Client ID:", value=creds.get('client_id', ''), help="Ponechte prázdné pro výchozí klientský klíč aplikace")
            client_secret = st.text_input("Client Secret:", type="password", value=creds.get('client_secret', ''), help="Ponechte prázdné pro výchozí klientský klíč aplikace")
        sso_token = ""
        scope = ""
    elif auth_mode == 'client_credentials':
        client_id = st.text_input("Client ID:", value=creds.get('client_id', ''))
        client_secret = st.text_input("Client Secret:", type="password", value=creds.get('client_secret', ''))
        scope = st.text_input("Scope (volitelné):", value=creds.get('scope', ''))
        username = ""
        password = ""
        sso_token = ""
    else:
        st.markdown(f"""
        <div style="background-color: rgba(0, 122, 255, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(0, 122, 255, 0.2); margin-bottom: 12px;">
            <p style="margin: 0; font-size: 0.9rem;"><strong>🌐 Platformní SSO ({selected_env})</strong></p>
            <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #555;">Vložte váš platný přístupový token (Bearer JWT) z aktivní relace platformy ({base_domain}).</p>
        </div>
        """, unsafe_allow_html=True)
        sso_token = st.text_area("Přístupový token (Bearer JWT):", value=creds.get('sso_token', ''), height=100)
        username = ""
        password = ""
        client_id = ""
        client_secret = ""
        scope = ""
    
    if st.button("Uložit do prohlížeče a přihlásit se", width="stretch"):
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

# --- KOMPAKTNÍ HLAVIČKA ---
header_col1, header_col2, header_col3 = st.columns([2.3, 2.2, 1.2])
with header_col1:
    st.markdown("### 📊 AVA Monitor")
    if st.session_state.get('user_claims'):
        claims = st.session_state['user_claims']
        email = claims.get('email') or claims.get('unique_name') or claims.get('sub') or 'Platformní uživatel'
        roles = claims.get('role') or claims.get('roles') or []
        roles_str = ", ".join(roles) if isinstance(roles, list) else str(roles)
        role_badge = f" | 🛡️ Role: `{roles_str}`" if roles_str else ""
        master_tid = st.session_state.get('credentials', {}).get('tenant_id', '')
        imp_tid = st.session_state.get('impersonated_tenant_id')
        if imp_tid:
            st.caption(f"👤 **{email}**{role_badge} | 🏢 Přihlášen: `{master_tid}` ➔ 🔑 Impersonován: `{imp_tid}`")
        else:
            st.caption(f"👤 **{email}**{role_badge} | 🏢 Tenant: `{master_tid}`")

with header_col2:
    if st.session_state.get('access_token'):
        master_tid = st.session_state.get('credentials', {}).get('tenant_id', '')
        input_imp_val = st.session_state.get('header_impersonation_val', '')
        
        target_imp_tid = st.text_input(
            "🔑 Impersonovat Tenant ID (pro datové záložky):",
            value=input_imp_val,
            placeholder="Ponechte prázdné pro přihlášeného tenanta...",
            key="header_impersonation_val",
            help="Zadejte Tenant ID a stiskněte Enter. Všechny datové záložky se přepnou na tohoto zadaného tenanta."
        ).strip()

        # Vyhodnocení spuštění nebo zrušení impersonace
        if target_imp_tid and target_imp_tid != master_tid:
            if st.session_state.get('impersonated_tenant_id') != target_imp_tid and st.session_state.get('failed_impersonated_tenant_id') != target_imp_tid:
                with st.spinner(f"Provádím impersonaci za tenant ID '{target_imp_tid}'..."):
                    master_token = st.session_state['access_token']
                    master_cid = st.session_state['credentials'].get('client_id')
                    api_url = st.session_state['credentials']['api_url']
                    
                    imp_token, imp_log = api_client.fetch_impersonation_token(
                        api_url, master_token, target_imp_tid, client_id=master_cid
                    )
                    if imp_token:
                        st.session_state['impersonated_access_token'] = imp_token
                        st.session_state['impersonated_tenant_id'] = target_imp_tid
                        st.session_state['header_imp_error_log'] = None
                        st.session_state['failed_impersonated_tenant_id'] = None
                        st.session_state[f"imp_log_v3_{target_imp_tid}"] = imp_log
                        # Vyčištění keše datových záložek pro načtení nového tenanta
                        for cache_k in ['fetched_logs', 'cached_data_agents', 'cached_data_sources', 'input_queue_items', 'output_queue_items']:
                            st.session_state.pop(cache_k, None)
                        st.toast(f"✅ Impersonace ÚSPĚŠNÁ za tenant: {target_imp_tid}", icon="🔑")
                        st.rerun()
                    else:
                        st.session_state['impersonated_access_token'] = None
                        st.session_state['impersonated_tenant_id'] = None
                        st.session_state['failed_impersonated_tenant_id'] = target_imp_tid
                        st.session_state['header_imp_error_log'] = (target_imp_tid, imp_log)
                        st.rerun()
        else:
            if st.session_state.get('impersonated_tenant_id') is not None or st.session_state.get('failed_impersonated_tenant_id') is not None:
                st.session_state['impersonated_access_token'] = None
                st.session_state['impersonated_tenant_id'] = None
                st.session_state['failed_impersonated_tenant_id'] = None
                st.session_state['header_imp_error_log'] = None
                for cache_k in ['fetched_logs', 'cached_data_agents', 'cached_data_sources', 'input_queue_items', 'output_queue_items']:
                    st.session_state.pop(cache_k, None)
                st.toast("ℹ️ Impersonace zrušena. Návrat k přihlášenému tenantovi.", icon="ℹ️")
                st.rerun()

with header_col3:
    env_badge = f"({st.session_state['active_env']})" if st.session_state['active_env'] else ""
    if st.button(f"🔑 Připojení {env_badge}", width="stretch"):
        show_login_dialog()

# Zobrazení detailní chybové odpovědi ze serveru při selhání impersonace
if st.session_state.get('header_imp_error_log'):
    err_tid, err_log = st.session_state['header_imp_error_log']
    st.error(f"❌ Impersonace za tenant '{err_tid}' selhala.")
    with st.expander(f"🔍 Detailní chybová odpověď IDP serveru pro tenant '{err_tid}'", expanded=True):
        st.markdown(err_log)

# Zastavení aplikace, POKUD NEJSME PŘIHLÁŠENI
if not st.session_state['access_token']:
    st.info("Aplikace není připojena k API. Klikněte na tlačítko připojení vpravo nahoře pro výběr prostředí a přihlášení.")
    st.stop()

# --- TABS MONITORINGU (S PROGRAMOVÝM PŘEPÍNÁNÍM) ---
TAB_OPTIONS = [
    "📊 Provozní logy",
    "📥 Vstupní fronta (SourcingData)",
    "📤 Výstupní fronta (QueryingData)",
    "🤖 Data Agenti",
    "🔌 Data Sources",
    "📈 Statistika použití (UsageStatistics)",
    "🏢 Statistika tenantů"
]

if 'pending_nav_tab' in st.session_state and st.session_state['pending_nav_tab'] in TAB_OPTIONS:
    st.session_state["main_active_tab"] = st.session_state['pending_nav_tab']
    del st.session_state['pending_nav_tab']

if "main_active_tab" not in st.session_state or st.session_state["main_active_tab"] not in TAB_OPTIONS:
    st.session_state["main_active_tab"] = TAB_OPTIONS[0]

# Stylování pro navigační lištu
st.markdown("""
<style>
    div[data-testid="stRadio"] > div {
        flex-direction: row !important;
        gap: 0.6rem !important;
        padding-bottom: 0.5rem !important;
    }
    div[data-testid="stRadio"] label {
        background-color: #f1f5f9 !important;
        border: 1px solid #cbd5e1 !important;
        padding: 0.5rem 1rem !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        font-weight: 600 !important;
        color: #334155 !important;
        transition: all 0.2s ease !important;
    }
    div[data-testid="stRadio"] label:hover {
        background-color: #e2e8f0 !important;
        border-color: #94a3b8 !important;
    }
    div[data-testid="stRadio"] label[data-checked="true"] {
        background-color: #2563eb !important;
        color: #ffffff !important;
        border-color: #1d4ed8 !important;
        box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2) !important;
    }
</style>
""", unsafe_allow_html=True)

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
    tab_usage_stats.render_tab()
elif active_tab_selected == TAB_OPTIONS[6]:
    tab_tenant_statistics.render_tab(cookie_manager)
