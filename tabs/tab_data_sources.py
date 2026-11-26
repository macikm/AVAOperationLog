import streamlit as st
import pandas as pd
import json
import ast
import api_client
import ui_helpers

@st.dialog("🔌 Detail Data Sourcu")
def show_datasource_detail_modal(ds_item):
    if not ds_item:
        st.info("Žádná data k zobrazení.")
        return
    st.markdown(f"### 🔌 {ds_item.get('name') or ds_item.get('id')}")
    
    # Přehledná tabulka vlastnost - hodnota
    rows = [
        ('Source ID (id)', ds_item.get('id')),
        ('Název (name)', ds_item.get('name')),
        ('Agent ID (agentId)', ds_item.get('agentId')),
        ('Kód agenta (agentCode)', ds_item.get('agentCode')),
        ('Aplikace (applicationCode)', ds_item.get('applicationCode')),
        ('Client ID (clientId)', ds_item.get('clientId')),
        ('Povoleno (enabled)', '🟢 Ano' if ds_item.get('enabled') else '🔴 Ne'),
        ('Registrované (isRegistered)', '🟢 Ano' if ds_item.get('isRegistered') else '⚪ Ne'),
        ('Typ consumera (consumerType)', ds_item.get('consumerType')),
        ('Úroveň přístupu (accessLevel)', ds_item.get('accessLevel')),
        ('Vytvořeno (utcCreatedOn)', ds_item.get('utcCreatedOn')),
        ('Změněno (utcModifiedOn)', ds_item.get('utcModifiedOn')),
    ]
    for k, v in ds_item.items():
        if k not in [x[0] for x in rows] and k != 'agent' and not any(k == x[0].split(' ')[0] for x in rows):
            rows.append((k, str(v) if v is not None else ''))
            
    df_detail_view = pd.DataFrame(rows, columns=['Vlastnost (Property)', 'Hodnota (Value)'])
    st.dataframe(df_detail_view, width="stretch", hide_index=True)


def extract_nested_mappings(field):
    """
    Extrahuje seznam vnořených mapování entit z pole mappings nebo options.
    Podporuje jak list slovníků (běžný AVA formát), tak jednotlivý dict i JSON/eval string.
    Vrací seznam slovníků: [{'entityId': '...', 'mappings': [...]}, ...]
    """
    if not isinstance(field, dict):
        return []
    
    m = field.get('mappings')
    if isinstance(m, str):
        clean_m = m.strip()
        if (clean_m.startswith('[') and clean_m.endswith(']')) or (clean_m.startswith('{') and clean_m.endswith('}')):
            try:
                m = json.loads(clean_m)
            except Exception:
                try:
                    m = ast.literal_eval(clean_m)
                except Exception:
                    m = None
        else:
            m = None

    results = []
    if isinstance(m, dict):
        if 'entityId' in m or 'mappings' in m or 'modelId' in m:
            results.append(m)
    elif isinstance(m, list):
        for item in m:
            if isinstance(item, dict) and ('entityId' in item or 'mappings' in item or 'modelId' in item):
                results.append(item)
            elif isinstance(item, str):
                try:
                    p = json.loads(item)
                    if isinstance(p, dict) and ('entityId' in p or 'mappings' in p or 'modelId' in p):
                        results.append(p)
                except Exception:
                    pass

    # Pokud je transformationType NestedObjectMapping, ale v mappings nic není nebo se nepodařilo rozparsovat:
    if not results and field.get('transformationType') == 'NestedObjectMapping':
        entity_hint = field.get('targetFieldName') or field.get('sourceFieldName') or 'NestedObject'
        results.append({
            'entityId': entity_hint,
            'mappings': [],
            '_placeholder': True
        })

    return results


def extract_nested_mapping(field):
    """Zpětná kompatibilita - vrací první vnořené mapování nebo None"""
    res = extract_nested_mappings(field)
    return res[0] if res else None


