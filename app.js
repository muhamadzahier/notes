/**
 * app.js — Core Application Logic (Redesigned)
 *
 * Section-based study notes, per-section PDF toggle, KaTeX math,
 * interactive visualizations, insights panel.
 */

import { generateInsights, enhanceSection, chatWithSection, AIError } from './ai-handler.js';
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

// Chatbot State
let activeChatSectionIdx = null;
let activeChatVisualizer = null; // Store active inline chat viz instance
let cachedPdfPagesText = {};     // Cache extracted page texts: { docId_pageNum: "text" }

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
  // Chatbot
  chatPanel: $('chat-panel'),
  chatBackdrop: $('chat-backdrop'),
  chatSectionTitle: $('chat-section-title'),
  chatMessages: $('chat-messages'),
  chatTyping: $('chat-typing'),
  chatInput: $('chat-input'),
  sendChatBtn: $('send-chat-btn'),
  clearChatBtn: $('clear-chat-btn'),
  chatQuickPrompts: $('chat-quick-prompts'),
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
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { toggleSettings(false); closeInsights(); closeChat(); dom.lightbox.classList.add('hidden'); toggleTextSettings(false); } });

  // Chatbot Events
  $('close-chat').addEventListener('click', closeChat);
  dom.chatBackdrop.addEventListener('click', closeChat);
  dom.clearChatBtn.addEventListener('click', clearChatHistory);
  dom.sendChatBtn.addEventListener('click', () => submitChatMessage());
  dom.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitChatMessage();
    }
  });
  dom.chatInput.addEventListener('input', () => {
    dom.chatInput.style.height = 'auto';
    dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 120) + 'px';
  });
  dom.chatQuickPrompts.addEventListener('click', e => {
    const btn = e.target.closest('.quick-prompt-btn');
    if (btn) {
      const prompt = btn.dataset.prompt;
      if (prompt) submitChatMessage(prompt);
    }
  });

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
    // Close jargon tooltips on outside clicks
    if (!e.target.closest('.jargon-term')) {
      document.querySelectorAll('.jargon-term.active').forEach(el => {
        el.classList.remove('active');
      });
    }
  });

  // Intercept workspace clicks (PDF citations + Jargon terms)
  dom.workspaceContent.addEventListener('click', async (e) => {
    // Check if clicked a jargon term
    const jargon = e.target.closest('.jargon-term');
    if (jargon) {
      e.stopPropagation();
      const isActive = jargon.classList.contains('active');
      document.querySelectorAll('.jargon-term.active').forEach(el => {
        if (el !== jargon) el.classList.remove('active');
      });
      jargon.classList.toggle('active', !isActive);
      return;
    }

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

  // Mobile virtual keyboard viewport adaptation
  dom.chatInput.addEventListener('focus', () => {
    setTimeout(() => {
      dom.chatInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }, 200);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (activeChatSectionIdx !== null && dom.chatPanel.classList.contains('open')) {
        dom.chatPanel.style.height = `${window.visualViewport.height}px`;
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      }
    });
  }
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
function goHome() { cleanupVisualizers(); closeChat(); currentCourse = null; currentDoc = null; currentPdfDoc = null; extractedText = ''; currentData = null; showScreen('homescreen'); }

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
      <button class="section-chat-btn" data-idx="${idx}">Ask AI</button>
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

  // Bind chat
  const chatBtn = head.querySelector('.section-chat-btn');
  if (chatBtn) chatBtn.addEventListener('click', () => openChat(idx));

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
/* ══════════════════════════════════════════════
   Jargon Dictionary & Formatting Helpers
   ══════════════════════════════════════════════ */
const JARGON_MAP = {
  'electrostatics': 'The study of electric charges at rest (static electricity).',
  'magnetostatics': 'The study of magnetic fields produced by steady, unchanging currents.',
  'conservative': 'A field where the total work done moving a charge in a closed loop is zero.',
  'divergence': 'A measure of how much a field spreads out or flows away from a point (like a water source).',
  'curl': 'A measure of how much a field rotates or swirls around a point (like a whirlpool).',
  'divergence-free': 'A field whose divergence is zero everywhere, meaning field lines have no start or end point and must form closed loops.',
  'curl-active': 'A field that rotates or swirls, indicating presence of vortices or local circulation sources.',
  'magnetic flux density': 'A vector field representing the strength and direction of a magnetic field per unit area (Tesla).',
  'permeability': 'A measure of how easily a material allows magnetic fields to pass through and establish themselves within it.',
  'permittivity': 'A measure of how easily a material polarizes in response to an electric field, opposing the field.',
  'electromotive force': 'The voltage induced by a changing magnetic field or battery, driving electrical current.',
  'emf': 'Electromotive Force: the voltage induced by a changing magnetic field, driving current.',
  'mutual induction': 'When a changing current in one coil induces a voltage in a nearby second coil.',
  'self-inductance': 'The property of a coil to oppose changes in its own current, inducing a voltage in itself.',
  'mutual inductance': 'The property where a changing current in one inductor induces a voltage in a neighboring inductor.',
  'solenoid': 'A coil of wire wound into a tightly packed cylinder, creating a strong and uniform magnetic field inside when carrying current.',
  'lossless': 'An ideal system with no energy wasted as heat, friction, or radiation.',
  'coupling coefficient': 'A measure of how much magnetic flux is shared between two coils (ranges from 0 to 1).',
  'magnetic vector potential': 'A vector field whose curl is the magnetic field, used to simplify electromagnetics math.',
  'vector potential': 'A vector field whose curl equals the magnetic field, aligning with the current source directions.',
  'stoke\'s theorem': 'A mathematical theorem relating a surface integral of curl to a line integral around its boundary curve.',
  'stokes\' theorem': 'A mathematical theorem relating a surface integral of curl to a line integral around its boundary curve.',
  'gauss\'s law': 'Relates the electric charge to the net electric flux leaving a closed surface.',
  'monopoles': 'Isolated single magnetic poles (North or South alone) – they do not exist in nature.',
  'magnetic monopoles': 'Hypothetical isolated North or South magnetic poles – all magnets in nature have both.',
  'biot-savart\'s law': 'A mathematical formula that calculates the magnetic field generated by a steady electric current element.',
  'biot-savart law': 'A mathematical formula that calculates the magnetic field generated by a steady electric current element.',
  'ampere\'s circuital law': 'Relates the magnetic field around a closed loop to the electric current passing through that loop.',
  'ampere\'s law': 'Relates the magnetic field around a closed loop to the electric current passing through that loop.',
  'faraday\'s law': 'States that a time-varying magnetic field induces an electromotive force (EMF) in a closed loop.',
  'lenz\'s law': 'States that the direction of an induced current always opposes the change in magnetic flux that created it.',
  'displacement current': 'A quantity representing a time-varying electric field, which acts like a physical current to produce a magnetic field.',
  'maxwell\'s equations': 'A set of four fundamental equations that describe how electric and magnetic fields are generated and behave.',
  'maxwell\'s equation': 'One of the four fundamental equations describing electromagnetism.'
};

function applyJargonTooltips(rootNode) {
  const sortedKeys = Object.keys(JARGON_MAP).sort((a, b) => b.length - a.length);
  const escapedKeys = sortedKeys.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

  const walk = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);
  let textNode;
  const nodesToReplace = [];

  while (textNode = walk.nextNode()) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    
    // Skip if inside code, pre, tags we already processed, or headings of toggles
    if (parent.tagName === 'CODE' || parent.tagName === 'PRE' || 
        parent.closest('pre') || parent.closest('code') || 
        parent.closest('.jargon-term') || parent.closest('.example-summary')) {
      continue;
    }
    
    // Ignore math placeholders
    if (textNode.nodeValue.includes('⟦MATH')) {
      continue;
    }
    
    if (regex.test(textNode.nodeValue)) {
      nodesToReplace.push(textNode);
    }
  }

  nodesToReplace.forEach(node => {
    const parent = node.parentNode;
    if (!parent) return;
    const text = node.nodeValue;
    regex.lastIndex = 0;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      }

      const term = match[0];
      const normTerm = term.toLowerCase();
      const matchedKey = sortedKeys.find(k => k.toLowerCase() === normTerm);
      const definition = JARGON_MAP[matchedKey] || '';

      const span = document.createElement('span');
      span.className = 'jargon-term';
      span.setAttribute('data-tooltip', definition);
      span.textContent = term;
      fragment.appendChild(span);

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    parent.replaceChild(fragment, node);
  });
}

