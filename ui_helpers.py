import pandas as pd
import json
import re
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

def html_to_plain_text(html_content):
    """Převede HTML zprávu na čistý text s unescapovanými entitami"""
    if not html_content:
        return ""
    import html as py_html
    # 1. Unescape HTML entity (&#39; -> ', &amp; -> &, atd.)
    text = py_html.unescape(str(html_content))
    # 2. Odstranění script/style tagů
    text = re.sub(r'<(script|style).*?>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # 3. Nahrazení br, p, div odřádkováním
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    # 4. Odstranění zbývajících HTML tagů
    text = re.sub(r'<[^>]+>', '', text)
    return text

def parse_smartcheck_report(report_input):
    """Rozparsuje protokol SmartChecku (textový i HTML) na sekce podle aplikací"""
    sections = {}
    if not report_input:
        return sections
        
    plain_text = html_to_plain_text(report_input)
    current_app_key = None
    
    for line in plain_text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
            
        if '|' in line_str and any(st in line_str for st in ['Healthy', 'Degraded', 'Unhealthy']):
            parts = line_str.split('|', 1)
            current_app_key = parts[1].strip()
            if current_app_key not in sections:
                sections[current_app_key] = []
        elif line_str.startswith('-') and current_app_key:
            issue_text = line_str.lstrip('- ').strip()
            sections[current_app_key].append(issue_text)
            
    return sections

def extract_all_hex_uuids(text):
    if not text:
        return []
    # Vyhledá 8-znakovou hex sekvenci nebo plné UUID
    matches = re.findall(r'[0-9a-fA-F]{8}', str(text))
    return [m.lower() for m in matches]

def get_issues_for_app(app_row, parsed_sections):
    """Vrátí seznam nálezů / varování / chyb pro konkrétní aplikaci s pokročilým párováním"""
    if not parsed_sections:
        return []
    
    app_code = str(app_row.get('applicationCode', '')).strip()
    group_code = str(app_row.get('smartCheckGroupCode', '')).strip()
    
    # Extrakce všech 8-znakových hex GUIDs ze VŠECH polí v app_row (id, applicationId, sourceId, agentId...)
    grid_row_str = " ".join([str(v) for k, v in app_row.items() if v is not None])
    grid_uuids = set(extract_all_hex_uuids(grid_row_str))
    
    # Normalizované názvy pro tokenové porovnání (např. DataIntegrationOnPremiseExample -> dataintegration onpremise example)
    clean_app_code_tokens = set(re.findall(r'[a-zA-Z0-9]+', app_code.lower()))
    # Vynecháme obecné tokeny jako "asoleu", "ap"
    clean_app_code_tokens.discard('asoleu')
    clean_app_code_tokens.discard('ap')
    
    matched_issues = []
    for key_header, issues in parsed_sections.items():
        key_clean = key_header.strip()
        sec_full_text = key_clean + " " + " ".join(issues)
        sec_uuids = set(extract_all_hex_uuids(sec_full_text))
        
        # 1. Přesná/prefipsová shoda UUID (např. DataSource GUID '012521f9-...' nebo 'aaef66df')
        if grid_uuids and sec_uuids:
            shared_uuids = grid_uuids.intersection(sec_uuids)
            if shared_uuids:
                matched_issues.extend(issues)
                continue
            
        # 2. Podřetězcová shoda podle kódů
        key_lower = key_clean.lower()
        if app_code and len(app_code) > 5 and (app_code.lower() in key_lower or key_lower in app_code.lower()):
            matched_issues.extend(issues)
            continue
            
        if group_code and len(group_code) > 5 and (group_code.lower() in key_lower or key_lower in group_code.lower()):
            matched_issues.extend(issues)
            continue
            
        # 3. Shoda podle klíčových slov v názvu (např. DataIntegrationOnPremiseExample vs DataIntegration OnPremiseAgent Example)
        key_tokens = set(re.findall(r'[a-zA-Z0-9]+', key_lower))
        key_tokens.discard('asoleu')
        key_tokens.discard('ap')
        if clean_app_code_tokens and len(key_tokens.intersection(clean_app_code_tokens)) >= 2:
            matched_issues.extend(issues)
            
    return list(dict.fromkeys(matched_issues))
