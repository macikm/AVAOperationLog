import os
import json
import logging
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

import api_client
import config_manager
import ui_helpers

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ava-server")

app = FastAPI(title="AVA Monitor API", version="2.0.0")

# Enable CORS for local Vite dev server (e.g. localhost:5173, localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_environment_urls(env_name: str) -> tuple[str, str]:
    domain = config_manager.ENVIRONMENTS.get(env_name, config_manager.ENVIRONMENTS["Produkce"])
    idp_url = f"https://{domain}/api/asol/idp"
    api_url = f"https://{domain}/api/asol/ds/api/v1/OperatingLogs"
    return idp_url, api_url


def extract_token_and_tenant(
    authorization: Optional[str],
    x_tenant: Optional[str],
) -> tuple[str, str]:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Chybí autorizační token (Authorization hlavička).")
    token = authorization.replace("Bearer ", "").strip()
    tenant_id = (x_tenant or "").strip()
    return token, tenant_id


# --- HEALTH CHECKS ---
@app.get("/health")
@app.get("/_stcore/health")
def health_check():
    return {"status": "ok", "app": "AVA Monitor", "version": "2.0.0"}


# --- CONFIG & ENVIRONMENTS ---
@app.get("/api/config/environments")
def get_environments():
    return {
        "environments": config_manager.ENVIRONMENTS,
        "default_env": "Produkce",
        "default_tenant": config_manager.DEFAULT_CREDS["tenant_id"],
    }


# --- AUTHENTICATION & TOKENS ---
class LoginRequest(BaseModel):
    environment: str = "Produkce"
    auth_mode: str = "password"  # password | client_credentials | sso
    username: Optional[str] = ""
    password: Optional[str] = ""
    tenant_id: Optional[str] = "ASOLEU"
    client_id: Optional[str] = ""
    client_secret: Optional[str] = ""
    scope: Optional[str] = ""
    sso_token: Optional[str] = ""


@app.post("/api/auth/login")
def login(req: LoginRequest):
    idp_url, api_url = get_environment_urls(req.environment)
    
    try:
        if req.auth_mode == "sso" or (req.sso_token and req.sso_token.strip()):
            token = req.sso_token.replace("Bearer ", "").strip()
            if not token:
                raise HTTPException(status_code=400, detail="Zadejte platný Bearer JWT token.")
        else:
            token = api_client.fetch_token(
                idp_base_url=idp_url,
                client_id=req.client_id,
                client_secret=req.client_secret,
                tenant_id=req.tenant_id,
                scope=req.scope,
                auth_mode=req.auth_mode,
                username=req.username,
                password=req.password,
            )

        claims = api_client.parse_jwt_token(token)
        expiration = api_client.get_token_expiration_info(token)

        return {
            "access_token": token,
            "user_claims": claims,
            "expiration": expiration,
            "environment": req.environment,
            "tenant_id": req.tenant_id or "ASOLEU",
        }
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


class ImpersonateRequest(BaseModel):
    environment: str = "Produkce"
    target_tenant_id: str
    target_org_code: Optional[str] = None
    client_id: Optional[str] = None


