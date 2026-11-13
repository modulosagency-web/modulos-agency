import fs from "node:fs";
const file="public/data/businesses.json";
const data=JSON.parse(fs.readFileSync(file,"utf8"));
if(!Array.isArray(data))throw new Error("businesses.json must contain an array");
const ids=new Set();
for(const b of data){if(!/^[A-Za-z0-9_-]{1,80}$/.test(b.id||""))throw new Error(`Invalid ID: ${b.id}`);if(ids.has(b.id))throw new Error(`Duplicate ID: ${b.id}`);ids.add(b.id);if(!b.name)throw new Error(`Missing business name for ${b.id}`);}
console.log(`Validated ${data.length} business record(s).`);
