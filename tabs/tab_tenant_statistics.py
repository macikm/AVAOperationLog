import streamlit as st
import pandas as pd
import plotly.express as px
import json
import api_client
import ui_helpers

def render_tab(cookie_manager):
    st.markdown("### 🏢 Statistika aplikací používaných tenanty (TenantStatistics)")
    st.info("Poznámka: tato statistika je dostupná pouze pro ASOLEU připojení.")

    # Refresh tenant list if login just occurred
    if st.session_state.get('refresh_tenant_list'):
        st.session_state['user_tenants_list'] = []
        st.session_state['refresh_tenant_list'] = False
    # Načtení seznamu tenantů z IDP pro autocomplete
    if 'user_tenants_list' not in st.session_state:
        st.session_state['user_tenants_list'] = []

    if not st.session_state['user_tenants_list'] and st.session_state.get('access_token'):
        try:
            with st.spinner("Načítám seznam dostupných tenantů z IDP..."):
                tenants_data = api_client.fetch_user_tenants(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id']
                )
                if isinstance(tenants_data, dict) and 'items' in tenants_data:
                    st.session_state['user_tenants_list'] = tenants_data['items']
                elif isinstance(tenants_data, list):
                    st.session_state['user_tenants_list'] = tenants_data
        except Exception:
            pass

    col1, col2 = st.columns([1, 1])
    with col1:
        include_smart_check_status = st.checkbox(
            "Zobrazit smart check statusy (Healthy/Degraded/Unhealthy)",
            value=st.session_state['usage_stats_include_smart_check_status'],
            key="tenant_stats_include_smart_check_status"
        )
    with col2:
        # Vytvoříme slovník všech známých tenantů z IDP a z načtených statistik
        tenants_dict = {t.get('id'): t.get('name') or t.get('id') for t in st.session_state['user_tenants_list'] if t.get('id')}
        if st.session_state.get('usage_stats_tenant_app_items'):
            for item in st.session_state['usage_stats_tenant_app_items']:
                tid = item.get('tenantId')
                if tid and tid not in tenants_dict:
                    tenants_dict[tid] = item.get('tenantName') or tid
                    
        # Vytvoříme přímé seřazené popisky pro multiselect: "Název (ID)"
        label_to_id = {}
        for tid, name in tenants_dict.items():
            label = f"{name} ({tid})"
            label_to_id[label] = tid
            
        user_tenant_labels = sorted(list(label_to_id.keys()), key=str.lower)
        
        if user_tenant_labels:
            search_query = st.text_input(
                "Vyhledat v tenantovi (část názvu nebo ID):",
                value="",
                key="tenant_stats_search_query",
                help="Zadejte text pro vyfiltrování seznamu níže. Výsledky zůstanou seřazené podle abecedy."
            )
            
            if search_query.strip():
                q = search_query.strip().lower()
                filtered_labels = [lbl for lbl in user_tenant_labels if q in lbl.lower()]
            else:
                filtered_labels = user_tenant_labels
                
            if filtered_labels or st.session_state.get("tenant_stats_api_tenant_labels_multiselect"):
                current_selected = st.session_state.get("tenant_stats_api_tenant_labels_multiselect", [])
                options_to_show = sorted(list(set(filtered_labels + current_selected)), key=str.lower)
                selected_labels = st.multiselect(
                    "API Filtr: Vyberte ID konkrétních tenantů k načtení (vyfiltrováno):",
                    options=options_to_show,
                    default=[],
                    help="Ponechte prázdné pro načtení všech tenantů.",
                    key="tenant_stats_api_tenant_labels_multiselect"
                )
                tenant_ids = [label_to_id[lbl] for lbl in selected_labels] if selected_labels else None
            else:
                st.info("Žádný tenant neodpovídá vyhledávání.")
                tenant_ids = None
        else:
            api_tenant_ids_input = st.text_input(
                "API Filtr: Zadejte ID konkrétních tenantů (oddělené čárkou) pro načtení:",
                value="",
                help="Ponechte prázdné pro načtení všech tenantů. Urychlí načítání, pokud vás zajímají jen konkrétní partneři.",
                key="tenant_stats_api_tenant_ids"
            )
            tenant_ids = [tid.strip() for tid in api_tenant_ids_input.split(",") if tid.strip()] if api_tenant_ids_input.strip() else None

    if st.button("🚀 Načíst statistiku aplikací podle tenantů", key="btn_load_tenant_stats"):
        st.session_state['usage_stats_tenant_app_items'] = []
        # Vyresetujeme stavy lokálních filtrů, aby se po novém načtení zobrazila celá tabulka
        for k in ["tenant_stats_local_tenant_multiselect", "tenant_stats_smart_check_filter", "df_tenant_selection_new"]:
            if k in st.session_state:
                del st.session_state[k]
                
        with st.spinner("Načítám UsageStatistics tenant-app ..."):
            try:
                tenant_app_data = api_client.fetch_applications_used_by_tenants(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id'],
                    tenant_ids=tenant_ids,
                    include_smart_check_status=include_smart_check_status
                )
                if isinstance(tenant_app_data, dict) and 'items' in tenant_app_data:
                    st.session_state['usage_stats_tenant_app_items'] = tenant_app_data['items']
                elif isinstance(tenant_app_data, list):
                    st.session_state['usage_stats_tenant_app_items'] = tenant_app_data
                else:
                    st.session_state['usage_stats_tenant_app_items'] = []
                st.rerun()
            except Exception as e:
                st.error(f"Načtení statistik aplikací selhalo: {e}")

    if st.session_state['usage_stats_tenant_app_items']:
        df_tenant_apps = pd.DataFrame(st.session_state['usage_stats_tenant_app_items'])
        
        # Seřadit abecedně podle tenantName
        if 'tenantName' in df_tenant_apps.columns:
            df_tenant_apps = df_tenant_apps.sort_values(by='tenantName', key=lambda x: x.str.lower()).reset_index(drop=True)
            
        # Spočítat počet aplikací pro každého tenanta
        if 'applications' in df_tenant_apps.columns:
            df_tenant_apps['appCount'] = df_tenant_apps['applications'].apply(lambda x: len(x) if isinstance(x, list) else 0)
        else:
            df_tenant_apps['appCount'] = 0

        # Zobrazení filtrů na načtená data (lokální filtrace)
        st.markdown("#### 🔍 Lokální filtry přehledu")
        
        # Lokální filtrování podle stavu SmartChecku
        if 'smartCheckStatus' in df_tenant_apps.columns:
            df_tenant_apps['smartCheckStatus'] = df_tenant_apps['smartCheckStatus'].fillna('Neuvedeno').apply(ui_helpers.get_status_badge)
            severity_order = {
                '🟢 Healthy': 1,
                '🟡 Degraded': 2,
                '🔴 Unhealthy': 3,
                '⚪ Neuvedeno': 4
            }
            available_statuses = sorted(
                list(df_tenant_apps['smartCheckStatus'].unique()),
                key=lambda x: severity_order.get(x, 99)
            )
            selected_statuses = st.multiselect(
                "Filtrovat tenanty podle SmartCheck statusu:",
                options=available_statuses,
                default=available_statuses,
                key="tenant_stats_smart_check_filter"
            )
            df_tenant_apps = df_tenant_apps[df_tenant_apps['smartCheckStatus'].isin(selected_statuses)].reset_index(drop=True)
            
        visible_columns = ['tenantName', 'appCount', 'tenantId', 'ownerOrgName', 'ownerOrgCode', 'ownerOrgId', 'smartCheckStatus', 'smartCheckResultId', 'smartCheckCreatedOn']
        display_columns = [c for c in visible_columns if c in df_tenant_apps.columns]
        
        st.markdown("#### 🗂️ Seznam tenantů")
        st.markdown("Kliknutím na libovolný řádek v tabulce zobrazíte seznam aplikací daného tenanta.")
        
        selection_tenant = st.dataframe(
            df_tenant_apps[display_columns],
            width="stretch",
            hide_index=True,
            selection_mode="single-row",
            on_select="rerun",
            key="df_tenant_selection_new",
            column_config={
                'tenantName': st.column_config.TextColumn(label='Název tenanta (tenantName)'),
                'appCount': st.column_config.NumberColumn(label='Počet aplikací (appCount)'),
                'tenantId': st.column_config.TextColumn(label='Id tenanta (tenantId)'),
                'ownerOrgName': st.column_config.TextColumn(label='Název organizace (ownerOrgName)'),
                'ownerOrgCode': st.column_config.TextColumn(label='Kód organizace (ownerOrgCode)'),
                'ownerOrgId': st.column_config.TextColumn(label='Id organizace (ownerOrgId)'),
                'smartCheckStatus': st.column_config.TextColumn(label='SmartCheck Status (smartCheckStatus)'),
                'smartCheckResultId': st.column_config.TextColumn(label='SmartCheck Result ID (smartCheckResultId)'),
                'smartCheckCreatedOn': st.column_config.TextColumn(label='SmartCheck vytvořen (smartCheckCreatedOn)')
            }
        )
        
        # Určení vybraného tenanta
        selected_tenant_item = None
        if selection_tenant.selection.rows:
            sel_idx = selection_tenant.selection.rows[0]
            if sel_idx < len(df_tenant_apps):
                selected_tenant_item = df_tenant_apps.iloc[sel_idx]
        elif not df_tenant_apps.empty:
            selected_tenant_item = df_tenant_apps.iloc[0]
            
        if selected_tenant_item is not None:
            tenant_name = selected_tenant_item.get('tenantName') or 'Neznámý tenant'
            tenant_result_id = selected_tenant_item.get('smartCheckResultId')
            tenant_status = selected_tenant_item.get('smartCheckStatus')
            tenant_id_clean = str(selected_tenant_item.get('tenantId', 'default')).replace('-', '_')



            applications = selected_tenant_item.get('applications')
            st.markdown(f"#### 📦 Aplikace používané vybraným tenantem: **{tenant_name}**")
            st.markdown("Kliknutím na aplikaci v tabulce můžete vygenerovat a stáhnout podrobný protokol stavu (SmartCheck report).")
            
            if isinstance(applications, list) and len(applications) > 0:
                df_apps_in_tenant = pd.DataFrame(applications)
                # Seřadit aplikace abecedně
                if 'applicationCode' in df_apps_in_tenant.columns:
                    df_apps_in_tenant = df_apps_in_tenant.sort_values(by='applicationCode', key=lambda x: x.str.lower()).reset_index(drop=True)
                    
                # Mapovat statusy na badges
                if 'smartCheckStatus' in df_apps_in_tenant.columns:
                    df_apps_in_tenant['smartCheckStatus'] = df_apps_in_tenant['smartCheckStatus'].fillna('Neuvedeno').apply(ui_helpers.get_status_badge)
                    
                    # Získáme unikátní stavy seřazené podle závažnosti pro multiselect
                    severity_order = {
                        '🟢 Healthy': 1,
                        '🟡 Degraded': 2,
                        '🔴 Unhealthy': 3,
                        '⚪ Neuvedeno': 4
                    }
                    app_available_statuses = sorted(
                        list(df_apps_in_tenant['smartCheckStatus'].unique()),
                        key=lambda x: severity_order.get(x, 99)
                    )
                    
                    # Výběrový box pro filtrování aplikací
                    tenant_id_clean = str(selected_tenant_item.get('tenantId', 'default')).replace('-', '_')
                    app_selected_statuses = st.multiselect(
                        "Filtrovat aplikace podle SmartCheck statusu:",
                        options=app_available_statuses,
                        default=app_available_statuses,
                        key=f"tenant_app_smart_check_filter_{tenant_id_clean}"
                    )
                    
                    # Aplikace lokálního filtru na detail aplikací
                    df_apps_in_tenant = df_apps_in_tenant[df_apps_in_tenant['smartCheckStatus'].isin(app_selected_statuses)].reset_index(drop=True)
                    
                # Zobrazit všechny dostupné atributy dynamicky (preferujeme důležité jako první)
                preferred_cols = ['applicationId', 'id', 'applicationCode', 'smartCheckStatus', 'smartCheckResultId', 'smartCheckCreatedOn']
                display_cols = [c for c in preferred_cols if c in df_apps_in_tenant.columns]
                # Přidáme ostatní sloupce, které nejsou v preferred_cols
                for col in df_apps_in_tenant.columns:
                    if col not in display_cols:
                        display_cols.append(col)
                        
                selection_app = st.dataframe(
                    df_apps_in_tenant[display_cols],
                    width="stretch",
                    hide_index=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key=f"df_app_selection_{tenant_id_clean}",
                    column_config={
                        'applicationCode': st.column_config.TextColumn(label='Kód aplikace (applicationCode)'),
                        'applicationId': st.column_config.TextColumn(label='ID aplikace (applicationId)'),
                        'id': st.column_config.TextColumn(label='ID (id)'),
                        'smartCheckStatus': st.column_config.TextColumn(label='Stav SmartChecku (smartCheckStatus)'),
                        'smartCheckResultId': st.column_config.TextColumn(label='SmartCheck Result ID (smartCheckResultId)'),
                        'smartCheckCreatedOn': st.column_config.TextColumn(label='SmartCheck vytvořen (smartCheckCreatedOn)')
                    }
                )

                # Vyhodnocení vybrané aplikace pro generování protokolu
                selected_app_item = None
                if selection_app.selection.rows:
                    sel_app_idx = selection_app.selection.rows[0]
                    if sel_app_idx < len(df_apps_in_tenant):
                        selected_app_item = df_apps_in_tenant.iloc[sel_app_idx]

                if selected_app_item is not None:
                    app_code = selected_app_item.get('applicationCode', 'Neznámá aplikace')
                    app_status = selected_app_item.get('smartCheckStatus', '⚪ Neuvedeno')
                    
                    # Use original group code (with pipe if present) for the API call
                    app_group_code = selected_app_item.get('smartCheckGroupCode')
                    
                    # Use application's result ID, fallback to tenant's result ID
                    result_id = selected_app_item.get('smartCheckResultId') or selected_tenant_item.get('smartCheckResultId')

                    st.markdown(f"##### 🔎 Detail vybrané aplikace: **{app_code}**")
                    col_info, col_btn = st.columns([3, 2])
                    with col_info:
                        st.markdown(f"- **Stav aplikace:** {app_status}")
                        st.markdown(f"- **SmartCheck Group Code:** `{app_group_code or 'N/A'}`")
                        st.markdown(f"- **SmartCheck Result ID:** `{result_id or 'N/A'}`")
                    
                    with col_btn:
                        if result_id:
                            btn_label = f"📄 Generovat protokol stavu pro {app_code}"
                            if st.button(btn_label, key=f"btn_gen_report_{tenant_id_clean}_{app_code}"):
                                with st.spinner("Generuji protokol ze SmartChecku..."):
                                    try:
                                        master_tid = st.session_state['credentials']['tenant_id']
                                        child_tid = selected_tenant_item.get('tenantId')
                                        try:
                                            # Zkusíme nejprve kontext master tenanta (odpovídá tokenu)
                                            report_bytes, content_type = api_client.fetch_smartcheck_report(
                                                st.session_state['credentials']['api_url'],
                                                st.session_state['access_token'],
                                                master_tid,
                                                result_id
                                            )
                                        except Exception as e:
                                            # Pokud selže, zkusíme kontext child tenanta
                                            if child_tid and child_tid != master_tid:
                                                report_bytes, content_type = api_client.fetch_smartcheck_report(
                                                    st.session_state['credentials']['api_url'],
                                                    st.session_state['access_token'],
                                                    child_tid,
                                                    result_id
                                                )
                                            else:
                                                raise e
                                        st.session_state[f"report_bytes_{tenant_id_clean}_{app_code}"] = report_bytes
                                        st.session_state[f"report_ct_{tenant_id_clean}_{app_code}"] = content_type
                                        st.success("Protokol byl úspěšně vygenerován!")
                                    except Exception as e:
                                        # Pokusíme se o fallback na načtení surových detailů z Results/{id}
                                        try:
                                            # Zkusíme nejprve master tenant
                                            raw_details = api_client.fetch_smartcheck_result_details(
                                                st.session_state['credentials']['api_url'],
                                                st.session_state['access_token'],
                                                master_tid,
                                                result_id
                                            )
                                        except Exception:
                                            try:
                                                # Pokud selže, zkusíme child tenant
                                                if child_tid and child_tid != master_tid:
                                                    raw_details = api_client.fetch_smartcheck_result_details(
                                                        st.session_state['credentials']['api_url'],
                                                        st.session_state['access_token'],
                                                        child_tid,
                                                        result_id
                                                    )
                                                else:
                                                    raw_details = None
                                            except Exception:
                                                raw_details = None
                                                
                                        if raw_details:
                                            # Odstraníme starý report z minulých pokusů, pokud existuje
                                            if f"report_bytes_{tenant_id_clean}_{app_code}" in st.session_state:
                                                del st.session_state[f"report_bytes_{tenant_id_clean}_{app_code}"]
                                            st.session_state[f"raw_details_{tenant_id_clean}_{app_code}"] = raw_details
                                            st.success("Detaily výsledku byly načteny!")
                                        else:
                                            st.error(f"Generování protokolu selhalo (a nepodařilo se načíst ani detaily): {e}")
                            
                            report_key = f"report_bytes_{tenant_id_clean}_{app_code}"
                            details_key = f"raw_details_{tenant_id_clean}_{app_code}"
                            if report_key in st.session_state:
                                report_bytes = st.session_state[report_key]
                                content_type = st.session_state[f"report_ct_{tenant_id_clean}_{app_code}"]
                                
                                ext = "bin"
                                if "pdf" in content_type.lower():
                                    ext = "pdf"
                                elif "html" in content_type.lower():
                                    ext = "html"
                                elif "json" in content_type.lower():
                                    ext = "json"
                                elif "text" in content_type.lower() or "plain" in content_type.lower():
                                    ext = "txt"
                                
                                st.download_button(
                                    label="📥 Stáhnout protokol",
                                    data=report_bytes,
                                    file_name=f"smartcheck_report_{tenant_name}_{app_code}.{ext}",
                                    mime=content_type,
                                    key=f"dl_btn_{tenant_id_clean}_{app_code}"
                                )
                                
                                # Zobrazení náhledu protokolu s automatickým zalamováním řádků
                                if ext == "txt":
                                    txt_content = report_bytes.decode('utf-8', errors='replace')
                                    # Převod na HTML s pre-wrap stylem pro hezké zobrazení a zalamování
                                    import html
                                    escaped_txt = html.escape(txt_content)
                                    html_pre = f"""
                                    <div style="font-family: monospace; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.4; color: #222222; background-color: #fcfcfc; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px;">{escaped_txt}</div>
                                    """
                                    st.components.v1.html(html_pre, height=350, scrolling=True)
                                elif ext == "json":
                                    try:
                                        st.json(json.loads(report_bytes.decode('utf-8')))
                                    except Exception:
                                        st.code(report_bytes.decode('utf-8', errors='replace'))
                                elif ext == "html":
                                    html_content = report_bytes.decode('utf-8', errors='replace')
                                    # Vstříknutí stylů pro vynucení zalamování
                                    style_inject = """
                                    <style>
                                        body, pre, code, p, span, div, td, th, li {
                                            white-space: pre-wrap !important;
                                            word-break: break-word !important;
                                            overflow-wrap: break-word !important;
                                        }
                                    </style>
                                    """
                                    if "<head>" in html_content:
                                        html_content = html_content.replace("<head>", f"<head>{style_inject}")
                                    else:
                                        html_content = f"{style_inject}{html_content}"
                                    st.components.v1.html(html_content, height=350, scrolling=True)
                            elif details_key in st.session_state:
                                st.warning("⚠️ Formátovaný report (adhocReport) nebyl na serveru nalezen (404), ale načetli jsme surové detaily výsledku.")
                                st.markdown("##### 📊 Detaily výsledku ze SmartChecku (JSON):")
                                st.json(st.session_state[details_key])
                        else:
                            st.warning("Pro tuto aplikaci / tenanta není k dispozici žádný SmartCheck Result ID.")
            else:
                st.info("Tento tenant nemá žádné přidružené aplikace.")

        if include_smart_check_status:
            app_rows = []
            for item in st.session_state['usage_stats_tenant_app_items']:
                applications_list = item.get('applications') if isinstance(item, dict) else None
                if isinstance(applications_list, list):
                    for app in applications_list:
                        if isinstance(app, dict):
                            app_rows.append({
                                'applicationCode': app.get('applicationCode'),
                                'smartCheckStatus': app.get('smartCheckStatus')
                            })
            if app_rows:
                df_apps = pd.DataFrame(app_rows).dropna(subset=['applicationCode', 'smartCheckStatus'])
                if not df_apps.empty:
                    df_apps['smartCheckStatus'] = df_apps['smartCheckStatus'].apply(ui_helpers.get_status_badge)
                    status_order = ['🟢 Healthy', '🟡 Degraded', '🔴 Unhealthy', '⚪ Neuvedeno']
                    df_apps['smartCheckStatus'] = pd.Categorical(df_apps['smartCheckStatus'], categories=status_order, ordered=True)
                    df_apps_grouped = df_apps.groupby(['applicationCode', 'smartCheckStatus'], observed=False).size().reset_index(name='count')
                    
                    df_apps_grouped = df_apps_grouped[df_apps_grouped['count'] > 0]
                    
                    color_map = {
                        '🟢 Healthy': '#2e7d32',   # Zelená
                        '🟡 Degraded': '#ef6c00',  # Oranžová
                        '🔴 Unhealthy': '#c62828', # Červená
                        '⚪ Neuvedeno': '#78909c'  # Šedá
                    }
                    
                    fig = px.bar(
                        df_apps_grouped,
                        x='applicationCode',
                        y='count',
                        color='smartCheckStatus',
                        color_discrete_map=color_map,
                        category_orders={'smartCheckStatus': status_order},
                        labels={'applicationCode': 'Kód aplikace (applicationCode)', 'count': 'Počet', 'smartCheckStatus': 'SmartCheck status'},
                        title='SmartCheck statusy aplikací (agregováno přes všechny tenanty)',
                        barmode='group'
                    )
                    fig.update_layout(xaxis_tickangle=-45, xaxis={'categoryorder':'total descending'})
                    st.plotly_chart(fig, use_container_width=True)
                else:
                    st.info("Žádná data smart check statusů aplikací k zobrazení.")
            else:
                st.info("Žádná data smart check aplikací k zobrazení.")
        else:
            tenant_app_counts = []
            for item in st.session_state['usage_stats_tenant_app_items']:
                tenant_name = item.get('tenantName') or item.get('tenantId') or 'Neznámý tenant'
                applications_list = item.get('applications') if isinstance(item, dict) else None
                if isinstance(applications_list, list):
                    tenant_app_counts.append({
                        'tenant': tenant_name,
                        'app_count': len(applications_list)
                    })
            if tenant_app_counts:
                df_tenant_counts = pd.DataFrame(tenant_app_counts)
                df_tenant_counts = df_tenant_counts.groupby('tenant', as_index=False)['app_count'].sum()
                fig = px.pie(
                    df_tenant_counts,
                    names='tenant',
                    values='app_count',
                    title='Počet aplikací použitých v rámci jednotlivých tenantů',
                    hole=0.4
                )
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Žádná data o počtech aplikací na tenanta k zobrazení.")
