#!/bin/sh
# выкладка с ноута: забрать свежий код на Самсунге, обновить схему базы (безопасно, только IF NOT EXISTS) и перезапустить API
# (код должен быть уже запушен на GitHub). Адрес API берётся из web/.env.local (LIFEOS_API=http://<ip>:3000)
set -e
cd "$(dirname "$0")"
LIFEOS_API=$(grep '^LIFEOS_API=' web/.env.local | cut -d= -f2-)
ssh samsung 'cd ~/lifeos && git pull --ff-only && psql -q lifeos -f api/schema.sql && sh api/restart.sh'
curl -fsS -m 15 "$LIFEOS_API/health" && echo
