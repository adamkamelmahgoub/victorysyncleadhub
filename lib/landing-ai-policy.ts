type ClaimBlock = {heading?:string;body?:string;imageUrl?:string};
type ClaimSection = {type?:string;eyebrow?:string;heading?:string;body?:string;buttonText?:string;
  quote?:string;author?:string;imageAlt?:string;imageUrl?:string;items?:string[];blocks?:ClaimBlock[]};
const unsupportedProof = /\b(?:testimonials?|reviews?|ratings?|awards?|licen[sc]ed|insured|bonded|certified|warrant(?:y|ies)|guarantee[ds]?|five.star|5.star|top.rated|best.rated|trusted by|customers love|years? of experience)\b|\b\d{1,3}\s*\+?\s*years?\b|\b(?:since|founded in|established in)\s*(?:19|20)\d{2}\b|\$\s*\d|\b[0-5]\.\d\s*\/\s*5\b|\b\d[\d,]*\+?\s+(?:happy\s+)?(?:customers|clients|homeowners)\b/i;
const approvedPlaceholder = /\[(?:Add a real|Insert approved|Client-provided|Your verified)[^\]]*\]/gi;

export function assertNoUnsupportedProof(sections:ClaimSection[]) {
  for(const section of sections) {
    if(section.type&&['reviews','testimonial','trust_bar'].includes(section.type))
      throw new Error('Generated page contains unsupported proof sections');
    const content=[section.eyebrow,section.heading,section.body,section.buttonText,section.quote,
      section.author,section.imageAlt,...(section.items||[]),
      ...(section.blocks||[]).flatMap(block=>[block.heading,block.body])].join(' ').replace(approvedPlaceholder,'');
    if(content.includes('\u2014')||/<\/?[a-z][^>]*>/i.test(content))
      throw new Error('Generated page contains raw HTML or an em dash');
    if(unsupportedProof.test(content))throw new Error('Generated page contains unsupported claims');
  }
}

export function assertApprovedAiImages(sections:ClaimSection[],approvedUrls:Iterable<string>) {
  const allowed=new Set(approvedUrls);
  for(const section of sections){
    if(section.imageUrl&&!allowed.has(section.imageUrl))throw new Error('Generated page contains an unapproved image');
    for(const block of section.blocks||[])
      if(block.imageUrl&&!allowed.has(block.imageUrl))throw new Error('Generated page contains an unapproved image');
  }
}
