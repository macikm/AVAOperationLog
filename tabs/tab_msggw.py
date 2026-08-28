import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

DEFAULT_EXAMPLE_CONSUMER_CODE = "PURTEX_s_r-f66c1e8d-a5fc-4ddf-a9af-1060c80852f0-iNuvio_Installer-o96q5iQBTucJSlTRL9tDj3gNDiNHNLoH"

def render_tab():
    st.markdown("### 📡 Message Gateway Consumer Status (MSGGW)")
    st.caption("Sledování stavu, konektivity a statistik gRPC consumerů ze serverového endpointu `/api/v1/Consumer/gRPC/code/{code}/status`.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
    tenant_id = st.session_state.get('impersonated_tenant_id') or creds.get('tenant_id', '')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení stavu Message Gateway je vyžadováno aktivní připojení k API.")
        st.stop()

    # Načtení seznamu gRPC consumerů pro aktivního tenanta z MSGGW
    if 'cached_msggw_consumers' not in st.session_state:
        st.session_state['cached_msggw_consumers'] = []

    with st.spinner("Zjišťuji seznam gRPC consumerů pro tenanta..."):
        try:
            consumers_data = api_client.fetch_msggw_grpc_consumers(creds['api_url'], token, tenant_id)
            if isinstance(consumers_data, list):
                st.session_state['cached_msggw_consumers'] = consumers_data
        except Exception:
            pass

    known_consumers = st.session_state.get('cached_msggw_consumers', [])
    
    # 1. Striktní abecední řazení A-Z
    sorted_consumers = sorted(
        known_consumers,
        key=lambda c: str((c.get('code') or c.get('id')) if isinstance(c, dict) else c).lower()
    )

    # UI filtry a výběr consumera
    with st.expander("📡 Výběr a nastavení Consumera", expanded=True):
        c_filter, c_select, c_btn = st.columns([1.2, 1.8, 1.0])
        with c_filter:
            search_c_q = st.text_input(
                "🔍 Hledat consumera (přesná shoda):",
                value=st.session_state.get('msggw_search_q', ''),
                key="msggw_search_q",
                placeholder="Napište část kódu (např. PURTEX)...",
                help="Striktní filtr podle podřetězce v kódu (bez fuzzy logiky)."
            ).strip().lower()

        filtered_consumers = sorted_consumers
        if search_c_q:
            filtered_consumers = [
                c for c in sorted_consumers
                if search_c_q in str((c.get('code') or c.get('id')) if isinstance(c, dict) else c).lower()
            ]

        # Příprava možností v rozbalovátku (seřazeno A-Z)
        consumer_options = []
        consumer_lookup = {}
        
        for c in filtered_consumers:
            if isinstance(c, dict):
                code = c.get('code') or c.get('id')
                cid = c.get('id')
                client_id = c.get('clientId')
                if code:
                    lbl = f"{code}" + (f" | Client: {client_id}" if client_id else "")
                    consumer_options.append(lbl)
                    consumer_lookup[lbl] = code
            elif isinstance(c, str):
                lbl = str(c)
                consumer_options.append(lbl)
                consumer_lookup[lbl] = c

        consumer_options.append("✏️ Ruční zadání kódu / ID consumera...")

        with c_select:
            sel_consumer = ui_helpers.render_native_select(
                options=consumer_options,
                label="🔑 Vyberte gRPC Consumera (A-Z):",
                selected=consumer_options[0] if consumer_options else "",
                key="msggw_native_sel"
            )
        
        target_consumer_code = ""
        if sel_consumer == "✏️ Ruční zadání kódu / ID consumera...":
            with c_select:
                target_consumer_code = st.text_input(
                    "Kód nebo ID consumera:",
                    value=st.session_state.get('msggw_manual_code_input', DEFAULT_EXAMPLE_CONSUMER_CODE),
                    key="msggw_manual_code_input",
                    placeholder="Vložte kód consumera..."
                ).strip()
        elif sel_consumer in consumer_lookup:
            target_consumer_code = consumer_lookup[sel_consumer]

        with c_btn:
            st.markdown("<br>", unsafe_allow_html=True)
            btn_fetch = st.button("🚀 Načíst stav", key="btn_fetch_msggw_status", width="stretch")

    # Načtení dat ze serveru
    if target_consumer_code:
        if btn_fetch or f"msggw_status_res_{target_consumer_code}" not in st.session_state:
            with st.spinner(f"Načítám stav pro consumer '{target_consumer_code}'..."):
                try:
                    res_json, log_info = api_client.fetch_msggw_consumer_status_by_code(
                        creds['api_url'], token, tenant_id, target_consumer_code
                    )
                    st.session_state[f"msggw_status_res_{target_consumer_code}"] = (res_json, log_info, None)
                except Exception as e:
                    st.session_state[f"msggw_status_res_{target_consumer_code}"] = (None, str(e), e)

        res_tuple = st.session_state.get(f"msggw_status_res_{target_consumer_code}")
        if res_tuple:
            res_json, log_info, err = res_tuple

            if err:
                st.error(f"❌ Načtení stavu pro consumer '{target_consumer_code}' selhalo: {err}")
                if isinstance(log_info, str) and log_info:
                    with st.expander("🔍 Podrobnosti a odpověď MSGGW serveru", expanded=True):
                        st.markdown(log_info)
            elif res_json:
                st.markdown(f"#### 📊 Stav a metriky Consumera: `{target_consumer_code}`")
                
                # Zobrazení klíčových indikátorů (KPI / Metriky)
                health_val = res_json.get('status') or res_json.get('health') or res_json.get('healthStatus') or "Healthy"
                is_connected = res_json.get('connected') if 'connected' in res_json else res_json.get('isConnected', False)
                status_icon = "🟢 Připojen" if is_connected else "🔴 Odpojen"
                
                ready_msgs = res_json.get('readyMessages', res_json.get('totalMessages', '-'))
                unack_msgs = res_json.get('unacknowledgedMessages', 0)
                unproc_msgs = res_json.get('unprocessableMessages', 0)

                kpi1, kpi2, kpi3, kpi4 = st.columns(4)
                with kpi1:
                    st.metric("Stav konektivity", status_icon)
                with kpi2:
                    st.metric("Health Status", str(health_val))
                with kpi3:
                    st.metric("Nezpracované zprávy (ve frontě)", str(ready_msgs), help="Počet zpráv čekajících ve frontě k zobrazení/vyzvednutí (readyMessages / totalMessages)")
                with kpi4:
                    st.metric("Nedoručené / Nezpracovatelné", f"{unack_msgs} / {unproc_msgs}", help="unacknowledgedMessages / unprocessableMessages")

                st.markdown("---")

                # Strukturované zobrazení detailu
                tab_table, tab_diag = st.tabs(["📊 Přehledová tabulka", "🔍 Diagnostický Log"])

                with tab_table:
                    if isinstance(res_json, dict):
                        flat_items = []
                        for k, v in res_json.items():
                            val_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
                            flat_items.append({"Vlastnost / Metrika": k, "Hodnota": val_str})
                        st.dataframe(pd.DataFrame(flat_items), width="stretch", hide_index=True)
                    elif isinstance(res_json, list):
                        st.dataframe(pd.DataFrame(res_json), width="stretch", hide_index=True)

                with tab_diag:
                    if log_info:
                        st.markdown(log_info)
    else:
        st.info("Zadejte nebo vyberte kódu consumera pro zobrazení jeho stavu.")
