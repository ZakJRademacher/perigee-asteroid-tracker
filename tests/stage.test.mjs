import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sizeComparison,distanceStory,speedStory,lightTime,heightStory,launchYear,orbitClass,orbitStory,inEarthShadow,satelliteRole} from '../dist/explain.js';
import {validNorad,photoQuery,wikidataPhotos,commonsImage,makeSatellitePhotoService,fileTitle} from '../worker/wikidata.js';
import {satelliteImagesFor} from '../dist/satellite-media.js';
import worker from '../dist/server/index.js';

test('plain-language comparisons pick the nearest familiar object and stay honest about unknowns',()=>{
 assert.equal(sizeComparison(8,17).thing,'a school bus');
 assert.equal(sizeComparison(300,400).thing,'the Eiffel Tower');
 assert.equal(sizeComparison(null,20),null);assert.equal(sizeComparison(20,10),null);
 assert.equal(distanceStory(192200).short,'closer than the Moon');
 assert.equal(distanceStory(3726300).short,'9.7× the Moon’s distance');
 assert.match(speedStory(7.66).text,/12 minutes$/);
 assert.equal(lightTime(384400),'1.3 seconds');assert.equal(lightTime(149597870.7),'8.3 minutes');
 assert.match(heightStory(420).text,/^39 times higher/);
 assert.equal(launchYear('1998-067A'),1998);assert.equal(launchYear(''),null);
});
test('orbit classes and stories follow the elements',()=>{
 assert.equal(orbitClass({periodMinutes:92.9,eccentricity:.0007,semiMajorKm:6795}).code,'LEO');
 assert.equal(orbitClass({periodMinutes:718,eccentricity:.01,semiMajorKm:26560}).code,'MEO');
 assert.equal(orbitClass({periodMinutes:1436,eccentricity:.0002,semiMajorKm:42164}).code,'GEO');
 assert.equal(orbitClass({periodMinutes:3808,eccentricity:.7,semiMajorKm:80000}).code,'HEO');
 assert.equal(orbitStory(92.9),'It circles Earth every 93 minutes, about 15.5 laps a day.');
 assert.equal(orbitStory(1436),'One trip around Earth takes about a day.');
 assert.match(satelliteRole('ISS (ZARYA)','stations'),/International Space Station/);
 assert.match(satelliteRole('SOMESAT 1','weather'),/weather forecasts/);
});
test('Earth shadow test uses the anti-Sun side within one Earth radius',()=>{
 const sun=[1.5e8,0,0];
 assert.equal(inEarthShadow([-6800,0,0],sun),true);
 assert.equal(inEarthShadow([6800,0,0],sun),false);
 assert.equal(inEarthShadow([-6800,7000,0],sun),false);
});

const sparql={results:{bindings:[
 {item:{value:'http://www.wikidata.org/entity/Q25271'},itemLabel:{value:'International Space Station'},img:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/ISS%20photo.jpg'},links:{value:'120'}},
 {item:{value:'http://www.wikidata.org/entity/Q25271'},itemLabel:{value:'International Space Station'},img:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/ISS%20photo.jpg'},links:{value:'120'}},
 {item:{value:'http://www.wikidata.org/entity/Q190207'},itemLabel:{value:'Zarya'},img:{value:'http://commons.wikimedia.org/wiki/Special:FilePath/Zarya.jpg'},links:{value:'40'}}]}};
const commons={query:{pages:{1:{title:'File:ISS photo.jpg',imageinfo:[{thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/ISS.jpg/800px-ISS.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:ISS_photo.jpg',extmetadata:{Artist:{value:'<a href="x">NASA</a>'},LicenseShortName:{value:'Public domain'},ImageDescription:{value:'The <b>station</b> from Crew Dragon'}}}]}}}};

test('Wikidata lookup takes the best-known item for a NORAD number and only Commons-hosted images',()=>{
 assert.ok(validNorad('25544'));for(const bad of ['0','abc','25544"} DROP','1234567890',''])assert.equal(validNorad(bad),false);
 assert.match(photoQuery('25544'),/wdt:P377 "25544"/);
 assert.equal(fileTitle('http://commons.wikimedia.org/wiki/Special:FilePath/A%20b.jpg'),'A b.jpg');
 const found=wikidataPhotos(sparql);
 assert.equal(found.label,'International Space Station');assert.deepEqual(found.files,['ISS photo.jpg']);assert.equal(found.item,'https://www.wikidata.org/entity/Q25271');
 const image=commonsImage(commons.query.pages[1],found);
 assert.equal(image.credit,'NASA');assert.equal(image.license,'Public domain');assert.equal(image.caption,'The station from Crew Dragon');
 assert.equal(commonsImage({imageinfo:[{thumburl:'https://evil.test/a.jpg'}]},found),null);
 assert.throws(()=>wikidataPhotos({}),/Unexpected/);
});
test('photo service caches results, including "no photo", and never queries for an invalid number',async()=>{
 const calls=[];const fetcher=async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('wikidata')?sparql:commons));};
 const service=makeSatellitePhotoService({fetcher});
 const first=await service('25544');assert.equal(first.images.length,1);assert.equal(calls.length,2);
 await service('25544');assert.equal(calls.length,2);
 const none=makeSatellitePhotoService({fetcher:async()=>{calls.push('x');return new Response(JSON.stringify({results:{bindings:[]}}));}});
 assert.deepEqual((await none('99999')).images,[]);const before=calls.length;await none('99999');assert.equal(calls.length,before);
 await assert.rejects(service('abc'),/NORAD/);
 const reply=await worker.fetch(new Request('https://perigee.test/api/satellite-photos?norad=..%2Fx'));assert.equal(reply.status,400);
});
test('reviewed NASA fallback photos are NASA-hosted and label family images',()=>{
 for(const norad of [25544,20580,100882,51850]){for(const img of satelliteImagesFor(norad)){assert.ok(new URL(img.src).hostname==='images-assets.nasa.gov');for(const k of ['title','type','credit','date','caption','source'])assert.ok(img[k],k);if(img.family)assert.match(img.caption,/not (necessarily )?this/i);}}
});
test('vendored Space Grotesk keeps its recorded hash and OFL license',()=>{
 const vendor=JSON.parse(readFileSync(new URL('../dist/vendor/fonts/provenance.json',import.meta.url)));assert.equal(vendor.license,'OFL-1.1');
 for(const [file,hash] of Object.entries(vendor.files_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL('../dist/vendor/fonts/'+file,import.meta.url))).digest('hex'),hash);
 assert.match(readFileSync(new URL('../dist/vendor/fonts/LICENSE-space-grotesk.txt',import.meta.url),'utf8'),/SIL Open Font License/);
});
