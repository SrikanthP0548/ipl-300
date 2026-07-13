import type { LeaderboardEntry, LeaderboardRange, ResultResponse, SquadsResponse } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore, use default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function fetchSquads(): Promise<SquadsResponse> {
  return fetch(`${API_BASE}/api/squads`).then((r) => asJson<SquadsResponse>(r));
}

export function submitLineup(
  poolIds: string[],
  poolToken: string,
  arrangement: Record<string, string>,
): Promise<ResultResponse> {
  return fetch(`${API_BASE}/api/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poolIds, poolToken, arrangement }),
  }).then((r) => asJson<ResultResponse>(r));
}

export function submitLeaderboardEntry(
  name: string,
  poolIds: string[],
  result: Pick<ResultResponse, 'finalScore' | 'finalWickets' | 'ballsBowled' | 'resultToken'>,
): Promise<{ ok: true; duplicate: boolean }> {
  return fetch(`${API_BASE}/api/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      poolIds,
      finalScore: result.finalScore,
      finalWickets: result.finalWickets,
      ballsBowled: result.ballsBowled,
      resultToken: result.resultToken,
    }),
  }).then((r) => asJson<{ ok: true; duplicate: boolean }>(r));
}

export function fetchLeaderboard(range: LeaderboardRange): Promise<{ entries: LeaderboardEntry[] }> {
  return fetch(`${API_BASE}/api/leaderboard?range=${range}`).then((r) => asJson<{ entries: LeaderboardEntry[] }>(r));
}
