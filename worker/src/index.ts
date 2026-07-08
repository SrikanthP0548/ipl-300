import type { Env, Player, TeamSeason } from './types';
import { pickSquadPool, ALL_TEAM_SEASONS } from './squads';
import { sign, verify } from './sign';
import { evaluateEligibility, pickBand, WIN_LOTTERY_RATE } from './eligibility';
import { simulateChase } from './simulate';

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function error(message: string, env: Env, status = 400): Response {
  return json({ error: message }, env, status);
}

async function handleSquads(env: Env): Promise<Response> {
  const pool = pickSquadPool();
  const poolIds = pool.map((t) => t.id);
  const poolToken = await sign(poolIds.join(','), env.POOL_SECRET);
  return json({ pool, poolIds, poolToken }, env);
}

interface ResultBody {
  poolIds?: string[];
  poolToken?: string;
  arrangement?: Record<string, string>; // slot (as string "1".."11") -> playerId
}

const TEAM_SEASON_BY_ID = new Map<string, TeamSeason>(ALL_TEAM_SEASONS.map((t) => [t.id, t]));

function playerLookup(pool: TeamSeason[]): Map<string, { player: Player; teamSeasonId: string }> {
  const map = new Map<string, { player: Player; teamSeasonId: string }>();
  for (const t of pool) {
    for (const p of t.players) map.set(p.id, { player: p, teamSeasonId: t.id });
  }
  return map;
}

async function handleResult(request: Request, env: Env): Promise<Response> {
  let body: ResultBody;
  try {
    body = await request.json();
  } catch {
    return error('invalid JSON body', env);
  }

  const { poolIds, poolToken, arrangement } = body;
  if (!Array.isArray(poolIds) || typeof poolToken !== 'string' || !arrangement) {
    return error('missing poolIds, poolToken, or arrangement', env);
  }

  const validToken = await verify(poolIds.join(','), poolToken, env.POOL_SECRET);
  if (!validToken) return error('invalid or tampered poolToken', env, 403);

  const pool = poolIds.map((id) => TEAM_SEASON_BY_ID.get(id)).filter((t): t is TeamSeason => !!t);
  if (pool.length !== poolIds.length) return error('unknown team-season id in poolIds', env);

  const lookup = playerLookup(pool);

  const battingOrder: Player[] = [];
  const usedTeamSeasons = new Set<string>();
  for (let slot = 1; slot <= 11; slot++) {
    const playerId = arrangement[String(slot)];
    if (!playerId) return error(`slot ${slot} is not filled`, env);
    const entry = lookup.get(playerId);
    if (!entry) return error(`player ${playerId} is not part of the issued pool`, env);
    const { player, teamSeasonId } = entry;
    if (usedTeamSeasons.has(teamSeasonId)) {
      return error(`team-season ${teamSeasonId} supplied more than one player (max 1 allowed)`, env);
    }
    if (slot < player.minPos || slot > player.maxPos) {
      return error(`player ${player.name} cannot legally bat at slot ${slot}`, env);
    }
    usedTeamSeasons.add(teamSeasonId);
    battingOrder.push(player);
  }

  const elig = evaluateEligibility(battingOrder);
  const won = elig.eligible && Math.random() < WIN_LOTTERY_RATE;
  const band = pickBand(elig, won);
  const target = band.reason === 'win' ? null : { min: band.targetMin, max: band.targetMax };
  const seed = Math.floor(Math.random() * 2 ** 31);

  const sim = simulateChase(battingOrder, won, target, seed);

  const bestPerformer = sim.batsmen
    .map((b) => {
      const player = battingOrder[b.slot - 1];
      const impact = b.runs * (((player.battingScore ?? 0) + (player.finishingScore ?? 0)) / 2) / 100;
      return { ...b, impact };
    })
    .sort((a, b) => b.impact - a.impact)[0];

  const resultSummary = `${sim.finalScore}:${sim.finalWickets}:${sim.ballsBowled}:${poolIds.join(',')}`;
  const resultToken = await sign(resultSummary, env.POOL_SECRET);

  return json(
    {
      reason: band.reason,
      eligibility: elig,
      won: sim.won,
      finalScore: sim.finalScore,
      finalWickets: sim.finalWickets,
      ballsBowled: sim.ballsBowled,
      balls: sim.balls,
      batsmen: sim.batsmen,
      bestPerformer: bestPerformer
        ? { slot: bestPerformer.slot, name: bestPerformer.name, runs: bestPerformer.runs, balls: bestPerformer.balls }
        : null,
      resultToken,
    },
    env,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === '/api/squads' && request.method === 'GET') {
      return handleSquads(env);
    }

    if (url.pathname === '/api/result' && request.method === 'POST') {
      return handleResult(request, env);
    }

    return error('not found', env, 404);
  },
};
