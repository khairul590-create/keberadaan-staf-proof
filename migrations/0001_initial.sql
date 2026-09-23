CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  status TEXT NOT NULL CHECK (status IN ('CUTI', 'MC', 'KURSUS', 'URUSAN_RASMI', 'KELUAR_SEMENTARA')),
  date TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('staff', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(staff_id, date)
);
CREATE INDEX IF NOT EXISTS exceptions_date_idx ON exceptions(date);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  record_id TEXT,
  before_json TEXT,
  after_json TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
