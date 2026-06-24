import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// Replicate hashStr from app.js
function hashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; 
  }
  return Math.abs(hash);
}

// XML-escape text to prevent SVG parsing failures
function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// Custom text wrapping algorithm
function wrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = currentLine ? currentLine + " " + word : word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// Convert YYYY-MM-DD to "MONTH DD, YYYY"
function formatDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return "";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr.toUpperCase();
  const months = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
  ];
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${months[monthIdx]} ${day}, ${year}`;
  }
  return dateStr.toUpperCase();
}

function getCategoryLabel(story, isFlash) {
  if (isFlash) {
    let cat = (story.cat || "").toLowerCase();
    if (cat === "world") return "GLOBAL";
    if (cat === "business") return "ECONOMY";
    if (cat === "ai" || cat === "tech" || cat === "ai-tech") return "AI & TECH";
    return cat.toUpperCase();
  } else {
    const text = ((story.headline || "") + " " + (story.tldr || "")).toLowerCase();
    const categories = {
      conflict: ["strike", "war", "conflict", "tension", "crisis", "attack", "threat", "protest", "violence", "court", "lawsuit", "invalidates", "clash", "friction", "strains", "rejects"],
      economy: ["economy", "market", "funding", "growth", "bank", "trade", "tax", "fee", "investment", "price", "billion", "rupee", "dollar"],
      tech: ["tech", "ai", "space", "science", "digital", "data", "software", "apple", "google", "meta", "cyber"],
      politics: ["election", "vote", "president", "minister", "law", "policy", "government", "parliament", "senate", "ruling", "judge", "diplomatic"]
    };
    let activeTheme = "";
    let maxMatches = 0;
    for (const [theme, words] of Object.entries(categories)) {
      let matches = 0;
      words.forEach(w => { if (text.includes(w)) matches++; });
      if (matches > maxMatches) {
        maxMatches = matches;
        activeTheme = theme;
      }
    }
    if (activeTheme) {
      if (activeTheme === "conflict") return "CONFLICT";
      if (activeTheme === "economy") return "ECONOMY";
      if (activeTheme === "tech") return "AI & TECH";
      if (activeTheme === "politics") return "POLITICS";
    }
    if (story.region) {
      return story.region.toUpperCase();
    }
    return "DEEP DIVE";
  }
}

const CATEGORY_COLORS = {
  INDIA: '#F97316',
  GLOBAL: '#3B82F6',
  POLITICS: '#EF4444',
  ECONOMY: '#10B981',
  ECONOMICS: '#10B981',
  'AI & TECH': '#6366F1',
  TECH: '#6366F1',
  SCIENCE: '#F59E0B',
  SPORTS: '#F97316',
  ENTERTAINMENT: '#EC4899',
  CULTURE: '#A78BFA',
  HEALTH: '#34D399',
  CONFLICT: '#EF4444',
  'DEEP DIVE': '#3F3E50'
};

function getCategoryColor(label) {
  const l = (label || "").toUpperCase();
  return CATEGORY_COLORS[l] || '#3F3E50';
}

function getVectorArtForCategory(label) {
  const l = (label || "").toUpperCase();
  if (l === "SCIENCE") {
    return `
      <!-- Mountain 1 -->
      <path d="M 700,540 L 780,440 L 890,510 L 980,410 L 1080,480 L 1140,430 L 1140,540 Z" fill="#0F172A" />
      <!-- Mountain 2 -->
      <path d="M 700,540 L 830,470 L 930,520 L 1040,450 L 1140,540 Z" fill="#020617" opacity="0.8" />
      <!-- Crescent Moon -->
      <path d="M 1010,210 A 30,30 0 1,0 1040,240 A 24,24 0 1,1 1010,210 Z" fill="#FFFBEB" opacity="0.9" />
      <!-- Stars -->
      <circle cx="770" cy="200" r="2" fill="#FFF" opacity="0.8"/>
      <circle cx="820" cy="160" r="3" fill="#FFF" opacity="0.9"/>
      <circle cx="890" cy="220" r="1.5" fill="#FFF" opacity="0.6"/>
      <circle cx="940" cy="180" r="2" fill="#FFF" opacity="0.7"/>
      <circle cx="790" cy="280" r="2.5" fill="#FFF" opacity="0.8"/>
      <circle cx="960" cy="270" r="1.5" fill="#FFF" opacity="0.5"/>
      <path d="M 850,150 L 850,158 M 846,154 L 854,154" stroke="#FFF" stroke-width="1" opacity="0.9" />
      <path d="M 780,240 L 780,246 M 777,243 L 783,243" stroke="#FFF" stroke-width="1" opacity="0.8" />
    `;
  }
  if (l === "AI & TECH" || l === "TECH") {
    return `
      <!-- Connections -->
      <line x1="820" y1="220" x2="920" y2="180" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="820" y1="220" x2="860" y2="320" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="920" y1="180" x2="1020" y2="240" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="920" y1="180" x2="980" y2="340" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="860" y1="320" x2="980" y2="340" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="860" y1="320" x2="910" y2="440" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="980" y1="340" x2="910" y2="440" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="980" y1="340" x2="1050" y2="400" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="910" y1="440" x2="1050" y2="400" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      <line x1="1020" y1="240" x2="1050" y2="400" stroke="#FFF" stroke-width="1.5" opacity="0.4" />
      
      <!-- Nodes -->
      <circle cx="820" cy="220" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="820" cy="220" r="4" fill="#FFF" />
      <circle cx="920" cy="180" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="920" cy="180" r="4" fill="#FFF" />
      <circle cx="1020" cy="240" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="1020" cy="240" r="4" fill="#FFF" />
      <circle cx="860" cy="320" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="860" cy="320" r="4" fill="#FFF" />
      <circle cx="980" cy="340" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="980" cy="340" r="4" fill="#FFF" />
      <circle cx="910" cy="440" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="910" cy="440" r="4" fill="#FFF" />
      <circle cx="1050" cy="400" r="12" fill="#FFF" fill-opacity="0.15" /><circle cx="1050" cy="400" r="4" fill="#FFF" />

      <!-- Center Processor -->
      <rect x="895" y="255" width="50" height="50" rx="6" ry="6" fill="#FFF" fill-opacity="0.15" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <rect x="905" y="265" width="30" height="30" rx="3" ry="3" fill="#FFF" fill-opacity="0.25" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.9" />
      <!-- Pins -->
      <line x1="910" y1="255" x2="910" y2="247" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="920" y1="255" x2="920" y2="247" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="930" y1="255" x2="930" y2="247" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="910" y1="305" x2="910" y2="313" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="920" y1="305" x2="920" y2="313" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="930" y1="305" x2="930" y2="313" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="895" y1="270" x2="887" y2="270" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="895" y1="280" x2="887" y2="280" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="895" y1="290" x2="887" y2="290" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="945" y1="270" x2="953" y2="270" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="945" y1="280" x2="953" y2="280" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
      <line x1="945" y1="290" x2="953" y2="290" stroke="#FFF" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.7" />
    `;
  }
  if (l === "ECONOMY" || l === "ECONOMICS") {
    return `
      <!-- Grid Lines -->
      <line x1="700" y1="220" x2="1140" y2="220" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="700" y1="300" x2="1140" y2="300" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="700" y1="380" x2="1140" y2="380" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="700" y1="460" x2="1140" y2="460" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="780" y1="120" x2="780" y2="540" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="890" y1="120" x2="890" y2="540" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="1000" y1="120" x2="1000" y2="540" stroke="#FFF" stroke-width="1" opacity="0.15" />
      <line x1="1110" y1="120" x2="1110" y2="540" stroke="#FFF" stroke-width="1" opacity="0.15" />

      <!-- Area below curve -->
      <path d="M 710,540 L 710,480 Q 820,440 920,320 T 1130,180 L 1130,540 Z" fill="#FFF" fill-opacity="0.1" />

      <!-- Curve -->
      <path d="M 710,480 Q 820,440 920,320 T 1130,180" fill="none" stroke="#FFF" stroke-width="4" stroke-linecap="round" opacity="0.9" />

      <!-- Points -->
      <circle cx="830" cy="410" r="5" fill="#34D399" stroke="#FFF" stroke-width="2" />
      <circle cx="950" cy="290" r="5" fill="#34D399" stroke="#FFF" stroke-width="2" />
      <circle cx="1070" cy="215" r="5" fill="#34D399" stroke="#FFF" stroke-width="2" />
    `;
  }
  if (l === "POLITICS" || l === "CONFLICT") {
    return `
      <!-- Temple Facade -->
      <!-- Steps -->
      <rect x="760" y="440" width="320" height="20" rx="3" fill="#FFF" fill-opacity="0.2" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <rect x="770" y="420" width="300" height="20" rx="2" fill="#FFF" fill-opacity="0.15" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <!-- Architrave -->
      <rect x="770" y="240" width="300" height="30" rx="2" fill="#FFF" fill-opacity="0.15" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <!-- Pediment -->
      <polygon points="760,240 920,170 1080,240" fill="#FFF" fill-opacity="0.2" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <!-- Columns -->
      <rect x="790" y="270" width="20" height="150" fill="#FFF" fill-opacity="0.1" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <rect x="870" y="270" width="20" height="150" fill="#FFF" fill-opacity="0.1" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <rect x="950" y="270" width="20" height="150" fill="#FFF" fill-opacity="0.1" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <rect x="1030" y="270" width="20" height="150" fill="#FFF" fill-opacity="0.1" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
    `;
  }
  if (l === "INDIA") {
    let spokes = "";
    for (let i = 0; i < 24; i++) {
      spokes += `<line x1="920" y1="230" x2="920" y2="306" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.5" transform="rotate(${i * 15}, 920, 330)" />\n`;
    }
    return `
      <!-- Chakra/Mandala Wheel -->
      <circle cx="920" cy="330" r="100" fill="none" stroke="#FFF" stroke-width="3" stroke-opacity="0.8" />
      <circle cx="920" cy="330" r="24" fill="none" stroke="#FFF" stroke-width="2" stroke-opacity="0.8" />
      <circle cx="920" cy="330" r="8" fill="#FFF" stroke-opacity="0.9" />
      ${spokes}
    `;
  }
  if (l === "GLOBAL") {
    return `
      <!-- Globe Grid -->
      <circle cx="920" cy="330" r="110" fill="none" stroke="#FFF" stroke-width="3" stroke-opacity="0.8" />
      <line x1="810" y1="330" x2="1030" y2="330" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <ellipse cx="920" cy="330" rx="40" ry="110" fill="none" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <ellipse cx="920" cy="330" rx="80" ry="110" fill="none" stroke="#FFF" stroke-width="2" stroke-opacity="0.7" />
      <!-- Latitudes -->
      <path d="M 825,275 Q 920,300 1015,275" fill="none" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.6" />
      <path d="M 825,385 Q 920,360 1015,385" fill="none" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.6" />
      <path d="M 855,220 Q 920,235 985,220" fill="none" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.6" />
      <path d="M 855,440 Q 920,425 985,440" fill="none" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.6" />
    `;
  }
  // Default: Abstract concentric rings
  return `
    <circle cx="920" cy="330" r="140" fill="none" stroke="#FFF" stroke-width="1.5" stroke-opacity="0.2" />
    <circle cx="920" cy="330" r="110" fill="none" stroke="#FFF" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="4 4" />
    <circle cx="920" cy="330" r="80" fill="none" stroke="#FFF" stroke-width="2.5" stroke-opacity="0.4" />
    <circle cx="920" cy="330" r="50" fill="none" stroke="#FFF" stroke-width="3" stroke-opacity="0.6" />
    <circle cx="920" cy="330" r="20" fill="#FFF" fill-opacity="0.8" />
    <polygon points="820,220 826,230 820,240 814,230" fill="#FFF" opacity="0.6" />
    <polygon points="1020,440 1025,445 1020,450 1015,445" fill="#FFF" opacity="0.7" />
    <polygon points="1040,200 1048,208 1040,216 1032,208" fill="#FFF" opacity="0.5" />
  `;
}

