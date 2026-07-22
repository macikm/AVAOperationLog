import streamlit as st
import pandas as pd
import json
import api_client

def render_tab():
    st.markdown("### 📤 Výstupní fronta (QueryingData)")
    st.markdown("Sledování datových záznamů publikovaných a připravených ke stažení.")
    
    # Filtry
    with st.expander("📡 Filtry výstupní fronty", expanded=True):
        oq_col1, oq_col2 = st.columns(2)
        with oq_col1:
            oq_model_id = st.text_input("Data Model ID (povinné):", value=st.session_state['output_queue_filters']['model_id'], key="oq_model_id")
        with oq_col2:
            oq_source_id = st.text_input("Source ID (volitelné):", value=st.session_state['output_queue_filters']['source_id'], key="oq_source_id")
            
        oq_col3, oq_col4 = st.columns(2)
        with oq_col3:
            oq_mandant = st.text_input("Mandant Code (volitelné):", value=st.session_state['output_queue_filters']['mandant_code'], key="oq_mandant_code")
        with oq_col4:
            st.markdown("<br>", unsafe_allow_html=True)
            oq_use_time = st.checkbox("Omezit datum modifikace", value=st.session_state['output_queue_filters']['use_time'], key="oq_use_time")
            
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
                
        if st.button("🚀 Načíst / Aktualizovat výstupní frontu", key="btn_load_output_queue"):
            if not oq_model_id.strip():
                st.error("Pro načtení výstupní fronty je nutné vyplnit 'Data Model ID'!")
            else:
                st.session_state['output_queue_filters'] = {
                    'model_id': oq_model_id,
                    'source_id': oq_source_id,
                    'mandant_code': oq_mandant,
                    'use_time': oq_use_time,
                    'date_from': oq_date_from,
                    'time_from': oq_time_from,
                    'date_to': oq_date_to,
                    'time_to': oq_time_to
                }
                st.session_state['output_queue_offset'] = 0
                st.session_state['output_queue_items'] = []
                
                with st.spinner("Načítám výstupní frontu..."):
                    try:
                        data = api_client.fetch_output_queue(
                            st.session_state['credentials']['api_url'],
                            st.session_state['access_token'],
                            st.session_state['credentials']['tenant_id'],
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
                        st.error(f"Načtení výstupní fronty selhalo: {e}")
                        
    # Automatické spuštění načtení při předvyplnění z operačního logu
    if st.session_state.get('oq_trigger_auto_load'):
        st.session_state['oq_trigger_auto_load'] = False
        st.session_state['output_queue_offset'] = 0
        st.session_state['output_queue_items'] = []
        with st.spinner("🚀 Načítám výstupní frontu na základě vybraného řádku z operačního logu..."):
            try:
                data = api_client.fetch_output_queue(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id'],
                    limit=100,
                    offset=0,
                    filters=st.session_state['output_queue_filters']
                )
                if isinstance(data, dict) and 'items' in data:
                    st.session_state['output_queue_items'] = data['items']
                elif isinstance(data, list):
                    st.session_state['output_queue_items'] = data
                st.toast("✅ Výstupní fronta byla načtena z vybraného logu!")
            except Exception as e:
                st.error(f"Načtení výstupní fronty selhalo: {e}")

    # Auto-fetch if empty and model_id exists
    if not st.session_state['output_queue_items'] and st.session_state['output_queue_filters']['model_id'] and st.session_state['access_token']:
        try:
            with st.spinner("Automatické načítání výstupní fronty..."):
                data = api_client.fetch_output_queue(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id'],
                    limit=100,
                    offset=0,
                    filters=st.session_state['output_queue_filters']
                )
                if isinstance(data, dict) and 'items' in data:
                    st.session_state['output_queue_items'] = data['items']
                elif isinstance(data, list):
                    st.session_state['output_queue_items'] = data
        except Exception as e:
            st.info(f"Pro načtení dat klikněte na tlačítko výše. (Detail chyby: {e})")

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
        
        st.markdown("#### 🗂️ Seznam záznamů ve výstupní frontě")
        
        # Paging visual chunk loader
        info_col_oq, chunk_col_oq, btn_col_oq = st.columns([6, 1, 2])
        with info_col_oq:
            st.markdown(f"ℹ️ Zobrazeno **{len(df_oq_display)}** publikovaných záznamů.")
        with chunk_col_oq:
            chunk_size_oq = st.number_input("Počet oq", min_value=10, max_value=5000, value=100, step=100, label_visibility="collapsed", key="chunk_size_oq")
        with btn_col_oq:
            if st.button(f"📥 Načíst dalších {chunk_size_oq} starších", key="btn_load_more_oq", width="stretch"):
                try:
                    new_offset = st.session_state['output_queue_offset'] + chunk_size_oq
                    data_more = api_client.fetch_output_queue(
                        st.session_state['credentials']['api_url'],
                        st.session_state['access_token'],
                        st.session_state['credentials']['tenant_id'],
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
                
        selection_oq = st.dataframe(
            df_oq_display[display_cols_oq],
            width="stretch",
            hide_index=True,
            selection_mode="single-row",
            on_select="rerun",
            key="df_oq_table"
        )
        
        selected_oq_row = None
        if selection_oq.selection.rows:
            sel_idx = selection_oq.selection.rows[0]
            if sel_idx < len(df_oq_display):
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
                        initial_data = api_client.fetch_logs_page(
                            st.session_state['credentials']['api_url'],
                            st.session_state['access_token'],
                            st.session_state['credentials']['tenant_id'],
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
