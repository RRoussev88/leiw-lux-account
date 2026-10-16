#!/usr/bin/env node
// Static site generator for leiwlux.com. No dependencies. Run: node build.mjs
// Reads src/ (config, strings, layout, page templates), writes real HTML per language at the repo root.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const write = (p, content) => {
  const file = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.push(p);
};
const written = [];

const config = JSON.parse(read("src/config.json"));
const LANGS = config.languages;
const DEFAULT = config.defaultLanguage;
const strings = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(read(`src/strings/${l}.json`))]));

/* ---------- 1. Every language must have exactly the same keys as the default ---------- */
const flat = (o, pre = "") =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${pre}${k}.`) : [`${pre}${k}`]));
const baseKeys = new Set(flat(strings[DEFAULT]));
let keyProblems = 0;
for (const l of LANGS) {
  const keys = new Set(flat(strings[l]));
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.has(k));
  if (missing.length || extra.length) {
    keyProblems++;
    console.error(`Strings mismatch in ${l}.json`);
    if (missing.length) console.error("  missing:", missing.join(", "));
    if (extra.length) console.error("  not in " + DEFAULT + ".json:", extra.join(", "));
  }
}
if (keyProblems) process.exit(1);

/* ---------- 2. Helpers ---------- */
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const get = (lang, key) => {
  const v = key.split(".").reduce((o, k) => (o == null ? o : o[k]), strings[lang]);
  if (typeof v !== "string") throw new Error(`Missing string ${lang}:${key}`);
  return v;
};
// Template syntax: {{t:a.b}} translated+escaped string, {{url:/x/}} language-prefixed link, {{var}} raw value.
function fill(tpl, lang, vars = {}) {
  const out = tpl
    .replace(/\{\{t:([\w.]+)\}\}/g, (_, k) => esc(get(lang, k)))
    .replace(/\{\{url:([^}]+)\}\}/g, (_, p) => `/${lang}${p}`)
    .replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (!(k in vars)) throw new Error(`Unknown template variable ${m}`);
      return vars[k];
    });
  if (out.includes("{{")) throw new Error("Unresolved template marker in output");
  return out;
}

/* ---------- 3. Pages registry (add a page here when its template exists) ---------- */
// boot: bare URL redirects to the visitor's language; recovery: also forwards Supabase recovery links to /password/.
const PAGES = [
  { id: "home", slug: "", template: "home", indexable: true, recovery: true },
  { id: "password", slug: "password", template: "password", indexable: false, supabase: true },
];
// Footer links: ids of pages shown in the footer (strings key: site.footer.<id> would be added with those pages).
const FOOTER_PAGES = [];

const pageUrl = (page, lang, bare = false) => {
  const tail = page.slug ? `${page.slug}/` : "";
  return bare ? `/${tail}` : `/${lang}/${tail}`;
};
const abs = (p) => config.siteUrl + p;

function bootScript(page) {
  const slugPath = page.slug ? `/${page.slug}/` : "/";
  const recovery = page.recovery
    ? `if(/[#&](access_token|refresh_token|error|error_code|error_description|type)=/.test(h)||/[?&](code|token_hash|error|error_code)=/.test(s)){w.replace("/password/"+s+h);return}`
    : "";
  return (
    `(function(){var L=${JSON.stringify(LANGS)},w=window.location,s=w.search,h=w.hash;${recovery}` +
    `var p=null,m=/[?&]lang=(fr|en|de|lb)(&|$)/.exec(s);if(m)p=m[1];` +
    `if(!p){try{var v=localStorage.getItem("ll_lang");if(L.indexOf(v)>-1)p=v}catch(e){}}` +
    `if(!p){var n=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];` +
    `for(var i=0;i<n.length&&!p;i++){var c=String(n[i]).toLowerCase().split("-")[0];if(c==="ltz")c="lb";if(L.indexOf(c)>-1)p=c}}` +
    `if(p)w.replace("/"+p+"${slugPath}"+s+h)})();`
  );
}

/* ---------- 4. Rendering ---------- */
const layoutTpl = read("src/layout.html");

function langNav(page, lang) {
  const items = LANGS.map((l) => {
    const cur = l === lang ? ' aria-current="true"' : "";
    return `<li><a href="${pageUrl(page, l)}" hreflang="${l}" lang="${l}" data-lang="${l}" aria-label="${esc(config.languageNames[l])}" title="${esc(config.languageNames[l])}"${cur}>${l.toUpperCase()}</a></li>`;
  }).join("");
  return `<nav class="lang" aria-label="${esc(get(lang, "site.lang_label"))}"><ul>${items}</ul></nav>`;
}

function footerLinks(lang) {
  if (!FOOTER_PAGES.length) return "";
  const items = FOOTER_PAGES.map((p) => `<li><a href="${pageUrl(p, lang)}">${esc(get(lang, `site.footer.${p.id}`))}</a></li>`).join("");
  return `<ul class="footer-links">${items}</ul>\n    `;
}

function renderPage(page, lang, { bare = false } = {}) {
  const url = pageUrl(page, lang, bare);
  const title = esc(get(lang, `meta.${page.id}.title`));
  const description = esc(get(lang, `meta.${page.id}.description`));

  const vars = {};
  if (page.supabase) {
    const pageData = {
      config: { supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey },
      strings: Object.fromEntries(
        ["too_short", "mismatch", "generic_error", "updating", "submit"].map((k) => [k, get(lang, `password.${k}`)])
      ),
    };
    vars.page_data = JSON.stringify(pageData).replace(/</g, "\\u003c");
  }
  const content = fill(read(`src/pages/${page.template}.html`), lang, { lang, ...vars });

  const boot = bare ? bootScript(page) : "";
  const scriptSrc = ["'self'"];
  if (boot) scriptSrc.push(`'sha256-${crypto.createHash("sha256").update(boot).digest("base64")}'`);
  const csp = [
    "default-src 'none'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${page.supabase ? config.supabaseUrl : "'none'"}`,
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

  const alternates = page.indexable
    ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(pageUrl(page, l))}">\n`).join("") +
      `<link rel="alternate" hreflang="x-default" href="${abs(pageUrl(page, DEFAULT, true))}">\n`
    : "";

  const scripts = page.supabase
    ? `<script src="${config.supabaseJs}" defer></script>\n<script src="/assets/js/password.js" defer></script>\n`
    : "";

  return fill(layoutTpl, lang, {
    html_lang: lang,
    csp: esc(csp),
    title,
    description,
    robots: page.indexable ? "" : '<meta name="robots" content="noindex">\n',
    canonical: abs(url),
    alternates,
    og_image: abs(config.ogImage),
    boot: boot ? `<script>${boot}</script>\n` : "",
    page_id: page.id,
    home_href: pageUrl(PAGES[0], lang),
    lang_nav: langNav(page, lang),
    content,
    footer_links: footerLinks(lang),
    scripts,
  });
}

function render404() {
  const lang = DEFAULT;
  const tpl = read("src/pages/notfound.html");
  const content = LANGS.map(
    (l) => `<div lang="${l}" data-lang-block="${l}"${l === lang ? "" : " hidden"}>\n${fill(tpl, l, { lang: l })}\n</div>`
  ).join("\n");
  const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'self'";
  return fill(layoutTpl, lang, {
    html_lang: lang,
    csp: esc(csp),
    title: esc(get(lang, "meta.notfound.title")),
    description: esc(get(lang, "meta.notfound.description")),
    robots: '<meta name="robots" content="noindex">\n',
    canonical: abs("/404.html"),
    alternates: "",
    og_image: abs(config.ogImage),
    boot: "",
    page_id: "notfound",
    home_href: "/",
    lang_nav: "",
    content,
    footer_links: "",
    scripts: "",
  });
}

/* ---------- 5. Write output ---------- */
for (const l of LANGS) fs.rmSync(path.join(ROOT, l), { recursive: true, force: true });

for (const page of PAGES) {
  const rel = (p) => path.posix.join(p, "index.html").replace(/^\//, "");
  write(rel(pageUrl(page, DEFAULT, true)), renderPage(page, DEFAULT, { bare: true }));
  for (const l of LANGS) write(rel(pageUrl(page, l)), renderPage(page, l));
}
write("404.html", render404());

const sitemapEntries = PAGES.filter((p) => p.indexable)
  .flatMap((p) =>
    LANGS.map((l) => {
      const links =
        LANGS.map((a) => `    <xhtml:link rel="alternate" hreflang="${a}" href="${abs(pageUrl(p, a))}"/>`).join("\n") +
        `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(pageUrl(p, DEFAULT, true))}"/>`;
      return `  <url>\n    <loc>${abs(pageUrl(p, l))}</loc>\n${links}\n  </url>`;
    })
  )
  .join("\n");
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemapEntries}\n</urlset>\n`
);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);

console.log(`Built ${written.length} files:`);
for (const f of written) console.log("  " + f);
