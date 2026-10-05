"""A saved football career: four d20 decisions within shared-engine matches.

This adapts Era Ball's single-player career structure. Clubs are generated from
the permitted card pool, and the named avatar starts from a disclosed source
card. Progression and d20 modifiers are game rules, not measured player facts.
"""
from copy import deepcopy
import hashlib
import json
import random
import secrets

from .engine import Config, position_fit, role_score, rate_team, simulate_match
from .modes import generated_team, schedule, stable_seed, standings


CAREER_VERSION = 'career-1'
POSITIONS = ('ST', 'CM', 'CB', 'GK')
PLAYS = ('shoot', 'pass', 'dribble', 'tackle')
SKILLS = (*PLAYS, 'conditioning')
HABITS = {'teamwork': 'pass', 'composure': 'shoot', 'pressing': 'tackle'}
PLAYBOOKS = ('possession', 'counter', 'press')
ATTRIBUTES = {'shoot': 'shooting', 'pass': 'passing', 'dribble': 'dribbling',
              'tackle': 'defending', 'conditioning': 'physical'}
KIT = {'boots': 24, 'shin-pads': 20, 'recovery': 8}
MINUTES = (12, 35, 62, 84)
NAMES = ['Your Eleven'] + [f'Generated Club {i}' for i in range(1, 8)]
BOOKS = ('First contract', 'Finding space', 'A place in the side', 'Reading play',
         'Leading the press', 'A complete player', 'Club captain', 'Career complete')
ADAPTATION = (
    'Football adaptation of the reference single-player d20 career: four decisions '
    'per match, eight generated clubs, fourteen home-and-away rounds per season, '
    'then further seasons until level 20. The shared football simulator supplies '
    'surrounding play. D20 actions add chances or prevent existing goals; training, '
    'habits, playbooks, kit, trust, fatigue and injuries affect play. No historical '
    'league table, fitted career model, purchases or real-money rewards are implied.'
)
RULES = (
    'Attack check: d20 + attribute modifier + skill + tactical bonuses against '
    'opponent defence/control. A natural 1 fails and a natural 20 succeeds. Shoot '
    'then contests the keeper save; pass can create a teammate chance; dribble '
    'prepares the next action; tackle contests a defensive save and can prevent '
    'one existing opposition goal. Successful actions drain opponent Control. '
    'At zero Control, the next successful shoot/pass gains a chance and Control '
    'resets. Momentum helps the next action. Repeating a play attracts a -2 '
    'modifier after its second use. Every play costs Legs; a failed physical save '
    'costs more, and a natural 1 may cause a two-match injury. Training costs '
    '8 + 4 per existing rank, with five ranks per skill and three sessions between '
    'matches. Boots cost 24, shin pads 20, recovery supplies 8. Rest costs 6 and '
    'heals fatigue and injury. Coach/teammate/agent conversations cost 6/4/5 and '
    'are each available once between fixtures. Playbook changes cost zero. '
    'Every completed match grants 18 XP, +3 per successful action, +4 per added '
    'goal, +8 for a win or +4 for a draw. Every 40 XP adds a level, capped at 20. '
    'Credits: 24 per match, +8 win/+4 draw, +2 per successful action. Office '
    'actions give no XP. Participation alone reaches level 20 within 43 fixtures.'
)


def _seed(career, tag):
    return stable_seed(f"{career['seed']}:{career['version']}:{career['season']}:{career['round']}:{tag}")


def _log(career, message, **data):
    career['log'].append(dict(message=message, season=career['season'],
                              round=career['round'], **data))


def _max_legs(career):
    return 80 + 4 * career['skills']['conditioning']


