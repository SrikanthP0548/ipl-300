import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../GameContext';
import { useTheme } from '../ThemeContext';
import { RoleBadge } from '../components/RoleBadge';
import { ScoreReadout } from '../components/ScoreReadout';
import { KeeperIcon, OverseasIcon } from '../components/PlayerIcons';
import { isLineupComplete, MAX_OVERSEAS, validSlotsForPlayer } from '../draft';
import type { Player, TeamSeason } from '../types';

const DESKTOP_BREAKPOINT = '(min-width: 900px)';

/** Style for the OS/WK count chips: teal while within the real-XI limit,
 * red once it's been exceeded (overseas) or is still unmet (keeper). */
function limitChipStyle(ok: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 9px',
    borderRadius: 7,
    fontFamily: 'var(--font-display)',
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: '0.3px',
    color: ok ? 'var(--teal)' : '#FF6B6B',
    background: ok ? 'rgba(34,211,198,0.1)' : 'rgba(255,77,77,0.12)',
    border: '1px solid ' + (ok ? 'rgba(34,211,198,0.35)' : 'rgba(255,77,77,0.4)'),
  };
}

// Accelerating-then-settling delay sequence for the "rolling the dice"
// team-reveal effect — mirrors a slot machine winding down.
const SPIN_DELAYS = [40, 45, 55, 65, 80, 95, 115, 140, 170, 205, 250, 310, 380];

// Each franchise's real-world brand color (sourced from official kits/logos),
// used as the accent for that team-season's player card border/header.
const FRANCHISE_COLORS: Record<string, string> = {
  'Chennai Super Kings': '#F9CD05',
  'Deccan Chargers': '#5B85C4',
  'Delhi Capitals': '#2561AE',
  'Gujarat Lions': '#A31D21',
  'Gujarat Titans': '#D4AF37',
  'Kochi Tuskers Kerala': '#8E44AD',
  'Kolkata Knight Riders': '#6B3FA0',
  'Lucknow Super Giants': '#F28B00',
  'Mumbai Indians': '#1C64D1',
  'Pune Warriors': '#EA4C2D',
  'Punjab Kings': '#C8102E',
  'Rajasthan Royals': '#E4007C',
  'Rising Pune Supergiant': '#D11D9B',
  'Royal Challengers Bengaluru': '#EC1C24',
  'Sunrisers Hyderabad': '#EE7429',
};
const DEFAULT_TEAM_COLOR = '#5B7FFF';

/** Several franchise colors (CSK yellow, GT gold, ...) read fine against the
 * dark background but wash out to near-invisible against the light theme's
 * near-white panels - darken any color whose luminance is too high before
 * using it as a light-theme accent. */
function readableOnLight(hex: string): string {
  const c = hex.replace('#', '');
  let r = parseInt(c.substring(0, 2), 16);
  let g = parseInt(c.substring(2, 4), 16);
  let b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum <= 0.55) return hex;
  const f = 0.55;
  r = Math.round(r * f);
  g = Math.round(g * f);
  b = Math.round(b * f);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function teamColor(franchise: string | undefined, isLight: boolean): string {
  const base = (franchise && FRANCHISE_COLORS[franchise]) || DEFAULT_TEAM_COLOR;
  return isLight ? readableOnLight(base) : base;
}

/** Purely cosmetic: flickers through team names before landing on the real
 * next team-season, so a new reveal always feels like a spin rather than
 * an instant swap. Doesn't affect which team is actually shown next —
 * that's already decided by draft.teamPointer. */
function useTeamSpin(pool: TeamSeason[] | undefined, targetIndex: number | null) {
  const [spinning, setSpinning] = useState(true);
  const [spinIdx, setSpinIdx] = useState(targetIndex ?? 0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pool || pool.length === 0 || targetIndex == null) return;

    let step = 0;
    let idx = spinIdx;
    setSpinning(true);

    const tick = () => {
      if (step < SPIN_DELAYS.length) {
        idx = (idx + 1) % pool.length;
        setSpinIdx(idx);
        timeoutRef.current = setTimeout(tick, SPIN_DELAYS[step]);
        step++;
      } else {
        setSpinIdx(targetIndex);
        timeoutRef.current = setTimeout(() => setSpinning(false), 320);
      }
    };
    timeoutRef.current = setTimeout(tick, SPIN_DELAYS[0]);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, targetIndex]);

  return { spinning, spinTeam: pool && pool.length > 0 ? pool[spinIdx % pool.length] : null };
}

