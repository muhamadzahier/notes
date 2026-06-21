/**
 * visualizer.js — Interactive Visualization Engine
 *
 * Exports: createVisualization(canvas, vizConfig) → { destroy(), getControls()? }
 *
 * Visualization types:
 *   field2d — 2D electric/magnetic field lines with draggable sources
 *   wave   — Animated wave with frequency/amplitude controls
 *   plot   — 2D function plotter with hover values
 *   3d     — Three.js 3D scene with orbit controls
 */

export function createVisualization(canvas, vizConfig) {
  if (!canvas || !vizConfig) return null;
  const config = vizConfig.config || {};

  switch (vizConfig.type) {
    case 'field2d': return new FieldVisualizer(canvas, config);
    case 'wave':    return new WaveVisualizer(canvas, config);
    case 'plot':    return new PlotVisualizer(canvas, config);
    case '3d':      return new ThreeVisualizer(canvas, config);
    default:        return null;
  }
}

/* ══════════════════════════════════════════════
   Shared Canvas Setup
   ══════════════════════════════════════════════ */
function setupCanvas(canvas, height = 280) {
  const parent = canvas.parentElement;
  const w = parent ? parent.clientWidth : 600;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = height * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h: height, dpr };
}

function canvasMousePos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/* ══════════════════════════════════════════════
   FieldVisualizer — 2D E/B Field Lines
   ══════════════════════════════════════════════ */
class FieldVisualizer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.sources = (config.sources || [{ x: 0.5, y: 0.5, strength: 1, label: '+', type: 'charge' }])
      .map(s => ({ ...s })); // Clone
    this.fieldType = config.fieldType || 'electric';
    this.lineCount = config.lineCount || 16;
    this.dragging = null;

    const { ctx, w, h } = setupCanvas(canvas, 280);
    this.ctx = ctx; this.w = w; this.h = h;

    this._onDown = e => { const p = canvasMousePos(canvas, e); this.dragging = this._findSource(p.x, p.y); };
    this._onMove = e => { if (!this.dragging) return; const p = canvasMousePos(canvas, e); this.dragging.x = p.x / this.w; this.dragging.y = p.y / this.h; this.render(); };
    this._onUp = () => this.dragging = null;

    canvas.addEventListener('mousedown', this._onDown);
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mouseup', this._onUp);
    canvas.addEventListener('mouseleave', this._onUp);
    // Touch
    canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; this._onDown({ clientX: t.clientX, clientY: t.clientY }); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; this._onMove({ clientX: t.clientX, clientY: t.clientY }); }, { passive: false });
    canvas.addEventListener('touchend', this._onUp);

    this.render();
  }

  _findSource(x, y) {
    return this.sources.find(s => Math.hypot(x - s.x * this.w, y - s.y * this.h) < 22) || null;
  }

  _getField(px, py) {
    let fx = 0, fy = 0;
    for (const s of this.sources) {
      const sx = s.x * this.w, sy = s.y * this.h;
      const dx = px - sx, dy = py - sy;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2);
      if (r < 6) continue;
      const q = s.strength || 1;
      if (this.fieldType === 'electric') {
        const mag = q * 5000 / r2;
        fx += mag * dx / r; fy += mag * dy / r;
      } else {
        const mag = q * 100 / r;
        fx += mag * (-dy / r); fy += mag * (dx / r);
      }
    }
    return { x: fx, y: fy };
  }

  render() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, w, h);

    // Grid dots
    ctx.fillStyle = '#e8e8e8';
    for (let gx = 0; gx < w; gx += 30) for (let gy = 0; gy < h; gy += 30) {
      ctx.beginPath(); ctx.arc(gx, gy, 0.8, 0, Math.PI * 2); ctx.fill();
    }

    // Field lines
    for (const s of this.sources) {
      const sx = s.x * w, sy = s.y * h;
      for (let i = 0; i < this.lineCount; i++) {
        const ang = (2 * Math.PI * i) / this.lineCount;
        this._traceLine(sx + 20 * Math.cos(ang), sy + 20 * Math.sin(ang), (s.strength || 1) > 0 ? 1 : -1);
      }
    }

    // Sources
    for (const s of this.sources) {
      const sx = s.x * w, sy = s.y * h;
      ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2);
      if (this.fieldType === 'electric') {
        ctx.fillStyle = (s.strength || 1) > 0 ? '#e74c3c' : '#3498db';
      } else { ctx.fillStyle = '#8e44ad'; }
      ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.label || (this.fieldType === 'electric' ? ((s.strength||1) > 0 ? '+' : '−') : '⊙'), sx, sy);
    }

    ctx.fillStyle = '#c0c0c0'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('drag to move sources', 6, h - 6);
  }

  _traceLine(startX, startY, dir) {
    const { ctx, w, h } = this;
    const step = 3, maxSteps = 250;
    ctx.beginPath(); ctx.moveTo(startX, startY);
    let x = startX, y = startY;

    for (let i = 0; i < maxSteps; i++) {
      const f = this._getField(x, y);
      const mag = Math.sqrt(f.x * f.x + f.y * f.y);
      if (mag < 0.005) break;
      x += (f.x / mag) * step * dir; y += (f.y / mag) * step * dir;
      if (x < -5 || x > w + 5 || y < -5 || y > h + 5) break;
      // Hit another source?
      let hit = false;
      for (const s of this.sources) { if (Math.hypot(x - s.x * w, y - s.y * h) < 14) { hit = true; break; } }
      ctx.lineTo(x, y);
      if (hit) break;

      // Draw arrow every 40 steps
      if (i > 0 && i % 40 === 0) {
        const ang = Math.atan2(f.y * dir, f.x * dir);
        ctx.moveTo(x - 5 * Math.cos(ang - 0.5), y - 5 * Math.sin(ang - 0.5));
        ctx.lineTo(x, y);
        ctx.lineTo(x - 5 * Math.cos(ang + 0.5), y - 5 * Math.sin(ang + 0.5));
        ctx.moveTo(x, y);
      }
    }
    const color = this.fieldType === 'electric' ? '100, 100, 200' : '142, 68, 173';
    ctx.strokeStyle = `rgba(${color}, 0.35)`;
    ctx.lineWidth = 1.2; ctx.stroke();
  }

  getControls() { return null; } // No sliders for field viz
  destroy() {
    this.canvas.removeEventListener('mousedown', this._onDown);
    this.canvas.removeEventListener('mousemove', this._onMove);
    this.canvas.removeEventListener('mouseup', this._onUp);
    this.canvas.removeEventListener('mouseleave', this._onUp);
  }
}

