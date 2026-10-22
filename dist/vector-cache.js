// IndexedDB holds the vector catalog without localStorage's small string quota.
// Cache failures never prevent live data from loading.
let opening;
async function database(){
 if(typeof indexedDB==='undefined')return null;
 if(!opening)opening=new Promise(resolve=>{
  const request=indexedDB.open('perigee-vector-cache',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('vectors');
  request.onerror=request.onblocked=()=>resolve(null);
  request.onsuccess=()=>{
   const db=request.result;db.onversionchange=()=>db.close();resolve(db);
   try{const cursor=db.transaction('vectors','readwrite').objectStore('vectors').openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(Date.now()-Date.parse(item.value.retrievedAt)>3600000)item.delete();item.continue();};}catch{}
  };
 });
 return opening;
}
export const vectorCache={
 async get(key){
  try{const db=await database();if(db){const value=await new Promise(resolve=>{const request=db.transaction('vectors').objectStore('vectors').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);});if(value)return value;}}catch{}
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
 },
 async set(key,data){
  try{const db=await database();if(db){await new Promise(resolve=>{const tx=db.transaction('vectors','readwrite');tx.objectStore('vectors').put(data,key);tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();});return;}}catch{}
  try{localStorage.setItem(key,JSON.stringify(data));}catch{}
 }
};
