CREATE TABLE leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wickets INTEGER NOT NULL,
  balls INTEGER NOT NULL,
  result_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_leaderboard_created_at ON leaderboard(created_at);
CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC, balls ASC);
