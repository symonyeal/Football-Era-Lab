"""Daily and unlimited football adaptations of the four audited mini games."""
from datetime import date
from html import escape
import secrets
import time
import unicodedata
import numpy as np
from .service import integer
from .modes import stable_seed
from .engine import card_tier

KINDS=('daily_card','higher_lower','roster_roulette','country_hunt','guess_era','penalties')


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKD',str(text)).encode('ascii','ignore').decode().casefold().split())


def question(service, game):
    rng=np.random.default_rng(game['seed']+min(game['round'],game['total']-1))
    pool=sorted(service.players,key=lambda p:p['id']);kind=game['kind']
    p=pool[int(rng.integers(len(pool)))]
    if kind=='daily_card':
        return dict(input='text',question='Find the card: enter player | era | club, or its card ID. Fifteen guesses.',choices=[],placeholder='Player name | 1990s | Legends',card_html='',explanation='Feedback uses this dataset’s club, league, nation, positions, era and tier. Height and career geography are unavailable.'),game['target']
    if kind=='higher_lower':
        candidates=[x for x in pool if x['identity']!=p['identity'] and x['overall']!=p['overall'] and x['season']==p['season'] and x['lineage']==p['lineage']]
        if not candidates:
            p=next(x for x in pool if x['era']=='2020s');candidates=[x for x in pool if x['identity']!=p['identity'] and x['overall']!=p['overall'] and x['season']==p['season']]
        other=candidates[int(rng.integers(len(candidates)))];answer='higher' if other['overall']>p['overall'] else 'lower'
        return dict(input='choices',question=f'Is {other["name"]} rated higher or lower than {p["name"]}? One life, fifteen comparisons.',choices=[dict(value='higher',label='Higher'),dict(value='lower',label='Lower')],card_html=f'<div class="metric"><span>{escape(p["name"])} · {escape(p["season"])}</span><b>?</b></div><div class="metric"><span>{escape(other["name"])} · {escape(other["season"])}</span><b>?</b></div>',explanation=f'{p["name"]}: {p["overall"]}; {other["name"]}: {other["overall"]}. Same-edition game ratings, not calibrated real-world performance.'),answer
    if kind=='roster_roulette':
        return dict(input='text',question=f'Name players in the {game["club"]} {game["era"]} snapshot. 120 seconds; lower-rated cards earn more game points.',choices=[],placeholder='Player name',card_html='',explanation='This is the bundled edition roster subset, not a complete historical roster. Score is 100 minus rating, with a minimum of 1; this is an obscurity proxy.'),None
    if kind=='guess_era':
        return dict(input='choices',question=f'Which career-era tag belongs to {p["name"]}?',choices=[dict(value=e,label=e) for e in ['Classics','1990s','2000s','2010s','2020s']],card_html=escape(p['name']),explanation=f'{p["name"]}: {p["era"]}; curated tag, not a contemporaneous measurement.'),p['era']
    if kind=='penalties':
        return dict(input='choices',question='Pick a penalty direction. The goalkeeper uses a seeded direction.',choices=[dict(value=e,label=e.title()) for e in ['left','centre','right']],card_html='',explanation='Simulated directional game; no penalty skill model has been fitted.'),['left','centre','right'][int(rng.integers(3))]
    people={}
    for card in pool:
        if card.get('nation') not in [None,'Unknown','nan','']:people.setdefault(card['identity'],card)
    cards=list(people.values());chosen=[cards[int(i)] for i in rng.choice(len(cards),size=min(game['round']+1,5),replace=False)]
    nations=sorted({p['nation'] for p in chosen});alternatives=sorted({p['nation'] for p in cards}-set(nations))
    offered=sorted(nations+[alternatives[int(i)] for i in rng.choice(len(alternatives),size=min(5,len(alternatives)),replace=False)])
    return dict(input='multi',question='Select every listed nationality represented by these players.',choices=[dict(value=n,label=n) for n in offered],card_html=''.join(f'<div class="metric"><span>{escape(p["name"])}</span><b>{escape(" / ".join(p["positions"]))}</b></div>' for p in chosen),explanation='Current-card nationality is the football adaptation. Career club-location histories are unavailable; these are not countries in their careers.'),nations


