// Converts the Mixamo FBX files in assets-src/ into one optimized GLB (public/models/fighter.glb).
// Usage: npx vite --port 5199 & node tools/convert.cjs
const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:5199/tools/convert.html'); await p.waitForFunction(()=>document.title==='DONE',null,{timeout:120000});
console.log(await p.evaluate(()=>window.INFO));
fs.mkdirSync('public/models',{recursive:true});
fs.writeFileSync('public/models/fighter.glb', Buffer.from(await p.evaluate(()=>window.GLB),'base64'));
await b.close();})();
