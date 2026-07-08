import re, csv, math, statistics
from pathlib import Path

REPO = Path("/home/user/ipl-300")

FILES = {
    2008: "ipl_2008_team_best_xi.md",
    2009: "ipl_2009_team_best_xi_role_based.md",
    2010: "ipl_2010_team_best_xi_role_based.md",
    2011: "ipl_2011_team_best_xi_role_based.md",
    2012: "ipl_2012_team_best_xi_role_based.md",
    2013: "ipl_2013_team_best_xi_role_based_complete_fields.md",
    2014: "ipl_2014_team_best_xi_role_based.md",
    2015: "ipl_2015_team_best_xi_role_based.md",
    2016: "ipl_2016_team_best_xi_role_based_complete_fields.md",
    2017: "ipl_2017_team_best_xi_role_based.md",
    2018: "ipl_2018_team_best_xi_role_based_complete_fields.md",
    2019: "ipl_2019_team_best_xi_role_based.md",
    2020: "ipl_2020_team_best_xi_role_based_complete_fields.md",
    2021: "ipl_2021_team_best_xi_role_based.md",
    2022: "ipl_2022_team_best_xi_role_based.md",
    2023: "ipl_2023_team_best_xi_role_based.md",
    2024: "ipl_2024_team_best_xi_role_based.md",
    2025: "ipl_2025_team_best_xi_role_based.md",
    2026: "ipl_2026_team_best_xi_role_based.md",
}

TEAMS = [
    "Chennai Super Kings", "Deccan Chargers", "Delhi Capitals", "Gujarat Lions",
    "Gujarat Titans", "Kochi Tuskers Kerala", "Kolkata Knight Riders",
    "Lucknow Super Giants", "Mumbai Indians", "Pune Warriors", "Punjab Kings",
    "Rajasthan Royals", "Rising Pune Supergiant", "Royal Challengers Bengaluru",
    "Sunrisers Hyderabad",
]

BAT_ALIASES = {
    'mat': 'mat', 'inns': 'inns', 'no': 'no', '50s': 'fifties', '100s': 'hundreds',
    '0s': 'ducks', '4s': 'fours', '6s': 'sixes', 'hs': 'hs', 'runs': 'runs',
    'bf': 'bf', 'sr': 'sr', 'avg': 'avg', 'ca': 'ca', 'st': 'st',
}
BOWL_ALIASES = {
    'mat': 'mat', 'inns': 'inns', 'o': 'overs', 'overs': 'overs', 'm': 'maidens',
    'r': 'runsconceded', 'runs': 'runsconceded', 'w': 'wickets', 'wkts': 'wickets',
    'best': 'best', '4w': 'fourw', 'avg': 'avg', 'sr': 'sr', 'er': 'econ', 'econ': 'econ',
}


def norm(h):
    h = h.strip().lower()
    if h.startswith('bat '):
        h = h[4:]
    if h.startswith('bowl '):
        h = h[5:]
    h = h.replace('/', '').replace('%', '').strip()
    return h


def overs_to_balls(s):
    """Cricket overs notation: 4.5 = 4 overs + 5 balls = 29 balls, not 4.5 decimal overs."""
    s = (s or '').strip()
    if not s:
        return None
    try:
        if '.' in s:
            whole, frac = s.split('.', 1)
            whole = int(whole) if whole else 0
            balls = int(frac[0]) if frac else 0
        else:
            whole = int(s)
            balls = 0
        return whole * 6 + balls
    except ValueError:
        return None


def to_float(s):
    s = (s or '').strip().replace('%', '').replace('*', '')
    if s == '' or s == '-':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(s):
    v = to_float(s)
    return int(v) if v is not None else None


def parse_table(lines, start_idx):
    """Given lines and the index of the header row, return (header_cells, data_rows, next_idx)."""
    header = [c.strip() for c in lines[start_idx].strip().strip('|').split('|')]
    i = start_idx + 2  # skip header + separator
    rows = []
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith('|'):
            break
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) == len(header):
            rows.append(cells)
        i += 1
    return header, rows, i


def find_bowl_start(header_norm):
    for idx, h in enumerate(header_norm):
        raw = h
        if raw in ('mat', 'inns', 'o', 'overs', 'm', 'r', 'runs', 'w', 'wkts', 'best', '4w', 'avg', 'sr', 'er', 'econ'):
            continue
    return None


