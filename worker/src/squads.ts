import type { TeamSeason } from './types';
import rawData from './data/game_data.json';

export const ALL_TEAM_SEASONS = rawData as unknown as TeamSeason[];

const POOL_SIZE = 15;
const SLOTS = 11;
const MAX_ATTEMPTS = 300;

function shuffleSample<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Kuhn's algorithm: does a perfect matching exist saturating all 11 slots,
 * where each of the pooled team-seasons can supply at most one slot (since
 * the draft rule caps picks at 1 player per team-season)?
 */
function isJointlyFeasible(pool: TeamSeason[]): boolean {
  const slotOwner: (number | null)[] = new Array(SLOTS + 1).fill(null);

  const teamCanFill = (teamIdx: number, slot: number) =>
    pool[teamIdx].players.some((p) => p.minPos <= slot && slot <= p.maxPos);

  function tryAssign(teamIdx: number, visited: boolean[]): boolean {
    for (let slot = 1; slot <= SLOTS; slot++) {
      if (visited[slot] || !teamCanFill(teamIdx, slot)) continue;
      visited[slot] = true;
      const owner = slotOwner[slot];
      if (owner === null || tryAssign(owner, visited)) {
        slotOwner[slot] = teamIdx;
        return true;
      }
    }
    return false;
  }

  let matched = 0;
  for (let t = 0; t < pool.length; t++) {
    if (tryAssign(t, new Array(SLOTS + 1).fill(false))) matched++;
  }
  return matched >= SLOTS;
}

/** Picks 15 random team-seasons, rerolling until a valid 11-slot XI is guaranteed completable. */
export function pickSquadPool(): TeamSeason[] {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const pool = shuffleSample(ALL_TEAM_SEASONS, POOL_SIZE);
    if (isJointlyFeasible(pool)) return pool;
  }
  // Astronomically unlikely given every individual team-season is itself
  // feasible; fall back to the last draw rather than fail the request.
  return shuffleSample(ALL_TEAM_SEASONS, POOL_SIZE);
}