/* ══════════════════════════════════════════════
   WaveVisualizer — Animated Waves
   ══════════════════════════════════════════════ */
class WaveVisualizer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.frequency = config.frequency || 1;
    this.amplitude = config.amplitude || 1;
    this.wavelength = config.wavelength || 180;
    this.waveType = config.waveType || 'transverse';
    this.time = 0;
    this.running = true;

    const { ctx, w, h } = setupCanvas(canvas, 240);
    this.ctx = ctx; this.w = w; this.h = h;
    this._animate();
  }

  _animate() {
    if (!this.running) return;
    this.time += 0.04 * this.frequency;
    this._render();
    this._raf = requestAnimationFrame(() => this._animate());
  }

  _render() {
    const { ctx, w, h, amplitude, wavelength, time, waveType } = this;
    const midY = h / 2;
    const maxA = (h / 2 - 24) * Math.min(amplitude, 1.5);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, w, h);

    // Axes
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(30, h - 10); ctx.stroke();

    // E-field (red)
    ctx.beginPath(); ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2;
    for (let x = 0; x < w; x++) {
      const y = midY - maxA * Math.sin((x / wavelength) * 2 * Math.PI - time);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // B-field for EM wave (blue, 90° phase)
    if (waveType === 'em') {
      ctx.beginPath(); ctx.strokeStyle = '#3498db'; ctx.lineWidth = 2;
      for (let x = 0; x < w; x++) {
        const y = midY - maxA * 0.7 * Math.cos((x / wavelength) * 2 * Math.PI - time);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Standing wave nodes
    if (waveType === 'standing') {
      ctx.beginPath(); ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2;
      for (let x = 0; x < w; x++) {
        const env = maxA * Math.abs(Math.sin((x / wavelength) * 2 * Math.PI));
        const y = midY - env * Math.cos(time);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Envelope
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(46,204,113,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x++) { const env = maxA * Math.abs(Math.sin((x / wavelength) * 2 * Math.PI)); x === 0 ? ctx.moveTo(x, midY - env) : ctx.lineTo(x, midY - env); }
      ctx.stroke();
      ctx.beginPath();
      for (let x = 0; x < w; x++) { const env = maxA * Math.abs(Math.sin((x / wavelength) * 2 * Math.PI)); x === 0 ? ctx.moveTo(x, midY + env) : ctx.lineTo(x, midY + env); }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Legend
    ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = '#e74c3c'; ctx.fillText(waveType === 'em' ? 'E field' : 'Wave', w - 8, 18);
    if (waveType === 'em') { ctx.fillStyle = '#3498db'; ctx.fillText('B field', w - 8, 33); }
    if (waveType === 'standing') { ctx.fillStyle = '#2ecc71'; ctx.fillText('Standing', w - 8, 18); }

    // Labels
    ctx.fillStyle = '#aaa'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('x →', w - 30, midY + 14);
    ctx.save(); ctx.translate(14, midY); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Amplitude', 0, 0); ctx.restore();
  }

  setFrequency(f) { this.frequency = f; }
  setAmplitude(a) { this.amplitude = a; }

  getControls() {
    const div = document.createElement('div');
    div.className = 'viz-controls';
    div.innerHTML = `
      <label class="viz-ctrl"><span>Frequency</span>
        <input type="range" class="viz-slider" min="0.1" max="5" step="0.1" value="${this.frequency}">
        <span class="viz-ctrl-val">${this.frequency.toFixed(1)}</span>
      </label>
      <label class="viz-ctrl"><span>Amplitude</span>
        <input type="range" class="viz-slider" min="0.1" max="2" step="0.1" value="${this.amplitude}">
        <span class="viz-ctrl-val">${this.amplitude.toFixed(1)}</span>
      </label>`;
    const inputs = div.querySelectorAll('input');
    const vals = div.querySelectorAll('.viz-ctrl-val');
    inputs[0].addEventListener('input', e => { this.frequency = +e.target.value; vals[0].textContent = this.frequency.toFixed(1); });
    inputs[1].addEventListener('input', e => { this.amplitude = +e.target.value; vals[1].textContent = this.amplitude.toFixed(1); });
    return div;
  }

  destroy() { this.running = false; cancelAnimationFrame(this._raf); }
}

/* ══════════════════════════════════════════════
   PlotVisualizer — 2D Function Plotter
   ══════════════════════════════════════════════ */
class PlotVisualizer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.curves = config.curves || [{ expr: 'sin(x)', color: '#e74c3c', label: 'f(x)' }];
    this.xRange = config.xRange || [-6, 6];
    this.yRange = config.yRange || [-3, 3];
    this.xLabel = config.xLabel || 'x';
    this.yLabel = config.yLabel || 'y';
    this.hoverX = null;

    const { ctx, w, h } = setupCanvas(canvas, 260);
    this.ctx = ctx; this.w = w; this.h = h;
    this.pad = { l: 45, r: 20, t: 20, b: 35 };

    this._onMouse = e => { const p = canvasMousePos(canvas, e); this.hoverX = p.x; this.render(); };
    this._onLeave = () => { this.hoverX = null; this.render(); };
    canvas.addEventListener('mousemove', this._onMouse);
    canvas.addEventListener('mouseleave', this._onLeave);
    this.render();
  }

  _eval(expr, x) {
    try {
      const safe = expr
        .replace(/\bsin\b/g, 'Math.sin').replace(/\bcos\b/g, 'Math.cos').replace(/\btan\b/g, 'Math.tan')
        .replace(/\bexp\b/g, 'Math.exp').replace(/\bsqrt\b/g, 'Math.sqrt').replace(/\blog\b/g, 'Math.log')
        .replace(/\babs\b/g, 'Math.abs').replace(/\bpow\b/g, 'Math.pow')
        .replace(/\bPI\b/g, 'Math.PI').replace(/\bpi\b/g, 'Math.PI').replace(/\be\b(?![x])/g, 'Math.E')
        .replace(/\bfloor\b/g, 'Math.floor').replace(/\bceil\b/g, 'Math.ceil')
        .replace(/\bmin\b/g, 'Math.min').replace(/\bmax\b/g, 'Math.max')
        .replace(/\basin\b/g, 'Math.asin').replace(/\bacos\b/g, 'Math.acos').replace(/\batan\b/g, 'Math.atan')
        .replace(/\batan2\b/g, 'Math.atan2').replace(/\bhypot\b/g, 'Math.hypot');
      return new Function('x', `"use strict"; return ${safe}`)(x);
    } catch { return NaN; }
  }

  _toCanvas(x, y) {
    const { pad, w, h, xRange, yRange } = this;
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    return {
      cx: pad.l + ((x - xRange[0]) / (xRange[1] - xRange[0])) * pw,
      cy: pad.t + ((yRange[1] - y) / (yRange[1] - yRange[0])) * ph
    };
  }

  _fromCanvas(cx) {
    const { pad, w, xRange } = this;
    const pw = w - pad.l - pad.r;
    return xRange[0] + ((cx - pad.l) / pw) * (xRange[1] - xRange[0]);
  }

  render() {
    const { ctx, w, h, pad, xRange, yRange } = this;
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8f9fb'; ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    const xStep = this._niceStep(xRange[1] - xRange[0], 8);
    const yStep = this._niceStep(yRange[1] - yRange[0], 6);
    ctx.font = '10px JetBrains Mono, monospace'; ctx.fillStyle = '#aaa'; ctx.textAlign = 'center';

    for (let x = Math.ceil(xRange[0] / xStep) * xStep; x <= xRange[1]; x += xStep) {
      const { cx } = this._toCanvas(x, 0);
      ctx.beginPath(); ctx.moveTo(cx, pad.t); ctx.lineTo(cx, h - pad.b); ctx.stroke();
      ctx.fillText(this._fmtNum(x), cx, h - pad.b + 13);
    }
    ctx.textAlign = 'right';
    for (let y = Math.ceil(yRange[0] / yStep) * yStep; y <= yRange[1]; y += yStep) {
      const { cy } = this._toCanvas(0, y);
      ctx.beginPath(); ctx.moveTo(pad.l, cy); ctx.lineTo(w - pad.r, cy); ctx.stroke();
      ctx.fillText(this._fmtNum(y), pad.l - 5, cy + 3);
    }

    // Axes
    const { cx: zx } = this._toCanvas(0, 0);
    const { cy: zy } = this._toCanvas(0, 0);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
    if (zx >= pad.l && zx <= w - pad.r) { ctx.beginPath(); ctx.moveTo(zx, pad.t); ctx.lineTo(zx, h - pad.b); ctx.stroke(); }
    if (zy >= pad.t && zy <= h - pad.b) { ctx.beginPath(); ctx.moveTo(pad.l, zy); ctx.lineTo(w - pad.r, zy); ctx.stroke(); }

    // Curves
    this.curves.forEach(curve => {
      ctx.beginPath(); ctx.strokeStyle = curve.color || '#e74c3c'; ctx.lineWidth = 2;
      let started = false;
      for (let px = 0; px <= pw; px++) {
        const x = xRange[0] + (px / pw) * (xRange[1] - xRange[0]);
        const y = this._eval(curve.expr, x);
        if (isNaN(y) || !isFinite(y)) { started = false; continue; }
        const { cx, cy } = this._toCanvas(x, y);
        if (cy < pad.t - 50 || cy > h - pad.b + 50) { started = false; continue; }
        started ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
        started = true;
      }
      ctx.stroke();
    });

    // Hover line + values
    if (this.hoverX !== null && this.hoverX >= pad.l && this.hoverX <= w - pad.r) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(this.hoverX, pad.t); ctx.lineTo(this.hoverX, h - pad.b); ctx.stroke();

      const xVal = this._fromCanvas(this.hoverX);
      let yOff = 0;
      this.curves.forEach(curve => {
        const yVal = this._eval(curve.expr, xVal);
        if (isNaN(yVal)) return;
        const { cy } = this._toCanvas(xVal, yVal);
        ctx.beginPath(); ctx.arc(this.hoverX, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = curve.color || '#e74c3c'; ctx.fill();
        ctx.fillStyle = '#333'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${curve.label || ''}: ${yVal.toFixed(3)}`, this.hoverX + 8, pad.t + 14 + yOff);
        yOff += 16;
      });
    }

    // Labels
    ctx.fillStyle = '#888'; ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(this.xLabel, pad.l + pw / 2, h - 4);
    ctx.save(); ctx.translate(12, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(this.yLabel, 0, 0); ctx.restore();

    // Legend
    let lx = w - pad.r - 8;
    ctx.textAlign = 'right'; ctx.font = '10px Inter, sans-serif';
    this.curves.forEach(c => {
      ctx.fillStyle = c.color || '#e74c3c';
      ctx.fillText(c.label || c.expr, lx, pad.t + 12);
      lx -= 80;
    });
  }

  _niceStep(range, maxTicks) {
    const rough = range / maxTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1; else if (norm < 3.5) step = 2; else if (norm < 7.5) step = 5; else step = 10;
    return step * mag;
  }

  _fmtNum(n) { return Math.abs(n) < 1e-10 ? '0' : (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) ? n.toExponential(1) : parseFloat(n.toPrecision(4)).toString(); }

  getControls() { return null; }
  destroy() {
    this.canvas.removeEventListener('mousemove', this._onMouse);
    this.canvas.removeEventListener('mouseleave', this._onLeave);
  }
}

/* ══════════════════════════════════════════════
   ThreeVisualizer — Three.js 3D Scenes
   ══════════════════════════════════════════════ */
class ThreeVisualizer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.meshes = [];

    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : 600;
    const height = 320;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(config.background || '#1a1a2e');

    // Scene + Camera
    this.scene = new THREE.Scene();
    const cp = config.camera?.position || [0, 5, 10];
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.camera.position.set(cp[0], cp[1], cp[2]);
    this.lookAt = config.camera?.lookAt || [0, 0, 0];
    this.camera.lookAt(new THREE.Vector3(...this.lookAt));

    // Lights
    (config.lights || [
      { type: 'ambient', color: '#ffffff', intensity: 0.5 },
      { type: 'directional', color: '#ffffff', intensity: 0.8, position: [5, 10, 7] }
    ]).forEach(l => {
      if (l.type === 'ambient') this.scene.add(new THREE.AmbientLight(l.color || '#fff', l.intensity ?? 0.5));
      else if (l.type === 'point') { const p = new THREE.PointLight(l.color || '#fff', l.intensity ?? 1); if (l.position) p.position.set(...l.position); this.scene.add(p); }
      else if (l.type === 'directional') { const d = new THREE.DirectionalLight(l.color || '#fff', l.intensity ?? 0.8); if (l.position) d.position.set(...l.position); this.scene.add(d); }
    });

    // Grid
    if (config.showGrid !== false) {
      const g = new THREE.GridHelper(20, 20, 0x444466, 0x333355);
      g.material.opacity = 0.3; g.material.transparent = true;
      this.scene.add(g);
    }

    // Objects
    (config.objects || []).forEach(obj => {
      const geom = this._createGeom(obj);
      if (!geom) return;
      const mat = new THREE.MeshPhongMaterial({
        color: obj.color || '#5B6EE1', wireframe: !!obj.wireframe, side: THREE.DoubleSide,
        ...(obj.opacity != null && obj.opacity < 1 ? { transparent: true, opacity: obj.opacity } : {})
      });
      const mesh = new THREE.Mesh(geom, mat);
      if (obj.position) mesh.position.set(...obj.position);
      if (obj.rotation) mesh.rotation.set(...obj.rotation);
      mesh.userData.animate = obj.animate || null;
      this.scene.add(mesh); this.meshes.push(mesh);
    });

    // Lines
    (config.lines || []).forEach(line => {
      if (!line.points || line.points.length < 2) return;
      const pts = line.points.map(p => new THREE.Vector3(...p));
      this.scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: line.color || '#888' })
      ));
    });

    // Orbit state
    let dragging = false, prev = { x: 0, y: 0 };
    let theta = Math.atan2(this.camera.position.x - this.lookAt[0], this.camera.position.z - this.lookAt[2]);
    let phi = Math.acos(Math.min(1, Math.max(-1, (this.camera.position.y - this.lookAt[1]) / this.camera.position.distanceTo(new THREE.Vector3(...this.lookAt)))));
    let radius = this.camera.position.distanceTo(new THREE.Vector3(...this.lookAt));

    canvas.addEventListener('mousedown', e => { dragging = true; prev = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      theta -= (e.clientX - prev.x) * 0.008;
      phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + (e.clientY - prev.y) * 0.008));
      this.camera.position.set(
        this.lookAt[0] + radius * Math.sin(phi) * Math.sin(theta),
        this.lookAt[1] + radius * Math.cos(phi),
        this.lookAt[2] + radius * Math.sin(phi) * Math.cos(theta));
      this.camera.lookAt(new THREE.Vector3(...this.lookAt));
      prev = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mouseup', () => dragging = false);
    canvas.addEventListener('mouseleave', () => dragging = false);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      radius = Math.max(2, Math.min(50, radius + e.deltaY * 0.02));
      this.camera.position.set(
        this.lookAt[0] + radius * Math.sin(phi) * Math.sin(theta),
        this.lookAt[1] + radius * Math.cos(phi),
        this.lookAt[2] + radius * Math.sin(phi) * Math.cos(theta));
      this.camera.lookAt(new THREE.Vector3(...this.lookAt));
    }, { passive: false });

    // Animate
    this._running = true;
    const clock = new THREE.Clock();
    const tick = () => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(tick);
      this.meshes.forEach(m => {
        const a = m.userData.animate;
        if (a?.rotate) { m.rotation.x += a.rotate.x || 0; m.rotation.y += a.rotate.y || 0; m.rotation.z += a.rotate.z || 0; }
      });
      this.renderer.render(this.scene, this.camera);
    };
    tick();

    // Resize
    this._onResize = () => {
      const nw = parent ? parent.clientWidth : 600;
      this.renderer.setSize(nw, height);
      this.camera.aspect = nw / height; this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this._onResize);
  }

  _createGeom(o) {
    switch (o.type) {
      case 'sphere': return new THREE.SphereGeometry(o.radius || 1, 32, 32);
      case 'box': case 'cube': return new THREE.BoxGeometry(o.width || 1, o.height || 1, o.depth || 1);
      case 'torus': return new THREE.TorusGeometry(o.radius || 2, o.tube || 0.3, 16, 64);
      case 'cylinder': return new THREE.CylinderGeometry(o.radiusTop ?? o.radius ?? 1, o.radiusBottom ?? o.radius ?? 1, o.height || 2, 32);
      case 'cone': return new THREE.ConeGeometry(o.radius || 1, o.height || 2, 32);
      case 'plane': return new THREE.PlaneGeometry(o.width || 5, o.height || 5);
      case 'ring': return new THREE.RingGeometry(o.innerRadius || 0.5, o.outerRadius || o.radius || 2, 32);
      case 'torusKnot': return new THREE.TorusKnotGeometry(o.radius || 1, o.tube || 0.3, 100, 16);
      default: return new THREE.SphereGeometry(o.radius || 1, 32, 32);
    }
  }

  getControls() { return null; }
  destroy() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this.renderer.dispose();
    this.scene.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) { (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose()); } });
    window.removeEventListener('resize', this._onResize);
  }
}
