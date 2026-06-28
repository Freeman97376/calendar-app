PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS goals (
  goal_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestones (
  milestone_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_items (
  action_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  milestone_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS progress_logs (
  progress_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  goal_id TEXT,
  action_id TEXT,
  log_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE SET NULL,
  FOREIGN KEY (action_id) REFERENCES action_items(action_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tool_runs (
  tool_run_id TEXT PRIMARY KEY,
  project_id TEXT,
  goal_id TEXT,
  tool_name TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT '',
  input_summary TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_goal_id ON projects(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_action_items_project_id ON action_items(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_logs_project_id ON progress_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_tool_runs_project_id ON tool_runs(project_id);
