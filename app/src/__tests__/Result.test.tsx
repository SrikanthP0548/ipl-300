import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Result } from '../pages/Result';
import { resultResponse, teamSeason } from '../test/fixtures';

const useGameMock = vi.fn();
vi.mock('../GameContext', () => ({
  useGame: () => useGameMock(),
}));

const submitLeaderboardEntryMock = vi.fn();
vi.mock('../api', () => ({
  submitLeaderboardEntry: (...args: unknown[]) => submitLeaderboardEntryMock(...args),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

afterEach(() => {
  useGameMock.mockReset();
  submitLeaderboardEntryMock.mockReset();
  navigateMock.mockReset();
});

function renderResult(overrides: Parameters<typeof resultResponse>[0] = {}) {
  const team = teamSeason({ id: 'team-1' });
  useGameMock.mockReturnValue({
    result: resultResponse(overrides),
    draft: { poolIds: [team.id], pool: [team] },
    allPlayersById: new Map(),
    startSession: vi.fn(),
  });
  return render(
    <MemoryRouter>
      <Result />
    </MemoryRouter>,
  );
}

describe('Result leaderboard entry', () => {
  it('shows the name-entry form on a win and submits it to the leaderboard', async () => {
    submitLeaderboardEntryMock.mockResolvedValueOnce({ ok: true, duplicate: false });
    const user = userEvent.setup();
    renderResult({ won: true, reason: 'win', finalScore: 305, finalWickets: 4, ballsBowled: 116 });

    const input = screen.getByPlaceholderText(/your name/i);
    await user.type(input, 'Test Player');
    await user.click(screen.getByRole('button', { name: /submit score/i }));

    expect(await screen.findByText(/you're on the board/i)).toBeInTheDocument();
    expect(submitLeaderboardEntryMock).toHaveBeenCalledWith(
      'Test Player',
      ['team-1'],
      expect.objectContaining({ finalScore: 305, finalWickets: 4, ballsBowled: 116 }),
    );
    expect(screen.getByRole('link', { name: /view leaderboard/i })).toHaveAttribute('href', '/leaderboard');
  });

  it('does not show the name-entry form when the chase was lost', () => {
    renderResult({ won: false, reason: 'choke', finalScore: 296, finalWickets: 9 });

    expect(screen.queryByPlaceholderText(/your name/i)).not.toBeInTheDocument();
  });
});
