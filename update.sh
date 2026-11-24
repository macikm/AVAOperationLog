#!/bin/bash
# update.sh - Skript pro kontrolu nového kódu z Git repozitáře a automatickou aktualizaci Docker kontejneru

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Kontrola souboru .env
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️ Soubor .env neexistoval, vytvářím z .env.example..."
        cp .env.example .env
    fi
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔍 Kontroluji aktualizace z Git repozitáře..."

# Ověřit, zda je nastaven remote origin
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ Git remote 'origin' není nastaven."
    exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "HEAD" ] || [ -z "$BRANCH" ]; then
    BRANCH="main"
fi

git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Repozitář je aktuální ($BRANCH). Žádné nové změny."
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Zjištěna nová verze na Gitu ($BRANCH). Aktualizuji..."
    
    # Zjistit, zda došlo ke změně v závislostech nebo Dockerfile
    DEPS_CHANGED=0
    if git diff --name-only "$LOCAL" "$REMOTE" | grep -qE "^(requirements\.txt|Dockerfile|docker-compose\.yml)$"; then
        DEPS_CHANGED=1
    fi

    git pull origin "$BRANCH"

    if [ "$DEPS_CHANGED" -eq 1 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📦 Zjištěna změna v Dockerfile nebo requirements.txt. Rebuilduji image..."
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d --build
        else
            docker compose up -d --build
        fi
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚡ Změnil se pouze aplikační kód (namapován živě přes volume). Restartuji kontejner..."
        if command -v docker-compose &> /dev/null; then
            docker-compose restart
        else
            docker compose restart
        fi
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🎉 Aktualizace úspěšně dokončena!"
fi