@app.post("/api/auth/impersonate")
def impersonate(
    req: ImpersonateRequest,
    authorization: Optional[str] = Header(None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Chybí Master autorizační token.")
    master_token = authorization.replace("Bearer ", "").strip()
    _, api_url = get_environment_urls(req.environment)

    imp_token, log_info = api_client.fetch_impersonation_token(
        api_url=api_url,
        master_token=master_token,
        target_tenant_id=req.target_tenant_id,
        target_org_code=req.target_org_code,
        client_id=req.client_id,
    )

    claims = api_client.parse_jwt_token(imp_token) if imp_token else {}
    expiration = api_client.get_token_expiration_info(imp_token) if imp_token else {}

    return {
        "success": bool(imp_token),
        "access_token": imp_token,
        "log": log_info,
        "claims": claims,
        "expiration": expiration,
        "target_tenant_id": req.target_tenant_id,
        "target_org_code": req.target_org_code,
    }


# --- TENANTS ---
@app.get("/api/tenants")
def get_user_tenants(
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        tenants = api_client.fetch_user_tenants(api_url, token, tenant_id)
        return {"items": tenants, "totalCount": len(tenants)}
    except Exception as e:
        logger.error(f"Error fetching tenants: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 1: PROVOZNÍ LOGY (OperatingLogs) ---
@app.get("/api/logs")
def get_operating_logs(
    env: str = "Produkce",
    limit: int = 100,
    offset: int = 0,
    operation_id: Optional[str] = None,
    severity_level: Optional[str] = None,
    include_system: bool = True,
    agent_code: Optional[str] = None,
    agent_id: Optional[str] = None,
    source_id: Optional[str] = None,
    op_scope: Optional[str] = None,
    use_time: bool = False,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    filters = {
        "operationId": operation_id or "",
        "severity_level": severity_level or "Všechny",
        "include_system": include_system,
        "agent_code": agent_code or "",
        "agent_id": agent_id or "",
        "source_id": source_id or "",
        "op_scope": op_scope or "",
        "use_time": use_time,
    }

    try:
        # Note: if created_from / created_to are provided in ISO format
        if use_time and (created_from or created_to):
            # We handle custom parameter injection if needed
            pass

        data = api_client.fetch_logs_page(api_url, token, tenant_id, limit=limit, offset=offset, filters=filters)
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
        return {"items": items, "totalCount": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error fetching logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 2: VSTUPNÍ FRONTA (SourcingData) ---
@app.get("/api/input-queue")
def get_input_queue(
    env: str = "Produkce",
    limit: int = 100,
    offset: int = 0,
    version: str = "v2",
    source_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    client_id: Optional[str] = None,
    operation_id: Optional[str] = None,
    status: Optional[str] = "Všechny",
    use_time: bool = False,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    filters = {
        "sourcing_api_version": version,
        "source_id": source_id or "",
        "agent_id": agent_id or "",
        "client_id": client_id or "",
        "operation_id": operation_id or "",
        "status": status or "Všechny",
        "use_time": use_time,
    }

    try:
        data = api_client.fetch_input_queue(api_url, token, tenant_id, limit=limit, offset=offset, filters=filters)
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
        return {"items": items, "totalCount": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error fetching input queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 3: VÝSTUPNÍ FRONTA (QueryingData) ---
@app.get("/api/output-queue")
def get_output_queue(
    env: str = "Produkce",
    limit: int = 100,
    offset: int = 0,
    version: str = "v2",
    result_id: Optional[str] = None,
    model_id: Optional[str] = None,
    client_id: Optional[str] = None,
    consumer_source_id: Optional[str] = None,
    publisher_source_id: Optional[str] = None,
    operation_id: Optional[str] = None,
    mandant_code: Optional[str] = None,
    include_deleted: bool = True,
    use_time: bool = False,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    filters = {
        "querying_api_version": version,
        "result_id": result_id or "",
        "model_id": model_id or "",
        "client_id": client_id or "",
        "consumer_source_id": consumer_source_id or "",
        "publisher_source_id": publisher_source_id or "",
        "operation_id": operation_id or "",
        "mandant_code": mandant_code or "",
        "include_deleted": include_deleted,
        "use_time": use_time,
    }

    try:
        data = api_client.fetch_output_queue(api_url, token, tenant_id, limit=limit, offset=offset, filters=filters)
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
        queue_info = data.get("queueInfo") if isinstance(data, dict) else None
        return {
            "items": items,
            "totalCount": total,
            "queueInfo": queue_info,
            "limit": limit,
            "offset": offset,
            "resolved_model_id": filters.get("model_id"),
            "resolved_result_id": filters.get("result_id"),
        }
    except Exception as e:
        logger.error(f"Error fetching output queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/output-queue/payload")
def get_record_payload(
    env: str = "Produkce",
    model_id: Optional[str] = None,
    record_id: Optional[str] = None,
    result_id: Optional[str] = None,
    item_id: Optional[str] = None,
    external_id: Optional[str] = None,
    mandant_code: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        payload = api_client.fetch_data_record_payload(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            model_id=model_id,
            record_id=record_id,
            result_id=result_id,
            item_id=item_id,
            external_id=external_id,
            mandant_code=mandant_code,
        )
        return {"payload": payload}
    except Exception as e:
        logger.error(f"Error fetching payload: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 4: DATA SOURCES ---
@app.get("/api/data-sources")
def get_data_sources(
    env: str = "Produkce",
    limit: int = 500,
    offset: int = 0,
    agent_id: Optional[str] = None,
    application_code: Optional[str] = None,
    fetch_all: bool = False,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    filters = {}
    if agent_id: filters["agent_id"] = agent_id
    if application_code: filters["application_code"] = application_code

    try:
        if fetch_all:
            items = api_client.fetch_all_data_sources(api_url, token, tenant_id, filters=filters)
            return {"items": items, "totalCount": len(items)}
        else:
            data = api_client.fetch_data_sources(api_url, token, tenant_id, limit=limit, offset=offset, filters=filters)
            items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
            return {"items": items, "totalCount": total}
    except Exception as e:
        logger.error(f"Error fetching data sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data-sources/{source_id}/info")
def get_datasource_info(
    source_id: str,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        info = api_client.fetch_datasource_info(api_url, token, tenant_id, source_id)
        return {"data": info}
    except Exception as e:
        logger.error(f"Error fetching datasource info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data-sources/{source_id}/transformations")
def get_transformations(
    source_id: str,
    env: str = "Produkce",
    agent_id: Optional[str] = None,
    access_level: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        data = api_client.fetch_data_transformations(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            source_id=source_id,
            agent_id=agent_id,
            access_level=access_level,
            limit=limit,
            offset=offset,
        )
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
        return {"items": items, "totalCount": total}
    except Exception as e:
        logger.error(f"Error fetching transformations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 5: DATA AGENTS ---
@app.get("/api/data-agents")
def get_data_agents(
    env: str = "Produkce",
    limit: int = 500,
    offset: int = 0,
    provider_code: Optional[str] = None,
    custom_code: Optional[str] = None,
    include_deleted: bool = False,
    fetch_all: bool = False,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    filters = {
        "provider_code": provider_code or "",
        "custom_code": custom_code or "",
        "include_deleted": include_deleted,
    }

    try:
        if fetch_all:
            items = api_client.fetch_all_data_agents(api_url, token, tenant_id, filters=filters)
            return {"items": items, "totalCount": len(items)}
        else:
            data = api_client.fetch_data_agents(api_url, token, tenant_id, limit=limit, offset=offset, filters=filters)
            items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            total = data.get("totalCount", len(items)) if isinstance(data, dict) else len(items)
            return {"items": items, "totalCount": total}
    except Exception as e:
        logger.error(f"Error fetching data agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data-agents/consumers")
def get_data_agent_consumers(
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        grpc_consumers = api_client.fetch_msggw_grpc_consumers(api_url, token, tenant_id)
        raw_statuses = api_client.fetch_msggw_all_consumers_statuses(api_url, token, tenant_id)

        statuses_map = {}
        if isinstance(raw_statuses, list):
            for s in raw_statuses:
                if isinstance(s, dict):
                    c_code = s.get("code") or s.get("consumerCode")
                    cid = s.get("id")
                    if c_code:
                        statuses_map[str(c_code)] = s
                    if cid:
                        statuses_map[str(cid)] = s
        elif isinstance(raw_statuses, dict):
            items_list = raw_statuses.get("items")
            if isinstance(items_list, list):
                for s in items_list:
                    if isinstance(s, dict):
                        c_code = s.get("code") or s.get("consumerCode")
                        cid = s.get("id")
                        if c_code:
                            statuses_map[str(c_code)] = s
                        if cid:
                            statuses_map[str(cid)] = s
            else:
                statuses_map = raw_statuses

        return {
            "grpc_consumers": grpc_consumers,
            "all_statuses": statuses_map,
        }
    except Exception as e:
        logger.error(f"Error fetching agent consumers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/grpc-consumers")
def get_grpc_consumers(
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        grpc_consumers = api_client.fetch_msggw_grpc_consumers(api_url, token, tenant_id)
        raw_statuses = api_client.fetch_msggw_all_consumers_statuses(api_url, token, tenant_id)

        statuses_map = {}
        if isinstance(raw_statuses, list):
            for s in raw_statuses:
                if isinstance(s, dict):
                    c_code = s.get("code") or s.get("consumerCode")
                    cid = s.get("id")
                    if c_code:
                        statuses_map[str(c_code)] = s
                    if cid:
                        statuses_map[str(cid)] = s
        elif isinstance(raw_statuses, dict):
            items_list = raw_statuses.get("items")
            if isinstance(items_list, list):
                for s in items_list:
                    if isinstance(s, dict):
                        c_code = s.get("code") or s.get("consumerCode")
                        cid = s.get("id")
                        if c_code:
                            statuses_map[str(c_code)] = s
                        if cid:
                            statuses_map[str(cid)] = s
            else:
                statuses_map = raw_statuses

        return {
            "grpc_consumers": grpc_consumers,
            "all_statuses": statuses_map,
        }
    except Exception as e:
        logger.error(f"Error fetching grpc consumers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/grpc-consumers/status")
def get_grpc_consumer_status(
    code: str,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        res_json, log_info = api_client.fetch_msggw_consumer_status_by_code(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            consumer_code=code,
        )
        return {"status": res_json, "log": log_info}
    except Exception as e:
        logger.error(f"Error fetching grpc consumer status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class VerifyConsumersBatchRequest(BaseModel):
    codes: List[str]
    env: str = "Produkce"


@app.post("/api/grpc-consumers/verify-batch")
def verify_grpc_consumers_batch(
    req: VerifyConsumersBatchRequest,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(req.env)

    results = {}
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def check_one(code):
        try:
            stat, _ = api_client.fetch_msggw_consumer_status_by_code(api_url, token, tenant_id, code)
            return code, stat
        except Exception as err:
            return code, {"connected": False, "status": "Unknown", "error": str(err)}

    # Up to 20 concurrent threads for fast batch check
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(check_one, c): c for c in req.codes[:300]}
        for f in as_completed(futures):
            code, stat = f.result()
            results[code] = stat

    return {"statuses": results}


def normalize_webhook_dict(w: dict) -> dict:
    if not isinstance(w, dict):
        return w
    msg_types = (
        w.get("messageTypes")
        or w.get("MessageTypes")
        or w.get("subscribedMessageTypes")
        or w.get("SubscribedMessageTypes")
        or []
    )
    filters = (
        w.get("messageTypesWithFilters")
        or w.get("MessageTypesWithFilters")
        or {}
    )
    expr_filters = (
        w.get("messageTypesWithExpressionFilters")
        or w.get("MessageTypesWithExpressionFilters")
        or {}
    )
    if not msg_types and filters:
        msg_types = list(filters.keys())
    if not msg_types and expr_filters:
        msg_types = list(expr_filters.keys())

    w["messageTypes"] = msg_types
    w["messageTypesWithFilters"] = filters
    w["messageTypesWithExpressionFilters"] = expr_filters
    w["code"] = w.get("code") or w.get("Code") or ""
    w["id"] = w.get("id") or w.get("Id") or ""
    w["webhookUrl"] = w.get("webhookUrl") or w.get("WebhookUrl") or ""
    return w


# --- TAB 6: WEBHOOKY & ROUTING ---
@app.get("/api/webhooks")
def get_webhooks(
    env: str = "Produkce",
    fetch_statuses: bool = True,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        webhooks = api_client.fetch_msggw_webhook_consumers(api_url, token, tenant_id)
        if webhooks:
            webhooks = api_client.fetch_all_msggw_webhook_details(api_url, token, tenant_id, webhooks)
            webhooks = [normalize_webhook_dict(w) for w in webhooks]

        statuses = {}
        if fetch_statuses and webhooks:
            statuses = api_client.fetch_all_msggw_webhook_statuses(api_url, token, tenant_id, webhooks)
        return {"items": webhooks, "statuses": statuses}
    except Exception as e:
        logger.error(f"Error fetching webhooks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/webhooks/detail")
def get_webhook_detail(
    code: Optional[str] = None,
    consumer_id: Optional[str] = None,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        detail = api_client.fetch_msggw_webhook_consumer_smart(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            code=code,
            consumer_id=consumer_id,
        )
        return {"detail": normalize_webhook_dict(detail)}
    except Exception as e:
        logger.error(f"Error fetching webhook detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/webhooks/status")
def get_webhook_status(
    code: Optional[str] = None,
    consumer_id: Optional[str] = None,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        stat, log_info = api_client.fetch_msggw_webhook_consumer_status_smart(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            code=code,
            consumer_id=consumer_id,
        )
        return {"status": stat, "log": log_info}
    except Exception as e:
        logger.error(f"Error fetching webhook status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/webhooks/routing")
def get_webhook_routing(
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        msg_types = api_client.fetch_msggw_message_types(api_url, token, tenant_id)
        routings = api_client.fetch_msggw_message_routings(api_url, token, tenant_id)
        return {"message_types": msg_types, "routings": routings}
    except Exception as e:
        logger.error(f"Error fetching routing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- TAB 7: STATISTIKA TENANTŮ & USAGE ---
@app.get("/api/usage-statistics/applications")
def get_integrated_applications(
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        data = api_client.fetch_integrated_applications(api_url, token, tenant_id)
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        return {"items": items}
    except Exception as e:
        logger.error(f"Error fetching integrated applications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/usage-statistics/tenants-using-application")
def get_tenants_using_application(
    env: str = "Produkce",
    application_code: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    try:
        data = api_client.fetch_usage_statistics(api_url, token, tenant_id, application_code)
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        return {"items": items}
    except Exception as e:
        logger.error(f"Error fetching usage statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class UsedAppsRequest(BaseModel):
    tenant_ids: Optional[List[str]] = None
    include_smart_check_status: bool = True
    env: str = "Produkce"


@app.post("/api/usage-statistics/applications-used-by-tenants")
def get_applications_used_by_tenants(
    req: UsedAppsRequest,
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    token, tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(req.env)

    try:
        data = api_client.fetch_applications_used_by_tenants(
            api_url=api_url,
            token=token,
            tenant_id=tenant_id,
            tenant_ids=req.tenant_ids,
            include_smart_check_status=req.include_smart_check_status,
        )
        items = data.get("items", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        return {"items": items}
    except Exception as e:
        logger.error(f"Error fetching apps used by tenants: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/smartcheck/report")
def get_smartcheck_report(
    result_id: str,
    tenant_id: Optional[str] = None,
    owner_org_code: Optional[str] = None,
    group_code: Optional[str] = None,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    master_token, master_tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    target_tenant_id = tenant_id.strip() if tenant_id and tenant_id.strip() else master_tenant_id
    effective_token = master_token
    imp_log = ""

    if target_tenant_id != master_tenant_id:
        try:
            claims = api_client.parse_jwt_token(master_token) or {}
            client_id = claims.get("client_id")
            child_token, log = api_client.fetch_impersonation_token(
                api_url=api_url,
                master_token=master_token,
                target_tenant_id=target_tenant_id,
                target_org_code=owner_org_code,
                client_id=client_id,
            )
            if child_token:
                effective_token = child_token
                imp_log = log or "Impersonace úspěšná"
        except Exception as imp_err:
            logger.warning(f"Impersonation for smartcheck report failed ({imp_err}), trying with master token")
            imp_log = f"Impersonace selhala: {imp_err}"

    try:
        content, content_type = api_client.fetch_smartcheck_report(
            api_url=api_url,
            token=effective_token,
            tenant_id=target_tenant_id,
            result_id=result_id,
            group_code=group_code,
        )
        return Response(content=content, media_type=content_type)
    except Exception as e:
        logger.error(f"Error fetching smart check report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/smartcheck/details")
def get_smartcheck_details(
    result_id: str,
    tenant_id: Optional[str] = None,
    owner_org_code: Optional[str] = None,
    env: str = "Produkce",
    authorization: Optional[str] = Header(None),
    x_tenant: Optional[str] = Header(None),
):
    master_token, master_tenant_id = extract_token_and_tenant(authorization, x_tenant)
    _, api_url = get_environment_urls(env)

    target_tenant_id = tenant_id.strip() if tenant_id and tenant_id.strip() else master_tenant_id
    effective_token = master_token
    imp_log = ""

    if target_tenant_id != master_tenant_id:
        try:
            claims = api_client.parse_jwt_token(master_token) or {}
            client_id = claims.get("client_id")
            child_token, log = api_client.fetch_impersonation_token(
                api_url=api_url,
                master_token=master_token,
                target_tenant_id=target_tenant_id,
                target_org_code=owner_org_code,
                client_id=client_id,
            )
            if child_token:
                effective_token = child_token
                imp_log = log or "Impersonace úspěšná"
        except Exception as imp_err:
            logger.warning(f"Impersonation for smartcheck details failed ({imp_err}), trying with master token")
            imp_log = f"Impersonace selhala: {imp_err}"

    # 1. Zkusíme načíst podrobný strukturovaný JSON detail
    details = None
    try:
        details = api_client.fetch_smartcheck_result_details(
            api_url=api_url,
            token=effective_token,
            tenant_id=target_tenant_id,
            result_id=result_id,
        )
    except Exception as e_det:
        logger.info(f"fetch_smartcheck_result_details returned error ({e_det}), synthesizing from adhocReport...")
        # 2. Záložní větev: Pokud JSON endpoint selže nebo je u child tenanta expirovaný,
        # načteme a rozparsujeme adhocReport (stejně jako to dělal Streamlit)
        try:
            content, _ = api_client.fetch_smartcheck_report(
                api_url=api_url,
                token=effective_token,
                tenant_id=target_tenant_id,
                result_id=result_id,
            )
            report_text = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else str(content)
            parsed_sections = ui_helpers.parse_smartcheck_report(report_text)
            
            child_results = []
            for sec_name, issues in parsed_sections.items():
                is_unhealthy = any("unhealthy" in iss.lower() or "error" in iss.lower() for iss in issues)
                is_degraded = any("degraded" in iss.lower() or "warning" in iss.lower() for iss in issues)
                st_val = "Unhealthy" if is_unhealthy else ("Degraded" if is_degraded else "Healthy")
                child_results.append({
                    "id": f"parsed-{len(child_results)}",
                    "code": sec_name,
                    "status": st_val,
                    "description": "\n".join(issues) if issues else "Bez zjištěných chyb",
                })
            
            has_unhealthy = any(r["status"] == "Unhealthy" for r in child_results)
            has_degraded = any(r["status"] == "Degraded" for r in child_results)
            root_status = "Unhealthy" if has_unhealthy else ("Degraded" if has_degraded else "Healthy")

            details = {
                "id": result_id,
                "status": root_status,
                "type": "AdhocReportParsed",
                "childResults": child_results,
            }
        except Exception as e_rep:
            logger.error(f"Both details and adhoc report failed: {e_rep}")
            raise HTTPException(status_code=500, detail=f"Načtení SmartCheck selhalo: {e_det}")

    return {"data": details, "impersonation_log": imp_log, "tenant_id": target_tenant_id}


# --- STATIC FILES SERVING (React SPA) ---
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    # Mount assets directly
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Catch-all route to serve index.html for SPA client-side routing
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    def index_placeholder():
        return {
            "message": "AVA Monitor API běží. Frontend zatím nebyl sestaven (spusťte npm run build v adresáři frontend).",
            "docs": "/docs",
            "health": "/health"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8501, reload=True)
