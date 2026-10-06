"""Serve the shared Python game authority and original browser interface."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import argparse
import json
import secrets
import mimetypes
from .data import ROOT
from .service import GameService

WEB=ROOT/'web'

def make_server(host='127.0.0.1',port=8765,state_path=None,public_origin=None):
    service=GameService(state_path=state_path)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def send_json(self,value,status=200):
            raw=json.dumps(value,ensure_ascii=False,allow_nan=False).encode()
            self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
        def do_GET(self):
            if self.path=='/api/meta':return self.send_json(service.call('meta'))
            name={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/engine.css':'engine.css'}.get(self.path.split('?')[0])
            if not name:return self.send_json({'error':'Not found'},404)
            file=WEB/name
            raw=file.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file)[0]+'; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        def do_POST(self):
            origin=self.headers.get('Origin')
            allowed={f'http://{self.headers.get("Host")}',public_origin}
            if origin and origin not in allowed:return self.send_json({'error':'Origin rejected'},403)
            try:
                size=int(self.headers.get('Content-Length',0))
                if not 0<size<100000:raise ValueError('Invalid request size.')
                body=json.loads(self.rfile.read(size))
                if not self.path.startswith('/api/'):return self.send_json({'error':'Not found'},404)
                return self.send_json(service.call(self.path[5:],body))
            except (ValueError,TypeError,KeyError,OverflowError,UnicodeDecodeError) as exc:return self.send_json({'error':str(exc)},400)
    server=ThreadingHTTPServer((host,port),Handler)
    server.service=service
    return server

def main():
    parser=argparse.ArgumentParser(description='Play Era Eleven locally.')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--host',default='127.0.0.1',help='Use a LAN interface or 0.0.0.0 for two devices on a trusted network.')
    parser.add_argument('--state',type=Path,help='Persistent SQLite state file; default data/local/game.sqlite.')
    parser.add_argument('--public-origin',help='Exact HTTPS origin when hosted behind a reverse proxy.')
    args=parser.parse_args()
    server=make_server(host=args.host,port=args.port,state_path=args.state,public_origin=args.public_origin)
    print(f'Era Eleven: http://{args.host}:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();server.service.store.close()

if __name__=='__main__':main()
