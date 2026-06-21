/**
 * app.js — Core Application Logic (Redesigned)
 *
 * Section-based study notes, per-section PDF toggle, KaTeX math,
 * interactive visualizations, insights panel.
 */

import { generateInsights, enhanceSection, AIError } from './ai-handler.js';
import { createVisualization } from './visualizer.js';

/* ══════════════════════════════════════════════
   Constants & State
   ══════════════════════════════════════════════ */
const STORAGE_KEY_API = 'gemini_api_key';
const STORAGE_KEY_CACHE = 'insights_cache_v2';
const PDF_WORKER_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let config = null;
let currentCourse = null;
let currentDoc = null;
let currentPdfDoc = null;
let extractedText = '';
let currentData = null;       // Current generated notes data
let activeVisualizers = [];   // Track active viz instances for cleanup
let mermaidCounter = 0;

/* ══════════════════════════════════════════════
   DOM
   ══════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dom = {
  homescreen: $('homescreen'),
  workspace: $('workspace'),
  courseGrid: $('course-grid'),
  workspaceTitle: $('workspace-title'),
  docList: $('document-list'),
  menuToggle: $('menu-toggle-btn'),
  sidebarNav: $('sidebar-nav'),
  textSettingsBtn: $('text-settings-btn'),
  textSettingsDropdown: $('reading-settings-dropdown'),
  workspaceContent: $('workspace-content'),
  generateBtn: $('generate-btn'),
  cacheIndicator: $('cache-indicator'),
  skeletonLoader: $('skeleton-loader'),
  loadingStatus: $('loading-status'),
  emptyState: $('empty-state'),
  overviewSection: $('overview-section'),
  mindmapSection: $('mindmap-section'),
  mindmapContent: $('mindmap-content'),
  sectionsContainer: $('sections-container'),
  imagesSection: $('images-section'),
  imagesContent: $('images-content'),
  // Insights
  insightsPanel: $('insights-panel'),
  insightsBackdrop: $('insights-backdrop'),
  insightsLoading: $('insights-loading'),
  insightsBody: $('insights-body'),
  // Settings
  settingsOverlay: $('settings-overlay'),
  apiKeyInput: $('api-key-input'),
  keyStatus: $('key-status'),
  // Lightbox
  lightbox: $('lightbox'),
  lightboxImg: $('lightbox-img'),
};

/* ══════════════════════════════════════════════
   Init
   ══════════════════════════════════════════════ */
async function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

  marked.setOptions({
    gfm: true, breaks: false,
    highlight: (code, lang) => {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    }
  });

  mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { curve: 'basis', padding: 12 }, securityLevel: 'loose' });

  try {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    config = await res.json();
  } catch (e) {
    toast('Failed to load config.json', 'error');
    return;
  }

  bindEvents();
  loadReadingSettings();
  const savedKey = localStorage.getItem(STORAGE_KEY_API);
  if (savedKey) dom.apiKeyInput.value = savedKey;
  renderHomescreen();
}

/* ══════════════════════════════════════════════
   Events
   ══════════════════════════════════════════════ */