/** Tracks a media query so the page can switch between the mobile single-column
 * layout and the desktop two-pane layout — these differ structurally (a vertical
 * slot list with a detail overlay vs. horizontal slot chips, a wide player card
 * vs. a stacked one), not just by CSS reflow, so this picks which JSX tree renders. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function BuildXI() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isLightTheme = theme === 'light';
  const {
    draft,
    status,
    scoresVisible,
    advanceIfDead,
    pickPlayer,
    skipCurrentTeam,
    canSkipCurrentTeam,
    currentTeam,
    allPlayersById,
    submitCurrentLineup,
    submitting,
    result,
    error,
  } = useGame();

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [detailSlot, setDetailSlot] = useState<number | null>(null);
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  useEffect(() => {
    if (status === 'idle') navigate('/', { replace: true });
  }, [status, navigate]);

  useEffect(() => {
    advanceIfDead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.teamPointer, draft?.arrangement]);

  useEffect(() => {
    if (result) navigate('/chase');
  }, [result, navigate]);

  const assignedPlayers = draft
    ? Object.values(draft.arrangement)
        .map((id) => allPlayersById.get(id)?.player)
        .filter((p): p is Player => !!p)
    : [];
  const complete = draft ? isLineupComplete(draft.arrangement) : false;
  const { spinning, spinTeam } = useTeamSpin(draft?.pool, complete ? null : (draft?.teamPointer ?? null));

  if (!draft) {
    return (
      <div className="page">
        <div className="loading-block">Loading squads…</div>
      </div>
    );
  }

  const filledCount = Object.keys(draft.arrangement).length;
  // The keeper rule stands down for the last remaining team-season - see
  // isLastTeam in draft.ts for why (a fixed roster's ranges may not cover
  // the one remaining slot with a keeper, and there's nowhere left to turn).
  const isLastTeam = draft.pool.filter((t) => !draft.resolvedTeamIds.has(t.id)).length === 1;

  const overseasCount = assignedPlayers.filter((p) => p.isOverseas).length;
  const keeperCount = assignedPlayers.filter((p) => p.isKeeper).length;
  const overseasOk = overseasCount <= MAX_OVERSEAS;
  const keeperOk = keeperCount >= 1;

  const slots = Array.from({ length: 11 }, (_, i) => {
    const n = i + 1;
    const playerId = draft.arrangement[n];
    const occupant = playerId ? allPlayersById.get(playerId) : undefined;
    return { n, occupant };
  });

  const onSubmit = async () => {
    await submitCurrentLineup();
  };

  const accent = teamColor(draft.pool[draft.teamPointer]?.franchise, isLightTheme);

  const limitChips = (
    <>
      <div style={limitChipStyle(overseasOk)}>
        <OverseasIcon color={overseasOk ? 'var(--teal)' : '#FF6B6B'} size={13} />
        <span>{overseasCount}/{MAX_OVERSEAS}</span>
      </div>
      <div style={limitChipStyle(keeperOk)}>
        <KeeperIcon color={keeperOk ? 'var(--teal)' : '#FF6B6B'} size={13} />
        <span>{keeperCount}/1</span>
      </div>
    </>
  );

  const spinBlock = !complete && spinning && (
    <div className="spin-block">
      <div className="spin-label">Finding next team…</div>
      <div className="spin-team-name">{spinTeam ? `${spinTeam.franchise} · ${spinTeam.season}` : ''}</div>
      <div className="spin-dots">
        <span className="spin-dot gold" />
        <span className="spin-dot teal" />
        <span className="spin-dot red" />
      </div>
    </div>
  );

  const teamHeader = !complete && !spinning && currentTeam && (
    <div className="team-header" style={{ ['--card-accent' as string]: accent }}>
      <div className="team-banner">
        <div className="team-banner-name">
          {currentTeam.franchise} · {currentTeam.season}
        </div>
        <button className="skip-btn" onClick={skipCurrentTeam} disabled={!canSkipCurrentTeam}>
          {canSkipCurrentTeam ? 'Skip Team →' : 'Skip Used'}
        </button>
      </div>
      <div className="team-banner-hint">
        {isDesktop ? 'Click a player to slot them in automatically, or skip this team.' : 'Tap a player to choose their position, or skip this team.'}
      </div>
    </div>
  );

  const completeBlock = complete && (
    <div className="lineup-complete-block">
      <div className="lineup-complete-title">XI Complete</div>
      <div className="lineup-complete-desc">
        All 11 slots are filled. Review your order {isDesktop ? 'on the left' : 'in the strip above'}, then submit your lineup.
      </div>
    </div>
  );

  const submitBar = (
    <div className="submit-bar">
      <button className="btn-primary submit-button" onClick={onSubmit} disabled={!complete || submitting}>
        {submitting ? 'Simulating…' : complete ? 'Submit Lineup' : `Place All 11 (${filledCount}/11)`}
      </button>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="page buildxi-page-desktop">
        <div className="desktop-topbar">
          <div className="desktop-topbar-title">
            IPL<span className="wordmark-accent">-300</span>
            <span className="desktop-topbar-subtitle">Build Your XI</span>
          </div>
        </div>

        <div className="desktop-body">
          <div className="desktop-rail">
            <div className="desktop-rail-header">
              <div className="section-label">
                Selected Team XI <span className="accent-teal">{filledCount}/11</span>
              </div>
              <div className="header-chip-row">{limitChips}</div>
            </div>

            <div className="desktop-slot-list">
              {slots.map(({ n, occupant }) => (
                <div
                  key={n}
                  className={detailSlot === n && occupant ? 'desktop-slot-row selected' : 'desktop-slot-row'}
                  onClick={() => occupant && setDetailSlot((s) => (s === n ? null : n))}
                >
                  <span className="desktop-slot-n">{n}</span>
                  <span
                    className="desktop-slot-dot"
                    style={
                      occupant
                        ? {
                            background: teamColor(occupant.franchise, isLightTheme),
                            boxShadow: `0 0 8px ${teamColor(occupant.franchise, isLightTheme)}`,
                          }
                        : undefined
                    }
                  />
                  <span className={occupant ? 'desktop-slot-name filled' : 'desktop-slot-name'}>
                    {occupant ? occupant.player.name : 'Empty'}
                  </span>
                </div>
              ))}
            </div>

            {error && <div className="home-error">{error}</div>}

            {detailSlot != null && slots[detailSlot - 1]?.occupant && (
              <>
                <div className="detail-scrim" onClick={() => setDetailSlot(null)} />
                <PlayerDetailCard
                  entry={slots[detailSlot - 1].occupant!}
                  scoresVisible={scoresVisible}
                  onClose={() => setDetailSlot(null)}
                  className="desktop-detail-popup"
                />
              </>
            )}
          </div>

          <div className="desktop-draft-area">
            {spinBlock}
            {teamHeader}

            {!complete && !spinning && currentTeam && (
              <div className="desktop-player-list">
                {currentTeam.players.map((p) => (
                  <DesktopPlayerCard
                    key={p.id}
                    player={p}
                    accent={accent}
                    arrangement={draft.arrangement}
                    assignedPlayers={assignedPlayers}
                    isLastTeam={isLastTeam}
                    scoresVisible={scoresVisible}
                    expanded={expandedPlayerId === p.id}
                    onToggle={() => setExpandedPlayerId((id) => (id === p.id ? null : p.id))}
                    onPick={(slot) => {
                      pickPlayer(currentTeam.id, p, slot);
                      setExpandedPlayerId(null);
                    }}
                  />
                ))}
              </div>
            )}

            {completeBlock}
            {submitBar}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page buildxi-page">
      <div className="buildxi-header">
        <div className="wordmark small">
          IPL<span className="wordmark-accent">-300</span>
        </div>
        <div className="buildxi-header-row">
          <div className="section-label">
            Selected Team XI <span className="accent-teal">{filledCount}/11</span>
          </div>
          <div className="header-chip-row">{limitChips}</div>
        </div>
      </div>

      <div className="slot-strip">
        {slots.map(({ n, occupant }) => (
          <button
            key={n}
            className={occupant ? (detailSlot === n ? 'slot-chip filled selected' : 'slot-chip filled') : 'slot-chip empty'}
            onClick={() => occupant && setDetailSlot((s) => (s === n ? null : n))}
          >
            <span className="slot-n">{n}</span>
            <span className="slot-label">{occupant ? occupant.player.name.split(' ').slice(-1)[0].slice(0, 7) : '+'}</span>
          </button>
        ))}
      </div>

      {detailSlot != null && slots[detailSlot - 1]?.occupant && (
        <PlayerDetailCard entry={slots[detailSlot - 1].occupant!} scoresVisible={scoresVisible} onClose={() => setDetailSlot(null)} />
      )}

      {error && <div className="home-error">{error}</div>}

      {spinBlock}
      {teamHeader}

      {!complete && !spinning && currentTeam && (
        <div className="player-list" style={{ ['--card-accent' as string]: accent }}>
          {currentTeam.players.map((p) => {
            const validSlots = validSlotsForPlayer(p, draft.arrangement, { assignedPlayers, isLastTeam });
            const pickable = validSlots.length > 0;
            const expanded = expandedPlayerId === p.id;
            return (
              <div
                key={p.id}
                className={`player-card${expanded ? ' expanded' : ''}${!pickable ? ' disabled' : ''}`}
                onClick={() => pickable && setExpandedPlayerId((id) => (id === p.id ? null : p.id))}
              >
                <div className="player-card-top">
                  <div className="player-name-row">
                    <div className="player-name">{p.name}</div>
                    {p.isKeeper && <KeeperIcon color={accent} />}
                    {p.isOverseas && <OverseasIcon color={accent} />}
                  </div>
                  <div className="player-meta">
                    <RoleBadge role={p.roleBadge} />
                    <span className="range-label">
                      SLOT {p.minPos === p.maxPos ? p.minPos : `${p.minPos}-${p.maxPos}`}
                    </span>
                  </div>
                </div>
                <div className="player-stats">
                  <ScoreReadout label="Batting" value={p.battingScore} hidden={!scoresVisible} />
                  <ScoreReadout label="Finishing" value={p.finishingScore} hidden={!scoresVisible} />
                  <ScoreReadout label="Bowling" value={p.bowlingScore} hidden={!scoresVisible} />
                </div>
                {expanded && pickable && (
                  <div className="position-picker">
                    <div className="position-picker-label">Choose a position</div>
                    <div className="position-chip-row">
                      {validSlots.map((slot) => (
                        <button
                          key={slot}
                          className="position-chip"
                          onClick={(e) => {
                            e.stopPropagation();
                            pickPlayer(currentTeam.id, p, slot);
                            setExpandedPlayerId(null);
                          }}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completeBlock}
      {submitBar}
    </div>
  );
}

function DesktopPlayerCard({
  player: p,
  accent,
  arrangement,
  assignedPlayers,
  isLastTeam,
  scoresVisible,
  expanded,
  onToggle,
  onPick,
}: {
  player: Player;
  accent: string;
  arrangement: Record<number, string>;
  assignedPlayers: Player[];
  isLastTeam: boolean;
  scoresVisible: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPick: (slot: number) => void;
}) {
  const validSlots = validSlotsForPlayer(p, arrangement, { assignedPlayers, isLastTeam });
  const pickable = validSlots.length > 0;

  const rangeLabel = p.minPos === p.maxPos ? String(p.minPos) : `${p.minPos}-${p.maxPos}`;
  const nameRow = (
    <div className="player-name-row">
      <div className="desktop-player-name">{p.name}</div>
      {p.isKeeper && <KeeperIcon color={accent} />}
      {p.isOverseas && <OverseasIcon color={accent} />}
    </div>
  );

  return (
    <div
      className={`desktop-player-card${expanded ? ' expanded' : ''}${!pickable ? ' disabled' : ''}${!scoresVisible ? ' compact' : ''}`}
      style={{ ['--card-accent' as string]: accent }}
      onClick={() => pickable && onToggle()}
    >
      {scoresVisible ? (
        <div className="desktop-player-row">
          <div className="desktop-player-identity">
            {nameRow}
            <div className="player-meta">
              <RoleBadge role={p.roleBadge} />
              <span className="range-label">BEST SLOT {rangeLabel}</span>
            </div>
          </div>
          <div className="desktop-player-stats">
            <ScoreReadout label="Batting" value={p.battingScore} hidden={false} />
            <ScoreReadout label="Finishing" value={p.finishingScore} hidden={false} />
            <ScoreReadout label="Bowling" value={p.bowlingScore} hidden={false} />
          </div>
        </div>
      ) : (
        // Scores hidden: a compact single-row layout - no stat boxes at all
        // (not just dimmed placeholders), matching the design's scoresHidden
        // state so the desktop list reads faster with the numbers off.
        <div className="desktop-player-row compact">
          <div className="desktop-player-identity compact">{nameRow}</div>
          <div className="desktop-player-compact-right">
            <RoleBadge role={p.roleBadge} />
            <span className="range-label">SLOT {rangeLabel}</span>
          </div>
        </div>
      )}
      {expanded && pickable && (
        <div className="position-picker">
          <div className="position-picker-label">Choose a position</div>
          <div className="position-chip-row">
            {validSlots.map((slot) => (
              <button
                key={slot}
                className="position-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(slot);
                }}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerDetailCard({
  entry,
  scoresVisible,
  onClose,
  className,
}: {
  entry: { player: Player; franchise: string; season: number };
  scoresVisible: boolean;
  onClose: () => void;
  className?: string;
}) {
  const { player, franchise, season } = entry;
  return (
    <div className={className ? `detail-card ${className}` : 'detail-card'}>
      <div className="detail-card-top">
        <div>
          <div className="player-name">{player.name}</div>
          <div className="detail-card-team">
            {franchise} · {season}
          </div>
        </div>
        <div className="detail-card-actions">
          <RoleBadge role={player.roleBadge} />
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="player-stats">
        <ScoreReadout label="Batting" value={player.battingScore} hidden={!scoresVisible} />
        <ScoreReadout label="Finishing" value={player.finishingScore} hidden={!scoresVisible} />
        <ScoreReadout label="Bowling" value={player.bowlingScore} hidden={!scoresVisible} />
      </div>
    </div>
  );
}
