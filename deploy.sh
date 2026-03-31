#!/bin/bash
set -e
cd ~/bots/property-bot
git pull
docker compose up -d --build
docker image prune -f
echo "Deployed successfully"
