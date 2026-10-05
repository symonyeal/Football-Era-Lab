"""A ten-to-twenty event circuit with football formats and event-based awards."""
from collections import Counter
from copy import deepcopy
from .engine import Config, simulate_match
from .modes import CAMPAIGN_ERAS, generated_team, stable_seed

FORMATS=('League sprint','Group cup','Knockout cup','Home-and-away cup','Best-of series')


def progress(run):
    c=run.get('campaign',{});event=c.get('event',0);total=run['tournaments']
    return dict(event=event,event_count=total,format=FORMATS[max(0,event-1)%len(FORMATS)],
                next_format=FORMATS[event%len(FORMATS)],era=CAMPAIGN_ERAS[min(event,total-1)%len(CAMPAIGN_ERAS)],
                title=f'Tournament Circuit · {event}/{total}',complete=event>=total,status='complete' if event>=total else 'playing',
                score=c.get('score',0),history=c.get('history',[]),awards=c.get('awards',[]),
                label='Generated era-eligible opponents. Five formats rotate across supported eras. Trophy outcomes and awards come from simulated matches, not real-world measurements.')


def advance(run,team,players):
    c=run.setdefault('campaign',{});event=c.get('event',0)
    if event>=run['tournaments']:raise ValueError('The tournament circuit is complete.')
    kind=FORMATS[event%len(FORMATS)];era=CAMPAIGN_ERAS[event%len(CAMPAIGN_ERAS)];cfg=Config(**run['config'])
    records=[];scorers=Counter();points=0;wins=0
    def match(index,leg=0):
        nonlocal points,wins
        rival=generated_team(players,era,stable_seed(f'{run["seed"]}:circuit:{event}:{index}'),cfg)
        r=simulate_match(team,rival,seed=stable_seed(f'{run["seed"]}:circuit:{event}:{index}:{leg}'),home_advantage=0)
        r['opponent']=f'{era} generated club {index+1}'
        for e in r['events']:
            if e['type']=='Goal' and e['side']=='home':scorers[e['player']]+=1
        points+=3 if r['home_goals']>r['away_goals'] else 1 if r['home_goals']==r['away_goals'] else 0
        winner=r['home_goals']>r['away_goals']
        if r['home_goals']==r['away_goals'] and kind not in ['League sprint','Group cup']:
            winner=stable_seed(f'{run["seed"]}:tie:{event}:{index}:{leg}')%2==0
            r['shootout_winner']='home' if winner else 'away'
        wins+=int(winner);records.append(r);return r,winner
    champion=False
    if kind=='League sprint':
        for i in range(6):match(i)
        # A complete four-team table is simulated independently for comparable points.
        rivals=[generated_team(players,era,stable_seed(f'{run["seed"]}:league-sprint:{event}:{i}'),cfg) for i in range(3)]
        table=[points,0,0,0]
        for i in range(3):
            for j in range(i+1,3):
                for leg in range(2):
                    r=simulate_match(rivals[i],rivals[j],seed=stable_seed(f'{run["seed"]}:sprint:{event}:{i}:{j}:{leg}'),home_advantage=0)
                    h,a=r['home_goals'],r['away_goals'];table[i+1]+=3 if h>a else 1 if h==a else 0;table[j+1]+=3 if a>h else 1 if h==a else 0
        champion=table[0]>max(table[1:])
    elif kind=='Group cup':
        for i in range(3):match(i)
        # Football group qualification rule is visible rather than an invented table.
        qualified=points>=4
        if qualified:
            _,semi=match(3)
            if semi:_,champion=match(4)
    elif kind=='Knockout cup':
        champion=True
        for i in range(3):
            _,winner=match(i)
            if not winner:champion=False;break
    elif kind=='Home-and-away cup':
        champion=True
        for i in range(3):
            a,_=match(i,0);b,_=match(i,1)
            gf=a['home_goals']+b['home_goals'];ga=a['away_goals']+b['away_goals']
            winner=gf>ga or gf==ga and stable_seed(f'{run["seed"]}:aggregate:{event}:{i}')%2==0
            if not winner:champion=False;break
    else:
        for leg in range(5):
            match(0,leg)
            if wins==3 or len(records)-wins==3:break
        champion=wins>=3
    score=points+(10 if champion else 0)
    awards=[]
    if champion:awards.append(dict(name=f'{kind} champion',event=event+1,era=era,evidence='simulated match events'))
    if scorers:
        name,goals=sorted(scorers.items(),key=lambda x:(-x[1],x[0]))[0]
        awards.append(dict(name='Your squad golden boot',player=name,goals=goals,event=event+1,era=era,evidence='simulated match events'))
    clean=sum(r['away_goals']==0 for r in records)
    if clean:awards.append(dict(name='Clean-sheet award',player=team['starters'][0]['player']['name'],clean_sheets=clean,event=event+1,era=era,evidence='simulated match events'))
    c.update(event=event+1,score=c.get('score',0)+score)
    c.setdefault('history',[]).append(dict(event=event+1,format=kind,era=era,champion=champion,points=points,matches=records,awards=awards))
    c.setdefault('awards',[]).extend(awards);run['score']=c['score']
    result=deepcopy(records[-1]);result.update(tournament=kind,champion=champion,awards=awards)
    return result
