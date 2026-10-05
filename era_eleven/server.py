"""Serve the local browser game; no account, external service, or database required."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock
import argparse
import json
import secrets
import mimetypes
from .data import load_players, ROOT
from .engine import DraftGame, Config, ERAS, simulate_match, simulate_series, simulate_season, swap_player
from .render import card_html, team_html, result_html

WEB=ROOT/'web'

def make_server(host='127.0.0.1',port=8765):
    players=load_players();sessions={};lock=Lock()
    def state(session):
        g=session['game'];t=session.get('team')
        return dict(seed=g.seed,era=g.era,manager=g.manager,formation=g.formation,count=len(g.squad),spins=len(g.batches),complete=g.complete,cards=[card_html(p) for p in (g.batches[-1] if g.batches else [])],team_html=team_html(t) if t else '',squad=[dict(id=p['id'],name=p['name'],overall=p['overall'],positions=p['positions']) for p in g.squad],starters=[dict(index=i,name=s['player']['name'],slot=s['slot']) for i,s in enumerate(t['starters'])] if t else [],bench=[dict(id=p['id'],name=p['name'],positions=p['positions']) for p in t['bench']] if t else [])
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send_json(self,value,status=200):
            raw=json.dumps(value,ensure_ascii=False,allow_nan=False).encode()
            self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
        def do_GET(self):
            if self.path=='/api/meta':return self.send_json(dict(eras=ERAS,players=len(players)))
            name={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/engine.css':'engine.css'}.get(self.path.split('?')[0])
            if not name:return self.send_json({'error':'Not found'},404)
            file=WEB/name
            raw=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0]+'; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        def do_POST(self):
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://{self.headers.get("Host")}':return self.send_json({'error':'Origin rejected'},403)
            try:
                size=int(self.headers.get('Content-Length',0))
                if not 0<size<20000:raise ValueError('Invalid request size.')
                body=json.loads(self.rfile.read(size))
                with lock:
                    if self.path=='/api/new':
                        cfg=Config(**body.get('config',{}));g=DraftGame(players,era=body.get('era','All eras'),seed=body.get('seed',42),config=cfg)
                        token=secrets.token_urlsafe(18)
                        if len(sessions)>=200:sessions.pop(next(iter(sessions)))
                        session={'game':g};sessions[token]=session
                        return self.send_json(dict(state(session),token=token))
                    session=sessions.get(body.get('token'))
                    if session is None:return self.send_json({'error':'Start a new draft.'},404)
                    g=session['game']
                    if self.path=='/api/spin':
                        g.spin()
                        if g.complete:
                            session['team']=g.lineup()
                            rival=DraftGame(players,era=g.era,seed=g.seed+100000,config=g.config)
                            for _ in range(5):rival.spin()
                            session['rival']=rival.lineup()
                        return self.send_json(state(session))
                    if not g.complete:raise ValueError('Complete the five player spins first.')
                    if self.path=='/api/swap':
                        session['team']=swap_player(session['team'],body.get('slot'),body.get('bench_id'))
                        return self.send_json(state(session))
                    if self.path=='/api/match':
                        result=simulate_match(session['team'],session['rival'],seed=body.get('seed',2026))
                        session['result']=result
                        return self.send_json(dict(result=result,html=result_html(result),opponent=session['rival']['manager']['name']))
                    if self.path=='/api/series':
                        return self.send_json(simulate_series(session['team'],session['rival'],n=body.get('n',2000),seed=body.get('seed',2026)))
                    if self.path=='/api/season':
                        opponents=[]
                        for i in range(38):
                            other=DraftGame(players,era=g.era,seed=g.seed+200000+i,config=g.config)
                            for _ in range(5):other.spin()
                            opponents.append(other.lineup())
                        return self.send_json(simulate_season(session['team'],opponents,seed=body.get('seed',2026)))
                    if self.path=='/api/export':
                        return self.send_json(dict(seed=g.seed,era=g.era,squad=g.squad,team=session['team'],result=session.get('result')))
                    return self.send_json({'error':'Not found'},404)
            except (ValueError,TypeError,KeyError,OverflowError) as exc:return self.send_json({'error':str(exc)},400)
    return ThreadingHTTPServer((host,port),Handler)

def main():
    parser=argparse.ArgumentParser(description='Play Era Eleven locally.')
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    server=make_server(port=args.port)
    print(f'Era Eleven: http://127.0.0.1:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
