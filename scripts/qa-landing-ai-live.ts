// Manual synthetic-data check. Run with: pnpm exec tsx scripts/qa-landing-ai-live.ts
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {aiJsonSchema,aiPageSystemPrompt,aiResponseSchema} from '../api/portal.js';
import {assertApprovedAiImages,assertNoUnsupportedProof} from '../lib/landing-ai-policy.js';
import {registry} from '../lib/landing-section-registry.js';

const envPath='.local/openrouter-manual.env';
const env=existsSync(envPath)?readFileSync(envPath,'utf8'):'';
const raw=env.match(/^OPENROUTER_API_KEY=(.*)$/m)?.[1]?.trim();
const key=process.env.OPENROUTER_API_KEY||(raw?.startsWith('"')?JSON.parse(raw) as string:raw);
if(!key)throw Error('Set OPENROUTER_API_KEY for the manual AI check');
const model='openai/gpt-4o-mini';
const samples=[
  ['Emergency plumbing','Austin'],['HVAC tune-up','Phoenix'],['Roof inspection','Tampa'],
  ['Water heater installation','Denver'],['Drain cleaning','Charlotte'],
  ['General contracting','Raleigh'],['Call answering','Dallas'],
  ['Electrical panel service','Columbus'],['Lawn care','Nashville'],
  ['Garage door repair','Sacramento'],
] as const;
const sectionRegistry=Object.values(registry).filter(item=>!['reviews','testimonial','trust_bar'].includes(item.type))
  .map(({type,label,fields,maxBlocks})=>({type,label,fields,maxBlocks}));
const fixturePath='tests/fixtures/landing-ai-live-synthetic.json';
mkdirSync('tests/fixtures',{recursive:true});
const fixtures:Array<{service:string;city:string;model:string;attempts:number;page:unknown}>=
  existsSync(fixturePath)?JSON.parse(readFileSync(fixturePath,'utf8')):[];
let promptTokens=0,completionTokens=0;
for(let index=0;index<samples.length;index++){
  const [service,city]=samples[index];
  if(fixtures.some(fixture=>fixture.service===service&&fixture.city===city&&fixture.model===model)){
    process.stdout.write(`SKIP ${index+1}/10, fixture already validated\n`);continue;
  }
  let feedback='',accepted=false;
  for(let attempt=1;attempt<=3;attempt++){
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({model,temperature:0.4,max_tokens:2200,
        response_format:{type:'json_schema',json_schema:{name:'landing_page',strict:true,schema:aiJsonSchema}},
        messages:[{role:'system',content:aiPageSystemPrompt},{role:'user',content:JSON.stringify({
          brief:`Create a landing page for ${service} in ${city}. No customer reviews, ratings, awards, licences, guarantees, prices, or photos were provided.`,
          client:{name:`Sample ${service} Company`,phone:'+12025550100',service,city,photos:[],reviews:[]},
          sectionRegistry,validationFeedback:feedback,
        })}]}),signal:AbortSignal.timeout(45000),
    });
    const data=await response.json() as {choices?:Array<{message?:{content?:string}}>;
      error?:{message?:string};usage?:{prompt_tokens?:number;completion_tokens?:number}};
    if(!response.ok)throw Error(`OpenRouter ${response.status}: ${data.error?.message||'request failed'}`);
    try{
      const page=aiResponseSchema.parse(JSON.parse(data.choices?.[0]?.message?.content||'{}'));
      assertNoUnsupportedProof([{heading:page.title,body:page.seoDescription},...page.sections]);
      assertApprovedAiImages(page.sections,[]);
      fixtures.push({service,city,model,attempts:attempt,page});
      writeFileSync(fixturePath,JSON.stringify(fixtures,null,2)+'\n');
      promptTokens+=data.usage?.prompt_tokens||0;
      completionTokens+=data.usage?.completion_tokens||0;
      process.stdout.write(`PASS ${index+1}/10 in ${attempt} attempt(s)\n`);
      accepted=true;break;
    }catch(error){
      feedback=error instanceof Error?error.message:'Invalid structured response';
      process.stdout.write(`RETRY ${index+1}/10 attempt ${attempt}: ${feedback.slice(0,180)}\n`);
    }
  }
  if(!accepted)throw Error(`Sample ${index+1} did not pass after three attempts`);
}
process.stdout.write(`PASS ${fixtures.length}/10 recorded fixtures; prompt tokens this run ${promptTokens}; completion tokens this run ${completionTokens}\n`);
