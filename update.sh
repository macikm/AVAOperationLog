#!/bin/bash
clear
set -e
echo "Updating AVA Monitor from Git..."
git fetch origin
git reset --hard origin/main
docker compose up -d --build --force-recreate
echo "Update finished successfully!"
