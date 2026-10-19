"""Check local assets and JS syntax without installing dependencies."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "website"


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ("src", "href") and value:
                self.urls.append(value)


errors = []
scripts = 0
for page in SITE.glob("*.html"):
    source = page.read_text(encoding="utf-8")
    parser = Links()
    parser.feed(source)
    for value in parser.urls:
        url = urlsplit(value)
        if url.scheme or url.netloc or not url.path:
            continue
        target = (page.parent / unquote(url.path)).resolve()
        if not target.is_relative_to(SITE.resolve()) or not target.is_file():
            errors.append(f"{page.name}: missing or external local path {value}")
    for attributes, code in re.findall(r"<script\b([^>]*)>([\s\S]*?)</script>", source, re.I):
        if not code.strip() or re.search(r'\btype=[\"\x27]application/(?:ld\+)?json', attributes):
            continue
        with tempfile.TemporaryDirectory() as temporary:
            script = Path(temporary) / "inline.mjs"
            script.write_text(code, encoding="utf-8")
            result = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
            if result.returncode:
                errors.append(f"{page.name}: {result.stderr}")
        scripts += 1
for script in (SITE / "assets").glob("*.js"):
    result = subprocess.run(["node", "--check", str(script)], capture_output=True, text=True)
    if result.returncode:
        errors.append(f"{script.name}: {result.stderr}")
    scripts += 1
if errors:
    raise SystemExit("\n".join(errors))
print(f"PASS: website local links and {scripts} JavaScript blocks/files")
