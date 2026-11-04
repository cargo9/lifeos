-- Схема базы Life OS. Безопасно запускать повторно (только IF NOT EXISTS, ничего не удаляет):
--   psql lifeos -f ~/lifeos/api/schema.sql

-- GPS-точки от Overland
CREATE TABLE IF NOT EXISTS locations (
  id       BIGSERIAL PRIMARY KEY,
  ts       TIMESTAMPTZ NOT NULL,
  lat      FLOAT8 NOT NULL,
  lon      FLOAT8 NOT NULL,
  accuracy REAL,
  speed    REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS locations_ts_uniq ON locations (ts);

-- Всё из Apple Health (и не только): «с start по end было value единиц типа type».
-- type: 'steps' (дальше: 'sleep', 'heart_rate', 'workout'…). Повторная отправка того же
-- интервала обновляет значение — iPhone досчитывает текущий час, и это нормально.
CREATE TABLE IF NOT EXISTS samples (
  type     TEXT NOT NULL,
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts   TIMESTAMPTZ NOT NULL,
  value    FLOAT8 NOT NULL,
  received TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (type, start_ts, end_ts)
);
CREATE INDEX IF NOT EXISTS samples_type_start ON samples (type, start_ts);
