import type { Player } from './types';

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

export interface Batsman {
  slot: number;
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  out: boolean;
}

export interface SimResult {
  balls: BallEvent[];
  batsmen: Batsman[];
  finalScore: number;
  finalWickets: number;
  ballsBowled: number;
  won: boolean;
}

function mulberry32(seed: number) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Phase = 'powerplay' | 'middle' | 'death';

// Deliberately rescaled well above real-world T20 run rates: the 301 target
// itself is a stylized, arcade-scale number (same spirit as the original
// 500-off-50-overs premise this project is inspired by, not realistic
// cricket), so the engine's baseline scoring has to be high enough that
// elite/high-pressure batting can plausibly clear it.
const PHASE_BASE: Record<Phase, Record<OutcomeKey, number>> = {
  powerplay: { 0: 0.28, 1: 0.32, 2: 0.08, 3: 0.02, 4: 0.2, 6: 0.06, W: 0.04 },
  middle: { 0: 0.26, 1: 0.32, 2: 0.1, 3: 0.02, 4: 0.2, 6: 0.07, W: 0.03 },
  death: { 0: 0.14, 1: 0.22, 2: 0.06, 3: 0.02, 4: 0.26, 6: 0.24, W: 0.06 },
};

function phaseOf(over: number): Phase {
  if (over < 6) return 'powerplay';
  if (over < 15) return 'middle';
  return 'death';
}

function buildProbabilities(
  phase: Phase,
  skillFactor: number,
  pressureFactor: number, // signed: negative suppresses scoring (target below organic output), positive accelerates it
  newBatterFactor: number,
  blockWicket: boolean,
): Record<OutcomeKey, number> {
  const base = PHASE_BASE[phase];
  const clampedSkill = Math.min(1.2, Math.max(0, skillFactor));
  const posPressure = Math.max(0, pressureFactor);

  const wicketMul = blockWicket ? 0 : (1.6 - clampedSkill) * newBatterFactor * (1 + 0.4 * posPressure);
  // Floors keep these from going negative/zero when pressureFactor is strongly negative
  // (a structurally-broken-but-individually-skilled team being suppressed toward a low band).
  const boundaryMul = Math.max(0.03, ((0.5 + clampedSkill) * (1 + 0.5 * pressureFactor)) / newBatterFactor);
  const dotMul = Math.max(0.25, (1.3 - 0.5 * clampedSkill) * (1 - 0.3 * pressureFactor) * newBatterFactor);

  const out: Record<OutcomeKey, number> = {
    0: Math.max(0.02, base[0] * dotMul),
    1: base[1],
    2: base[2],
    3: base[3],
    4: Math.max(0.01, base[4] * boundaryMul),
    6: Math.max(0.005, base[6] * boundaryMul),
    W: Math.max(0, base.W * wicketMul),
  };
  const total = (Object.values(out) as number[]).reduce((a, b) => a + b, 0);
  (Object.keys(out) as unknown as OutcomeKey[]).forEach((k) => {
    out[k] = out[k] / total;
  });
  return out;
}

function sampleOutcome(probs: Record<OutcomeKey, number>, rand: () => number): OutcomeKey {
  const order: OutcomeKey[] = [0, 1, 2, 3, 4, 6, 'W'];
  const r = rand();
  let acc = 0;
  for (const k of order) {
    acc += probs[k];
    if (r <= acc) return k;
  }
  return 0;
}

/**
 * battingOrder: exactly 11 players in slot order 1..11.
 * won: pre-decided outcome (from eligibility + 70% lottery).
 * target: score band to land in when won === false; null when won === true
 *         (winners are open-ended, they just need to cross 301).
 */
