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
    try:
        cf_data = json.loads(cf_string)
        if isinstance(cf_data, str):
            cf_data = json.loads(cf_data)
            
        if isinstance(cf_data, list) and len(cf_data) > 0:
            df_cf = pd.DataFrame(cf_data)
            st.dataframe(df_cf, width="stretch", hide_index=True)
        else:
            st.info("Tento záznam sice pole Custom Fields obsahuje, ale nejsou v něm žádná data.")
    except Exception as e:
        st.error(f"Nepodařilo se rozparsovat JSON strukturu: {e}")
        st.code(cf_string)
