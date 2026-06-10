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

// Generate an OG-sized SVG (1200x630)
function generateOgSvg(story, idx = 0) {
  const text = ((story.headline || "") + " " + (story.tldr || "")).toLowerCase();
  let hash = Math.abs(hashStr(story.id || story.headline || "default"));
  function rand() {
    let x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  }
  
  const bgs = ["#F4F4F5", "#F8FAFC", "#FAF5FF", "#FDF4FF", "#FFFBEB", "#F0FDF4", "#F0F9FF", "#FEF2F2", "#FFF7ED"];
  const bg = bgs[Math.floor(rand() * bgs.length)];

  // For static OG images, always use dark ink for contrast against pastel bg
  const stroke = "#1c1917"; 
  const sw = "1.5"; 
  const common = `fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;

  const library = {
    conflict: [
      `<path d="M 100 40 A 60 60 0 0 0 100 160" ${common} />
       <path d="M 110 40 A 60 60 0 0 1 110 160" ${common} />
       <polyline points="105,30 90,80 120,120 95,170" ${common} />`,
      `<line x1="100" y1="40" x2="100" y2="160" ${common} />
       <line x1="50" y1="70" x2="150" y2="70" ${common} />
       <polygon points="50,70 30,120 70,120" ${common} />
       <polygon points="150,70 130,120 170,120" ${common} />
       <line x1="70" y1="160" x2="130" y2="160" ${common} />`,
      `<polyline points="40,60 80,100 40,140" ${common} />
       <polyline points="160,60 120,100 160,140" ${common} />
       <line x1="100" y1="40" x2="100" y2="160" ${common} stroke-dasharray="4 4"/>`,
      `<path d="M 50 60 Q 100 40 150 60 L 150 100 Q 150 150 100 170 Q 50 150 50 100 Z" ${common} />
       <line x1="100" y1="45" x2="100" y2="170" ${common} />`,
      `<line x1="60" y1="140" x2="130" y2="70" ${common} />
       <rect x="120" y="50" width="40" height="20" transform="rotate(45 140 60)" ${common} />
       <line x1="40" y1="150" x2="80" y2="150" ${common} />`,
      `<polyline points="60,60 140,60 140,140 80,140 80,80 120,80 120,120" ${common} />
       <line x1="100" y1="100" x2="100" y2="160" ${common} />
       <line x1="40" y1="100" x2="60" y2="100" ${common} />`,
      `<rect x="80" y="40" width="40" height="120" ${common} />
       <polygon points="70,100 130,90 130,110 70,120" fill="${bg}" stroke="${bg}" stroke-width="4" />
       <polyline points="75,100 100,95 125,110" ${common} />`
    ],
    economy: [
      `<rect x="50" y="120" width="20" height="40" ${common} />
       <rect x="90" y="90" width="20" height="70" ${common} />
       <rect x="130" y="50" width="20" height="110" ${common} />
       <path d="M 30 140 Q 80 140 100 80 T 170 30" ${common} />
       <line x1="30" y1="160" x2="170" y2="160" ${common} />`,
      `<circle cx="100" cy="100" r="50" ${common} />
       <circle cx="100" cy="100" r="25" ${common} />
       <line x1="100" y1="50" x2="100" y2="75" ${common} />
       <line x1="143" y1="125" x2="122" y2="112" ${common} />
       <line x1="57" y1="125" x2="78" y2="112" ${common} />`,
      `<circle cx="70" cy="100" r="30" ${common} />
       <circle cx="130" cy="100" r="30" ${common} />
       <path d="M 70 50 Q 100 30 130 50" ${common} />
       <polygon points="120,40 135,50 120,60" fill="${stroke}" />
       <path d="M 130 150 Q 100 170 70 150" ${common} />
       <polygon points="80,140 65,150 80,160" fill="${stroke}" />`,
      `<polyline points="40,160 40,130 80,130 80,100 120,100 120,70 160,70 160,40" ${common} />
       <line x1="40" y1="160" x2="160" y2="160" ${common} />`,
      `<line x1="70" y1="40" x2="70" y2="120" ${common} />
       <rect x="60" y="60" width="20" height="40" fill="${stroke}" />
       <line x1="130" y1="80" x2="130" y2="160" ${common} />
       <rect x="120" y="100" width="20" height="40" ${common} />`,
      `<path d="M 40 140 Q 100 140 100 100 T 160 60" ${common} />
       <path d="M 40 160 Q 100 160 100 120 T 160 80" ${common} stroke-dasharray="4 4" />`
    ],
    tech: [
      `<ellipse cx="100" cy="100" rx="60" ry="20" transform="rotate(30 100 100)" ${common} />
       <ellipse cx="100" cy="100" rx="60" ry="20" transform="rotate(150 100 100)" ${common} />
       <circle cx="100" cy="100" r="6" fill="${stroke}" />
       <circle cx="50" cy="70" r="3" fill="${stroke}" />
       <circle cx="150" cy="130" r="3" fill="${stroke}" />`,
      `<rect x="60" y="60" width="80" height="80" rx="4" ${common} />
       <rect x="80" y="80" width="40" height="40" rx="2" ${common} />
       <line x1="60" y1="80" x2="40" y2="80" ${common} />
       <line x1="60" y1="100" x2="40" y2="100" ${common} />
       <line x1="60" y1="120" x2="40" y2="120" ${common} />
       <line x1="140" y1="80" x2="160" y2="80" ${common} />
       <line x1="140" y1="100" x2="160" y2="100" ${common} />
       <line x1="140" y1="120" x2="160" y2="120" ${common} />
       <line x1="80" y1="60" x2="80" y2="40" ${common} />
       <line x1="100" y1="60" x2="100" y2="40" ${common} />
       <line x1="120" y1="60" x2="120" y2="40" ${common} />
       <line x1="80" y1="140" x2="80" y2="160" ${common} />
       <line x1="100" y1="140" x2="100" y2="160" ${common} />
       <line x1="120" y1="140" x2="120" y2="160" ${common} />`,
      `<circle cx="100" cy="100" r="40" ${common} stroke-dasharray="4 4" />
       <circle cx="100" cy="60" r="5" fill="${stroke}" />
       <circle cx="65" cy="120" r="5" fill="${stroke}" />
       <circle cx="135" cy="120" r="5" fill="${stroke}" />
       <circle cx="100" cy="100" r="3" fill="${stroke}" />
       <line x1="100" y1="60" x2="100" y2="100" ${common} />
       <line x1="65" y1="120" x2="100" y2="100" ${common} />
       <line x1="135" y1="120" x2="100" y2="100" ${common} />
       <line x1="65" y1="120" x2="135" y2="120" ${common} />`,
      `<path d="M 40 160 A 120 120 0 0 1 160 40" ${common} />
       <path d="M 40 160 A 80 80 0 0 1 120 80" ${common} />
       <path d="M 40 160 A 40 40 0 0 1 80 120" ${common} />
       <circle cx="40" cy="160" r="6" fill="${stroke}" />
       <circle cx="110" cy="90" r="4" fill="${stroke}" />`,
      `<rect x="60" y="60" width="20" height="20" ${common} />
       <rect x="90" y="60" width="20" height="20" fill="${stroke}" />
       <rect x="120" y="60" width="20" height="20" ${common} />
       <rect x="60" y="90" width="20" height="20" fill="${stroke}" />
       <rect x="90" y="90" width="20" height="20" ${common} />
       <rect x="120" y="90" width="20" height="20" fill="${stroke}" />
       <rect x="60" y="120" width="20" height="20" ${common} />
       <rect x="90" y="120" width="20" height="20" fill="${stroke}" />
       <rect x="120" y="120" width="20" height="20" ${common} />`,
      `<polyline points="30,100 60,100 75,60 90,140 105,40 120,120 135,100 170,100" ${common} />`
    ],
    politics: [
      `<polygon points="100,50 40,80 160,80" ${common} />
       <rect x="50" y="80" width="10" height="60" ${common} />
       <rect x="80" y="80" width="10" height="60" ${common} />
       <rect x="110" y="80" width="10" height="60" ${common} />
       <rect x="140" y="80" width="10" height="60" ${common} />
       <rect x="30" y="140" width="140" height="10" ${common} />`,
      `<circle cx="100" cy="100" r="50" ${common} />
       <ellipse cx="100" cy="100" rx="20" ry="50" ${common} />
       <line x1="50" y1="100" x2="150" y2="100" ${common} />
       <line x1="100" y1="40" x2="100" y2="160" ${common} />`,
      `<rect x="80" y="80" width="40" height="60" ${common} />
       <rect x="70" y="140" width="60" height="10" ${common} />
       <line x1="100" y1="80" x2="100" y2="50" ${common} />
       <circle cx="100" cy="45" r="5" fill="${stroke}" />
       <line x1="90" y1="90" x2="110" y2="90" ${common} />
       <line x1="90" y1="100" x2="110" y2="100" ${common} />`,
      `<path d="M 60 100 A 40 40 0 0 1 140 100" ${common} />
       <rect x="50" y="100" width="100" height="20" ${common} />
       <rect x="40" y="120" width="120" height="10" ${common} />
       <line x1="100" y1="60" x2="100" y2="40" ${common} />`,
      `<line x1="40" y1="100" x2="160" y2="100" ${common} stroke-width="3" />
       <circle cx="70" cy="70" r="10" ${common} />
       <circle cx="100" cy="70" r="10" fill="${stroke}" />
       <circle cx="130" cy="70" r="10" ${common} />
       <circle cx="70" cy="130" r="10" fill="${stroke}" />
       <circle cx="100" cy="130" r="10" ${common} />
       <circle cx="130" cy="130" r="10" fill="${stroke}" />`,
      `<line x1="40" y1="50" x2="160" y2="50" ${common} />
       <polygon points="60,50 100,50 80,120" ${common} />
       <polygon points="110,50 150,50 130,140" fill="${stroke}" opacity="0.8"/>`
    ],
    balance: [
      `<circle cx="100" cy="130" r="30" ${common} />
       <circle cx="100" cy="80" r="20" ${common} />
       <circle cx="100" cy="45" r="15" ${common} />
       <line x1="40" y1="160" x2="160" y2="160" ${common} />`,
      `<circle cx="100" cy="100" r="50" ${common} />
       <line x1="30" y1="100" x2="170" y2="100" ${common} />
       <line x1="60" y1="110" x2="140" y2="110" ${common} />
       <line x1="80" y1="120" x2="120" y2="120" ${common} />`,
      `<circle cx="85" cy="100" r="40" ${common} />
       <circle cx="115" cy="100" r="40" ${common} />
       <path d="M 100 63 L 100 137" ${common} stroke-dasharray="2 4"/>`,
      `<polygon points="60,60 140,60 100,100" ${common} />
       <polygon points="60,140 140,140 100,100" ${common} />
       <line x1="80" y1="120" x2="120" y2="120" ${common} stroke-dasharray="2 2" />`,
      `<path d="M 60 120 A 40 40 0 0 1 140 120" ${common} />
       <line x1="30" y1="120" x2="170" y2="120" ${common} />
       <line x1="100" y1="80" x2="100" y2="60" ${common} />
       <line x1="128" y1="92" x2="142" y2="78" ${common} />
       <line x1="72" y1="92" x2="58" y2="78" ${common} />`,
      `<line x1="100" y1="40" x2="100" y2="140" ${common} stroke-dasharray="4 4" />
       <circle cx="100" cy="140" r="15" fill="${stroke}" />
       <path d="M 60 140 A 40 40 0 0 0 140 140" ${common} />`
    ]
  };

  const categories = {
    conflict: ["strike", "war", "conflict", "tension", "crisis", "attack", "threat", "protest", "violence", "court", "lawsuit", "invalidates", "clash", "friction", "strains", "rejects"],
    economy: ["economy", "market", "funding", "growth", "bank", "trade", "tax", "fee", "investment", "price", "billion", "rupee", "dollar"],
    tech: ["tech", "ai", "space", "science", "digital", "data", "software", "apple", "google", "meta", "cyber"],
    politics: ["election", "vote", "president", "minister", "law", "policy", "government", "parliament", "senate", "ruling", "judge", "diplomatic"]
  };

  let activeTheme = "balance";
  let maxMatches = 0;
  for (const [theme, words] of Object.entries(categories)) {
    let matches = 0;
    words.forEach(w => { if (text.includes(w)) matches++; });
    if (matches > maxMatches) {
      maxMatches = matches;
      activeTheme = theme;
    }
  }

  const icons = library[activeTheme];
  const icon = icons[Math.floor(rand() * icons.length)];
  
  // Return a full 1200x630 SVG
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <rect width="1200" height="630" fill="${bg}" />
    <g transform="translate(600, 315) scale(2.5) translate(-100, -100)">
      ${icon}
    </g>
  </svg>`;
}

