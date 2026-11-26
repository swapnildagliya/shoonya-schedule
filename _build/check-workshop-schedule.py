from pathlib import Path
import json,re
r=Path(__file__).resolve().parents[1]
d=json.loads((r/'data/workshop-schedule.json').read_text())
assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',d['updated'])
assert not any(k in json.dumps(d) for k in ['registered_students','max_students','email','capacity_people'])
assert len({(x['slug'],x['date']) for x in d['rows']})==len(d['rows'])
for lang,path in [('en','workshops/index.html'),('nl','nl/workshops/index.html')]:
 s=(r/path).read_text();assert '{{' not in s
 assert f'<html lang="{lang}">' in s
 assert s.count('class="workshop-row"')==len(d['rows'])
 assert 'noindex' not in s
 for x in d['rows']:
  assert x['book'].startswith('https://portal.shoonyadance.com/register/')
  assert x['endDate']>=x['date']
  if x['start']:assert re.fullmatch(r'\d{2}:\d{2}',x['start'])
  assert x['price'] is None or x['price']>=0
  if x['slug']=='round-trip-to-cuba':assert x['teachers']==['Wilmer & Maria']
print(f"PASS: {len(d['rows'])} dated entries; EN/NL parity, booking URLs, dates, no private capacity fields")
