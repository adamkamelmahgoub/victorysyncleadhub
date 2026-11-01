import test from 'node:test';
import assert from 'node:assert/strict';
import {previousReportPeriod,reportMetricRange} from '../lib/client-report-period.js';

test('monthly report covers the prior calendar month across a leap day',()=>{
  const period=previousReportPeriod('monthly',new Date('2024-03-01T13:00:00Z'));
  assert.deepEqual(period,{type:'monthly',start:'2024-02-01',end:'2024-02-29'});
  assert.deepEqual(reportMetricRange(period),{start:'2024-02-01T00:00:00.000Z',
    endExclusive:'2024-03-01T00:00:00.000Z'});
});

test('weekly report covers the prior Monday through Sunday across a year',()=>{
  const period=previousReportPeriod('weekly',new Date('2027-01-04T13:00:00Z'));
  assert.deepEqual(period,{type:'weekly',start:'2026-12-28',end:'2027-01-03'});
  assert.deepEqual(reportMetricRange(period),{start:'2026-12-28T00:00:00.000Z',
    endExclusive:'2027-01-04T00:00:00.000Z'});
});

test('report range rejects a reversed period',()=>{
  assert.throws(()=>reportMetricRange({start:'2026-11-01',end:'2026-10-31'}));
});
