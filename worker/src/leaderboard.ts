import type { Env } from './types';

const MAX_NAME_LENGTH = 24;
const ENTRIES_PER_RANGE = 20;

export type LeaderboardRange = 'today' | 'week' | 'alltime';

export interface LeaderboardEntry {
  name: string;
  score: number;
  wickets: number;
  balls: number;
  createdAt: number;
}

export function sanitizeName(raw: string): string | null {
  const name = raw.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

function rangeStart(range: LeaderboardRange, now: number): number | null {
  if (range === 'alltime') return null;
  if (range === 'today') {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return now - 7 * 24 * 60 * 60 * 1000;
}

export async function insertLeaderboardEntry(
  env: Env,
  entry: { name: string; score: number; wickets: number; balls: number; resultToken: string },
): Promise<'inserted' | 'duplicate'> {
  try {
    await env.DB.prepare(
      'INSERT INTO leaderboard (name, score, wickets, balls, result_token, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(entry.name, entry.score, entry.wickets, entry.balls, entry.resultToken, Date.now())
      .run();
    return 'inserted';
  } catch (e) {
    // UNIQUE constraint on result_token - the same simulated result was already submitted.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) return 'duplicate';
    throw e;
  }
}

export async function fetchLeaderboard(env: Env, range: LeaderboardRange): Promise<LeaderboardEntry[]> {
  const since = rangeStart(range, Date.now());
  const query = since === null
    ? env.DB.prepare(
        'SELECT name, score, wickets, balls, created_at as createdAt FROM leaderboard ORDER BY score DESC, balls ASC LIMIT ?',
      ).bind(ENTRIES_PER_RANGE)
    : env.DB.prepare(
        'SELECT name, score, wickets, balls, created_at as createdAt FROM leaderboard WHERE created_at >= ? ORDER BY score DESC, balls ASC LIMIT ?',
      ).bind(since, ENTRIES_PER_RANGE);

  const { results } = await query.all<LeaderboardEntry>();
  return results;
}
