import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSquads, submitLineup } from '../api';
import { resultResponse, squadsResponse } from '../test/fixtures';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe('api', () => {
  it('fetches squads from the configured API base', async () => {
    const body = squadsResponse();
    fetchMock.mockResolvedValueOnce(Response.json(body));

    await expect(fetchSquads()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/squads');
  });

  it('posts lineups with the expected JSON payload', async () => {
    const body = resultResponse();
    fetchMock.mockResolvedValueOnce(Response.json(body));

    await expect(submitLineup(['team-1'], 'token', { 1: 'player-1' })).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolIds: ['team-1'], poolToken: 'token', arrangement: { 1: 'player-1' } }),
    });
  });

  it('uses server error messages when requests fail', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'lineup is invalid' }, { status: 400 }));

    await expect(fetchSquads()).rejects.toThrow('lineup is invalid');
  });
});
