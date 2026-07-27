#!/bin/bash
clear
set -e
echo "Updating AVA Monitor from Git..."
git fetch origin
git reset --hard origin/main
echo "Restarting container..."
docker compose up -d
echo "Update finished successfully!"
