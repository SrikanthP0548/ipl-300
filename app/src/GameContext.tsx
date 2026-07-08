import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { fetchSquads, submitLineup } from './api';
import { findNextTeamIndex, isLineupComplete, isTeamAlive } from './draft';
import type { Player, ResultResponse, TeamSeason } from './types';

interface DraftState {
  pool: TeamSeason[];
  poolIds: string[];
  poolToken: string;
  teamPointer: number;
  resolvedTeamIds: Set<string>;
  skipsUsed: number;
  arrangement: Record<number, string>; // slot -> playerId
}

const MAX_SKIPS = 1;

interface GameContextValue {
  scoresVisible: boolean;
  toggleScores: () => void;

  draft: DraftState | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  result: ResultResponse | null;
  submitting: boolean;

  startSession: () => Promise<void>;
  advanceIfDead: () => void;
  pickPlayer: (teamSeasonId: string, player: Player, slot: number) => void;
  skipCurrentTeam: () => void;
  submitCurrentLineup: () => Promise<void>;
  currentTeam: TeamSeason | null;
  canSkipCurrentTeam: boolean;
  allPlayersById: Map<string, { player: Player; teamSeasonId: string; franchise: string; season: number }>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [scoresVisible, setScoresVisible] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [status, setStatus] = useState<GameContextValue['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleScores = useCallback(() => setScoresVisible((v) => !v), []);

  const startSession = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setResult(null);
    try {
      const res = await fetchSquads();
      setDraft({
        pool: res.pool,
        poolIds: res.poolIds,
        poolToken: res.poolToken,
        teamPointer: 0,
        resolvedTeamIds: new Set(),
        skipsUsed: 0,
        arrangement: {},
      });
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load squads');
      setStatus('error');
    }
  }, []);

  // If the team currently pointed to has no player that fits any open slot,
  // resolve it (skip, no budget cost) and move on — repeats until landing on
  // a live team or running out of the pool.
  const advanceIfDead = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      if (isLineupComplete(d.arrangement)) return d;
      let pointer = d.teamPointer;
      let resolved = d.resolvedTeamIds;
      let changed = false;
      while (pointer !== null && pointer < d.pool.length) {
        const team = d.pool[pointer];
        if (resolved.has(team.id)) {
          const next = findNextTeamIndex(d.pool, resolved, pointer + 1);
          if (next === null) break;
          pointer = next;
          continue;
        }
        if (!isTeamAlive(team, d.arrangement)) {
          if (!changed) resolved = new Set(resolved);
          resolved.add(team.id);
          changed = true;
          const next = findNextTeamIndex(d.pool, resolved, pointer + 1);
          if (next === null) break;
          pointer = next;
          continue;
        }
        break;
      }
      if (!changed && pointer === d.teamPointer) return d;
      return { ...d, teamPointer: pointer, resolvedTeamIds: resolved };
    });
  }, []);

  const pickPlayer = useCallback((teamSeasonId: string, player: Player, slot: number) => {
    setDraft((d) => {
      if (!d) return d;
      if (d.arrangement[slot]) return d;
      const resolved = new Set(d.resolvedTeamIds);
      resolved.add(teamSeasonId);
      const arrangement = { ...d.arrangement, [slot]: player.id };
      const next = findNextTeamIndex(d.pool, resolved, 0);
      return {
        ...d,
        arrangement,
        resolvedTeamIds: resolved,
        teamPointer: next ?? d.teamPointer,
      };
    });
  }, []);

  const skipCurrentTeam = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      if (d.skipsUsed >= MAX_SKIPS) return d;
      const team = d.pool[d.teamPointer];
      if (!team) return d;
      const resolved = new Set(d.resolvedTeamIds);
      resolved.add(team.id);
      const next = findNextTeamIndex(d.pool, resolved, 0);
      return {
        ...d,
        resolvedTeamIds: resolved,
        skipsUsed: d.skipsUsed + 1,
        teamPointer: next ?? d.teamPointer,
      };
    });
  }, []);

  const submitCurrentLineup = useCallback(async () => {
    if (!draft || !isLineupComplete(draft.arrangement)) return;
    setSubmitting(true);
    setError(null);
    try {
      const arrangementStr: Record<string, string> = {};
      for (const [slot, playerId] of Object.entries(draft.arrangement)) arrangementStr[slot] = playerId;
      const res = await submitLineup(draft.poolIds, draft.poolToken, arrangementStr);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit lineup');
    } finally {
      setSubmitting(false);
    }
  }, [draft]);

  const currentTeam = draft && draft.teamPointer < draft.pool.length ? draft.pool[draft.teamPointer] : null;
  const canSkipCurrentTeam = !!draft && draft.skipsUsed < MAX_SKIPS;

  const allPlayersById = useMemo(() => {
    const map = new Map<string, { player: Player; teamSeasonId: string; franchise: string; season: number }>();
    if (draft) {
      for (const t of draft.pool) {
        for (const p of t.players) map.set(p.id, { player: p, teamSeasonId: t.id, franchise: t.franchise, season: t.season });
      }
    }
    return map;
  }, [draft]);

  const value: GameContextValue = {
    scoresVisible,
    toggleScores,
    draft,
    status,
    error,
    result,
    submitting,
    startSession,
    advanceIfDead,
    pickPlayer,
    skipCurrentTeam,
    submitCurrentLineup,
    currentTeam,
    canSkipCurrentTeam,
    allPlayersById,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
