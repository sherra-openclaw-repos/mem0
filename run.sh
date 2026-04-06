#!/bin/bash
# mem0 extraction runner — called by systemd timer
set -e
cd /home/openclaw/.openclaw-sherra/projects/mem0

source /home/openclaw/.openclaw-sherra/secrets.sh

exec /home/openclaw/.nvm/versions/node/v24.14.0/bin/node --import=tsx/esm src/processor.ts >> /tmp/mem0-sherra.log 2>&1
