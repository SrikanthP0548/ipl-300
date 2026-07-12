export interface Player {
  id: string;
  name: string;
  role: string;
  roleCategory: string;
  roleBadge: 'Batter' | 'All-rounder' | 'Bowler' | 'Keeper';
  canonicalPos: number;
  minPos: number;
  maxPos: number;
  isKeeper: boolean;
  isOverseas: boolean;
  battingScore: number | null;
  finishingScore: number | null;
  bowlingScore: number | null;
}

export interface TeamSeason {
  id: string;
  franchise: string;
  season: number;
  players: Player[];
}

export interface Env {
  ALLOWED_ORIGIN: string;
  POOL_SECRET: string;
}