def classify_columns(header):
    """Return (role_idx, player_idx, bat_map, bowl_map) where *_map: canonical_field -> column_idx."""
    role_idx = player_idx = None
    for idx, h in enumerate(header):
        hl = h.strip().lower()
        if hl == 'role':
            role_idx = idx
        elif hl == 'player':
            player_idx = idx
    # find where bowling columns start: first column (after player_idx) whose raw name starts with "bowl"
    bowl_start = None
    for idx, h in enumerate(header):
        if idx <= player_idx:
            continue
        if h.strip().lower().startswith('bowl'):
            bowl_start = idx
            break
    if bowl_start is None:
        bowl_start = len(header)

    bat_map, bowl_map = {}, {}
    for idx, h in enumerate(header):
        if idx <= player_idx or idx == role_idx:
            continue
        n = norm(h)
        if idx < bowl_start:
            if n in BAT_ALIASES:
                bat_map[BAT_ALIASES[n]] = idx
        else:
            if n in BOWL_ALIASES:
                bowl_map[BOWL_ALIASES[n]] = idx
    return role_idx, player_idx, bat_map, bowl_map


def extract_players(text, season):
    lines = text.split('\n')
    team_blocks = []  # (team_name, start_line_idx, end_line_idx)
    header_re = re.compile(r'^(#{2,3})\s+(.*)$')
    matches = []
    for i, line in enumerate(lines):
        m = header_re.match(line.strip())
        if m:
            matches.append((i, m.group(2).strip()))
    for idx, (line_i, title) in enumerate(matches):
        team_name = None
        for t in TEAMS:
            if title == t or title.startswith(t + ' '):
                team_name = t
                break
        if team_name is None:
            continue
        end = matches[idx + 1][0] if idx + 1 < len(matches) else len(lines)
        team_blocks.append((team_name, line_i, end))

    players = []
    for team_name, start, end in team_blocks:
        block = lines[start:end]
        header_idx = None
        for i, line in enumerate(block):
            if line.strip().startswith('|') and 'player' in line.lower():
                header_idx = i
                break
        if header_idx is None:
            continue
        header, rows, _ = parse_table(block, header_idx)
        role_idx, player_idx, bat_map, bowl_map = classify_columns(header)
        if player_idx is None:
            continue
        for pos, row in enumerate(rows, start=1):
            name = row[player_idx]
            role = row[role_idx] if role_idx is not None else ''
            rec = {
                'season': season, 'team': team_name, 'pos': pos, 'name': name, 'role': role,
            }
            for field, ci in bat_map.items():
                rec['bat_' + field] = row[ci]
            for field, ci in bowl_map.items():
                rec['bowl_' + field] = row[ci]
            players.append(rec)
    return players


# (BattingFloor, FinishingFloor, PriorWeight)
ROLE_TABLE = {
    'Opener':               (65.0, 45.0, 18.0),
    'Top-order Batter':     (62.0, 48.0, 18.0),
    'Middle-order Batter':  (56.0, 52.0, 20.0),
    'Wicketkeeper Batter':  (56.0, 55.0, 20.0),
    'Finisher':             (48.0, 62.0, 24.0),
    'Batting All-rounder':  (55.0, 55.0, 22.0),
    'Bowling All-rounder':  (42.0, 48.0, 26.0),
    'Spinner':              (30.0, 38.0, 30.0),
    'Pacer':                (28.0, 35.0, 32.0),
    'Specialist Bowler':    (25.0, 32.0, 34.0),
}


def classify_role(role_text):
    r = (role_text or '').lower()
    if 'keeper' in r or re.search(r'\bwk\b', r):
        return 'Wicketkeeper Batter'
    if 'opener' in r:
        return 'Opener'
    if 'finisher' in r:
        return 'Finisher'
    if 'batting all-rounder' in r or 'batting all rounder' in r:
        return 'Batting All-rounder'
    if 'all-rounder' in r or 'all rounder' in r:
        return 'Bowling All-rounder'
    if 'top order' in r or 'top-order' in r or 'no. 3' in r or 'top/middle' in r:
        return 'Top-order Batter'
    if 'middle order' in r or 'middle-order' in r:
        return 'Middle-order Batter'
    if 'spin' in r:
        return 'Spinner'
    if 'pace' in r or 'pacer' in r or 'seam' in r or 'new-ball' in r or 'medium' in r:
        return 'Pacer'
    if any(k in r for k in ('bowl', 'wicket-taking')):
        return 'Specialist Bowler'
    return 'Middle-order Batter'