def format_field_options(opts):
    """Lidsky čitelné formátování options (key: value)"""
    if not opts:
        return ''
    if isinstance(opts, str):
        if opts.strip().startswith('[') or opts.strip().startswith('{'):
            try:
                opts = json.loads(opts)
            except Exception:
                return opts
        else:
            return opts
    if isinstance(opts, list):
        parts = []
        for x in opts:
            if isinstance(x, dict):
                parts.append(f"{x.get('key')}: {x.get('value')}")
            else:
                parts.append(str(x))
        return ', '.join(parts)
    if isinstance(opts, dict):
        return ', '.join(f"{k}: {v}" for k, v in opts.items())
    return str(opts)


@st.dialog("🧩 Vnořená entita (Nested Entity Mapping)", width="large")
def show_nested_mapping_modal():
    """Modální dialog s hierarchickou navigací vnořených entit do libovolné hloubky N"""
    stack = st.session_state.get('nested_drill_stack', [])
    if not stack:
        st.info("Žádná vnořená entita k zobrazení.")
        return

    # Breadcrumbs navigace
    b_col1, b_col2 = st.columns([8, 2], vertical_alignment="center")
    with b_col1:
        crumbs = []
        for i, itm in enumerate(stack):
            lbl = itm.get('label') or f"Úroveň {i+1}"
            if i == len(stack) - 1:
                crumbs.append(f"**{lbl}**")
            else:
                crumbs.append(f"`{lbl}`")
        st.markdown("🗂️ **Hierarchie vnoření:** " + " ➔ ".join(crumbs))
    with b_col2:
        if len(stack) > 1:
            if st.button("◀️ O úroveň výš", key=f"btn_nested_back_{len(stack)}", use_container_width=True):
                stack.pop()
                st.session_state['nested_drill_stack'] = stack
                st.rerun(scope="fragment")

    current_item = stack[-1]
    nested_data = current_item.get('data', {})

    # Metadata vnořené entity
    m_col1, m_col2, m_col3, m_col4 = st.columns([3, 3, 2, 4], vertical_alignment="center")
    with m_col1:
        st.markdown(f"**Entity ID:** `{nested_data.get('entityId', 'N/A')}`")
    with m_col2:
        model_id = str(nested_data.get('modelId', 'N/A'))
        st.markdown(f"**Model ID:** `{model_id[:8]}...`" if len(model_id) > 8 else f"**Model ID:** `{model_id}`")
    with m_col3:
        st.markdown(f"**Priorita:** `{nested_data.get('priority', 0)}`")
    with m_col4:
        show_raw = st.toggle("📦 Surový JSON", key=f"toggle_json_sub_{len(stack)}")

    if show_raw:
        st.json(nested_data)

    # Seznam polí vnořené entity
    sub_field_list = nested_data.get('mappings', []) if isinstance(nested_data.get('mappings'), list) else []
    if sub_field_list:
        st.markdown(f"##### 📋 Mapování atributů vnořené entity ({len(sub_field_list)}):")
        
        display_sub_rows = []
        deeper_nested_fields = []
        for sf in sub_field_list:
            if isinstance(sf, dict):
                sub_nested_list = extract_nested_mappings(sf)
                src_name = sf.get('sourceFieldName', '')
                tgt_name = sf.get('targetFieldName', '')
                f_name = tgt_name or src_name or 'Neznámé pole'
                
                if sub_nested_list:
                    parts = []
                    for s_nest in sub_nested_list:
                        s_eid = s_nest.get('entityId') or f_name
                        s_cnt = len(s_nest.get('mappings', [])) if isinstance(s_nest.get('mappings'), list) else 0
                        parts.append(f"📦 {s_eid} ({s_cnt} polí)")
                        deeper_nested_fields.append((f_name, s_nest))
                    map_cell = ", ".join(parts)
                else:
                    map_cell = str(sf.get('mappings') or '')

                display_sub_rows.append({
                    'sourceFieldName': src_name,
                    'targetFieldName': tgt_name,
                    'transformationType': sf.get('transformationType', ''),
                    'aggregateFunction': str(sf.get('aggregateFunction') or ''),
                    'options': format_field_options(sf.get('options')),
                    'mappings': map_cell
                })

        df_sub = pd.DataFrame(display_sub_rows)
        st.dataframe(df_sub, use_container_width=True, hide_index=True)

        # Pokud jsou v této úrovni další vnořené entity (úroveň N+1)
        if deeper_nested_fields:
            st.markdown("---")
            st.markdown("##### 📦 Další vnořené entity v této úrovni (prozkoumat hlouběji):")
            st.caption("Kliknutím na vnořenou entitu přejdete do jejího detailního mapování:")
            d_cols = st.columns(min(len(deeper_nested_fields), 3))
            for di, (d_name, d_obj) in enumerate(deeper_nested_fields):
                d_c = d_cols[di % len(d_cols)]
                with d_c:
                    d_eid = d_obj.get('entityId') or d_name
                    d_sub_cnt = len(d_obj.get('mappings', [])) if isinstance(d_obj.get('mappings'), list) else 0
                    if st.button(
                        f"🔍 Vnořené mapování: **{d_name}** ({d_eid}) ➔",
                        key=f"btn_drill_deep_{d_name}_{len(stack)}_{di}",
                        use_container_width=True,
                        type="primary",
                        help=f"Zobrazí mapování vnořené entity '{d_eid}' ({d_sub_cnt} polí)"
                    ):
                        stack.append({
                            'label': f"{d_name} ({d_eid})",
                            'data': d_obj
                        })
                        st.session_state['nested_drill_stack'] = stack
                        st.rerun(scope="fragment")
    else:
        st.info("Tato vnořená entita nemá definována žádná explicitní pole (mappings pole je prázdné).")

    # Expressions
    sub_exprs = nested_data.get('expressions', [])
    if sub_exprs:
        st.markdown(f"##### 🔣 Výrazy (Expressions - {len(sub_exprs)}):")
        st.json(sub_exprs)


