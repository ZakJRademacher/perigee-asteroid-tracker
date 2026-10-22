import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldObjects,radiusField,fieldScale,clipTrack} from '../dist/field.js';
import {LD_KM} from '../dist/ephemeris.js';

test('objects enter and exit at their interpolated radius, independent of encounter date or closest approach',()=>{
 const radius=100*LD_KM,first=Date.parse('2026-10-22'),duration=4*86400000,speed=4*radius/(duration/1000);
 const data={samples:[[first,-2*radius,0,0,speed,0,0],[first+duration,2*radius,0,0,speed,0,0]]};
 const records=[{id:'moving',key:'buffered-encounter',epoch:first-86400000,km:radius*9},{id:'unknown',key:'unavailable',epoch:first}];
 const ephemerides=new Map([['moving',data]]);
 for(const [day,expected] of [[0,0],[1,1],[2,1],[3,1],[4,0]]){const field=radiusField(records,ephemerides,first+day*86400000,100);assert.equal(field.inside.length,expected);assert.equal(field.loaded,1);assert.equal(field.total,2);}
 assert.equal(radiusField(records,ephemerides,first-1,100).loaded,0);
});

test('multiple close approaches represent one physical object, with the selected encounter preserved',()=>{
 const rows=[{id:'a',key:'a-before',epoch:0},{id:'a',key:'a-after',epoch:100},{id:'b',key:'b',epoch:30}];
 assert.equal(fieldObjects(rows,90,null).find(r=>r.id==='a').key,'a-after');
 assert.equal(fieldObjects(rows,90,'a-before').find(r=>r.id==='a').key,'a-before');
 assert.equal(fieldObjects(rows,90,null).length,2);
});

test('likely nearby candidates load before distant ones, with explicit selection first',()=>{
 const rows=[{id:'far',key:'far',epoch:0,km:2000000,speed:0},{id:'near',key:'near',epoch:0,km:100000,speed:0},{id:'later',key:'later',epoch:1000000,km:10000,speed:10}];
 assert.deepEqual(fieldObjects(rows,0,null).map(r=>r.id),['later','near','far']);
 assert.equal(fieldObjects(rows,0,'far')[0].id,'far');
});

test('viewing radius fixes one linear scale regardless of time, selection or loaded positions',()=>{
 assert.ok(Math.abs(100*LD_KM/fieldScale(100)-7.8)<1e-12);assert.equal(fieldScale(100),2*fieldScale(50));
 for(const radius of [0,-1,101,200,NaN,Infinity])assert.throws(()=>fieldScale(radius));
 const field=radiusField([],new Map(),Date.now(),100);assert.equal(field.scale,fieldScale(100));
});

test('trajectory clipping preserves entry and exit intersections without bridging outside gaps',()=>{
 const p=position=>({position});
 assert.deepEqual(clipTrack([p([-2,0,0]),p([2,0,0])],1),[[-1,0,0],[1,0,0]]);
 const segments=clipTrack([p([0,0,0]),p([2,0,0]),p([2,2,0]),p([0,0,0])],1);
 assert.equal(segments.length,4);assert.deepEqual(segments[1],[1,0,0]);
 for(const point of segments)assert.ok(Math.hypot(...point)<=1+1e-12);
 assert.deepEqual(clipTrack([p([2,2,0]),p([-2,2,0])],1),[]);
 assert.deepEqual(clipTrack([p([0,0,0]),p([0,0,0])],1),[]);
});
