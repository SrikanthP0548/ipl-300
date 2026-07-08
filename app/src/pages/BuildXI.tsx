import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../GameContext';
import { RoleBadge } from '../components/RoleBadge';
import { ScoreReadout } from '../components/ScoreReadout';
import { isLineupComplete, validSlotsForPlayer } from '../draft';
import type { Player } from '../types';

export function BuildXI() {
  const navigate = useNavigate();
  const {
    draft,
    status,
    scoresVisible,
    toggleScores,
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

  if (!draft) {
    return (
      <div className="page">
        <div className="loading-block">Loading squads…</div>
      </div>
    );
  }

  const complete = isLineupComplete(draft.arrangement);
  const filledCount = Object.keys(draft.arrangement).length;

  const slots = Array.from({ length: 11 }, (_, i) => {
    const n = i + 1;
    const playerId = draft.arrangement[n];
    const occupant = playerId ? allPlayersById.get(playerId) : undefined;
    return { n, occupant };
  });

  const onSubmit = async () => {
    await submitCurrentLineup();
  };

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
          <button className="toggle-scores-btn" onClick={toggleScores} style={{ color: scoresVisible ? 'var(--teal)' : 'var(--text-muted)' }}>
            {scoresVisible ? 'Scores: On' : 'Scores: Off'}
          </button>
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

      {!complete && currentTeam && (
        <>
          <div className="team-banner">
            <div className="team-banner-name">
              {currentTeam.franchise} · {currentTeam.season}
            </div>
            <button className="skip-btn" onClick={skipCurrentTeam} disabled={!canSkipCurrentTeam}>
              Skip Team →
            </button>
          </div>
          <div className="team-banner-hint">
            {canSkipCurrentTeam ? 'Tap a player to choose their position, or skip this team.' : 'Tap a player to choose their position. No skips left.'}
          </div>

          <div className="player-list">
            {currentTeam.players.map((p) => {
              const validSlots = validSlotsForPlayer(p, draft.arrangement);
              const pickable = validSlots.length > 0;
              const expanded = expandedPlayerId === p.id;
              return (
                <div
                  key={p.id}
                  className={`player-card${expanded ? ' expanded' : ''}${!pickable ? ' disabled' : ''}`}
                  onClick={() => pickable && setExpandedPlayerId((id) => (id === p.id ? null : p.id))}
                >
                  <div className="player-card-top">
                    <div className="player-name">{p.name}</div>
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
        </>
      )}

      {complete && (
        <div className="lineup-complete-block">
          <div className="lineup-complete-title">XI Complete</div>
          <div className="lineup-complete-desc">
            All 11 slots are filled. Review your order in the strip above, then submit your lineup.
          </div>
        </div>
      )}

      <div className="submit-bar">
        <button className="btn-primary submit-button" onClick={onSubmit} disabled={!complete || submitting}>
          {submitting ? 'Simulating…' : complete ? 'Submit Lineup' : `Place All 11 (${filledCount}/11)`}
        </button>
      </div>
    </div>
  );
}

function PlayerDetailCard({
  entry,
  scoresVisible,
  onClose,
}: {
  entry: { player: Player; franchise: string; season: number };
  scoresVisible: boolean;
  onClose: () => void;
}) {
  const { player, franchise, season } = entry;
  return (
    <div className="detail-card">
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