def finish(service, game):
    if game.get('recorded') or not game['complete']:return
    p=service._profile(game['profile']);stats=p['stats'];stats['mini_games']=stats.get('mini_games',0)+1
    stats['mini_best']=max(stats.get('mini_best',0),game['score'])
    if 'mini-player' not in p['earned']:p['earned'].append('mini-player')
    if game['kind']=='higher_lower' and game['score']==15 and 'mini-perfect' not in p['earned']:p['earned'].append('mini-perfect')
    service.store.put('profile',p['profile'],p);game['recorded']=True


def view(service, game):
    public,_=question(service,game)
    if game['kind']=='higher_lower' and not game['complete']:
        public['explanation']='Same-edition comparisons. Queried ratings stay hidden until an answer is submitted.'
    if game['kind']=='guess_era' and not game['complete']:
        public['explanation']='Choose the curated career-era tag. It is not a contemporaneous measurement.'
    if game['complete'] and game.get('last_explanation'):
        public['explanation']=game['last_explanation']
    return dict(mini_token=game['token'],kind=game['kind'],daily=game['daily'],day=game.get('day'),round=min(game['round']+1,game['total']),total=game['total'],score=game['score'],complete=game['complete'],attempts=game['round'],deadline=game.get('deadline'),remaining=max(0,game['total']-len(game.get('found',[]))) if game['kind']=='roster_roulette' else max(0,game['total']-game['round']),feedback=game.get('feedback',[]),**public)


