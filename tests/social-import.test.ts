import assert from 'node:assert/strict';
import {test} from 'node:test';
import {importedSocials} from '../lib/social-import.ts';

test('maps common CSV social aliases to observed canonical profiles',()=>{
  const profiles=importedSocials({IG:'https://m.instagram.com/Example/?utm_source=csv',FB:'@ExampleBiz',LinkedIn:'https://www.linkedin.com/company/example/'});
  assert.deepEqual(profiles.map(profile=>[profile.platform,profile.normalizedHandle]),[
    ['instagram','example'],['facebook','examplebiz'],['linkedin_company','example']]);
});
