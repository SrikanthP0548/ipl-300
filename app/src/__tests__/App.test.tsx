import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { player, squadsResponse, teamSeason } from '../test/fixtures';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  window.location.hash = '';
});

describe('App', () => {
  it('starts a draft session and routes to the build screen', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(squadsResponse()));
    const user = userEvent.setup();

    render(<App />);
    expect(screen.getByRole('heading', { name: /ipl-300/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /build your xi/i }));

    expect(await screen.findByText(/selected team xi/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/squads');
  });

  it('shows a friendly error when the squad request fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'server down' }, { status: 500 }));
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: /build your xi/i }));

    expect(await screen.findByText(/couldn't reach the game server/i)).toBeInTheDocument();
  });

  it('keeps hidden score preference while drafting', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(squadsResponse()));
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: /hidden/i }));
    await user.click(screen.getByRole('button', { name: /build your xi/i }));

    expect(await screen.findAllByText('•••', {}, { timeout: 3500 })).toHaveLength(2);
  }, 6000);

  it('only allows one manual skip for the whole draft', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        squadsResponse({
          pool: [
            teamSeason({ id: 'team-a', franchise: 'Team A', season: 2011 }),
            teamSeason({ id: 'team-b', franchise: 'Team B', season: 2012 }),
            teamSeason({ id: 'team-c', franchise: 'Team C', season: 2013 }),
          ],
        }),
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: /build your xi/i }));

    const skipButton = await screen.findByRole('button', { name: /skip team/i }, { timeout: 3500 });
    await user.click(skipButton);

    const usedButton = await screen.findByRole('button', { name: /skip used/i }, { timeout: 3500 });
    expect(usedButton).toBeDisabled();

    await user.click(usedButton);
    // Still on the second team-season - the disabled click was a no-op, not a second skip.
    expect(screen.getByText(/Team B/)).toBeInTheDocument();
  }, 8000);

  it('lets a player be expanded and placed into a lineup slot', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        squadsResponse({
          pool: [
            teamSeason({
              players: [player({ id: 'opener-1', name: 'Opener One', minPos: 1, maxPos: 2 })],
            }),
          ],
        }),
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole('button', { name: /build your xi/i }));
    await screen.findByText(/selected team xi/i);

    await user.click(await screen.findByText('Opener One', {}, { timeout: 3500 }));
    await user.click(screen.getByRole('button', { name: '1' }));

    await waitFor(() => expect(screen.getByText('1/11')).toBeInTheDocument());
    expect(screen.getByText('One')).toBeInTheDocument();
  }, 6000);
});
