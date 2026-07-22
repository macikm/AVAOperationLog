import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, time
import api_client
import ui_helpers

def detail_status_changed():
    st.session_state['saved_detail_statuses'] = st.session_state['local_detail_status_widget']

def render_tab():
    is_empty_data = len(st.session_state['fetched_logs']) == 0

    # --- SERVEROVÉ FILTRY ---
    with st.expander("📡 API Filtry (Stahování dat ze serveru)", expanded=is_empty_data):

        f_col1, f_col2, f_col3 = st.columns([2, 1, 1])
        with f_col1:
            api_op_id = st.text_input("Operation ID:", value=st.session_state['api_filters']['operationId'], key="api_operation_id")
        with f_col2:
            api_sev = st.selectbox("Minimální závažnost:", ["Všechny", "Info", "Warning", "Error"],
                                   index=["Všechny", "Info", "Warning", "Error"].index(st.session_state['api_filters']['severity_level']))
        with f_col3:
            st.markdown("<br>", unsafe_allow_html=True)
            api_sys = st.checkbox("IncludeSystemLevel", value=st.session_state['api_filters']['include_system'])

        a_col1, a_col2, a_col3, a_col4 = st.columns(4)
        with a_col1: api_agent_code = st.text_input("Agent Code:", value=st.session_state['api_filters']['agent_code'], key="api_agent_code")
        with a_col2: api_agent_id = st.text_input("Agent ID:", value=st.session_state['api_filters']['agent_id'], key="api_agent_id")
        with a_col3: api_source_id = st.text_input("Source ID:", value=st.session_state['api_filters']['source_id'], key="api_source_id")
        with a_col4: api_op_scope = st.text_input("Operation Scope:", value=st.session_state['api_filters']['op_scope'], key="api_operation_scope")

        st.markdown("---")

        use_time = st.checkbox("🗓️ Omezit stahování a zobrazení na konkrétní datum/čas", value=st.session_state['api_filters']['use_time'])
        api_date_from, api_time_from, api_date_to, api_time_to = None, None, None, None
        if use_time:
            t_col1, t_col2, t_col3, t_col4 = st.columns(4)
            with t_col1: api_date_from = st.date_input("Od data:", value=st.session_state['api_filters']['date_from'], format="DD.MM.YYYY")
            with t_col2: api_time_from = st.time_input("Čas od:", value=st.session_state['api_filters']['time_from'])
            with t_col3: api_date_to = st.date_input("Do data:", value=st.session_state['api_filters']['date_to'], format="DD.MM.YYYY")
            with t_col4: api_time_to = st.time_input("Čas do:", value=st.session_state['api_filters']['time_to'])

        if st.button("🚀 Použít API filtry a nově stáhnout", width="stretch"):
            st.session_state['api_filters'] = {
                'operationId': api_op_id,
                'severity_level': api_sev,
                'include_system': api_sys,
                'agent_code': api_agent_code,
                'agent_id': api_agent_id,
                'source_id': api_source_id,
                'op_scope': api_op_scope,
                'use_time': use_time,
                'date_from': api_date_from if use_time else None,
                'time_from': api_time_from if use_time else None,
                'date_to': api_date_to if use_time else None,
                'time_to': api_time_to if use_time else None
            }
            creds = st.session_state['credentials']
            token = st.session_state['access_token']

            with st.spinner("Stahuji data podle nových filtrů..."):
                try:
                    initial_data = api_client.fetch_logs_page(
                        creds['api_url'], token, creds['tenant_id'],
                        limit=100, offset=0, filters=st.session_state['api_filters']
                    )
                    st.session_state['fetched_logs'] = []
                    st.session_state['fetched_details'] = {}
                    st.session_state['fetched_datasources'] = {}
                    st.session_state['current_offset'] = 0

                    if isinstance(initial_data, dict) and 'items' in initial_data:
                        st.session_state['fetched_logs'] = initial_data['items']
                    elif isinstance(initial_data, list):
                        st.session_state['fetched_logs'] = initial_data

                    st.rerun()
                except Exception as e:
                    st.error(f"Stažení dat selhalo: {str(e)}")

    if is_empty_data:
        st.warning("Pro zadané API filtry nevrátil server žádná data. Upravte filtry výše.")
    else:
        # --- ZPRACOVÁNÍ DATA ---
        df_raw = ui_helpers.clean_data(st.session_state['fetched_logs'])

        if not df_raw.empty:
            # TVRDÁ LOKÁLNÍ POJISTKA DATA A ČASU
            filters = st.session_state['api_filters']
            if filters['use_time']:
                tz_local = 'Europe/Prague'
                if filters['date_from'] is not None:
                    t_f = filters['time_from'] if filters['time_from'] is not None else time(0, 0, 0)
                    dt_from_loc = pd.Timestamp(datetime.combine(filters['date_from'], t_f)).tz_localize(tz_local)
                    df_raw = df_raw[df_raw['createdOn'] >= dt_from_loc.tz_convert('UTC')]

                if filters['date_to'] is not None:
                    t_t = filters['time_to'] if filters['time_to'] is not None else time(23, 59, 59)
                    dt_to_loc = pd.Timestamp(datetime.combine(filters['date_to'], t_t)).tz_localize(tz_local)
                    df_raw = df_raw[df_raw['createdOn'] <= dt_to_loc.tz_convert('UTC')]

            if df_raw.empty:
                st.warning("Data sice byla stažena, ale žádné události nespadají do přísného lokálního časového filtru.")
            else:
                df_clean = df_raw[df_raw['operationId'].notna() & (df_raw['operationId'] != '') & (df_raw['operationId'] != 'None')].copy()
                df_system = df_raw[df_raw['operationId'].isna() | (df_raw['operationId'] == '') | (df_raw['operationId'] == 'None')].copy()

                total_cnt = len(df_raw)
                err_cnt = len(df_raw[df_raw['severity'].astype(str).str.contains('Error')])
                warn_cnt = len(df_raw[df_raw['severity'].astype(str).str.contains('Warning')])
                min_time = df_raw['createdOn'].min()
                min_time_str = min_time.tz_convert('Europe/Prague').strftime('%Y-%m-%d %H:%M:%S') if pd.notna(min_time) else "N/A"

                # --- STAVOVÝ ŘÁDEK A STRÁNKOVÁNÍ ---
                info_col, chunk_input_col, btn_col = st.columns([6, 1, 2])

                with info_col:
                    st.markdown(f"ℹ️ **Aktuální stav paměti:** Načteno **{total_cnt}** událostí (🔴 {err_cnt} chyb, 🟡 {warn_cnt} varování). Nejstarší záznam: `{min_time_str}` (CZ)")

                with chunk_input_col:
                    chunk_size = st.number_input("Počet", min_value=10, max_value=5000, value=100, step=100, label_visibility="collapsed")

                with btn_col:
                    if st.button(f"📥 Načíst dalších {chunk_size} starších záznamů", width="stretch"):
                        creds = st.session_state['credentials']
                        token = st.session_state['access_token']

                        if not token:
                            st.error("Chybí token. Přihlaste se prosím znovu.")
                        else:
                            with st.spinner("Stahuji další data z Avaplace..."):
                                try:
                                    new_offset = st.session_state['current_offset'] + chunk_size
                                    next_data = api_client.fetch_logs_page(
                                        creds['api_url'], token, creds['tenant_id'],
                                        limit=chunk_size, offset=new_offset, filters=st.session_state['api_filters']
                                    )

                                    new_items = []
                                    if isinstance(next_data, dict) and 'items' in next_data:
                                        new_items = next_data['items']
                                    elif isinstance(next_data, list):
                                        new_items = next_data

                                    if new_items:
                                        combined_logs = st.session_state['fetched_logs'] + new_items
                                        unique_logs = {item['id']: item for item in combined_logs if 'id' in item}.values()
                                        st.session_state['fetched_logs'] = list(unique_logs)
                                        st.session_state['current_offset'] = new_offset
                                        st.rerun()
                                    else:
                                        st.info("Konec historie. Žádné další záznamy server nevrátil.")
                                except Exception as e:
                                    st.error(f"Nepodařilo se stáhnout další data: {str(e)}")

                # --- HLAVNÍ SEZNACOVACÍ GRID ---
                st.subheader("🗂️ Seznam operačních cyklů")

                # Agregace dat pro Master tabulku
                df_master_base = df_clean.groupby('operationId').agg(
                    První_výskyt=('createdOn', 'min'),
                    Počet_událostí=('id', 'count'),
                    Vsechny_zavaznosti=('severity', lambda x: set(x))
                ).reset_index()

                df_master_base['Stav'] = df_master_base['Vsechny_zavaznosti'].apply(ui_helpers.determine_badge)
                df_master_base = df_master_base[['Stav', 'operationId', 'První_výskyt', 'Počet_událostí']]

                df_master_filtered = df_master_base.sort_values(by='První_výskyt', ascending=False).reset_index(drop=True)

                selection_event = st.dataframe(
                    df_master_filtered,
                    width="stretch",
                    hide_index=True,
                    selection_mode="single-row",
                    on_select="rerun"
                )

                active_op_id = None
                if selection_event.selection.rows:
                    selected_idx = selection_event.selection.rows[0]
                    if selected_idx < len(df_master_filtered):
                        active_op_id = df_master_filtered.iloc[selected_idx]['operationId']
                elif not df_master_filtered.empty:
                    active_op_id = df_master_filtered.iloc[0]['operationId']

                # --- LAZY LOADING DETAILU ---
                if active_op_id:
                    if active_op_id not in st.session_state['fetched_details']:
                        creds = st.session_state['credentials']
                        token = st.session_state['access_token']
                        full_context_filters = {'operationId': active_op_id}

                        with st.spinner("Dotahuji kompletní kontext událostí pro tuto operaci..."):
                            try:
                                detail_data = api_client.fetch_logs_page(creds['api_url'], token, creds['tenant_id'], limit=1000, offset=0, filters=full_context_filters)

                                new_items = []
                                if isinstance(detail_data, dict) and 'items' in detail_data:
                                    new_items = detail_data['items']
                                elif isinstance(detail_data, list):
                                    new_items = detail_data

                                st.session_state['fetched_details'][active_op_id] = new_items
                            except Exception as e:
                                st.error(f"Nepodařilo se stáhnout detail operace: {str(e)}")

                # --- DETAILNÍ GRID A JEHO FILTR ---
                if active_op_id:
                    st.markdown("---")
                    det_header_col, det_filter_col = st.columns([2, 1])

                    with det_header_col:
                        st.subheader(f"📄 Detailní výpis událostí pro OperationID: `{active_op_id}`")
                        st.markdown("Kliknutím na řádek zobrazíte pod tabulkou **Custom Fields** nebo metadata k **SourceID**.")

                    with det_filter_col:
                        all_available_statuses = ['🔴 Error', '🟡 Warning', '🟢 Info']
                        selected_detail_statuses = st.multiselect(
                            "Filtrovat zobrazené události v detailu:",
                            options=all_available_statuses,
                            key="local_detail_status_widget",
                            on_change=detail_status_changed
                        )

                    local_detail_logs = [item for item in st.session_state['fetched_logs'] if item.get('operationId') == active_op_id]
                    downloaded_detail_logs = st.session_state['fetched_details'].get(active_op_id, [])

                    combined_detail_logs = local_detail_logs + downloaded_detail_logs
                    unique_detail_logs = {item['id']: item for item in combined_detail_logs if 'id' in item}.values()

                    df_detail_raw = ui_helpers.clean_data(list(unique_detail_logs))

                    if df_detail_raw.empty:
                        st.info("Pro vybranou operaci nebyly nalezeny žádné detailní události.")
                    else:
                        df_detail = df_detail_raw.copy()

                        if len(selected_detail_statuses) > 0:
                            df_detail = df_detail[df_detail['severity'].isin(selected_detail_statuses)]

                        df_detail = df_detail.sort_values(by='createdOn', ascending=True, kind='stable').reset_index(drop=True)

                        display_columns = ['severity', 'operationType', 'activityType', 'createdOn', 'message', 'source', 'scopeId', 'agentId', 'sourceId', 'customFields', 'details']
                        existing_cols = [c for c in display_columns if c in df_detail.columns]
                        other_cols = [c for c in df_detail.columns if c not in display_columns and c != 'Stav']

                        df_display = df_detail[existing_cols + other_cols]

                        detail_selection = st.dataframe(
                            df_display,
                            width="content",
                            hide_index=True,
                            selection_mode="single-row",
                            on_select="rerun",
                            column_config={
                                "customFields": st.column_config.TextColumn("customFields", width="large"),
                                "details": st.column_config.TextColumn("details", width="large")
                            }
                        )

                        # --- ROZŠÍŘENÁ METADATA (LOOKUPS & CUSTOM FIELDS) ---
                        active_detail_row = None
                        if detail_selection.selection.rows:
                            selected_det_idx = detail_selection.selection.rows[0]
                            if selected_det_idx < len(df_display):
                                active_detail_row = df_display.iloc[selected_det_idx]

                        if active_detail_row is not None:
                            st.markdown("#### 🔗 Akce a rozšířené detaily vybraného řádku")

                            # Detekce všech buněk v řádku obsahujících platný JSON (customFields, details, message...)
                            import json as py_json
                            json_columns = {}
                            for col in active_detail_row.index:
                                val = active_detail_row[col]
                                if pd.notna(val):
                                    val_str = str(val).strip()
                                    if (val_str.startswith('{') and val_str.endswith('}')) or (val_str.startswith('[') and val_str.endswith(']')):
                                        try:
                                            parsed = py_json.loads(val_str)
                                            if isinstance(parsed, (dict, list)) and len(parsed) > 0:
                                                json_columns[col] = val_str
                                        except Exception:
                                            pass

                            # Vytvoření dynamických sloupců pro tlačítka akcí vedle sebe
                            btn_cols = st.columns(1 + max(1, len(json_columns)))
                            
                            # 1. Tlačítko pro předvyplnění a spuštění načtení ve Vstupní frontě (v1)
                            src_id = active_detail_row.get('sourceId')
                            op_id = active_detail_row.get('operationId') or active_op_id
                            with btn_cols[0]:
                                if st.button("📥 Napsat & načíst ve Vstupní frontě (v1)", key=f"btn_jump_iq_{active_detail_row.get('id', 'row')}", help="Předvyplní SourceID a OperationID ve Vstupní frontě, přepne na v1 a ihned spustí načtení data", width="stretch"):
                                    st.session_state['input_queue_filters']['source_id'] = str(src_id) if pd.notna(src_id) and str(src_id).strip().lower() not in ['', 'none', 'null', 'nan'] else ''
                                    st.session_state['input_queue_filters']['operation_id'] = str(op_id) if pd.notna(op_id) else ''
                                    st.session_state['input_queue_filters']['sourcing_api_version'] = 'v1'
                                    st.session_state['iq_trigger_auto_load'] = True
                                    st.success("✅ Filtry pro Vstupní frontu (v1) byly nastaveny a načtení spuštěno! Přepněte na záložku '📥 Vstupní fronta (SourcingData)'.")

                            # 2. Tlačítka pro zobrazení obsahu buněk s JSONem v přehledné tabulce
                            col_idx = 1
                            for j_col, j_val in json_columns.items():
                                target_col = btn_cols[col_idx] if col_idx < len(btn_cols) else btn_cols[-1]
                                with target_col:
                                    if st.button(f"📋 Zobrazit '{j_col}' v tabulce", key=f"btn_view_json_{j_col}_{active_detail_row.get('id', 'row')}", help=f"Otevře obsah buňky '{j_col}' v přehledné tabulce / stromu", width="stretch"):
                                        ui_helpers.show_json_modal(j_val, title=f"Detail JSONu v buňce '{j_col}'")
                                col_idx += 1

                            # 2. Source ID metadata lookup
                            source_id = active_detail_row.get('sourceId')
                            if pd.notna(source_id) and str(source_id).strip().lower() not in ['', 'none', 'nan', 'null']:
                                source_id_str = str(source_id).strip()
                                creds = st.session_state['credentials']
                                token = st.session_state['access_token']

                                if source_id_str not in st.session_state['fetched_datasources']:
                                    with st.spinner(f"Dotahuji metadata pro DataSource: {source_id_str}..."):
                                        try:
                                            ds_info = api_client.fetch_datasource_info(creds['api_url'], token, creds['tenant_id'], source_id_str)
                                            st.session_state['fetched_datasources'][source_id_str] = ds_info
                                        except Exception as e:
                                            st.error(f"Nepodařilo se stáhnout metadata pro DataSource '{source_id_str}': {e}")

                                ds_data = st.session_state['fetched_datasources'].get(source_id_str)
                                if ds_data:
                                    with st.expander(f"📦 API Data Source Info: {ds_data.get('name', source_id_str)}", expanded=True):
                                        st.json(ds_data)

                        with st.expander("⏱️ Časová osa událostí operace", expanded=False):
                            for idx, row in df_detail.iterrows():
                                t_val = row['createdOn']
                                t_str = t_val.tz_convert('Europe/Prague').strftime('%H:%M:%S.%f')[:-3] if pd.notna(t_val) else "Neznámý čas"
                                st.markdown(f"**{t_str}** | {row['severity']} `[{row.get('operationType', 'Unknown')}]` — **{row.get('activityType', 'Unknown')}** (*{row.get('source', 'Neznámý zdroj')}*)")
                                st.caption(f"↳ {row.get('message', '')}")
                else:
                    st.info("Vyberte operaci v horní tabulce pro zobrazení detailu.")

                # --- VOLITELNÉ POHLEDY ---
                with st.expander("📊 Globální analytické pohledy (Sankey & Výpočty trvání)", expanded=False):
                    col_g1, col_g2 = st.columns(2)

                    with col_g1:
                        st.markdown("##### Doba zpracování Performance úseků (ScopeID)")
                        if active_op_id and 'df_detail' in locals() and not df_detail.empty:

                            mask_begin = df_detail['activityType'].astype(str).str.endswith('|Begin')
                            mask_end = df_detail['activityType'].astype(str).str.endswith('|End')

                            begins = df_detail[mask_begin].set_index('scopeId')
                            ends = df_detail[mask_end].set_index('scopeId')

                            durations = []
                            for s_id in begins.index.intersection(ends.index):
                                if pd.notna(s_id) and str(s_id) != 'None' and str(s_id) != '':
                                    b_time = begins.loc[s_id, 'createdOn']
                                    e_time = ends.loc[s_id, 'createdOn']

                                    if isinstance(b_time, pd.Series): b_time = b_time.iloc[0]
                                    if isinstance(e_time, pd.Series): e_time = e_time.iloc[0]

                                    if pd.notna(b_time) and pd.notna(e_time):
                                        durations.append({"ScopeId": s_id, "Trvání (s)": (e_time - b_time).total_seconds()})

                            if durations:
                                df_dur = pd.DataFrame(durations)
                                fig_dur = px.bar(df_dur, x='ScopeId', y='Trvání (s)', text='Trvání (s)', title="Časové úseky")
                                fig_dur.update_traces(texttemplate='%{text:.3f} s', textposition='outside')
                                st.plotly_chart(fig_dur, width="stretch")
                            else:
                                st.info("Vybraná operace neobsahuje spárované dvojice končící na |Begin a |End se shodným ScopeId.")
                        else:
                            st.info("Žádaná data pro výpočet.")

                    with col_g2:
                        st.markdown("##### Tok fází a závažností (Sankey)")
                        if not df_clean.empty and 'operationType' in df_clean.columns and 'severity' in df_clean.columns:
                            sankey_data = df_clean.groupby(['operationType', 'severity']).size().reset_index(name='count')
                            all_nodes = list(df_clean['operationType'].unique()) + list(df_clean['severity'].unique())
                            node_indices = {node: idx for idx, node in enumerate(all_nodes)}

                            sources = [node_indices[row['operationType']] for _, row in sankey_data.iterrows()]
                            targets = [node_indices[row['severity']] for _, row in sankey_data.iterrows()]
                            values = sankey_data['count'].tolist()

                            phase_durations = {}
                            for phase in df_clean['operationType'].unique():
                                phase_df = df_clean[df_clean['operationType'] == phase]
                                if not phase_df.empty:
                                    op_groups = phase_df.groupby('operationId')
                                    durations = []
                                    for _, op_df in op_groups:
                                        p_min = op_df['createdOn'].min()
                                        p_max = op_df['createdOn'].max()
                                        if pd.notna(p_min) and pd.notna(p_max):
                                            durations.append((p_max - p_min).total_seconds())
                                    if durations:
                                        avg_dur = sum(durations) / len(durations)
                                        phase_durations[phase] = f"ø {avg_dur:.3f} s"
                                    else:
                                        phase_durations[phase] = "0.000 s"
                                else:
                                    phase_durations[phase] = "N/A"

                            all_nodes_labels = []
                            for node in all_nodes:
                                node_str = str(node)
                                if node_str in phase_durations:
                                    all_nodes_labels.append(f"{node_str} ({phase_durations[node_str]})")
                                else:
                                    all_nodes_labels.append(node_str)

                            node_colors = []
                            for node in all_nodes:
                                node_str = str(node)
                                if 'Error' in node_str:
                                    node_colors.append('#ef5350')
                                elif 'Warning' in node_str:
                                    node_colors.append('#ffca28')
                                elif 'Info' in node_str:
                                    node_colors.append('#66bb6a')
                                elif node_str == 'InputData':
                                    node_colors.append('#29b6f6')
                                elif node_str == 'Transform':
                                    node_colors.append('#ab47bc')
                                elif node_str == 'ConsumeData':
                                    node_colors.append('#ffa726')
                                else:
                                    node_colors.append('#26a69a')

                            if sources and targets:
                                fig_sankey = go.Figure(data=[go.Sankey(
                                    node=dict(
                                        pad=25, 
                                        thickness=20, 
                                        line=dict(color="black", width=0.5), 
                                        label=all_nodes_labels, 
                                        color=node_colors
                                    ),
                                    link=dict(
                                        source=sources, 
                                        target=targets, 
                                        value=values, 
                                        color="rgba(100, 149, 237, 0.15)"
                                    )
                                )])
                                fig_sankey.update_layout(
                                    font=dict(family="Outfit, Inter, sans-serif", size=12, color="black"),
                                    height=350,
                                    margin=dict(l=10, r=10, t=10, b=10)
                                )
                                st.plotly_chart(fig_sankey, width="stretch")

                if 'df_system' in locals() and not df_system.empty:
                    with st.expander("⚙️ Systémové/Infrastrukturní události platformy (bez OperationID)", expanded=False):
                        st.dataframe(df_system, width="stretch", hide_index=True)
