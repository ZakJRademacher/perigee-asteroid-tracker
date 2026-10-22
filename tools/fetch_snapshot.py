"""Refresh the dated fallback through Perigee's credential-free public endpoint."""
import argparse,json,urllib.request
from datetime import datetime,timezone,timedelta,date
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--start',default=datetime.now(timezone.utc).date().isoformat())
p.add_argument('--base-url',default='https://perigee.zakjrademacher.workers.dev')
a=p.parse_args();start=date.fromisoformat(a.start)
url=a.base_url.rstrip('/')+'/api/catalog?start='+str(start)
req=urllib.request.Request(url,headers={'User-Agent':'Perigee snapshot maintenance','Accept':'application/json'})
with urllib.request.urlopen(req,timeout=65) as r:d=json.load(r)
assert d['start']==str(start) and d['end']==str(start+timedelta(days=29)),'Incomplete timeline'
assert d['candidateStart']==str(start-timedelta(days=7)) and d['candidateEnd']==str(start+timedelta(days=36)),'Incomplete candidate coverage'
assert len(d['feed']['near_earth_objects'])==44,'Incomplete daily groups'
out={'source':'NASA NeoWs','source_url':'https://api.nasa.gov/','retrieved_at':d['retrievedAt'],'start':d['start'],'end':d['end'],'candidateStart':d['candidateStart'],'candidateEnd':d['candidateEnd'],'feed':d['feed']}
text=json.dumps(out,ensure_ascii=False,separators=(',',':'))
assert 'api_key=' not in text,'Provider credential URLs must not enter the saved snapshot'
target=Path(__file__).resolve().parents[1]/'dist/data/snapshot.json'
temporary=target.with_suffix('.json.tmp');temporary.write_text(text,encoding='utf-8');temporary.replace(target)
print(f"Saved dated NASA snapshot: {d['start']} through {d['end']}; candidates {d['candidateStart']} through {d['candidateEnd']}")
