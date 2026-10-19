export const DM_VARIABLES=['first_name','company','city','industry','google_rating','review_count'] as const;
export type DmVariables=Partial<Record<typeof DM_VARIABLES[number],string|number|null>>;
/** Rendering never sends a message. Optional spintax picks deterministically for a stable draft. */
export function renderDmTemplate(body:string,variables:DmVariables,spintax=false,seed=''):string {
  let text=body.replace(/\{\{([a-z_]+)\}\}/g,(_,name:string)=>
    DM_VARIABLES.includes(name as typeof DM_VARIABLES[number])?String(variables[name as keyof DmVariables]??''):'');
  if(spintax)text=text.replace(/\{([^{}]+\|[^{}]+)\}/g,(_,choices:string)=>{
    const parts=choices.split('|');let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;
    return parts[hash%parts.length];
  });
  return text.replace(/[ \t]{2,}/g,' ').trim();
}