function bindEvents() {
  document.querySelectorAll('.settings-trigger').forEach(b => b.addEventListener('click', () => toggleSettings(true)));
  $('settings-close').addEventListener('click', () => toggleSettings(false));
  dom.settingsOverlay.addEventListener('click', e => { if (e.target === dom.settingsOverlay) toggleSettings(false); });
  $('toggle-key-vis').addEventListener('click', () => { dom.apiKeyInput.type = dom.apiKeyInput.type === 'password' ? 'text' : 'password'; });
  $('save-key-btn').addEventListener('click', saveApiKey);
  $('clear-key-btn').addEventListener('click', clearApiKey);
  $('back-btn').addEventListener('click', goHome);
  dom.generateBtn.addEventListener('click', onGenerate);
  $('close-insights').addEventListener('click', closeInsights);
  dom.insightsBackdrop.addEventListener('click', closeInsights);
  dom.lightbox.addEventListener('click', () => dom.lightbox.classList.add('hidden'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { toggleSettings(false); closeInsights(); dom.lightbox.classList.add('hidden'); toggleTextSettings(false); } });

  // Mobile menu TOC toggle
  dom.menuToggle.addEventListener('click', () => {
    dom.sidebarNav.classList.toggle('open');
  });

  // Reading Settings toggle
  dom.textSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.textSettingsDropdown.classList.toggle('hidden');
  });

  // Close dropdowns on outside clicks
  document.addEventListener('click', (e) => {
    if (!dom.textSettingsDropdown.classList.contains('hidden') && !dom.textSettingsDropdown.contains(e.target) && e.target !== dom.textSettingsBtn) {
      dom.textSettingsDropdown.classList.add('hidden');
    }
    if (dom.sidebarNav.classList.contains('open') && !dom.sidebarNav.contains(e.target) && !dom.menuToggle.contains(e.target)) {
      dom.sidebarNav.classList.remove('open');
    }
  });

  // Intercept PDF page citation links
  dom.workspaceContent.addEventListener('click', async (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href.startsWith('pdf-page://')) {
      e.preventDefault();
      const pageNum = parseInt(href.substring('pdf-page://'.length), 10);
      if (isNaN(pageNum)) return;

      // Find which section card this link belongs to
      const card = a.closest('.section-card');
      if (!card) return;

      // Find the pdf toggle button in this card
      const pdfBtn = card.querySelector('.pdf-toggle-btn');
      if (!pdfBtn) return;

      const pagesStr = pdfBtn.dataset.pages || '';
      const pages = pagesStr.split(',').map(p => parseInt(p, 10)).filter(p => !isNaN(p));

      // Expand the PDF section if not already expanded
      const wrap = card.querySelector('.section-pdf-wrap');
      if (!wrap.classList.contains('expanded')) {
        await toggleSectionPdf(card, pages, pdfBtn);
      }

      // Scroll to the page element
      const pageDiv = wrap.querySelector(`.section-pdf-page[data-page-num="${pageNum}"]`);
      if (pageDiv) {
        pageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pageDiv.classList.remove('highlight-flash');
        // Trigger reflow to restart animation if clicked again
        void pageDiv.offsetWidth;
        pageDiv.classList.add('highlight-flash');
      }
    }
  });

  // Bind dropdown option clicks
  bindReadingSettingsEvents();
}

/* ══════════════════════════════════════════════
   Reading Settings Helper Functions
   ══════════════════════════════════════════════ */
let readingSettings = {
  font: 'sans',
  size: 16,
  width: 'wide'
};

function loadReadingSettings() {
  const savedFont = localStorage.getItem('reading_font_family') || 'sans';
  let savedSize = localStorage.getItem('reading_font_size') || '16';
  const savedWidth = localStorage.getItem('reading_layout_width') || 'wide';

  // Map legacy string sizes if present
  if (isNaN(savedSize)) {
    const sizeMap = { 'small': 13, 'medium': 16, 'large': 19, 'xlarge': 22 };
    savedSize = sizeMap[savedSize] || 16;
  } else {
    savedSize = parseInt(savedSize, 10);
  }

  readingSettings = { font: savedFont, size: savedSize, width: savedWidth };
  applyReadingSettings();
}

function applyReadingSettings() {
  // Reset classes
  dom.workspaceContent.classList.remove('font-sans', 'font-serif', 'font-mono');
  dom.workspaceContent.classList.remove('layout-wide', 'layout-reading');

  // Apply new classes & custom font size
  dom.workspaceContent.classList.add(`font-${readingSettings.font}`);
  dom.workspaceContent.classList.add(`layout-${readingSettings.width}`);
  dom.workspaceContent.style.fontSize = `${readingSettings.size}px`;

  // Update active buttons in dropdown
  dom.textSettingsDropdown.querySelectorAll('.font-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.font === readingSettings.font);
  });
  
  // Update slider input and label value
  const slider = $('font-size-slider');
  const valLabel = $('font-size-val');
  if (slider) slider.value = readingSettings.size;
  if (valLabel) valLabel.textContent = `${readingSettings.size}px`;

  dom.textSettingsDropdown.querySelectorAll('.width-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.width === readingSettings.width);
  });
}

