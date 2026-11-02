const agencyRoles=new Set(['agency_admin','agency_staff','owner','admin','member','viewer','agent']);

export function requiresAgencyMfa(role:string):boolean{
  return agencyRoles.has(role);
}
