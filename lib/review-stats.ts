export type RatingRow = {rating:number|null;platform:string|null;reply:string|null;is_read:boolean|null};

export function reviewStats(rows:RatingRow[]){
  const total=rows.length;
  const average=total?rows.reduce((sum,row)=>sum+Number(row.rating||0),0)/total:0;
  const byRating=[5,4,3,2,1].map(rating=>({rating,count:rows.filter(row=>row.rating===rating).length}));
  const platforms=[...new Set(rows.map(row=>row.platform).filter((value):value is string=>Boolean(value)))];
  const byPlatform=platforms.map(platform=>{
    const group=rows.filter(row=>row.platform===platform);
    const avg=group.reduce((sum,row)=>sum+Number(row.rating||0),0)/group.length;
    return {platform,count:group.length,avg:avg.toFixed(1)};
  });
  return {total,avgRating:average.toFixed(1),byRating,byPlatform,
    unreplied:rows.filter(row=>!row.reply).length,
    unread:rows.filter(row=>!row.is_read).length};
}
