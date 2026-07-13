import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../GameContext';
import { Confetti } from '../components/Confetti';
import { headlineFor, pickAnalysis } from '../copy';
import { drawShareCard } from '../shareCard';
import { submitLeaderboardEntry } from '../api';

export function Result() {
  const navigate = useNavigate();
  const { result, draft, allPlayersById, startSession } = useGame();
  const [retrying, setRetrying] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'ready' | 'sharing'>('idle');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [leaderboardName, setLeaderboardName] = useState('');
  const [leaderboardState, setLeaderboardState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');

  useEffect(() => {
    if (!draft) navigate('/', { replace: true });
    else if (!result) navigate('/build', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!result) {
    return (
      <div className="page">
        <div className="loading-block">Loading result…</div>
      </div>
    );
  }

  const { finalScore, finalWickets, ballsBowled, reason, batsmen, bestPerformer } = result;
  const won = reason === 'win';
  const oversLabel = `${Math.floor(ballsBowled / 6)}.${ballsBowled % 6}`;
  const headline = headlineFor(reason, finalScore, finalWickets, ballsBowled);
  const analysis = pickAnalysis(reason, result.resultToken);

  const onTryAgain = async () => {
    setRetrying(true);
    const ok = await startSession();
    setRetrying(false);
    if (ok) navigate('/build');
  };

  const onShare = async () => {
    setShareState('sharing');
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    drawShareCard(canvas, { headline, finalScore, finalWickets, oversLabel, bestPerformer, won });
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setShareState('idle');
        return;
      }
      const file = new File([blob], 'ipl-300-result.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'IPL-300 Result', text: headline });
          setShareState('idle');
          return;
        } catch {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ipl-300-result.png';
      a.click();
      URL.revokeObjectURL(url);
      setShareState('ready');
      setTimeout(() => setShareState('idle'), 2000);
    }, 'image/png');
  };

  const onSubmitLeaderboard = async () => {
    if (!draft || !leaderboardName.trim()) return;
    setLeaderboardState('submitting');
    try {
      await submitLeaderboardEntry(leaderboardName.trim(), draft.poolIds, result);
      setLeaderboardState('submitted');
    } catch {
      setLeaderboardState('error');
    }
  };

  const rows = batsmen.map((b, i) => {
    const entry = allPlayersById.get(b.playerId);
    const status = b.out ? 'out' : b.balls > 0 ? 'not out' : 'did not bat';
    return { pos: i + 1, name: b.name, runs: b.runs, balls: b.balls, status, teamLabel: entry ? `${entry.franchise} ${entry.season}` : '' };
  });

  return (
    <div className="page result-page">
      {won && <Confetti />}
      <div className="section-label">Result</div>
      <div className={won ? 'result-headline won' : 'result-headline'}>{headline}</div>

      <div className="result-scoreboard-wrap">
        <div className={won ? 'result-scoreboard won' : 'result-scoreboard'}>
          <span>{finalScore}</span>
          <span className="scoreboard-slash">/</span>
          <span>{finalWickets}</span>
        </div>
        <div className="result-overs-caption">in {oversLabel} overs · target 301</div>
      </div>

      <div className="analysis-box">{analysis}</div>

      {bestPerformer && (
        <div className="best-performer-box">
          <div className="best-performer-label">Best Performer</div>
          <div className="best-performer-name">{bestPerformer.name}</div>
          <div className="best-performer-line">
            {bestPerformer.runs} off {bestPerformer.balls} balls
          </div>
        </div>
      )}

      {won && leaderboardState !== 'submitted' && (
        <div className="leaderboard-entry-box">
          <div className="leaderboard-entry-label">Made the chase — put your name on the board</div>
          <div className="leaderboard-entry-row">
            <input
              className="leaderboard-name-input"
              type="text"
              placeholder="Your name"
              maxLength={24}
              value={leaderboardName}
              onChange={(e) => setLeaderboardName(e.target.value)}
              disabled={leaderboardState === 'submitting'}
            />
            <button
              className="btn-primary"
              onClick={onSubmitLeaderboard}
              disabled={leaderboardState === 'submitting' || !leaderboardName.trim()}
            >
              {leaderboardState === 'submitting' ? 'Submitting…' : 'Submit Score'}
            </button>
          </div>
          {leaderboardState === 'error' && <div className="home-error">Couldn't submit your score. Try again.</div>}
        </div>
      )}

      {won && leaderboardState === 'submitted' && (
        <div className="leaderboard-entry-box submitted">
          <div className="leaderboard-entry-label">You're on the board.</div>
          <Link to="/leaderboard" className="btn-secondary leaderboard-view-link">
            View Leaderboard
          </Link>
        </div>
      )}

      <div className="section-label scorecard-heading">Scorecard</div>
      <div className="scorecard-table">
        <div className="scorecard-header-row">
          <div className="sc-col-pos">#</div>
          <div className="sc-col-name">Batter</div>
          <div className="sc-col-num">R</div>
          <div className="sc-col-num">B</div>
        </div>
        {rows.map((row) => (
          <div className="scorecard-row" key={row.pos}>
            <div className="sc-col-pos">{row.pos}</div>
            <div className="sc-col-name">
              <div className="sc-name">{row.name}</div>
              <div className="sc-status">{row.status}</div>
            </div>
            <div className="sc-col-num sc-runs">{row.runs}</div>
            <div className="sc-col-num sc-balls">{row.balls}</div>
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="btn-primary" onClick={onTryAgain} disabled={retrying}>
          {retrying ? 'Loading…' : 'Try Again'}
        </button>
        <button className="btn-secondary" onClick={onShare} disabled={shareState === 'sharing'}>
          {shareState === 'ready' ? 'Saved ✓' : shareState === 'sharing' ? 'Preparing…' : 'Share Result'}
        </button>
      </div>

      <div className="footer-credit">
        <span>Developed by Srikanth · </span>
        <a href="https://linkedin.com" target="_blank" rel="noopener">
          LinkedIn
        </a>
        <span> · </span>
        <a href="https://github.com" target="_blank" rel="noopener">
          GitHub
        </a>
      </div>
    </div>
  );
}