def build_player_metrics(rec):
    """Convert raw string fields into numeric derived batting/bowling inputs."""
    inns = to_int(rec.get('bat_inns'))
    runs = to_int(rec.get('bat_runs'))
    bf = to_int(rec.get('bat_bf'))
    sr = to_float(rec.get('bat_sr'))
    no = to_int(rec.get('bat_no'))
    fifties = to_int(rec.get('bat_fifties')) or 0
    hundreds = to_int(rec.get('bat_hundreds')) or 0
    sixes = to_int(rec.get('bat_sixes')) or 0

    m = {
        'inns': inns or 0, 'runs': runs or 0, 'bf': bf or 0, 'sr': sr,
        'no': no or 0, 'fifties': fifties, 'hundreds': hundreds, 'sixes': sixes,
    }

    bowl_inns = to_int(rec.get('bowl_inns'))
    overs_balls = overs_to_balls(rec.get('bowl_overs'))
    wickets = to_int(rec.get('bowl_wickets'))
    runsconceded = to_int(rec.get('bowl_runsconceded'))
    econ = to_float(rec.get('bowl_econ'))
    bowlavg = to_float(rec.get('bowl_avg'))
    bowlsr = to_float(rec.get('bowl_sr'))
    fourw = to_int(rec.get('bowl_fourw')) or 0

    bm = {
        'bowl_inns': bowl_inns or 0,
        'overs_balls': overs_balls or 0,
        'wickets': wickets or 0,
        'runsconceded': runsconceded,
        'econ': econ,
        'bowlavg': bowlavg,
        'bowlsr': bowlsr,
        'fourw': fourw,
    }
    return m, bm


