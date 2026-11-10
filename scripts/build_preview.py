"""Keep the homepage preview derived from actual workspace fixtures and rule engine."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'app'))
from engine import analyze, economics

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

# The static calculator and its comparison rows are derived from the same assumptions.
model = json.loads((ROOT / 'model/scenarios.json').read_text(encoding='utf-8'))
assumptions = model['moderate']['inputs']
if assumptions != economics({})['inputs']:
    raise SystemExit('Default engine assumptions differ from model/scenarios.json.')
def integer(value):
    return f"{round(value):,}".replace(',', ' ')
rows = []
for scenario in model.values():
    inputs = scenario['inputs']
    if {**inputs, 'cases': assumptions['cases']} != assumptions:
        raise SystemExit('Volume comparison must keep all other assumptions fixed.')
    result = economics(inputs)
    net = result['net_annual']
    signed_net = ('−' if net < 0 else '+' if net > 0 else '') + integer(abs(net))
    months = result['payback_months']
    payback = ('≈ ' + f"{months / 12:.2f}".replace('.', ',') + ' года') if months is not None else 'Не достигается'
    rows.append(f"<tr><td>{integer(inputs['cases'])}</td><td>{integer(result['hours'])}</td><td>{signed_net} ₽</td><td>{payback}</td></tr>")
evidence = ROOT / 'website/evidence.html'
previous = evidence.read_text(encoding='utf-8')
current, model_count = re.subn(r'(<script type="application/json" id="economicModel">).*?(</script>)',
                              lambda match: match[1] + json.dumps(assumptions, separators=(',', ':')) + match[2], previous)
current, row_count = re.subn(r'(<tbody id="economicRows">).*?(</tbody>)',
                             lambda match: match[1] + ''.join(rows) + match[2], current)
if model_count != 1 or row_count != 1:
    raise SystemExit('Expected the economics data and table on the evidence page.')
if '--check' in sys.argv:
    if current != previous:
        raise SystemExit('Run python scripts/build_preview.py to refresh the economic comparison.')
    print('PASS: economic comparison matches model/scenarios.json')
else:
    evidence.write_text(current, encoding='utf-8')