// Clean/validate og:image URL and check against generic logo/placeholder words
function isGenericImage(src) {
  if (!src) return true;
  const lowerSrc = src.toLowerCase();
  const blacklist = [
    'placeholder', 'avatar', 'favicon', 'fallback',
    'default-share', 'default_share', 'social-share', 'social_share',
    'og-default', 'og_default', 'default-og', 'default_og',
    'share-image', 'share_img', 'share-img', 'default-image',
    'default_image', 'dummy-image', 'site-image', 'generic-banner',
    'publication-logo', 'default.jpg', 'default.png', 'default.jpeg',
    'og-image', 'og_image'
  ];
  return blacklist.some(word => lowerSrc.includes(word)) ||
         lowerSrc.includes('/logo') ||
         lowerSrc.includes('_logo') ||
         lowerSrc.includes('-logo') ||
         lowerSrc.includes('/brand') ||
         lowerSrc.includes('/icon') ||
         /\b(logo|brand|icon|placeholder)\b/.test(lowerSrc);
}

// LLM-generated source URLs sometimes come back wrapped in markdown link
// syntax (e.g. "[https://x.com/a](https://x.com/a)" or "[The Hindu](https://...)") instead of a bare URL.
function cleanSourceUrl(raw) {
  if (!raw) return "";
  raw = raw.trim();

  // Detect markdown link: [text](url)
  const mdMatch = raw.match(/^\[([\s\S]*?)\]\(([\s\S]*?)\)$/);
  if (mdMatch) {
    const text = mdMatch[1].trim();
    const url = mdMatch[2].trim();

    // Helper to check if a string is a valid absolute HTTP/HTTPS URL
    const isValidUrl = (str) => {
      try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch (e) {
        return false;
      }
    };

    // If the destination URL is a Google search redirect, try to extract the real URL from the q parameter
    if (url.startsWith('https://www.google.com/search') || url.startsWith('http://www.google.com/search')) {
      try {
        const parsedUrl = new URL(url);
        const q = parsedUrl.searchParams.get('q');
        if (q && isValidUrl(q)) {
          return q;
        }
      } catch (e) { }
    }

    // If the destination URL is valid, return it
    if (isValidUrl(url)) {
      return url;
    }

    // Otherwise, if the link text is a valid URL (not truncated), return that
    if (isValidUrl(text)) {
      return text;
    }
  }

  // Fallback: if the whole raw string has a URL inside parentheses at the end
  const parenMatch = raw.match(/\((https?:\/\/[^\s)]+)\)/);
  if (parenMatch) {
    return parenMatch[1];
  }

  // Fallback: if the whole raw string has a URL inside brackets at the start
  const bracketMatch = raw.match(/^\[(https?:\/\/[^\s\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1];
  }

  return raw;
}

// Scrape og:image directly from URL (runs Node-side, no CORS block)
async function scrapeHeroImage(url) {
  if (!url || !url.startsWith("http")) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsBriefingBot/1.0)" },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (m) {
      let src = m[1].trim();
      if (src && !src.startsWith("data:")) {
        if (!src.startsWith("http")) {
          try {
            src = new URL(src, url).href;
          } catch(e) {}
        }
        if (!isGenericImage(src)) {
          return src;
        }
      }
    }
  } catch (e) {
    console.log(`      ! Failed scraping image for ${url}: ${e.message}`);
  }
  return null;
}

