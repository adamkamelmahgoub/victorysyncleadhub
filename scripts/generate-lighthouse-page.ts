import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderPage} from '../lib/landing-renderer.js';

const output=resolve('.local/lighthouse-public');
mkdirSync(output,{recursive:true});
const html=renderPage({
  id:'00000000-0000-4000-8000-000000000001',
  name:'Demo home service page',
  seo_title:'Home service in your area | Demo business',
  seo_description:'Request a visit from a local home service business.',
  theme:{primary:'#245eea',background:'#ffffff',text:'#17243d',font:'system'},
  sections:[
    {id:'hero',type:'hero',eyebrow:'Local home service',heading:'Help for your home',
      body:'Tell us what needs attention and we will contact you about the next step.',
      buttonText:'Call the business',buttonUrl:'tel:+15555550100'},
    {id:'services',type:'services',heading:'Services',blocks:[
      {id:'service-1',type:'Service',heading:'Repairs',body:'Ask about repair availability.'},
      {id:'service-2',type:'Service',heading:'Maintenance',body:'Ask about routine maintenance.'}]},
    {id:'contact',type:'cta',heading:'Ready to talk?',body:'Call or send a request to get started.',
      buttonText:'Call now',buttonUrl:'tel:+15555550100'},
    {id:'footer',type:'footer',heading:'Demo business',body:'Example content for performance testing.'},
  ],
});
writeFileSync(resolve(output,'index.html'),html);
