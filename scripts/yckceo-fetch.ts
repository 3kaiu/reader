#!/usr/bin/env bun
// yckceo-fetch.ts — Fetch and translate Legado sources from yckceo
//
// Usage:
//   bun run scripts/yckceo-fetch.ts                    # Fetch top 100 sources
//   bun run scripts/yckceo-fetch.ts --all              # Fetch all 5530 sources
//   bun run scripts/yckceo-fetch.ts --id 7536          # Fetch specific source by ID
//   bun run scripts/yckceo-fetch.ts --translate        # Also translate to JS
//   bun run scripts/yckceo-fetch.ts --audit            # Run quality audit only

const YCKCEO_BASE = "https://www.yckceo.com";
const OUTPUT_DIR = "./api/sources/legado";
const TRANSLATED_DIR = "./api/sources/generated";

interface YckceoSource {
  id: number;
  name: string;
  url: string;
  downloads: number;
  tags: string[];
}

interface YckceoCollection {
  id: number;
  name: string;
  user: string;
  sourceCount: number;
  downloads: number;
}

async function fetchSourceList(page: number = 1): Promise<YckceoSource[]> {
  const url = `${YCKCEO_BASE}/yuedu/shuyuan/index.html?page=${page}`;
  const resp = await fetch(url);
  const html = await resp.text();
  
  // Parse the HTML to extract source entries
  const sources: YckceoSource[] = [];
  const entryRegex = /\/yuedu\/shuyuan\/content\/id\/(\d+)\.html[^<]*>([^<]+)</g;
  const downloadRegex = /下载:(\d+)/g;
  
  let match;
  while ((match = entryRegex.exec(html)) !== null) {
    sources.push({
      id: parseInt(match[1]),
      name: match[2].trim(),
      url: `${YCKCEO_BASE}/yuedu/shuyuan/json/id/${match[1]}.json`,
      downloads: 0,
      tags: [],
    });
  }
  
  // Parse download counts
  const dlMatches = [...html.matchAll(/下载:(\d+)/g)];
  dlMatches.forEach((m, i) => {
    if (sources[i]) sources[i].downloads = parseInt(m[1]);
  });
  
  return sources;
}

async function fetchCollectionList(page: number = 1): Promise<YckceoCollection[]> {
  const url = `${YCKCEO_BASE}/yuedu/shuyuans/index.html?page=${page}`;
  const resp = await fetch(url);
  const html = await resp.text();
  
  const collections: YckceoCollection[] = [];
  const entryRegex = /\/yuedu\/shuyuans\/content\/id\/(\d+)\.html[^>]*>([^<]+)</g;
  const countRegex = /源数量:(\d+)/g;
  const dlRegex = /下载:(\d+)/g;
  
  let match;
  while ((match = entryRegex.exec(html)) !== null) {
    collections.push({
      id: parseInt(match[1]),
      name: match[2].trim(),
      user: '',
      sourceCount: 0,
      downloads: 0,
    });
  }
  
  const countMatches = [...html.matchAll(/源数量:(\d+)/g)];
  countMatches.forEach((m, i) => {
    if (collections[i]) collections[i].sourceCount = parseInt(m[1]);
  });
  
  const dlMatches = [...html.matchAll(/下载:(\d+)/g)];
  dlMatches.forEach((m, i) => {
    if (collections[i]) collections[i].downloads = parseInt(m[1]);
  });
  
  return collections;
}

async function downloadSource(id: number): Promise<any> {
  const url = `${YCKCEO_BASE}/yuedu/shuyuan/json/id/${id}.json`;
  const resp = await fetch(url);
  const text = await resp.text();
  
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data[0] : data;
  } catch (e) {
    console.error(`Failed to parse source ${id}:`, e.message);
    return null;
  }
}

async function downloadCollection(id: number): Promise<any[]> {
  const url = `${YCKCEO_BASE}/yuedu/shuyuans/json/id/${id}.json`;
  const resp = await fetch(url);
  const text = await resp.text();
  
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  } catch (e) {
    console.error(`Failed to parse collection ${id}:`, e.message);
    return [];
  }
}

function validateSource(source: any): boolean {
  if (!source) return false;
  if (!source.bookSourceName) return false;
  if (!source.bookSourceUrl) return false;
  if (!source.ruleContent?.content && !source.ruleToc?.chapterList) return false;
  return true;
}