// Read JSON, scan for missing heroImage, fetch and resolve it, and write back to disk
async function backfillBriefingImages(dataPath, date) {
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    let modified = false;
    for (const story of (data.stories || [])) {
      if (!story.heroImage) {
        const candidateUrls = (story.sources || [])
          .map(s => cleanSourceUrl(s?.url))
          .filter(u => u.startsWith("http"));

        if (candidateUrls.length > 0) {
          console.log(`   [SSG Image Scraper] Resolving cover image for story: "${story.headline}"`);
          for (const sourceUrl of candidateUrls) {
            const imgUrl = await scrapeHeroImage(sourceUrl);
            if (imgUrl) {
              console.log(`      ✓ Resolved: ${imgUrl}`);
              story.heroImage = imgUrl;
              modified = true;
              break;
            }
          }
          if (!story.heroImage) {
            console.log(`      ✗ No valid cover image found.`);
          }
        }
      }
    }
    if (modified) {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`   [SSG Image Scraper] Updated ${dataPath} with resolved cover images.`);
    }
  } catch (e) {
    console.error(`   [SSG Image Scraper] Error backfilling images:`, e);
  }
}

// Generate the beautiful card layout SVG (1200x630) for Deep Dives
function generateOgSvg(story, date, idx = 0) {
  const catLabel = getCategoryLabel(story, false);
  const catColor = getCategoryColor(catLabel);
  const catBgColor = catColor + "15"; // Translucent color (alpha 20)
  const formattedDate = formatDateStr(date);

  const catBadgeWidth = Math.max(90, catLabel.length * 11 + 24);
  const catStartX = 216; // Starts after DEEP DIVE badge (64 + 140 + 12 = 216)

  // Wrap headline
  const hlLines = wrapText(story.headline || "", 28);
  const hlLinesToRender = hlLines.slice(0, 3);
  if (hlLines.length > 3) {
    hlLinesToRender[2] = hlLinesToRender[2] + "...";
  }

  // Calculate positions dynamically
  const hlFontSize = 44;
  const hlLineHeight = 54;
  let headlineSvg = "";
  hlLinesToRender.forEach((line, i) => {
    const lineY = 155 + (i * hlLineHeight);
    headlineSvg += `<text x="64" y="${lineY}" font-family="Fraunces, Georgia, serif" font-size="${hlFontSize}" font-weight="700" fill="#0F172A">${escapeXml(line)}</text>\n`;
  });

  const numHlLines = hlLinesToRender.length;
  const underlineY = 155 + (numHlLines - 1) * hlLineHeight + 32;
  const labelY = underlineY + 36;
  const bodyStartY = labelY + 34;

  // Wrap body
  const bodyText = story.tldr || "";
  const bodyLines = wrapText(bodyText, 52);
  const maxBodyLines = 4;
  const bodyLinesToRender = bodyLines.slice(0, maxBodyLines);
  if (bodyLines.length > maxBodyLines) {
    bodyLinesToRender[maxBodyLines - 1] = bodyLinesToRender[maxBodyLines - 1] + "...";
  }

  let bodySvg = "";
  const bodyLineHeight = 30;
  bodyLinesToRender.forEach((line, i) => {
    const lineY = bodyStartY + (i * bodyLineHeight);
    bodySvg += `<text x="64" y="${lineY}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="400" fill="#334155" opacity="0.95">${escapeXml(line)}</text>\n`;
  });

  // Get gradient and vector art URL mapping
  let gradientId = "grad-default";
  const l = catLabel.toUpperCase();
  if (l === "SCIENCE") gradientId = "grad-science";
  else if (l === "AI & TECH" || l === "TECH") gradientId = "grad-tech";
  else if (l === "ECONOMY" || l === "ECONOMICS") gradientId = "grad-economy";
  else if (l === "POLITICS" || l === "CONFLICT") gradientId = "grad-politics";
  else if (l === "INDIA") gradientId = "grad-india";
  else if (l === "GLOBAL") gradientId = "grad-global";
  else if (l === "HEALTH") gradientId = "grad-economy";
  else if (l === "SPORTS") gradientId = "grad-india";
  else if (l === "ENTERTAINMENT" || l === "CULTURE") gradientId = "grad-tech";

  const vectorArt = getVectorArtForCategory(catLabel);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <defs>
      <!-- Science Gradient: Deep space to warm glow -->
      <linearGradient id="grad-science" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="70%" stop-color="#1E293B" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>

      <!-- Tech/AI Gradient: Cyber deep indigo/violet -->
      <linearGradient id="grad-tech" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1E1B4B" />
        <stop offset="60%" stop-color="#312E81" />
        <stop offset="100%" stop-color="#818CF8" />
      </linearGradient>

      <!-- Economy Gradient: Rich forest dark green to light teal -->
      <linearGradient id="grad-economy" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" />
        <stop offset="70%" stop-color="#065F46" />
        <stop offset="100%" stop-color="#34D399" />
      </linearGradient>

      <!-- Politics/Conflict Gradient: Dark grey/blue to crimson/coral -->
      <linearGradient id="grad-politics" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="60%" stop-color="#374151" />
        <stop offset="100%" stop-color="#EF4444" />
      </linearGradient>

      <!-- India Gradient: Saffron orange blend -->
      <linearGradient id="grad-india" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#431407" />
        <stop offset="60%" stop-color="#7C2D12" />
        <stop offset="100%" stop-color="#F97316" />
      </linearGradient>

      <!-- Global/World Gradient: Deep blue oceanic teal -->
      <linearGradient id="grad-global" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="60%" stop-color="#0369A1" />
        <stop offset="100%" stop-color="#38BDF8" />
      </linearGradient>
      
      <!-- Default Gradient: Muted Slate -->
      <linearGradient id="grad-default" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1E293B" />
        <stop offset="70%" stop-color="#334155" />
        <stop offset="100%" stop-color="#64748B" />
      </linearGradient>

      <clipPath id="arch-clip">
        <path d="M 710,540 L 710,330 A 210,210 0 0 1 1130,330 L 1130,540 Z" />
      </clipPath>
    </defs>

    <!-- Base Canvas -->
    <rect width="1200" height="630" fill="#ECE8DF" />

    <!-- Card Background -->
    <rect x="24" y="24" width="1152" height="582" rx="32" ry="32" fill="#FAF8F5" />

    <!-- Bottom Brand Bar -->
    <path d="M 24,526 L 1176,526 L 1176,574 A 32,32 0 0 1 1144,606 L 56,606 A 32,32 0 0 1 24,574 Z" fill="#F4EFE6" />

    <!-- Outer Card Border (Drawn after bottom bar for clean layering) -->
    <rect x="24" y="24" width="1152" height="582" rx="32" ry="32" fill="none" stroke="#E5E2DA" stroke-width="2" />

    <!-- TOP ROW -->
    <!-- Type Badge (DEEP DIVE) -->
    <rect x="64" y="60" width="140" height="36" rx="10" fill="#1E293B" />
    <text x="134" y="83" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="800" fill="#FFF" text-anchor="middle" letter-spacing="0.08em">DEEP DIVE</text>

    <!-- Category Badge -->
    <rect x="${catStartX}" y="60" width="${catBadgeWidth}" height="36" rx="10" fill="${catBgColor}" stroke="${catColor}" stroke-width="1.5" />
    <text x="${catStartX + catBadgeWidth / 2}" y="83" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" fill="${catColor}" text-anchor="middle" letter-spacing="0.06em">${escapeXml(catLabel)}</text>

    <!-- Date -->
    <text x="1136" y="83" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#7E7B73" text-anchor="end" letter-spacing="0.04em">${escapeXml(formattedDate)}</text>

    <!-- LEFT COLUMN CONTENT -->
    <!-- Headline -->
    ${headlineSvg}

    <!-- Accent Underline -->
    <line x1="64" y1="${underlineY}" x2="112" y2="${underlineY}" stroke="${catColor}" stroke-width="3.5" stroke-linecap="round" />

    <!-- Label -->
    <text x="64" y="${labelY}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="800" fill="${catColor}" letter-spacing="0.02em">Why it matters:</text>

    <!-- Body -->
    ${bodySvg}

    <!-- RIGHT COLUMN (ARCHED WINDOW) -->
    <g clip-path="url(#arch-clip)">
      <rect x="700" y="100" width="450" height="460" fill="url(#${gradientId})" />
      ${vectorArt}
    </g>

    <!-- BRAND FOOTER -->
    <!-- Logo Stack (Paper Stack Symbol) -->
    <g transform="translate(68, 566)">
      <path d="M 0,-5 L 16,3 L 0,11 L -16,3 Z" fill="#1E293B" />
      <path d="M 0,-11 L 16,-3 L 0,5 L -16,-3 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
      <path d="M 0,-17 L 16,-9 L 0,-1 L -16,-9 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
      <path d="M 0,-23 L 16,-15 L 0,-7 L -16,-15 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
    </g>
    <text x="96" y="573" font-family="Fraunces, Georgia, serif" font-size="22" font-weight="800" fill="#1E293B" letter-spacing="0.05em">THE BRIEFING</text>
    <text x="1136" y="572" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="500" fill="#64748B" text-anchor="end" letter-spacing="0.02em">Know more. Understand deeper.</text>
  </svg>`;
}

const FLASH_COLORS = {
  india:         '#F97316',
  global:        '#3B82F6',
  politics:      '#EF4444',
  economics:     '#10B981',
  'ai-tech':     '#6366F1',
  science:       '#F59E0B',
  sports:        '#F97316',
  entertainment: '#EC4899',
  culture:       '#A78BFA',
  health:        '#34D399'
};

function getFlashCategoryColor(cat) {
  let c = (cat || "").toLowerCase();
  if (c === "world") c = "global";
  if (c === "business") c = "economics";
  if (c === "ai") c = "ai-tech";
  if (c === "tech") c = "ai-tech";
  return FLASH_COLORS[c] || '#3E3E50';
}

function getFlashIllustrationPaths(cat, storyId) {
  let c = (cat || "").toLowerCase();
  if (c === "world") c = "global";
  if (c === "business") c = "economics";
  if (c === "ai") c = "ai-tech";
  if (c === "tech") c = "ai-tech";
  
  const idx = Math.abs(hashStr(storyId || "default")) % 4;
  const common = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  
  const library = {
    india: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <circle cx="100" cy="100" r="6" fill="currentColor" />
       <path d="M 100 55 L 100 145 M 55 100 L 145 100 M 68 68 L 132 132 M 68 132 L 132 68 M 83 60 L 117 140 M 83 140 L 117 60 M 60 83 L 140 117 M 60 117 L 140 83" ${common} />`,
      `<path d="M 100 140 C 70 120, 50 100, 50 80 C 50 60, 70 75, 100 110 C 130 75, 150 60, 150 80 C 150 100, 130 120, 100 140 Z M 100 140 C 85 110, 80 90, 100 60 C 120 90, 115 110, 100 140 Z M 100 140 C 80 135, 70 130, 65 120 C 60 105, 80 115, 100 125 C 120 115, 140 105, 135 120 C 130 130, 120 135, 100 140 Z" ${common} />`,
      `<path d="M 60 150 L 60 65 L 75 50 L 125 50 L 140 65 L 140 150 M 80 150 L 80 95 C 80 85, 120 85, 120 95 L 120 150 M 55 65 L 145 65 M 70 50 L 130 50" ${common} />
       <line x1="50" y1="135" x2="150" y2="135" ${common} />`,
      `<path d="M 50 70 Q 100 45, 150 70 M 50 100 Q 100 75, 150 100 M 50 130 Q 100 105, 150 130 M 75 60 L 125 60 M 75 90 L 125 90 M 75 120 L 125 120" ${common} />`
    ],
    global: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <ellipse cx="100" cy="100" rx="45" ry="16" ${common} />
       <ellipse cx="100" cy="100" rx="16" ry="45" ${common} />
       <line x1="55" y1="100" x2="145" y2="100" ${common} />
       <line x1="100" y1="55" x2="100" y2="145" ${common} />`,
      `<circle cx="65" cy="75" r="5" fill="currentColor" />
       <circle cx="135" cy="70" r="5" fill="currentColor" />
       <circle cx="100" cy="135" r="5" fill="currentColor" />
       <circle cx="90" cy="60" r="3" fill="currentColor" />
       <circle cx="130" cy="120" r="3" fill="currentColor" />
       <line x1="65" y1="75" x2="135" y2="70" ${common} />
       <line x1="65" y1="75" x2="100" y2="135" ${common} />
       <line x1="135" y1="70" x2="100" y2="135" ${common} />
       <line x1="90" y1="60" x2="65" y2="75" ${common} />
       <line x1="130" y1="120" x2="100" y2="135" ${common} />
       <line x1="130" y1="120" x2="135" y2="70" ${common} />`,
      `<circle cx="100" cy="100" r="45" ${common} />
       <polygon points="100,60 112,100 100,140 88,100" ${common} />
       <line x1="55" y1="100" x2="145" y2="100" ${common} />
       <line x1="100" y1="55" x2="100" y2="145" ${common} stroke-dasharray="2 3" />`,
      `<ellipse cx="100" cy="100" rx="50" ry="20" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="50" ry="20" transform="rotate(-30 100 100)" ${common} />
       <circle cx="100" cy="100" r="8" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`
    ],
    politics: [
      `<polygon points="100,45 50,75 150,75" ${common} />
       <rect x="60" y="75" width="12" height="65" ${common} />
       <rect x="94" y="75" width="12" height="65" ${common} />
       <rect x="128" y="75" width="12" height="65" ${common} />
       <rect x="45" y="140" width="110" height="10" ${common} />`,
      `<rect x="65" y="80" width="70" height="65" rx="4" ${common} />
       <path d="M 85 80 L 85 55 L 115 55 L 115 80" ${common} />
       <line x1="90" y1="55" x2="110" y2="55" ${common} />
       <line x1="80" y1="105" x2="120" y2="105" ${common} />
       <line x1="80" y1="115" x2="110" y2="115" ${common} />`,
      `<line x1="100" y1="50" x2="100" y2="145" ${common} />
       <line x1="55" y1="70" x2="145" y2="70" ${common} />
       <path d="M 55 70 L 40 115 L 70 115 Z" ${common} />
       <path d="M 145 70 L 130 115 L 160 115 Z" ${common} />
       <line x1="80" y1="145" x2="120" y2="145" ${common} />`,
      `<rect x="60" y="100" width="30" height="50" ${common} />
       <rect x="110" y="85" width="30" height="65" ${common} />
       <path d="M 75 100 L 75 80 C 75 75, 85 75, 85 80" ${common} />
       <path d="M 125 85 L 125 65 C 125 60, 135 60, 135 65" ${common} />
       <circle cx="85" cy="80" r="3" fill="currentColor" />
       <circle cx="135" cy="65" r="3" fill="currentColor" />`
    ],
    economics: [
      `<rect x="60" y="115" width="16" height="35" ${common} />
       <rect x="92" y="85" width="16" height="65" ${common} />
       <rect x="124" y="55" width="16" height="95" ${common} />
       <path d="M 45 135 Q 75 110, 105 85 T 155 40" ${common} />
       <polyline points="142,40 155,40 155,53" ${common} />`,
      `<circle cx="100" cy="100" r="45" ${common} />
       <circle cx="100" cy="100" r="28" ${common} />
       <circle cx="100" cy="100" r="12" fill="currentColor" />
       <line x1="100" y1="45" x2="100" y2="155" ${common} stroke-dasharray="2 3" />
       <line x1="45" y1="100" x2="155" y2="100" ${common} stroke-dasharray="2 3" />`,
      `<circle cx="100" cy="100" r="40" ${common} stroke-dasharray="4 2" />
       <path d="M 85 85 L 115 85 M 100 85 L 100 115 M 85 100 L 115 100" ${common} />
       <path d="M 70 70 Q 100 40, 130 70" ${common} />
       <polyline points="120,68 130,70 128,60" ${common} />
       <path d="M 130 130 Q 100 160, 70 130" ${common} />
       <polyline points="80,132 70,130 72,140" ${common} />`,
      `<ellipse cx="100" cy="65" rx="35" ry="10" ${common} />
       <path d="M 65 65 L 65 92 A 35 10 0 0 0 135 92 L 135 65" ${common} />
       <path d="M 65 92 L 65 119 A 35 10 0 0 0 135 119 L 135 92" ${common} />
       <path d="M 65 119 L 65 142 A 35 10 0 0 0 135 142 L 135 119" ${common} />
       <line x1="100" y1="65" x2="100" y2="142" ${common} stroke-dasharray="1 4" />`
    ],
    'ai-tech': [
      `<rect x="65" y="65" width="70" height="70" rx="6" ${common} />
       <rect x="85" y="85" width="30" height="30" rx="2" ${common} />
       <path d="M 78 65 L 78 52 M 100 65 L 100 52 M 122 65 L 122 52 M 78 135 L 78 148 M 100 135 L 100 148 M 122 135 L 122 148 M 65 78 L 52 78 M 65 100 L 52 100 M 65 122 L 52 122 M 135 78 L 148 78 M 135 100 L 148 100 M 135 122 L 148 122" ${common} />`,
      `<circle cx="70" cy="70" r="5" fill="currentColor" />
       <circle cx="70" cy="130" r="5" fill="currentColor" />
       <circle cx="130" cy="70" r="5" fill="currentColor" />
       <circle cx="130" cy="130" r="5" fill="currentColor" />
       <circle cx="100" cy="100" r="8" ${common} />
       <line x1="75" y1="70" x2="125" y2="70" ${common} />
       <line x1="75" y1="130" x2="125" y2="130" ${common} />
       <line x1="70" y1="75" x2="70" y2="125" ${common} />
       <line x1="130" y1="75" x2="130" y2="125" ${common} />
       <line x1="74" y1="74" x2="94" y2="94" ${common} />
       <line x1="126" y1="74" x2="106" y2="94" ${common} />
       <line x1="74" y1="126" x2="94" y2="106" ${common} />
       <line x1="126" y1="126" x2="106" y2="106" ${common} />`,
      `<path d="M 60 85 L 140 85 C 145 85, 145 115, 140 115 L 125 115 C 120 115, 115 105, 100 105 C 85 105, 80 115, 75 115 L 60 115 C 55 115, 55 85, 60 85 Z" ${common} />
       <circle cx="80" cy="100" r="5" fill="currentColor" />
       <circle cx="120" cy="100" r="5" fill="currentColor" />
       <path d="M 50 100 L 55 100 M 145 100 L 150 100" ${common} />`,
      `<polyline points="75,70 55,100 75,130" ${common} />
       <polyline points="125,70 145,100 125,130" ${common} />
       <line x1="110" y1="65" x2="90" y2="135" ${common} />`
    ],
    science: [
      `<circle cx="100" cy="100" r="8" fill="currentColor" />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(-30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="48" ry="16" transform="rotate(90 100 100)" ${common} />
       <circle cx="140" cy="120" r="3" fill="currentColor" />
       <circle cx="60" cy="80" r="3" fill="currentColor" />`,
      `<path d="M 85 50 L 115 50 M 90 50 L 90 80 L 60 140 C 55 150, 65 155, 75 155 L 125 155 C 135 155, 145 150, 140 140 L 110 80 L 110 50" ${common} />
       <line x1="70" y1="130" x2="130" y2="130" ${common} />
       <circle cx="85" cy="105" r="3" fill="currentColor" />
       <circle cx="110" cy="115" r="4" fill="currentColor" />`,
      `<path d="M 80 50 Q 100 75, 120 100 T 80 150" ${common} />
       <path d="M 120 50 Q 100 75, 80 100 T 120 150" ${common} />
       <line x1="90" y1="62" x2="110" y2="62" ${common} />
       <line x1="82" y1="87" x2="118" y2="87" ${common} />
       <line x1="82" y1="112" x2="118" y2="112" ${common} />
       <line x1="90" y1="137" x2="110" y2="137" ${common} />`,
      `<line x1="70" y1="130" x2="135" y2="65" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
       <line x1="100" y1="100" x2="80" y2="150" ${common} />
       <line x1="100" y1="100" x2="120" y2="150" ${common} />
       <polygon points="145,50 150,55 145,60 140,55" fill="currentColor" />
       <polygon points="120,40 123,43 120,46 117,43" fill="currentColor" />`
    ],
    sports: [
      `<circle cx="100" cy="100" r="45" ${common} />
       <polygon points="100,83 113,92 108,108 92,108 87,92" ${common} />
       <line x1="100" y1="83" x2="100" y2="55" ${common} />
       <line x1="113" y1="92" x2="139" y2="101" ${common} />
       <line x1="108" y1="108" x2="124" y2="131" ${common} />
       <line x1="92" y1="108" x2="76" y2="131" ${common} />
       <line x1="87" y1="92" x2="61" y2="101" ${common} />`,
      `<path d="M 70 50 L 130 50 L 125 100 C 120 120, 80 120, 75 100 Z" ${common} />
       <path d="M 100 120 L 100 145 M 80 145 L 120 145" ${common} />
       <path d="M 70 65 C 55 65, 55 90, 72 90 M 130 65 C 145 65, 145 90, 128 90" ${common} />`,
      `<path d="M 50 145 L 50 90 A 50 50 0 0 1 150 90 L 150 145 M 75 145 L 75 90 A 25 25 0 0 1 125 90 L 125 145" ${common} />
       <line x1="40" y1="145" x2="160" y2="145" ${common} />`,
      `<circle cx="100" cy="105" r="35" ${common} />
       <path d="M 90 70 L 110 70 M 100 70 L 100 60" ${common} />
       <line x1="100" y1="105" x2="118" y2="87" ${common} />
       <circle cx="125" cy="80" r="4" fill="currentColor" />`
    ],
    entertainment: [
      `<rect x="65" y="82" width="70" height="63" rx="4" ${common} />
       <line x1="65" y1="104" x2="135" y2="104" ${common} />
       <path d="M 65 82 L 135 68 L 132 58 L 65 72 Z" ${common} />
       <line x1="78" y1="79" x2="86" y2="70" ${common} />
       <line x1="98" y1="75" x2="106" y2="66" ${common} />
       <line x1="118" y1="71" x2="126" y2="62" ${common} />`,
      `<path d="M 70 50 Q 95 90, 70 115 T 90 150 M 110 50 Q 135 90, 110 115 T 130 150" ${common} />
       <line x1="72" y1="70" x2="112" y2="70" ${common} />
       <line x1="78" y1="95" x2="118" y2="95" ${common} />
       <line x1="72" y1="120" x2="112" y2="120" ${common} />`,
      `<path d="M 65 70 C 65 55, 135 55, 135 70 C 135 115, 100 135, 100 135 C 100 135, 65 115, 65 70 Z" ${common} />
       <circle cx="85" cy="85" r="4" fill="currentColor" />
       <circle cx="115" cy="85" r="4" fill="currentColor" />
       <path d="M 82 110 Q 100 125, 118 110" ${common} />`,
      `<circle cx="75" cy="120" r="8" fill="currentColor" />
       <circle cx="120" cy="110" r="8" fill="currentColor" />
       <line x1="83" y1="120" x2="83" y2="55" ${common} />
       <line x1="128" y1="110" x2="128" y2="45" ${common} />
       <polygon points="83,55 128,45 128,55 83,65" fill="currentColor" />`
    ],
    culture: [
      `<path d="M 60 110 C 60 70, 130 60, 140 100 C 145 125, 110 145, 80 140 C 65 138, 55 125, 60 110 Z" ${common} />
       <circle cx="80" cy="85" r="5" fill="currentColor" />
       <circle cx="110" cy="90" r="5" fill="currentColor" />
       <circle cx="95" cy="115" r="5" fill="currentColor" />
       <path d="M 130 70 L 65 135" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`,
      `<path d="M 100 50 L 78 110 L 78 145 L 122 145 L 122 110 Z" ${common} />
       <line x1="100" y1="50" x2="100" y2="110" ${common} />
       <circle cx="100" cy="110" r="3" fill="currentColor" />`,
      `<path d="M 100 140 C 75 125, 50 125, 45 135 L 45 65 C 50 55, 75 55, 100 70 C 125 55, 150 55, 155 65 L 155 135 C 150 125, 125 125, 100 140 Z" ${common} />
       <line x1="100" y1="70" x2="100" y2="140" ${common} />`,
      `<path d="M 80 50 L 120 50 M 90 50 Q 60 95, 90 130 L 90 145 L 110 145 L 110 130 Q 140 95, 110 50" ${common} />
       <ellipse cx="100" cy="95" rx="15" ry="6" ${common} />`
    ],
    health: [
      `<path d="M 80 60 L 80 100 A 20 20 0 0 0 120 100 L 120 60" ${common} />
       <circle cx="80" cy="55" r="4" fill="currentColor" />
       <circle cx="120" cy="55" r="4" fill="currentColor" />
       <path d="M 100 120 L 100 142 A 20 20 0 0 0 120 142" ${common} />
       <circle cx="125" cy="142" r="6" ${common} />`,
      `<path d="M 100 145 C 50 105, 40 70, 70 50 C 90 35, 100 60, 100 60 C 100 60, 110 35, 130 50 C 160 70, 150 105, 100 145 Z" ${common} />
       <polyline points="65,95 85,95 92,75 100,115 108,85 115,95 135,95" ${common} />`,
      `<path d="M 60 60 L 140 60 L 140 100 C 140 135, 100 155, 100 155 C 100 155, 60 135, 60 100 Z" ${common} />
       <path d="M 100 80 L 100 120 M 80 100 L 120 100" ${common} />`,
      `<path d="M 100 50 C 60 80, 60 130, 100 150 C 140 130, 140 80, 100 50 Z" ${common} />
       <path d="M 100 50 L 100 150 M 100 90 Q 75 80, 75 80 M 100 110 Q 125 100, 125 100" ${common} />`
    ]
  };
  
  const icons = library[c] || library['global'];
  return icons[idx];
}

// Generate the beautiful card layout SVG (1200x630) for Flashes
function generateFlashOgSvg(story, date) {
  const catLabel = getCategoryLabel(story, true);
  const catColor = getCategoryColor(catLabel);
  const catBgColor = catColor + "15"; // Translucent color (alpha 20)
  const formattedDate = formatDateStr(date);

  const catBadgeWidth = Math.max(90, catLabel.length * 11 + 24);
  const catStartX = 176; // Starts after FLASH badge (64 + 100 + 12 = 176)

  // Wrap headline
  const hlLines = wrapText(story.headline || story.hl || "", 28);
  const hlLinesToRender = hlLines.slice(0, 3);
  if (hlLines.length > 3) {
    hlLinesToRender[2] = hlLinesToRender[2] + "...";
  }

  // Calculate positions dynamically
  const hlFontSize = 44;
  const hlLineHeight = 54;
  let headlineSvg = "";
  hlLinesToRender.forEach((line, i) => {
    const lineY = 155 + (i * hlLineHeight);
    headlineSvg += `<text x="64" y="${lineY}" font-family="Manrope, Inter, system-ui, sans-serif" font-size="${hlFontSize}" font-weight="800" fill="#0F172A">${escapeXml(line)}</text>\n`;
  });

  const numHlLines = hlLinesToRender.length;
  const underlineY = 155 + (numHlLines - 1) * hlLineHeight + 32;
  const labelY = underlineY + 36;
  const bodyStartY = labelY + 34;

  // Wrap body
  const bodyText = story.summary || story.body || "";
  const bodyLines = wrapText(bodyText, 52);
  const maxBodyLines = 4;
  const bodyLinesToRender = bodyLines.slice(0, maxBodyLines);
  if (bodyLines.length > maxBodyLines) {
    bodyLinesToRender[maxBodyLines - 1] = bodyLinesToRender[maxBodyLines - 1] + "...";
  }

  let bodySvg = "";
  const bodyLineHeight = 30;
  bodyLinesToRender.forEach((line, i) => {
    const lineY = bodyStartY + (i * bodyLineHeight);
    bodySvg += `<text x="64" y="${lineY}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="400" fill="#334155" opacity="0.95">${escapeXml(line)}</text>\n`;
  });

  // Get gradient and vector art URL mapping
  let gradientId = "grad-default";
  const l = catLabel.toUpperCase();
  if (l === "SCIENCE") gradientId = "grad-science";
  else if (l === "AI & TECH" || l === "TECH") gradientId = "grad-tech";
  else if (l === "ECONOMY" || l === "ECONOMICS") gradientId = "grad-economy";
  else if (l === "POLITICS" || l === "CONFLICT") gradientId = "grad-politics";
  else if (l === "INDIA") gradientId = "grad-india";
  else if (l === "GLOBAL") gradientId = "grad-global";
  else if (l === "HEALTH") gradientId = "grad-economy";
  else if (l === "SPORTS") gradientId = "grad-india";
  else if (l === "ENTERTAINMENT" || l === "CULTURE") gradientId = "grad-tech";

  const vectorArt = getVectorArtForCategory(catLabel);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <defs>
      <!-- Science Gradient: Deep space to warm glow -->
      <linearGradient id="grad-science" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="70%" stop-color="#1E293B" />
        <stop offset="100%" stop-color="#F59E0B" />
      </linearGradient>

      <!-- Tech/AI Gradient: Cyber deep indigo/violet -->
      <linearGradient id="grad-tech" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1E1B4B" />
        <stop offset="60%" stop-color="#312E81" />
        <stop offset="100%" stop-color="#818CF8" />
      </linearGradient>

      <!-- Economy Gradient: Rich forest dark green to light teal -->
      <linearGradient id="grad-economy" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#064E3B" />
        <stop offset="70%" stop-color="#065F46" />
        <stop offset="100%" stop-color="#34D399" />
      </linearGradient>

      <!-- Politics/Conflict Gradient: Dark grey/blue to crimson/coral -->
      <linearGradient id="grad-politics" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#111827" />
        <stop offset="60%" stop-color="#374151" />
        <stop offset="100%" stop-color="#EF4444" />
      </linearGradient>

      <!-- India Gradient: Saffron orange blend -->
      <linearGradient id="grad-india" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#431407" />
        <stop offset="60%" stop-color="#7C2D12" />
        <stop offset="100%" stop-color="#F97316" />
      </linearGradient>

      <!-- Global/World Gradient: Deep blue oceanic teal -->
      <linearGradient id="grad-global" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="60%" stop-color="#0369A1" />
        <stop offset="100%" stop-color="#38BDF8" />
      </linearGradient>
      
      <!-- Default Gradient: Muted Slate -->
      <linearGradient id="grad-default" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1E293B" />
        <stop offset="70%" stop-color="#334155" />
        <stop offset="100%" stop-color="#64748B" />
      </linearGradient>

      <clipPath id="arch-clip">
        <path d="M 710,540 L 710,330 A 210,210 0 0 1 1130,330 L 1130,540 Z" />
      </clipPath>
    </defs>

    <!-- Base Canvas -->
    <rect width="1200" height="630" fill="#ECE8DF" />

    <!-- Card Background -->
    <rect x="24" y="24" width="1152" height="582" rx="32" ry="32" fill="#FAF8F5" />

    <!-- Bottom Brand Bar -->
    <path d="M 24,526 L 1176,526 L 1176,574 A 32,32 0 0 1 1144,606 L 56,606 A 32,32 0 0 1 24,574 Z" fill="#F4EFE6" />

    <!-- Outer Card Border -->
    <rect x="24" y="24" width="1152" height="582" rx="32" ry="32" fill="none" stroke="#E5E2DA" stroke-width="2" />

    <!-- TOP ROW -->
    <!-- Type Badge (FLASH) -->
    <rect x="64" y="60" width="100" height="36" rx="10" fill="#E13C16" />
    <text x="114" y="83" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="800" fill="#FFF" text-anchor="middle" letter-spacing="0.08em">FLASH</text>

    <!-- Category Badge -->
    <rect x="${catStartX}" y="60" width="${catBadgeWidth}" height="36" rx="10" fill="${catBgColor}" stroke="${catColor}" stroke-width="1.5" />
    <text x="${catStartX + catBadgeWidth / 2}" y="83" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700" fill="${catColor}" text-anchor="middle" letter-spacing="0.06em">${escapeXml(catLabel)}</text>

    <!-- Date -->
    <text x="1136" y="83" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="#7E7B73" text-anchor="end" letter-spacing="0.04em">${escapeXml(formattedDate)}</text>

    <!-- LEFT COLUMN CONTENT -->
    <!-- Headline -->
    ${headlineSvg}

    <!-- Accent Underline -->
    <line x1="64" y1="${underlineY}" x2="112" y2="${underlineY}" stroke="#E13C16" stroke-width="3.5" stroke-linecap="round" />

    <!-- Label -->
    <text x="64" y="${labelY}" font-family="Inter, system-ui, sans-serif" font-size="20" font-weight="800" fill="#E13C16" letter-spacing="0.02em">Why it matters:</text>

    <!-- Body -->
    ${bodySvg}

    <!-- RIGHT COLUMN (ARCHED WINDOW) -->
    <g clip-path="url(#arch-clip)">
      <rect x="700" y="100" width="450" height="460" fill="url(#${gradientId})" />
      ${vectorArt}
    </g>

    <!-- BRAND FOOTER -->
    <!-- Logo Stack (Paper Stack Symbol) -->
    <g transform="translate(68, 566)">
      <path d="M 0,-5 L 16,3 L 0,11 L -16,3 Z" fill="#1E293B" />
      <path d="M 0,-11 L 16,-3 L 0,5 L -16,-3 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
      <path d="M 0,-17 L 16,-9 L 0,-1 L -16,-9 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
      <path d="M 0,-23 L 16,-15 L 0,-7 L -16,-15 Z" fill="#1E293B" stroke="#F4EFE6" stroke-width="1.5" />
    </g>
    <text x="96" y="573" font-family="Fraunces, Georgia, serif" font-size="22" font-weight="800" fill="#1E293B" letter-spacing="0.05em">THE BRIEFING</text>
    <text x="1136" y="572" font-family="Inter, system-ui, sans-serif" font-size="16" font-weight="500" fill="#64748B" text-anchor="end" letter-spacing="0.02em">Know more. Understand deeper.</text>
  </svg>`;
}

async function runSSG() {
  console.log('Generating SSG and OG Images...');
  
  const rootHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  
  // Helper to replace dynamic base script with static base href
  const injectBaseHref = (html, relPath) => {
    const baseScriptRegex = /<script>\s*const basePath = [\s\S]*?<\/script>/;
    return html.replace(baseScriptRegex, `<base href="${relPath}" />`);
  };
  
  // Pre-render briefings, flash and install base directories
  const briefingsDir = path.join(process.cwd(), 'briefings');
  if (!fs.existsSync(briefingsDir)) fs.mkdirSync(briefingsDir, { recursive: true });
  fs.writeFileSync(path.join(briefingsDir, 'index.html'), injectBaseHref(rootHtml, '../'));

  const flashDir = path.join(process.cwd(), 'flash');
  if (!fs.existsSync(flashDir)) fs.mkdirSync(flashDir, { recursive: true });
  let flashHtml = injectBaseHref(rootHtml, '../');
  flashHtml = flashHtml.replace(/https:\/\/thebriefings\.netlify\.app\/icon-briefing\.png/g, 'https://thebriefings.netlify.app/flash-logo.png');
  fs.writeFileSync(path.join(flashDir, 'index.html'), flashHtml);

  const installDir = path.join(process.cwd(), 'install');
  if (!fs.existsSync(installDir)) fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'index.html'), injectBaseHref(rootHtml, '../'));

  const savedDir = path.join(process.cwd(), 'saved');
  if (!fs.existsSync(savedDir)) fs.mkdirSync(savedDir, { recursive: true });
  fs.writeFileSync(path.join(savedDir, 'index.html'), injectBaseHref(rootHtml, '../'));

  const dataDir = path.join(process.cwd(), 'data');
  const allFiles = fs.readdirSync(dataDir);
  const dates = new Set();
  for (const f of allFiles) {
    const m1 = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (m1) dates.add(m1[1]);
    const m2 = f.match(/^flash-(\d{4}-\d{2}-\d{2})\.json$/);
    if (m2) dates.add(m2[1]);
  }
  const dateList = Array.from(dates).sort((a, b) => b.localeCompare(a));
  
  const ogImagesDir = path.join(process.cwd(), 'og-images');
  if (!fs.existsSync(ogImagesDir)) fs.mkdirSync(ogImagesDir, { recursive: true });
  
  for (const date of dateList) {
    const dataPath = path.join(dataDir, `${date}.json`);
    const briefingExists = fs.existsSync(dataPath);
    
    // Ensure date OG dir
    const dateOgDir = path.join(ogImagesDir, date);
    if (!fs.existsSync(dateOgDir)) fs.mkdirSync(dateOgDir, { recursive: true });
    
    // Also build a /day/YYYY-MM-DD/ route just in case
    const dayDir = path.join(process.cwd(), 'day', date);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, 'index.html'), injectBaseHref(rootHtml, '../../'));

    // Build briefings/day/YYYY-MM-DD and flash/day/YYYY-MM-DD
    const bDayDir = path.join(process.cwd(), 'briefings', 'day', date);
    if (!fs.existsSync(bDayDir)) fs.mkdirSync(bDayDir, { recursive: true });
    fs.writeFileSync(path.join(bDayDir, 'index.html'), injectBaseHref(rootHtml, '../../../'));

    const fDayDir = path.join(process.cwd(), 'flash', 'day', date);
    if (!fs.existsSync(fDayDir)) fs.mkdirSync(fDayDir, { recursive: true });
    let fDayHtml = injectBaseHref(rootHtml, '../../../');
    fDayHtml = fDayHtml.replace(/https:\/\/thebriefings\.netlify\.app\/icon-briefing\.png/g, 'https://thebriefings.netlify.app/flash-logo.png');
    fs.writeFileSync(path.join(fDayDir, 'index.html'), fDayHtml);
    
    if (briefingExists) {
      await backfillBriefingImages(dataPath, date);
      const briefing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      let idx = 0;
      for (const story of briefing.stories) {
        // 1. Generate fallback illustration PNG (used only if no hero image is available)
        const svgString = generateOgSvg(story, date, idx);
        const resvg = new Resvg(svgString, {
          background: 'rgba(255, 255, 255, 1)',
          fitTo: { mode: 'width', value: 1200 },
        });
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();

        const pngPath = path.join(dateOgDir, `${story.id}.png`);
        fs.writeFileSync(pngPath, pngBuffer);

        // 2. Generate HTML
        const storyDir = path.join(process.cwd(), 'story', date, story.id);
        if (!fs.existsSync(storyDir)) fs.mkdirSync(storyDir, { recursive: true });

        const ogTitle = (story.headline || story.title || "").replace(/"/g, '&quot;');
        const ogDesc = (story.tldr || story.overview || "").replace(/"/g, '&quot;');
        const domain = process.env.HOST || "https://thebriefings.netlify.app";
        // Prefer the real hero image for link previews; fall back to the generated illustration card
        const ogImage = (story.heroImage && story.heroImage.startsWith("http"))
          ? story.heroImage
          : `${domain}/og-images/${date}/${story.id}.png`;
        
        let storyHtml = rootHtml;
        storyHtml = storyHtml.replace(/<title>.*?<\/title>/, `<title>${ogTitle}</title>`);
        storyHtml = storyHtml.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${ogTitle}" />`);
        storyHtml = storyHtml.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${ogDesc}" />`);
        storyHtml = storyHtml.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${ogDesc}" />`);
        storyHtml = storyHtml.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${ogImage}" />`);
        storyHtml = storyHtml.replace(/<meta name="twitter:image" content=".*?" \/>/, `<meta name="twitter:image" content="${ogImage}" />`);
        
        fs.writeFileSync(path.join(storyDir, 'index.html'), injectBaseHref(storyHtml, '../../../'));
        
        idx++;
      }
    }
  }
  
  // Now process Flash stories static pages and OG images
  console.log('Generating Flash SSG and OG Images...');
  const processedFlashIds = new Set();
  
  const processFlashStory = (story, date) => {
    if (!story || !story.id) return;
    if (processedFlashIds.has(story.id)) return;
    processedFlashIds.add(story.id);
    
    // 1. Generate PNG
    console.log(`Processing Flash Story ID: ${story.id}, Category: ${story.cat}`);
    const svgString = generateFlashOgSvg(story, date);
    const resvg = new Resvg(svgString, {
      background: 'rgba(255, 255, 255, 1)',
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();
    
    const flashOgDir = path.join(process.cwd(), 'og-images', 'flash');
    if (!fs.existsSync(flashOgDir)) fs.mkdirSync(flashOgDir, { recursive: true });
    
    const pngPath = path.join(flashOgDir, `${story.id}.png`);
    fs.writeFileSync(pngPath, pngBuffer);
    
    // 2. Generate HTML
    const storyDir = path.join(process.cwd(), 'flash', 'story', story.id);
    if (!fs.existsSync(storyDir)) fs.mkdirSync(storyDir, { recursive: true });
    
    const ogTitle = (story.headline || story.hl || "").replace(/"/g, '&quot;');
    const ogDesc = (story.summary || story.body || "").replace(/"/g, '&quot;');
    const domain = process.env.HOST || "https://thebriefings.netlify.app"; 
    const ogImage = `${domain}/og-images/flash/${story.id}.png`;
    
    let storyHtml = rootHtml;
    storyHtml = storyHtml.replace(/<title>.*?<\/title>/, `<title>${ogTitle}</title>`);
    storyHtml = storyHtml.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${ogTitle}" />`);
    storyHtml = storyHtml.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${ogDesc}" />`);
    storyHtml = storyHtml.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${ogDesc}" />`);
    storyHtml = storyHtml.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${ogImage}" />`);
    storyHtml = storyHtml.replace(/<meta name="twitter:image" content=".*?" \/>/, `<meta name="twitter:image" content="${ogImage}" />`);
    
    fs.writeFileSync(path.join(storyDir, 'index.html'), injectBaseHref(storyHtml, '../../../'));
  };
  
  // Process root flash.json
  const rootFlashPath = path.join(process.cwd(), 'flash.json');
  if (fs.existsSync(rootFlashPath)) {
    try {
      const rootStories = JSON.parse(fs.readFileSync(rootFlashPath, 'utf8'));
      if (Array.isArray(rootStories)) {
        for (const story of rootStories) {
          processFlashStory(story, dateList[0]);
        }
      }
    } catch (e) {
      console.error("Error parsing root flash.json", e);
    }
  }
  
  // Process date-specific flash files
  for (const date of dateList) {
    const flashDataPath = path.join(dataDir, `flash-${date}.json`);
    if (fs.existsSync(flashDataPath)) {
      try {
        const dateStories = JSON.parse(fs.readFileSync(flashDataPath, 'utf8'));
        if (Array.isArray(dateStories)) {
          for (const story of dateStories) {
            processFlashStory(story, date);
          }
        }
      } catch (e) {
        console.error(`Error parsing flash data for ${date}`, e);
      }
    }
  }
  
  console.log(`Flash SSG complete! Processed ${processedFlashIds.size} stories.`);
  console.log('SSG complete!');
}

runSSG();
