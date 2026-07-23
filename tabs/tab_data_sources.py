import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 🔌 Seznam Data Sources (DataSources)")
    st.caption("Stránkovaný a filtrovaný přehled všech definic Data Sources ze serverového endpointu `/api/v1/DataSources`.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('access_token')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení Data Sources je vyžadováno aktivní připojení k API.")
        st.stop()

    # Inicializace stavů stránkování a filtrů
    if 'data_sources_offset' not in st.session_state:
        st.session_state['data_sources_offset'] = 0
    if 'data_sources_limit' not in st.session_state:
        st.session_state['data_sources_limit'] = 50
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

        if st.button("🚀 Použít filtry a načíst Data Sources", key="btn_apply_ds_filters", width="stretch"):
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
                creds['api_url'], token, creds['tenant_id'],
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

    p_col1, p_col2, p_col3, p_col4 = st.columns([3, 1, 1, 2])
    with p_col1:
        st.markdown(f"ℹ️ Zobrazeno **{len(items)}** zdrojů na straně **{current_page} / {max_page}** (Celkem: **{total_count}**)")
    with p_col2:
        if st.button("◀️ Předchozí", key="btn_prev_ds", disabled=(offset == 0)):
            st.session_state['data_sources_offset'] = max(0, offset - limit)
            st.rerun()
    with p_col3:
        if st.button("Další ▶️", key="btn_next_ds", disabled=(offset + limit >= total_count)):
            st.session_state['data_sources_offset'] = offset + limit
            st.rerun()
    with p_col4:
        local_search = st.text_input("🔎 Rychlé lokální hledání:", value="", key="ds_local_search", placeholder="Hledat název, ID, kód...").strip().lower()

    # --- PŘÍPRAVA DATAFRAME ---
    df_raw = pd.DataFrame(items)

    # Extrakovat kód agenta z embedded objektu `agent`
    if 'agent' in df_raw.columns:
        df_raw['agentCode'] = df_raw['agent'].apply(lambda a: a.get('code') if isinstance(a, dict) else '')
    else:
        df_raw['agentCode'] = ''

    # Lokální filtr podle textu
    if local_search and not df_raw.empty:
        mask = df_raw.apply(lambda row: local_search in " ".join([str(v) for v in row.values if pd.notna(v)]).lower(), axis=1)
        df_raw = df_raw[mask].reset_index(drop=True)

    if not df_raw.empty and 'name' in df_raw.columns:
        df_raw = df_raw.sort_values(by='name', key=lambda col: col.str.lower(), ascending=True).reset_index(drop=True)

    # Preferované sloupce
    preferred_cols = ['id', 'name', 'agentId', 'agentCode', 'applicationCode', 'clientId', 'enabled', 'isRegistered', 'consumerType', 'accessLevel', 'utcCreatedOn', 'utcModifiedOn']
    display_cols = [c for c in preferred_cols if c in df_raw.columns]
    for c in df_raw.columns:
        if c not in display_cols and c != 'agent':
            display_cols.append(c)

    selection = st.dataframe(
        df_raw[display_cols],
        width="stretch",
        hide_index=True,
        selection_mode=["single-row", "single-column"],
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
    if selection.selection.rows:
        sel_idx = selection.selection.rows[0]
        if sel_idx < len(df_raw):
            selected_item = df_raw.iloc[sel_idx].to_dict()
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
