import type { ResultResponse, SquadsResponse } from './types';

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
