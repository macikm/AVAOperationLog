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
            
        total_tenants = len(df_usage)
        unique_orgs = df_usage['ownerOrgName'].nunique() if 'ownerOrgName' in df_usage.columns else total_tenants
        unique_org_codes = df_usage['ownerOrgCode'].nunique() if 'ownerOrgCode' in df_usage.columns else 0

        st.markdown("---")
        st.markdown("#### 🗂️ Tenanti používající aplikaci: **" + application_code.strip() + "**")

        # KPI Summarizační karty a ovladač výšky gridu
        kpi_col1, kpi_col2, kpi_col3, kpi_col4 = st.columns([2, 2, 2, 3])
        with kpi_col1:
            st.metric(label="👥 Celkem tenantů", value=f"{total_tenants}")
        with kpi_col2:
            st.metric(label="🏢 Unikátních organizací", value=f"{unique_orgs}")
        with kpi_col3:
            st.metric(label="🏷️ Unikátních kódů org.", value=f"{unique_org_codes}")
        with kpi_col4:
            grid_height_opt = st.selectbox(
                "📐 Výška tabulky (protáhnutí délky):",
                options=["Plná délka / Všechny řádky (Auto)", "Extra vysoká (1000 px)", "Vysoká (750 px)", "Střední (500 px)", "Kompaktní (350 px)"],
                index=0,
                key="usage_stats_grid_height_select"
            )

        if grid_height_opt == "Plná délka / Všechny řádky (Auto)":
            calc_height = None
        elif grid_height_opt == "Extra vysoká (1000 px)":
            calc_height = 1000
        elif grid_height_opt == "Vysoká (750 px)":
            calc_height = 750
        elif grid_height_opt == "Střední (500 px)":
            calc_height = 500
        else:
            calc_height = 350

        # Přidání sumarizačního řádku na konec tabulky
        summary_row = {
            'tenantName': f"∑ SUMÁŘ CELKEM ({total_tenants} tenantů)",
            'tenantId': f"{total_tenants} tenantů",
            'ownerOrgName': f"Unikátních org.: {unique_orgs}",
            'ownerOrgCode': f"Unikátních kódů: {unique_org_codes}",
            'ownerOrgId': f"Celkem záznamů: {total_tenants}"
        }
        df_display_usage = pd.concat([df_usage, pd.DataFrame([summary_row])], ignore_index=True)

        st.dataframe(
            df_display_usage,
            use_container_width=True,
            height=calc_height,
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
