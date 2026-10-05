"""Five-round football card quizzes and an explicitly simulated penalty game."""
import secrets
import numpy as np
from .service import integer
from .render import card_html


def _question(service, game):
    rng=np.random.default_rng(game['seed']+game['round'])
    pool=sorted(service.players,key=lambda p:p['id']);p=pool[int(rng.integers(len(pool)))];kind=game['kind']
    if kind=='guess_era':
        choices=[dict(value=e,label=e) for e in ['Classics','1990s','2000s','2010s','2020s']]
        question=f'Which career-era tag does {p["name"]} have in this dataset?'
        answer=p['era'];explanation=f'{p["name"]}: {p["era"]}. {p.get("era_basis","Curated career-era tag; not an observed performance measurement.")}'
        # Do not reveal an era/edition badge in an era-identification quiz.
        html=f'<div class="metric"><span>{p["name"]}</span><b>{" / ".join(p["positions"])}</b></div>'
    elif kind=='higher_lower':
        others=[x for x in pool if x['identity']!=p['identity'] and x['overall']!=p['overall']]
        other=others[int(rng.integers(len(others)))];question=f'{p["name"]} is rated {p["overall"]}. Is {other["name"]} higher or lower in this edition?'
        choices=[dict(value='higher',label='Higher'),dict(value='lower',label='Lower')]
        answer='higher' if other['overall']>p['overall'] else 'lower'
        explanation=f'{other["name"]} is rated {other["overall"]}; {other["season"]}, {other["lineage"]}. Cross-edition ratings are quiz facts, not calibrated comparisons.'
        html=card_html(p)
    else:
        question='Pick a penalty direction. The goalkeeper uses a seeded random direction.'
        choices=[dict(value=x,label=x.title()) for x in ['left','centre','right']]
        keeper=['left','centre','right'][int(rng.integers(3))]
        answer=keeper;explanation=f'The simulated keeper went {keeper}. This is a game assumption; no penalty skill model was fitted.';html=''
    return dict(question=question,choices=choices,card_html=html),answer,explanation


def _view(service, game):
    public,_,_=_question(service,game)
    return dict(mini_token=game['token'],kind=game['kind'],round=min(game['round']+1,5),total=5,score=game['score'],complete=game['round']==5,**public)


def mini_call(service,path,body):
    p=service._profile(body.get('profile'))
    if path=='mini/start':
        kind=body.get('kind','guess_era')
        if kind not in ['guess_era','higher_lower','penalties']:raise ValueError('Unsupported mini game.')
        game=dict(token=secrets.token_urlsafe(24),profile=p['profile'],kind=kind,seed=integer(body.get('seed',42)),round=0,score=0,actions={})
        service.store.put('mini',game['token'],game);return _view(service,game)
    if path!='mini/answer':raise ValueError('Unknown mini game action.')
    game=service.store.get('mini',body.get('mini_token'))
    if game['profile']!=p['profile']:raise ValueError('This mini game belongs to another profile.')
    prior,digest=service._dedup(game,body,path)
    if prior is not None:return prior
    if game['round']==5:raise ValueError('This mini game is complete.')
    public,answer,explanation=_question(service,game)
    if body.get('answer') not in [x['value'] for x in public['choices']]:raise ValueError('Choose one of the offered answers.')
    correct=body['answer']!=answer if game['kind']=='penalties' else body['answer']==answer
    game['score']+=int(correct);game['round']+=1
    out=dict(_view(service,game),correct=correct,explanation=explanation)
    if body.get('action_id'):game['actions'][body['action_id']]=dict(digest=digest,response=out)
    service.store.put('mini',game['token'],game)
    if game['round']==5:
        p['stats']['mini_games']=p['stats'].get('mini_games',0)+1
        p['stats']['mini_best']=max(p['stats'].get('mini_best',0),game['score'])
        service.store.put('profile',p['profile'],p)
    return out
