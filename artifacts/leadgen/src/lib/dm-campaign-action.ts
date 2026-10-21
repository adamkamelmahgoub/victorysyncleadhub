const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function campaignStatusAction(id:string,currentStatus:string){
  if(!uuid.test(id))throw new Error('Campaign data is stale. Refresh this page and try again.');
  return {action:'status',campaign_id:id,status:currentStatus==='active'?'paused':'active'};
}
