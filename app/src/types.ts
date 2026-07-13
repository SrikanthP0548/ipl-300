export interface Player {
  id: string;
  name: string;
  role: string;
  roleCategory: string;
  roleBadge: 'Batter' | 'All-rounder' | 'Bowler' | 'Keeper';
  canonicalPos: number;
  minPos: number;
  maxPos: number;
  isKeeper: boolean;
  isOverseas: boolean;
  battingScore: number | null;
  finishingScore: number | null;
  bowlingScore: number | null;
}

export interface TeamSeason {
  id: string;
  franchise: string;
  season: number;
  players: Player[];
}

export interface SquadsResponse {
  pool: TeamSeason[];
  poolIds: string[];
  poolToken: string;
}

export type OutcomeKey = 0 | 1 | 2 | 3 | 4 | 6 | 'W';

export interface BallEvent {
  ballNum: number;
  over: number;
  ballInOver: number;
  outcome: OutcomeKey;
  scoreAfter: number;
  wicketsAfter: number;
  strikerSlot: number;
  milestone: number | null;
  dismissedSlot: number | null;
}

export interface BatsmanResult {
  slot: number;
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  out: boolean;
}

export type ReasonCode =
  | 'win'
  | 'blowup'
  | 'choke'
  | 'whisker'
  | 'short_batting'
  | 'attack_heartbreak'
  | 'structurally_broken';

export interface EligibilityResult {
  eligible: boolean;
  hasKeeper: boolean;
  realBowlerCount: number;
  topBattingAvg: number;
  topFinishingAvg: number;
  bottomBowlingAvg: number;
  structural: boolean;
  shortfallIndex: number;
}

export interface ResultResponse {
  reason: ReasonCode;
  eligibility: EligibilityResult;
  won: boolean;
  finalScore: number;
  finalWickets: number;
  ballsBowled: number;
  balls: BallEvent[];
  batsmen: BatsmanResult[];
  bestPerformer: { slot: number; name: string; runs: number; balls: number } | null;
  resultToken: string;
}

export type LeaderboardRange = 'today' | 'week' | 'alltime';

export interface LeaderboardEntry {
  name: string;
  score: number;
  wickets: number;
  balls: number;
  createdAt: number;
}
