export type PortalDateRange='this_week'|'this_month'|'last_month'|'custom';

export function portalDateRange(range:PortalDateRange,now:Date,customFrom='',customTo=''){
  const start=new Date(now);
  let end=new Date(now);
  if(range==='this_week'){
    start.setDate(now.getDate()-((now.getDay()+6)%7));
    start.setHours(0,0,0,0);
    end=new Date(start);
    end.setDate(end.getDate()+7);
  }else if(range==='this_month'){
    start.setDate(1);
    start.setHours(0,0,0,0);
    end=new Date(start);
    end.setMonth(end.getMonth()+1);
  }else if(range==='last_month'){
    end.setDate(1);
    end.setHours(0,0,0,0);
    start.setTime(end.getTime());
    start.setMonth(start.getMonth()-1);
  }else{
    start.setTime(customFrom?new Date(`${customFrom}T00:00:00`).getTime():NaN);
    end.setTime(customTo?new Date(`${customTo}T00:00:00`).getTime():NaN);
    if(!Number.isNaN(end.getTime()))end.setDate(end.getDate()+1);
  }
  const valid=Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&start<end;
  return {valid,from:valid?start.toISOString():'',to:valid?end.toISOString():''};
}
