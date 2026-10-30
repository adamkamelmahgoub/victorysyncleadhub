import crypto from 'node:crypto';

export function newFormSlug(name:string){
  const stem=name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50).replace(/-$/,'')||'form';
  return `${stem}-${crypto.randomUUID().slice(0,8)}`;
}
