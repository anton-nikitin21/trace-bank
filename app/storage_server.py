"""Authenticated local service for versioned requirements and integration records."""
import hashlib
import json
import os
import secrets
import sqlite3
import uuid
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from clerk_session import verify
import jwt
import mimetypes

DB = Path(os.environ.get("TRACE_STORAGE_DB", Path.home() / ".trace-private" / "records.sqlite"))
IDENTITIES = json.loads(os.environ.get("TRACE_API_IDENTITIES", "{}"))
KINDS = {"requirements", "cases", "originals", "clarifications"}

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB, timeout=15)
    c.execute("""CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, org TEXT NOT NULL, kind TEXT NOT NULL,
      object_id TEXT NOT NULL, version INTEGER NOT NULL, author TEXT NOT NULL,
      created TEXT NOT NULL, body TEXT NOT NULL, request_key TEXT NOT NULL,
      digest TEXT NOT NULL, UNIQUE(org, request_key), UNIQUE(org,kind,object_id,version))""")
    c.execute("""CREATE TRIGGER IF NOT EXISTS immutable_update BEFORE UPDATE ON records
                 BEGIN SELECT RAISE(ABORT, 'Immutable record'); END""")
    c.execute("""CREATE TRIGGER IF NOT EXISTS immutable_delete BEFORE DELETE ON records
                 BEGIN SELECT RAISE(ABORT, 'Immutable record'); END""")
    return c

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def identity(self):
        header = self.headers.get("Authorization", "")
        digest = hashlib.sha256(header.removeprefix("Bearer ").encode()).hexdigest()
        for token_hash, identity in IDENTITIES.items():
            if header.startswith("Bearer ") and secrets.compare_digest(token_hash, digest):
                return identity
        if header.startswith("Bearer "):
            try:
                return verify(header[7:])
            except (jwt.PyJWTError, OSError, ValueError):
                return None
        return None

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/"):
            root = Path(__file__).resolve().parents[1] / "website"
            target = (root / (path.lstrip("/") or "index.html")).resolve()
            if not target.is_relative_to(root.resolve()) or not target.is_file():
                return self.send(404, {"error": "Not found"})
            content = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(target)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        actor = self.identity()
        if not actor:
            return self.send(401, {"error": "Authentication required"})
        if self.path == "/api/session":
            return self.send(200, actor)
        if self.path != "/api/records":
            return self.send(404, {"error": "Unknown endpoint"})
        c = connect()
        try:
            rows = c.execute("SELECT id,kind,object_id,version,author,created,body FROM records WHERE org=? ORDER BY created,version",
                             (actor["organization"],)).fetchall()
            self.send(200, [dict(zip(("id","kind","object_id","version","author","created","body"), (*r[:6],json.loads(r[6])))) for r in rows])
        finally:
            c.close()

    def do_POST(self):
        actor = self.identity()
        if not actor:
            self.close_connection = True
            return self.send(401, {"error": "Authentication required"})
        if self.path != "/api/records":
            return self.send(404, {"error": "Unknown endpoint"})
        if actor.get("role") not in {"editor", "admin"}:
            return self.send(403, {"error": "Write permission required"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 2_000_000:
                self.close_connection = True
                return self.send(413, {"error": "Body exceeds limit"})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get("body"), dict):
                raise ValueError("Request and body must be objects")
            if type(data.get("expected_version")) is not int or data["expected_version"] < 0:
                raise ValueError("Invalid expected version")
            kind, object_id, key = data["kind"], data["object_id"], self.headers.get("Idempotency-Key", "")
            if kind not in KINDS or not isinstance(object_id,str) or not 1 <= len(object_id) <= 200 or not 1 <= len(key) <= 200:
                raise ValueError("Invalid kind, object ID or idempotency key")
            if kind == "requirements":
                requirement = data["body"]
                for field in ("title", "condition", "owner", "effective_date"):
                    if not isinstance(requirement.get(field), str) or not requirement[field].strip():
                        raise ValueError("Missing requirement field")
                date.fromisoformat(requirement["effective_date"])
                if type(requirement.get("mandatory")) is not bool or requirement.get("status") not in {"draft", "approved"}:
                    raise ValueError("Invalid requirement")
                if requirement["status"] == "approved" and actor["role"] != "admin":
                    return self.send(403, {"error": "Admin required for approval"})
            body = json.dumps(data["body"], sort_keys=True, ensure_ascii=False, allow_nan=False)
            digest = hashlib.sha256(json.dumps([kind,object_id,body]).encode()).hexdigest()
            c = connect()
            try:
                c.execute("BEGIN IMMEDIATE")
                old = c.execute("SELECT id,version,digest FROM records WHERE org=? AND request_key=?",
                                (actor["organization"],key)).fetchone()
                if old:
                    c.rollback()
                    return self.send(200 if old[2] == digest else 409, {"id":old[0],"version":old[1],"replayed":old[2] == digest})
                version = c.execute("SELECT COALESCE(MAX(version),0) FROM records WHERE org=? AND kind=? AND object_id=?",
                                    (actor["organization"],kind,object_id)).fetchone()[0]
                if data.get("expected_version") != version:
                    c.rollback()
                    return self.send(409, {"error":"Version conflict","current_version":version})
                if kind == "requirements" and data["body"]["status"] == "approved":
                    previous = c.execute("SELECT body FROM records WHERE org=? AND kind=? AND object_id=? AND version=?",
                                         (actor["organization"], kind, object_id, version)).fetchone()
                    draft = json.loads(previous[0]) if previous else {}
                    if draft.get("status") != "draft" or {**draft, "status": "approved"} != data["body"]:
                        c.rollback()
                        return self.send(409, {"error": "Save the draft before approval"})
                rid = str(uuid.uuid4())
                c.execute("INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?)",
                          (rid,actor["organization"],kind,object_id,version+1,actor["user"],
                           datetime.now(timezone.utc).isoformat(),body,key,digest))
                c.commit()
                self.send(201, {"id":rid,"version":version+1})
            finally:
                c.close()
        except (ValueError, KeyError, TypeError, UnicodeDecodeError):
            self.send(400, {"error":"Invalid request"})
        except sqlite3.Error:
            self.send(500, {"error":"Storage unavailable"})

if __name__ == "__main__":
    connect().close()
    ThreadingHTTPServer(("127.0.0.1",8770),Handler).serve_forever()
