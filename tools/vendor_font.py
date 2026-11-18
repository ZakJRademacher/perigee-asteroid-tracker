"""Vendor the Latin variable Space Grotesk font from an exact Fontsource npm release, verifying registry integrity."""
from pathlib import Path
import urllib.request,json,hashlib,base64,tarfile,io
root=Path(__file__).resolve().parents[1];package='@fontsource-variable/space-grotesk';version='5.3.0'
with urllib.request.urlopen(f'https://registry.npmjs.org/{package}/{version}',timeout=30) as r:meta=json.load(r)
with urllib.request.urlopen(meta['dist']['tarball'],timeout=30) as r:payload=r.read()
digest='sha512-'+base64.b64encode(hashlib.sha512(payload).digest()).decode()
assert digest==meta['dist']['integrity'],'npm tarball integrity mismatch'
out=root/'dist/vendor/fonts';out.mkdir(parents=True,exist_ok=True)
mapping={'files/space-grotesk-latin-wght-normal.woff2':'space-grotesk-latin-wght-normal.woff2','LICENSE':'LICENSE-space-grotesk.txt'}
files={}
with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:
 for source,target in mapping.items():
  b=tar.extractfile('package/'+source).read();(out/target).write_bytes(b);files[target]=hashlib.sha256(b).hexdigest()
(out/'provenance.json').write_text(json.dumps({'package':package,'version':version,'license':'OFL-1.1','source':meta['dist']['tarball'],'integrity':digest,'files_sha256':files,'modifications':'None. Latin subset only; loaded by @font-face in stage.css.'},indent=2)+'\n',encoding='utf-8')
print('Vendored verified Space Grotesk '+version)
