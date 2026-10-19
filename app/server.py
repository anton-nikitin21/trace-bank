"""Local-only prototype server; launch: python3 server.py."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone
import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from engine import analyze, economics
from fixtures import demo

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get("OSNOVANIE_DB", ROOT / ".data" / "demo.sqlite"))
PORT = int(os.environ.get("OSNOVANIE_PORT", "8765"))
MAX_BODY = 2_000_000

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, created TEXT, case_id TEXT, packet TEXT, report TEXT, digest TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, revision TEXT, created TEXT, comment TEXT, FOREIGN KEY(revision) REFERENCES revisions(id))")
    c.execute("PRAGMA foreign_keys = ON")
    return c

@contextmanager
def transaction():
    c = connect()
    try:
        with c:
            yield c
    finally:
        c.close()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Avoid logging submitted document text or customer names.
        pass
    def send(self, value, status=200):
        b = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/demo":
            return self.send(demo())
        if path == "/api/demo-fixed":
            return self.send(demo(True))
        if path == "/api/history":
            with transaction() as c:
                rows = c.execute("SELECT id, created, case_id, digest FROM revisions ORDER BY created DESC LIMIT 20").fetchall()
            return self.send([dict(zip(("id", "created", "case_id", "digest"), r)) for r in rows])
        if path == "/api/health":
            return self.send({"status": "ok", "mode": "synthetic-local-demo"})
        if path.startswith("/api/revision/"):
            rid = path.split("/")[-1]
            with transaction() as c:
                row = c.execute("SELECT report FROM revisions WHERE id = ?", (rid,)).fetchone()
            return self.send(json.loads(row[0])) if row else self.send({"error": "Версия не найдена"}, 404)
        if path not in ("/", "/index.html"):
            return self.send({"error": "Не найдено"}, 404)
        b = (ROOT / "index.html").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_POST(self):
        path = urlparse(self.path).path
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
            return self.send({"error": "Чужой Origin запрещён"}, 403)
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.send({"error": "Требуется application/json"}, 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                return self.send({"error": "Размер пакета должен быть от 1 байта до 2 МБ"}, 413)
            data = json.loads(self.rfile.read(length), parse_constant=lambda x: (_ for _ in ()).throw(ValueError("Некорректное число")))
            if not isinstance(data, dict):
                raise ValueError("Ожидается JSON-объект")
            if path == "/api/analyze":
                report = analyze(data)
                rid = str(uuid.uuid4())
                digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                report.update({"revision": rid, "packet_sha256": digest})
                with transaction() as c:
                    c.execute("INSERT INTO revisions VALUES (?,?,?,?,?,?)", (rid, datetime.now(timezone.utc).isoformat(), data["case_id"], json.dumps(data, ensure_ascii=False), json.dumps(report, ensure_ascii=False), digest))
                return self.send(report)
            if path == "/api/economics":
                return self.send(economics(data))
            if path == "/api/approve":
                rid, comment = data.get("revision"), data.get("comment", "")
                if not isinstance(rid, str) or not isinstance(comment, str) or not 5 <= len(comment.strip()) <= 2000:
                    raise ValueError("Укажите версию и комментарий сотрудника (5–2000 символов)")
                with transaction() as c:
                    row = c.execute("SELECT report FROM revisions WHERE id = ?", (rid,)).fetchone()
                    if not row:
                        return self.send({"error": "Версия не найдена"}, 404)
                    report = json.loads(row[0])
                    if report["issue_count"]:
                        return self.send({"error": "Есть неразрешённые замечания. Дополните комплект и выполните новую проверку."}, 409)
                    aid = str(uuid.uuid4())
                    c.execute("INSERT INTO approvals VALUES (?,?,?,?)", (aid, rid, datetime.now(timezone.utc).isoformat(), comment))
                return self.send({"approval": aid, "revision": rid, "state": "review_recorded", "message": "В демо записана проверка комплектности сотрудником. Банковское решение не принято."})
            return self.send({"error": "Не найдено"}, 404)
        except (ValueError, TypeError, KeyError, UnicodeDecodeError) as e:
            return self.send({"error": str(e)}, 400)
        except sqlite3.Error:
            return self.send({"error": "Не удалось сохранить версию"}, 500)

if __name__ == "__main__":
    connect().close()
    print(f"Основание: http://127.0.0.1:{PORT} · только синтетические данные", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
