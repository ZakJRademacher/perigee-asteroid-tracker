"""Vendor an exact official npm Three.js release, verifying its registry integrity."""
from pathlib import Path
import urllib.request,json,hashlib,base64,tarfile,io
root=Path(__file__).resolve().parents[1];version='0.186.1'
with urllib.request.urlopen(f'https://registry.npmjs.org/three/{version}',timeout=30) as r:meta=json.load(r)
with urllib.request.urlopen(meta['dist']['tarball'],timeout=30) as r:payload=r.read()
digest='sha512-'+base64.b64encode(hashlib.sha512(payload).digest()).decode()
assert digest==meta['dist']['integrity'],'npm tarball integrity mismatch'
out=root/'dist/vendor';out.mkdir(exist_ok=True)
mapping={'build/three.module.js':'three.module.js','build/three.core.js':'three.core.js','examples/jsm/controls/OrbitControls.js':'OrbitControls.js','LICENSE':'LICENSE-three.txt'}
files={}
with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:
 for source,target in mapping.items():
  b=tar.extractfile('package/'+source).read();(out/target).write_bytes(b);files[target]=hashlib.sha256(b).hexdigest()
(out/'provenance.json').write_text(json.dumps({'package':'three','version':version,'source':meta['dist']['tarball'],'integrity':digest,'files_sha256':files,'modifications':'None. Browser import map resolves the bare three import.'},indent=2),encoding='utf-8')
print('Vendored verified Three.js '+version)
