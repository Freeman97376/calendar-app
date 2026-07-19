PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS event_types (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'both',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  event_type_id TEXT NOT NULL DEFAULT 'general',
  due_date TEXT,
  linked_event_id TEXT,
  long_project_json TEXT,
  eta_minutes INTEGER NOT NULL DEFAULT 30,
  energy_needed TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  description TEXT,
  display_details TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  event_type_id TEXT NOT NULL DEFAULT 'general',
  linked_todo_id TEXT,
  recurrence_rule_json TEXT,
  master_id TEXT,
  exception_for TEXT,
  exception_date TEXT,
  deleted_occurrences_json TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planning_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  summary TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_status_due ON todos(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_todos_user_type ON todos(user_id, event_type_id);
CREATE INDEX IF NOT EXISTS idx_todos_linked_event ON todos(linked_event_id);
CREATE INDEX IF NOT EXISTS idx_events_user_start_end ON events(user_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_events_user_type ON events(user_id, event_type_id);
CREATE INDEX IF NOT EXISTS idx_events_linked_todo ON events(linked_todo_id);
CREATE INDEX IF NOT EXISTS idx_event_types_user_archived ON event_types(user_id, is_archived);
