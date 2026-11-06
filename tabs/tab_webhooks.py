import streamlit as st
import pandas as pd
import json
import api_client
import ui_helpers

def render_tab():
    st.markdown("### 🔗 Webhooky & Event Routing (MSGGW)")
    st.caption("Monitoring webhookových consumerů, stavu doručování, front a mapování odebíraných typů zpráv (modelů) v Message Gateway.")

    creds = st.session_state.get('credentials', {})
    token = st.session_state.get('impersonated_access_token') or st.session_state.get('access_token')
    tenant_id = st.session_state.get('impersonated_tenant_id') or creds.get('tenant_id', '')

    if not token or not creds.get('api_url'):
        st.info("Pro zobrazení stavu Webhooků je vyžadováno aktivní připojení k API.")
        return

    # Nástrojová lišta a tlačítko obnovení
    tb_col1, tb_col2 = st.columns([6, 2], vertical_alignment="center")
    with tb_col1:
        ui_helpers.render_html(f"""
        <div style="display: flex; align-items: center; gap: 8px; height: 38px; font-family: Inter, sans-serif; font-size: 0.85rem;">
            <span style="font-weight: 600; color: #0f172a;">Aktivní tenant:</span>
            {ui_helpers.render_badge(tenant_id[:16] + '...', 'teal')}
        </div>
        """)
    with tb_col2:
        btn_refresh = st.button("🔄 Obnovit data z MSGGW", key="btn_refresh_webhooks", width="stretch")

    if btn_refresh:
        st.session_state.pop('cached_msggw_webhooks', None)
        st.session_state.pop('cached_msggw_webhook_statuses', None)
        st.session_state.pop('cached_msggw_message_types', None)
        st.session_state.pop('cached_msggw_routings', None)
        st.rerun()

    # Načtení seznamu webhooků z MSGGW
    if 'cached_msggw_webhooks' not in st.session_state:
        with st.spinner("Zjišťuji seznam registrovaných webhooků z Message Gateway..."):
            try:
                webhooks_data = api_client.fetch_msggw_webhook_consumers(creds['api_url'], token, tenant_id)
                st.session_state['cached_msggw_webhooks'] = webhooks_data if isinstance(webhooks_data, list) else []
            except Exception as e:
                st.error(f"Nepodařilo se načíst webhook consumery: {e}")
                st.session_state['cached_msggw_webhooks'] = []

    webhooks = st.session_state.get('cached_msggw_webhooks', [])

    if not webhooks:
        st.warning(f"V Message Gateway nebyl pro tenant '{tenant_id}' nalezen žádný registrovaný webhook consumer.")
        st.markdown("""
        > [!NOTE]
        > Webhooky se registrují přes REST API endpoint `POST /api/v1/Consumer/webhook` v Message Gateway, 
        > případně automaticky při registraci a konfiguraci příslušného cloudového konektoru.
        """)
        return

    # Načtení stavů pro jednotlivé webhooky (do paměti)
    if 'cached_msggw_webhook_statuses' not in st.session_state:
        st.session_state['cached_msggw_webhook_statuses'] = {}

    # Příprava dat pro přehledovou tabulku
    table_rows = []
    total_models_subscribed = 0
    total_ready_msgs = 0
    total_unacked_msgs = 0
    healthy_cnt = 0
    error_cnt = 0

    for w in webhooks:
        if not isinstance(w, dict):
            continue
        cid = w.get('id', '')
        raw_code = w.get('code')
        code = raw_code if raw_code else (cid if not cid else '—')
        url = w.get('webhookUrl', '')
        msg_types = w.get('messageTypes', []) or []
        models_count = len(msg_types)
        total_models_subscribed += models_count

        lookup_key = raw_code or cid

        # Zjištění stavu, pokud již byl dříve dotázán
        stat = st.session_state['cached_msggw_webhook_statuses'].get(lookup_key, {})
        status_str = stat.get('status') or ("Healthy" if stat.get('connected') else "⚪ Neověřeno")
        ready_msgs = stat.get('readyMessages', '-')
        unack_msgs = stat.get('unacknowledgedMessages', '-')
        total_msgs = stat.get('totalMessages', '-')

        if stat.get('connected') or stat.get('status') == 'Healthy':
            healthy_cnt += 1
        elif stat.get('status') in ['Degraded', 'Unhealthy']:
            error_cnt += 1

        if isinstance(ready_msgs, int):
            total_ready_msgs += ready_msgs
        if isinstance(unack_msgs, int):
            total_unacked_msgs += unack_msgs

        table_rows.append({
            "Stav": status_str,
            "Kód consumera": raw_code if raw_code else "—",
            "ID consumera": cid,
            "Webhook URL": url,
            "Počet modelů": models_count,
            "Ve frontě (Ready)": ready_msgs,
            "Neakceptováno (Unacked)": unack_msgs,
            "Celkem zpráv": total_msgs,
            "id": cid,
            "code": raw_code,
            "lookup_key": lookup_key,
            "messageTypes": msg_types,
            "raw": w
        })

    # KPI Metriky nahoře
    kpi_col1, kpi_col2, kpi_col3, kpi_col4 = st.columns(4)
    with kpi_col1:
        st.metric("🔗 Registrovaných Webhooků", str(len(table_rows)))
    with kpi_col2:
        st.metric("📋 Odebíraných modelů celkem", str(total_models_subscribed))
    with kpi_col3:
        st.metric("📬 Zprávy čekající ve frontě", str(total_ready_msgs) if total_ready_msgs > 0 else "0", help="Počet zpráv čekajících v RabbitMQ na doručení webhooku (readyMessages)")
    with kpi_col4:
        st.metric("⏳ Neakceptované (Unacked)", str(total_unacked_msgs) if total_unacked_msgs > 0 else "0", help="Zprávy odeslané na webhook, u kterých se čeká na HTTP 2xx odpověď partnera (unacknowledgedMessages)")

    st.markdown("---")

    df_webhooks = pd.DataFrame(table_rows)

    # Hlavička a vyhledávací filtr nad tabulkou
    hdr_col, search_col = st.columns([5.5, 2.5], vertical_alignment="center")
    with hdr_col:
        st.markdown("#### 🗂️ Seznam registrovaných Webhook Consumerů")
    with search_col:
        search_q = st.text_input(
            "Hledat podle ID nebo Code:",
            placeholder="🔍 Hledat podle ID nebo Code...",
            key="webhook_filter_query",
            label_visibility="collapsed"
        ).strip().lower()

    # Lokální filtrování podle ID nebo kódu
    if search_q:
        df_filtered = df_webhooks[
            df_webhooks['Kód consumera'].astype(str).str.lower().str.contains(search_q) |
            df_webhooks['ID consumera'].astype(str).str.lower().str.contains(search_q)
        ].reset_index(drop=True)
    else:
        df_filtered = df_webhooks.copy()

    st.caption(f"Zobrazeno **{len(df_filtered)}** z **{len(df_webhooks)}** webhook consumerů. Kliknutím na řádek zobrazíte detailní mapování modelů a diagnostiku fronty.")

    display_cols = ["Stav", "Kód consumera", "ID consumera", "Webhook URL", "Počet modelů", "Ve frontě (Ready)", "Neakceptováno (Unacked)", "Celkem zpráv"]
    
    if df_filtered.empty:
        st.info(f"Pro hledaný výraz '{search_q}' nebyl nalezen žádný webhook consumer.")
    else:
        grid_height = min(500, max(220, len(df_filtered) * 36 + 45))
        selection = st.dataframe(
            df_filtered[display_cols],
            width="stretch",
            height=grid_height,
            hide_index=True,
            selection_mode="single-row",
            on_select="rerun",
            key="df_webhooks_master_grid",
            column_config={
                "Stav": st.column_config.TextColumn(label="Stav", width="small"),
                "Kód consumera": st.column_config.TextColumn(label="Kód consumera (code)", width="medium"),
                "ID consumera": st.column_config.TextColumn(label="ID consumera (id)", width="medium"),
                "Webhook URL": st.column_config.LinkColumn(label="Webhook Cílová URL", width="large"),
                "Počet modelů": st.column_config.NumberColumn(label="Odebírané modely", width="small"),
                "Ve frontě (Ready)": st.column_config.TextColumn(label="Ve frontě (Ready)", width="small"),
                "Neakceptováno (Unacked)": st.column_config.TextColumn(label="Neakceptováno (Unacked)", width="small"),
                "Celkem zpráv": st.column_config.TextColumn(label="Celkem zpráv", width="small")
            }
        )

        # Zpracování výběru řádku pro Detail
        selected_row_idx = None
        if selection and selection.get('selection', {}).get('rows'):
            selected_row_idx = selection['selection']['rows'][0]

        # Výchozí výběr: první řádek, pokud uživatel nekliknul jinam
        if selected_row_idx is None and len(df_filtered) > 0:
            selected_row_idx = 0

        if selected_row_idx is not None and selected_row_idx < len(df_filtered):
            sel_item = df_filtered.iloc[selected_row_idx].to_dict()
            target_code = sel_item['Kód consumera']
            target_url = sel_item['Webhook URL']
            target_id = sel_item['id']
            lookup_key = sel_item['lookup_key']
            raw_config = sel_item['raw']
            msg_types = sel_item['messageTypes']

            st.markdown("---")
            display_title = f"`{target_code}`" if target_code and target_code != "—" else f"`{target_id}`"
            st.markdown(f"### 🔍 Detail Webhook Consumera: {display_title}")

            # Tlačítko pro načtení live statusu daného consumera
            act_col1, act_col2 = st.columns([6, 2], vertical_alignment="center")
            with act_col1:
                ui_helpers.render_html(f"""
                <div style="display: flex; align-items: center; gap: 8px; height: 38px;">
                    <span style="font-weight: 600; color: #0f172a;">Consumer ID:</span>
                    {ui_helpers.render_badge(target_id, 'neutral')}
                    <span style="font-weight: 600; color: #0f172a; margin-left: 8px;">Code:</span>
                    {ui_helpers.render_badge(target_code if target_code else 'N/A', 'teal')}
                </div>
                """)
            with act_col2:
                btn_fetch_status = st.button("📡 Načíst živý stav fronty", type="primary", key=f"btn_stat_{lookup_key}", width="stretch")

            status_cache_key = f"msggw_stat_{lookup_key}"
            if btn_fetch_status or status_cache_key not in st.session_state:
                with st.spinner(f"Ověřuji stav fronty pro webhook '{lookup_key}'..."):
                    try:
                        res_json, log_info = api_client.fetch_msggw_webhook_consumer_status_by_code(
                            creds['api_url'], token, tenant_id, lookup_key
                        )
                        st.session_state[status_cache_key] = (res_json, log_info, None)
                        st.session_state['cached_msggw_webhook_statuses'][lookup_key] = res_json if isinstance(res_json, dict) else {}
                    except Exception as e:
                        st.session_state[status_cache_key] = (None, str(e), e)

            status_res = st.session_state.get(status_cache_key)
            if status_res:
                res_json, log_info, err = status_res
                if res_json and isinstance(res_json, dict):
                    stat_kpi1, stat_kpi2, stat_kpi3, stat_kpi4 = st.columns(4)
                    with stat_kpi1:
                        is_conn = res_json.get('connected', False)
                        st.metric("Stav konektivity", "🟢 Připojen" if is_conn else "🔴 Odpojen")
                    with stat_kpi2:
                        st.metric("Health Status", str(res_json.get('status', 'Healthy')))
                    with stat_kpi3:
                        st.metric("Ready Messages", str(res_json.get('readyMessages', 0)), help="Zprávy připravené k odeslání")
                    with stat_kpi4:
                        st.metric("Unacknowledged", str(res_json.get('unacknowledgedMessages', 0)), help="Zprávy čekající na HTTP 2xx ACK")

            # Záložky detailu
            tab_sub, tab_template, tab_diag = st.tabs([
                "📋 Odebírané typy zpráv (Modely)",
                "🌐 Šablona doručení & URL Kontrakt",
                "🔍 Diagnostika & Raw JSON"
            ])

            with tab_sub:
                st.markdown("##### 📨 Modely a události registrované pro tento Webhook")
                if msg_types:
                    filters_map = raw_config.get('messageTypesWithFilters') or {}
                    expr_filters_map = raw_config.get('messageTypesWithExpressionFilters') or {}

                    models_data = []
                    for mt in msg_types:
                        h_filter = filters_map.get(mt)
                        h_filter_str = json.dumps(h_filter, ensure_ascii=False) if h_filter else "—"
                        e_filter = expr_filters_map.get(mt)
                        e_filter_str = str(e_filter) if e_filter else "—"

                        models_data.append({
                            "Typ zprávy (messageType)": mt,
                            "Hierarchický filtr": h_filter_str,
                            "Výrazový filtr (Expression)": e_filter_str
                        })

                    df_models = pd.DataFrame(models_data)
                    m_height = min(400, max(180, len(df_models) * 36 + 45))
                    st.dataframe(df_models, width="stretch", height=m_height, hide_index=True)
                else:
                    st.info("Tento consumer zatím nemá explicitně přiřazeny žádné odebírané typy zpráv.")

            with tab_template:
                st.markdown("##### 🚀 Předpis HTTP POST volání z Message Gateway na partnera")
                sample_mt = msg_types[0] if msg_types else "ASOL.DataService.RefreshSourceStatus"
                sample_contract = sample_mt.split('.')[-1] if '.' in sample_mt else "EventContract"

                st.markdown(f"""
                Message Gateway doručuje notifikace pomocí **HTTP POST** požadavku podle následující šablony:
                ```http
                POST {target_url}/{{messageType}}/{{contractType}}/{{messageId}}
                ```

                **Příklad konkrétního volání pro tento webhook:**
                ```http
                POST {target_url}/{sample_mt}/{sample_contract}/c0eb0000-5dfe-0015-8604-08dbd6ef8bf7
                Authorization: Bearer <Token podepsaný IDP pomocí RS256>
                Content-Type: application/json; charset=utf-8
                X-Tenant-Id: {tenant_id}
                X-UserClaim-tid: {tenant_id}
                X-UserClaim-client_id: plaza-pass
                X-UserClaimsExtended: [...]

                {{
                  "exampleId": "b0588700-f3a2-4bde-bbb4-d2022bf7851e",
                  "timestamp": "2026-11-06T14:30:00Z"
                }}
                ```
                > [!TIP]
                > Cílový webhook partnera musí na tento požadavek vrátit HTTP status **`200 OK`** nebo **`204 No Content`**. 
                > Návratový kód 4xx nebo 5xx (případně timeout spojení) způsobí zachování zprávy ve frontě a její opakované doručení (redelivery s backoff politikou).
                """)

            with tab_diag:
                st.markdown("##### 📦 Kompletní konfigurace a diagnostická odpověď serveru")
                col_d1, col_d2 = st.columns(2)
                with col_d1:
                    st.markdown("**Konfigurace Webhook Consumera (Registration Model):**")
                    st.code(json.dumps(raw_config, indent=2, ensure_ascii=False), language="json")
                with col_d2:
                    st.markdown("**Poslední diagnostická odpověď fronty:**")
                    if status_res and status_res[0]:
                        st.code(json.dumps(status_res[0], indent=2, ensure_ascii=False), language="json")
                    else:
                        st.info("Zatím nebyl spuštěn dotaz na živý stav fronty.")

    # Sekce: Globální katalog typů zpráv na platformě
    st.markdown("---")
    with st.expander("📋 Globální katalog všech typů zpráv a routování na platformě (MessageRouting)", expanded=False):
        st.caption("Přehled všech typů událostí, které jednotlivé doménové služby platformy AVAplace umí publikovat do brokeru.")
        
        c_cat1, c_cat2 = st.columns([6, 2], vertical_alignment="center")
        with c_cat1:
            st.markdown("Načtení systémového katalogu zpráv z endpointu `/api/v1/MessageRouting`.")
        with c_cat2:
            btn_load_catalog = st.button("🚀 Načíst katalog zpráv", key="btn_load_msg_catalog", width="stretch")

        if btn_load_catalog or 'cached_msggw_routings' in st.session_state:
            if 'cached_msggw_routings' not in st.session_state:
                with st.spinner("Stahuji katalog zpráv a směrování z Message Gateway..."):
                    try:
                        routings = api_client.fetch_msggw_message_routings(creds['api_url'], token, tenant_id)
                        st.session_state['cached_msggw_routings'] = routings
                    except Exception as e:
                        st.error(f"Nepodařilo se načíst katalog směrování: {e}")
                        st.session_state['cached_msggw_routings'] = []

            routings_list = st.session_state.get('cached_msggw_routings', [])
            if routings_list:
                flat_routings = []
                for r in routings_list:
                    if isinstance(r, dict):
                        flat_routings.append({
                            "Typ zprávy (messageType)": r.get('messageType', ''),
                            "C# Kontrakt (contractType)": r.get('contractType', ''),
                            "Exchange": r.get('rabbitMqExchange', ''),
                            "Routing Key": r.get('rabbitMqRoutingKey', '')
                        })
                df_routings = pd.DataFrame(flat_routings)
                r_height = min(500, max(220, len(df_routings) * 36 + 45))
                st.dataframe(df_routings, width="stretch", height=r_height, hide_index=True)
            else:
                st.info("V katalogu zpráv nebyly nalezeny žádné záznamy.")

