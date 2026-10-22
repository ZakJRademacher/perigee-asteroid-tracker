import {makeCatalogService} from './catalog.js';
import {makeHorizonsService} from './horizons.js';
// __ASSET_TABLE__ is supplied by the deterministic portable Worker build.
let service,catalogService;
export default {
 async fetch(request,env={}){const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(url.pathname==='/api/catalog'){
   if(request.method==='HEAD')return new Response(null,{status:405});
   try{if(!catalogService){let seed=null;try{seed=JSON.parse(atob(ASSETS['/data/snapshot.json'].data));}catch{}catalogService=makeCatalogService({apiKey:env.NASA_API_KEY||'DEMO_KEY',persistentCache:typeof caches!=='undefined'?caches.default:null,seed});}return Response.json(await catalogService(url.searchParams.get('start')),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch(e){const bad=/valid|date|start/.test(e.message);return Response.json({error:bad?e.message:/rate.limit/.test(e.message)?'NASA request limit reached; please retry later.':'NASA catalog unavailable; please retry later.'},{status:bad?400:503,headers:{'Cache-Control':'no-store'}});}
  }
  if(url.pathname==='/api/ephemeris'){
   if(request.method==='HEAD')return new Response(null,{status:405});
   try{if(!service){let seed=[];try{const file=ASSETS['/data/horizons-example.json'];if(file)seed=[JSON.parse(atob(file.data))];}catch{}service=makeHorizonsService({persistentCache:typeof caches!=='undefined'?caches.default:null,seed});}const data=await service(url.searchParams.get('id'),url.searchParams.get('start'));return Response.json(data,{headers:{'Cache-Control':'private,max-age=300','X-Content-Type-Options':'nosniff'}});}catch(e){const bad=/required|dates must|starting date/.test(e.message);return Response.json({error:bad?e.message:'Position unavailable: '+e.message,retryAfter:e.retryAfter??null},{status:bad?400:503,headers:{'Cache-Control':'no-store',...(e.retryAfter?{'Retry-After':String(e.retryAfter)}:{})}});}
  }
  let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}if(path==='/')path='/index.html';
  const item=ASSETS[path];if(!item)return new Response('Not found',{status:404});
  const headers={'Content-Type':item.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};if(request.method==='HEAD')return new Response(null,{headers});
  const raw=atob(item.data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Response(bytes,{headers});
 }
};
