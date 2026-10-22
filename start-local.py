"""Local preview server. Only listens on this computer."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import webbrowser
root = Path(__file__).resolve().parent / 'website'
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
url = 'http://127.0.0.1:%d/demo.html' % server.server_port
print('Trace: ' + url, flush=True)
print('Stop: Ctrl+C. Keep this window open.', flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
