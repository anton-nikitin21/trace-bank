"""Keep the homepage preview derived from actual workspace fixtures and rule engine."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'app'))
from engine import analyze

source = (ROOT / 'templates/workspace.html').read_text(encoding='utf-8')
initial = re.search(r'window.INITIAL_PACKET=(.*?);window.CORRECTED_PACKET=', source)
corrected = re.search(r'window.CORRECTED_PACKET=(.*?);</script>', source)
if not initial or not corrected:
    raise SystemExit('Workspace fixtures were not found.')
reports = {name: analyze(json.loads(match.group(1)))
           for name, match in [('initial', initial), ('corrected', corrected)]}
# The hero needs a projection, not document bodies or a second business engine.
fields = ('transaction_count', 'document_count', 'issue_count', 'rows')
reports = {name: {key: report[key] for key in fields} for name, report in reports.items()}
payload = json.dumps(reports, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
page = ROOT / 'website/index.html'
html = page.read_text(encoding='utf-8')
updated, count = re.subn(r'(<script\b[^>]*\bid="previewData"[^>]*>).*?(</script>)',
                         lambda match: match.group(1) + payload + match.group(2), html, flags=re.S)
if count != 1:
    raise SystemExit('Expected exactly one homepage preview data block.')
if '--check' in sys.argv:
    if updated != html:
        raise SystemExit('Run python scripts/build_preview.py to refresh homepage fixture reports.')
    print('PASS: homepage preview matches actual workspace fixtures and engine')
else:
    page.write_text(updated, encoding='utf-8')
    print('Generated homepage preview from actual workspace fixtures and engine')
