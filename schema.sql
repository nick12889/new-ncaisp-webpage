-- Reference only: the Worker creates this table automatically on first use.
CREATE TABLE IF NOT EXISTS lead_submissions (
  session_id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, company TEXT,
  summary TEXT, unanswered TEXT, transcript TEXT,
  email_status TEXT, crm_status TEXT, created_at TEXT
);
