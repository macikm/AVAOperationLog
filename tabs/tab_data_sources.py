import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 🔌 Seznam Data Sources (DataSources)")
    st.caption("Stránkovaný a filtrovaný přehled všech definic Data Sources ze serverového endpointu `/api/v1/DataSources`.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
    tenant_id = st.session_state.get('impersonated_tenant_id') or creds.get('tenant_id', '')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení Data Sources je vyžadováno aktivní připojení k API.")
        st.stop()

    # Pokud přicházíme se zadaným ID zdroje (např. kliknutím v logu):
    incoming_source_id = st.session_state.pop('data_sources_selected_id', None)
    if incoming_source_id:
        st.session_state['ds_local_search'] = str(incoming_source_id).strip()
        st.session_state['ds_active_source_id'] = str(incoming_source_id).strip()

    # Inicializace stavů stránkování a filtrů
    if 'data_sources_offset' not in st.session_state:
        st.session_state['data_sources_offset'] = 0
    if 'data_sources_limit' not in st.session_state:
        st.session_state['data_sources_limit'] = 500
    if 'data_sources_filters' not in st.session_state:
        st.session_state['data_sources_filters'] = {
            'agent_id': '',
            'application_code': ''
        }

    # --- FILTRY NAČÍTÁNÍ ---
    with st.expander("🔍 Serverové filtry (DataSources)", expanded=False):
        f_col1, f_col2 = st.columns(2)
        with f_col1:
            agent_id = st.text_input("AgentId:", value=st.session_state['data_sources_filters']['agent_id'], key="ds_filter_agent_id")
        with f_col2:
            app_code = st.text_input("ApplicationCode:", value=st.session_state['data_sources_filters']['application_code'], key="ds_filter_app_code")

        if st.button("🚀 Použít filtry a načíst Data Sources", type="primary", key="btn_apply_ds_filters", width="stretch"):
            st.session_state['data_sources_filters'] = {
                'agent_id': agent_id,
                'application_code': app_code
            }
            st.session_state['data_sources_offset'] = 0
            st.rerun()

    # --- NAČTENÍ DAT ZE SERVERU ---
    limit = st.session_state['data_sources_limit']
    offset = st.session_state['data_sources_offset']
    filters = st.session_state['data_sources_filters']

    try:
        with st.spinner("Načítám Data Sources..."):
            response_data = api_client.fetch_data_sources(
                creds['api_url'], token, tenant_id,
                limit=limit, offset=offset, filters=filters
            )
    except Exception as e:
        st.error(f"Načtení Data Sources selhalo: {e}")
        st.stop()

    items = response_data.get('items', []) if isinstance(response_data, dict) else (response_data if isinstance(response_data, list) else [])
    total_count = response_data.get('totalCount') if isinstance(response_data, dict) else len(items)

    if not items:
        st.warning("Pro zadané filtry nebyly nalezeny žádné Data Sources.")
        st.stop()

    # --- STRÁNKOVÁNÍ A LOKÁLNÍ VYHLEDÁVÁNÍ ---
    current_page = (offset // limit) + 1
    max_page = max(1, (total_count + limit - 1) // limit) if total_count else 1

    p_col1, p_col2, p_col3, p_col4 = st.columns([3, 1, 1, 2], vertical_alignment="center")
    with p_col1:
        ui_helpers.render_html(f"""
        <div style="display: flex; align-items: center; gap: 6px; height: 38px; font-family: Inter, sans-serif; font-size: 0.83rem;">
            <span style="font-weight: 600; color: #0f172a;">Strana:</span>
            {ui_helpers.render_badge(f'{current_page} / {max_page}', 'neutral')}
            <span style="color: #64748b; margin-left: 4px;">Načteno: <b>{len(items)}</b> (Celkem: <b>{total_count}</b>)</span>
        </div>
        """)
    with p_col2:
        if st.button("◀️ Předchozí", key="btn_prev_ds", disabled=(offset == 0)):
            st.session_state['data_sources_offset'] = max(0, offset - limit)
            st.rerun()
    with p_col3:
        if st.button("Další ▶️", key="btn_next_ds", disabled=(offset + limit >= total_count)):
            st.session_state['data_sources_offset'] = offset + limit
            st.rerun()
    with p_col4:
        curr_search_val = st.session_state.get('ds_local_search', '')
        local_search_input = st.text_input("🔎 Rychlé lokální hledání:", value=curr_search_val, key="ds_local_search_input", placeholder="Hledat název, ID, kód...").strip()
        if local_search_input != curr_search_val:
            st.session_state['ds_local_search'] = local_search_input
        local_search = local_search_input.lower()

    # --- PŘÍPRAVA DATAFRAME ---
    df_raw = pd.DataFrame(items)

    # Extrakovat kód agenta z embedded objektu `agent`
    if 'agent' in df_raw.columns:
        df_raw['agentCode'] = df_raw['agent'].apply(lambda a: a.get('code') if isinstance(a, dict) else '')
    else:
        df_raw['agentCode'] = ''

    # Lokální filtr podle textu
    if local_search and not df_raw.empty:
        df_raw = ui_helpers.filter_dataframe_local(df_raw, local_search)

    if not df_raw.empty and 'name' in df_raw.columns:
        df_raw = df_raw.sort_values(by='name', key=lambda col: col.str.lower(), ascending=True).reset_index(drop=True)

    # SUMARIZAČNÍ METRIKY
    ds_enabled_cnt = len(df_raw[df_raw['enabled'] == True]) if 'enabled' in df_raw.columns else 0
    ds_reg_cnt = len(df_raw[df_raw['isRegistered'] == True]) if 'isRegistered' in df_raw.columns else 0
    ds_app_cnt = df_raw['applicationCode'].nunique() if 'applicationCode' in df_raw.columns else 0

    ds_kpi1, ds_kpi2, ds_kpi3, ds_kpi4 = st.columns(4)
    with ds_kpi1:
        st.metric("🔌 Celkem zdrojů", f"{total_count}")
    with ds_kpi2:
        st.metric("🟢 Povoleno (enabled)", f"{ds_enabled_cnt}")
    with ds_kpi3:
        st.metric("📑 Registrované", f"{ds_reg_cnt}")
    with ds_kpi4:
        st.metric("📱 Unikátních aplikací", f"{ds_app_cnt}")

    # Preferované sloupce
    preferred_cols = ['id', 'name', 'agentId', 'agentCode', 'applicationCode', 'clientId', 'enabled', 'isRegistered', 'consumerType', 'accessLevel', 'utcCreatedOn', 'utcModifiedOn']
    display_cols = [c for c in preferred_cols if c in df_raw.columns]
    for c in df_raw.columns:
        if c not in display_cols and c != 'agent':
            display_cols.append(c)

    ds_grid_height = min(600, max(260, len(df_raw) * 36 + 45))
    selection = st.dataframe(
        df_raw[display_cols],
        width="stretch",
        height=ds_grid_height,
        hide_index=True,
        selection_mode="single-cell",
        on_select="rerun",
        key="df_data_sources_grid",
        column_config={
            'id': st.column_config.TextColumn(label='Source ID (id)', width="large"),
            'name': st.column_config.TextColumn(label='Název (name)', width="medium"),
            'agentId': st.column_config.TextColumn(label='Agent ID (agentId)'),
            'agentCode': st.column_config.TextColumn(label='Kód agenta (agentCode)'),
            'applicationCode': st.column_config.TextColumn(label='Aplikace (applicationCode)'),
            'clientId': st.column_config.TextColumn(label='Client ID (clientId)'),
            'enabled': st.column_config.CheckboxColumn(label='Povoleno'),
            'isRegistered': st.column_config.CheckboxColumn(label='Registrované'),
            'consumerType': st.column_config.TextColumn(label='Typ consumera'),
            'accessLevel': st.column_config.TextColumn(label='Přístup (accessLevel)'),
            'utcCreatedOn': st.column_config.TextColumn(label='Vytvořeno (UTC)'),
            'utcModifiedOn': st.column_config.TextColumn(label='Změněno (UTC)')
        }
    )

    # --- DETAIL VYBRANÉHO DATASOURCU ---
    sel_idx = None
    if selection.selection.cells:
        sel_idx = selection.selection.cells[0][0]
    elif selection.selection.rows:
        sel_idx = selection.selection.rows[0]

    # Pokud uživatel nekliknul, ale máme aktivní ID nebo po vyhledání zbyl 1 řádek
    if sel_idx is None and not df_raw.empty:
        active_id = st.session_state.get('ds_active_source_id')
        if active_id and 'id' in df_raw.columns:
            matches = df_raw.index[df_raw['id'].astype(str).str.lower() == str(active_id).lower()].tolist()
            if matches:
                sel_idx = matches[0]
        if sel_idx is None and len(df_raw) == 1:
            sel_idx = 0

    if sel_idx is not None and sel_idx < len(df_raw):
        selected_item = df_raw.iloc[sel_idx].to_dict()
        selected_source_id = str(selected_item.get('id', '')).strip()
        st.session_state['ds_active_source_id'] = selected_source_id

        st.markdown(f"#### 🔎 Detail vybraného DataSourcu: **{selected_item.get('name', selected_item.get('id'))}**")
        
        d_col1, d_col2 = st.columns(2)
        with d_col1:
            st.markdown(f"- **Source ID:** `{selected_item.get('id')}`")
            st.markdown(f"- **Název:** `{selected_item.get('name')}`")
            st.markdown(f"- **Agent ID:** `{selected_item.get('agentId')}`")
            st.markdown(f"- **Kód agenta:** `{selected_item.get('agentCode') or 'N/A'}`")
            st.markdown(f"- **Aplikace:** `{selected_item.get('applicationCode') or 'N/A'}`")
        with d_col2:
            st.markdown(f"- **Client ID:** `{selected_item.get('clientId') or 'N/A'}`")
            st.markdown(f"- **Povoleno (enabled):** {'🟢 Ano' if selected_item.get('enabled') else '🔴 Ne'}")
            st.markdown(f"- **Registrované:** {'🟢 Ano' if selected_item.get('isRegistered') else '⚪ Ne'}")
            st.markdown(f"- **Consumer Type:** `{selected_item.get('consumerType') or 'N/A'}`")
            st.markdown(f"- **Přístup:** `{selected_item.get('accessLevel')}`")

        with st.expander("📦 Kompletní JSON struktura DataSourcu", expanded=False):
            st.json(selected_item)

        # --- SEANCE DATOVÝCH TRANSFORMACÍ (DataTransformations) ---
        st.markdown("---")
        t_header_col1, t_header_col2 = st.columns([8, 2], vertical_alignment="center")
        with t_header_col1:
            st.markdown("### 🔀 Datové transformace (DataTransformations)")
            st.caption(f"Definice transformací a mapování entit pro DataSource: `{selected_item.get('name')}` (`{selected_source_id}`)")
        with t_header_col2:
            refresh_tr = st.button("🔄 Obnovit transformace", key=f"btn_refresh_tr_{selected_source_id}", width="stretch")

        try:
            with st.spinner("Načítám DataTransformations ze serveru..."):
                tr_res = api_client.fetch_data_transformations(
                    creds['api_url'], token, tenant_id, source_id=selected_source_id
                )
        except Exception as e:
            st.error(f"Chyba při načítání definic transformací ze serveru: {e}")
            tr_res = None

        if tr_res is not None:
            tr_items = tr_res.get('items', []) if isinstance(tr_res, dict) else (tr_res if isinstance(tr_res, list) else [])
            tr_total = tr_res.get('totalCount') if isinstance(tr_res, dict) else len(tr_items)

            if not tr_items:
                st.warning(f"⚠️ Pro tento Data Source `{selected_source_id}` nebyly nalezeny žádné definice transformací (celkem: 0).")
                st.info("💡 Pokud provozní log hlásí varování typu *'ENTITY MAPPINGS: No transformation for ... entity-mapping identifier'*, znamená to, že pro tento DataSource chybí příslušná definice mapování entit v AVA.")
            else:
                total_entity_mappings = sum(len(it.get('mappings', [])) for it in tr_items if isinstance(it.get('mappings'), list))
                total_released = sum(1 for it in tr_items if it.get('released'))

                m_col1, m_col2, m_col3, m_col4 = st.columns(4)
                with m_col1:
                    st.metric("📋 Definic transformací", f"{len(tr_items)}")
                with m_col2:
                    st.metric("🗺️ Celkem mapování entit", f"{total_entity_mappings}")
                with m_col3:
                    st.metric("🟢 Vydáno (Released)", f"{total_released} / {len(tr_items)}")
                with m_col4:
                    st.metric("🛡️ Úroveň přístupu", f"{tr_items[0].get('accessLevel', 'Auto') if tr_items else 'N/A'}")

                for idx, tr_def in enumerate(tr_items):
                    with st.container(border=True):
                        # Hlavička transformace
                        th_c1, th_c2, th_c3 = st.columns([5, 3, 4])
                        with th_c1:
                            st.markdown(f"**Transformation ID:** `{tr_def.get('id')}`")
                            if tr_def.get('customCode'):
                                st.markdown(f"**Custom Code:** `{tr_def.get('customCode')}`")
                        with th_c2:
                            rel_badge = "🟢 Vydáno (Released)" if tr_def.get('released') else "🟡 Návrh (Draft)"
                            del_badge = "🔴 Smazáno" if tr_def.get('deleted') else "🟢 Aktivní"
                            st.markdown(f"**Stav:** {rel_badge} | {del_badge}")
                            st.markdown(f"**Přístup:** `{tr_def.get('accessLevel', 'Auto')}`")
                        with th_c3:
                            st.markdown(f"**Vytvořeno:** `{tr_def.get('utcCreatedOn', 'N/A')}`")
                            st.markdown(f"**Změněno:** `{tr_def.get('utcModifiedOn', 'N/A')}`")

                        if tr_def.get('notes'):
                            st.info(f"📝 **Poznámka:** {tr_def.get('notes')}")

                        # Tabulka mapování entit
                        mappings_list = tr_def.get('mappings', [])
                        if mappings_list:
                            st.markdown(f"##### 🗺️ Mapování entit (Entity Mappings - {len(mappings_list)}):")
                            rows = []
                            for m in mappings_list:
                                rows.append({
                                    'entityMappingId': m.get('entityMappingId', ''),
                                    'entityId': m.get('entityId', ''),
                                    'modelId': m.get('modelId', ''),
                                    'transformationType': m.get('transformationType', ''),
                                    'priority': m.get('priority', 0),
                                    'entityOwnership': m.get('entityOwnership', ''),
                                    'autoMapCommonFields': bool(m.get('autoMapCommonFields')),
                                    'autoMapCustomFields': bool(m.get('autoMapCustomFields')),
                                    'fieldMappingsCount': len(m.get('mappings', [])) if isinstance(m.get('mappings'), list) else 0,
                                    'expressionsCount': len(m.get('expressions', [])) if isinstance(m.get('expressions'), list) else 0
                                })
                            df_map = pd.DataFrame(rows)
                            st.dataframe(
                                df_map,
                                width="stretch",
                                hide_index=True,
                                column_config={
                                    'entityMappingId': st.column_config.TextColumn(label='Entity Mapping ID', help='Identifikátor mapování (např. 111|ProjectHeader)'),
                                    'entityId': st.column_config.TextColumn(label='Entity ID', help='Název entity modelu'),
                                    'modelId': st.column_config.TextColumn(label='Model ID (Data Model GUID)'),
                                    'transformationType': st.column_config.TextColumn(label='Typ transformace'),
                                    'priority': st.column_config.NumberColumn(label='Priorita'),
                                    'entityOwnership': st.column_config.TextColumn(label='Vlastnictví (Ownership)'),
                                    'autoMapCommonFields': st.column_config.CheckboxColumn(label='Auto-map Common'),
                                    'autoMapCustomFields': st.column_config.CheckboxColumn(label='Auto-map Custom'),
                                    'fieldMappingsCount': st.column_config.NumberColumn(label='Počet polí'),
                                    'expressionsCount': st.column_config.NumberColumn(label='Počet výrazů')
                                }
                            )

                            # Detail jednotlivých mapování polí a výrazů
                            for m in mappings_list:
                                em_id = m.get('entityMappingId') or m.get('entityId') or 'Entity'
                                field_maps = m.get('mappings', [])
                                exprs = m.get('expressions', [])
                                if field_maps or exprs:
                                    with st.expander(f"🔍 Detail polí a výrazů: {em_id} ({len(field_maps)} polí, {len(exprs)} výrazů)", expanded=False):
                                        if field_maps:
                                            st.markdown("**Mapování konkrétních atributů (Field Mappings):**")
                                            if isinstance(field_maps, list) and len(field_maps) > 0 and isinstance(field_maps[0], dict):
                                                st.dataframe(pd.DataFrame(field_maps), width="stretch", hide_index=True)
                                            else:
                                                st.json(field_maps)
                                        if exprs:
                                            st.markdown("**Výrazy (Expressions):**")
                                            st.json(exprs)
                        else:
                            st.info("Tato definice transformace neobsahuje žádná specifická mapování entit (pole mappings je prázdné).")

                        with st.expander(f"📦 Kompletní JSON definice transformace ({tr_def.get('id')})", expanded=False):
                            st.json(tr_def)

                with st.expander("📦 Kompletní surová odpověď API DataTransformations", expanded=False):
                    st.json(tr_res)
