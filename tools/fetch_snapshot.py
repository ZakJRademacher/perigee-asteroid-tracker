"""Refresh the attributed NASA fallback snapshot; no private API key required."""
import json, urllib.request
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--start',default=date.today().isoformat());a=p.parse_args()
start=date.fromisoformat(a.start);end=start+timedelta(days=6)
url=f'https://api.nasa.gov/neo/rest/v1/feed?start_date={start}&end_date={end}&api_key=DEMO_KEY'
with urllib.request.urlopen(url,timeout=30) as r:
    data=json.load(r)
assert isinstance(data.get('near_earth_objects'),dict),'Unexpected feed schema'
out={'source':'NASA NeoWs','source_url':'https://api.nasa.gov/','retrieved_at':datetime.now(timezone.utc).isoformat(),'start':str(start),'end':str(end),'feed':data}
# NASA responses include DEMO_KEY links; the public demo key is not a credential.
target=Path(__file__).resolve().parents[1]/'dist/data/snapshot.json'
target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Saved NASA snapshot: {start} to {end}; {data.get("element_count")} objects')
