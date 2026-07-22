import pandas as pd
import json
import streamlit as st

def get_status_badge(status):
    if not status or pd.isna(status):
        return '⚪ Neuvedeno'
    s = str(status).strip()
    if s == 'Healthy':
        return '🟢 Healthy'
    elif s == 'Degraded':
        return '🟡 Degraded'
    elif s == 'Unhealthy':
        return '🔴 Unhealthy'
    elif s == 'Neuvedeno':
        return '⚪ Neuvedeno'
    if s.startswith('🟢') or s.startswith('🟡') or s.startswith('🔴') or s.startswith('⚪'):
        return s
    return f'⚪ {s}'

def determine_badge(severities):
    if isinstance(severities, str):
        severities = [severities]
    combined = " ".join(list(severities))
    if 'Error' in combined: return '🔴 Error'
    elif 'Warning' in combined: return '🟡 Warning'
    elif 'Info' in combined: return '🟢 Info'
    return '⚪ Unknown'

def determine_queue_badge(status):
    if not status:
        return '⚪ Neznámý'
    status_str = str(status).strip()
    if status_str == 'Success':
        return '🟢 Success'
    elif status_str == 'Failed':
        return '🔴 Failed'
    elif status_str == 'Canceled':
        return '⚪ Canceled'
    elif status_str == 'Pending':
        return '🟡 Pending'
    return f'🔵 {status_str}'

def clean_data(raw_list):
    df = pd.DataFrame(raw_list)
    if df.empty: return df
    
    required_columns = ['id', 'operationId', 'operationType', 'activityType', 'severity', 'createdOn', 'message', 'scopeId', 'sourceId', 'agentId', 'source']
    for col in required_columns:
        if col not in df.columns: df[col] = None

    df['severity'] = df['severity'].fillna('Unknown')
    df['severity'] = df['severity'].apply(determine_badge)

    for col in df.columns:
        if df[col].apply(lambda x: isinstance(x, (dict, list))).any():
            df[col] = df[col].apply(lambda x: json.dumps(x, ensure_ascii=False) if isinstance(x, (dict, list)) else str(x) if pd.notna(x) else "")
        elif df[col].dtype == 'object' and col != 'createdOn':
            df[col] = df[col].astype(str).replace('nan', '')

    df['createdOn'] = pd.to_datetime(df['createdOn'], format='ISO8601', utc=True, errors='coerce')
    return df

@st.dialog("📋 Detail Custom Fields")
def show_custom_fields_modal(cf_string):
    show_json_modal(cf_string, title="Detail Custom Fields")

@st.dialog("🔍 Detail JSON obsahu")
def show_json_modal(json_data_input, title="Detail JSON obsahu"):
    st.markdown(f"#### 📄 {title}")
    try:
        if isinstance(json_data_input, str):
            parsed = json.loads(json_data_input)
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
        else:
            parsed = json_data_input

        if isinstance(parsed, list):
            if len(parsed) > 0 and all(isinstance(x, dict) for x in parsed):
                df_parsed = pd.DataFrame(parsed)
                st.dataframe(df_parsed, width="stretch", hide_index=True)
            elif len(parsed) > 0:
                st.json(parsed)
            else:
                st.info("JSON pole je prázdné (`[]`).")
        elif isinstance(parsed, dict):
            if all(not isinstance(v, (dict, list)) for v in parsed.values()):
                df_parsed = pd.DataFrame(list(parsed.items()), columns=['Klíč (Key)', 'Hodnota (Value)'])
                st.dataframe(df_parsed, width="stretch", hide_index=True)
            else:
                st.json(parsed)
        else:
            st.code(str(parsed))
    except Exception as e:
        st.error(f"Nepodařilo se rozparsovat JSON strukturu: {e}")
        st.code(str(json_data_input))

def extract_model_id_from_row(row):
    if row is None:
        return None
    import re
    
    # 1. Přímé atributy
    for col in ['modelId', 'dataModelId', 'model_id', 'datamodel_id']:
        val = row.get(col)
        if pd.notna(val) and str(val).strip().lower() not in ['', 'none', 'null', 'nan']:
            return str(val).strip()

    # 2. Hledání v customFields
    cf_raw = row.get('customFields')
    if pd.notna(cf_raw):
        try:
            cf_parsed = json.loads(str(cf_raw))
            if isinstance(cf_parsed, list):
                for item in cf_parsed:
                    if isinstance(item, dict):
                        k = str(item.get('key', '')).lower()
                        v = str(item.get('value', '')).strip()
                        if 'model' in k and v:
                            return v
            elif isinstance(cf_parsed, dict):
                for k, v in cf_parsed.items():
                    if 'model' in str(k).lower() and v:
                        return str(v).strip()
        except Exception:
            pass

    # 3. Hledání UUID v textu (message / details)
    for text_col in ['details', 'message']:
        text_val = str(row.get(text_col, ''))
        if text_val:
            match = re.search(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', text_val)
            if match:
                return match.group(0)

    return None
