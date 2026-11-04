#!/bin/sh
# выкладка с ноута: забрать свежий код на Самсунге, обновить схему базы (безопасно, только IF NOT EXISTS) и перезапустить API
# (код должен быть уже запушен на GitHub)
set -e
ssh samsung 'cd ~/lifeos && git pull --ff-only && psql -q lifeos -f api/schema.sql && sh api/restart.sh'
curl -fsS -m 15 http://100.119.158.113:3000/health && echo
