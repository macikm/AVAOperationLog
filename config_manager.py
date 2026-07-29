import hashlib
import base64
import json
from datetime import datetime, timedelta
import streamlit as st

import os

CONFIG_FILE = "avaplace_credentials.json"

DEFAULT_CREDS = {
    "auth_mode": "password",
    "tenant_id": "ASOLEU",
    "client_id": "",
    "client_secret": "",
    "username": "",
    "password": "",
    "sso_token": "",
    "scope": ""
}

STAGE_DEFAULT_CREDS = {
    "Produkce": {
        "auth_mode": "password",
        "tenant_id": "ASOLEU",
        "client_id": "",
        "client_secret": "",
        "username": "",
        "password": "",
        "sso_token": "",
        "scope": ""
    },
    "Alpha": {
        "auth_mode": "password",
        "tenant_id": "ASOLEU",
        "client_id": "",
        "client_secret": "",
        "username": "",
        "password": "",
        "sso_token": "",
        "scope": ""
    }
}

ENVIRONMENTS = {
    "Alpha": "alpha.avaplace.com",
    "Beta": "beta.avaplace.com",
    "Demo": "demo.avaplace.com",
    "Dev": "dev.avaplace.com",
    "Produkce": "avaplace.com"
}

def get_machine_key():
    """Vygeneruje stabilní šifrovací klíč pro uložení tajností v cookies prohlížeče."""
    return hashlib.sha256(b"avaplace_secret_key_salt").digest()

def encrypt_secret(secret):
    if not secret: 
        return ""
    key = get_machine_key()
    encoded = secret.encode('utf-8')
    encrypted = bytearray(b ^ key[i % len(key)] for i, b in enumerate(encoded))
    return "🔑_encrypted_" + base64.b64encode(encrypted).decode('utf-8')

def decrypt_secret(encrypted_text):
    if not encrypted_text or not encrypted_text.startswith("🔑_encrypted_"):
        return encrypted_text
    try:
        key = get_machine_key()
        raw_cipher = encrypted_text.replace("🔑_encrypted_", "")
        decoded = base64.b64decode(raw_cipher.encode('utf-8'))
        decrypted = bytearray(b ^ key[i % len(key)] for i, b in enumerate(decoded))
        return decrypted.decode('utf-8')
    except Exception:
        return ""

def load_config(cookie_manager):
    # Pokud už máme načteno v session state, vrátíme to (důležité pro dialogy, kde nelze cookies číst přímo)
    if 'loaded_config' in st.session_state and st.session_state['loaded_config']:
        return st.session_state['loaded_config']
        
    # Pokusíme se načíst konfiguraci z dříve načtených cookies na hlavní úrovni
    try:
        cookies = cookie_manager.get_all(key="cookie_manager_init")
        if cookies and "avaplace_config" in cookies:
            cookie_val = cookies["avaplace_config"]
            data = json.loads(cookie_val)
            for env in data:
                if env != "active_env" and isinstance(data[env], dict):
                    if "client_secret" in data[env]:
                        data[env]["client_secret"] = decrypt_secret(data[env]["client_secret"])
                    if "password" in data[env]:
                        data[env]["password"] = decrypt_secret(data[env]["password"])
            # Doplnění výchozích údajů pro jednotlivé stage, pokud chybí
            for env in ENVIRONMENTS:
                if env not in data:
                    data[env] = STAGE_DEFAULT_CREDS.get(env, DEFAULT_CREDS).copy()
            return data
    except Exception:
        pass
        
    res = {"active_env": "Produkce"}
    for env in ENVIRONMENTS:
        res[env] = STAGE_DEFAULT_CREDS.get(env, DEFAULT_CREDS).copy()
    return res

def save_config(cookie_manager, config_data):
    try:
        export_data = json.loads(json.dumps(config_data))
        for env in export_data:
            if env != "active_env" and isinstance(export_data[env], dict):
                if "client_secret" in export_data[env]:
                    export_data[env]["client_secret"] = encrypt_secret(export_data[env]["client_secret"])
                if "password" in export_data[env]:
                    export_data[env]["password"] = encrypt_secret(export_data[env]["password"])
                
        # Uložíme výhradně do cookies prohlížeče na 30 dní
        cookie_manager.set(
            "avaplace_config", 
            json.dumps(export_data), 
            expires_at=datetime.now() + timedelta(days=30),
            key="save_config_cookie"
        )
    except Exception as e:
        st.sidebar.error(f"Nepodařilo se uložit konfiguraci: {e}")
