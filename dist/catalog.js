import {addDays,validDate,normalizeFeed} from './model.js';
export const CATALOG_DAYS=30;
export const CANDIDATE_BUFFER_DAYS=7;
export function catalogCoverage(start){return {start:addDays(start,-CANDIDATE_BUFFER_DAYS),end:addDays(start,CATALOG_DAYS+CANDIDATE_BUFFER_DAYS-1)};}
export function catalogWindows(start){
 if(!validDate(start))throw new RangeError('A valid catalog start date is required');
 const coverage=catalogCoverage(start),days=CATALOG_DAYS+2*CANDIDATE_BUFFER_DAYS;
 return Array.from({length:Math.ceil(days/7)},(_,i)=>({start:addDays(coverage.start,i*7),end:addDays(coverage.start,Math.min(i*7+6,days-1))}));
}
export function mergeCatalog(start,feeds){
 const windows=catalogWindows(start);if(feeds.length!==windows.length)throw Error('Incomplete buffered NASA catalog');
 const coverage=catalogCoverage(start),groups=Object.fromEntries(Array.from({length:CATALOG_DAYS+2*CANDIDATE_BUFFER_DAYS},(_,i)=>[addDays(coverage.start,i),[]]));
 feeds.forEach((feed,index)=>{
  normalizeFeed(feed);
  for(const [date,objects] of Object.entries(feed.near_earth_objects)){
   if(date<windows[index].start||date>windows[index].end)throw Error('NASA returned dates outside the requested batch');
   groups[date].push(...objects);
  }
 });
 return {element_count:Object.values(groups).reduce((n,a)=>n+a.length,0),near_earth_objects:groups};
}
export async function fetchCatalog(start,{fetcher=fetch,signal,onProgress=()=>{},apiKey='DEMO_KEY'}={}){
 const windows=catalogWindows(start),feeds=[];
 for(const [index,window] of windows.entries()){
  onProgress(index+1,windows.length);
  const response=await fetcher(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${window.start}&end_date=${window.end}&api_key=${encodeURIComponent(apiKey)}`,{signal});
  if(!response.ok)throw Error(response.status===429?'NASA request rate limit reached.':'NASA returned HTTP '+response.status+'.');
  feeds.push(await response.json());
 }
 return mergeCatalog(start,feeds);
}
export function fieldRows(records,epoch,selected,limit=60){
 const sorted=[...records].sort((a,b)=>Math.abs(a.epoch-epoch)-Math.abs(b.epoch-epoch)||a.epoch-b.epoch||a.key.localeCompare(b.key));
 const result=sorted.slice(0,limit),chosen=records.find(r=>r.key===selected);
 if(chosen&&!result.includes(chosen)){result.pop();result.push(chosen);}
 return result;
}

export function encounterRows(feed,start,days=CATALOG_DAYS){
 const data=normalizeFeed(feed),first=Date.parse(start+'T00:00:00Z'),end=first+days*86400000;
 return {...data,rows:data.rows.filter(r=>r.epoch>=first&&r.epoch<end)};
}
