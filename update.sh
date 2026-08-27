#!/bin/bash
clear
set -e
echo "Updating AVA Monitor from Git..."
git fetch origin
git reset --hard origin/main
echo "Restarting container..."
docker compose restart
echo "Update finished successfully!"
