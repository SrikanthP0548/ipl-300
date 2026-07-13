import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLeaderboard } from '../api';
import type { LeaderboardEntry, LeaderboardRange } from '../types';

const TABS: { key: LeaderboardRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'alltime', label: 'All-Time' },
];

function oversLabel(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function Leaderboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<LeaderboardRange>('alltime');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    fetchLeaderboard(range)
      .then((res) => {
        if (!cancelled) setEntries(res.entries);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed to load leaderboard');
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="page leaderboard-page">
      <div className="section-label">Leaderboard</div>
      <h1 className="wordmark small">
        Top <span className="wordmark-accent">Chases</span>
      </h1>

      <div className="leaderboard-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={range === t.key ? 'leaderboard-tab active' : 'leaderboard-tab'}
            onClick={() => setRange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="home-error">Couldn't load the leaderboard. Try again.</div>}

      {!error && entries === null && <div className="loading-block">Loading…</div>}

      {!error && entries !== null && entries.length === 0 && (
        <div className="leaderboard-empty">No successful chases {range === 'alltime' ? 'yet' : 'in this window'} — be the first.</div>
      )}

      {!error && entries !== null && entries.length > 0 && (
        <div className="leaderboard-table">
          <div className="leaderboard-header-row">
            <div className="lb-col-rank">#</div>
            <div className="lb-col-name">Name</div>
            <div className="lb-col-num">Score</div>
            <div className="lb-col-num">Overs</div>
          </div>
          {entries.map((e, i) => (
            <div className="leaderboard-row" key={`${e.name}-${e.createdAt}-${i}`}>
              <div className="lb-col-rank">{i + 1}</div>
              <div className="lb-col-name">{e.name}</div>
              <div className="lb-col-num lb-score">
                {e.score}/{e.wickets}
              </div>
              <div className="lb-col-num lb-overs">{oversLabel(e.balls)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="result-actions">
        <button className="btn-secondary" onClick={() => navigate('/')}>
          Back Home
        </button>
      </div>
    </div>
  );
}