function wrapWorkedExamples(rootNode) {
  const headers = Array.from(rootNode.querySelectorAll('h3, h4, h2'));
  headers.forEach(header => {
    const text = header.textContent.trim();
    if (/example/i.test(text)) {
      const parent = header.parentNode;
      if (!parent) return;

      const details = document.createElement('details');
      details.className = 'example-toggle';
      details.open = false; // Collapsed by default

      const summary = document.createElement('summary');
      summary.className = 'example-summary';
      summary.innerHTML = `${text} <span class="toggle-hint">(Click to expand)</span>`;
      details.appendChild(summary);

      const contentWrap = document.createElement('div');
      contentWrap.className = 'example-content';

      let current = header.nextElementSibling;
      const siblingsToMove = [];

      while (current) {
        const currentTagName = current.tagName.toLowerCase();
        const headerTagName = header.tagName.toLowerCase();
        if (/^h[1-6]$/.test(currentTagName) || current.classList.contains('example-toggle')) {
          if (currentTagName <= headerTagName || current.classList.contains('example-toggle')) {
            break;
          }
        }
        siblingsToMove.push(current);
        current = current.nextElementSibling;
      }

      siblingsToMove.forEach(sibling => {
        contentWrap.appendChild(sibling);
      });

      details.appendChild(contentWrap);
      parent.replaceChild(details, header);
    }
  });
}

