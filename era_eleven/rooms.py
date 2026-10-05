"""Private, reconnectable two-human rooms with server-owned drafts and scores."""
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime,timezone
import secrets
from .engine import Config, DraftGame, swap_player, simulate_match
from .service import integer
from .modes import stable_seed
from .render import result_html


def _prepare(service, room):
    if room.get('pool_policy','independent')=='independent':
        room['seeds']=[room['seed']+room['round']*10000,room['seed']+room['round']*10000+1]
        room['awards']=[[p['id'] for p in DraftGame(service.players,room['era'],seed,Config())._awards] for seed in room['seeds']]
        return
    # Jointly feasible disjoint squads from one pool. No roster is accepted from a client.
    for attempt in range(50):
        base=room['seed']+room['round']*10000+attempt*100
        try:
            first=DraftGame(service.players,room['era'],base,Config())
            excluded={p['identity'] for p in first._awards}
            second=DraftGame([p for p in service.players if p['identity'] not in excluded],room['era'],base+1,Config())
            room['seeds']=[base,base+1]
            room['awards']=[[p['id'] for p in g._awards] for g in [first,second]]
            return
        except ValueError:continue
    raise ValueError('This era cannot cover two disjoint squads. Choose a pool with more goalkeeper and role coverage.')


def _run(service,room,seat):
    return dict(token=f'{room["room"]}:{room["round"]}:{seat}',profile=room['profiles'][seat],
                mode='head-to-head',era=room['era'],requested_era=room['era'],seed=room['seeds'][seat],
                config=asdict(Config()),spins=room['spins'][seat],swaps=room['swaps'][seat],
                version=room['version'],revision=room['revision'],campaign={})


def _team(service,room,seat):
    run=_run(service,room,seat)
    # Guest reconstructs from the residual authoritative pool, not from all cards.
    players=service.players
    if seat==1 and room.get('pool_policy')=='shared-exclusive':
        ids=set(room['awards'][0]);people={p['identity'] for p in players if p['id'] in ids}
        players=[p for p in players if p['identity'] not in people]
    g=DraftGame(players,room['era'],room['seeds'][seat],Config())
    for _ in range(room['spins'][seat]):g.spin()
    team=g.lineup() if g.complete else None
    if team:
        for slot,pid in room['swaps'][seat]:team=swap_player(team,slot,pid)
    return g,team


def _view(service,room,seat):
    from .render import card_html,team_html
    seats=[];reveal=all(n==5 for n in room['spins'])
    for i in range(2):
        g,t=_team(service,room,i)
        visible=i==seat or reveal or room['local']
        seats.append(dict(seat=i,joined=room['profiles'][i] is not None,ready=room['ready'][i],count=len(g.squad),spins=len(g.batches),
                          manager=g.manager if visible else None,formation=g.formation if visible else None,
                          squad=[dict(id=p['id'],identity=p['identity'],name=p['name'],overall=p['overall'],positions=p['positions'],era=p['era']) for p in g.squad] if visible else [],
                          cards=[card_html(p) for p in (g.batches[-1] if g.batches else [])] if visible else [],
                          team_html=team_html(t) if t and visible else '',
                          starters=[dict(index=j,name=s['player']['name'],slot=s['slot']) for j,s in enumerate(t['starters'])] if t and visible else [],
                          bench=[dict(id=p['id'],name=p['name'],positions=p['positions']) for p in t['bench']] if t and visible else []))
    phase='finished' if room['result'] else 'waiting' if not room.get('started') else 'ready' if reveal else 'drafting'
    return dict(room=room['room'],seat=seat,local=room['local'],revision=room['revision'],turn=room['turn'] if room['local'] else None,
                phase=phase,round=room['round'],era=room['era'],seats=seats,result=room['result'],result_html=result_html(room['result']) if room['result'] else '',
                rematch_votes=room['rematch_votes'],deadline=room.get('deadline'),time_limit=room['time_limit'],version=room['version'],
                pool_policy=room.get('pool_policy','independent'),
                label='Private room on this server. Two humans; simultaneous timed drafts online, alternating handovers locally. Each squad has fifteen distinct people. A direct neutral football match decides the result.')


def _play(service,room):
    teams=[_team(service,room,i)[1] for i in range(2)]
    room['result']=simulate_match(*teams,seed=stable_seed(f'{room["version"]}:{room["room"]}:{room["seed"]}:{room["round"]}'),home_advantage=0)
    for seat in range(2):
        r=deepcopy(room['result'])
        if seat==1:r['home_goals'],r['away_goals']=r['away_goals'],r['home_goals']
        run=_run(service,room,seat)
        service._award(run,r,mode='head-to-head',key=run['token'])