def compute_all_players():
    all_players = []
    for season, fname in FILES.items():
        text = (REPO / fname).read_text()
        players = extract_players(text, season)
        all_players.extend(players)

    for rec in all_players:
        m, bm = build_player_metrics(rec)
        rec['_bat'] = m
        rec['_bowl'] = bm

    # ---- per-season baselines (approximated from Best-XI-only pool, per user's stopgap decision) ----
    seasons = sorted(set(r['season'] for r in all_players))
    season_bat_baseline = {}
    season_bowl_baseline = {}
    team_bat_baseline = {}   # (season, team) -> avg sr
    team_bowl_baseline = {}  # (season, team) -> (econ, sr, avg)

    for season in seasons:
        srec = [r for r in all_players if r['season'] == season]
        tot_runs = sum(r['_bat']['runs'] for r in srec)
        tot_bf = sum(r['_bat']['bf'] for r in srec)
        season_bat_baseline[season] = (tot_runs / tot_bf * 100) if tot_bf else 130.0

        tot_bruns = sum((r['_bowl']['runsconceded'] or 0) for r in srec if r['_bowl']['overs_balls'] > 0)
        tot_balls = sum(r['_bowl']['overs_balls'] for r in srec)
        tot_wkts = sum(r['_bowl']['wickets'] for r in srec)
        season_bowl_baseline[season] = {
            'economy': (tot_bruns / (tot_balls / 6)) if tot_balls else 8.0,
            'sr': (tot_balls / tot_wkts) if tot_wkts else 20.0,
            'avg': (tot_bruns / tot_wkts) if tot_wkts else 28.0,
        }

        for team in TEAMS:
            trec = [r for r in srec if r['team'] == team]
            if not trec:
                continue
            t_runs = sum(r['_bat']['runs'] for r in trec)
            t_bf = sum(r['_bat']['bf'] for r in trec)
            team_bat_baseline[(season, team)] = (t_runs / t_bf * 100) if t_bf else season_bat_baseline[season]

            t_bruns = sum((r['_bowl']['runsconceded'] or 0) for r in trec if r['_bowl']['overs_balls'] > 0)
            t_balls = sum(r['_bowl']['overs_balls'] for r in trec)
            t_wkts = sum(r['_bowl']['wickets'] for r in trec)
            team_bowl_baseline[(season, team)] = {
                'economy': (t_bruns / (t_balls / 6)) if t_balls else season_bowl_baseline[season]['economy'],
                'sr': (t_balls / t_wkts) if t_wkts else season_bowl_baseline[season]['sr'],
                'avg': (t_bruns / t_wkts) if t_wkts else season_bowl_baseline[season]['avg'],
            }

    # ---- raw scores ----
    for rec in all_players:
        season, team = rec['season'], rec['team']
        bat, bowl = rec['_bat'], rec['_bowl']

        # ---------- Batting / Finishing ----------
        if bat['inns'] <= 0 or bat['sr'] is None:
            rec['BattingPowerRaw'] = None
            rec['FinishingPowerRaw'] = None
        else:
            season_sr = season_bat_baseline[season]
            team_sr = team_bat_baseline.get((season, team), season_sr)
            season_adj = bat['sr'] / season_sr if season_sr else 1.0
            team_adj = bat['sr'] / team_sr if team_sr else season_adj
            adjusted_sr_index = 0.70 * season_adj + 0.30 * team_adj

            runs_per_inn = bat['runs'] / bat['inns']
            availability = min(1.0, bat['inns'] / 10.0)
            consistency = 1 + (bat['fifties'] * 0.04) + (bat['hundreds'] * 0.08)
            rec['BattingPowerRaw'] = runs_per_inn * adjusted_sr_index * availability * consistency

            not_out_rate = bat['no'] / bat['inns']
            sixes_per_inn = bat['sixes'] / bat['inns']
            balls_per_inn = (bat['bf'] / bat['inns']) if bat['bf'] else None
            not_out_idx = 1 + min(0.30, not_out_rate)
            boundary_idx = 1 + min(0.30, sixes_per_inn * 0.06)
            ball_eff_idx = 1 + min(0.20, max(0.0, (25 - balls_per_inn) / 50)) if balls_per_inn is not None else 1.0
            finishing_sample = min(1.0, bat['inns'] / 8.0)
            rec['FinishingPowerRaw'] = (
                math.sqrt(max(0.0, runs_per_inn)) * adjusted_sr_index * not_out_idx
                * boundary_idx * ball_eff_idx * finishing_sample
            )

        # ---------- Bowling / Economy ----------
        if (bowl['bowl_inns'] <= 0 or bowl['overs_balls'] <= 0 or bowl['wickets'] == 0
                or not bowl['bowlsr'] or not bowl['bowlavg']):
            rec['BowlingPowerRaw'] = None
        else:
            sb = season_bowl_baseline[season]
            tb = team_bowl_baseline.get((season, team), sb)
            adj_strike = 0.70 * (sb['sr'] / bowl['bowlsr']) + 0.30 * (tb['sr'] / bowl['bowlsr'])
            adj_avg = 0.70 * (sb['avg'] / bowl['bowlavg']) + 0.30 * (tb['avg'] / bowl['bowlavg'])
            wpbi = bowl['wickets'] / bowl['bowl_inns']
            availability = min(1.0, bowl['bowl_inns'] / 10.0)
            consistency = 1 + (bowl['fourw'] * 0.08)
            rec['BowlingPowerRaw'] = (
                wpbi * (adj_strike ** 0.60) * (adj_avg ** 0.40) * availability * consistency
            )
            rec['_wpbi'] = wpbi

        if bowl['overs_balls'] <= 0 or not bowl['econ']:
            rec['EconomyPowerRaw'] = None
        else:
            sb = season_bowl_baseline[season]
            tb = team_bowl_baseline.get((season, team), sb)
            adj_econ = 0.70 * (sb['economy'] / bowl['econ']) + 0.30 * (tb['economy'] / bowl['econ'])
            overs_factor = min(1.0, (bowl['overs_balls'] / 6) / 24.0)
            wpbi = rec.get('_wpbi', (bowl['wickets'] / bowl['bowl_inns']) if bowl['bowl_inns'] else 0.0)
            wicket_bonus = 1 + min(0.15, wpbi * 0.10)
            rec['EconomyPowerRaw'] = math.sqrt(max(0.0, adj_econ)) * overs_factor * wicket_bonus

    # ---- per-season percentile normalization ----
    def percentile_rank(values_with_idx):
        """values_with_idx: list of (idx, value). Returns dict idx -> percentile (0-100)."""
        valid = [(i, v) for i, v in values_with_idx if v is not None]
        valid.sort(key=lambda x: x[1])
        n = len(valid)
        result = {}
        for rank, (i, v) in enumerate(valid):
            pct = (rank / (n - 1) * 100) if n > 1 else 100.0
            result[i] = pct
        return result

    for season in seasons:
        idxs = [i for i, r in enumerate(all_players) if r['season'] == season]
        for key, out in [('BattingPowerRaw', 'BattingPower'), ('FinishingPowerRaw', 'FinishingPower'),
                          ('BowlingPowerRaw', 'BowlingPower'), ('EconomyPowerRaw', 'EconomyPower')]:
            vals = [(i, all_players[i][key]) for i in idxs]
            pct = percentile_rank(vals)
            for i in idxs:
                all_players[i][out] = round(pct[i], 1) if i in pct else None

    # ---- role-based prior-weighted shrinkage: fades the floor as real balls faced grows, ----
    # ---- uncapped, using the player's role (not lineup position) to set the prior ----
    for rec in all_players:
        category = classify_role(rec['role'])
        rec['role_category'] = category
        bat_floor, fin_floor, prior_weight = ROLE_TABLE[category]

        bf = rec['_bat']['bf']
        actual_bat = rec['BattingPower'] if rec['BattingPower'] is not None else 0.0
        actual_fin = rec['FinishingPower'] if rec['FinishingPower'] is not None else 0.0

        rec['BattingPower'] = round(
            (actual_bat * bf + bat_floor * prior_weight) / (bf + prior_weight), 1
        )
        rec['FinishingPower'] = round(
            (actual_fin * bf + fin_floor * prior_weight) / (bf + prior_weight), 1
        )

    # ---- single display BOWLING_SCORE: simplified bowlingRating, no double-counted gap penalty ----
    def bowling_score(bowling_power, economy_power):
        if bowling_power is None or economy_power is None:
            return None
        B = bowling_power / 100.0
        E = economy_power / 100.0
        geometric_core = 100 * (B ** 0.60) * (E ** 0.40)
        lo, hi = 25.0, 96.0
        return round(lo + (hi - lo) * (max(0.0, geometric_core) / 100.0) ** 1.15, 1)

    for rec in all_players:
        rec['BowlingScore'] = bowling_score(rec.get('BowlingPower'), rec.get('EconomyPower'))

    return all_players


