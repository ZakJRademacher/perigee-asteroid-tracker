"""Fetch pinned astronomy code and original NASA Earth textures with provenance."""
import base64,hashlib,io,json,tarfile,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def fetch(url):
    with urllib.request.urlopen(url,timeout=60) as response:return response.read()

version='2.1.19'
meta=json.loads(fetch('https://registry.npmjs.org/astronomy-engine/'+version))
payload=fetch(meta['dist']['tarball'])
assert 'sha512-'+base64.b64encode(hashlib.sha512(payload).digest()).decode()==meta['dist']['integrity']
with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as archive:
    module=archive.extractfile('package/esm/astronomy.js').read()
(ROOT/'dist/vendor/astronomy.js').write_bytes(module)
(ROOT/'dist/vendor/astronomy-provenance.json').write_text(json.dumps({'package':'astronomy-engine','version':version,'source':meta['dist']['tarball'],'integrity':meta['dist']['integrity'],'files_sha256':{'astronomy.js':hashlib.sha256(module).hexdigest()},'license':'MIT; full notice retained in astronomy.js','modifications':'None'},indent=2)+'\n',encoding='utf-8')
assets=ROOT/'dist/assets'
provenance=json.loads((assets/'provenance.json').read_text())
for file,url,source,credit,date in [
('earth-day.jpg','https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg','https://science.nasa.gov/resource/blue-marble/','NASA/Goddard Space Flight Center; Reto Stöckli','Historical Blue Marble composite, published 2002'),
('earth-clouds.jpg','https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg','https://svs.gsfc.nasa.gov/2709/','NASA/Goddard Space Flight Center; Reto Stöckli','Historical Blue Marble cloud composite, published 2002'),
('earth-night.jpg','https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg','https://svs.gsfc.nasa.gov/30028/','NASA Earth Observatory/Robert Simmon; Suomi NPP VIIRS data courtesy Chris Elvidge, NOAA NGDC','April and October 2012')]:
    data=fetch(url)
    assert data[:2]==b'\xff\xd8','Expected JPEG'
    (assets/file).write_bytes(data)
    provenance['assets'][file]={'url':url,'source':source,'credit':credit,'date':date,'sha256':hashlib.sha256(data).hexdigest(),'modifications':'None. Displayed on a spherical globe with computed lighting; historical imagery, not live weather.'}
(assets/'provenance.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Verified astronomy runtime and three original NASA Earth textures saved.')