function classifySource(source: any): string {
  const text = JSON.stringify(source);
  if (text.includes('startBrowser') || text.includes('webJs')) return 'browser';
  if (text.includes('@js:') || text.includes('<js>') || text.includes('java.') || text.includes('source.')) return 'js';
  return 'css';
}

async function main() {
  const args = process.argv.slice(2);
  const specificId = args.find(a => a.startsWith('--id='))?.split('=')[1];
  const doTranslate = args.includes('--translate');
  const doAudit = args.includes('--audit');
  const fetchAll = args.includes('--all');
  
  if (specificId) {
    // Fetch a single source by ID
    console.log(`Fetching source ${specificId}...`);
    const source = await downloadSource(parseInt(specificId));
    
    if (!source) {
      console.error(`Source ${specificId} not found`);
      process.exit(1);
    }
    
    console.log(`\n=== Source: ${source.bookSourceName} ===`);
    console.log(`URL: ${source.bookSourceUrl}`);
    console.log(`Group: ${source.bookSourceGroup || 'none'}`);
    console.log(`Type: ${classifySource(source)}`);
    console.log(`Has search: ${!!source.searchUrl}`);
    console.log(`Has JS blocks: ${JSON.stringify(source).includes('@js:')}`);
    
    if (doAudit) {
      console.log(`\nQuality check:`);
      console.log(`  Valid: ${validateSource(source) ? '✅' : '❌'}`);
      console.log(`  Classification: ${classifySource(source)}`);
      
      const allText = JSON.stringify(source);
      console.log(`  Uses java.ajax: ${allText.includes('java.ajax(') ? '✅' : '❌'}`);
      console.log(`  Uses browser: ${allText.includes('startBrowser') ? '✅' : '❌'}`);
      console.log(`  Uses cookie API: ${allText.includes('cookie.') ? '✅' : '❌'}`);
      console.log(`  Uses GBK encoding: ${allText.includes('gbk') ? '✅' : '❌'}`);
      console.log(`  Has replaceRegex: ${!!source.ruleContent?.replaceRegex ? '✅' : '❌'}`);
      console.log(`  Has nextContentUrl: ${!!source.ruleContent?.nextContentUrl ? '✅' : '❌'}`);
      console.log(`  Has webJs: ${!!source.ruleContent?.webJs ? '✅' : '❌'}`);
    }
    
    if (doTranslate) {
      // Save the JSON for the Rust translator
      const filename = `${source.bookSourceUrl.replace(/https?:\/\//, '').replace(/[\/\.]/g, '_')}.json`;
      await Bun.write(`${OUTPUT_DIR}/individual/${filename}`, JSON.stringify(source, null, 2));
      console.log(`\nSaved to: ${OUTPUT_DIR}/individual/${filename}`);
      console.log(`Ready for Rust translation: cargo run -- translate --file ${filename}`);
    }
    
    return;
  }
  
  // Fetch source list
  const pageCount = fetchAll ? 56 : 2; // 56 pages × 100 sources = 5530
  let allSources: YckceoSource[] = [];
  
  for (let page = 1; page <= pageCount; page++) {
    console.log(`Fetching source list page ${page}/${pageCount}...`);
    const sources = await fetchSourceList(page);
    allSources = allSources.concat(sources);
    await new Promise(r => setTimeout(r, 500)); // Rate limiting
  }
  
  console.log(`\n=== Found ${allSources.length} sources ===`);
  
  // Fetch and validate each source
  let valid = 0, invalid = 0, css = 0, js = 0, browser = 0;
  
  const batch = allSources.slice(0, Math.min(allSources.length, fetchAll ? allSources.length : 100));
  
  for (const entry of batch) {
    const source = await downloadSource(entry.id);
    if (validateSource(source)) {
      valid++;
      const cls = classifySource(source);
      if (cls === 'css') css++;
      else if (cls === 'js') js++;
      else browser++;
    } else {
      invalid++;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n=== Batch Results ===`);
  console.log(`Valid: ${valid}, Invalid: ${invalid}`);
  console.log(`CSS: ${css}, JS: ${js}, Browser: ${browser}`);
}

main().catch(console.error);