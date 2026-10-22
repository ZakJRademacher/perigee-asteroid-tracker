import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,extname,relative} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist'),assets={};
const types={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.json':'application/json;charset=utf-8','.svg':'image/svg+xml','.gif':'image/gif','.jpg':'image/jpeg','.txt':'text/plain;charset=utf-8'};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='server'||entry.name.startsWith('.'))continue;const file=resolve(dir,entry.name);if(entry.isDirectory())await collect(file);else{const bytes=await readFile(file);assets['/'+relative(dist,file).replaceAll('\\','/')]= {type:types[extname(file)]??'application/octet-stream',data:bytes.toString('base64')};}}}
await collect(dist);const helper=(await readFile(resolve(root,'worker/horizons.js'),'utf8')).replace(/^export /gm,''),worker=(await readFile(resolve(root,'worker/index.js'),'utf8')).replace(/^import .*?;\s*/gm,'');
await mkdir(resolve(dist,'server'),{recursive:true});await writeFile(resolve(dist,'server/index.js'),'const ASSETS='+JSON.stringify(assets)+';\n'+helper+'\n'+worker);console.log('Built portable Worker with '+Object.keys(assets).length+' embedded assets.');
