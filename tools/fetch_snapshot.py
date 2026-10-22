"""Refresh the attributed NASA fallback snapshot; no private API key required."""
import json, urllib.request
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
import argparse
p=argparse.ArgumentParser();p.add_argument('--start',default=datetime.now(timezone.utc).date().isoformat());a=p.parse_args()
start=date.fromisoformat(a.start);end=start+timedelta(days=4)
groups={str(start+timedelta(days=i)):[] for i in range(5)}
sources=[]
for offset in range(0,5,7):
    first=start+timedelta(days=offset);last=min(end,first+timedelta(days=6))
    url=f'https://api.nasa.gov/neo/rest/v1/feed?start_date={first}&end_date={last}&api_key=DEMO_KEY'
    with urllib.request.urlopen(url,timeout=30) as r:batch=json.load(r)
    assert isinstance(batch.get('near_earth_objects'),dict),'Unexpected feed schema'
    for day,objects in batch['near_earth_objects'].items():
        assert str(first)<=day<=str(last),'Unexpected batch date'
        groups[day].extend(objects)
    sources.append({'start':str(first),'end':str(last),'url':url})
data={'element_count':sum(map(len,groups.values())),'near_earth_objects':groups}
out={'source':'NASA NeoWs','source_url':'https://api.nasa.gov/','retrieved_at':datetime.now(timezone.utc).isoformat(),'start':str(start),'end':str(end),'requests':sources,'feed':data}
# NASA responses include DEMO_KEY links; the public demo key is not a credential.
target=Path(__file__).resolve().parents[1]/'dist/data/snapshot.json'
target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Saved NASA snapshot: {start} to {end}; {data.get("element_count")} objects')
