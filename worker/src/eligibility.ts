import type { Player } from './types';

/**
 * Recalibrated against the Release 1B scoring model (era-normalized global
 * percentile, see scripts/build_csv.py). The draft mechanic - pick the best
 * legally-fitting player per slot out of a 15-team-season pool - is powerful
 * enough that even a naive greedy draft strategy reliably assembles a team
 * near the top of the score distribution (simulated 6000 greedy drafts
 * against the live game_data.json: top-7 batting/finishing and bottom-4
 * bowling averages cluster tightly in the low-mid 80s to low 90s, p10-p90).
 *
 * Because these three metrics are correlated but not identical, requiring
 * all three simultaneously is considerably more selective than any single
 * one of them alone - setting each to its own individual p75 mark compounds
 * to a ~2.4% joint pass rate, not 25%. The target here is a ~10-12% joint
 * pass rate (eligibility should be a real accomplishment, not the default
 * outcome, but not vanishingly rare either), which the same simulation
 * shows corresponds to each threshold sitting at its own individual ~p55
 * mark (p50 -> 14.3% joint, p55 -> 11.0% joint, p58 -> 9.3% joint).
 */
export const THRESHOLDS = {
  TOP_BATTING_AVG: 85.5,
  TOP_FINISHING_AVG: 88.2,
  BOTTOM_BOWLING_AVG: 88.2,
  REAL_BOWLER_MIN_SCORE: 40,
  MIN_REAL_BOWLERS: 3,
};

export interface EligibilityResult {
  eligible: boolean;
  hasKeeper: boolean;
  realBowlerCount: number;
  topBattingAvg: number;
  topFinishingAvg: number;
  bottomBowlingAvg: number;
  /** hard-fail: no keeper, or fewer than MIN_REAL_BOWLERS real bowlers */
  structural: boolean;
  /** 0 = clears every threshold; higher = further below the bar */
  shortfallIndex: number;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** battingOrder must be exactly 11 players, already in slot order 1..11. */
export function evaluateEligibility(battingOrder: Player[]): EligibilityResult {
  const hasKeeper = battingOrder.some((p) => p.isKeeper);
  const realBowlerCount = battingOrder.filter(
    (p) => (p.bowlingScore ?? 0) >= THRESHOLDS.REAL_BOWLER_MIN_SCORE,
  ).length;

  const top7 = battingOrder.slice(0, 7);
  const bottom4 = battingOrder.slice(7, 11);

  const topBattingAvg = avg(top7.map((p) => p.battingScore ?? 0));
  const topFinishingAvg = avg(top7.map((p) => p.finishingScore ?? 0));
  const bottomBowlingAvg = avg(bottom4.map((p) => p.bowlingScore ?? 0));

  const structural = !hasKeeper || realBowlerCount < THRESHOLDS.MIN_REAL_BOWLERS;

  const battingShortfall = Math.max(0, (THRESHOLDS.TOP_BATTING_AVG - topBattingAvg) / THRESHOLDS.TOP_BATTING_AVG);
  const finishingShortfall = Math.max(0, (THRESHOLDS.TOP_FINISHING_AVG - topFinishingAvg) / THRESHOLDS.TOP_FINISHING_AVG);
  const bowlingShortfall = Math.max(0, (THRESHOLDS.BOTTOM_BOWLING_AVG - bottomBowlingAvg) / THRESHOLDS.BOTTOM_BOWLING_AVG);
  const shortfallIndex = (battingShortfall + finishingShortfall + bowlingShortfall) / 3;

  const eligible = !structural && battingShortfall === 0 && finishingShortfall === 0 && bowlingShortfall === 0;

  return {
    eligible,
    hasKeeper,
    realBowlerCount,
    topBattingAvg,
    topFinishingAvg,
    bottomBowlingAvg,
    structural,
    shortfallIndex,
  };
}

export type ReasonCode =
  | 'win'
  | 'blowup'
  | 'choke'
  | 'whisker'
  | 'short_batting'
  | 'attack_heartbreak'
  | 'structurally_broken';

export interface BandResult {
  reason: ReasonCode;
  targetMin: number;
  targetMax: number;
}

/** WIN_LOTTERY_RATE: fraction of eligible sessions that actually win. */
export const WIN_LOTTERY_RATE = 0.7;

export function pickBand(elig: EligibilityResult, won: boolean): BandResult {
  if (elig.eligible) {
    if (won) return { reason: 'win', targetMin: 301, targetMax: 999 };
    const reason: ReasonCode = Math.random() < 0.5 ? 'blowup' : 'choke';
    return { reason, targetMin: 275, targetMax: 299 };
  }
  if (elig.structural) {
    return { reason: 'structurally_broken', targetMin: 60, targetMax: 129 };
  }
  const s = elig.shortfallIndex;
  if (s <= 0.05) return { reason: 'whisker', targetMin: 250, targetMax: 274 };
  if (s <= 0.2) return { reason: 'short_batting', targetMin: 190, targetMax: 249 };
  return { reason: 'attack_heartbreak', targetMin: 130, targetMax: 189 };
}
