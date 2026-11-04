import assert from 'node:assert/strict';
import test from 'node:test';
import {portalDateRange} from '../lib/portal-date-range.js';

const localParts=(iso:string)=>{
  const date=new Date(iso);
  return [date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours()];
};

test('this week remains a seven-day local calendar range across month and year boundaries',()=>{
  const november=portalDateRange('this_week',new Date(2026,10,1,12));
  assert.equal(november.valid,true);
  assert.deepEqual(localParts(november.from),[2026,10,26,0]);
  assert.deepEqual(localParts(november.to),[2026,11,2,0]);
  const january=portalDateRange('this_week',new Date(2027,0,1,12));
  assert.deepEqual(localParts(january.from),[2026,12,28,0]);
  assert.deepEqual(localParts(january.to),[2027,1,4,0]);
});

test('month and inclusive custom ranges end at the next local midnight',()=>{
  const now=new Date(2027,0,31,12);
  const current=portalDateRange('this_month',now);
  assert.deepEqual(localParts(current.from),[2027,1,1,0]);
  assert.deepEqual(localParts(current.to),[2027,2,1,0]);
  const previous=portalDateRange('last_month',now);
  assert.deepEqual(localParts(previous.from),[2026,12,1,0]);
  assert.deepEqual(localParts(previous.to),[2027,1,1,0]);
  const custom=portalDateRange('custom',now,'2027-01-30','2027-01-31');
  assert.deepEqual(localParts(custom.from),[2027,1,30,0]);
  assert.deepEqual(localParts(custom.to),[2027,2,1,0]);
  assert.equal(portalDateRange('custom',now,'2027-02-02','2027-02-01').valid,false);
  assert.equal(portalDateRange('custom',now,'','2027-02-01').valid,false);
});
