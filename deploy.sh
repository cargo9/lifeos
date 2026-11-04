#!/bin/sh
# выкладка с ноута: забрать свежий код на Самсунге и перезапустить API
# (код должен быть уже запушен на GitHub)
set -e
ssh samsung 'cd ~/lifeos && git pull --ff-only && sh api/restart.sh'
curl -fsS -m 15 http://100.119.158.113:3000/health && echo