export function simulateChase(
  battingOrder: Player[],
  won: boolean,
  target: { min: number; max: number } | null,
  seed: number,
): SimResult {
  const rand = mulberry32(seed);
  const formMul = battingOrder.map(() => 0.85 + rand() * 0.3);

  const batsmen: Batsman[] = battingOrder.map((p, i) => ({
    slot: i + 1,
    playerId: p.id,
    name: p.name,
    runs: 0,
    balls: 0,
    out: false,
  }));

  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  let nextInIdx = 2;
  let score = 0;
  let wickets = 0;
  let ballNum = 0;
  const milestonesHit = new Set<number>();
  const balls: BallEvent[] = [];

  const targetScore = target ? target.min + rand() * (target.max - target.min) : null;

  while (ballNum < 120 && wickets < 10) {
    if (won && score >= 301) break;

    const over = Math.floor(ballNum / 6);
    const phase = phaseOf(over);
    const striker = battingOrder[strikerIdx];
    const skillBlend =
      phase === 'death'
        ? 0.35 * (striker.battingScore ?? 0) + 0.65 * (striker.finishingScore ?? 0)
        : phase === 'powerplay'
          ? 0.7 * (striker.battingScore ?? 0) + 0.3 * (striker.finishingScore ?? 0)
          : 0.5 * (striker.battingScore ?? 0) + 0.5 * (striker.finishingScore ?? 0);
    const skillFactor = (skillBlend / 100) * formMul[strikerIdx];

    const ballsRemaining = 120 - ballNum;
    const chaseTarget = won ? 301 : (targetScore ?? 301);
    const requiredRR = ballsRemaining > 0 ? ((chaseTarget - score) / ballsRemaining) * 6 : 0;
    const currentRR = ballNum > 0 ? (score / ballNum) * 6 : requiredRR;
    // requiredRR/currentRR above already track the assigned band's target
    // score continuously ball-by-ball (chaseTarget is the band target for
    // non-winners), so pressureFactor alone is the steering mechanism — no
    // separate death-overs correction needed on top of it. Winners get a
    // much wider positive ceiling (guaranteeing they can always accelerate
    // enough to cross 301 before the innings ends); losers get a wider
    // negative floor too, since a structurally-broken-but-individually-
    // skilled lineup may need real suppression to land in a low band.
    const pressureFactor = won
      ? Math.max(-0.5, Math.min(10, (requiredRR - currentRR) / 8))
      : Math.max(-3, Math.min(3, (requiredRR - currentRR) / 10));

    const battersFaced = batsmen[strikerIdx].balls;
    const newBatterFactor = battersFaced < 6 ? 1.35 - battersFaced * 0.05 : 1;

    // Hard-block the dismissal outcome for a pre-decided win once only the
    // last pair remains, so the guaranteed win can never be denied by an
    // unlucky all-out short of 301 (mirrors the loss-side score guardrail).
    const blockWicket = won && wickets === 9;

    const probs = buildProbabilities(phase, skillFactor, pressureFactor, newBatterFactor, blockWicket);
    // Once pressure is genuinely high, or only the last over remains, for a
    // pre-decided win, stop leaving it to chance and force a six. Tied to
    // ballsRemaining directly (not just the pressure clamp) since pressure
    // alone proved unreliable in testing — a handful of "win" sessions still
    // fell short at ball 120 despite the 10x probability boost. This is a
    // guardrail, not meant to be "fair" once it engages.
    const mustScore = won && (ballsRemaining <= 6 || pressureFactor >= 4);
    const outcome: OutcomeKey = mustScore ? 6 : sampleOutcome(probs, rand);

    ballNum++;
    let milestone: number | null = null;
    let dismissedSlot: number | null = null;

    if (outcome === 'W') {
      wickets++;
      batsmen[strikerIdx].balls++;
      batsmen[strikerIdx].out = true;
      dismissedSlot = batsmen[strikerIdx].slot;
      if (nextInIdx < 11) {
        strikerIdx = nextInIdx;
        nextInIdx++;
      }
    } else {
      let runs = outcome as number;
      // Hard ceiling guardrail: a losing session can never cross its own
      // sampled target score (this subsumes "never cross 301", since every
      // loss band's target sits below it). Soft pressure-based suppression
      // alone can't guarantee this — it can only slow future scoring, not
      // undo runs an elite-but-structurally-broken lineup already banked
      // early. Capping at the specific per-session targetScore (rather than
      // the band's outer max) also means different sessions land on
      // different final numbers within the band instead of all bunching at
      // the same ceiling value.
      if (!won && targetScore !== null && score + runs >= targetScore) runs = 0;
      score += runs;
      batsmen[strikerIdx].runs += runs;
      batsmen[strikerIdx].balls++;
      for (const m of [50, 100, 150, 200, 250, 300]) {
        if (score >= m && !milestonesHit.has(m)) {
          milestonesHit.add(m);
          milestone = m;
        }
      }
      if (runs === 1 || runs === 3) {
        const tmp = strikerIdx;
        strikerIdx = nonStrikerIdx;
        nonStrikerIdx = tmp;
      }
    }

    if (ballNum % 6 === 0 && wickets < 10) {
      const tmp = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = tmp;
    }

    balls.push({
      ballNum,
      over,
      ballInOver: ((ballNum - 1) % 6) + 1,
      outcome,
      scoreAfter: score,
      wicketsAfter: wickets,
      strikerSlot: batsmen[strikerIdx].slot,
      milestone,
      dismissedSlot,
    });

    if (won && score >= 301) break;
    if (wickets >= 10) break;
  }

  // Absolute last-resort guarantee: in rare cases (~a few percent in
  // testing) bad luck still leaves a pre-decided win short at ball 120
  // despite the deterministic endgame above. A "win" session ever showing a
  // sub-301 score would read as a visible bug, so top up with legal boundary
  // outcomes (extending past ball 120 only in this fallback path) rather
  // than leave it inconsistent.
  while (won && score < 301 && wickets < 10) {
    const runs: OutcomeKey = 301 - score <= 4 ? 4 : 6;
    ballNum++;
    score += runs;
    batsmen[strikerIdx].runs += runs;
    batsmen[strikerIdx].balls++;
    let milestone: number | null = null;
    for (const m of [50, 100, 150, 200, 250, 300]) {
      if (score >= m && !milestonesHit.has(m)) {
        milestonesHit.add(m);
        milestone = m;
      }
    }
    balls.push({
      ballNum,
      over: Math.floor((ballNum - 1) / 6),
      ballInOver: ((ballNum - 1) % 6) + 1,
      outcome: runs,
      scoreAfter: score,
      wicketsAfter: wickets,
      strikerSlot: batsmen[strikerIdx].slot,
      milestone,
      dismissedSlot: null,
    });
  }

  return {
    balls,
    batsmen,
    finalScore: score,
    finalWickets: wickets,
    ballsBowled: ballNum,
    won: won && score >= 301,
  };
}
