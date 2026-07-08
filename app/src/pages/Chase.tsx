import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../GameContext';
import type { BallEvent, OutcomeKey } from '../types';

const TARGET = 301;
const SPEEDS = [1, 2, 4];

function ballLabel(outcome: OutcomeKey): string {
  if (outcome === 'W') return 'W';
  if (outcome === 0) return '•';
  return String(outcome);
}

function ballColorVar(outcome: OutcomeKey): string {
  if (outcome === 'W') return 'var(--red)';
  if (outcome === 6) return 'var(--gold)';
  if (outcome === 4) return 'var(--teal)';
  if (outcome === 0) return 'var(--text-disabled)';
  return 'var(--text-primary)';
}

function eventNote(b: BallEvent): string {
  if (b.milestone) {
    const isHundred = b.milestone === 100 || b.milestone === 200 || b.milestone === 300;
    return `${isHundred ? 'Century' : 'Fifty'} up for the team! (${b.milestone})`;
  }
  if (b.outcome === 'W') return `Wicket falls — ${b.wicketsAfter} down.`;
  if (b.outcome === 6) return 'Six! Into the stands.';
  if (b.outcome === 4) return 'Four — races to the boundary.';
  if (b.outcome === 0) return 'Dot ball.';
  return `${b.outcome} run${(b.outcome as number) > 1 ? 's' : ''} taken.`;
}

export function Chase() {
  const navigate = useNavigate();
  const { result, draft } = useGame();
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!draft) navigate('/', { replace: true });
    else if (!result) navigate('/build', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const balls = result?.balls ?? [];
  const isFinished = revealed >= balls.length;

  useEffect(() => {
    if (!playing || isFinished) return;
    const ball = balls[revealed];
    const dramatic = ball.outcome === 'W' || !!ball.milestone;
    const base = dramatic ? 1200 : 380;
    const delay = base / SPEEDS[speedIdx];
    timeoutRef.current = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [playing, revealed, isFinished, balls, speedIdx]);

  useEffect(() => {
    if (isFinished && balls.length > 0) {
      redirectRef.current = setTimeout(() => navigate('/result'), 1600);
      return () => {
        if (redirectRef.current) clearTimeout(redirectRef.current);
      };
    }
  }, [isFinished, balls.length, navigate]);

  if (!result) {
    return (
      <div className="page">
        <div className="loading-block">Loading result…</div>
      </div>
    );
  }

  const revealedBalls = balls.slice(0, revealed);
  const last = revealedBalls[revealedBalls.length - 1];
  const score = last ? last.scoreAfter : 0;
  const wickets = last ? last.wicketsAfter : 0;
  const ballsBowled = revealedBalls.length;
  const oversLabel = `${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`;
  const ballsRemaining = 120 - ballsBowled;
  const need = Math.max(0, TARGET - score);
  const crr = ballsBowled > 0 ? (score / ballsBowled) * 6 : 0;
  const rrr = ballsRemaining > 0 ? (need / ballsRemaining) * 6 : 0;
  const won = score >= TARGET;

  const events = revealedBalls
    .slice()
    .reverse()
    .slice(0, 40);

  return (
    <div className="page chase-page">
      <div className="chase-header">
        <div className="section-label">Chasing 301 · 20 Overs</div>
        <div className="chase-title">The Chase</div>
      </div>

      <div className="chase-layout">
        <div className="scoreboard-panel">
          <div className="scoreboard-row">
            <div className="scoreboard-tile">
              <span>{score}</span>
              <span className="scoreboard-slash">/</span>
              <span className="scoreboard-wkts">{wickets}</span>
            </div>
            <div className="overs-tile-wrap">
              <div className="overs-tile">{oversLabel}</div>
              <div className="overs-caption">overs</div>
            </div>
          </div>

          <div className="stat-trio">
            <div>
              <div className="stat-label">Need</div>
              <div className="stat-value accent-teal">{isFinished && won ? 'Won' : `${need} off ${ballsRemaining}`}</div>
            </div>
            <div>
              <div className="stat-label">CRR</div>
              <div className="stat-value">{crr.toFixed(2)}</div>
            </div>
            <div>
              <div className="stat-label">RRR</div>
              <div className="stat-value accent-red">{ballsRemaining > 0 ? rrr.toFixed(2) : '—'}</div>
            </div>
          </div>

          <div className="progress-meter">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, (score / TARGET) * 100)}%` }} />
            </div>
            <div className="progress-labels">
              <span>0</span>
              <span>Target 301</span>
            </div>
          </div>

          <div className="current-ball-row">
            <div
              key={revealed}
              className={`current-ball-indicator${last?.outcome === 'W' ? ' shake' : ''}${last?.milestone ? ' flash' : ''}`}
              style={{ color: last ? ballColorVar(last.outcome) : 'var(--text-faint)' }}
            >
              {last ? ballLabel(last.outcome) : '—'}
            </div>
            <div className="current-ball-caption">
              {!last ? 'Ready to begin the chase.' : isFinished ? 'Innings complete.' : `Ball ${last.ballNum} of 120`}
            </div>
          </div>
        </div>

        <div className="ticker-panel">
          <div className="ticker-heading">Ball By Ball</div>
          <div className="event-ticker">
            {events.map((ev) => {
              const isWicket = ev.outcome === 'W';
              const isSix = ev.outcome === 6;
              const isFour = ev.outcome === 4;
              const cls = ev.milestone
                ? 'event-badge milestone'
                : isWicket
                  ? 'event-badge wicket'
                  : isSix
                    ? 'event-badge six'
                    : isFour
                      ? 'event-badge four'
                      : 'event-badge';
              return (
                <div className="event-row" key={ev.ballNum}>
                  <div className="event-overball">
                    {ev.over}.{ev.ballInOver}
                  </div>
                  <div className={cls}>{ballLabel(ev.outcome)}</div>
                  <div className="event-note">{eventNote(ev)}</div>
                </div>
              );
            })}
          </div>

          <div className="chase-controls">
            <button className="btn-primary chase-control-btn" onClick={() => setPlaying((p) => !p)} disabled={isFinished}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button className="btn-secondary chase-speed-btn" onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}>
              {SPEEDS[speedIdx]}×
            </button>
            <button className="btn-secondary chase-control-btn" onClick={() => setRevealed(balls.length)} disabled={isFinished}>
              Skip to End
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
