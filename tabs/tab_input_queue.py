import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, time
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 📥 Vstupní fronta (SourcingData)")
    st.markdown("Sledování příchozích datových balíčků odesílaných integračními agenty.")
    
    # Filtry
    with st.expander("📡 Filtry vstupní fronty", expanded=True):
        iq_col1, iq_col2, iq_col3 = st.columns(3)
        with iq_col1:
            iq_agent_id = st.text_input("Agent ID (Enqueue):", value=st.session_state['input_queue_filters']['agent_id'], key="iq_agent_id")
        with iq_col2:
            iq_client_id = st.text_input("Client ID (Enqueue):", value=st.session_state['input_queue_filters']['client_id'], key="iq_client_id")
        with iq_col3:
            iq_operation_id = st.text_input("Operation ID (Enqueue):", value=st.session_state['input_queue_filters'].get('operation_id', ''), key="iq_operation_id")

        # Version selection for SourcingData endpoint
        v_col1, v_col2 = st.columns([1, 2])
        with v_col1:
            iq_version = st.selectbox("Endpoint verze:", ["v2", "v1"], index=["v2", "v1"].index(st.session_state['input_queue_filters'].get('sourcing_api_version', 'v2')))
        with v_col2:
            if iq_version == 'v1':
                iq_source_id = st.text_input("Source ID (pro v1 je povinné):", value=st.session_state['input_queue_filters'].get('source_id', ''), key="iq_source_id")
            else:
                iq_source_id = st.text_input("Source ID (volitelné):", value=st.session_state['input_queue_filters'].get('source_id', ''), key="iq_source_id")

        iq_status = st.selectbox("Filtrovat stav (lokálně):", ["Všechny", "Success", "Failed", "Pending", "Canceled"],
                                 index=["Všechny", "Success", "Failed", "Pending", "Canceled"].index(st.session_state['input_queue_filters']['status']))
        
        st.markdown("---")
        iq_use_time = st.checkbox("🗓️ Omezit stahování a zobrazení vstupní fronty na konkrétní datum/čas", value=st.session_state['input_queue_filters'].get('use_time', False))
        iq_date_from, iq_time_from, iq_date_to, iq_time_to = None, None, None, None
        if iq_use_time:
            t_col1, t_col2, t_col3, t_col4 = st.columns(4)
            with t_col1: iq_date_from = st.date_input("Od data (vstup):", value=st.session_state['input_queue_filters'].get('date_from'), format="DD.MM.YYYY", key="iq_date_from")
            with t_col2: iq_time_from = st.time_input("Čas od (vstup):", value=st.session_state['input_queue_filters'].get('time_from'), key="iq_time_from")
            with t_col3: iq_date_to = st.date_input("Do data (vstup):", value=st.session_state['input_queue_filters'].get('date_to'), format="DD.MM.YYYY", key="iq_date_to")
            with t_col4: iq_time_to = st.time_input("Čas do (vstup):", value=st.session_state['input_queue_filters'].get('time_to'), key="iq_time_to")
            
        if st.button("🚀 Načíst / Aktualizovat vstupní frontu", key="btn_load_input_queue"):
            st.session_state['input_queue_filters'] = {
                'agent_id': iq_agent_id,
                'client_id': iq_client_id,
                'status': iq_status,
                'sourcing_api_version': iq_version,
                'source_id': iq_source_id,
                'operation_id': iq_operation_id,
                'use_time': iq_use_time,
                'date_from': iq_date_from if iq_use_time else None,
                'time_from': iq_time_from if iq_use_time else None,
                'date_to': iq_date_to if iq_use_time else None,
                'time_to': iq_time_to if iq_use_time else None
            }
            st.session_state['input_queue_offset'] = 0
            st.session_state['input_queue_items'] = []
            
            with st.spinner("Načítám vstupní frontu..."):
                try:
                    data = api_client.fetch_input_queue(
                        st.session_state['credentials']['api_url'],
                        st.session_state['access_token'],
                        st.session_state['credentials']['tenant_id'],
                        limit=100,
                        offset=0,
                        filters=st.session_state['input_queue_filters']
                    )
                    if isinstance(data, dict) and 'items' in data:
                        st.session_state['input_queue_items'] = data['items']
                    elif isinstance(data, list):
                        st.session_state['input_queue_items'] = data
                    st.rerun()
                except Exception as e:
                    st.error(f"Načtení vstupní fronty selhalo: {e}")
                    
    # Automatické spuštění načtení při předvyplnění z operačního logu
    if st.session_state.get('iq_trigger_auto_load'):
        st.session_state['iq_trigger_auto_load'] = False
        st.session_state['input_queue_offset'] = 0
        st.session_state['input_queue_items'] = []
        with st.spinner("🚀 Načítám vstupní frontu na základě vybraného řádku z operačního logu..."):
            try:
                data = api_client.fetch_input_queue(
                    st.session_state['credentials']['api_url'],
                    st.session_state['access_token'],
                    st.session_state['credentials']['tenant_id'],
                    limit=100,
                    offset=0,
                    filters=st.session_state['input_queue_filters']
                )
                if isinstance(data, dict) and 'items' in data:
                    st.session_state['input_queue_items'] = data['items']
                elif isinstance(data, list):
                    st.session_state['input_queue_items'] = data
                st.toast("✅ Vstupní fronta byla načtena z vybraného logu!")
            except Exception as e:
                st.error(f"Načtení vstupní fronty selhalo: {e}")

    # Auto-fetch if empty
    if not st.session_state['input_queue_items'] and st.session_state['access_token']:
        try:
            iq_filters = st.session_state['input_queue_filters']
            if iq_filters.get('sourcing_api_version') == 'v1' and not iq_filters.get('source_id'):
                st.info("Automatické načítání je vypnuto pro v1 endpoint bez vyplněného Source ID.")
            else:
                with st.spinner("Automatické načítání vstupní fronty..."):
                    data = api_client.fetch_input_queue(
                        st.session_state['credentials']['api_url'],
                        st.session_state['access_token'],
                        st.session_state['credentials']['tenant_id'],
                        limit=100,
                        offset=0,
                        filters=st.session_state['input_queue_filters']
                    )
                    if isinstance(data, dict) and 'items' in data:
                        st.session_state['input_queue_items'] = data['items']
                    elif isinstance(data, list):
                        st.session_state['input_queue_items'] = data
        except Exception as e:
            st.info(f"Pro načtení dat klikněte na tlačítko výše. (Detail chyby: {e})")

    # Vykreslení tabulky
    if st.session_state['input_queue_items']:
        df_iq = pd.DataFrame(st.session_state['input_queue_items'])
        
        required_cols = ['queueItemId', 'operationId', 'createdOn', 'completedOn', 'finishedOn', 'status', 'wasSuccess', 'wasFailure', 'errorMessage']
        for col in required_cols:
            if col not in df_iq.columns:
                df_iq[col] = None
                
        df_iq['Stav'] = df_iq['status'].apply(ui_helpers.determine_queue_badge)
        
        # Lokální filtrování stavu
        status_filter = st.session_state['input_queue_filters']['status']
        if status_filter != "Všechny":
            df_iq = df_iq[df_iq['status'] == status_filter]
            
        # Lokální filtrování podle operationId
        op_id_filter = st.session_state['input_queue_filters'].get('operation_id', '').strip()
        raw_count_before_op_id = len(df_iq)
        show_op_id_warning = False
        if op_id_filter:
            df_iq = df_iq[df_iq['operationId'].astype(str).str.contains(op_id_filter, case=False, na=False)]
            if len(df_iq) == 0 and raw_count_before_op_id > 0:
                show_op_id_warning = True
            
        # Převod dat a výpočet trvání
        df_iq['createdOn'] = pd.to_datetime(df_iq['createdOn'], utc=True, errors='coerce')
        df_iq['completedOn'] = pd.to_datetime(df_iq['completedOn'], utc=True, errors='coerce')
        df_iq['finishedOn'] = pd.to_datetime(df_iq['finishedOn'], utc=True, errors='coerce')
        
        # Lokální časové filtrování (pojistka)
        if st.session_state['input_queue_filters'].get('use_time'):
            tz_local = 'Europe/Prague'
            f_from = st.session_state['input_queue_filters'].get('date_from')
            if f_from:
                t_f = st.session_state['input_queue_filters'].get('time_from') if st.session_state['input_queue_filters'].get('time_from') is not None else time(0, 0, 0)
                dt_from_loc = pd.Timestamp(datetime.combine(f_from, t_f)).tz_localize(tz_local)
                df_iq = df_iq[df_iq['createdOn'] >= dt_from_loc.tz_convert('UTC')]
                
            f_to = st.session_state['input_queue_filters'].get('date_to')
            if f_to:
                t_t = st.session_state['input_queue_filters'].get('time_to') if st.session_state['input_queue_filters'].get('time_to') is not None else time(23, 59, 59)
                dt_to_loc = pd.Timestamp(datetime.combine(f_to, t_t)).tz_localize(tz_local)
                df_iq = df_iq[df_iq['createdOn'] <= dt_to_loc.tz_convert('UTC')]
        
        # Doba zpracování: finishedOn - createdOn
        df_iq['Doba zpracování (s)'] = (df_iq['finishedOn'] - df_iq['createdOn']).dt.total_seconds().round(2)
        
        # Vytvoření zobrazení
        df_iq_display = df_iq.copy()
        
        # Zformátování sloupců pro tabulku
        tz_local = 'Europe/Prague'
        for col in ['createdOn', 'completedOn', 'finishedOn']:
            df_iq_display[col] = df_iq_display[col].dt.tz_convert(tz_local).dt.strftime('%d.%m.%Y %H:%M:%S')
            df_iq_display[col] = df_iq_display[col].fillna('N/A')
            
        df_iq_display = df_iq_display.sort_values(by='createdOn', ascending=False).reset_index(drop=True)
        
        st.markdown("#### 🗂️ Seznam položek ve vstupní frontě")
        if show_op_id_warning:
            st.warning("⚠️ V aktuálně načtené historii nebyl nalezen žádný záznam s tímto Operation ID. "
                       "Pokud starší verze API serveru pro zvolenou verzi endpointu nepodporuje vyhledávání podle Operation ID a ignoruje ho, "
                       "zkuste načíst další starší záznamy pomocí tlačítka níže.")
        
        # Paging visual chunk loader
        info_col_iq, chunk_col_iq, btn_col_iq = st.columns([6, 1, 2])
        with info_col_iq:
            st.markdown(f"ℹ️ Zobrazeno **{len(df_iq_display)}** položek ve frontě.")
        with chunk_col_iq:
            chunk_size_iq = st.number_input("Počet iq", min_value=10, max_value=5000, value=100, step=100, label_visibility="collapsed", key="chunk_size_iq")
        with btn_col_iq:
            if st.button(f"📥 Načíst dalších {chunk_size_iq} starších", key="btn_load_more_iq", width="stretch"):
                try:
                    new_offset = st.session_state['input_queue_offset'] + chunk_size_iq
                    data_more = api_client.fetch_input_queue(
                        st.session_state['credentials']['api_url'],
                        st.session_state['access_token'],
                        st.session_state['credentials']['tenant_id'],
                        limit=chunk_size_iq,
                        offset=new_offset,
                        filters=st.session_state['input_queue_filters']
                    )
                    new_items = data_more.get('items', []) if isinstance(data_more, dict) else data_more
                    if new_items:
                        combined = st.session_state['input_queue_items'] + new_items
                        unique = {item['queueItemId']: item for item in combined if 'queueItemId' in item}.values()
                        st.session_state['input_queue_items'] = list(unique)
                        st.session_state['input_queue_offset'] = new_offset
                        st.rerun()
                    else:
                        st.info("Žádné další záznamy ve vstupní frontě.")
                except Exception as e:
                    st.error(f"Nepodařilo se načíst další data: {e}")
                    
        selection_iq = st.dataframe(
            df_iq_display[['Stav', 'queueItemId', 'operationId', 'createdOn', 'finishedOn', 'Doba zpracování (s)', 'errorMessage']],
            width="stretch",
            hide_index=True,
            selection_mode="single-row",
            on_select="rerun",
            key="df_iq_table"
        )
        
        selected_iq_row = None
        if selection_iq.selection.rows:
            sel_idx = selection_iq.selection.rows[0]
            if sel_idx < len(df_iq_display):
                selected_iq_row = df_iq_display.iloc[sel_idx]
                
        # --- Vizualizace ---
        try:
            if not df_iq.empty:
                df_times = df_iq[pd.notna(df_iq['createdOn']) & pd.notna(df_iq['Doba zpracování (s)'])].copy()
                if not df_times.empty:
                    df_times = df_times.sort_values(by='createdOn', ascending=True).reset_index(drop=True)

                    df_times['created_local'] = df_times['createdOn'].dt.tz_convert('Europe/Prague')
                    fig_line = px.line(
                        df_times,
                        x='created_local',
                        y='Doba zpracování (s)',
                        markers=True,
                        title='Doba zpracování podle času'
                    )
                    fig_line.update_layout(height=300, xaxis_title='Čas (Europe/Prague)', yaxis_title='Doba zpracování (s)', margin=dict(l=20, r=20, t=30, b=20))
                    st.plotly_chart(fig_line, use_container_width=True)

                    st.markdown("##### 📊 Histogram dob zpracování")
                    
                    h_col1, h_col2, h_col3 = st.columns([2, 2, 1])
                    with h_col1:
                        hist_type = st.radio(
                            "Intervaly histogramu:",
                            ["Dynamické (přizpůsobené datům)", "Pevné (původní)"],
                            horizontal=True,
                            key="iq_hist_type"
                        )
                    
                    if hist_type == "Dynamické (přizpůsobené datům)":
                        with h_col2:
                            max_percentile = st.slider(
                                "Odfiltrovat extrémní hodnoty (percentil):",
                                min_value=50, max_value=100, value=95, step=1,
                                help="Omezí zobrazený rozsah na zadané procento nejrychlejších zpracování."
                            )
                        with h_col3:
                            num_bins = st.number_input(
                                "Počet sloupců:",
                                min_value=5, max_value=50, value=15, step=5,
                                key="iq_num_bins"
                            )
                            
                        df_times_filtered = df_times.copy()
                        if max_percentile < 100:
                            cutoff = df_times['Doba zpracování (s)'].quantile(max_percentile / 100.0)
                            df_times_filtered = df_times[df_times['Doba zpracování (s)'] <= cutoff].copy()
                            
                        if not df_times_filtered.empty:
                            if df_times_filtered['Doba zpracování (s)'].nunique() <= 1:
                                single_val = df_times_filtered['Doba zpracování (s)'].iloc[0]
                                labels_vals = [f"{single_val:.2f} s"]
                                counts_vals = [len(df_times_filtered)]
                            else:
                                df_times_filtered['dur_bucket'] = pd.cut(df_times_filtered['Doba zpracování (s)'], bins=num_bins)
                                counts = df_times_filtered['dur_bucket'].value_counts().sort_index()
                                rng = df_times_filtered['Doba zpracování (s)'].max() - df_times_filtered['Doba processing (s)'].min() if 'Doba processing (s)' in df_times_filtered else 0.1
                                rng = df_times_filtered['Doba zpracování (s)'].max() - df_times_filtered['Doba zpracování (s)'].min()
                                decimals = 2 if rng >= 0.1 else 4
                                labels_vals = []
                                for interval in counts.index:
                                    left = max(0.0, round(interval.left, decimals))
                                    right = round(interval.right, decimals)
                                    labels_vals.append(f"{left}–{right} s")
                                counts_vals = counts.values
                                
                            title_suffix = f" (do {cutoff:.2f} s, zobrazeno {len(df_times_filtered)}/{len(df_times)} položek)" if max_percentile < 100 else f" (zobrazeno {len(df_times_filtered)} položek)"
                            fig_hist = px.bar(
                                x=labels_vals, 
                                y=counts_vals, 
                                title=f'Histogram dob zpracování{title_suffix}', 
                                text=counts_vals
                            )
                        else:
                            fig_hist = None
                            st.info("Žádná data pro vybraný percentil.")
                    else:
                        bins = [0, 5, 15, 60, 300, 900, 3600, float('inf')]
                        labels = ['0–5 s', '5–15 s', '15–60 s', '1–5 min', '5–15 min', '15–60 min', '>60 min']
                        df_times['dur_bucket'] = pd.cut(df_times['Doba zpracování (s)'], bins=bins, labels=labels, right=False)
                        counts = df_times['dur_bucket'].value_counts().reindex(labels, fill_value=0)
                        labels_vals = labels
                        counts_vals = counts.values
                        
                        fig_hist = px.bar(
                            x=labels_vals, 
                            y=counts_vals, 
                            title='Histogram dob zpracování (pevné intervaly)', 
                            text=counts_vals
                        )
                        
                    if fig_hist is not None:
                        fig_hist.update_layout(
                            height=300, 
                            xaxis_title='Interval', 
                            yaxis_title='Počet', 
                            margin=dict(l=20, r=20, t=30, b=20)
                        )
                        fig_hist.update_traces(
                            texttemplate='%{text}', 
                            textposition='outside',
                            marker_color='#29b6f6'
                        )
                        st.plotly_chart(fig_hist, use_container_width=True)
                else:
                    st.info("Nebyly nalezeny platné záznamy s výpočtem doby zpracování pro vykreslení grafu.")
        except Exception as e:
            st.error(f"Chyba při vykreslování grafů doby zpracování: {e}")

        if selected_iq_row is not None:
            st.markdown("#### 🔍 Detail vybrané položky")
            
            err_msg = selected_iq_row.get('errorMessage')
            if pd.notna(err_msg) and str(err_msg).strip():
                st.error(f"**Chybová zpráva:** {err_msg}")
                
            st.json(selected_iq_row.to_dict())
            
            op_id_iq = selected_iq_row.get('operationId')
            if pd.notna(op_id_iq) and str(op_id_iq).strip() not in ['', 'None']:
                if st.button("🔍 Zobrazit tuto operaci v Provozním logu", key="btn_link_iq_to_log"):
                    st.session_state['api_filters']['operationId'] = str(op_id_iq)
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
        st.info("Vstupní fronta je prázdná nebo nebyla načtena.")