def _avatar_team(career):
    """Progress only the fictional avatar; preserve the source card unchanged."""
    team = deepcopy(career['teams'][0])
    slot = team['starters'][career['slot_index']]
    player = slot['player']
    player['name'] = career['name']
    player['id'] = 'career-avatar-' + str(career['seed'])
    player['identity'] = player['id']
    player['lineage'] = 'Fictional career avatar; simulated progression from disclosed source card'
    for skill, attribute in ATTRIBUTES.items():
        player[attribute] = min(99, player[attribute] + 2 * career['skills'][skill])
    if career['position'] == 'GK':
        for key in ('gk_diving', 'gk_reflexes', 'gk_positioning'):
            player[key] = min(99, player[key] + 2 * career['skills']['tackle'])
        player['gk_kicking'] = min(99, player['gk_kicking'] + 2 * career['skills']['pass'])
    if 'boots' in career['inventory']:
        player['pace'] = min(99, player['pace'] + 2)
        player['dribbling'] = min(99, player['dribbling'] + 2)
    if 'shin-pads' in career['inventory']:
        player['defending'] = min(99, player['defending'] + 2)
    fatigue = max(0, _max_legs(career) - career['legs'])
    player['stamina'] = max(25, min(99, (player.get('stamina') or 78)
                                   + 3 * career['skills']['conditioning']
                                   - fatigue * .4 - 5 * bool(career['injury'])))
    if career['injury']:
        for key in ('pace', 'physical', 'dribbling'):
            player[key] = max(1, player[key] - 5)
    # Manager settings are tactical game proxies, as in the shared engine.
    team['manager']['possession'] = {'possession': .85, 'counter': .25, 'press': .55}[career['playbook']]
    team['manager']['press'] = .85 if career['playbook'] == 'press' else .45
    slot['fit'] = position_fit(player, slot['slot'])
    slot['role_score'] = role_score(player, slot['slot'], team.get('role_weights'))
    return team


def _options(career):
    office = career['phase'] == 'office' and not career['complete']
    train = []
    for skill in SKILLS:
        rank = career['skills'][skill]
        cost = 8 + 4 * rank
        train.append(dict(value=skill, label=f'{skill.title()} rank {rank}/5', cost=cost,
                          enabled=office and rank < 5 and career['training_count'] < 3
                          and career['credits'] >= cost))
    buy = [dict(value=key, label={'boots': 'Boots: pace/dribbling +2, action bonus +1',
                                  'shin-pads': 'Shin pads: defending +2, saves +1',
                                  'recovery': 'Recovery supply: +15 Legs before next match'}[key],
                cost=cost, enabled=office and career['credits'] >= cost
                and key not in career['inventory']) for key, cost in KIT.items()]
    talk = []
    for key, label, cost in [('coach', 'Coach: d20 for lasting trust, maximum +3', 6),
                              ('teammate', 'Teammate: d20 for +2 pass modifier next match', 4),
                              ('agent', 'Agent: d20 for a 12-credit contract bonus', 5),
                              ('rest', 'Rest: restore Legs and heal injury', 6)]:
        useful = (career['legs'] < _max_legs(career) or career['injury'] > 0) if key == 'rest' else key not in career['office_used']
        if key == 'coach' and career['trust'] >= 3:
            useful = False
        talk.append(dict(value=key, label=label, cost=cost,
                         enabled=office and useful and career['credits'] >= cost))
    talk.extend(dict(value=key, label=f'{key.title()} playbook', cost=0,
                     enabled=office and career['playbook'] != key) for key in PLAYBOOKS)
    choices = [dict(value=key, label={'shoot': 'Shoot: beat a d20 keeper save; 7 Legs',
                                     'pass': 'Pass: create a teammate chance; 4 Legs',
                                     'dribble': 'Dribble: prepare the next play; 8 Legs',
                                     'tackle': 'Tackle / save: prevent a goal; 6 Legs'}[key])
               for key in PLAYS] if career['phase'] == 'match' else []
    return dict(choices=choices, train_options=train, buy_options=buy, talk_options=talk)


