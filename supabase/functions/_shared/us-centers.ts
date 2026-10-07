// Approximate geographic centers, used only to scope Open Places searches.
import cityCoordinates from "./us-cities.json" with { type: "json" };
export const stateCenters: Record<string, [number, number]> = {
  AL: [32.8,-86.8], AK: [64.2,-152.5], AZ: [34.3,-111.7], AR: [34.8,-92.2],
  CA: [37.2,-119.4], CO: [39.0,-105.5], CT: [41.6,-72.7], DE: [39.0,-75.5],
  DC: [38.9,-77.0], FL: [28.6,-82.4], GA: [32.6,-83.4], HI: [20.8,-156.3],
  ID: [44.2,-114.5], IL: [40.0,-89.2], IN: [39.9,-86.3], IA: [42.1,-93.5],
  KS: [38.5,-98.4], KY: [37.5,-85.3], LA: [31.0,-91.9], ME: [45.4,-69.2],
  MD: [39.0,-76.7], MA: [42.3,-71.8], MI: [44.3,-85.6], MN: [46.3,-94.3],
  MS: [32.7,-89.7], MO: [38.4,-92.5], MT: [47.1,-109.6], NE: [41.5,-99.8],
  NV: [39.3,-116.6], NH: [43.7,-71.6], NJ: [40.1,-74.5], NM: [34.5,-106.0],
  NY: [42.9,-75.5], NC: [35.5,-79.8], ND: [47.5,-100.5], OH: [40.4,-82.8],
  OK: [35.6,-97.3], OR: [44.0,-120.5], PA: [40.9,-77.8], RI: [41.7,-71.6],
  SC: [33.8,-80.9], SD: [44.4,-100.2], TN: [35.8,-86.4], TX: [31.5,-99.3],
  UT: [39.3,-111.7], VT: [44.1,-72.7], VA: [37.5,-78.8], WA: [47.4,-120.7],
  WV: [38.6,-80.6], WI: [44.6,-89.6], WY: [43.0,-107.6],
};

const stateNames: Record<string, string> = {
  AL:'alabama',AK:'alaska',AZ:'arizona',AR:'arkansas',CA:'california',CO:'colorado',
  CT:'connecticut',DE:'delaware',DC:'district of columbia',FL:'florida',GA:'georgia',
  HI:'hawaii',ID:'idaho',IL:'illinois',IN:'indiana',IA:'iowa',KS:'kansas',KY:'kentucky',
  LA:'louisiana',ME:'maine',MD:'maryland',MA:'massachusetts',MI:'michigan',MN:'minnesota',
  MS:'mississippi',MO:'missouri',MT:'montana',NE:'nebraska',NV:'nevada',NH:'new hampshire',
  NJ:'new jersey',NM:'new mexico',NY:'new york',NC:'north carolina',ND:'north dakota',
  OH:'ohio',OK:'oklahoma',OR:'oregon',PA:'pennsylvania',RI:'rhode island',SC:'south carolina',
  SD:'south dakota',TN:'tennessee',TX:'texas',UT:'utah',VT:'vermont',VA:'virginia',
  WA:'washington',WV:'west virginia',WI:'wisconsin',WY:'wyoming',
};
export function stateCode(value: string | null | undefined): string | null {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized.length === 2 && stateCenters[normalized.toUpperCase()]) return normalized.toUpperCase();
  return Object.keys(stateNames).find((code) => stateNames[code] === normalized) || null;
}

// A small set of known tri-state area-code centers improves the first lookup.
const areaCodeCenters: Record<string, [number, number]> = {
  '856':[39.9259,-75.1196], '609':[40.2206,-74.7597], '640':[40.2206,-74.7597],
  '215':[39.9526,-75.1636], '267':[39.9526,-75.1636], '445':[39.9526,-75.1636],
  '610':[40.1023,-75.1521], '484':[40.1023,-75.1521],
  '201':[40.7282,-74.0776], '551':[40.7282,-74.0776],
  '732':[40.5187,-74.4121], '848':[40.5187,-74.4121],
  '908':[40.6629,-74.2107], '973':[40.7357,-74.1724], '862':[40.7357,-74.1724],
  '212':[40.7128,-74.0060], '332':[40.7128,-74.0060], '646':[40.7128,-74.0060],
  '917':[40.7128,-74.0060], '718':[40.7128,-74.0060], '347':[40.7128,-74.0060],
  '929':[40.7128,-74.0060],
};
export function leadSearchCenter(state: string | null | undefined, phone: string | null | undefined): [number, number] | null {
  const area = (phone || '').replace(/\D/g,'').slice(-10,-7);
  return areaCodeCenters[area] || (stateCode(state) ? stateCenters[stateCode(state)!] : null);
}
export function stateFromAreaCode(phone: string | null | undefined): string | null {
  const area = (phone || '').replace(/\D/g,'').slice(-10,-7);
  if (['856','609','640','201','551','732','848','908','973','862'].includes(area)) return 'NJ';
  if (['215','267','445','610','484'].includes(area)) return 'PA';
  if (['212','332','646','917','718','347','929'].includes(area)) return 'NY';
  return null;
}
export function citySearchCenter(city: string, state: string): [number, number] | null {
  const code = stateCode(state);
  if (!code) return null;
  const key = `${code}|${city.trim().toLowerCase()}`;
  const coordinates = (cityCoordinates as unknown as Record<string, [number, number]>)[key];
  return coordinates || null;
}