function bindReadingSettingsEvents() {
  dom.textSettingsDropdown.querySelectorAll('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      readingSettings.font = btn.dataset.font;
      localStorage.setItem('reading_font_family', readingSettings.font);
      applyReadingSettings();
    });
  });

  // Slider change event
  const slider = $('font-size-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      readingSettings.size = parseInt(e.target.value, 10);
      localStorage.setItem('reading_font_size', readingSettings.size);
      applyReadingSettings();
    });
  }

  dom.textSettingsDropdown.querySelectorAll('.width-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      readingSettings.width = btn.dataset.width;
      localStorage.setItem('reading_layout_width', readingSettings.width);
      applyReadingSettings();
    });
  });
}

function toggleTextSettings(show) {
  if (show === undefined) dom.textSettingsDropdown.classList.toggle('hidden');
  else if (show) dom.textSettingsDropdown.classList.remove('hidden');
  else dom.textSettingsDropdown.classList.add('hidden');
}

/* ══════════════════════════════════════════════
   Router
   ══════════════════════════════════════════════ */
function showScreen(id) { dom.homescreen.classList.add('hidden'); dom.workspace.classList.add('hidden'); $(id).classList.remove('hidden'); }
function goHome() { cleanupVisualizers(); currentCourse = null; currentDoc = null; currentPdfDoc = null; extractedText = ''; currentData = null; showScreen('homescreen'); }

/* ══════════════════════════════════════════════
   Homescreen
   ══════════════════════════════════════════════ */
function renderHomescreen() {
  dom.courseGrid.innerHTML = '';
  if (!config?.courses?.length) { dom.courseGrid.innerHTML = '<p style="color:#aaa;text-align:center;grid-column:1/-1;padding:40px">No courses in config.json</p>'; return; }
  config.courses.forEach(course => {
    const card = document.createElement('article');
    card.className = 'course-card'; card.tabIndex = 0;
    card.innerHTML = `
      <div class="course-card-accent" style="background:${course.accent || '#5B6EE1'}"></div>
      <div class="course-card-body">
        <span class="course-semester">${esc(course.semester || '')}</span>
        <h2 class="course-name">${esc(course.name)}</h2>
        <span class="course-code">${esc(course.code || '')}</span>
        <span class="course-doc-count">${course.documents.length} document${course.documents.length !== 1 ? 's' : ''}</span>
      </div>`;
    card.addEventListener('click', () => enterWorkspace(course));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') enterWorkspace(course); });
    dom.courseGrid.appendChild(card);
  });
}

/* ══════════════════════════════════════════════
   Workspace
   ══════════════════════════════════════════════ */
function enterWorkspace(course) {
  currentCourse = course;
  dom.workspaceTitle.textContent = course.name;
  renderDocList(course.documents);
  showScreen('workspace');
  if (course.documents.length > 0) loadDocument(course.documents[0]);
}

function renderDocList(docs) {
  dom.docList.innerHTML = '';
  docs.forEach(doc => {
    const btn = document.createElement('button');
    btn.className = 'doc-item-btn'; btn.dataset.docId = doc.id;
    btn.innerHTML = `${esc(doc.title)}<span class="doc-item-type">${esc(doc.type || '')}</span>`;
    btn.addEventListener('click', () => loadDocument(doc));
    dom.docList.appendChild(btn);
  });
}

