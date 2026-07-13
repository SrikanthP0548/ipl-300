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
