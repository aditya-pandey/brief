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
      `<line x1="40" y1="100" x2="160" y2="100" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
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
      `<line x1="70" y1="130" x2="135" y2="65" ${common} stroke-width="3" />
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
       <path d="M 130 70 L 65 135" ${common} stroke-width="3" />`,
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

function generateFlashOgSvg(story) {
  let hash = Math.abs(hashStr(story.id || story.headline || "default"));
  function rand() {
    let x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  }
  
  const bgs = ["#F4F4F5", "#F8FAFC", "#FAF5FF", "#FDF4FF", "#FFFBEB", "#F0FDF4", "#F0F9FF", "#FEF2F2", "#FFF7ED"];
  const bg = bgs[Math.floor(rand() * bgs.length)];
  const col = getFlashCategoryColor(story.cat);
  const iconPaths = getFlashIllustrationPaths(story.cat, story.id);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
    <rect width="1200" height="630" fill="${bg}" />
    <g transform="translate(600, 315) scale(2.5) translate(-100, -100)" color="${col}">
      ${iconPaths}
    </g>
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
  
  // Pre-render briefings and flash base directories
  const briefingsDir = path.join(process.cwd(), 'briefings');
  if (!fs.existsSync(briefingsDir)) fs.mkdirSync(briefingsDir, { recursive: true });
  fs.writeFileSync(path.join(briefingsDir, 'index.html'), injectBaseHref(rootHtml, '../'));

  const flashDir = path.join(process.cwd(), 'flash');
  if (!fs.existsSync(flashDir)) fs.mkdirSync(flashDir, { recursive: true });
  let flashHtml = injectBaseHref(rootHtml, '../');
  flashHtml = flashHtml.replace(/https:\/\/thebriefings\.netlify\.app\/icon-briefing\.png/g, 'https://thebriefings.netlify.app/flash-logo.png');
  fs.writeFileSync(path.join(flashDir, 'index.html'), flashHtml);

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
      const briefing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
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
        const domain = process.env.HOST || "https://thebriefings.netlify.app"; 
        const ogImage = `${domain}/og-images/${date}/${story.id}.png`;
        
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
  
  const processFlashStory = (story) => {
    if (!story || !story.id) return;
    if (processedFlashIds.has(story.id)) return;
    processedFlashIds.add(story.id);
    
    // 1. Generate PNG
    console.log(`Processing Flash Story ID: ${story.id}, Category: ${story.cat}`);
    const svgString = generateFlashOgSvg(story);
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
          processFlashStory(story);
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
            processFlashStory(story);
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