def main():
    all_players = compute_all_players()
    seasons = sorted(set(r['season'] for r in all_players))

    # ---- write full audit CSV (keeps raw BowlingPower/EconomyPower components) ----
    out_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/ipl_player_power_scores_full.csv"
    fields = ['Season', 'Team', 'POS', 'Name', 'Role', 'BattingPower', 'FinishingPower', 'BowlingPower', 'EconomyPower', 'BowlingScore']
    ordered = sorted(all_players, key=lambda r: (r['season'], TEAMS.index(r['team']) if r['team'] in TEAMS else 99, r['pos']))
    with open(out_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(fields)
        for r in ordered:
            w.writerow([
                r['season'], r['team'], r['pos'], r['name'], r['role'],
                r.get('BattingPower', ''), r.get('FinishingPower', ''), r.get('BowlingPower', ''),
                r.get('EconomyPower', ''), r.get('BowlingScore', ''),
            ])
    print('wrote', out_path, 'rows:', len(all_players))

    # ---- write clean display CSV: exactly the in-game XI table shape ----
    display_path = "/tmp/claude-0/-home-user-ipl-300/f3ec677b-388b-598c-a8d1-2914b979aaca/scratchpad/ipl_xi_display.csv"
    with open(display_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['SEASON', 'TEAM', 'POS', 'PLAYER', 'BATTING_SCORE', 'FINISHING_SCORE', 'BOWLING_SCORE'])
        for r in ordered:
            w.writerow([
                r['season'], r['team'], r['pos'], r['name'],
                r.get('BattingPower', ''), r.get('FinishingPower', ''),
                r.get('BowlingScore', '') if r.get('BowlingScore') is not None else '-',
            ])
    print('wrote', display_path)

    # sanity prints
    for season in seasons:
        n = sum(1 for r in all_players if r['season'] == season)
        print(season, 'players:', n)


if __name__ == '__main__':
    main()
