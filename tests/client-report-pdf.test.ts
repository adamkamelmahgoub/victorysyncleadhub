import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { clientReportPdf } from '../lib/client-report-pdf.js';

test('client report produces a readable one-page PDF with live metrics', async () => {
  const bytes=await clientReportPdf({accountName:'Acme Plumbing',periodStart:'2026-10-01',periodEnd:'2026-10-31',
    newLeads:12,bookedJobs:4,answeredCalls:31,missedCallsRecovered:3,reviewsReceived:2,
    averageRating:4.5,adSpendCents:50000,workDone:'Published two campaign pages.',
    whatsNext:'Review the booked jobs and improve follow-up.'});
  assert.equal(Buffer.from(bytes.subarray(0,8)).toString(),'%PDF-1.7');
  const document=await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(),1);
  assert.ok(bytes.length>1000);
});

test('long account manager notes continue onto another PDF page', async () => {
  const bytes=await clientReportPdf({accountName:'Acme Plumbing',periodStart:'2026-10-01',periodEnd:'2026-10-31',
    newLeads:1,bookedJobs:0,answeredCalls:2,missedCallsRecovered:0,reviewsReceived:0,
    averageRating:null,adSpendCents:0,workDone:'Called customers and updated campaign pages. '.repeat(100),
    whatsNext:'Review the next campaign.',brandPrimary:'#ff6600'});
  assert.ok((await PDFDocument.load(bytes)).getPageCount()>1);
});