function wrapSolutions(rootNode) {
  rootNode.querySelectorAll('strong, em, p').forEach(el => {
    const text = el.textContent.trim();
    if (/^solution:?$/i.test(text)) {
      let startNode = el;
      if (el.tagName === 'STRONG' && el.parentNode && el.parentNode.tagName === 'P' && el.parentNode.children.length === 1) {
        startNode = el.parentNode;
      }

      const parent = startNode.parentNode;
      if (!parent) return;

      const calcBox = document.createElement('div');
      calcBox.className = 'calculation-box';

      const calcTitle = document.createElement('div');
      calcTitle.className = 'calculation-title';
      calcTitle.textContent = 'Calculation Steps';
      calcBox.appendChild(calcTitle);

      let current = startNode.nextElementSibling;
      const siblingsToMove = [];

      while (current) {
        if (/^h[1-6]$/.test(current.tagName.toLowerCase()) || 
            current.classList.contains('example-toggle') || 
            current.classList.contains('calculation-box')) {
          break;
        }
        siblingsToMove.push(current);
        current = current.nextElementSibling;
      }

      if (siblingsToMove.length === 0) return;

      parent.insertBefore(calcBox, siblingsToMove[0]);

      siblingsToMove.forEach(sibling => {
        calcBox.appendChild(sibling);
      });

      calcBox.insertBefore(startNode, calcTitle);
      startNode.style.fontWeight = 'bold';
      startNode.style.marginBottom = '6px';
      startNode.style.display = 'block';
    }
  });
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

  // Create temp container for DOM manipulation & KaTeX
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Restructure DOM: Worked Examples, Solutions, and Jargon hovers
  wrapWorkedExamples(tmp);
  wrapSolutions(tmp);
  applyJargonTooltips(tmp);

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
  closeChat();
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
  cleanupChatVisualizer();
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
   Chatbot Controller
   ══════════════════════════════════════════════ */
async function openChat(sectionIdx) {
  if (sectionIdx === null || !currentData?.sections?.[sectionIdx]) return;
  activeChatSectionIdx = sectionIdx;
  
  // Close insights panel if open
  closeInsights();
  
  // Clean up any existing chat visualizer
  cleanupChatVisualizer();
  
  const section = currentData.sections[sectionIdx];
  dom.chatSectionTitle.textContent = section.title;
  
  // Slide in panel and backdrop
  dom.chatPanel.classList.add('open');
  dom.chatBackdrop.classList.add('open');
  if (window.visualViewport) {
    dom.chatPanel.style.height = `${window.visualViewport.height}px`;
  }
  
  // Reset input value & height
  dom.chatInput.value = '';
  dom.chatInput.style.height = 'auto';
  
  // Show spinner while resolving/extracting PDF page text
  dom.chatMessages.innerHTML = `
    <div class="insights-loading">
      <div class="spinner"></div>
      <p>Extracting cited PDF page text...</p>
    </div>`;
  
  try {
    // Force text extraction/fetch of cited pages
    const pdfPagesText = await getPdfPagesText(section.pdfPages || []);
    
    // Clear spinner
    dom.chatMessages.innerHTML = '';
    
    // Load and render history
    const history = getChatHistory(sectionIdx);
    if (history.length === 0) {
      appendWelcomeMessage(section.title);
    } else {
      history.forEach(msg => {
        renderMessage(msg.role, msg.text);
      });
    }
  } catch (e) {
    dom.chatMessages.innerHTML = '';
    renderMessage('ai', `Failed to load notes chat context: ${e.message}`);
  }
}

function closeChat() {
  dom.chatPanel.classList.remove('open');
  dom.chatBackdrop.classList.remove('open');
  dom.chatPanel.style.height = '';
  cleanupChatVisualizer();
  activeChatSectionIdx = null;
}

function cleanupChatVisualizer() {
  if (activeChatVisualizer) {
    try { activeChatVisualizer.destroy(); } catch (_) {}
    activeChatVisualizer = null;
  }
}

function getChatHistoryKey(sectionIdx) {
  return `notes_chat_${currentDoc.id}_${sectionIdx}`;
}

function getChatHistory(sectionIdx) {
  try {
    return JSON.parse(localStorage.getItem(getChatHistoryKey(sectionIdx)) || '[]');
  } catch (e) {
    return [];
  }
}

function saveChatHistory(sectionIdx, history) {
  try {
    localStorage.setItem(getChatHistoryKey(sectionIdx), JSON.stringify(history));
  } catch (e) {
    console.warn('Storage full: could not save chat history.', e);
  }
}

function clearChatHistory() {
  if (activeChatSectionIdx === null) return;
  localStorage.removeItem(getChatHistoryKey(activeChatSectionIdx));
  cleanupChatVisualizer();
  
  dom.chatMessages.innerHTML = '';
  const section = currentData.sections[activeChatSectionIdx];
  appendWelcomeMessage(section.title);
  toast('Chat history cleared.', 'info');
}

function appendWelcomeMessage(sectionTitle) {
  const text = `Hello! I am your AI Tutor. Ask me any questions to clarify concepts, simplify equations, or explain details about **${sectionTitle}**.\n\nYou can also click the quick prompt buttons below to start.`;
  renderMessage('ai', text);
}

function renderMessage(role, text) {
  let processedText = text;
  const vizConfigs = [];
  
  // Extract custom json-viz code blocks
  processedText = processedText.replace(/```json-viz\s*([\s\S]*?)```/g, (match, jsonStr) => {
    try {
      const config = JSON.parse(jsonStr.trim());
      vizConfigs.push(config);
    } catch (e) {
      console.warn('Failed to parse json-viz block:', e);
    }
    return ''; // Strip block from rendered message
  });
  
  const html = renderMathMarkdown(processedText.trim());
  
  const msgRow = document.createElement('div');
  msgRow.className = `chat-msg-row ${role}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = html;
  msgRow.appendChild(bubble);
  
  // If visualizer is present in message, append a beautiful trigger button
  vizConfigs.forEach(vizConfig => {
    const btn = document.createElement('button');
    btn.className = 'chat-viz-btn';
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-1px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Visualize: ${esc(vizConfig.title || 'Simulation')}
    `;
    btn.addEventListener('click', () => {
      toggleInlineVisualizer(bubble, btn, vizConfig);
    });
    bubble.appendChild(btn);
  });
  
  dom.chatMessages.appendChild(msgRow);
  
  // Auto-scroll log
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function toggleInlineVisualizer(bubble, btn, vizConfig) {
  const nextEl = btn.nextElementSibling;
  const existing = (nextEl && nextEl.classList.contains('chat-viz-container')) ? nextEl : null;
  if (existing) {
    existing.remove();
    if (activeChatVisualizer && activeChatVisualizer.canvas === existing.querySelector('canvas')) {
      cleanupChatVisualizer();
    }
    return;
  }
  
  cleanupChatVisualizer();
  
  const container = document.createElement('div');
  container.className = 'chat-viz-container';
  container.innerHTML = `
    <div class="chat-viz-header">
      <h4>${esc(vizConfig.title || 'Simulation')}</h4>
      <button class="chat-viz-close" title="Close">&times;</button>
    </div>
    <div class="chat-viz-body">
      <canvas class="chat-viz-canvas"></canvas>
    </div>`;
  
  btn.after(container);
  
  const canvas = container.querySelector('.chat-viz-canvas');
  const closeBtn = container.querySelector('.chat-viz-close');
  const body = container.querySelector('.chat-viz-body');
  
  try {
    const viz = createVisualization(canvas, vizConfig);
    if (viz) {
      activeChatVisualizer = viz;
      viz.canvas = canvas; // Keep track of the active canvas
      const controls = viz.getControls?.();
      if (controls) body.appendChild(controls);
    }
  } catch (e) {
    console.error('Failed to initialize chatbot visualizer:', e);
    body.innerHTML = '<p style="font-size:0.7rem;color:#c44;padding:8px">Failed to load visualization.</p>';
  }
  
  closeBtn.addEventListener('click', () => {
    container.remove();
    if (activeChatVisualizer === viz) {
      cleanupChatVisualizer();
    }
  });
  
  // Scroll to reveal visualizer
  requestAnimationFrame(() => {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  });
}

