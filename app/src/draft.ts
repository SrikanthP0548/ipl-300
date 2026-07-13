import type { Player, TeamSeason } from './types';

export const TOTAL_SLOTS = 11;
export const MAX_OVERSEAS = 4;

export function openSlots(arrangement: Record<number, string>): number[] {
  const slots: number[] = [];
  for (let s = 1; s <= TOTAL_SLOTS; s++) {
    if (!arrangement[s]) slots.push(s);
  }
  return slots;
}

/** Roster-composition context needed to enforce the no-duplicate-player
 * rule, the overseas cap, and the keeper requirement. Optional everywhere
 * it's threaded through - omitting it (e.g. in pure slot-range unit tests)
 * just skips those checks.
 *
 * isLastTeam: true when the team this player belongs to is the only
 * team-season left unresolved in the pool. The keeper rule stands down in
 * that case - a team-season's roster and its players' slot ranges are fixed,
 * so it's possible for the very last team to have no keeper whose range
 * covers the one remaining open slot. Blocking here would strand the draft
 * at 10/11 with no team left to turn to, so the last team is exempt. */
export interface RosterContext {
  assignedPlayers: Player[];
  isLastTeam?: boolean;
}

export function validSlotsForPlayer(
  player: Player,
  arrangement: Record<number, string>,
  context?: RosterContext,
): number[] {
  const open = openSlots(arrangement).filter((s) => s >= player.minPos && s <= player.maxPos);
  if (open.length === 0 || !context) return open;

  const { assignedPlayers } = context;

  // Real-XI rule: the same real player can't be drafted twice under a
  // different team-season (e.g. AB de Villiers from RCB 2015 and RCB 2020
  // are the same person - once picked, every other team-season's instance
  // of them is off the table). Never exempted, even for the last team - two
  // slots can't legally hold the same human being.
  if (assignedPlayers.some((p) => p.name === player.name)) {
    return [];
  }

  // Real-XI rule: at most 4 overseas players. A cap, not a minimum - 0-4 is fine.
  if (player.isOverseas && assignedPlayers.filter((p) => p.isOverseas).length >= MAX_OVERSEAS) {
    return [];
  }

  // Real-XI rule: at least 1 keeper. If none picked yet and this is the only
  // slot left open, a non-keeper can't take it - that would complete the XI
  // with zero keepers. Earlier slots stay open to any pickable player. This
  // stands down for the last remaining team (see isLastTeam above).
  if (
    !player.isKeeper &&
    !assignedPlayers.some((p) => p.isKeeper) &&
    openSlots(arrangement).length === 1 &&
    !context.isLastTeam
  ) {
    return [];
  }

  return open;
}

export function isPlayerPickable(player: Player, arrangement: Record<number, string>, context?: RosterContext): boolean {
  return validSlotsForPlayer(player, arrangement, context).length > 0;
}

export function isTeamAlive(team: TeamSeason, arrangement: Record<number, string>, context?: RosterContext): boolean {
  return team.players.some((p) => isPlayerPickable(p, arrangement, context));
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
