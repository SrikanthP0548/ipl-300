import type { ReasonCode } from './types';

export const ANALYSIS_COPY: Record<ReasonCode, string[]> = {
  win: [
    'A clinical chase — the top order set the platform and the finishers closed it out without alarm.',
    'Every phase clicked. The powerplay gave them a platform, the middle overs kept the rate ticking, and the finish was academic.',
    'This is what an elite XI looks like under a 301 target — no panic, no rescue act needed, just relentless scoring.',
  ],
  blowup: [
    'It was there to be won, and for a while it looked won — then the middle order fell apart in a rush and the required rate never recovered.',
    'A genuinely elite side that imploded at the worst possible moment. The wickets came in a cluster and the chase never found its footing again.',
    'Everything pointed to a famous chase until a sudden collapse turned certainty into a scramble that fell just short.',
  ],
  choke: [
    "Genuinely unlucky — the asking rate crept away in the closing overs and there wasn't quite enough left to find it.",
    'No single moment lost this. The required rate just edged ahead, over by over, until the gap was too wide to close.',
    'A side good enough to win this nine times out of ten just happened to play the tenth. The margin was razor thin.',
  ],
  whisker: [
    'So nearly there. This XI sat right on the edge of genuinely elite and the chase reflected exactly that — close, but not quite enough depth to push all the way.',
    "A whisker short of the bar that separates 'very good' from 'built to win it'. The batting held up, the margin was just too fine.",
    'This lineup did almost everything right — it just didn’t have that extra layer of class the very best sides carry.',
  ],
  short_batting: [
    "The top order came up short of what a 301 chase demands — a couple of genuine gears never materialized, and the chase paid for it.",
    "Runs were always going to be hard to find with the batting stretched this thin. The scoreboard reflects exactly that shortfall.",
    "This XI needed more class through the order to have a real chance — the gap in the middle overs proved too costly.",
  ],
  attack_heartbreak: [
    "Batting and firepower both fell short of what this chase demanded — too many soft phases, not enough depth to cover them.",
    "This lineup was undercooked on more than one front. When the top order stalled, there wasn't a strong enough finish to bail it out.",
    "A lineup missing real depth in more than one place — the cracks showed early and never got papered over.",
  ],
  structurally_broken: [
    "This XI was never built to finish the job — missing a keeper or genuine bowling depth undermines the whole structure, no matter how the top order looks on paper.",
    "The individual talent was there, but the lineup itself was flawed from the start. A team needs a keeper and real bowling options to be taken seriously.",
    "Good players, broken structure. Without the fundamentals in place, this chase was compromised before the first ball was bowled.",
  ],
};

export function pickAnalysis(reason: ReasonCode, seed: string): string {
  const options = ANALYSIS_COPY[reason];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return options[hash % options.length];
}

export function headlineFor(reason: ReasonCode, score: number, wickets: number, ballsBowled: number): string {
  if (reason === 'win') {
    const ballsSpare = 120 - ballsBowled;
    return `Chased down with ${ballsSpare} ball${ballsSpare === 1 ? '' : 's'} to spare!`;
  }
  const need = Math.max(0, 301 - score);
  if (wickets >= 10) return `All out for ${score} — fell ${need} short.`;
  return `Finished on ${score}/${wickets} — fell ${need} short.`;
}
