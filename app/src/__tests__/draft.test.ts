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

  it('blocks an overseas player once the real-XI cap (4) is already reached', () => {
    const overseasPick = player({ id: 'overseas-5', isOverseas: true, minPos: 1, maxPos: 11 });
    const fourOverseasAlready = [
      player({ id: 'o1', isOverseas: true }),
      player({ id: 'o2', isOverseas: true }),
      player({ id: 'o3', isOverseas: true }),
      player({ id: 'o4', isOverseas: true }),
    ];

    expect(validSlotsForPlayer(overseasPick, { 1: 'x' }, { assignedPlayers: fourOverseasAlready })).toEqual([]);
    expect(
      validSlotsForPlayer(overseasPick, { 1: 'x' }, { assignedPlayers: fourOverseasAlready.slice(0, 3) }),
    ).not.toEqual([]);
  });

  it('does not cap domestic players and has no overseas minimum', () => {
    const domesticPick = player({ id: 'domestic', isOverseas: false, minPos: 1, maxPos: 11 });
    const fourOverseasAlready = [
      player({ id: 'o1', isOverseas: true }),
      player({ id: 'o2', isOverseas: true }),
      player({ id: 'o3', isOverseas: true }),
      player({ id: 'o4', isOverseas: true }),
    ];

    expect(validSlotsForPlayer(domesticPick, { 1: 'x' }, { assignedPlayers: fourOverseasAlready })).not.toEqual([]);
  });

  it('blocks a non-keeper from taking the last open slot when no keeper has been picked yet', () => {
    const nonKeeper = player({ id: 'batter', isKeeper: false, minPos: 1, maxPos: 11 });
    const keeper = player({ id: 'keeper', isKeeper: true, minPos: 1, maxPos: 11 });
    const arrangement: Record<number, string> = {};
    for (let s = 1; s <= 10; s++) arrangement[s] = `p${s}`;

    expect(validSlotsForPlayer(nonKeeper, arrangement, { assignedPlayers: [] })).toEqual([]);
    expect(validSlotsForPlayer(keeper, arrangement, { assignedPlayers: [] })).toEqual([11]);
  });

  it('lets a non-keeper take any non-final slot even with zero keepers picked so far', () => {
    const nonKeeper = player({ id: 'batter', isKeeper: false, minPos: 1, maxPos: 5 });
    const arrangement = { 1: 'p1' };

    expect(validSlotsForPlayer(nonKeeper, arrangement, { assignedPlayers: [] })).toEqual([2, 3, 4, 5]);
  });

  it('lets a non-keeper take the last open slot when this is the last remaining team-season', () => {
    // A fixed roster's slot ranges may simply not include a keeper who
    // covers the one remaining slot - blocking here would strand the draft
    // with no team left to turn to, so the last team is exempt.
    const nonKeeper = player({ id: 'batter', isKeeper: false, minPos: 1, maxPos: 11 });
    const arrangement: Record<number, string> = {};
    for (let s = 1; s <= 10; s++) arrangement[s] = `p${s}`;

    expect(validSlotsForPlayer(nonKeeper, arrangement, { assignedPlayers: [], isLastTeam: false })).toEqual([]);
    expect(validSlotsForPlayer(nonKeeper, arrangement, { assignedPlayers: [], isLastTeam: true })).toEqual([11]);
  });

  it('marks a lineup complete once all eleven slots are filled, regardless of keeper presence', () => {
    const arrangement: Record<number, string> = {};
    for (let s = 1; s <= 11; s++) arrangement[s] = `p${s}`;

    expect(isLineupComplete(arrangement)).toBe(true);
  });
});
