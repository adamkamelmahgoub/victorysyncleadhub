import assert from 'node:assert/strict';
import test from 'node:test';
import {readdirSync,readFileSync} from 'node:fs';

test('Hobby deployment stays within twelve Vercel functions',()=>{
  const apiDir=new URL('../api/',import.meta.url);
  const functions=readdirSync(apiDir).filter(name=>name.endsWith('.ts'));
  assert(functions.length<=12,`Found ${functions.length} API functions: ${functions.join(', ')}`);
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8')) as
    {routes:Array<{src?:string;dest?:string}>};
  assert(config.routes.some(route=>route.src==='^/api/public/booking/[^/]+$'&&
    route.dest==='/api/client-landing.ts'));
});
