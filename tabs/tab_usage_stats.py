import streamlit as st
import pandas as pd
import api_client

def render_tab():
    st.markdown("### 📈 Statistika použití (UsageStatistics)")
    st.info("Poznámka: statistika použití je dostupná pouze pro ASOLEU připojení.")

    if 'usage_stats_application_options' not in st.session_state:
        st.session_state['usage_stats_application_options'] = []

    application_options = st.session_state['usage_stats_application_options']
    if not application_options:
        try:
            with st.spinner("Načítám seznam aplikací ..."):
                integrated_apps_data = api_client.fetch_integrated_applications(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id']
                )
            if isinstance(integrated_apps_data, dict) and 'items' in integrated_apps_data:
                app_items = integrated_apps_data['items']
            elif isinstance(integrated_apps_data, list):
                app_items = integrated_apps_data
            else:
                app_items = []
            application_options = sorted([item.get('code') for item in app_items if isinstance(item, dict) and item.get('code')], key=lambda x: str(x).lower())
            st.session_state['usage_stats_application_options'] = application_options
        except Exception as e:
            st.error(f"Nelze načíst seznam aplikací: {e}")
            application_options = []

    application_options = sorted(application_options, key=lambda x: str(x).lower())
    application_code_options = ["-- Vyberte aplikaci --"] + application_options
    selected_index = 0
    if st.session_state['usage_stats_application_code'] in application_options:
        selected_index = application_options.index(st.session_state['usage_stats_application_code']) + 1
    application_code = st.selectbox("Application Code:", options=application_code_options, index=selected_index, key="usage_stats_select_app")
    if application_code == "-- Vyberte aplikaci --":
        application_code = ""

    if st.button("🚀 Načíst statistiku použití", key="btn_load_usage_stats"):
        if not application_code.strip():
            st.error("Zadejte prosím 'Application Code' pro načtení statistik použití.")
        else:
            st.session_state['usage_stats_application_code'] = application_code.strip()
            st.session_state['usage_stats_items'] = []
            with st.spinner("Načítám UsageStatistics ..."):
                try:
                    usage_data = api_client.fetch_usage_statistics(
                        st.session_state['credentials']['api_url'],
                        st.session_state['access_token'],
                        st.session_state['credentials']['tenant_id'],
                        application_code
                    )
                    if isinstance(usage_data, dict) and 'items' in usage_data:
                        st.session_state['usage_stats_items'] = usage_data['items']
                    elif isinstance(usage_data, list):
                        st.session_state['usage_stats_items'] = usage_data
                    else:
                        st.session_state['usage_stats_items'] = []
                    st.rerun()
                except Exception as e:
                    st.error(f"Načtení UsageStatistics selhalo: {e}")

    if st.session_state['usage_stats_items']:
        df_usage = pd.DataFrame(st.session_state['usage_stats_items'])
        desired_columns = ['tenantName', 'tenantId', 'ownerOrgName', 'ownerOrgCode', 'ownerOrgId']
        df_usage = df_usage[[c for c in desired_columns if c in df_usage.columns]].copy()
        
        # Seřadit podle tenantName
        if 'tenantName' in df_usage.columns:
            df_usage = df_usage.sort_values(by='tenantName', key=lambda x: x.str.lower()).reset_index(drop=True)
            
        st.markdown("#### 🗂️ Tenanti používající aplikaci " + application_code.strip())
        st.markdown("""
<style>
/* Vyhledáme následující element-container a roztáhneme tabulku i její vnitřní kontejnery na výšku viewportu */
div.element-container:has(.usage-stats-marker) + div.element-container div[data-testid="stDataFrame"],
div.element-container:has(.usage-stats-marker) + div.element-container div[data-testid="stDataFrame"] > div,
div.element-container:has(.usage-stats-marker) + div.element-container div[data-testid="stDataFrame"] > div > div,
div.element-container:has(.usage-stats-marker) + div.element-container div[data-testid="stDataFrame"] > div > div > div {
    height: calc(100vh - 450px) !important;
    min-height: 400px !important;
}
</style>
<div class="usage-stats-marker"></div>
""", unsafe_allow_html=True)
        st.dataframe(
            df_usage,
            use_container_width=True,
            height=650,
            hide_index=True,
            column_config={
                'tenantName': st.column_config.TextColumn(label='Název tenanta\n(tenantName)'),
                'tenantId': st.column_config.TextColumn(label='Id tenanta\n(tenantId)'),
                'ownerOrgName': st.column_config.TextColumn(label='Název organizace\n(ownerOrgName)'),
                'ownerOrgCode': st.column_config.TextColumn(label='Kód organizace\n(ownerOrgCode)'),
                'ownerOrgId': st.column_config.TextColumn(label='Id organizace\n(ownerOrgId)')
            }
        )
    elif application_code.strip():
        st.warning("Pro zadaný Application Code nebyla nalezena žádná data UsageStatistics.")