def clear_ds_filters_callback():
    """Bezpečný reset filtrů v on_click callbacku před vykreslením widgetů"""
    st.session_state['data_sources_filters'] = {
        'source_id': '',
        'agent_id': '',
        'application_code': ''
    }
    st.session_state['ds_filter_source_id'] = ''
    st.session_state['ds_filter_agent_id'] = ''
    st.session_state['ds_filter_app_code'] = ''
    st.session_state['ds_local_search_input'] = ''
    st.session_state['ds_local_search'] = ''
    st.session_state['ds_active_source_id'] = ''
    st.session_state['data_sources_offset'] = 0


def render_tab():
    st.markdown("### 🔌 Seznam Data Sources (DataSources)")
    st.caption("Stránkovaný a filtrovaný přehled všech definic Data Sources ze serverového endpointu `/api/v1/DataSources`.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
    tenant_id = st.session_state.get('impersonated_tenant_id') or creds.get('tenant_id', '')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení Data Sources je vyžadováno aktivní připojení k API.")
        st.stop()

    # Inicializace stavů stránkování a filtrů
    if 'data_sources_offset' not in st.session_state:
        st.session_state['data_sources_offset'] = 0
    if 'data_sources_limit' not in st.session_state:
        st.session_state['data_sources_limit'] = 500
    if 'data_sources_filters' not in st.session_state:
        st.session_state['data_sources_filters'] = {
            'source_id': '',
            'agent_id': '',
            'application_code': ''
        }

    # Pokud přicházíme se zadaným ID zdroje (např. kliknutím v logu):
    incoming_source_id = st.session_state.pop('data_sources_selected_id', None)
    if incoming_source_id:
        src_val = str(incoming_source_id).strip()
        st.session_state['data_sources_filters']['source_id'] = src_val
        st.session_state['ds_filter_source_id'] = src_val
        st.session_state['ds_active_source_id'] = src_val
        st.session_state['ds_local_search'] = ''  # Lokální hledání zůstane čisté, Source ID je přímo ve filtru
        st.session_state['ds_filters_expanded'] = True

    # --- FILTRY NAČÍTÁNÍ ---
    curr_filters = st.session_state['data_sources_filters']
    filter_src_val = curr_filters.get('source_id', '')
    filter_agent_val = curr_filters.get('agent_id', '')
    filter_app_val = curr_filters.get('application_code', '')

    active_filter_chips = []
    if filter_src_val:
        active_filter_chips.append(f"SourceID: `{filter_src_val}`")
    if filter_agent_val:
        active_filter_chips.append(f"AgentID: `{filter_agent_val}`")
    if filter_app_val:
        active_filter_chips.append(f"AppCode: `{filter_app_val}`")

    filter_title = "🔍 Filtry Data Sources (DataSources)"
    if active_filter_chips:
        filter_title += f" — aktivní: {' | '.join(active_filter_chips)}"

    should_expand = bool(st.session_state.get('ds_filters_expanded') or filter_src_val or filter_agent_val or filter_app_val)
    st.session_state['ds_filters_expanded'] = False

    with st.expander(filter_title, expanded=should_expand):
        f_col1, f_col2, f_col3 = st.columns(3)
        with f_col1:
            source_id_input = st.text_input(
                "Source ID (GUID zdroje):",
                value=filter_src_val,
                key="ds_filter_source_id",
                placeholder="Zadejte GUID zdroje (sourceId)...",
                help="Filtrovat přesné Source ID (lze kdykoliv přepsat nebo smazat)"
            )
        with f_col2:
            agent_id = st.text_input(
                "AgentId:",
                value=filter_agent_val,
                key="ds_filter_agent_id",
                placeholder="Filtrovat podle Agent ID..."
            )
        with f_col3:
            app_code = st.text_input(
                "ApplicationCode:",
                value=filter_app_val,
                key="ds_filter_app_code",
                placeholder="Filtrovat podle kódu aplikace..."
            )

        fb_col1, fb_col2 = st.columns([3, 1])
        with fb_col1:
            if st.button("🚀 Použít filtry a načíst Data Sources", type="primary", key="btn_apply_ds_filters", width="stretch"):
                st.session_state['data_sources_filters'] = {
                    'source_id': source_id_input.strip(),
                    'agent_id': agent_id.strip(),
                    'application_code': app_code.strip()
                }
                st.session_state['ds_active_source_id'] = source_id_input.strip()
                st.session_state['data_sources_offset'] = 0
                st.rerun()
        with fb_col2:
            st.button(
                "❌ Vyčistit filtry",
                on_click=clear_ds_filters_callback,
                key="btn_clear_ds_filters",
                width="stretch",
                help="Smaže všechny zadané filtry včetně Source ID"
            )

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

    # --- PŘÍPRAVA DATAFRAME ---
    df_raw = pd.DataFrame(items)

    # Extrakovat kód agenta z embedded objektu `agent`
    if 'agent' in df_raw.columns:
        df_raw['agentCode'] = df_raw['agent'].apply(lambda a: a.get('code') if isinstance(a, dict) else '')
    elif not df_raw.empty:
        df_raw['agentCode'] = ''

    # Pokud je zadán filter podle source_id, aplikujeme ho na df_raw
    filter_src = filters.get('source_id', '').strip()
    if filter_src and not df_raw.empty and 'id' in df_raw.columns:
        filtered_df = df_raw[df_raw['id'].astype(str).str.lower().str.contains(filter_src.lower(), na=False)].reset_index(drop=True)
        if not filtered_df.empty:
            df_raw = filtered_df
        else:
            # Pokud nebyl nalezen v načteném seznamu, zkusíme přímý dotaz na /DataSources/{source_id}
            try:
                single_item = api_client.fetch_datasource_info(creds['api_url'], token, tenant_id, filter_src)
                if single_item and isinstance(single_item, dict) and single_item.get('id'):
                    df_raw = pd.DataFrame([single_item])
                    if 'agent' in df_raw.columns:
                        df_raw['agentCode'] = df_raw['agent'].apply(lambda a: a.get('code') if isinstance(a, dict) else '')
                    else:
                        df_raw['agentCode'] = ''
            except Exception:
                df_raw = pd.DataFrame()

    if df_raw.empty:
        if filter_src:
            st.warning(f"Pro zadaný filtr Source ID `{filter_src}` nebyl nalezen žádný Data Source.")
        else:
            st.warning("Pro zadané filtry nebyly nalezeny žádné Data Sources.")
        st.stop()

    # Lokální filtr podle textu (vyhledávací řádek)
    curr_search_val = st.session_state.get('ds_local_search', '')
    if curr_search_val and not df_raw.empty:
        df_raw = ui_helpers.filter_dataframe_local(df_raw, curr_search_val.lower())

    if not df_raw.empty and 'name' in df_raw.columns:
        df_raw = df_raw.sort_values(by='name', key=lambda col: col.str.lower(), ascending=True).reset_index(drop=True)

    # SUMARIZAČNÍ STATISTIKY PRO KOMPAKTNÍ ZOBRAZENÍ V ŘÁDKU
    ds_enabled_cnt = len(df_raw[df_raw['enabled'] == True]) if 'enabled' in df_raw.columns else 0
    ds_reg_cnt = len(df_raw[df_raw['isRegistered'] == True]) if 'isRegistered' in df_raw.columns else 0
    ds_app_cnt = df_raw['applicationCode'].nunique() if 'applicationCode' in df_raw.columns else 0

    # --- STRÁNKOVÁNÍ A LOKÁLNÍ VYHLEDÁVÁNÍ (KOMPAKTNÍ LIŠTA) ---
    current_page = (offset // limit) + 1
    max_page = max(1, (total_count + limit - 1) // limit) if total_count else 1

    p_col1, p_col2, p_col3, p_col4 = st.columns([5, 1, 1, 2], vertical_alignment="center")
    with p_col1:
        ui_helpers.render_html(f"""
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; height: 38px; font-family: Inter, sans-serif; font-size: 0.83rem;">
            <span style="font-weight: 600; color: #0f172a;">Strana:</span>
            {ui_helpers.render_badge(f'{current_page} / {max_page}', 'neutral')}
            <span style="color: #64748b;">Načteno: <b>{len(df_raw)}</b> (Celkem: <b>{total_count}</b>)</span>
            <span style="color: #cbd5e1;">•</span>
            {ui_helpers.render_badge(f'🟢 Povoleno: {ds_enabled_cnt}', 'success')}
            {ui_helpers.render_badge(f'📑 Registrované: {ds_reg_cnt}', 'info')}
            {ui_helpers.render_badge(f'📱 Aplikací: {ds_app_cnt}', 'neutral')}
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
        local_search_input = st.text_input("🔎 Rychlé lokální hledání:", value=curr_search_val, key="ds_local_search_input", placeholder="Hledat název, ID, kód...").strip()
        if local_search_input != curr_search_val:
            st.session_state['ds_local_search'] = local_search_input
            st.rerun()

    # Preferované sloupce pro tabulku
    preferred_cols = ['id', 'name', 'agentId', 'agentCode', 'applicationCode', 'clientId', 'enabled', 'isRegistered', 'consumerType', 'accessLevel', 'utcCreatedOn', 'utcModifiedOn']
    display_cols = [c for c in preferred_cols if c in df_raw.columns]
    for c in df_raw.columns:
        if c not in display_cols and c != 'agent':
            display_cols.append(c)

    ds_grid_height = min(500, max(220, len(df_raw) * 36 + 45))
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

    # --- VYBRANÝ DATASOURCE A JEHO KOMPAKTNÍ AKČNÍ LIŠTA ---
    sel_idx = None
    if selection.selection.cells:
        sel_idx = selection.selection.cells[0][0]
    elif selection.selection.rows:
        sel_idx = selection.selection.rows[0]

    # Pokud uživatel nekliknul, ale máme aktivní ID nebo po vyhledání zbyl 1 řádek
    if sel_idx is None and not df_raw.empty:
        active_id = filter_src or st.session_state.get('ds_active_source_id')
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

        # Kompaktní lišta s tlačítky pro detail a JSON místo dlouhého statického výpisu
        act_c1, act_c2, act_c3 = st.columns([5, 2.5, 2.5], vertical_alignment="center")
        with act_c1:
            st.markdown(f"Vybraný zdroj: **{selected_item.get('name') or selected_item.get('id')}** (`{selected_source_id}`)")
        with act_c2:
            if st.button("📋 Zobrazit detail zdroje", key=f"btn_modal_detail_{selected_source_id}", width="stretch", help="Otevře kompletní přehledné vlastnosti zdroje v dialogu"):
                show_datasource_detail_modal(selected_item)
        with act_c3:
            if st.button("📦 Zobrazit JSON zdroje", key=f"btn_modal_json_{selected_source_id}", width="stretch", help="Otevře surový JSON záznam v dialogu"):
                ui_helpers.show_json_modal(json.dumps(selected_item, indent=2, ensure_ascii=False), title=f"JSON DataSource: {selected_item.get('name') or selected_source_id}")

        # --- SEZNAM DATOVÝCH TRANSFORMACÍ (DataTransformations) ---
        st.markdown("---")
        t_header_col1, t_header_col2 = st.columns([8, 2], vertical_alignment="center")
        with t_header_col1:
            st.markdown("### 🔀 Datové transformace (DataTransformations)")
            st.caption(f"Souhrnný seznam všech mapování entit pro DataSource: `{selected_item.get('name')}` (`{selected_source_id}`)")
        with t_header_col2:
            if st.button("🔄 Obnovit transformace", key=f"btn_refresh_tr_{selected_source_id}", width="stretch"):
                st.rerun()

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

            if not tr_items:
                st.warning(f"⚠️ Pro tento Data Source `{selected_source_id}` nebyly nalezeny žádné definice transformací (celkem: 0).")
                st.info("💡 Pokud provozní log hlásí varování typu *'ENTITY MAPPINGS: No transformation for ... entity-mapping identifier'*, znamená to, že pro tento DataSource chybí příslušná definice mapování entit v AVA.")
            else:
                # Sestavení jednoho souhrnného plochého seznamu všech mapování všech entit
                all_mappings = []
                for tr_def in tr_items:
                    tr_id = tr_def.get('id', '')
                    custom_code = tr_def.get('customCode', '')
                    released = tr_def.get('released', False)
                    deleted = tr_def.get('deleted', False)
                    mappings_list = tr_def.get('mappings', []) if isinstance(tr_def.get('mappings'), list) else []

                    for m in mappings_list:
                        field_maps = m.get('mappings', []) if isinstance(m.get('mappings'), list) else []
                        exprs = m.get('expressions', []) if isinstance(m.get('expressions'), list) else []
                        
                        ownership = m.get('entityOwnership')
                        if isinstance(ownership, (dict, list)):
                            ownership_str = json.dumps(ownership, ensure_ascii=False)
                        else:
                            ownership_str = str(ownership or '')

                        all_mappings.append({
                            'entityId': str(m.get('entityId', '')).strip(),
                            'entityMappingId': str(m.get('entityMappingId', '')).strip(),
                            'priority': m.get('priority', 0),
                            'transformationType': m.get('transformationType', ''),
                            'modelId': str(m.get('modelId', '')).strip(),
                            'customCode': custom_code,
                            'fieldCount': len(field_maps),
                            'exprCount': len(exprs),
                            'autoMapCommon': bool(m.get('autoMapCommonFields')),
                            'autoMapCustom': bool(m.get('autoMapCustomFields')),
                            'released': '🟢 Vydáno' if released else '🟡 Návrh',
                            'status': '🔴 Smazáno' if deleted else '🟢 Aktivní',
                            'transformationId': tr_id,
                            '_field_maps': field_maps,
                            '_expressions': exprs,
                            '_raw_mapping': m,
                            '_raw_tr_def': tr_def
                        })

                if not all_mappings:
                    st.info("Tento Data Source má registrovanou transformaci, ale neobsahuje žádná mapování entit (pole mappings je prázdné).")
                else:
                    df_all_map = pd.DataFrame(all_mappings)

                    # Řazení podle entityId, případně entityMappingId nebo priority
                    df_all_map = df_all_map.sort_values(
                        by=['entityId', 'entityMappingId', 'priority'],
                        ascending=[True, True, True]
                    ).reset_index(drop=True)

                    display_map_cols = [
                        'entityId', 'entityMappingId', 'priority', 'transformationType',
                        'modelId', 'fieldCount', 'exprCount', 'autoMapCommon', 'autoMapCustom',
                        'released', 'customCode'
                    ]

                    map_grid_height = min(450, max(180, len(df_all_map) * 36 + 45))
                    map_selection = st.dataframe(
                        df_all_map[display_map_cols],
                        width="stretch",
                        height=map_grid_height,
                        hide_index=True,
                        selection_mode="single-cell",
                        on_select="rerun",
                        key=f"df_mappings_grid_{selected_source_id}",
                        column_config={
                            'entityId': st.column_config.TextColumn(label='Entity ID', width="medium", help='Identifikátor entity modelu (např. 22, 1011, ProjectHeader)'),
                            'entityMappingId': st.column_config.TextColumn(label='Entity Mapping ID', width="medium", help='Identifikátor mapování (např. 111|ProjectHeader)'),
                            'priority': st.column_config.NumberColumn(label='Priorita', width="small"),
                            'transformationType': st.column_config.TextColumn(label='Typ transformace'),
                            'modelId': st.column_config.TextColumn(label='Model ID (Data Model GUID)', width="large"),
                            'fieldCount': st.column_config.NumberColumn(label='Počet polí', width="small"),
                            'exprCount': st.column_config.NumberColumn(label='Počet výrazů', width="small"),
                            'autoMapCommon': st.column_config.CheckboxColumn(label='Auto Common'),
                            'autoMapCustom': st.column_config.CheckboxColumn(label='Auto Custom'),
                            'released': st.column_config.TextColumn(label='Stav'),
                            'customCode': st.column_config.TextColumn(label='Custom Code')
                        }
                    )

                    # --- DETAIL VYBRANÉHO MAPOVÁNÍ ENTITY (POLÍ A VÝRAZŮ) ---
                    sel_map_idx = 0
                    if map_selection.selection.cells:
                        sel_map_idx = map_selection.selection.cells[0][0]
                    elif map_selection.selection.rows:
                        sel_map_idx = map_selection.selection.rows[0]

                    if sel_map_idx < len(df_all_map):
                        active_m = df_all_map.iloc[sel_map_idx]
                        
                        with st.container(border=True):
                            det_col1, det_col2, det_col3 = st.columns([5, 3.5, 3.5], vertical_alignment="center")
                            with det_col1:
                                ent_title = active_m['entityId']
                                if active_m['entityMappingId'] and active_m['entityMappingId'] != active_m['entityId']:
                                    ent_title += f" &nbsp;(`{active_m['entityMappingId']}`)"
                                st.markdown(f"#### 🔍 Detail mapování pro entitu: **`{ent_title}`**")
                            with det_col2:
                                if st.button("📦 JSON transformace", key=f"btn_tr_json_{active_m['transformationId']}", width="stretch", help="Zobrazí celou definici DataTransformation v dialogu"):
                                    ui_helpers.show_json_modal(json.dumps(active_m['_raw_tr_def'], indent=2, ensure_ascii=False), title=f"JSON Definice transformace ({active_m['transformationId']})")
                            with det_col3:
                                if st.button("📋 JSON mapování entity", key=f"btn_map_json_{active_m['entityId']}_{sel_map_idx}", width="stretch", help="Zobrazí JSON tohoto konkrétního mapování entity"):
                                    ui_helpers.show_json_modal(json.dumps(active_m['_raw_mapping'], indent=2, ensure_ascii=False), title=f"JSON Mapování entity {active_m['entityId']}")

                            # Zobrazení konkrétních polí (Field Mappings) a výrazů (Expressions)
                            field_maps = active_m['_field_maps']
                            exprs = active_m['_expressions']

                            if field_maps:
                                if isinstance(field_maps, list) and len(field_maps) > 0 and isinstance(field_maps[0], dict):
                                    display_field_rows = []
                                    found_nested = []
                                    for f in field_maps:
                                        if isinstance(f, dict):
                                            nested_list = extract_nested_mappings(f)
                                            src_n = f.get('sourceFieldName', '')
                                            tgt_n = f.get('targetFieldName', '')
                                            f_label = tgt_n or src_n or 'Pole'
                                            
                                            if nested_list:
                                                parts = []
                                                for nest_item in nested_list:
                                                    nested_eid = nest_item.get('entityId') or f_label
                                                    sub_cnt = len(nest_item.get('mappings', [])) if isinstance(nest_item.get('mappings'), list) else 0
                                                    parts.append(f"📦 {nested_eid} ({sub_cnt} polí)")
                                                    found_nested.append((f_label, nest_item))
                                                map_col_text = ", ".join(parts)
                                            else:
                                                map_col_text = str(f.get('mappings') or '')

                                            display_field_rows.append({
                                                'sourceFieldName': src_n,
                                                'targetFieldName': tgt_n,
                                                'transformationType': f.get('transformationType', ''),
                                                'aggregateFunction': str(f.get('aggregateFunction') or ''),
                                                'options': format_field_options(f.get('options')),
                                                'mappings': map_col_text
                                            })

                                    # Pokud entita obsahuje vnořené entity (např. contacts, addresses), zobrazíme tlačítka PŘED tabulkou
                                    if found_nested:
                                        st.info(f"💡 **Nalezena vnořená mapování entit ({len(found_nested)}):** Kliknutím na tlačítko níže otevřete detailní mapování vnořené entity (podporuje zanoření do libovolné hloubky).")
                                        n_cols_top = st.columns(min(len(found_nested), 4))
                                        for ni, (fn_name, fn_obj) in enumerate(found_nested):
                                            ncol = n_cols_top[ni % len(n_cols_top)]
                                            with ncol:
                                                fn_eid = fn_obj.get('entityId') or fn_name
                                                fn_cnt = len(fn_obj.get('mappings', [])) if isinstance(fn_obj.get('mappings'), list) else 0
                                                if st.button(
                                                    f"🔍 Vnořené: **{fn_name}** ({fn_eid})",
                                                    key=f"btn_open_nested_top_{fn_name}_{active_m['entityId']}_{ni}",
                                                    use_container_width=True,
                                                    type="primary",
                                                    help=f"Otevře dialog pro prozkoumání mapování vnořené entity '{fn_eid}' ({fn_cnt} polí)"
                                                ):
                                                    st.session_state['nested_drill_stack'] = [{
                                                        'label': f"{active_m['entityId']} ➔ {fn_name} ({fn_eid})",
                                                        'data': fn_obj
                                                    }]
                                                    show_nested_mapping_modal()

                                    st.markdown(f"**Mapování atributů/polí ({len(field_maps)}):**")
                                    df_fields_view = pd.DataFrame(display_field_rows)
                                    st.dataframe(df_fields_view, width="stretch", hide_index=True)
                                else:
                                    st.json(field_maps)
                            else:
                                st.info("Toto mapování nemá žádná explicitně vyjmenovaná pole v poli mappings (např. spoléhá na auto-mapping).")

                            if exprs:
                                st.markdown(f"**Výrazy (Expressions - {len(exprs)}):**")
                                st.json(exprs)
