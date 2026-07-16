import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGame } from '../GameContext';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../useMediaQuery';

const RULES = [
  { n: 1, title: 'Real squads', desc: "You're handed 15 randomly-drawn real historical IPL team-seasons to draft from." },
  { n: 2, title: 'One pick per team-season', desc: 'Draft exactly one player from each team-season you use — up to one skip allowed.' },
  { n: 3, title: 'Target: 301 off 120 balls', desc: 'One chase, twenty overs, no do-overs.' },
  { n: 4, title: 'Judged on three axes', desc: 'Batting, Finishing and Bowling scores decide how far you get.' },
];

export function Home() {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  return isDesktop ? <DesktopHome /> : <MobileHome />;
}

function DesktopHome() {
  const navigate = useNavigate();
  const { scoresVisible, toggleScores, startSession, status } = useGame();
  const [starting, setStarting] = useState(false);

  const onStart = async () => {
    setStarting(true);
    const ok = await startSession();
    setStarting(false);
    if (ok) navigate('/build');
  };

  return (
    <div className="home-desktop">
      <div className="home-hero">
        <div className="kicker">
          <span className="kicker-dot" />
          Season XI Challenge
        </div>

        <div className="home-hero-grid">
          <div className="home-hero-left">
            <h1 className="wordmark">
              IPL<span className="wordmark-accent">-300</span>
            </h1>
            <p className="home-description">
              You're handed 15 random real historical IPL team-seasons. Draft an XI, one pick per team. Watch the
              chase unfold, ball by ball.
            </p>
          </div>

          <div className="home-hero-right">
            <div className="chip-cta">
              <span className="chip-cta-item chip-cta-gold">TARGET 301</span>
              <span className="chip-cta-divider" />
              <span className="chip-cta-item chip-cta-teal">120 BALLS</span>
            </div>

            <button className="btn-primary cta-pulse home-hero-cta" onClick={onStart} disabled={starting}>
              {starting ? 'LOADING…' : 'BUILD YOUR XI'}
              <span className="shimmer" />
            </button>

            {status === 'error' && <div className="home-error">Couldn't reach the game server. Try again.</div>}

            <div className="difficulty-block">
              <div className="section-label">Scores while drafting</div>
              <div className="difficulty-toggle">
                <button
                  className={scoresVisible ? 'toggle-btn active' : 'toggle-btn'}
                  onClick={() => scoresVisible || toggleScores()}
                >
                  Visible
                </button>
                <button
                  className={!scoresVisible ? 'toggle-btn active' : 'toggle-btn'}
                  onClick={() => !scoresVisible || toggleScores()}
                >
                  Hidden
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="home-how-panel">
          <div className="section-label">How it works</div>
          <div className="home-how-grid">
            {RULES.map((r) => (
              <div className="home-how-card" key={r.n}>
                <div className="rules-num">{r.n}</div>
                <div className="rules-title">{r.title}</div>
                <div className="rules-desc">{r.desc}</div>
              </div>
            ))}
          </div>
          <div className="home-footer-row">
            <div className="footer-note">v1 · local play only</div>
            <Link to="/leaderboard" className="footer-badge">
              Leaderboard
            </Link>
          </div>
        </div>
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

function MobileHome() {
  const navigate = useNavigate();
  const { scoresVisible, toggleScores, startSession, status } = useGame();
  const [rulesOpen, setRulesOpen] = useState(true);
  const [starting, setStarting] = useState(false);

  const onStart = async () => {
    setStarting(true);
    const ok = await startSession();
    setStarting(false);
    if (ok) navigate('/build');
  };

  return (
    <div className="page home-page">
      <div className="kicker">
        <span className="kicker-dot" />
        Season XI Challenge
      </div>

      <h1 className="wordmark">
        IPL<span className="wordmark-accent">-300</span>
      </h1>

      <p className="home-description">
        You're handed 15 random real historical IPL team-seasons. Draft an XI, one pick per team. Watch the chase
        unfold, ball by ball.
      </p>

      <div className="chip-cta">
        <span className="chip-cta-item chip-cta-gold">TARGET 301</span>
        <span className="chip-cta-divider" />
        <span className="chip-cta-item chip-cta-teal">120 BALLS</span>
      </div>

      <button className="btn-primary cta-pulse" onClick={onStart} disabled={starting}>
        {starting ? 'LOADING…' : 'BUILD YOUR XI'}
        <span className="shimmer" />
      </button>

      {status === 'error' && <div className="home-error">Couldn't reach the game server. Try again.</div>}

      <div className="difficulty-block">
        <div className="section-label">Scores while drafting</div>
        <div className="difficulty-toggle">
          <button className={scoresVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => scoresVisible || toggleScores()}>
            Visible
          </button>
          <button className={!scoresVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => !scoresVisible || toggleScores()}>
            Hidden
          </button>
        </div>
      </div>

      <div className="rules-accordion">
        <button className="rules-toggle" onClick={() => setRulesOpen((o) => !o)}>
          How it works
          <span className={rulesOpen ? 'chevron open' : 'chevron'}>▾</span>
        </button>
        <div className="rules-panel" style={{ maxHeight: rulesOpen ? 600 : 0 }}>
          {RULES.map((r) => (
            <div className="rules-row" key={r.n}>
              <div className="rules-num">{r.n}</div>
              <div>
                <div className="rules-title">{r.title}</div>
                <div className="rules-desc">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer" />

      <div className="home-footer-row">
        <div className="footer-note">v1 · local play only</div>
        <Link to="/leaderboard" className="footer-badge">
          Leaderboard
        </Link>
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
