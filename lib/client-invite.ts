export function clientInviteUrl(code:string,email:string,name:string,base=process.env.APP_URL||'https://app.victorysync.com'){
  const url=new URL('/login',base);
  if(url.protocol!=='https:')throw new Error('Client portal URL must use HTTPS');
  url.searchParams.set('invite',code);
  url.searchParams.set('email',email);
  url.searchParams.set('name',name);
  return url.toString();
}