def mini_call(service,path,body):
    p=service._profile(body.get('profile'))
    if path=='mini/start':
        kind=body.get('kind','daily_card')
        if kind not in KINDS:raise ValueError('Choose a supported mini game.')
        daily=body.get('daily',False)
        if not isinstance(daily,bool):raise ValueError('Daily must be true or false.')
        day=body.get('day',date.today().isoformat())
        if not isinstance(day,str) or date.fromisoformat(day).isoformat()!=day:raise ValueError('Use a calendar date in YYYY-MM-DD format.')
        key=f'{p["profile"]}:{service.version}:{kind}:{day}'
        if daily:
            try:previous=service.store.get('daily-mini',key)
            except ValueError:previous=None
            if previous:return mini_call(service,'mini/state',dict(profile=p['profile'],mini_token=previous['token']))
        seed=stable_seed(f'{service.version}:{kind}:{day}') if daily else integer(body.get('seed',42))
        game=dict(token=secrets.token_urlsafe(24),version=service.version,profile=p['profile'],kind=kind,seed=seed,daily=daily,day=day,round=0,score=0,total=5 if kind in ['country_hunt','guess_era','penalties'] else 15,complete=False,actions={},feedback=[])
        if kind=='daily_card':game['target']=sorted(service.players,key=lambda p:p['id'])[int(np.random.default_rng(seed).integers(len(service.players)))]['id']
        if kind=='roster_roulette':
            groups={}
            for card in service.players:
                if card.get('club') not in [None,'Unknown','Legends','Free agent','nan',''] and 'reconstruction' not in card['lineage']:
                    groups.setdefault((card['club'],card['era'],card['season']),[]).append(card)
            groups={k:v for k,v in groups.items() if len({x['identity'] for x in v})>=3}
            if not groups:raise ValueError('No attributed club snapshot has at least three distinct players.')
            keys=sorted(groups);club,era,season=keys[int(np.random.default_rng(seed).integers(len(keys)))]
            game.update(club=club,era=era,season=season,roster=[x['id'] for x in groups[(club,era,season)]],total=len({x['identity'] for x in groups[(club,era,season)]}),found=[],deadline=time.time()+120)
        service.store.put('mini',game['token'],game)
        if daily:service.store.put('daily-mini',key,dict(token=game['token']))
        return view(service,game)
    game=service.store.get('mini',body.get('mini_token'))
    if game['profile']!=p['profile']:raise ValueError('This mini game belongs to another profile.')
    if game.get('version')!=service.version:raise ValueError('This puzzle belongs to an earlier data/model/rules release.')
    prior,digest=service._dedup(game,body,path)
    if prior is not None:return prior
    timed_out=bool(game.get('deadline') and time.time()>=game['deadline'] and not game['complete'])
    if timed_out:game['complete']=True
    if path=='mini/state':
        finish(service,game);service.store.put('mini',game['token'],game);return view(service,game)
    if path!='mini/answer':raise ValueError('Unknown mini game action.')
    if timed_out:
        game['feedback']=[dict(field='clock',value='Time expired',match=False)]
        finish(service,game);out=dict(view(service,game),correct=False)
        if body.get('action_id'):game['actions'][body['action_id']]=dict(digest=digest,response=out)
        service.store.put('mini',game['token'],game);return out
    if game['complete']:raise ValueError('The puzzle is complete. Start an unlimited puzzle or return tomorrow.')
    public,right=question(service,game);answer=body.get('answer');correct=False;feedback=[]
    if game['kind']=='daily_card':
        if not isinstance(answer,str) or not 1<=len(answer)<=200:raise ValueError('Enter a player/card guess.')
        pieces=[normalized(x) for x in answer.split('|')]
        matches=[x for x in service.players if x['id']==answer or normalized(x['name'])==pieces[0] and (len(pieces)<2 or normalized(x['era'])==pieces[1]) and (len(pieces)<3 or normalized(x.get('club',''))==pieces[2])]
        target=next(x for x in service.players if x['id']==right);guess=matches[0] if len(matches)==1 else None
        if guess:
            correct=guess['id']==target['id']
            feedback=[dict(field=k,value=guess.get(k),match=guess.get(k)==target.get(k)) for k in ['name','club','league','nation','era','positions']]
            feedback.append(dict(field='tier',value=card_tier(guess),match=card_tier(guess)==card_tier(target)))
        else:feedback=[dict(field='guess',value='Unknown or ambiguous card. Add era and club, or use a card ID.',match=False)]
        game['round']+=1;game['complete']=correct or game['round']==15;game['score']=16-game['round'] if correct else 0
        if game['complete']:public['explanation']+=f' Target: {target["name"]} | {target["era"]} | {target.get("club","")}.'
    elif game['kind']=='roster_roulette':
        if not isinstance(answer,str) or not 1<=len(answer)<=100:raise ValueError('Enter a roster player name.')
        match=next((x for x in service.players if x['id'] in game['roster'] and normalized(x['name'])==normalized(answer)),None)
        if match and match['identity'] not in game['found']:
            game['found'].append(match['identity']);game['score']+=max(1,100-int(match['overall']));correct=True
        game['round']+=1;game['complete']=len(game['found'])==game['total']
        feedback=[dict(field='roster',value='Correct' if correct else 'Already named or absent from this snapshot',match=correct)]
    elif game['kind']=='country_hunt':
        if not isinstance(answer,list) or any(not isinstance(x,str) for x in answer) or not set(answer)<={x['value'] for x in public['choices']}:raise ValueError('Select countries from the offered list.')
        correct=set(answer)==set(right);game['score']+=int(correct);game['round']+=1;game['complete']=game['round']==5
        feedback=[dict(field='nationalities',value=', '.join(right),match=correct)]
    else:
        if answer not in [x['value'] for x in public['choices']]:raise ValueError('Choose an offered answer.')
        correct=answer!=right if game['kind']=='penalties' else answer==right
        game['score']+=int(correct);game['round']+=1;game['complete']=game['round']==game['total'] or game['kind']=='higher_lower' and not correct
        feedback=[dict(field='answer',value=public['explanation'],match=correct)]
    game['feedback']=feedback;game['last_explanation']=public['explanation'];finish(service,game)
    out=dict(view(service,game),correct=correct,explanation=public['explanation'])
    if body.get('action_id'):game['actions'][body['action_id']]=dict(digest=digest,response=out)
    service.store.put('mini',game['token'],game)
    return out
