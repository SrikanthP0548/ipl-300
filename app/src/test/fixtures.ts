import type { Player, ResultResponse, SquadsResponse, TeamSeason } from '../types';

export function player(overrides: Partial<Player> = {}): Player {
  const id = overrides.id ?? 'player-1';
  return {
    id,
    name: overrides.name ?? 'Player One',
    role: overrides.role ?? 'Top order batter',
    roleCategory: overrides.roleCategory ?? 'bat',
    roleBadge: overrides.roleBadge ?? 'Batter',
    canonicalPos: overrides.canonicalPos ?? 1,
    minPos: overrides.minPos ?? 1,
    maxPos: overrides.maxPos ?? 3,
    isKeeper: overrides.isKeeper ?? false,
    isOverseas: overrides.isOverseas ?? false,
    battingScore: overrides.battingScore ?? 88,
    finishingScore: overrides.finishingScore ?? 72,
    bowlingScore: overrides.bowlingScore ?? null,
  };
}

export function teamSeason(overrides: Partial<TeamSeason> = {}): TeamSeason {
  const id = overrides.id ?? 'mi-2020';
  return {
    id,
    franchise: overrides.franchise ?? 'Mumbai Indians',
    season: overrides.season ?? 2020,
    players: overrides.players ?? [player()],
  };
}

export function squadsResponse(overrides: Partial<SquadsResponse> = {}): SquadsResponse {
  const pool = overrides.pool ?? [teamSeason()];
  return {
    pool,
    poolIds: overrides.poolIds ?? pool.map((team) => team.id),
    poolToken: overrides.poolToken ?? 'pool-token',
  };
}

export function resultResponse(overrides: Partial<ResultResponse> = {}): ResultResponse {
  return {
    reason: overrides.reason ?? 'win',
    eligibility: overrides.eligibility ?? {
      eligible: true,
      hasKeeper: true,
      realBowlerCount: 5,
      topBattingAvg: 84,
      topFinishingAvg: 75,
      bottomBowlingAvg: 70,
      structural: true,
      shortfallIndex: 0,
    },
    won: overrides.won ?? true,
    finalScore: overrides.finalScore ?? 304,
    finalWickets: overrides.finalWickets ?? 4,
    ballsBowled: overrides.ballsBowled ?? 116,
    balls: overrides.balls ?? [
      {
        ballNum: 1,
        over: 0,
        ballInOver: 1,
        outcome: 4,
        scoreAfter: 4,
        wicketsAfter: 0,
        strikerSlot: 1,
        milestone: null,
        dismissedSlot: null,
      },
    ],
    batsmen: overrides.batsmen ?? [
      { slot: 1, playerId: 'player-1', name: 'Player One', runs: 102, balls: 52, out: false },
      { slot: 2, playerId: 'player-2', name: 'Player Two', runs: 81, balls: 38, out: true },
    ],
    bestPerformer: overrides.bestPerformer ?? { slot: 1, name: 'Player One', runs: 102, balls: 52 },
    resultToken: overrides.resultToken ?? 'result-token',
  };
}
