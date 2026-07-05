// Auto-generated from Legado book source
// Source: 69书吧③

const META = {
  id: 'www_69shuba_com',
  name: '69书吧③',
  url: 'https://www.69shuba.com/',
  group: '精品',
  type: 'novel',
};

const BASE = 'https://www.69shuba.com/';
const HEADERS = {};
const TIMEOUT_MS = 30000;

// --- Runtime helpers (injected) ---
// __fetch, __parseHTML, __browserRender, __resolveUrl, __cookieStore, __ctx

function __isCFBlocked(html) {
  return /turnstile\.render|cf-challenge|Just a moment|cf-browser-verification/i.test(html);
}

export async function search(keyword, page = 1) {
  const url = `/modules/article/search.php`;
  const html = await __fetch(url, { headers: HEADERS });
  const doc = __parseHTML(html);
  const items = Array.from(el.querySelectorAll('.newbox'), e => e.getAttribute('li') || '');
  return items.map(item => ({
    name: item.textContent?.trim() || '',
    author: item.querySelector('label:nth-child(1)')?.textContent?.trim() || '',
    bookUrl: item.getAttribute('href') || '',
    coverUrl: item.getAttribute('data-src') || '',
    intro: item.querySelector('.ellipsis_2')?.textContent?.trim() || '',
    lastChapter: item.querySelector('.zxzj')?.getAttribute('p') || '',
    kind: item.querySelector('label:nth-child(2)')?.textContent?.trim() || '' + item.querySelector('label:nth-child(3)')?.textContent?.trim() || '',
  }));
}

export async function bookInfo(bookUrl) {
  const html = await __fetch(bookUrl, { headers: HEADERS });
  const doc = __parseHTML(html);
  return {
    name: el.querySelector('.booknav2')?.textContent?.trim() || '',
    author: el.querySelector('.booknav2 p:nth-child(1)')?.textContent?.trim() || '',
    coverUrl: el.querySelector('.bookimg2')?.getAttribute('src') || '',
    intro: el.querySelector('.navtxt p:nth-child(1)')?.textContent?.trim() || '',
    kind: el.querySelector('.booknav2 p:nth-child(2)')?.textContent?.trim() || '' + el.querySelector('.booknav2 p:nth-child(4)'),
    lastChapter: el.querySelector('.qustime li:nth-child(1)')?.getAttribute('span') || '',
    tocUrl: el.getAttribute('href') || '',
    wordCount: el.querySelector('.booknav2 p:nth-child(3)'),
    bookUrl,
  };
}

export async function chapterList(tocUrl) {
  const html = await __fetch(tocUrl, { headers: HEADERS });
  const doc = __parseHTML(html);
  const items = Array.from(el.querySelectorAll('.catalog'), e => e.getAttribute('a') || '');
  return items.map((item, index) => ({
    name: 'text##我要报错！',
    url: __resolveUrl(item.getAttribute('href') || '', BASE),
    index,
  }));
}

export async function chapterContent(chapterUrl) {
  const html = await __fetch(chapterUrl, { headers: HEADERS });
  const doc = __parseHTML(html);
  let content = el.querySelector('.txtnav')?.textContent || '';
  return content.trim();
}

