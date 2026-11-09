import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 📤 Výstupní fronta (QueryingData)")
    st.markdown("Sledování datových záznamů publikovaných a připravených ke stažení.")
    
    # Filtry
    with st.expander("📡 Filtry výstupní fronty", expanded=True):
        col_v, col_m, col_c = st.columns([1, 2, 2])
        with col_v:
            curr_ver = st.session_state['output_queue_filters'].get('querying_api_version', 'v2')
            ver_index = ["v2", "v1"].index(curr_ver) if curr_ver in ["v2", "v1"] else 0
            oq_version = st.selectbox(
                "API Verze:",
                ["v2", "v1"],
                index=ver_index,
                key="oq_version",
                help="v2 = standardní moderní endpoint GetData (podporuje integration profiles i service accounts), v1 = legacy endpoint FindDataByModelId (určen pro legacy agenty s useIntegrationProfile: false)"
            )
        with col_m:
            oq_model_id = st.text_input(
                "Data Model ID (povinné):",
                value=st.session_state['output_queue_filters'].get('model_id', ''),
                key="oq_model_id",
                help="Identifikátor datového modelu (např. 8fa54450-534a-4698-b790-ea89eb75240b)"
            )
        with col_c:
            oq_client_id = st.text_input(
                "Client ID / Kód agenta (pro v2):",
                value=st.session_state['output_queue_filters'].get('client_id', ''),
                key="oq_client_id",
                help="Client ID / kód integračního agenta nebo consumera (např. ASOLEU-EKON-nV0yjAxH9gKFhyFk76BG84FIyqB32672). Vyžadováno backendem pro v2 GetData."
            )

        col_cs, col_ps, col_res = st.columns(3)
        with col_cs:
            curr_cs = (
                st.session_state['output_queue_filters'].get('consumer_source_id')
                or st.session_state['output_queue_filters'].get('source_id')
                or ''
            )
            oq_consumer_source_id = st.text_input(
                "Consumer ID (selfSourceId pro v1):",
                value=curr_cs,
                key="oq_consumer_source_id",
                help="ID datového zdroje consumera (např. cabe1d83-7bc7-4ac4-b652-50cd78a94201). Pro v1 FindDataByModelId je povinné (selfSourceId)."
            )
        with col_ps:
            oq_publisher_source_id = st.text_input(
                "Publisher Source ID (volitelné):",
                value=st.session_state['output_queue_filters'].get('publisher_source_id', ''),
                key="oq_publisher_source_id",
                help="ID datového zdroje publishera (např. aaef66df-377f-45fe-96e9-74372a17450b). Filtruje data publikovaná konkrétním agentem."
            )
        with col_res:
            oq_result_id = st.text_input(
                "Result ID / QueueItem ID (volitelné):",
                value=st.session_state['output_queue_filters'].get('result_id', ''),
                key="oq_result_id",
                help="Hledat přímo konkrétní publikovaný datový balíček (např. zpráva 'was enqueued to <GUID>')"
            )
            
        oq_col3, oq_col_op, oq_col_inc, oq_col4 = st.columns([2, 2, 2, 2], vertical_alignment="bottom")
        with oq_col3:
            oq_mandant = st.text_input("Mandant Code (volitelné):", value=st.session_state['output_queue_filters'].get('mandant_code', ''), key="oq_mandant_code")
        with oq_col_op:
            oq_operation_id = st.text_input("Operation ID (volitelné):", value=st.session_state['output_queue_filters'].get('operation_id', ''), key="oq_operation_id", help="Vyhledat záznamy vázané na konkrétní OperationID")
        with oq_col_inc:
            oq_include_deleted = st.checkbox("Včetně zpracovaných (IncludeDeleted)", value=st.session_state['output_queue_filters'].get('include_deleted', True), key="oq_include_deleted", help="Zahrnout i záznamy, které již Helios či jiný consumer stáhl a potvrdil (IncludeDeleted)")
        with oq_col4:
            oq_use_time = st.checkbox("Omezit datum modifikace", value=st.session_state['output_queue_filters'].get('use_time', False), key="oq_use_time")
            
        oq_date_from, oq_time_from, oq_date_to, oq_time_to = None, None, None, None
        if oq_use_time:
            oq_t_col1, oq_t_col2, oq_t_col3, oq_t_col4 = st.columns(4)
            with oq_t_col1:
                oq_date_from = st.date_input("Od data (modifikováno):", value=st.session_state['output_queue_filters'].get('date_from'), format="DD.MM.YYYY", key="oq_date_from")
            with oq_t_col2:
                oq_time_from = st.time_input("Čas od (modifikováno):", value=st.session_state['output_queue_filters'].get('time_from'), key="oq_time_from")
            with oq_t_col3:
                oq_date_to = st.date_input("Do data (modifikováno):", value=st.session_state['output_queue_filters'].get('date_to'), format="DD.MM.YYYY", key="oq_date_to")
            with oq_t_col4:
                oq_time_to = st.time_input("Čas do (modifikováno):", value=st.session_state['output_queue_filters'].get('time_to'), key="oq_time_to")
                
        if st.button("🚀 Načíst / Aktualizovat výstupní frontu", type="primary", key="btn_load_output_queue"):
            if not oq_model_id.strip() and not oq_result_id.strip():
                st.error("Pro načtení výstupní fronty je nutné vyplnit 'Data Model ID' (nebo 'Result ID')!")
            elif oq_version == 'v2' and not oq_client_id.strip() and not oq_result_id.strip():
                st.error("Pro v2 výstupní frontu (GetData) je nutné vyplnit 'Client ID / Kód agenta'!")
            elif oq_version == 'v1' and not oq_consumer_source_id.strip() and not oq_result_id.strip():
                st.error("Pro v1 výstupní frontu (FindDataByModelId) je nutné vyplnit 'Consumer ID (selfSourceId)'!")
            else:
                st.session_state['output_queue_filters'] = {
                    'querying_api_version': oq_version,
                    'model_id': oq_model_id.strip(),
                    'client_id': oq_client_id.strip(),
                    'consumer_source_id': oq_consumer_source_id.strip(),
                    'publisher_source_id': oq_publisher_source_id.strip(),
                    'source_id': oq_consumer_source_id.strip(),
                    'result_id': oq_result_id.strip(),
                    'operation_id': oq_operation_id.strip(),
                    'include_deleted': oq_include_deleted,
                    'mandant_code': oq_mandant.strip(),
                    'use_time': oq_use_time,
                    'date_from': oq_date_from,
                    'time_from': oq_time_from,
                    'date_to': oq_date_to,
                    'time_to': oq_time_to
                }
                st.session_state['output_queue_offset'] = 0
                st.session_state['output_queue_items'] = []
                
                token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
                tenant_id = st.session_state.get('impersonated_tenant_id') or st.session_state['credentials']['tenant_id']
                with st.spinner(f"Načítám výstupní frontu ({oq_version})..."):
                    try:
                        data = api_client.fetch_output_queue(
                            st.session_state['credentials']['api_url'],
                            token,
                            tenant_id,
                            limit=100,
                            offset=0,
                            filters=st.session_state['output_queue_filters']
                        )
                        if isinstance(data, dict) and 'items' in data:
                            st.session_state['output_queue_items'] = data['items']
                        elif isinstance(data, list):
                            st.session_state['output_queue_items'] = data
                        st.rerun()
                    except Exception as e:
                        # Fallback bez publisher_source_id, pokud dotaz selhal
                        if st.session_state['output_queue_filters'].get('publisher_source_id'):
                            try:
                                fallback_filters = dict(st.session_state['output_queue_filters'])
                                fallback_filters['publisher_source_id'] = ''
                                data = api_client.fetch_output_queue(
                                    st.session_state['credentials']['api_url'],
                                    token,
                                    tenant_id,
                                    limit=100,
                                    offset=0,
                                    filters=fallback_filters
                                )
                                if isinstance(data, dict) and 'items' in data:
                                    st.session_state['output_queue_items'] = data['items']
                                elif isinstance(data, list):
                                    st.session_state['output_queue_items'] = data
                                st.session_state['output_queue_filters']['publisher_source_id'] = ''
                                st.session_state['oq_publisher_source_id'] = ''
                                st.warning(f"Dotaz se zadaným Publisher SourceID selhal ({e}). Automaticky načteno bez filtru Publisher.")
                                st.rerun()
                            except Exception:
                                st.error(f"Načtení výstupní fronty selhalo: {e}")
                        else:
                            st.error(f"Načtení výstupní fronty selhalo: {e}")
                        
    # Automatické spuštění načtení při předvyplnění z operačního logu
    if st.session_state.get('oq_trigger_auto_load'):
        st.session_state['oq_trigger_auto_load'] = False
        st.session_state['output_queue_offset'] = 0
        st.session_state['output_queue_items'] = []
        token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
        tenant_id = st.session_state.get('impersonated_tenant_id') or st.session_state['credentials']['tenant_id']
        cur_v = st.session_state['output_queue_filters'].get('querying_api_version', 'v2')
        with st.spinner(f"🚀 Načítám výstupní frontu ({cur_v}) na základě vybraného řádku z operačního logu..."):
            try:
                data = api_client.fetch_output_queue(
                    st.session_state['credentials']['api_url'],
                    token,
                    tenant_id,
                    limit=100,
                    offset=0,
                    filters=st.session_state['output_queue_filters']
                )
                if isinstance(data, dict) and 'items' in data:
                    st.session_state['output_queue_items'] = data['items']
                elif isinstance(data, list):
                    st.session_state['output_queue_items'] = data
                st.toast(f"✅ Výstupní fronta ({cur_v}) byla načtena!")
            except Exception as e:
                # Pokud selhal dotaz se zadaným publisher_source_id, zkusíme bez něj
                if st.session_state['output_queue_filters'].get('publisher_source_id'):
                    try:
                        fallback_filters = dict(st.session_state['output_queue_filters'])
                        fallback_filters['publisher_source_id'] = ''
                        data = api_client.fetch_output_queue(
                            st.session_state['credentials']['api_url'],
                            token,
                            tenant_id,
                            limit=100,
                            offset=0,
                            filters=fallback_filters
                        )
                        if isinstance(data, dict) and 'items' in data:
                            st.session_state['output_queue_items'] = data['items']
                        elif isinstance(data, list):
                            st.session_state['output_queue_items'] = data
                        st.session_state['output_queue_filters']['publisher_source_id'] = ''
                        st.session_state['oq_publisher_source_id'] = ''
                        st.warning(f"Dotaz s Publisher SourceID selhal ({e}). Automaticky načteno bez filtru Publisher.")
                    except Exception:
                        st.error(f"Načtení výstupní fronty selhalo: {e}")
                else:
                    st.error(f"Načtení výstupní fronty selhalo: {e}")

    # Vykreslení tabulky
    if st.session_state['output_queue_items']:
        df_oq = pd.DataFrame(st.session_state['output_queue_items'])
        
        if 'Id' in df_oq.columns:
            def extract_record_id(x):
                if isinstance(x, dict):
                    return x.get('RecordId', '')
                elif isinstance(x, str):
                    try:
                        val = json.loads(x)
                        return val.get('RecordId', '')
                    except:
                        pass
                return str(x)
            df_oq['RecordId'] = df_oq['Id'].apply(extract_record_id)
        else:
            df_oq['RecordId'] = None
            
        for col in ['ExternalId', 'SourceId', 'MandantCode', 'UtcModifiedOn', 'deleted']:
            if col not in df_oq.columns:
                df_oq[col] = None
                
        df_oq['Stav'] = df_oq['deleted'].apply(lambda x: '🔴 Deleted' if x is True or str(x).lower() == 'true' else '🟢 Active')
        
        df_oq['UtcModifiedOn'] = pd.to_datetime(df_oq['UtcModifiedOn'], utc=True, errors='coerce')
        df_oq_display = df_oq.copy()
        
        tz_local = 'Europe/Prague'
        df_oq_display['UtcModifiedOn'] = df_oq_display['UtcModifiedOn'].dt.tz_convert(tz_local).dt.strftime('%d.%m.%Y %H:%M:%S')
        df_oq_display['UtcModifiedOn'] = df_oq_display['UtcModifiedOn'].fillna('N/A')
        
        ui_helpers.render_html(f"""
        <div style="display: flex; align-items: center; gap: 8px; margin: 12px 0 8px 0;">
            <span style="font-family: Inter, sans-serif; font-size: 1.1rem; font-weight: 700; color: #0f172a;">🗂️ Seznam záznamů ve výstupní frontě</span>
            {ui_helpers.render_badge(str(len(df_oq_display)), 'count')}
        </div>
        """)
        
        # Paging visual chunk loader
        info_col_oq, chunk_col_oq, btn_col_oq = st.columns([5.8, 1.0, 2.2], vertical_alignment="center")
        with info_col_oq:
            ui_helpers.render_html(f'<div style="display: flex; align-items: center; gap: 6px; height: 38px; font-family: Inter, sans-serif; font-size: 0.83rem;"><span style="font-weight: 600; color: #0f172a;">Zobrazeno:</span> {ui_helpers.render_badge(f"{len(df_oq_display)} záznamů", "teal")}</div>')
        with chunk_col_oq:
            chunk_size_oq = st.number_input("Počet oq", min_value=10, max_value=5000, value=100, step=100, label_visibility="collapsed", key="chunk_size_oq")
        with btn_col_oq:
            if st.button(f"📥 Načíst dalších {chunk_size_oq} starších", key="btn_load_more_oq", width="stretch"):
                try:
                    new_offset = st.session_state['output_queue_offset'] + chunk_size_oq
                    token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
                    tenant_id = st.session_state.get('impersonated_tenant_id') or st.session_state['credentials']['tenant_id']
                    data_more = api_client.fetch_output_queue(
                        st.session_state['credentials']['api_url'],
                        token,
                        tenant_id,
                        limit=chunk_size_oq,
                        offset=new_offset,
                        filters=st.session_state['output_queue_filters']
                    )
                    new_items = data_more.get('items', []) if isinstance(data_more, dict) else data_more
                    if new_items:
                        combined = st.session_state['output_queue_items'] + new_items
                        def get_item_key(item):
                            if 'ExternalId' in item and item['ExternalId']:
                                return item['ExternalId']
                            if 'Id' in item and isinstance(item['Id'], dict):
                                return item['Id'].get('RecordId', '')
                            return str(item)
                        
                        unique = {}
                        for item in combined:
                            k = get_item_key(item)
                            unique[k] = item
                            
                        st.session_state['output_queue_items'] = list(unique.values())
                        st.session_state['output_queue_offset'] = new_offset
                        st.rerun()
                    else:
                        st.info("Žádné další publikované záznamy.")
                except Exception as e:
                    st.error(f"Nepodařilo se načíst další data: {e}")
                    
        pref_cols = ['Stav', 'UtcModifiedOn', 'RecordId', 'ExternalId', 'MandantCode', 'SourceId']
        display_cols_oq = [c for c in pref_cols if c in df_oq_display.columns]
        
        for ext_c in ['Code', 'Name']:
            if ext_c in df_oq_display.columns:
                display_cols_oq.append(ext_c)
                
        oq_grid_height = min(550, max(260, len(df_oq_display) * 36 + 45))
        selection_oq = st.dataframe(
            df_oq_display[display_cols_oq],
            width="stretch",
            height=oq_grid_height,
            hide_index=True,
            selection_mode="single-cell",
            on_select="rerun",
            key="df_oq_table"
        )
        
        selected_oq_row = None
        sel_idx = None
        if selection_oq.selection.cells:
            sel_idx = selection_oq.selection.cells[0][0]
        elif selection_oq.selection.rows:
            sel_idx = selection_oq.selection.rows[0]

        if sel_idx is not None and sel_idx < len(df_oq_display):
            selected_oq_row = df_oq_display.iloc[sel_idx]
                
        if selected_oq_row is not None:
            st.markdown("#### 🔍 Detail vybraného záznamu")
            st.json(selected_oq_row.to_dict())
            
            op_id_oq = selected_oq_row.get('operationId')
            if op_id_oq is None:
                for val in selected_oq_row:
                    if isinstance(val, dict) and 'operationId' in val:
                        op_id_oq = val['operationId']
                        break
                        
            if pd.notna(op_id_oq) and str(op_id_oq).strip() not in ['', 'None']:
                if st.button("🔍 Zobrazit tuto operaci v Provozním logu", key="btn_link_oq_to_log"):
                    st.session_state['api_filters']['operationId'] = str(op_id_oq)
                    st.session_state['api_filters']['severity_level'] = "Všechny"
                    st.session_state['fetched_logs'] = []
                    st.session_state['fetched_details'] = {}
                    st.session_state['current_offset'] = 0
                    
                    try:
                        token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
                        tenant_id = st.session_state.get('impersonated_tenant_id') or st.session_state['credentials']['tenant_id']
                        initial_data = api_client.fetch_logs_page(
                            st.session_state['credentials']['api_url'],
                            token,
                            tenant_id,
                            limit=100,
                            offset=0,
                            filters=st.session_state['api_filters']
                        )
                        if isinstance(initial_data, dict) and 'items' in initial_data:
                            st.session_state['fetched_logs'] = initial_data['items']
                        elif isinstance(initial_data, list):
                            st.session_state['fetched_logs'] = initial_data
                    except Exception:
                        pass
                        
                    st.toast("Operace byla předfiltrována. Přepněte se na záložku 'Provozní logy'.", icon="📊")
                    st.rerun()
    else:
        st.info("Výstupní fronta je prázdná nebo nebyla načtena.")
        cur_ver = st.session_state['output_queue_filters'].get('querying_api_version', 'v2')
        if cur_ver == 'v2':
            st.markdown("""
            > 💡 **Tip:** Pokud má consumer nastaveno `useIntegrationProfile: false` (Legacy mód), nemá přiřazen žádný integrační profil a moderní v2 endpoint `GetData` může vracet 0 záznamů. Zkuste přepnout na **verzi v1 (FindDataByModelId)**, která načítá data přímo pro daného consumera (`selfSourceId`).
            """)
            c_btn1, c_btn2 = st.columns([1, 1])
            with c_btn1:
                if st.button("🔄 Přepnout na V1 (FindDataByModelId) a načíst", key="btn_switch_v1_and_load"):
                    st.session_state['output_queue_filters']['querying_api_version'] = 'v1'
                    st.session_state['oq_version'] = 'v1'
                    st.session_state['output_queue_offset'] = 0
                    st.session_state['oq_trigger_auto_load'] = True
                    st.rerun()
            with c_btn2:
                if st.session_state['output_queue_filters'].get('publisher_source_id') or st.session_state['output_queue_filters'].get('operation_id'):
                    if st.button("🔄 Vyzkoušet načíst bez omezení na Publisher / Operation ID", key="btn_clear_pub_and_load"):
                        st.session_state['output_queue_filters']['publisher_source_id'] = ''
                        st.session_state['output_queue_filters']['operation_id'] = ''
                        st.session_state['oq_publisher_source_id'] = ''
                        st.session_state['oq_operation_id'] = ''
                        st.session_state['output_queue_offset'] = 0
                        st.session_state['oq_trigger_auto_load'] = True
                        st.rerun()
        else:
            if st.session_state['output_queue_filters'].get('publisher_source_id'):
                if st.button("🔄 Načíst V1 bez omezení Publisher Source ID", key="btn_clear_v1_pub"):
                    st.session_state['output_queue_filters']['publisher_source_id'] = ''
                    st.session_state['oq_publisher_source_id'] = ''
                    st.session_state['output_queue_offset'] = 0
                    st.session_state['oq_trigger_auto_load'] = True
                    st.rerun()