async function loadDocument(doc) {
  currentDoc = doc;
  extractedText = '';
  currentData = null;

  // Close mobile sidebar drawer
  dom.sidebarNav.classList.remove('open');

  dom.docList.querySelectorAll('.doc-item-btn').forEach(t => t.classList.remove('active'));
  const tab = dom.docList.querySelector(`[data-doc-id="${doc.id}"]`);
  if (tab) tab.classList.add('active');

  dom.generateBtn.disabled = false;
  resetUI();

  // Load PDF in background
  try {
    currentPdfDoc = await pdfjsLib.getDocument(doc.path).promise;
  } catch (e) {
    toast('Failed to load PDF: ' + e.message, 'error');
    currentPdfDoc = null;
  }

  // Check cache
  const cached = getCache(doc.id);
  if (cached) {
    currentData = cached;
    renderNotes(cached);
    dom.cacheIndicator.classList.remove('hidden');
    dom.generateBtn.innerHTML = svgStar() + 'Regenerate Notes';
  } else if (doc.preGeneratedNotes) {
    setStatus('Loading pre-generated notes…');
    try {
      const res = await fetch(doc.preGeneratedNotes);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCache(doc.id, data);
      currentData = data;
      clearStatus();
      renderNotes(data);
      dom.cacheIndicator.classList.remove('hidden');
      dom.generateBtn.innerHTML = svgStar() + 'Regenerate Notes';
      toast('Loaded pre-generated notes.', 'success');
    } catch (e) {
      console.warn('Failed to load preloaded notes:', e);
      clearStatus();
      dom.cacheIndicator.classList.add('hidden');
      dom.generateBtn.innerHTML = svgStar() + 'Generate Notes';
    }
  } else {
    dom.cacheIndicator.classList.add('hidden');
    dom.generateBtn.innerHTML = svgStar() + 'Generate Notes';
  }

  // Extract images (non-blocking)
  extractImages();
}

/* ══════════════════════════════════════════════
   PDF Text Extraction
   ══════════════════════════════════════════════ */
async function extractText() {
  if (extractedText) return extractedText;
  if (!currentPdfDoc) throw new Error('No PDF loaded');
  setStatus('Extracting text from PDF…');
  const pages = [];
  for (let i = 1; i <= currentPdfDoc.numPages; i++) {
    const page = await currentPdfDoc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  extractedText = pages.join('\n\n');
  return extractedText;
}

/* ══════════════════════════════════════════════
   PDF Image Extraction
   ══════════════════════════════════════════════ */
async function extractImages() {
  if (!currentPdfDoc) return;
  const images = [];
  for (let i = 1; i <= currentPdfDoc.numPages; i++) {
    try {
      const page = await currentPdfDoc.getPage(i);
      const ops = await page.getOperatorList();
      for (let j = 0; j < ops.fnArray.length; j++) {
        if (ops.fnArray[j] !== pdfjsLib.OPS.paintImageXObject && ops.fnArray[j] !== pdfjsLib.OPS.paintJpegXObject) continue;
        try {
          const imgData = await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject('timeout'), 3000);
            page.objs.get(ops.argsArray[j][0], d => { clearTimeout(t); resolve(d); });
          });
          if (!imgData) continue;
          const canvas = document.createElement('canvas');
          if (imgData instanceof HTMLImageElement || imgData.src) {
            canvas.width = imgData.naturalWidth || imgData.width;
            canvas.height = imgData.naturalHeight || imgData.height;
            if (canvas.width < 40 || canvas.height < 40) continue;
            canvas.getContext('2d').drawImage(imgData, 0, 0);
          } else if (imgData.data && imgData.width && imgData.height) {
            if (imgData.width < 40 || imgData.height < 40) continue;
            canvas.width = imgData.width; canvas.height = imgData.height;
            let rgba;
            if (imgData.data.length === imgData.width * imgData.height * 4) { rgba = new Uint8ClampedArray(imgData.data); }
            else if (imgData.data.length === imgData.width * imgData.height * 3) {
              rgba = new Uint8ClampedArray(imgData.width * imgData.height * 4);
              for (let p = 0, q = 0; p < imgData.data.length; p += 3, q += 4) { rgba[q]=imgData.data[p]; rgba[q+1]=imgData.data[p+1]; rgba[q+2]=imgData.data[p+2]; rgba[q+3]=255; }
            } else continue;
            canvas.getContext('2d').putImageData(new ImageData(rgba, imgData.width, imgData.height), 0, 0);
          } else continue;
          images.push(canvas);
        } catch (_) {}
      }
    } catch (_) {}
  }

  if (images.length > 0) {
    dom.imagesContent.innerHTML = '';
    images.forEach((c, i) => {
      const w = document.createElement('div'); w.className = 'image-gallery-item';
      const img = document.createElement('img'); img.src = c.toDataURL('image/png'); img.alt = `Image ${i+1}`; img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(img.src));
      w.appendChild(img); dom.imagesContent.appendChild(w);
    });
    dom.imagesSection.classList.remove('hidden');
  } else {
    dom.imagesContent.innerHTML = '<p class="image-gallery-empty">No images found in this PDF.</p>';
    dom.imagesSection.classList.remove('hidden');
  }
}

