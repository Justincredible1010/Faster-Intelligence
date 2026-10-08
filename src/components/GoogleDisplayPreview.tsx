import React, { useState, useRef, useEffect } from 'react';
import {
  Layout,
  Upload,
  Download,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  Check,
  Globe,
  Layers,
  Info,
  Maximize2,
  Palette,
  CheckCircle2,
  FileQuestion,
  ExternalLink,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import { GoogleDisplayAd, StageCode, STAGE_CONFIGS, normalizeStage } from '../types';

interface Props {
  content: GoogleDisplayAd;
  journalName?: string;
  impactFactor?: number | null;
  /** Provenance phrase such as "JIF 56.1 (Clarivate JCR 2025)". Falls back to IF n. */
  impactLabel?: string | null;
  casZone?: string | null;
  publisher?: string;
  stage?: StageCode;
  onUpdateContent?: (updated: GoogleDisplayAd) => void;
}

// Curated High-Resolution Academic Stock Images (Simulating Adobe Express Academic Stock & Landing Page visuals)
const ACADEMIC_STOCK_LIBRARY = [
  {
    id: 'stock-lab',
    name: 'Biomedical Lab & Pipettes',
    category: 'Biomedicine',
    url: 'https://images.unsplash.com/photo-1579165466791-788226ab77b6?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#002d62',
  },
  {
    id: 'stock-dna',
    name: 'DNA Helix & Genomics',
    category: 'Genetics',
    url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#1e1b4b',
  },
  {
    id: 'stock-microscopy',
    name: 'Cellular Microscopy',
    category: 'Cell Biology',
    url: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#064e3b',
  },
  {
    id: 'stock-nanotech',
    name: 'Nanotech & Materials',
    category: 'Materials Science',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#001a3d',
  },
  {
    id: 'stock-clinical',
    name: 'Clinical Diagnostics',
    category: 'Medicine',
    url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#002d62',
  },
  {
    id: 'stock-optics',
    name: 'Photonics & Laser',
    category: 'Physics & Optics',
    url: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#312e81',
  },
  {
    id: 'stock-environmental',
    name: 'Earth & Climate Ecology',
    category: 'Environment',
    url: 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#064e3b',
  },
  {
    id: 'stock-quantum',
    name: 'Scientific Abstract Lattice',
    category: 'Multidisciplinary',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1200&q=80',
    colorHint: '#0f172a',
  },
];

type BannerFormat = 'landscape' | 'square' | 'rect300x250' | 'leaderboard728x90' | 'skyscraper160x600';

export const GoogleDisplayPreview: React.FC<Props> = ({
  content,
  journalName = 'Nature',
  impactFactor = null,
  impactLabel = null,
  casZone = null,
  publisher = 'Nature Portfolio',
  onUpdateContent,
}) => {
  const [activeFormat, setActiveFormat] = useState<BannerFormat>('landscape');
  const [themeStyle, setThemeStyle] = useState<'navy' | 'emerald' | 'cobalt' | 'crimson'>('navy');
  const [selectedStockId, setSelectedStockId] = useState<string>('stock-lab');
  const [uploadedImage, setUploadedImage] = useState<string | null>(content.customBannerImage || null);
  const [activeStockUrl, setActiveStockUrl] = useState<string>(ACADEMIC_STOCK_LIBRARY[0].url);
  const [isExporting, setIsExporting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Themes
  const themeColors = {
    navy: { bgStart: '#001433', bgEnd: '#002d62', accent: '#38bdf8', text: '#ffffff' },
    emerald: { bgStart: '#022c22', bgEnd: '#064e3b', accent: '#34d399', text: '#ffffff' },
    cobalt: { bgStart: '#1e1b4b', bgEnd: '#312e81', accent: '#818cf8', text: '#ffffff' },
    crimson: { bgStart: '#450a0a', bgEnd: '#7f1d1d', accent: '#f87171', text: '#ffffff' },
  };

  const currentTheme = themeColors[themeStyle];
  const badgeLabel = impactLabel || (impactFactor == null ? '' : `JIF ${impactFactor}`);

  // Draw Banner to Canvas whenever format, theme, image, or text changes
  useEffect(() => {
    drawBanner();
  }, [activeFormat, themeStyle, uploadedImage, activeStockUrl, content, journalName, impactFactor, impactLabel, casZone]);

  const drawBanner = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 1200;
    let height = 628;

    if (activeFormat === 'landscape') {
      width = 1200;
      height = 628;
    } else if (activeFormat === 'square') {
      width = 1200;
      height = 1200;
    } else if (activeFormat === 'rect300x250') {
      width = 600; // 2x density for 300x250
      height = 500;
    } else if (activeFormat === 'leaderboard728x90') {
      width = 1456; // 2x density for 728x90
      height = 180;
    } else if (activeFormat === 'skyscraper160x600') {
      width = 320; // 2x density for 160x600
      height = 1200;
    }

    canvas.width = width;
    canvas.height = height;

    const bgSource = uploadedImage || activeStockUrl;

    if (bgSource) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Draw background image scaled cover
        drawImageProp(ctx, img, 0, 0, width, height);

        // Dark gradient scrim for high readability
        const overlayGrad = ctx.createLinearGradient(0, 0, width, height);
        overlayGrad.addColorStop(0, 'rgba(0, 20, 50, 0.88)');
        overlayGrad.addColorStop(0.65, 'rgba(0, 35, 80, 0.78)');
        overlayGrad.addColorStop(1, 'rgba(0, 15, 40, 0.90)');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, width, height);

        renderBannerContent(ctx, width, height, activeFormat);
      };
      img.onerror = () => {
        drawFallbackGradient(ctx, width, height);
        renderBannerContent(ctx, width, height, activeFormat);
      };
      img.src = bgSource;
    } else {
      drawFallbackGradient(ctx, width, height);
      renderBannerContent(ctx, width, height, activeFormat);
    }
  };

  const drawFallbackGradient = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, currentTheme.bgStart);
    grad.addColorStop(1, currentTheme.bgEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle geometric scientific lattice
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(width - 150 + i * 20, height / 2, 80 + i * 45, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // Helper to cover-fit image into canvas
  function drawImageProp(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    const imgRatio = img.width / img.height;
    const canvasRatio = w / h;
    let sWidth = img.width;
    let sHeight = img.height;
    let sx = 0;
    let sy = 0;

    if (imgRatio > canvasRatio) {
      sWidth = img.height * canvasRatio;
      sx = (img.width - sWidth) / 2;
    } else {
      sHeight = img.width / canvasRatio;
      sy = (img.height - sHeight) / 2;
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  }

  const renderBannerContent = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    format: BannerFormat
  ) => {
    ctx.textAlign = 'left';

    if (format === 'landscape') {
      // 1.91:1 Landscape (1200 x 628)
      // Top Publisher Tag
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(publisher.toUpperCase(), 70, 80);

      // Journal Name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(journalName, 70, 145);

      drawBadge(ctx, 70, 185, badgeLabel, '#fbbf24', '#78350f', 22);
      drawBadge(ctx, 430, 185, casZone || '', '#a5b4fc', '#312e81', 22);

      // Headline
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      wrapText(ctx, content.longHeadline || 'Accelerate Your Scientific Discovery', 70, 280, 750, 44);

      // Chinese Subtitle for Greater China researchers
      if (content.bannerHeadlineZh) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(content.bannerHeadlineZh, 70, 400);
      }

      // CTA Button
      const ctaBtnText = content.ctaText || 'Submit Paper';
      drawButton(ctx, 70, 485, 250, 64, ctaBtnText, currentTheme.accent, '#001a3d');

      // Journal Cover / Scientific Seal on Right
      drawJournalCoverMock(ctx, width - 290, 120, 210, 290, journalName, impactFactor);
    } else if (format === 'square') {
      // 1:1 Square (1200 x 1200)
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(publisher.toUpperCase(), 80, 120);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(journalName, 80, 200);

      drawBadge(ctx, 80, 250, badgeLabel, '#fbbf24', '#78350f', 32);
      drawBadge(ctx, 420, 250, casZone || '', '#a5b4fc', '#312e81', 32);

      // Journal Cover in Center
      drawJournalCoverMock(ctx, 420, 360, 360, 460, journalName, impactFactor);

      // Headline
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(content.shortHeadline || `${journalName} Submissions`, width / 2, 900);

      if (content.bannerHeadlineZh) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(content.bannerHeadlineZh, width / 2, 960);
      }

      drawButton(ctx, width / 2 - 160, 1020, 320, 80, content.ctaText || 'Submit Paper', currentTheme.accent, '#001a3d');
      ctx.textAlign = 'left';
    } else if (format === 'rect300x250') {
      // 300x250 Medium Rectangle (drawn at 600x500)
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(publisher.toUpperCase(), 35, 45);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(journalName.slice(0, 18), 35, 95);

      drawBadge(ctx, 35, 120, badgeLabel, '#fbbf24', '#78350f', 18);
      drawBadge(ctx, 280, 120, casZone || '', '#a5b4fc', '#312e81', 18);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px sans-serif';
      wrapText(ctx, content.shortHeadline || 'Submit Manuscript', 35, 200, 530, 32);

      if (content.bannerHeadlineZh) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '18px sans-serif';
        ctx.fillText(content.bannerHeadlineZh.slice(0, 24), 35, 290);
      }

      drawButton(ctx, 35, 360, 240, 60, content.ctaText || 'Submit Paper', currentTheme.accent, '#001a3d');
    } else if (format === 'leaderboard728x90') {
      // 728x90 Leaderboard (drawn at 1456x180)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(journalName, 50, 75);

      ctx.fillStyle = '#93c5fd';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Official ${publisher} · ${content.shortHeadline || 'Open for Papers'}`, 50, 130);

      drawBadge(ctx, 750, 45, badgeLabel, '#fbbf24', '#78350f', 24);
      drawBadge(ctx, 750, 105, casZone || '', '#a5b4fc', '#312e81', 20);

      drawButton(ctx, 1140, 50, 260, 75, content.ctaText || 'Submit Paper', currentTheme.accent, '#001a3d');
    } else if (format === 'skyscraper160x600') {
      // 160x600 Skyscraper (drawn at 320x1200)
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(publisher.toUpperCase(), 25, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      wrapText(ctx, journalName, 25, 120, 270, 42);

      drawBadge(ctx, 25, 220, badgeLabel, '#fbbf24', '#78350f', 24);
      drawBadge(ctx, 160, 220, casZone ? casZone.slice(0, 6) : '', '#a5b4fc', '#312e81', 20);

      drawJournalCoverMock(ctx, 45, 300, 230, 310, journalName, impactFactor);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 26px sans-serif';
      wrapText(ctx, content.shortHeadline || 'Submit Manuscript Today', 25, 690, 270, 36);

      if (content.bannerHeadlineZh) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '20px sans-serif';
        wrapText(ctx, content.bannerHeadlineZh, 25, 830, 270, 30);
      }

      drawButton(ctx, 25, 1040, 270, 70, content.ctaText || 'Submit Paper', currentTheme.accent, '#001a3d');
    }
  };

  const drawBadge = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    bgColor: string,
    textColor: string,
    fontSize = 20
  ) => {
    if (!text || /\b(?:null|undefined)\b/i.test(text)) return;
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const paddingX = 18;
    const height = fontSize + 16;

    ctx.fillStyle = bgColor;
    roundRect(ctx, x, y, textWidth + paddingX * 2, height, 8);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.fillText(text, x + paddingX, y + fontSize + 3);
  };

  const drawButton = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    bg: string,
    fg: string
  ) => {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.fillStyle = fg;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 + 8);
    ctx.textAlign = 'left';
  };

  const drawJournalCoverMock = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    ifValue: number | null
  ) => {
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    roundRect(ctx, x + 8, y + 10, w, h, 10);
    ctx.fill();

    // Cover page
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();

    // Top spine accent
    ctx.fillStyle = '#002d62';
    ctx.fillRect(x, y, w, h * 0.28);

    // Title on cover
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name.slice(0, 16), x + w / 2, y + 42);

    // Mini scientific illustration
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(x + 15, y + h * 0.32, w - 30, h * 0.45);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.54, 38, 0, Math.PI * 2);
    ctx.stroke();

    // IF Badge on cover
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 16px sans-serif';
    if (ifValue != null) ctx.fillText(`IF ${ifValue}`, x + w / 2, y + h * 0.90);
    ctx.textAlign = 'left';
  };

  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setUploadedImage(dataUrl);
        if (onUpdateContent) {
          onUpdateContent({ ...content, customBannerImage: dataUrl });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectStock = (stock: typeof ACADEMIC_STOCK_LIBRARY[0]) => {
    setSelectedStockId(stock.id);
    setActiveStockUrl(stock.url);
    setUploadedImage(null);
  };

  const handleDownloadBanner = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsExporting(true);

    const filename = `${journalName.toLowerCase().replace(/\s+/g, '-')}-${activeFormat}-gdn-banner.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    setTimeout(() => setIsExporting(false), 800);
  };

  return (
    <div className="space-y-6">
      {/* 1. Explanatory Header: What Is Needed To Create Google Display Ad Images */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-blue-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Info className="w-4 h-4 text-blue-600" />
            <span>Google Display Ads (RDA) Image Requirements &amp; Marketer Guidelines</span>
          </span>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1"
          >
            <span>{showGuide ? 'Hide Specifications' : 'View Full Image Specifications'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition ${showGuide ? 'rotate-90' : ''}`} />
          </button>
        </div>

        <p className="text-slate-600 leading-relaxed text-[11px]">
          To launch Google Responsive Display Ads (RDA), advertisers must provide high-quality visual assets. You can use visuals from the landing page, pick from the curated Adobe Express stock library below, or upload custom banner assets from your PPT guideline slides.
        </p>

        {showGuide && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-blue-200/70 text-[11px]">
            <div className="p-2.5 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <span className="font-bold text-slate-800 block">1. Core Image Ratios</span>
              <ul className="text-slate-600 space-y-0.5 list-disc pl-3">
                <li><strong>Landscape (1.91:1):</strong> 1200×628 px (min 600×314 px, max 5MB)</li>
                <li><strong>Square (1:1):</strong> 1200×1200 px (min 300×300 px, max 5MB)</li>
                <li><strong>Medium Rect:</strong> 300×250 px (web GDN)</li>
              </ul>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <span className="font-bold text-slate-800 block">2. Google Policy Rules</span>
              <ul className="text-slate-600 space-y-0.5 list-disc pl-3">
                <li><strong>Text &lt; 20%:</strong> Keep text minimal on background photos</li>
                <li><strong>No Clutter:</strong> Clean, high-impact scholarly focus</li>
                <li><strong>Logos:</strong> 1:1 square &amp; 4:1 landscape transparent PNG</li>
              </ul>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-blue-100 shadow-2xs space-y-1">
              <span className="font-bold text-slate-800 block">3. Academic Branding</span>
              <ul className="text-slate-600 space-y-0.5 list-disc pl-3">
                <li><strong>IF badge:</strong> Drawn only when a trusted impact factor is available</li>
                <li><strong>Brand Colors:</strong> Springer Deep Navy (#002d62)</li>
                <li><strong>CTA Button:</strong> "Submit Paper" or "View CFP"</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 2. Format Selector & Theme Palette Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
        {/* Format Selector */}
        <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
          {[
            { id: 'landscape', label: '1.91:1 Landscape (1200×628)' },
            { id: 'square', label: '1:1 Square (1200×1200)' },
            { id: 'rect300x250', label: '300×250 Medium Rect' },
            { id: 'leaderboard728x90', label: '728×90 Leaderboard' },
            { id: 'skyscraper160x600', label: '160×600 Skyscraper' },
          ].map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => setActiveFormat(fmt.id as BannerFormat)}
              className={`px-2.5 py-1.5 rounded-md font-semibold transition text-xs ${
                activeFormat === fmt.id
                  ? 'bg-[#002d62] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {fmt.label}
            </button>
          ))}
        </div>

        {/* Color Palette Themes */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">Palette:</span>
          {(['navy', 'emerald', 'cobalt', 'crimson'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setThemeStyle(t)}
              className={`w-6 h-6 rounded-full border-2 transition ${
                themeStyle === t ? 'border-blue-600 scale-110 shadow-sm' : 'border-transparent'
              }`}
              style={{ backgroundColor: themeColors[t].bgEnd }}
              title={`${t} theme`}
            />
          ))}
        </div>
      </div>

      {/* 3. Adobe Express Stock & PPT Upload Bar */}
      <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5 text-blue-600" />
            <span>Academic Stock Image Library (Adobe Express / Scientific Disciplines):</span>
          </span>

          {/* Upload Stock Image / PPT visual */}
          <label className="cursor-pointer px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition shrink-0">
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>{uploadedImage ? 'Replace Custom Image / PPT Slide' : 'Upload Image (Adobe Express / PPT)'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Stock Thumbnails */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 pt-1">
          {ACADEMIC_STOCK_LIBRARY.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectStock(item)}
              className={`relative rounded-lg overflow-hidden border-2 text-left transition group ${
                selectedStockId === item.id && !uploadedImage
                  ? 'border-blue-600 shadow-md ring-2 ring-blue-400'
                  : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
              }`}
            >
              <img
                src={item.url}
                alt={item.name}
                className="w-full h-12 object-cover group-hover:scale-105 transition"
              />
              <div className="p-1 bg-white/95 text-[10px] font-semibold text-slate-800 truncate">
                {item.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Live Canvas Banner Presentation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span>Live Rendered Academic Display Banner ({activeFormat})</span>
          </span>

          <button
            onClick={handleDownloadBanner}
            disabled={isExporting}
            className="px-4 py-2 bg-[#002d62] hover:bg-[#00224a] text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isExporting ? 'Generating PNG...' : `Download ${activeFormat} Banner PNG`}
            </span>
          </button>
        </div>

        {/* Visual Preview Container */}
        <div className="p-4 bg-slate-900/5 rounded-2xl border border-slate-200 flex items-center justify-center overflow-x-auto min-h-[300px]">
          <canvas
            ref={canvasRef}
            className={`rounded-xl shadow-lg border border-slate-200 transition-all ${
              activeFormat === 'landscape'
                ? 'w-full max-w-2xl aspect-[1.91/1]'
                : activeFormat === 'square'
                ? 'w-full max-w-md aspect-square'
                : activeFormat === 'rect300x250'
                ? 'w-[300px] h-[250px]'
                : activeFormat === 'leaderboard728x90'
                ? 'w-[728px] h-[90px]'
                : 'w-[160px] h-[600px]'
            }`}
          />
        </div>

        {uploadedImage && (
          <div className="flex items-center justify-between text-xs text-slate-500 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
            <span className="text-emerald-800 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Custom image / PPT slide visual applied successfully</span>
            </span>
            <button
              onClick={() => {
                setUploadedImage(null);
                if (onUpdateContent) onUpdateContent({ ...content, customBannerImage: undefined });
              }}
              className="text-xs text-rose-600 hover:underline font-semibold"
            >
              Reset to Curated Academic Stock
            </button>
          </div>
        )}
      </div>

      {/* 5. Display Ad Copy Specifications (Short/Long Headlines & Description) */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Short Headline */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 uppercase">Short Headline (Strict Max 30 Chars)</span>
            <span className="font-mono text-[10px] px-2 py-0.2 rounded font-bold bg-white text-slate-700 border border-slate-200">
              {content.shortHeadline.length}/30
            </span>
          </div>
          <div className="text-xs text-slate-900 font-medium p-2 bg-white rounded-lg border border-slate-200">
            {content.shortHeadline}
          </div>
        </div>

        {/* Long Headline */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 uppercase">Long Headline (Strict Max 90 Chars)</span>
            <span className="font-mono text-[10px] px-2 py-0.2 rounded font-bold bg-white text-slate-700 border border-slate-200">
              {content.longHeadline.length}/90
            </span>
          </div>
          <div className="text-xs text-slate-900 font-medium p-2 bg-white rounded-lg border border-slate-200">
            {content.longHeadline}
          </div>
        </div>
      </div>

      {/* Description & Chinese Hook */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-700 uppercase">Ad Description (Strict Max 90 Chars)</span>
          <span className="font-mono text-[10px] px-2 py-0.2 rounded font-bold bg-white text-slate-700 border border-slate-200">
            {content.description.length}/90
          </span>
        </div>
        <p className="text-slate-800 font-medium bg-white p-2.5 rounded-lg border border-slate-200">
          {content.description}
        </p>

        {content.bannerHeadlineZh && (
          <div className="pt-1">
            <span className="text-[11px] font-semibold text-blue-900 block mb-1">
              Greater China Bilingual Placement Copy:
            </span>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-md font-medium inline-block">
              {content.bannerHeadlineZh}
            </span>
          </div>
        )}
      </div>

      {/* 6. Target Academic Placements */}
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span>Recommended GDN Managed Academic Placements</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {content.targetPlacements.map((plc, idx) => (
            <span
              key={idx}
              className="text-xs px-2.5 py-1 rounded-md bg-white text-slate-700 border border-slate-200 shadow-2xs font-medium"
            >
              {plc}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
