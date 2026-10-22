export type LandingSection = { id: string; type: "hero" | "text" | "features" | "image" | "cta" | "form"; heading?: string; body?: string; buttonText?: string; buttonUrl?: string; imageUrl?: string; formId?: string; items?: string[] };
export type LandingTheme = { background?: string; foreground?: string; accent?: string; font?: string };

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
const safeUrl = (value: unknown) => {
  const url = String(value ?? "").trim();
  return (/^(https?:\/\/|mailto:|tel:|\/[^/])/i.test(url) || /^#[a-z0-9_-]+$/i.test(url)) ? escapeHtml(url) : "#";
};
const color = (value: unknown, fallback: string) => /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(String(value ?? "")) ? String(value) : fallback;

export function renderLandingPage(page: { id?: string; title: string; seo_description?: string; sections: LandingSection[]; theme?: LandingTheme }, origin = "") {
  const theme = page.theme ?? {};
  const sections = Array.isArray(page.sections) ? page.sections : [];
  const renderButton = (section: LandingSection) => section.buttonText ? `<a class="button" href="${safeUrl(section.buttonUrl)}">${escapeHtml(section.buttonText)}</a>` : "";
  const content = sections.map((section) => {
    const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
    const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
    if (section.type === "hero") return `<section class="hero">${heading}${body}${renderButton(section)}</section>`;
    if (section.type === "text") return `<section>${heading}${body}</section>`;
    if (section.type === "features") return `<section>${heading}<div class="features">${(section.items ?? []).map((item) => `<article>${escapeHtml(item)}</article>`).join("")}</div></section>`;
    if (section.type === "image") return `<section>${heading}${section.imageUrl ? `<img src="${safeUrl(section.imageUrl)}" alt="${escapeHtml(section.heading ?? "")}" loading="lazy">` : ""}${body}</section>`;
    if (section.type === "cta") return `<section class="cta">${heading}${body}${renderButton(section)}</section>`;
    if (section.type === "form") return `<section id="contact">${heading}${body}${section.formId ? `<iframe src="${origin}/api/public/forms/${encodeURIComponent(section.formId)}${page.id ? `?page=${encodeURIComponent(page.id)}` : ""}" title="${escapeHtml(section.heading ?? "Contact form")}" loading="lazy"></iframe>` : "<p>Select a form in the editor.</p>"}</section>`;
    return "";
  }).join("\n");
  const background = color(theme.background, "#ffffff");
  const foreground = color(theme.foreground, "#172033");
  const accent = color(theme.accent, "#285ce6");
  const font = theme.font === "serif" ? "Georgia,serif" : "Arial,sans-serif";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(page.seo_description)}"><title>${escapeHtml(page.title)}</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:${background};color:${foreground};font-family:${font};line-height:1.6}section{padding:80px max(24px,calc((100vw - 1040px)/2))}section:nth-child(even){background:rgba(127,127,127,.055)}h2{font-size:clamp(2rem,5vw,3.6rem);line-height:1.1;margin:0 0 20px}p{max-width:680px;font-size:1.1rem}.hero{padding-top:120px;padding-bottom:120px}.hero h2{max-width:780px}.button{display:inline-block;background:${accent};color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px}.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}.features article{padding:24px;border:1px solid rgba(127,127,127,.22);border-radius:12px;background:${background}}img{display:block;max-width:100%;max-height:580px;object-fit:cover;border-radius:12px}iframe{width:100%;min-height:500px;border:0}</style></head><body>${content}</body></html>`;
}