def room_call(service,path,body):
    allowed={'profile','room','credential','action_id','revision'}
    allowed|={'era','seed','local','time_limit','variant','pool_policy'} if path=='room/create' else {'slot','bench_id'} if path=='room/swap' else set()
    if set(body)-allowed:raise ValueError('Only server-owned draft actions are accepted; client rosters and results are rejected.')
    if path=='room/create':
        p=service._profile(body.get('profile'),create=True)
        era=body.get('era','2020s')
        if era=='Randomize Era':
            from .engine import choose_era
            era=choose_era(service.players,integer(body.get('seed',42)))
        code=secrets.token_hex(3).upper()
        while any(r['room']==code for r in service.store.all('room')):code=secrets.token_hex(3).upper()
        local=body.get('local',False)
        if not isinstance(local,bool):raise ValueError('Local room setting must be true or false.')
        timing=integer(body.get('time_limit',60),'Draft seconds',600)
        if timing<30:raise ValueError('Timed drafts need at least thirty seconds.')
        guest=service._profile(create=True)['profile'] if local else None
        policy=body.get('pool_policy','independent')
        if policy not in ['independent','shared-exclusive']:raise ValueError('Choose independent or shared-exclusive draft pools.')
        room=dict(room=code,local=local,profiles=[p['profile'],guest],credentials=[secrets.token_urlsafe(24),secrets.token_urlsafe(24)],
                  era=era,seed=integer(body.get('seed',42)),time_limit=timing,round=0,revision=0,turn=0,spins=[0,0],swaps=[[],[]],
                  ready=[False,False],rematch_votes=[False,False],result=None,version=service.version,actions={},started=local,pool_policy=policy)
        _prepare(service,room);service.store.put('room',code,room)
        view=_view(service,room,0);view['credential']=room['credentials'][0]
        if local:view['local_credentials']=room['credentials']
        return view
    code=body.get('room')
    if not isinstance(code,str):raise ValueError('Enter a room code.')
    room=service.store.get('room',code.upper())
    if room['version']!=service.version:raise ValueError('Room data/model version differs from the running server.')
    if path=='room/join':
        if room['local']:raise ValueError('A local room already has two seats.')
        p=service._profile(body.get('profile'),create=True)
        if p['profile']==room['profiles'][0]:raise ValueError('Use an independent browser profile for the second human.')
        if room['profiles'][1] not in [None,p['profile']]:raise ValueError('This private room is full.')
        room['profiles'][1]=p['profile'];room['revision']+=1
        service.store.put('room',room['room'],room)
        return dict(_view(service,room,1),credential=room['credentials'][1])
    credential=body.get('credential')
    if credential not in room['credentials']:raise ValueError('This credential does not own a seat in this room.')
    seat=room['credentials'].index(credential)
    if room['profiles'][seat] is None:raise ValueError('Join this room before playing.')
    if room.get('deadline') and datetime.now(timezone.utc).timestamp()>=room['deadline'] and not room['result']:
        for i in range(2):
            room['spins'][i]=5;room['ready'][i]=True
            game,_=_team(service,room,i);service._collect(room['profiles'][i],game)
        room['revision']+=1;_play(service,room);service.store.put('room',room['room'],room)
    if path=='room/state':return _view(service,room,seat)
    prior,digest=service._dedup(room,body,path)
    if prior is not None:return prior
    if 'revision' in body and body['revision']!=room['revision']:raise ValueError('Room changed. Reconnect before acting.')
    if path=='room/start':
        if seat!=0 or not all(room['profiles']):raise ValueError('The host starts after both humans have joined.')
        if room.get('started'):raise ValueError('This room has already started.')
        room['started']=True;room['deadline']=datetime.now(timezone.utc).timestamp()+room['time_limit']
    elif path=='room/spin':
        if not room.get('started'):raise ValueError('Wait for the host to start the draft.')
        if room['result'] or room['ready'][seat] or room['spins'][seat]>=5:raise ValueError('Your draft is closed.')
        if room['local'] and seat!=room['turn']:raise ValueError('Pass the device to the other human.')
        room['spins'][seat]+=1
        if room['local']:room['turn']=1-seat
        g,_=_team(service,room,seat);service._collect(room['profiles'][seat],g)
    elif path=='room/swap':
        if room['ready'][seat] or room['result']:raise ValueError('The submitted lineup is locked.')
        _,team=_team(service,room,seat)
        if team is None:raise ValueError('Complete all five spins before changing your lineup.')
        swap_player(team,body.get('slot'),body.get('bench_id'));room['swaps'][seat].append([body['slot'],body['bench_id']])
    elif path=='room/ready':
        if room['result']:raise ValueError('This match is already final.')
        if room['spins'][seat]!=5:raise ValueError('Finish your five spins before confirming.')
        room['ready'][seat]=True
        if all(room['ready']):_play(service,room)
    elif path=='room/rematch':
        if not room['result']:raise ValueError('Complete the current match first.')
        room['rematch_votes'][seat]=True
        if all(room['rematch_votes']):
            room.update(round=room['round']+1,spins=[0,0],swaps=[[],[]],ready=[False,False],rematch_votes=[False,False],result=None,turn=0,deadline=None,started=room['local'])
            _prepare(service,room)
    else:raise ValueError('Unknown room action.')
    room['revision']+=1;response=_view(service,room,seat)
    return service._save_action('room',room,body,digest,response)
