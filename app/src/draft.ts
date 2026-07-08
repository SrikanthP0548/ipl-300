import type { Player, TeamSeason } from './types';

export const TOTAL_SLOTS = 11;

export function openSlots(arrangement: Record<number, string>): number[] {
  const slots: number[] = [];
  for (let s = 1; s <= TOTAL_SLOTS; s++) {
    if (!arrangement[s]) slots.push(s);
  }
  return slots;
}

export function validSlotsForPlayer(player: Player, arrangement: Record<number, string>): number[] {
  return openSlots(arrangement).filter((s) => s >= player.minPos && s <= player.maxPos);
}

export function isPlayerPickable(player: Player, arrangement: Record<number, string>): boolean {
  return validSlotsForPlayer(player, arrangement).length > 0;
}

export function isTeamAlive(team: TeamSeason, arrangement: Record<number, string>): boolean {
  return team.players.some((p) => isPlayerPickable(p, arrangement));
}

/** First team-season in pool order that hasn't been resolved (picked-from or skipped) yet. */
export function findNextTeamIndex(
  pool: TeamSeason[],
  resolvedTeamIds: Set<string>,
  fromIndex: number,
): number | null {
  for (let i = fromIndex; i < pool.length; i++) {
    if (!resolvedTeamIds.has(pool[i].id)) return i;
  }
  return null;
}

export function isLineupComplete(arrangement: Record<number, string>): boolean {
  return openSlots(arrangement).length === 0;
}
