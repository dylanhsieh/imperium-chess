#!/usr/bin/env python3
"""Start the already-built, fully local Imperium game. No package installation needed."""
import argparse
import http.server
from pathlib import Path
import threading
import urllib.request
import webbrowser

parser = argparse.ArgumentParser(description='IMPERIUM · 王權戰棋')
parser.add_argument('--port', type=int, default=5188)
parser.add_argument('--no-browser', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent / 'dist'
if not (root / 'index.html').is_file():
    raise SystemExit('找不到遊戲檔案。請保留 dist 資料夾，或先執行 npm run build。')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *values, **kwargs):
        super().__init__(*values, directory=str(root), **kwargs)
    def log_message(self, *values):
        pass

url = f'http://127.0.0.1:{args.port}/'
try:
    server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
except OSError:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            existing = response.read(4096).decode('utf-8', 'ignore')
        if 'IMPERIUM' in existing:
            print(f'遊戲已在執行：{url}')
            if not args.no_browser:
                webbrowser.open(url)
            raise SystemExit(0)
    except (OSError, TimeoutError):
        pass
    raise SystemExit(f'連接埠 {args.port} 已被使用。可改用 python3 serve.py --port 5189。')
print(f'IMPERIUM · 王權戰棋\n遊戲入口：{url}\n保留此視窗即可持續遊玩。按 Ctrl+C 關閉。', flush=True)
if not args.no_browser:
    threading.Timer(.4, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\n戰役暫停，下次再見。')
finally:
    server.server_close()