async function runSSG() {
  console.log('Generating SSG and OG Images...');
  
  const rootHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'index.json');
  
  const ogImagesDir = path.join(process.cwd(), 'og-images');
  if (!fs.existsSync(ogImagesDir)) fs.mkdirSync(ogImagesDir, { recursive: true });
  
  for (const file of files) {
    const date = file.replace('.json', '');
    const dataPath = path.join(dataDir, file);
    const briefing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Ensure date OG dir
    const dateOgDir = path.join(ogImagesDir, date);
    if (!fs.existsSync(dateOgDir)) fs.mkdirSync(dateOgDir, { recursive: true });
    
    // Also build a /day/YYYY-MM-DD/ route just in case
    const dayDir = path.join(process.cwd(), 'day', date);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(path.join(dayDir, 'index.html'), rootHtml);
    
    let idx = 0;
    for (const story of briefing.stories) {
      // 1. Generate PNG
      const svgString = generateOgSvg(story, idx);
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
      
      const ogTitle = story.headline.replace(/"/g, '&quot;');
      const ogDesc = story.tldr.replace(/"/g, '&quot;');
      // Provide an absolute URL if HOST is defined, otherwise relative for local testing
      // Social crawlers require absolute URLs for og:image.
      // We will assume a placeholder domain if none provided
      const domain = process.env.HOST || "https://aditya-pandey.github.io/brief"; 
      const ogImage = `${domain}/og-images/${date}/${story.id}.png`;
      
      let storyHtml = rootHtml;
      storyHtml = storyHtml.replace(/<title>.*?<\/title>/, `<title>${ogTitle}</title>`);
      storyHtml = storyHtml.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${ogTitle}" />`);
      storyHtml = storyHtml.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${ogDesc}" />`);
      storyHtml = storyHtml.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${ogDesc}" />`);
      storyHtml = storyHtml.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${ogImage}" />`);
      storyHtml = storyHtml.replace(/<meta name="twitter:image" content=".*?" \/>/, `<meta name="twitter:image" content="${ogImage}" />`);
      
      fs.writeFileSync(path.join(storyDir, 'index.html'), storyHtml);
      
      idx++;
    }
  }
  
  console.log('SSG complete!');
}

runSSG();