function openLightbox(src) { dom.lightboxImg.src = src; dom.lightbox.classList.remove('hidden'); }

/* ══════════════════════════════════════════════
   Generate Notes (AI Pipeline)
   ══════════════════════════════════════════════ */
async function onGenerate() {
  const apiKey = localStorage.getItem(STORAGE_KEY_API);
  if (!apiKey) { toast('Add your Gemini API key in Settings first.', 'error'); toggleSettings(true); return; }
  if (!currentPdfDoc || !currentDoc) return;

  dom.generateBtn.disabled = true;
  dom.emptyState.classList.add('hidden');
  dom.skeletonLoader.classList.remove('hidden');
  hideAllSections();

  try {
    setStatus('Extracting text from PDF…');
    const text = await extractText();
    setStatus('Sending to Gemini — this may take 30–90 seconds…');
    const data = await generateInsights(text, apiKey);
    setCache(currentDoc.id, data);
    currentData = data;
    clearStatus();
    renderNotes(data);
    dom.cacheIndicator.classList.remove('hidden');
    dom.generateBtn.innerHTML = svgStar() + 'Regenerate Notes';
    toast('Notes generated successfully.', 'success');
  } catch (e) {
    clearStatus();
    dom.skeletonLoader.classList.add('hidden');
    dom.emptyState.classList.remove('hidden');
    toast(e instanceof AIError ? e.message : 'Error: ' + e.message, 'error');
    console.error('Generate error:', e);
  } finally {
    dom.generateBtn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   Render Notes — Section by Section
   ══════════════════════════════════════════════ */
function renderNotes(data) {
  cleanupVisualizers();
  dom.skeletonLoader.classList.add('hidden');
  dom.emptyState.classList.add('hidden');

  // Overview
  if (data.overview) {
    dom.overviewSection.innerHTML = renderMathMarkdown(data.overview);
    dom.overviewSection.classList.remove('hidden');
  }

  // Mind Map
  if (data.mindMap) renderMindMap(data.mindMap);

  // Sections
  dom.sectionsContainer.innerHTML = '';
  if (data.sections?.length) {
    data.sections.forEach((section, idx) => {
      const card = createSectionCard(section, idx);
      dom.sectionsContainer.appendChild(card);
    });
  }
}

function createSectionCard(section, idx) {
  const card = document.createElement('article');
  card.className = 'section-card';
  card.dataset.sectionIdx = idx;

  const pages = section.pdfPages || [];
  const pageRef = pages.length
    ? `p. ${pages[0]}${pages.length > 1 ? '–' + pages[pages.length - 1] : ''}`
    : '';

  // Header
  const head = document.createElement('header');
  head.className = 'section-card-head';
  head.innerHTML = `
    <h2 class="section-title">${idx + 1}. ${esc(section.title)}</h2>
    <div class="section-head-actions">
      ${pageRef ? `<button class="pdf-toggle-btn" data-pages="${pages.join(',')}">View PDF (${pageRef})</button>` : ''}
      <button class="section-enhance-btn" data-idx="${idx}">Enhance Section</button>
    </div>`;
  card.appendChild(head);

  // PDF wrap (collapsed)
  const pdfWrap = document.createElement('div');
  pdfWrap.className = 'section-pdf-wrap';
  pdfWrap.innerHTML = '<div class="section-pdf-pages"></div>';
  card.appendChild(pdfWrap);

  // Body
  const body = document.createElement('div');
  body.className = 'section-body';

  // Content (markdown + KaTeX)
  const contentDiv = document.createElement('div');
  contentDiv.className = 'section-content';
  contentDiv.innerHTML = renderMathMarkdown(section.content || '');
  body.appendChild(contentDiv);

  // Equations block
  if (section.equations?.length) {
    const eqBlock = document.createElement('div');
    eqBlock.className = 'equations-block';
    eqBlock.innerHTML = `<div class="equations-title">Key Equations</div>`;
    section.equations.forEach(eq => {
      const row = document.createElement('div');
      row.className = 'equation-row';
      row.innerHTML = `<span class="equation-label">${esc(eq.label)}</span><div class="equation-math"></div>`;
      const mathEl = row.querySelector('.equation-math');
      try { katex.render(eq.latex, mathEl, { displayMode: true, throwOnError: false }); }
      catch (_) { mathEl.textContent = eq.latex; }
      eqBlock.appendChild(row);
    });
    body.appendChild(eqBlock);
  }

  // Citation
  if (pageRef && currentDoc) {
    const cite = document.createElement('div');
    cite.className = 'section-citation';
    cite.innerHTML = `Source: <strong>${esc(currentDoc.title)}</strong>, Pages ${pages.join(', ')}`;
    body.appendChild(cite);
  }

  card.appendChild(body);

  // Visualization
  if (section.visualization) {
    const vizWrap = document.createElement('div');
    vizWrap.className = 'section-viz-wrap';

    const vizTitle = section.visualization.title || 'Interactive Visualization';
    const vizDesc = section.visualization.description || '';

    vizWrap.innerHTML = `
      <div class="viz-head"><h3>${esc(vizTitle)}</h3></div>
      <div class="viz-canvas-wrap"><canvas class="viz-canvas"></canvas></div>
      ${vizDesc ? `<p class="viz-hint">Hint: ${esc(vizDesc)}</p>` : ''}`;

    card.appendChild(vizWrap);

    // Initialize viz after DOM insertion (need dimensions)
    requestAnimationFrame(() => {
      const canvas = vizWrap.querySelector('.viz-canvas');
      if (canvas) {
        try {
          const viz = createVisualization(canvas, section.visualization);
          if (viz) {
            activeVisualizers.push(viz);
            const controls = viz.getControls?.();
            if (controls) vizWrap.appendChild(controls);
          }
        } catch (e) { console.warn('Viz init failed:', e); }
      }
    });
  }

  // Bind PDF toggle
  const pdfBtn = head.querySelector('.pdf-toggle-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => toggleSectionPdf(card, pages, pdfBtn));

  // Bind enhance
  const enhBtn = head.querySelector('.section-enhance-btn');
  if (enhBtn) enhBtn.addEventListener('click', () => onEnhanceSection(idx));

  return card;
}

/* ══════════════════════════════════════════════
   Per-Section PDF Toggle
   ══════════════════════════════════════════════ */
async function toggleSectionPdf(card, pages, btn) {
  const wrap = card.querySelector('.section-pdf-wrap');
  const pagesEl = card.querySelector('.section-pdf-pages');

  if (wrap.classList.contains('expanded')) {
    wrap.classList.remove('expanded');
    btn.classList.remove('active');
    return;
  }

  if (!currentPdfDoc) { toast('PDF not loaded.', 'error'); return; }

  btn.classList.add('active');
  wrap.classList.add('expanded');
  pagesEl.innerHTML = '';

  for (const pageNum of pages) {
    if (pageNum < 1 || pageNum > currentPdfDoc.numPages) continue;
    try {
      const page = await currentPdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const pageDiv = document.createElement('div');
      pageDiv.className = 'section-pdf-page';
      pageDiv.dataset.pageNum = pageNum;

      const label = document.createElement('span');
      label.className = 'section-pdf-label';
      label.textContent = `Page ${pageNum}`;

      const canvas = document.createElement('canvas');
      canvas.className = 'section-pdf-canvas';
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / 1.5}px`;

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      pageDiv.appendChild(label);
      pageDiv.appendChild(canvas);
      pagesEl.appendChild(pageDiv);
    } catch (e) {
      console.warn(`Failed to render page ${pageNum}:`, e);
    }
  }
}

/* ══════════════════════════════════════════════
   Math + Markdown Rendering
   ══════════════════════════════════════════════ */
function renderMathMarkdown(text) {
  if (!text) return '';

  // Protect LaTeX from markdown parser
  const blocks = [];
  let safe = text;

  // Display math $$...$$
  safe = safe.replace(/\$\$([\s\S]*?)\$\$/g, (m) => { blocks.push(m); return `⟦MATH${blocks.length - 1}⟧`; });
  // Inline math $...$
  safe = safe.replace(/\$([^\$\n]+?)\$/g, (m) => { blocks.push(m); return `⟦MATH${blocks.length - 1}⟧`; });
  // \[...\] and \(...\)
  safe = safe.replace(/\\\[([\s\S]*?)\\\]/g, (m) => { blocks.push(m); return `⟦MATH${blocks.length - 1}⟧`; });
  safe = safe.replace(/\\\(([\s\S]*?)\\\)/g, (m) => { blocks.push(m); return `⟦MATH${blocks.length - 1}⟧`; });

  // Parse markdown
  let html = marked.parse(safe);

  // Restore LaTeX placeholders
  blocks.forEach((block, i) => {
    html = html.replace(`⟦MATH${i}⟧`, block);
  });

  // Create temp container for KaTeX
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  try {
    renderMathInElement(tmp, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  } catch (_) {}

  // Highlight code blocks
  tmp.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));

  return tmp.innerHTML;
}

/* ══════════════════════════════════════════════
   Mind Map
   ══════════════════════════════════════════════ */
async function renderMindMap(code) {
  dom.mindmapContent.innerHTML = '';
  mermaidCounter++;
  try {
    const { svg } = await mermaid.render(`mm-${mermaidCounter}`, code);
    dom.mindmapContent.innerHTML = svg;
    dom.mindmapSection.classList.remove('hidden');
  } catch (e) {
    console.warn('Mermaid render failed:', e);
    dom.mindmapContent.innerHTML = `<pre style="font-size:0.73rem;background:#fafafa;padding:12px;border:1px solid #eee;border-radius:3px;overflow-x:auto"><code>${esc(code)}</code></pre>`;
    dom.mindmapSection.classList.remove('hidden');
  }
}

/* ══════════════════════════════════════════════
   Insights Panel
   ══════════════════════════════════════════════ */
function openInsights() {
  dom.insightsPanel.classList.add('open');
  dom.insightsBackdrop.classList.add('open');
}

function closeInsights() {
  dom.insightsPanel.classList.remove('open');
  dom.insightsBackdrop.classList.remove('open');
}

async function onEnhanceSection(idx) {
  const apiKey = localStorage.getItem(STORAGE_KEY_API);
  if (!apiKey) { toast('Add your API key first.', 'error'); toggleSettings(true); return; }
  if (!currentData?.sections?.[idx]) return;

  const section = currentData.sections[idx];
  openInsights();
  dom.insightsBody.innerHTML = '';
  dom.insightsLoading.classList.remove('hidden');

  try {
    const result = await enhanceSection(section.title, section.content, apiKey);
    dom.insightsLoading.classList.add('hidden');

    if (result.suggestions?.length) {
      result.suggestions.forEach(s => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `
          <div class="insight-card-type">${esc(s.type || 'suggestion')}</div>
          <div class="insight-card-title">${esc(s.title || '')}</div>
          <div class="insight-card-content"></div>`;
        const contentEl = card.querySelector('.insight-card-content');
        contentEl.innerHTML = renderMathMarkdown(s.content || '');
        dom.insightsBody.appendChild(card);
      });
    } else {
      dom.insightsBody.innerHTML = '<p style="color:#aaa;text-align:center;padding:30px">No suggestions generated.</p>';
    }
  } catch (e) {
    dom.insightsLoading.classList.add('hidden');
    dom.insightsBody.innerHTML = `<p style="color:#c44;padding:20px;font-size:0.82rem">${esc(e.message)}</p>`;
  }
}

/* ══════════════════════════════════════════════
   UI Reset / Helpers
   ══════════════════════════════════════════════ */
function resetUI() {
  cleanupVisualizers();
  hideAllSections();
  dom.skeletonLoader.classList.add('hidden');
  clearStatus();
  dom.sectionsContainer.innerHTML = '';
  dom.emptyState.classList.remove('hidden');
}

function hideAllSections() {
  [dom.overviewSection, dom.mindmapSection, dom.imagesSection].forEach(s => s.classList.add('hidden'));
}

function cleanupVisualizers() {
  activeVisualizers.forEach(v => { try { v.destroy(); } catch (_) {} });
  activeVisualizers = [];
}

function setStatus(msg) { dom.loadingStatus.textContent = msg; dom.loadingStatus.classList.remove('hidden'); }
function clearStatus() { dom.loadingStatus.classList.add('hidden'); dom.loadingStatus.textContent = ''; }

/* ══════════════════════════════════════════════
   Cache
   ══════════════════════════════════════════════ */
function getCacheStore() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CACHE) || '{}'); } catch { return {}; } }
function getCache(id) { return getCacheStore()[id] || null; }
function setCache(id, data) {
  const store = getCacheStore(); store[id] = data;
  try { localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(store)); } catch (e) { console.warn('Cache full:', e); }
}

/* ══════════════════════════════════════════════
   Settings
   ══════════════════════════════════════════════ */
function toggleSettings(show) {
  dom.settingsOverlay.classList.toggle('hidden', !show);
  if (show) {
    dom.apiKeyInput.focus();
    const key = localStorage.getItem(STORAGE_KEY_API);
    key ? showKeyStatus('Key is saved.', 'info') : dom.keyStatus.classList.add('hidden');
  }
}
function saveApiKey() {
  const key = dom.apiKeyInput.value.trim();
  if (!key) { showKeyStatus('Enter a key.', 'error'); return; }
  localStorage.setItem(STORAGE_KEY_API, key);
  showKeyStatus('Saved to localStorage.', 'success');
  toast('API key saved.', 'success');
}
function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY_API);
  dom.apiKeyInput.value = '';
  showKeyStatus('Key cleared.', 'info');
  toast('API key removed.', 'info');
}
function showKeyStatus(msg, type) {
  dom.keyStatus.textContent = msg;
  dom.keyStatus.className = `key-status ${type}`;
  dom.keyStatus.classList.remove('hidden');
}

/* ══════════════════════════════════════════════
   Toast
   ══════════════════════════════════════════════ */
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 4000);
}

/* ══════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════ */
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function svgStar() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:-1px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`; }

/* ══════════════════════════════════════════════
   Boot
   ══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
