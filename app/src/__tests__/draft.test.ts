import { describe, expect, it } from 'vitest';
import { findNextTeamIndex, isLineupComplete, isTeamAlive, openSlots, validSlotsForPlayer } from '../draft';
import { player, teamSeason } from '../test/fixtures';

describe('draft helpers', () => {
  it('returns open slots in batting-order position', () => {
    expect(openSlots({ 1: 'p1', 4: 'p4', 11: 'p11' })).toEqual([2, 3, 5, 6, 7, 8, 9, 10]);
  });

  it('filters valid slots by player range and filled positions', () => {
    const batter = player({ minPos: 2, maxPos: 5 });

    expect(validSlotsForPlayer(batter, { 2: 'taken', 6: 'other' })).toEqual([3, 4, 5]);
  });

  it('detects whether a team has at least one playable option', () => {
    const arrangement = { 1: 'p1', 2: 'p2', 3: 'p3' };
    const deadTeam = teamSeason({ players: [player({ minPos: 1, maxPos: 3 })] });
    const liveTeam = teamSeason({ players: [player({ minPos: 4, maxPos: 7 })] });

    expect(isTeamAlive(deadTeam, arrangement)).toBe(false);
    expect(isTeamAlive(liveTeam, arrangement)).toBe(true);
  });

  it('finds the next unresolved team from a starting index', () => {
    const pool = [
      teamSeason({ id: 'team-1' }),
      teamSeason({ id: 'team-2' }),
      teamSeason({ id: 'team-3' }),
    ];

    expect(findNextTeamIndex(pool, new Set(['team-1', 'team-2']), 0)).toBe(2);
    expect(findNextTeamIndex(pool, new Set(['team-1', 'team-2', 'team-3']), 0)).toBeNull();
  });

  it('only marks a lineup complete once all eleven slots are filled', () => {
    expect(isLineupComplete({ 1: 'p1', 2: 'p2' })).toBe(false);
    expect(
      isLineupComplete({
        1: 'p1',
        2: 'p2',
        3: 'p3',
        4: 'p4',
        5: 'p5',
        6: 'p6',
        7: 'p7',
        8: 'p8',
        9: 'p9',
        10: 'p10',
        11: 'p11',
      }),
    ).toBe(true);
  });
});
