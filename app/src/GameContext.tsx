import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { fetchSquads, submitLineup } from './api';
import { findNextTeamIndex, isLineupComplete, isTeamAlive, validSlotsForPlayer } from './draft';
import type { Player, ResultResponse, TeamSeason } from './types';

function findPlayerInPool(pool: TeamSeason[], id: string): Player | undefined {
  for (const t of pool) {
    const p = t.players.find((pl) => pl.id === id);
    if (p) return p;
  }
  return undefined;
}

function resolveAssignedPlayers(pool: TeamSeason[], arrangement: Record<number, string>): Player[] {
  return Object.values(arrangement)
    .map((id) => findPlayerInPool(pool, id))
    .filter((p): p is Player => !!p);
}

function unresolvedCount(pool: TeamSeason[], resolvedTeamIds: Set<string>): number {
  return pool.filter((t) => !resolvedTeamIds.has(t.id)).length;
}

/** The draft rules (see Home page copy) allow exactly one manual skip per
 * session, not one per team-season. */
const MAX_SKIPS = 1;

interface DraftState {
  pool: TeamSeason[];
  poolIds: string[];
  poolToken: string;
  teamPointer: number;
  resolvedTeamIds: Set<string>;
  skippedTeamIds: Set<string>;
  arrangement: Record<number, string>; // slot -> playerId
}

interface GameContextValue {
  scoresVisible: boolean;
  toggleScores: () => void;

  draft: DraftState | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  result: ResultResponse | null;
  submitting: boolean;

  startSession: () => Promise<boolean>;
  advanceIfDead: () => void;
  pickPlayer: (teamSeasonId: string, player: Player, slot: number) => void;
  skipCurrentTeam: () => void;
  submitCurrentLineup: () => Promise<void>;
  currentTeam: TeamSeason | null;
  canSkipCurrentTeam: boolean;
  allPlayersById: Map<string, { player: Player; teamSeasonId: string; teamIndex: number; franchise: string; season: number }>;
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

  const startSession = useCallback(async (): Promise<boolean> => {
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
        skippedTeamIds: new Set(),
        arrangement: {},
      });
      setStatus('ready');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load squads');
      setStatus('error');
      return false;
    }
  }, []);

  // If the team currently pointed to has no player that fits any open slot,
  // resolve it (skip, no budget cost) and move on — repeats until landing on
  // a live team or running out of the pool.
  const advanceIfDead = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const assignedPlayers = resolveAssignedPlayers(d.pool, d.arrangement);
      if (isLineupComplete(d.arrangement)) return d;
      let pointer = d.teamPointer;
      let resolved = d.resolvedTeamIds;
      let changed = false;
      while (pointer !== null && pointer < d.pool.length) {
        const team = d.pool[pointer];
        if (resolved.has(team.id)) {
          const next = findNextTeamIndex(d.pool, resolved, pointer + 1);
          if (next === null) {
            pointer = d.pool.length;
            break;
          }
          pointer = next;
          continue;
        }
        // This team is exempt from the keeper rule if it's the only one left
        // unresolved - see isLastTeam in draft.ts.
        const isLastTeam = unresolvedCount(d.pool, resolved) === 1;
        if (!isTeamAlive(team, d.arrangement, { assignedPlayers, isLastTeam })) {
          if (!changed) resolved = new Set(resolved);
          resolved.add(team.id);
          changed = true;
          const next = findNextTeamIndex(d.pool, resolved, pointer + 1);
          if (next === null) {
            pointer = d.pool.length;
            break;
          }
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
      // Authoritative check (mirrors what the UI already disables via
      // validSlotsForPlayer) - the overseas cap and the "can't take the last
      // open slot without a keeper picked" rule both get enforced here too,
      // not just in what's clickable, so this can't be bypassed.
      const assignedPlayers = resolveAssignedPlayers(d.pool, d.arrangement);
      const isLastTeam = unresolvedCount(d.pool, d.resolvedTeamIds) === 1;
      const valid = validSlotsForPlayer(player, d.arrangement, { assignedPlayers, isLastTeam });
      if (!valid.includes(slot)) return d;
      const resolved = new Set(d.resolvedTeamIds);
      resolved.add(teamSeasonId);
      const skipped = new Set(d.skippedTeamIds);
      skipped.delete(teamSeasonId);
      const arrangement = { ...d.arrangement, [slot]: player.id };
      const next = findNextTeamIndex(d.pool, resolved, 0);
      return {
        ...d,
        arrangement,
        resolvedTeamIds: resolved,
        skippedTeamIds: skipped,
        teamPointer: next ?? d.teamPointer,
      };
    });
  }, []);

  // Only one manual skip is allowed for the whole draft session - guard here
  // is authoritative, not just what the UI disables, so it can't be bypassed.
  const skipCurrentTeam = useCallback(() => {
    setDraft((d) => {
      if (!d) return d;
      const team = d.pool[d.teamPointer];
      if (!team || d.skippedTeamIds.size >= MAX_SKIPS || d.skippedTeamIds.has(team.id)) return d;
      const resolved = new Set(d.resolvedTeamIds);
      resolved.add(team.id);
      const skipped = new Set(d.skippedTeamIds);
      skipped.add(team.id);
      const next = findNextTeamIndex(d.pool, resolved, 0);
      return {
        ...d,
        resolvedTeamIds: resolved,
        skippedTeamIds: skipped,
        teamPointer: next ?? d.teamPointer,
      };
    });
  }, []);

  const submitCurrentLineup = useCallback(async () => {
    if (!draft) return;
    if (!isLineupComplete(draft.arrangement)) return;
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
  const canSkipCurrentTeam = !!draft && !!currentTeam && draft.skippedTeamIds.size < MAX_SKIPS;

  const allPlayersById = useMemo(() => {
    const map = new Map<string, { player: Player; teamSeasonId: string; teamIndex: number; franchise: string; season: number }>();
    if (draft) {
      draft.pool.forEach((t, teamIndex) => {
        for (const p of t.players) map.set(p.id, { player: p, teamSeasonId: t.id, teamIndex, franchise: t.franchise, season: t.season });
      });
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
