#!/data/data/com.termux/files/usr/bin/sh
# снимок базы раз в день, храним последние 14 дней
mkdir -p ~/backups
pg_dump -Fc lifeos > ~/backups/lifeos-$(date +%F).dump
find ~/backups -name 'lifeos-*.dump' -mtime +14 -delete
