"""Deterministic football campaigns with explicit generated-opponent labels."""
from copy import deepcopy
import hashlib
from .engine import DraftGame, Config, simulate_match, rate_team

CAMPAIGN_ERAS=('Legends','1990s','2000s','2010s','2020s')
GAUNTLET_MAPS={'three':('Legends','1990s','2010s'),'reverse-three':('2010s','1990s','Legends'),'full':CAMPAIGN_ERAS,'reverse-full':tuple(reversed(CAMPAIGN_ERAS))}
RULES_VERSION='football-2'


def stable_seed(text):
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:4], 'big')


def generated_team(players, era, seed, config=None, excluded=()):
    pool=[p for p in players if p['identity'] not in excluded]
    g=DraftGame(pool,era=era,seed=seed,config=config)
    for _ in range(5):g.spin()
    return g.lineup()


def schedule(size=8):
    """Circle schedule, each pair once at home and once away."""
    rotation=list(range(size)); rounds=[]
    for i in range(size-1):
        pairs=[]
        for j in range(size//2):
            a,b=rotation[j],rotation[-j-1]
            pairs.append([a,b] if (i+j)%2==0 else [b,a])
        rounds.append(pairs)
        rotation=[rotation[0],rotation[-1],*rotation[1:-1]]
    return rounds+[[[b,a] for a,b in pairs] for pairs in rounds]


def standings(results, names):
    rows=[dict(team=i,name=name,played=0,won=0,drawn=0,lost=0,goals_for=0,goals_against=0,points=0) for i,name in enumerate(names)]
    for fixture in results:
        a,b=fixture['home'],fixture['away'];h,g=fixture['home_goals'],fixture['away_goals']
        for team,gf,ga in [(a,h,g),(b,g,h)]:
            r=rows[team];r['played']+=1;r['goals_for']+=gf;r['goals_against']+=ga
            if gf>ga:r['won']+=1;r['points']+=3
            elif gf==ga:r['drawn']+=1;r['points']+=1
            else:r['lost']+=1
    return sorted(rows,key=lambda r:(-r['points'],-(r['goals_for']-r['goals_against']),-r['goals_for'],r['team']))


def campaign_progress(run):
    if run['mode']=='circuit':
        from .circuit import progress
        return progress(run)
    campaign=run.get('campaign',{})
    if run['mode']=='gauntlet':
        stage=campaign.get('stage',0);step=campaign.get('step',0)
        eras=GAUNTLET_MAPS[run.get('gauntlet_map','three')]
        return dict(stage=stage,era=eras[min(stage,len(eras)-1)],map=run.get('gauntlet_map','three'),maps=GAUNTLET_MAPS,
                    segment=step,boss=step==4,patience=campaign.get('patience',8),patience_max=20,
                    score=campaign.get('score',0),complete=campaign.get('complete',False),
                    status=campaign.get('status','playing'),history=campaign.get('history',[]),
                    needs_management=campaign.get('needs_management',False),badges=campaign.get('badges',0),rest_streak=campaign.get('rest_streak',0),
                    actions=[dict(id='rest',label='Rest · patience +2, then +1, then 0'),dict(id='develop',label='Develop pressing badge · 1 patience'),dict(id='best-era',label='Develop era adaptation · 1 patience'),dict(id='freeagency',label='Replace a substitute · B 1 / A 2 / S 3 patience')] if campaign.get('needs_management') and not campaign.get('complete') else [],
                    opponent_kind='generated era-eligible squad',
                    label='Four fourteen-match segments per act, then a best-of-seven generated boss. Patience starts 8/20; 9+ wins adds 1, 7–8 is safe, fewer costs 1. Lost boss costs 4, then 6, and restarts the act; zero ends the run. Football maps compress unsupported basketball decades. Historical boss rosters are unavailable.')
    if run['mode']=='league':
        names=['Your Eleven']+[f'Generated Club {i}' for i in range(1,8)]
        results=campaign.get('fixtures',[])
        return dict(round=campaign.get('round',0),rounds=14,schedule=schedule(),
                    standings=standings(results,names),fixtures=results,
                    complete=campaign.get('complete',False),status='complete' if campaign.get('complete') else 'playing',
                    opponent_kind='generated squads',
                    label='Eight clubs, fourteen rounds, home and away; 3 points for a win, 1 for a draw. Football league adaptation; generated clubs, no real historical table.')
    if run['mode']=='weekly':
        return dict(week=run['week'],complete=bool(run.get('result')),score=run.get('score',0),
                    label='UTC Monday challenge. Fixed era, draft, rules, data hash, opponent schedule and match seeds. Best score per profile on this server.')
    return dict(complete=bool(run.get('result')))


def advance_campaign(run, team, players):
    cfg=Config(**run['config']);c=run.setdefault('campaign',{})
    if c.get('complete'):raise ValueError('This campaign is complete. Start a new run to replay.')
    if run['mode']=='league':
        rd=c.get('round',0);fixtures=c.setdefault('fixtures',[]);user_result=None
        teams=[team]+[generated_team(players,run['era'],run['seed']+70000+i,cfg) for i in range(1,8)]
        for h,a in schedule()[rd]:
            r=simulate_match(teams[h],teams[a],seed=stable_seed(f"{run['seed']}:league:{rd}:{h}:{a}"))
            fixtures.append(dict(round=rd+1,home=h,away=a,home_goals=r['home_goals'],away_goals=r['away_goals']))
            if 0 in [h,a]:
                user_result=deepcopy(r)
                if a==0:
                    for suffix in ['goals','xg','shots','possession']:
                        user_result['home_'+suffix],user_result['away_'+suffix]=r['away_'+suffix],r['home_'+suffix]
                    for e in user_result['events']:e['side']='away' if e['side']=='home' else 'home'
                user_result['opponent']=f'Generated Club {a or h}';user_result['venue']='home' if h==0 else 'away'
        c['round']=rd+1;c['complete']=c['round']==14
        run['score']=next(r['points'] for r in standings(fixtures,['Your Eleven']+[f'Generated Club {i}' for i in range(1,8)]) if r['team']==0)
        return user_result
    if run['mode']!='gauntlet':raise ValueError('Choose a Gauntlet or League run.')
    if c.get('needs_management'):raise ValueError('Choose one management action before the next segment.')
    stage=c.get('stage',0);step=c.get('step',0);attempt=c.get('attempt',0)
    eras=GAUNTLET_MAPS[run.get('gauntlet_map','three')];era=eras[stage]
    boss=step==4
    from dataclasses import replace
    # These are game effects, not alterations to published player measurements.
    cfg=replace(cfg,fatigue=max(0,cfg.fatigue*(1-.08*min(c.get('badges',0),5))),
                opponent_difficulty=min(2,1+.04*stage-.02*min(c.get('era_upgrades',0),5)))
    results=[]
    for game in range(7 if boss else 14):
        opponent=generated_team(players,era,stable_seed(f'{run["seed"]}:gauntlet:{stage}:{step}:{attempt}:{0 if boss else game}'),cfg)
        r=simulate_match(team,opponent,seed=stable_seed(f'{run["seed"]}:boss:{stage}:{step}:{attempt}:{game}'),config=cfg,home_advantage=0)
        r['opponent']=f'{era} generated '+('boss' if boss else 'rival')
        if r['home_goals']==r['away_goals'] and boss:
            # A series needs a winner; a separate seeded shootout does not alter the match score.
            home_win=stable_seed(f'{run["seed"]}:shootout:{stage}:{attempt}:{game}')%2==0
            r['shootout_winner']='home' if home_win else 'away'
        else:home_win=r['home_goals']>r['away_goals']
        results.append((r,home_win))
        if boss and (sum(w for _,w in results)==4 or sum(not w for _,w in results)==4):break
    wins=sum(w for _,w in results)
    won=wins>=4 if boss else wins>=9
    score=sum(3 if r['home_goals']>r['away_goals'] else 1 if r['home_goals']==r['away_goals'] else 0 for r,_ in results)
    c['raw_score']=c.get('raw_score',0)+score+(10 if boss and won else 0)
    c['score']=c['raw_score']*(1.5 if run.get('roster_cap',True) else 1)
    c.setdefault('history',[]).append(dict(era=era,boss=boss,won=won,wins=wins,matches=[r for r,_ in results]))
    if boss:
        if won:c.update(stage=stage+1,step=0,attempt=0)
        else:
            losses=c.get('boss_losses',0);c.update(patience=c.get('patience',8)-(4 if losses==0 else 6),attempt=attempt+1,step=0,boss_losses=losses+1)
    else:
        c['step']=step+1;c['patience']=min(20,c.get('patience',8)+(1 if wins>=9 else 0 if wins>=7 else -1))
        c['needs_management']=True
    if c.get('patience',8)<=0:c.update(complete=True,status='eliminated',needs_management=False)
    elif c.get('stage',stage)==len(eras):c.update(complete=True,status='champion',needs_management=False)
    run['score']=c['score']
    final=deepcopy(results[-1][0]);final.update(series=[r for r,_ in results],series_won=won,boss=boss,segment_wins=wins)
    return final
