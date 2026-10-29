import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ClientReport = {accountName:string;periodStart:string;periodEnd:string;
  newLeads:number;bookedJobs:number;answeredCalls:number;missedCallsRecovered:number;
  reviewsReceived:number;averageRating:number|null;adSpendCents:number;workDone:string;whatsNext:string;brandPrimary?:string};

export async function clientReportPdf(report:ClientReport):Promise<Uint8Array> {
  const safe=(value:string)=>value.normalize('NFKD').replace(/[^\x20-\x7E]/g,'?');
  const pdf=await PDFDocument.create();let page=pdf.addPage([612,792]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const hex=/^#[0-9a-f]{6}$/i.test(report.brandPrimary||'')?report.brandPrimary!:'#19336b';
  const brand=rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  page.drawRectangle({x:0,y:715,width:612,height:77,color:brand});
  page.drawText(safe(report.accountName).slice(0,70),{x:42,y:751,size:20,font:bold,color:rgb(1,1,1)});
  page.drawText(`${report.periodStart} to ${report.periodEnd}`,{x:42,y:729,size:10,font,color:rgb(1,1,1)});
  let y=685;
  const ensureSpace=()=>{if(y<70){page=pdf.addPage([612,792]);y=740}};
  for(const [label,value] of [
    ['New leads',report.newLeads],['Booked jobs',report.bookedJobs],['Answered calls',report.answeredCalls],
    ['Missed calls recovered',report.missedCallsRecovered],['Reviews received',report.reviewsReceived],
    ['Average rating',report.averageRating??'No reviews'],['Ad spend',`$${(report.adSpendCents/100).toFixed(2)}`],
  ] as Array<[string,string|number]>){
    ensureSpace();page.drawText(label,{x:42,y,size:11,font,color:rgb(0.25,0.31,0.4)});
    page.drawText(String(value),{x:500,y,size:11,font:bold,color:brand});y-=30;
  }
  function block(title:string,body:string){
    ensureSpace();
    page.drawText(title,{x:42,y,size:14,font:bold,color:brand});y-=22;
    const words=safe(body).trim().split(/\s+/);let line='';
    for(const word of words){const next=`${line} ${word}`.trim();if(next.length>90){ensureSpace();page.drawText(line.slice(0,100),{x:42,y,size:10,font});y-=16;line=word}else line=next}
    if(line){ensureSpace();page.drawText(line.slice(0,100),{x:42,y,size:10,font});y-=16}y-=20;
  }
  block('What we did',report.workDone||'No update entered.');
  block("What's next",report.whatsNext||'No update entered.');
  page.drawText('Victory Sync',{x:42,y:42,size:9,font,color:rgb(0.4,0.45,0.52)});
  return pdf.save();
}