def _state(career):
    fields = ('career_token', 'name', 'position', 'era', 'level', 'xp', 'credits',
              'legs', 'control', 'momentum', 'stretch', 'phase', 'season', 'round',
              'log', 'skills', 'habits', 'inventory', 'complete', 'result',
              'playbook', 'basis', 'injury', 'trust', 'revision')
    state = {key: deepcopy(career[key]) for key in fields}
    state.update(max_legs=_max_legs(career), standings=standings(career['fixtures'], NAMES),
                 adaptation=ADAPTATION, rules=RULES, version=career['version'],
                 book=BOOKS[min(7, (career['level'] - 1) * 8 // 20)],
                 rounds_per_season=14, season_history=deepcopy(career['season_history']),
                 opponent_kind='Generated club from era-eligible source cards',
                 **_options(career))
    if career.get('match'):
        state['opponent'] = f"Generated Club {career['match']['opponent']}"
        state['minute'] = MINUTES[min(career['stretch'], 3)]
    return state


def _check_fields(body, allowed):
    unknown = set(body) - set(allowed)
    if unknown:
        raise ValueError('Unknown career fields: ' + ', '.join(sorted(unknown)))


def _create(service, body, profile):
    _check_fields(body, ('profile', 'name', 'position', 'era', 'seed', 'habit', 'playbook', 'action_id'))
    request_key = None
    request_digest = None
    if body.get('action_id') is not None:
        _, request_digest = service._dedup({}, body, 'league/create')
        request_key = hashlib.sha256(f"{profile['profile']}:{body['action_id']}".encode()).hexdigest()
        try:
            prior = service.store.get('career_request', request_key)
        except ValueError:
            prior = None
        if prior:
            if prior['digest'] != request_digest:
                raise ValueError('Action identifier was reused with different data.')
            return prior['response']
    name = body.get('name', 'Your Player')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
        raise ValueError('Use a player name between 1 and 40 characters.')
    position = body.get('position', 'CM')
    if position not in POSITIONS:
        raise ValueError('Choose ST, CM, CB or GK.')
    seed = body.get('seed', 42)
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**63:
        raise ValueError('Seed must be an integer from 0 to 9223372036854775807.')
    era = body.get('era', '2020s')
    if era not in service.eligibility or not service.eligibility[era]['eligible']:
        raise ValueError('Choose an era with complete football squad coverage.')
    habit = body.get('habit', 'teamwork')
    playbook = body.get('playbook', 'possession')
    if habit not in HABITS or playbook not in PLAYBOOKS:
        raise ValueError('Unsupported habit or playbook.')
    teams = [generated_team(service.players, era, stable_seed(f'{seed}:career-club:{i}'), Config()) for i in range(8)]
    # Source attributes and actual starting role remain disclosed. A source card
    # may fill an adjacent role; this never creates an invented measured rating.
    candidates = [i for i, s in enumerate(teams[0]['starters'])
                  if (s['slot'] == 'GK') == (position == 'GK')]
    index = max(candidates, key=lambda i: position_fit({'positions': [position]}, teams[0]['starters'][i]['slot']))
    source = teams[0]['starters'][index]['player']
    token = secrets.token_urlsafe(24)
    career = dict(career_token=token, profile=profile['profile'], name=name.strip(),
                  position=position, era=era, seed=seed, version=f'{service.version}:{CAREER_VERSION}',
                  phase='office', season=1, round=0, level=1, xp=0, credits=60,
                  legs=80, control=24, momentum=0, stretch=0, skills={k: 0 for k in SKILLS},
                  habits=[habit], playbook=playbook, inventory=[], trust=0, injury=0,
                  buffs={}, office_used=[], training_count=0, teams=teams, slot_index=index,
                  basis=dict(id=source['id'], name=source['name'], era=source['era'],
                             positions=source['positions'], role=teams[0]['starters'][index]['slot'],
                             lineage=source['lineage'], label='Source attributes for a fictional avatar; progression is simulated'),
                  fixtures=[], season_history=[], log=[], actions={}, revision=0,
                  complete=False, result=None, match=None, points=0)
    _log(career, f"Signed for Your Eleven as {position}. Starting role: {career['basis']['role']}. All rival clubs are generated.")
    response = _state(career)
    service.store.put('career', token, career)
    if request_key:
        service.store.put('career_request', request_key, dict(digest=request_digest, response=response))
    return response


def _start(career):
    if career['round'] == 14:
        career['season_history'].append(dict(season=career['season'], standings=standings(career['fixtures'], NAMES)))
        career['season'] += 1
        career['round'] = 0
        career['fixtures'] = []
        career['legs'] = min(_max_legs(career), career['legs'] + 20)
        _log(career, 'A new fourteen-round season begins. The same eight generated clubs return.')
    if 'recovery' in career['inventory']:
        career['inventory'].remove('recovery')
        career['legs'] = min(_max_legs(career), career['legs'] + 15)
        _log(career, 'Recovery supply used: +15 Legs, capped at your maximum.')
    career['legs'] = min(_max_legs(career), career['legs'] + 8)
    pair = next(p for p in schedule()[career['round']] if 0 in p)
    h, a = pair
    opponent = a if h == 0 else h
    team = _avatar_team(career)
    rival = career['teams'][opponent]
    # Avatar perspective throughout the career UI. Home advantage changes sign
    # for away games; standings are converted back to the scheduled venue.
    baseline = simulate_match(team, rival, seed=_seed(career, 'surrounding'),
                              home_advantage=.12 if h == 0 else -.12)
    career['match'] = dict(home=h, away=a, opponent=opponent, surrounding=baseline,
                           team=team, rating=rate_team(rival), actions=[],
                           interactive_goals=0, prevented_goals=0, setup=0)
    career.update(phase='match', stretch=0, control=24, momentum=0)
    _log(career, f"Round {career['round'] + 1}: Your Eleven v Generated Club {opponent}. Four interactive stretches.")


def _modifier(career, choice, player):
    if career['position'] == 'GK' and choice == 'tackle':
        attribute = (player['gk_reflexes'] + player['gk_positioning']) / 2
    else:
        attribute = player[ATTRIBUTES[choice]]
    modifier = int((attribute - 60) // 8) + career['skills'][choice]
    modifier += sum(HABITS[h] == choice for h in career['habits'])
    modifier += career['trust']
    if (career['playbook'] == 'possession' and choice == 'pass'
            or career['playbook'] == 'counter' and choice in ('shoot', 'dribble')
            or career['playbook'] == 'press' and choice == 'tackle'):
        modifier += 2
    if choice in ('shoot', 'dribble') and 'boots' in career['inventory']:
        modifier += 1
    if choice == 'tackle' and 'shin-pads' in career['inventory']:
        modifier += 1
    if choice == 'pass':
        modifier += career['buffs'].get('teammate', 0)
    modifier += min(3, career['momentum'] // 4) + career['match']['setup']
    modifier -= 2 if career['legs'] < 30 else 0
    modifier -= 2 if career['injury'] else 0
    modifier -= 2 if sum(a['choice'] == choice for a in career['match']['actions']) >= 2 else 0
    if career['position'] == 'GK' and choice in ('shoot', 'dribble'):
        modifier -= 3
    return modifier


def _action(career, choice):
    match = career['match']
    rng = random.Random(_seed(career, f"action:{career['stretch']}:{choice}"))
    player = match['team']['starters'][career['slot_index']]['player']
    modifier = _modifier(career, choice, player)
    metric = match['rating']['control' if choice == 'tackle' else 'defence']
    difficulty = 14 + int((metric - 75) // 12)
    roll = rng.randint(1, 20)
    success = roll == 20 or roll != 1 and roll + modifier >= difficulty
    match['setup'] = 0
    cost = {'shoot': 7, 'pass': 4, 'dribble': 8, 'tackle': 6}[choice]
    cost += 2 if career['playbook'] == 'press' else 0
    career['legs'] = max(0, career['legs'] - cost)
    goal = False
    prevented = False
    save_roll = None
    save_total = None
    damage = 0
    if success:
        damage = rng.randint(3, 8) + career['skills'][choice]
        career['control'] = max(0, career['control'] - damage)
        career['momentum'] = min(16, career['momentum'] + 4)
        if choice == 'shoot':
            save_roll = rng.randint(1, 20)
            save_total = save_roll + int((match['rating']['keeper'] - 60) // 8)
            goal = roll == 20 or roll + modifier > save_total
        elif choice == 'pass':
            teammates = [s['player'] for i, s in enumerate(match['team']['starters'])
                         if i != career['slot_index'] and s['slot'] != 'GK']
            quality = max(p['shooting'] for p in teammates)
            goal = rng.random() < .15 + max(0, quality - 65) / 150
        elif choice == 'dribble':
            match['setup'] = 2
        else:
            save_roll = rng.randint(1, 20)
            save_total = save_roll + modifier
            opponent_attack = 12 + int((match['rating']['attack'] - 75) // 12)
            remaining = match['surrounding']['away_goals'] - match['prevented_goals']
            prevented = remaining > 0 and (save_roll == 20 or save_roll != 1 and save_total >= opponent_attack)
        if career['control'] == 0 and choice in ('shoot', 'pass'):
            goal = True
            career['control'] = 24
    else:
        career['momentum'] = max(0, career['momentum'] - 3)
        # Physical save against the reply; kit and conditioning make it harder
        # for the opponent to drain stamina or cause a strain.
        save_roll = rng.randint(1, 20)
        save_total = save_roll + int((player['physical'] - 60) // 8) + career['skills']['conditioning']
        save_total += int('shin-pads' in career['inventory'])
        if save_roll == 1 or save_roll != 20 and save_total < 13:
            career['legs'] = max(0, career['legs'] - 5)
            if roll == 1 and rng.random() < .5:
                career['injury'] = 3  # resolution ticks once: two subsequent fixtures
    match['interactive_goals'] += int(goal)
    match['prevented_goals'] += int(prevented)
    record = dict(choice=choice, minute=MINUTES[career['stretch']], roll=roll,
                  modifier=modifier, total=roll + modifier, difficulty=difficulty,
                  success=success, save_roll=save_roll, save_total=save_total,
                  control_damage=damage, goal=goal, prevented_goal=prevented,
                  legs_cost=cost, legs=career['legs'], control=career['control'],
                  momentum=career['momentum'], injury=career['injury'])
    record['message'] = (f"{record['minute']}': {choice.title()} d20 {roll} + {modifier} versus {difficulty}: "
                         + ('success' if success else 'failed')
                         + (', goal' if goal else '') + (', opposition goal prevented' if prevented else ''))
    match['actions'].append(record)
    _log(career, record['message'], action=deepcopy(record))
    career['stretch'] += 1


def _resolve(service, career):
    match = career['match']
    result = deepcopy(match['surrounding'])
    result.update(surrounding=deepcopy(match['surrounding']),
                  home_goals=result['home_goals'] + match['interactive_goals'],
                  away_goals=result['away_goals'] - match['prevented_goals'],
                  interactive_goals=match['interactive_goals'], prevented_goals=match['prevented_goals'],
                  career_actions=deepcopy(match['actions']),
                  venue='home' if match['home'] == 0 else 'away',
                  opponent=f"Generated Club {match['opponent']}",
                  label='Simulated career match: shared-engine surrounding play plus four d20 decisions; uncalibrated game rules')
    # Retain prevented attempts as saved shots; add interactive chances to the
    # match event ledger. Original xG belongs to surrounding play only.
    remaining = match['prevented_goals']
    for event in result['events']:
        if remaining and event['side'] == 'away' and event['type'] == 'Goal':
            event.update(type='Shot', career_prevented=True)
            remaining -= 1
    for action in match['actions']:
        if action['goal']:
            result['events'].append(dict(minute=action['minute'], side='home', type='Goal',
                                         player=career['name'] if action['choice'] == 'shoot' else 'Generated teammate',
                                         career_interactive=True))
            result['home_shots'] += 1
    result['events'].sort(key=lambda e: (e['minute'], e['type'] == 'Substitution', e['side']))
    result.update(goals_for=result['home_goals'], goals_against=result['away_goals'],
                  xg_scope='Shared-engine surrounding play only; interactive decisions have no fitted xG estimate')
    h, a = match['home'], match['away']
    user_home = h == 0
    for home, away in schedule()[career['round']]:
        if 0 in (home, away):
            hg, ag = (result['home_goals'], result['away_goals']) if user_home else (result['away_goals'], result['home_goals'])
        else:
            other = simulate_match(career['teams'][home], career['teams'][away],
                                   seed=_seed(career, f'fixture:{home}:{away}'))
            hg, ag = other['home_goals'], other['away_goals']
        career['fixtures'].append(dict(round=career['round'] + 1, home=home, away=away,
                                        home_goals=hg, away_goals=ag))
    win = result['home_goals'] > result['away_goals']
    draw = result['home_goals'] == result['away_goals']
    successes = sum(a['success'] for a in match['actions'])
    xp = 18 + 3 * successes + 4 * match['interactive_goals'] + (8 if win else 4 if draw else 0)
    credits = 24 + 2 * successes + (8 if win else 4 if draw else 0)
    career['xp'] += xp
    career['credits'] += credits
    career['level'] = min(20, 1 + career['xp'] // 40)
    career['points'] += 3 if win else 1 if draw else 0
    career['round'] += 1
    career['injury'] = max(0, career['injury'] - 1)
    career['complete'] = career['level'] == 20
    career['phase'] = 'complete' if career['complete'] else 'office'
    career['result'] = result
    career['buffs'] = {}
    career['office_used'] = []
    career['training_count'] = 0
    career['match'] = None
    _log(career, f"Full time {result['home_goals']}–{result['away_goals']}. +{xp} XP, +{credits} credits. Level {career['level']}.")
    service._award(dict(token=career['career_token'], profile=career['profile'], mode='career',
                        era=career['era'], score=career['points']), result,
                   key=f"career:{career['career_token']}:{career['season']}:{career['round']}", mode='career')
    if career['round'] == 14:
        profile = service._profile(career['profile'])
        if 'league' not in profile['earned']:
            profile['earned'].append('league')
            service.store.put('profile', profile['profile'], profile)
    if career['complete']:
        _log(career, 'Level 20 reached. Career complete; your final season table and match record are saved.')


def _office(career, route, choice):
    option = next((o for o in _options(career)[route + '_options'] if o['value'] == choice), None)
    if option is None or not option['enabled']:
        raise ValueError('That office choice is unavailable, already used, or unaffordable.')
    career['credits'] -= option['cost']
    if route == 'train':
        career['skills'][choice] += 1
        career['training_count'] += 1
        if choice == 'conditioning':
            career['legs'] = min(_max_legs(career), career['legs'] + 4)
        _log(career, f"Trained {choice} to rank {career['skills'][choice]}/5 for {option['cost']} credits. Avatar attribute +2 per rank.")
    elif route == 'buy':
        career['inventory'].append(choice)
        _log(career, f"Bought {choice} for {option['cost']} credits.")
    elif choice in PLAYBOOKS:
        career['playbook'] = choice
        _log(career, f"Changed to the {choice} playbook; tactical action modifiers and shared-engine manager proxies change.")
    elif choice == 'rest':
        career.update(legs=_max_legs(career), injury=0)
        _log(career, 'Rested for 6 credits: Legs restored and injury healed.')
    else:
        career['office_used'].append(choice)
        roll = random.Random(_seed(career, f'talk:{choice}')).randint(1, 20)
        modifier = career['skills']['pass'] + int('teamwork' in career['habits']) + career['trust']
        success = roll == 20 or roll != 1 and roll + modifier >= 12
        if success:
            if choice == 'coach':
                career['trust'] = min(3, career['trust'] + 1)
            elif choice == 'teammate':
                career['buffs']['teammate'] = 2
            else:
                career['credits'] += 12
        _log(career, f"{choice.title()} conversation d20 {roll} + {modifier} versus 12: "
             + ('agreed' if success else 'no agreement') + f"; cost {option['cost']} credits.",
             roll=roll, modifier=modifier, success=success)


def career_call(service, path, body):
    """Called inside GameService's lock and SQLite transaction."""
    path = path.strip('/')
    route = path.removeprefix('league/')
    if route not in ('create', 'state', 'list', 'next', 'action', 'train', 'buy', 'talk'):
        raise ValueError('Unknown career endpoint.')
    profile = service._profile(body.get('profile'))
    if route == 'create':
        return _create(service, body, profile)
    if route == 'list':
        _check_fields(body, ('profile',))
        return dict(careers=[dict(career_token=c['career_token'], name=c['name'], position=c['position'],
                                  level=c['level'], season=c['season'], complete=c['complete'], version=c['version'])
                             for c in service.store.all('career') if c['profile'] == profile['profile']])
    allowed = ('profile', 'career_token', 'action_id', 'revision')
    if route in ('action', 'train', 'buy', 'talk'):
        allowed += ('choice',)
    _check_fields(body, allowed)
    token = body.get('career_token')
    if not isinstance(token, str) or not 1 <= len(token) <= 100:
        raise ValueError('A saved career token is required.')
    career = service.store.get('career', token)
    if career['profile'] != profile['profile']:
        raise ValueError('This career belongs to a different profile.')
    if career['version'] != f'{service.version}:{CAREER_VERSION}':
        raise ValueError('This career uses a different data, model or rules version. Use its original release or start a new career.')
    if route == 'state':
        return _state(career)
    prior, digest = service._dedup(career, body, path)
    if prior is not None:
        return prior
    if 'revision' in body and body['revision'] != career['revision']:
        raise ValueError('Career changed in another tab. Reload its saved state.')
    if career['complete']:
        raise ValueError('This career is complete. Start a new career to replay.')
    if route == 'next':
        if career['phase'] != 'office':
            raise ValueError('Complete the four match decisions before the next fixture.')
        _start(career)
    elif route == 'action':
        if career['phase'] != 'match' or body.get('choice') not in PLAYS:
            raise ValueError('Choose shoot, pass, dribble or tackle during a match.')
        _action(career, body['choice'])
        if career['stretch'] == 4:
            _resolve(service, career)
    else:
        if career['phase'] != 'office':
            raise ValueError('Training, shopping and conversations are available between matches.')
        _office(career, route, body.get('choice'))
    career['revision'] += 1
    response = _state(career)
    if body.get('action_id'):
        career['actions'][body['action_id']] = dict(digest=digest, response=deepcopy(response))
    service.store.put('career', token, career)
    return response