async function getPdfPagesText(pageNumbers) {
  if (!currentPdfDoc) return '';
  const textPieces = [];
  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > currentPdfDoc.numPages) continue;
    const cacheKey = `${currentDoc.id}_${pageNum}`;
    if (cachedPdfPagesText[cacheKey]) {
      textPieces.push(`--- PDF PAGE ${pageNum} ---\n${cachedPdfPagesText[cacheKey]}`);
      continue;
    }
    try {
      const page = await currentPdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      cachedPdfPagesText[cacheKey] = pageText;
      textPieces.push(`--- PDF PAGE ${pageNum} ---\n${pageText}`);
    } catch (e) {
      console.error(`Failed to extract text from page ${pageNum}:`, e);
    }
  }
  return textPieces.join('\n\n');
}

async function submitChatMessage(textOverride) {
  if (activeChatSectionIdx === null) return;
  const apiKey = localStorage.getItem(STORAGE_KEY_API);
  if (!apiKey) {
    toast('Add your Gemini API key in Settings first.', 'error');
    toggleSettings(true);
    return;
  }
  
  const query = textOverride || dom.chatInput.value.trim();
  if (!query) return;
  
  // Clear input if not a button prompt
  if (!textOverride) {
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
  }
  
  // Render user message bubble
  renderMessage('user', query);
  
  // Add to history
  const history = getChatHistory(activeChatSectionIdx);
  history.push({ role: 'user', text: query });
  saveChatHistory(activeChatSectionIdx, history);
  
  // Show typing loader
  dom.chatTyping.classList.remove('hidden');
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  
  try {
    const section = currentData.sections[activeChatSectionIdx];
    const pdfText = await getPdfPagesText(section.pdfPages || []);
    
    // Call Gemini API
    const responseText = await chatWithSection(query, history.slice(0, -1), section.title, section.content, pdfText, apiKey);
    
    dom.chatTyping.classList.add('hidden');
    
    // Strict no-emojis rule enforcement
    const sanitizedText = responseText.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]/gu, '');
    
    // Render AI message bubble
    renderMessage('ai', sanitizedText);
    
    // Add to history & save
    history.push({ role: 'ai', text: sanitizedText });
    saveChatHistory(activeChatSectionIdx, history);
  } catch (err) {
    dom.chatTyping.classList.add('hidden');
    renderMessage('ai', `Sorry, I encountered an error: ${err.message || err}`);
  }
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
