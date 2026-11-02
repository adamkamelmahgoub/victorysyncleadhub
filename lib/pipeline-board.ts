import {z} from 'zod';

export const pipelineBoardQuerySchema=z.object({
  pipelineId:z.string().uuid().optional(),
  stageId:z.union([z.string().uuid(),z.literal('unassigned')]).optional(),
  offset:z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit:z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export type PipelineBoardQuery=z.infer<typeof pipelineBoardQuerySchema>;

export function leadStageFilter(stageId:string,accountId:string|null) {
  const stage=stageId==='unassigned'?'pipeline_stage_id=is.null':`pipeline_stage_id=eq.${encodeURIComponent(stageId)}`;
  return `${stage}${accountId?`&client_account_id=eq.${encodeURIComponent(accountId)}`:''}`;
}

export async function fetchPipelinePage<T>(stageId:string,accountId:string|null,offset:number,limit:number,
  fetchRows:(path:string)=>Promise<T[]>,fetchCount:(path:string)=>Promise<number>) {
  const filter=leadStageFilter(stageId,accountId);
  const [count,rows]=await Promise.all([
    fetchCount(`leads?select=id&${filter}`),
    fetchRows(`leads?select=*&${filter}&order=created_at.desc,id.desc&limit=${limit}&offset=${offset}`),
  ]);
  return {rows,count,hasMore:offset+rows.length<count};
}
