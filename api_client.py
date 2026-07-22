import requests
import json
import pandas as pd
from datetime import datetime, time

def fetch_token(idp_base_url, client_id, client_secret, tenant_id, scope):
    token_url = f"{idp_base_url.rstrip('/')}/connect/token"
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
    payload = {
        'grant_type': 'client_credentials',
        'client_id': client_id.strip(),
        'client_secret': client_secret.strip(),
        'tid': tenant_id.strip()
    }
    if scope and scope.strip():
        payload['scope'] = scope.strip()
        
    response = requests.post(token_url, data=payload, headers=headers, timeout=10)
    if response.status_code != 200:
        try:
            err_data = response.json()
            err_msg = err_data.get("error_description") or err_data.get("error") or response.text
        except Exception:
            err_msg = response.text
        raise requests.exceptions.HTTPError(f"{response.status_code} Error: {err_msg} for url: {token_url}", response=response)
    return response.json().get("access_token")

def fetch_logs_page(api_url, token, tenant_id, limit, offset, filters=None):
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    params = {
        'limit': limit,
        'offset': offset
    }
    
    if filters:
        if filters.get('operationId'): params['OperationId'] = filters['operationId'].strip()
        if filters.get('agent_code'): params['AgentCode'] = filters['agent_code'].strip()
        if filters.get('agent_id'): params['AgentId'] = filters['agent_id'].strip()
        if filters.get('source_id'): params['SourceId'] = filters['source_id'].strip()
        if filters.get('op_scope'): params['OperationScope'] = filters['op_scope'].strip()
        
        if filters.get('severity_level') and filters.get('severity_level') != "Všechny":
            params['SeverityLevel'] = filters['severity_level']
            
        params['IncludeSystemLevel'] = 'true' if filters.get('include_system', True) else 'false'
            
        if filters.get('use_time'):
            tz_local = 'Europe/Prague'
            d_from = filters.get('date_from')
            if d_from:
                t_from = filters.get('time_from') if filters.get('time_from') is not None else time(0, 0, 0)
                dt_from_local = pd.Timestamp(datetime.combine(d_from, t_from)).tz_localize(tz_local)
                params['createdFrom'] = dt_from_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
                
            d_to = filters.get('date_to')
            if d_to:
                t_to = filters.get('time_to') if filters.get('time_to') is not None else time(23, 59, 59)
                dt_to_local = pd.Timestamp(datetime.combine(d_to, t_to)).tz_localize(tz_local)
                params['createdTo'] = dt_to_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
            
    response = requests.get(api_url, headers=headers, params=params, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_datasource_info(api_base_url, token, tenant_id, source_id):
    base_url = api_base_url.split('/OperatingLogs')[0]
    ds_url = f"{base_url}/DataSources/{source_id.strip()}"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    response = requests.get(ds_url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()

def fetch_input_queue(api_url, token, tenant_id, limit, offset, filters=None):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]

    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }

    params = {
        'limit': limit,
        'offset': offset
    }

    version = None
    source_id = None
    if filters:
        version = filters.get('sourcing_api_version')
        source_id = filters.get('source_id')
        if filters.get('agent_id'):
            params['agentId'] = filters['agent_id'].strip()
        if filters.get('client_id'):
            params['clientId'] = filters['client_id'].strip()
        if filters.get('operation_id'):
            params['operationId'] = filters['operation_id'].strip()
        if filters.get('use_time'):
            tz_local = 'Europe/Prague'
            d_from = filters.get('date_from')
            if d_from:
                t_from = filters.get('time_from') if filters.get('time_from') is not None else time(0, 0, 0)
                dt_from_local = pd.Timestamp(datetime.combine(d_from, t_from)).tz_localize(tz_local)
                params['createdFrom'] = dt_from_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
            d_to = filters.get('date_to')
            if d_to:
                t_to = filters.get('time_to') if filters.get('time_to') is not None else time(23, 59, 59)
                dt_to_local = pd.Timestamp(datetime.combine(d_to, t_to)).tz_localize(tz_local)
                params['createdTo'] = dt_to_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')

    if version == 'v1':
        if not source_id or not str(source_id).strip():
            raise ValueError('Source ID is required for v1 SourcingData endpoint')
        enqueue_url = f"{base_ds_url}/api/v1/SourcingData/EnqueueDataBySourceId/{str(source_id).strip()}"
    else:
        enqueue_url = f"{base_ds_url}/api/v2/SourcingData/EnqueueData"

    response = requests.get(enqueue_url, headers=headers, params=params, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_output_queue(api_url, token, tenant_id, limit, offset, filters=None):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    get_data_url = f"{base_ds_url}/api/v2/QueryingData/GetData"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    params = {
        'limit': limit,
        'offset': offset
    }
    if filters:
        if filters.get('model_id'):
            params['modelId'] = filters['model_id'].strip()
        if filters.get('source_id'):
            params['sourceId'] = filters['source_id'].strip()
        if filters.get('mandant_code'):
            params['mandantCode'] = filters['mandant_code'].strip()
            
        if filters.get('use_time'):
            tz_local = 'Europe/Prague'
            d_from = filters.get('date_from')
            if d_from:
                t_from = filters.get('time_from') if filters.get('time_from') is not None else time(0, 0, 0)
                dt_from_local = pd.Timestamp(datetime.combine(d_from, t_from)).tz_localize(tz_local)
                params['modifiedFrom'] = dt_from_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
                
            d_to = filters.get('date_to')
            if d_to:
                t_to = filters.get('time_to') if filters.get('time_to') is not None else time(23, 59, 59)
                dt_to_local = pd.Timestamp(datetime.combine(d_to, t_to)).tz_localize(tz_local)
                params['modifiedTo'] = dt_to_local.tz_convert('UTC').strftime('%Y-%m-%dT%H:%M:%SZ')
                
    response = requests.get(get_data_url, headers=headers, params=params, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_usage_statistics(api_url, token, tenant_id, application_code):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    usage_url = f"{base_ds_url}/api/v1/UsageStatistics/GetTenantsUsingApplication"
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    params = {}
    if application_code and application_code.strip():
        params['applicationCode'] = application_code.strip()
    response = requests.get(usage_url, headers=headers, params=params, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_integrated_applications(api_url, token, tenant_id):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    apps_url = f"{base_ds_url}/api/v1/IntegratedApplications?limit=333"
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    response = requests.get(apps_url, headers=headers, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_applications_used_by_tenants(api_url, token, tenant_id, tenant_ids=None, include_smart_check_status=False):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    usage_url = f"{base_ds_url}/api/v1/UsageStatistics/GetApplicationsUsedByTenants"
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    params = {
        'includeSmartCheckStatus': 'true' if include_smart_check_status else 'false'
    }
    if tenant_ids:
        params['tenantIds'] = tenant_ids
    response = requests.get(usage_url, headers=headers, params=params, timeout=(15,120))
    response.raise_for_status()
    return response.json()

def fetch_impersonation_token(api_url, master_token, target_tenant_id):
    """Získá impersonační token pro cílového child tenanta z IDP endpointu /api/v1/Tokens/impersonation"""
    base_idp_url = api_url.split('/api/asol/ds')[0] + '/api/asol/idp'
    imp_url = f"{base_idp_url}/api/v1/Tokens/impersonation"
    headers = {
        'Authorization': f'Bearer {master_token}',
        'X-Tenant': target_tenant_id.strip(),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    payload = {
        'parameters': {
            'tid': target_tenant_id.strip()
        }
    }
    
    log_info = f"URL: `{imp_url}`\nHeaders: `X-Tenant: {target_tenant_id.strip()}`\nPayload: `{json.dumps(payload)}`"
    try:
        response = requests.post(imp_url, headers=headers, json=payload, timeout=(10, 30))
        res_snippet = response.text[:300] if response.text else ''
        log_info += f"\nHTTP Status: `{response.status_code} {response.reason}`\nResponse snippet: `{res_snippet}`"
        if response.status_code == 200:
            data = response.json()
            token = data.get("accessToken") or data.get("access_token") or data.get("token")
            if token:
                return token, f"✅ Impersonace ÚSPĚŠNÁ (HTTP 200 OK)\n\n{log_info}"
            else:
                return None, f"⚠️ Impersonace vrátila HTTP 200, ale token nebyl nalezen v JSON odpovědi.\n\n{log_info}"
        else:
            return None, f"❌ Impersonace SELHALA (HTTP {response.status_code} {response.reason})\n\n{log_info}"
    except Exception as e:
        return None, f"❌ Výjimka při volání impersonace: {e}\n\n{log_info}"

def fetch_smartcheck_report(api_url, token, tenant_id, result_id):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    report_url = f"{base_ds_url}/api/v1/SmartChecks/Results/{result_id}/adhocReport"
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': '*/*'
    }
    response = requests.get(report_url, headers=headers, timeout=(15,120))
    if response.status_code != 200:
        try:
            err_data = response.json()
            err_msg = err_data.get("detail") or err_data.get("title") or err_data.get("error_description") or response.text
        except Exception:
            err_msg = response.text
        raise requests.exceptions.HTTPError(f"{response.status_code} Error: {err_msg} for url: {report_url}", response=response)
    return response.content, response.headers.get('Content-Type', 'application/octet-stream')

def fetch_smartcheck_result_details(api_url, token, tenant_id, result_id):
    base_ds_url = api_url.split('/api/v1/OperatingLogs')[0]
    result_url = f"{base_ds_url}/api/v1/SmartChecks/Results/{result_id}"
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    response = requests.get(result_url, headers=headers, timeout=(15,120))
    if response.status_code != 200:
        try:
            err_data = response.json()
            err_msg = err_data.get("detail") or err_data.get("title") or response.text
        except Exception:
            err_msg = response.text
        raise requests.exceptions.HTTPError(f"{response.status_code} Error: {err_msg} for url: {result_url}", response=response)
    return response.json()

def fetch_user_tenants(api_url, token, tenant_id):
    base_idp_url = api_url.split('/api/asol/ds')[0] + '/api/asol/idp'
    headers = {
        'Authorization': f'Bearer {token}',
        'X-Tenant': tenant_id.strip(),
        'Accept': 'application/json'
    }
    
    tenants = {}
    
    def fetch_all_pages(endpoint_url):
        res_dict = {}
        limit = 1000
        offset = 0
        while True:
            try:
                r = requests.get(endpoint_url, headers=headers, params={'Limit': limit, 'Offset': offset}, timeout=(10, 30))
                if r.status_code != 200:
                    break
                data = r.json()
                items = data.get('items') if isinstance(data, dict) else data
                if not items or not isinstance(items, list):
                    break
                for t in items:
                    tid = t.get('id')
                    if tid:
                        res_dict[tid] = t.get('name') or tid
                
                total_count = data.get('totalCount') if isinstance(data, dict) else None
                if total_count is not None:
                    if offset + len(items) >= total_count:
                        break
                else:
                    if len(items) < limit:
                        break
                offset += len(items)
            except Exception:
                break
        return res_dict

    tenants.update(fetch_all_pages(f"{base_idp_url}/api/v1/UserTenants"))
    tenants.update(fetch_all_pages(f"{base_idp_url}/api/v1/Tenants/childTenants"))
    tenants.update(fetch_all_pages(f"{base_idp_url}/api/v1/Tenants"))

    return [{"id": tid, "name": name} for tid, name in tenants.items()]
