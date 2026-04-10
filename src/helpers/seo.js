const DEFAULT_SITE_NAME = 'FishXCode';
const DEFAULT_TITLE = 'FishXCode · 额度查询工具';
const DEFAULT_DESCRIPTION =
  'FishXCode 额度查询工具，支持查询 New API 令牌额度、剩余额度与调用详情，适用于 Claude、Codex 等 AI 模型中转场景。';
const DEFAULT_KEYWORDS =
  'FishXCode,额度查询,令牌查询,New API,Claude,Codex,AI Coding,调用详情';
const DEFAULT_THEME_COLOR = '#c9973e';
const DEFAULT_IMAGE_PATH = '/logo512.png';

function getSiteUrl() {
  return (process.env.REACT_APP_SITE_URL || window.location.origin).replace(/\/$/, '');
}

function buildCanonicalUrl(pathname = window.location.pathname) {
  return `${getSiteUrl()}${pathname || '/'}`;
}

function getMetaTag(selector, factory) {
  let node = document.head.querySelector(selector);
  if (!node && factory) {
    node = factory();
    document.head.appendChild(node);
  }
  return node;
}

function setMetaAttribute(selector, attribute, value) {
  const node = getMetaTag(selector, () => {
    const meta = document.createElement('meta');
    if (selector.includes('property=')) {
      meta.setAttribute('property', selector.match(/property="([^"]+)"/)[1]);
    } else {
      meta.setAttribute('name', selector.match(/name="([^"]+)"/)[1]);
    }
    return meta;
  });

  if (node) {
    node.setAttribute(attribute, value);
  }
}

function setCanonical(href) {
  const node = getMetaTag('link[rel="canonical"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    return link;
  });

  node.setAttribute('href', href);
}

function setJsonLd(payload) {
  const node = getMetaTag('script[data-seo="json-ld"]', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-seo', 'json-ld');
    return script;
  });

  node.textContent = JSON.stringify(payload);
}

export function getHomeSeo() {
  const canonical = buildCanonicalUrl();
  const image = `${getSiteUrl()}${DEFAULT_IMAGE_PATH}`;

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
    canonical,
    robots: 'index,follow',
    themeColor: DEFAULT_THEME_COLOR,
    image,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: DEFAULT_SITE_NAME,
      url: canonical,
      description: DEFAULT_DESCRIPTION,
      inLanguage: 'zh-CN',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${canonical}?key={api_key}`,
        'query-input': 'required name=api_key',
      },
    },
  };
}

export function applySeo({
  title,
  description,
  keywords,
  canonical,
  robots,
  themeColor,
  image,
  jsonLd,
}) {
  document.title = title;
  setCanonical(canonical);

  setMetaAttribute('meta[name="description"]', 'content', description);
  setMetaAttribute('meta[name="keywords"]', 'content', keywords);
  setMetaAttribute('meta[name="robots"]', 'content', robots);
  setMetaAttribute('meta[name="theme-color"]', 'content', themeColor);

  setMetaAttribute('meta[property="og:type"]', 'content', 'website');
  setMetaAttribute('meta[property="og:site_name"]', 'content', DEFAULT_SITE_NAME);
  setMetaAttribute('meta[property="og:title"]', 'content', title);
  setMetaAttribute('meta[property="og:description"]', 'content', description);
  setMetaAttribute('meta[property="og:url"]', 'content', canonical);
  setMetaAttribute('meta[property="og:image"]', 'content', image);
  setMetaAttribute('meta[property="og:locale"]', 'content', 'zh_CN');

  setMetaAttribute('meta[name="twitter:card"]', 'content', 'summary_large_image');
  setMetaAttribute('meta[name="twitter:title"]', 'content', title);
  setMetaAttribute('meta[name="twitter:description"]', 'content', description);
  setMetaAttribute('meta[name="twitter:image"]', 'content', image);

  if (jsonLd) {
    setJsonLd(jsonLd);
  }
}
