type ClaimSection = {heading?:string;body?:string;items?:string[]};
const unsupportedProof = /\b(?:testimonials?|reviews?|ratings?|awards?|licen[sc]ed|insured|certified|guarantee[ds]?|five.star|5.star|top.rated|best.rated|trusted by|customers love|years? of experience)\b/i;

export function assertNoUnsupportedProof(sections:ClaimSection[]) {
  for(const section of sections) {
    const content=[section.heading,section.body,...(section.items||[])].join(' ');
    if(unsupportedProof.test(content))throw new Error('Generated page contains unsupported claims');
  }
}
