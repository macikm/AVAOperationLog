import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 🤖 Seznam Data Agentů (DataAgents)")
    st.caption("Stránkovaný a filtrovaný přehled všech definic Data Agentů ze serverového endpointu `/api/v1/DataAgents`.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('access_token')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení Data Agentů je vyžadováno aktivní připojení k API.")
        st.stop()

    # Inicializace stavů stránkování a filtrů
    if 'data_agents_offset' not in st.session_state:
        st.session_state['data_agents_offset'] = 0
    if 'data_agents_limit' not in st.session_state:
        st.session_state['data_agents_limit'] = 50
    if 'data_agents_filters' not in st.session_state:
        st.session_state['data_agents_filters'] = {
            'provider_code': '',
            'custom_code': '',
            'include_deleted': False
        }

    # --- FILTRY NAČÍTÁNÍ ---
    with st.expander("🔍 Serverové filtry (DataAgents)", expanded=False):
        f_col1, f_col2, f_col3 = st.columns([2, 2, 1])
        with f_col1:
            provider_code = st.text_input("ProviderCode:", value=st.session_state['data_agents_filters']['provider_code'], key="da_filter_provider_code")
        with f_col2:
            custom_code = st.text_input("CustomCode:", value=st.session_state['data_agents_filters']['custom_code'], key="da_filter_custom_code")
        with f_col3:
            st.markdown("<br>", unsafe_allow_html=True)
            include_deleted = st.checkbox("Včetně smazaných", value=st.session_state['data_agents_filters']['include_deleted'], key="da_filter_include_deleted")

        if st.button("🚀 Použít filtry a načíst Data Agenty", key="btn_apply_da_filters", width="stretch"):
            st.session_state['data_agents_filters'] = {
                'provider_code': provider_code,
                'custom_code': custom_code,
                'include_deleted': include_deleted
            }
            st.session_state['data_agents_offset'] = 0
            st.rerun()

    # --- NAČTENÍ DAT ZE SERVERU ---
    limit = st.session_state['data_agents_limit']
    offset = st.session_state['data_agents_offset']
    filters = st.session_state['data_agents_filters']

    try:
        with st.spinner("Načítám Data Agenty..."):
            response_data = api_client.fetch_data_agents(
                creds['api_url'], token, creds['tenant_id'],
                limit=limit, offset=offset, filters=filters
            )
    except Exception as e:
        st.error(f"Načtení Data Agentů selhalo: {e}")
        st.stop()

    items = response_data.get('items', []) if isinstance(response_data, dict) else (response_data if isinstance(response_data, list) else [])
    total_count = response_data.get('totalCount') if isinstance(response_data, dict) else len(items)

    if not items:
        st.warning("Pro zadané filtry nebyly nalezeni žádní Data Agenti.")
        st.stop()

    # --- STRÁNKOVÁNÍ A LOKÁLNÍ VYHLEDÁVÁNÍ ---
    current_page = (offset // limit) + 1
    max_page = max(1, (total_count + limit - 1) // limit) if total_count else 1

    p_col1, p_col2, p_col3, p_col4 = st.columns([3, 1, 1, 2])
    with p_col1:
        st.markdown(f"ℹ️ Zobrazeno **{len(items)}** agentů na straně **{current_page} / {max_page}** (Celkem: **{total_count}**)")
    with p_col2:
        if st.button("◀️ Předchozí", key="btn_prev_da", disabled=(offset == 0)):
            st.session_state['data_agents_offset'] = max(0, offset - limit)
            st.rerun()
    with p_col3:
        if st.button("Další ▶️", key="btn_next_da", disabled=(offset + limit >= total_count)):
            st.session_state['data_agents_offset'] = offset + limit
            st.rerun()
    with p_col4:
        local_search = st.text_input("🔎 Rychlé lokální hledání:", value="", key="da_local_search", placeholder="Hledat kód, ID, popis...").strip().lower()

    # --- PŘÍPRAVA DATAFRAME ---
    df_raw = pd.DataFrame(items)
    
    # Úprava pole providerCodes na řetězec
    if 'providerCodes' in df_raw.columns:
        df_raw['providerCodesStr'] = df_raw['providerCodes'].apply(lambda x: ", ".join(x) if isinstance(x, list) else str(x or ''))
    else:
        df_raw['providerCodesStr'] = ""

    # Lokální filtr podle textu
    if local_search and not df_raw.empty:
        mask = df_raw.apply(lambda row: local_search in " ".join([str(v) for v in row.values if pd.notna(v)]).lower(), axis=1)
        df_raw = df_raw[mask].reset_index(drop=True)

    # Preferované sloupce
    preferred_cols = ['id', 'code', 'customCode', 'providerCodesStr', 'description', 'enabled', 'released', 'deleted', 'accessLevel', 'utcCreatedOn', 'utcModifiedOn']
    display_cols = [c for c in preferred_cols if c in df_raw.columns]
    for c in df_raw.columns:
        if c not in display_cols and c != 'providerCodes':
            display_cols.append(c)

    selection = st.dataframe(
        df_raw[display_cols],
        width="stretch",
        hide_index=True,
        selection_mode=["single-row", "single-column"],
        on_select="rerun",
        key="df_data_agents_grid",
        column_config={
            'id': st.column_config.TextColumn(label='Agent ID (id)', width="large"),
            'code': st.column_config.TextColumn(label='Kód (code)', width="medium"),
            'customCode': st.column_config.TextColumn(label='Vlastní kód (customCode)'),
            'providerCodesStr': st.column_config.TextColumn(label='Poskytovatelé (providerCodes)'),
            'description': st.column_config.TextColumn(label='Popis (description)'),
            'enabled': st.column_config.CheckboxColumn(label='Povoleno'),
            'released': st.column_config.CheckboxColumn(label='Vydáno'),
            'deleted': st.column_config.CheckboxColumn(label='Smazáno'),
            'accessLevel': st.column_config.TextColumn(label='Přístup (accessLevel)'),
            'utcCreatedOn': st.column_config.TextColumn(label='Vytvořeno (UTC)'),
            'utcModifiedOn': st.column_config.TextColumn(label='Změněno (UTC)')
        }
    )

    # --- DETAIL VYBRANÉHO AGENTA ---
    if selection.selection.rows:
        sel_idx = selection.selection.rows[0]
        if sel_idx < len(df_raw):
            selected_item = df_raw.iloc[sel_idx].to_dict()
            st.markdown(f"#### 🔎 Detail vybraného agenta: **{selected_item.get('code', selected_item.get('id'))}**")
            
            d_col1, d_col2 = st.columns(2)
            with d_col1:
                st.markdown(f"- **Agent ID:** `{selected_item.get('id')}`")
                st.markdown(f"- **Code:** `{selected_item.get('code')}`")
                st.markdown(f"- **CustomCode:** `{selected_item.get('customCode') or 'N/A'}`")
                st.markdown(f"- **ProviderCodes:** `{selected_item.get('providerCodesStr') or 'N/A'}`")
            with d_col2:
                st.markdown(f"- **Povoleno (enabled):** {'🟢 Ano' if selected_item.get('enabled') else '🔴 Ne'}")
                st.markdown(f"- **Vydáno (released):** {'🟢 Ano' if selected_item.get('released') else '⚪ Ne'}")
                st.markdown(f"- **Smazáno (deleted):** {'🔴 Ano' if selected_item.get('deleted') else '🟢 Ne'}")
                st.markdown(f"- **Přístup:** `{selected_item.get('accessLevel')}`")

            with st.expander("📦 Kompletní JSON struktura agenta", expanded=False):
                st.json(selected_item)
