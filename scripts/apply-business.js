import fs from "node:fs";
import path from "node:path";
const [action,id,payloadFile] = process.argv.slice(2);
const main="public/data/businesses.json";
const records=JSON.parse(fs.readFileSync(main,"utf8"));
if(!Array.isArray(records))throw new Error("Main JSON must be an array");
if(!/^[A-Za-z0-9_-]{1,80}$/.test(id||""))throw new Error("Invalid business ID");
const dir=path.join("public","nfcbusinesscp",id);
const idx=records.findIndex(x=>x.id===id);
if(action==="delete"){if(idx<0)throw new Error("Business not found");records.splice(idx,1);fs.rmSync(dir,{recursive:true,force:true});}
else{const b=JSON.parse(fs.readFileSync(payloadFile,"utf8"));if(b.id!==id||!b.name)throw new Error("Payload ID/name mismatch");if(action==="create"&&idx>=0)throw new Error("Duplicate ID");if(action==="edit"&&idx<0)throw new Error("Business not found");if(idx>=0)records[idx]=b;else records.push(b);fs.mkdirSync(path.join(dir,"assets"),{recursive:true});const publicData={...b};delete publicData.logoUpload;fs.writeFileSync(path.join(dir,"data.json"),JSON.stringify(publicData,null,2));if(b.logoUpload?.data){const bytes=Buffer.from(b.logoUpload.data,"base64");fs.writeFileSync(path.join(dir,"assets","logo.png"),bytes);}if(!fs.existsSync(path.join(dir,"assets","logo.png"))&&b.logo)publicData.logo=b.logo;const template=fs.readFileSync("scripts/business-template.html","utf8");fs.writeFileSync(path.join(dir,"index.html"),template);}
fs.writeFileSync(main,JSON.stringify(records,null,2)+"\n");
console.log(`${action} applied for ${id}`);
