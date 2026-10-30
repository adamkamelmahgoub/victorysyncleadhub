import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewStats} from '../lib/review-stats.js';

test('reputation metrics include rating and platform breakdowns',()=>{
  const result=reviewStats([
    {rating:5,platform:'google',reply:null,is_read:false},
    {rating:4,platform:'google',reply:'Thanks',is_read:true},
    {rating:3,platform:'facebook',reply:null,is_read:true},
  ]);
  assert.equal(result.total,3);
  assert.equal(result.avgRating,'4.0');
  assert.deepEqual(result.byRating.find(row=>row.rating===5),{rating:5,count:1});
  assert.deepEqual(result.byPlatform.find(row=>row.platform==='google'),{platform:'google',count:2,avg:'4.5'});
  assert.equal(result.unreplied,2);
  assert.equal(result.unread,1);
});
