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
            if 'tenant_stats_selected_labels' not in st.session_state or not isinstance(st.session_state['tenant_stats_selected_labels'], set):
                st.session_state['tenant_stats_selected_labels'] = set()

            # Zajištění, že stávající výběr obsahuje pouze platné tenanty
            st.session_state['tenant_stats_selected_labels'] = {
                lbl for lbl in st.session_state['tenant_stats_selected_labels'] if lbl in label_to_id
            }

            selected_count = len(st.session_state['tenant_stats_selected_labels'])
            btn_label = f"🏢 Vybrat ID tenantů ({selected_count} vybráno)" if selected_count > 0 else "🏢 Vybrat ID tenantů (všichni)"
            
            with st.popover(btn_label, use_container_width=True):
                st.markdown("##### 🏢 Přísný filtr tenantů (obsahuje zadaný text)")
                search_q = st.text_input(
                    "Vyhledat v názvu nebo ID:",
                    value="",
                    key="tenant_popover_search_q",
                    placeholder="Napište název nebo ID (např. mati)...",
                    help="Hledání probíhá okamžitě při zapsání textu. Stiskněte Enter pro potvrzení zadání."
                ).strip().lower()
                
                col_act1, col_act2 = st.columns(2)
                with col_act1:
                    if st.button("Vybrat vyfiltrované", key="btn_select_filtered_tenants"):
                        matching = [lbl for lbl in user_tenant_labels if search_q in lbl.lower()] if search_q else user_tenant_labels
                        st.session_state['tenant_stats_selected_labels'].update(matching)
                        st.rerun()
                with col_act2:
                    if st.button("Zrušit celý výběr", key="btn_clear_tenant_selection"):
                        st.session_state['tenant_stats_selected_labels'] = set()
                        st.rerun()
                
                st.divider()
                
                # Přísné filtrování podřetězcem (strict substring match)
                if search_q:
                    display_labels = [lbl for lbl in user_tenant_labels if search_q in lbl.lower()]
                else:
                    # Pokud je vyhledávání prázdné, zkrátíme seznam na vybrané + prvních 30 pro bleskovou rychlost
                    selected_list = sorted(list(st.session_state['tenant_stats_selected_labels']), key=str.lower)
                    unselected_list = [lbl for lbl in user_tenant_labels if lbl not in st.session_state['tenant_stats_selected_labels']]
                    display_labels = selected_list + unselected_list[:30]
                    
                if not display_labels:
                    st.info(f"Žádný tenant neobsahuje text '{search_q}'.")
                else:
                    total_match_count = len([lbl for lbl in user_tenant_labels if search_q in lbl.lower()]) if search_q else len(user_tenant_labels)
                    st.caption(f"Zobrazeno {len(display_labels)} z {total_match_count} odpovídajících tenantů:")
                    with st.container(height=280):
                        for lbl in display_labels:
                            is_checked = lbl in st.session_state['tenant_stats_selected_labels']
                            chk = st.checkbox(lbl, value=is_checked, key=f"chk_tenant_{label_to_id[lbl]}")
                            if chk and not is_checked:
                                st.session_state['tenant_stats_selected_labels'].add(lbl)
                            elif not chk and is_checked:
                                st.session_state['tenant_stats_selected_labels'].remove(lbl)
                                
            if st.session_state['tenant_stats_selected_labels']:
                selected_sorted = sorted(list(st.session_state['tenant_stats_selected_labels']), key=str.lower)
                st.markdown("**Vybrané ID tenantů:** " + ", ".join([f"`{label_to_id[lbl]}`" for lbl in selected_sorted if lbl in label_to_id]))
                tenant_ids = [label_to_id[lbl] for lbl in selected_sorted if lbl in label_to_id]
            else:
                st.caption("ℹ️ Není vybrán žádný konkrétní tenant = načtou se data pro **všechny tenanty**.")
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
        for k in ["tenant_stats_local_tenant_multiselect", "tenant_stats_smart_check_filter", "tenant_stats_app_code_filter", "df_tenant_selection_new"]:
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
        f_col1, f_col2 = st.columns(2)
        
        # Extrakce všech unikátních kódů aplikací z načtených dat
        all_app_codes = set()
        for item in st.session_state['usage_stats_tenant_app_items']:
            apps_list = item.get('applications') if isinstance(item, dict) else None
            if isinstance(apps_list, list):
                for a in apps_list:
                    if isinstance(a, dict) and a.get('applicationCode'):
                        all_app_codes.add(a.get('applicationCode'))
                        
        sorted_app_codes = sorted(list(all_app_codes), key=str.lower)
        
        with f_col1:
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
                    "Filtrovat podle SmartCheck statusu:",
                    options=available_statuses,
                    default=available_statuses,
                    key="tenant_stats_smart_check_filter"
                )
                df_tenant_apps = df_tenant_apps[df_tenant_apps['smartCheckStatus'].isin(selected_statuses)].reset_index(drop=True)

        with f_col2:
            if sorted_app_codes:
                selected_app_codes = st.multiselect(
                    "Filtrovat podle kódu aplikace (applicationCode):",
                    options=sorted_app_codes,
                    default=[],
                    key="tenant_stats_app_code_filter",
                    help="Ponechte prázdné pro zobrazení tenantů se všemi aplikacemi. Výběrem vyfiltrujete pouze tenanty používající konkrétní aplikaci."
                )
                if selected_app_codes:
                    def tenant_has_apps(apps_list):
                        if not isinstance(apps_list, list): return False
                        return any(isinstance(a, dict) and a.get('applicationCode') in selected_app_codes for a in apps_list)
                    df_tenant_apps = df_tenant_apps[df_tenant_apps['applications'].apply(tenant_has_apps)].reset_index(drop=True)
            
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
            tenant_id_clean = str(selected_tenant_item.get('tenantId', 'default')).replace('-', '_')

            # --- AUTOMATICKÉ NAČTENÍ A ROZPARSOVÁNÍ SMARTCHECK REPORTU ---
            parsed_report_sections = {}
            raw_report_text = ""
            if tenant_result_id:
                cache_key_report = f"cached_report_{tenant_id_clean}_{tenant_result_id}"
                if cache_key_report not in st.session_state:
                    master_tid = st.session_state['credentials']['tenant_id']
                    child_tid = selected_tenant_item.get('tenantId')
                    
                    child_token = None
                    if child_tid and child_tid != master_tid:
                        child_token, _ = api_client.fetch_impersonation_token(
                            st.session_state['credentials']['api_url'],
                            st.session_state['access_token'],
                            child_tid
                        )
                    
                    eff_token = child_token if child_token else st.session_state['access_token']
                    eff_tid = child_tid if (child_token and child_tid != master_tid) else master_tid
                    
                    try:
                        report_bytes, ct = api_client.fetch_smartcheck_report(
                            st.session_state['credentials']['api_url'],
                            eff_token,
                            eff_tid,
                            tenant_result_id
                        )
                        raw_report_text = report_bytes.decode('utf-8', errors='replace')
                    except Exception:
                        try:
                            report_bytes, ct = api_client.fetch_smartcheck_report(
                                st.session_state['credentials']['api_url'],
                                st.session_state['access_token'],
                                master_tid,
                                tenant_result_id
                            )
                            raw_report_text = report_bytes.decode('utf-8', errors='replace')
                        except Exception:
                            raw_report_text = ""

                    st.session_state[cache_key_report] = raw_report_text

                raw_report_text = st.session_state[cache_key_report]
                parsed_report_sections = ui_helpers.parse_smartcheck_report(raw_report_text)

            applications = selected_tenant_item.get('applications')
            st.markdown(f"#### 📦 Aplikace používané vybraným tenantem: **{tenant_name}**")
            st.caption("Detailní chyby a varování jsou automaticky rozparsovány z diagnostiky SmartChecku přímo do tabulky a detailu aplikace.")
            
            if isinstance(applications, list) and len(applications) > 0:
                df_apps_in_tenant = pd.DataFrame(applications)
                # Seřadit aplikace abecedně
                if 'applicationCode' in df_apps_in_tenant.columns:
                    df_apps_in_tenant = df_apps_in_tenant.sort_values(by='applicationCode', key=lambda x: x.str.lower()).reset_index(drop=True)
                    
                # Připojit rozparsované problémy z diagnostiky SmartChecku ke každé aplikaci
                app_issues_list = []
                for _, app_r in df_apps_in_tenant.iterrows():
                    iss_arr = ui_helpers.get_issues_for_app(app_r, parsed_report_sections)
                    if iss_arr:
                        app_issues_list.append(" • ".join(iss_arr))
                    else:
                        app_issues_list.append("✅ Bez zjištěných chyb")
                df_apps_in_tenant['smartCheckIssues'] = app_issues_list

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
                preferred_cols = ['applicationCode', 'smartCheckStatus', 'smartCheckIssues', 'applicationId', 'id', 'smartCheckResultId', 'smartCheckCreatedOn']
                display_cols = [c for c in preferred_cols if c in df_apps_in_tenant.columns]
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
                        'smartCheckStatus': st.column_config.TextColumn(label='Stav SmartChecku (smartCheckStatus)'),
                        'smartCheckIssues': st.column_config.TextColumn(label='Chyby a varování z diagnostiky (Důvod stavu)', width="large"),
                        'applicationId': st.column_config.TextColumn(label='ID aplikace (applicationId)'),
                        'id': st.column_config.TextColumn(label='ID (id)'),
                        'smartCheckResultId': st.column_config.TextColumn(label='SmartCheck Result ID (smartCheckResultId)'),
                        'smartCheckCreatedOn': st.column_config.TextColumn(label='SmartCheck vytvořen (smartCheckCreatedOn)')
                    }
                )

                # Vyhodnocení vybrané aplikace pro zobrazení detailu
                selected_app_item = None
                if selection_app.selection.rows:
                    sel_app_idx = selection_app.selection.rows[0]
                    if sel_app_idx < len(df_apps_in_tenant):
                        selected_app_item = df_apps_in_tenant.iloc[sel_app_idx]

                if selected_app_item is not None:
                    app_code = selected_app_item.get('applicationCode', 'Neznámá aplikace')
                    app_status = selected_app_item.get('smartCheckStatus', '⚪ Neuvedeno')
                    app_group_code = selected_app_item.get('smartCheckGroupCode')
                    result_id = selected_app_item.get('smartCheckResultId') or selected_tenant_item.get('smartCheckResultId')

                    app_specific_issues = ui_helpers.get_issues_for_app(selected_app_item, parsed_report_sections)

                    st.markdown(f"##### 🔎 Detail vybrané aplikace: **{app_code}**")
                    col_info, col_issues = st.columns([2, 3])
                    with col_info:
                        st.markdown(f"- **Stav aplikace:** {app_status}")
                        st.markdown(f"- **SmartCheck Group Code:** `{app_group_code or 'N/A'}`")
                        st.markdown(f"- **SmartCheck Result ID:** `{result_id or 'N/A'}`")
                    
                    with col_issues:
                        st.markdown("**📋 Zjištěná varování a chyby pro tuto aplikaci:**")
                        if app_specific_issues:
                            for iss in app_specific_issues:
                                if "ERROR" in iss or "☠" in iss:
                                    st.error(iss)
                                elif "WARNING" in iss or "⛈" in iss:
                                    st.warning(iss)
                                else:
                                    st.info(iss)
                        else:
                            st.success("✅ Pro tuto aplikaci nebyly nalezeny žádné chyby ani varování.")

                # Zobrazení celkového SmartCheck protokolu v rozbalovacím bloku
                if raw_report_text:
                    with st.expander(f"📄 Celkový SmartCheck protokol pro tenanta {tenant_name} (všechny aplikace)", expanded=False):
                        st.download_button(
                            label="📥 Stáhnout protokol jako TXT",
                            data=raw_report_text.encode('utf-8'),
                            file_name=f"smartcheck_report_{tenant_name}.txt",
                            mime="text/plain",
                            key=f"dl_btn_{tenant_id_clean}_full"
                        )
                        import html as py_html
                        escaped_txt = py_html.escape(raw_report_text)
                        html_pre = f"""
                        <div style="font-family: monospace; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.4; color: #222222; background-color: #fcfcfc; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px;">{escaped_txt}</div>
                        """
                        st.components.v1.html(html_pre, height=450, scrolling=True)
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
                    # Odstraníme emoji symboly z popisků pro graf, aby se nedublovaly s barevným indikátorem Plotly v legendě
                    df_apps['smartCheckStatus'] = df_apps['smartCheckStatus'].fillna('Neuvedeno').apply(
                        lambda s: ui_helpers.get_status_badge(s).replace('🟢 ', '').replace('🟡 ', '').replace('🔴 ', '').replace('⚪ ', '')
                    )
                    status_order = ['Healthy', 'Degraded', 'Unhealthy', 'Neuvedeno']
                    df_apps['smartCheckStatus'] = pd.Categorical(df_apps['smartCheckStatus'], categories=status_order, ordered=True)
                    df_apps_grouped = df_apps.groupby(['applicationCode', 'smartCheckStatus'], observed=False).size().reset_index(name='count')
                    
                    df_apps_grouped = df_apps_grouped[df_apps_grouped['count'] > 0]
                    
                    color_map = {
                        'Healthy': '#2e7d32',   # Zelená
                        'Degraded': '#ef6c00',  # Oranžová
                        'Unhealthy': '#c62828', # Červená
                        'Neuvedeno': '#78909c'  # Šedá
                    }
                    
                    fig = px.bar(
                        df_apps_grouped,
                        x='applicationCode',
                        y='count',
                        color='smartCheckStatus',
                        color_discrete_map=color_map,
                        category_orders={'smartCheckStatus': status_order},
                        labels={'applicationCode': 'Kód aplikace', 'count': 'Počet', 'smartCheckStatus': 'SmartCheck status'},
                        title='SmartCheck statusy aplikací',
                        barmode='group'
                    )
                    fig.update_layout(
                        font=dict(size=14),
                        title=dict(font=dict(size=18, color="#1e293b")),
                        xaxis_tickangle=-45,
                        xaxis=dict(
                            categoryorder='total descending',
                            tickfont=dict(size=13),
                            title=dict(font=dict(size=15, color="#334155"))
                        ),
                        yaxis=dict(
                            tickfont=dict(size=13),
                            title=dict(font=dict(size=15, color="#334155"))
                        ),
                        legend=dict(
                            font=dict(size=15, color="#1e293b"),
                            title=dict(font=dict(size=16, color="#0f172a")),
                            bgcolor="rgba(255, 255, 255, 0.9)",
                            bordercolor="#cbd5e1",
                            borderwidth=1,
                            orientation="h",
                            yanchor="bottom",
                            y=1.02,
                            xanchor="right",
                            x=1
                        ),
                        hoverlabel=dict(
                            font_size=15,
                            font_family="sans-serif"
                        ),
                        margin=dict(t=60, b=80, l=50, r=30)
                    )
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
                fig.update_layout(
                    font=dict(size=14),
                    title=dict(font=dict(size=18, color="#1e293b")),
                    legend=dict(
                        font=dict(size=15, color="#1e293b"),
                        title=dict(font=dict(size=16, color="#0f172a")),
                        bgcolor="rgba(255, 255, 255, 0.9)",
                        bordercolor="#cbd5e1",
                        borderwidth=1
                    ),
                    hoverlabel=dict(font_size=15)
                )
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("Žádná data o počtech aplikací na tenanta k zobrazení.")
