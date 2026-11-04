#!/data/data/com.termux/files/usr/bin/sh
# перезапуск API на Самсунге; лог — api/server.log
cd "$(dirname "$0")" || exit 1
pkill -f "node server.js"
sleep 1
setsid nohup node server.js > server.log 2>&1 < /dev/null &
sleep 3
pgrep -f "node server.js" > /dev/null && echo "API запущен" || { echo "API не стартовал:"; tail -20 server.log; exit 1; }
