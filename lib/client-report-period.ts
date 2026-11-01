export type ReportPeriod = {type:'weekly'|'monthly';start:string;end:string};

const isoDate=(date:Date)=>date.toISOString().slice(0,10);

export function previousReportPeriod(type:ReportPeriod['type'],now=new Date()):ReportPeriod {
  if(type==='monthly'){
    const firstOfThisMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    const firstOfLastMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));
    return {type,start:isoDate(firstOfLastMonth),end:isoDate(new Date(firstOfThisMonth.getTime()-86400_000))};
  }
  const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const daysSinceMonday=(today.getUTCDay()+6)%7;
  const thisMonday=new Date(today.getTime()-daysSinceMonday*86400_000);
  return {type,start:isoDate(new Date(thisMonday.getTime()-7*86400_000)),
    end:isoDate(new Date(thisMonday.getTime()-86400_000))};
}

export function reportMetricRange(period:Pick<ReportPeriod,'start'|'end'>){
  const start=new Date(`${period.start}T00:00:00.000Z`);
  const lastDay=new Date(`${period.end}T00:00:00.000Z`);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(lastDay.getTime())||start>lastDay)
    throw new Error('Invalid report period');
  return {start:start.toISOString(),endExclusive:new Date(lastDay.getTime()+86400_000).toISOString()};
}
