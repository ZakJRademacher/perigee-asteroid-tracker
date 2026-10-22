import {createServer} from 'node:http';
import worker from '../dist/server/index.js';
const server=createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1:8790'+req.url,{method:req.method,headers:req.headers}),reply=await worker.fetch(request);res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));}catch(e){res.writeHead(500);res.end('Preview error: '+e.message);}});server.listen(8790,'127.0.0.1',()=>console.log('Worker preview: http://127.0.0.1:8790/'));process.on('SIGINT',()=>server.close());
