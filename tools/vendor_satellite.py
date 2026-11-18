"""Vendor the pure-JavaScript SGP4 subset of an exact satellite.js npm release, verifying registry integrity."""
from pathlib import Path
import urllib.request,json,hashlib,base64,tarfile,io
root=Path(__file__).resolve().parents[1];version='7.2.0'
with urllib.request.urlopen(f'https://registry.npmjs.org/satellite.js/{version}',timeout=30) as r:meta=json.load(r)
with urllib.request.urlopen(meta['dist']['tarball'],timeout=30) as r:payload=r.read()
digest='sha512-'+base64.b64encode(hashlib.sha512(payload).digest()).decode()
assert digest==meta['dist']['integrity'],'npm tarball integrity mismatch'
# Only the OMM parser, SGP4/SDP4 propagation and coordinate transforms. The
# WebAssembly bulk propagator, Doppler, Sun and shadow helpers are not needed.
modules=['constants.js','ext.js','io.js','propagation.js','transforms.js']+[f'propagation/{n}.js' for n in ['SatRec','check-for-decay','dpper','dscom','dsinit','dspace','gstime','initl','propagate','sgp4','sgp4init']]
out=root/'dist/vendor/satellite';(out/'propagation').mkdir(parents=True,exist_ok=True)
files={}
with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:
 for name in modules:
  b=tar.extractfile('package/dist/'+name).read();(out/name).write_bytes(b);files[name]=hashlib.sha256(b).hexdigest()
 b=tar.extractfile('package/LICENSE.md').read();(out/'LICENSE.md').write_bytes(b);files['LICENSE.md']=hashlib.sha256(b).hexdigest()
(out/'provenance.json').write_text(json.dumps({'package':'satellite.js','version':version,'license':'MIT','source':meta['dist']['tarball'],'integrity':digest,'files_sha256':files,'modifications':'None. Subset of package/dist: OMM parsing, SGP4/SDP4 propagation and coordinate transforms only.'},indent=2)+'\n',encoding='utf-8')
print('Vendored verified satellite.js '+version)
