# Life OS — контекст проекта

Личный «трекер всей жизни»: собираю данные о себе (GPS, еда, экранное время, здоровье…)
и смотрю любой день как реплей — карта + ползунок времени (идея как реплей матча в Dota).
Пользователь один — я (Ярослав).

## Как со мной работать
- Пиши по-русски, коротко и по делу, в стиле наставника: шаг за шагом, без воды.
- Задавай уточняющие вопросы, если не ясно, что именно нужно.
- Я учусь (в основном C++/бэкенд/системы), поэтому коротко объясняй «почему», а не только «что».
- Не сравнивай меня с веб-разработчиком и не своди советы к фронтенду.
- Перед опасными действиями (удаление данных, `DROP`, `rm -rf`, force push) — спрашивай.

## Архитектура
```
📱 iPhone: Overland (GPS в фоне) ──POST /overland──┐
                                                    ▼  (сеть Tailscale)
📦 Samsung Galaxy A24 (Termux): Node API + PostgreSQL   ← просто «склад» данных
                                                    ▲
💻 Ноут (EndeavourOS/Arch): web-приложение (React+Vite) ──GET /day──┘
```
- **Самсунг** только принимает, хранит и отдаёт данные. Приложение на нём НЕ хостим.
- **Приложение** живёт в репозитории и запускается на ноуте (`npm run dev`).
- Связь между устройствами — **Tailscale** (Wi-Fi там, где я живу, изолирует устройства друг от друга).

## Репозиторий
GitHub: `cargo9/lifeos` (private). Клон на ноуте: `~/lifeos`, на Самсунге: `~/lifeos`.
```
lifeos/
├── api/            сервер (запускается на Самсунге)
│   ├── server.js   Fastify + pg
│   └── .token      секретный токен API (НЕ в git)
├── web/            приложение (запускается на ноуте)
│   ├── vite.config.js   прокси /api → Самсунг, подставляет токен
│   ├── .env.local       LIFEOS_TOKEN=... (НЕ в git)
│   └── src/App.jsx      карта (react-leaflet) + ползунок + детектор остановок
└── backup.sh       ночной pg_dump (cron в 3:00), хранит 14 дней в ~/backups
```

## Самсунг (сервер)
- Доступ: `ssh samsung` (алиас в ~/.ssh/config → `u0_a22@100.119.158.113`, порт 8022)
- Tailscale IP: `100.119.158.113`, API на порту `3000` (HTTP)
- База: PostgreSQL, БД `lifeos`, данные в `$PREFIX/var/lib/postgresql`
- Таблица:
  ```sql
  locations(id BIGSERIAL PK, ts TIMESTAMPTZ NOT NULL UNIQUE, lat FLOAT8, lon FLOAT8, accuracy REAL, speed REAL)
  ```
  (уникальный индекс `locations_ts_uniq` на `ts` — защита от дублей)
- Автозапуск: Termux:Boot → `~/.termux/boot/start.sh` (wake-lock, sshd, postgres, crond, node server.js)
- Tailscale на Самсунге в режиме Always-on VPN. После перезагрузки телефон нужно один раз разблокировать
  и подождать 1–2 минуты, пока всё поднимется.

### API (`api/server.js`)
- Все запросы, кроме `/health`, требуют `Authorization: Bearer <token>` (или `?token=`)
- `GET /health` → `{ok, time}`
- `POST /overland` → принимает пачку точек Overland, пишет одним INSERT через `unnest`,
  `ON CONFLICT (ts) DO NOTHING`, отрицательные speed/accuracy → NULL. Отвечает `{result:"ok"}`
- `GET /day?date=YYYY-MM-DD` → точки за день (сутки по Europe/Berlin): `{date, points:[{ts,lat,lon,speed,accuracy}]}`
- В пуле pg имя пользователя берётся через `os.userInfo().username` (при автозапуске нет `$USER`)

### Полезные команды на Самсунге
```bash
pgrep -f "node server.js"                       # жив ли сервер
pg_ctl -D $PREFIX/var/lib/postgresql status     # жива ли база
tail -f ~/lifeos/api/server.log                 # логи
# перезапуск сервера после git pull:
pkill -f "node server.js"; cd ~/lifeos/api && nohup node server.js > server.log 2>&1 &
psql lifeos -c "SELECT count(*) FROM locations;"
```

## Процесс разработки
1. Правлю код на ноуте в `~/lifeos` → `git commit` → `git push`
2. Если менялся `api/`: `ssh samsung`, `cd ~/lifeos && git pull`, перезапуск сервера
3. Веб: `cd ~/lifeos/web && npm run dev` → http://localhost:5173

## Известные грабли
- Интернет на Самсунге слабый/нестабильный: SSH может лагать или рваться, `pkg` часто видит все зеркала как `bad`.
  Если не работает DNS — проверить настройку «Use Tailscale DNS» в приложении Tailscale на Самсунге.
- В Arch всегда `pacman -Syu`, никогда `-Sy` без `u`.
- Тайлы CARTO требуют ключ — используем `tile.openstreetmap.org` + CSS-фильтр invert для тёмной карты.
- GPS шумит в помещении. На фронте: `cleanPoints` (accuracy > 30 м и скорости > 180 км/ч выкидываем),
  `detectStops` (10+ мин в радиусе 60 м = остановка, сворачиваем в одну точку).
- Overland настроен: Desired Accuracy = Best, Activity = Fitness, мин. дистанция между точками ~10–20 м.

## Текущий статус (на 2026-11-04)
- ✅ Этап 0–1: сервер, база, приём GPS, токен, бэкапы, автозапуск, git
- 🔄 Этап 2: web-приложение — карта дня с ползунком работает; есть детектор остановок

## Роадмап (дальше)
1. Day Replay: кнопка Play (автопроигрывание), статы к моменту ползунка (км, время в движении),
   цвет маршрута по скорости (пешком / велик / транспорт)
2. Календарь-heatmap: в какие дни есть данные
3. Еда: фото → сжатие → AI оценивает калории → на таймлайн
4. Apple Health через iOS Shortcuts (шаги, сон, тренировки)
5. Экранное время: скриншот → AI раскладывает по приложениям
6. Фото дня: EXIF (время + GPS) → на карту и ползунок
7. Интеграции: Spotify, GitHub
8. Железо: ESP32 (кнопочный пульт, датчики комнаты, велотрекер с GPS)
9. Возможно: нативное iOS-приложение (фон, виджеты)

## Дизайн
Есть прототип экранов (тёмная тема, фиолетовый акцент `#A48BFF`, фон `#0E0E0F`, карточки `#1C1C1E`):
Today/Day Replay с ползунком и «инвентарём дня», Calendar heatmap, Food, Screen time.
Ползунок — свободный, НЕ магнитный (не люблю привязку к событиям).
