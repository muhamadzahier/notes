const COURSE_CATALOG = [
    {
        semester: "Semester 2",
        courses: [
            {
                name: "Electromagnetic Theory",
                id: "em_theory",
                path: "semester 2/Electromagnetic Theory/em_sandbox_portal.js",
                description: "Unified 3D Electromagnetics Sandbox. Toggle between Electrostatics, Magnetostatics, Faraday's Law, and Coordinate Systems."
            },
            {
                name: "Block Diagram Builder",
                id: "block_diagram",
                path: "system/block_diagram_builder.js",
                description: "Map circuits, signal flow, lab setups, or any system."
            }
        ]
    }
];

class AppController {
    constructor() {
        this.currentView = 'home'; // 'home' | 'simulator'
        this.activeCourse = null;
        this.activeSimulator = null;
        this.savedSimulations = [];
        this.workspaceMode = 'sandbox'; // 'sandbox' | 'notes' | 'tutorial'
        
        this.activeChapter = 'chapter3'; // 'chapter3' | 'chapter4'
        this.activeSectionIdx = 0;
        this.activeQuestionIdx = 0;

        this.init();
    }

    async init() {
        // Cache DOM elements
        this.homeViewEl = document.getElementById('home-view');
        this.simViewEl = document.getElementById('sim-view');
        this.simContainerEl = document.getElementById('sim-container');
        this.navHomeEl = document.getElementById('nav-home');
        this.navBreadcrumbsEl = document.getElementById('nav-breadcrumbs');
        this.savedListEl = document.getElementById('saved-list');
        this.btnSaveEl = document.getElementById('btn-save-sim');
        
        this.workspaceLayoutEl = document.getElementById('workspace-layout');
        this.workspaceSidebarEl = document.getElementById('workspace-sidebar');
        this.tabSandboxEl = document.getElementById('mode-tab-sandbox');
        this.tabNotesEl = document.getElementById('mode-tab-notes');
        this.tabTutorialsEl = document.getElementById('mode-tab-tutorials');

        // Event listeners
        this.navHomeEl.addEventListener('click', (e) => {
            e.preventDefault();
            this.showHome();
        });
        
        this.btnSaveEl.addEventListener('click', () => {
            this.handleSave();
        });

        this.tabSandboxEl.addEventListener('click', () => this.setWorkspaceMode('sandbox'));
        this.tabNotesEl.addEventListener('click', () => this.setWorkspaceMode('notes'));
        this.tabTutorialsEl.addEventListener('click', () => this.setWorkspaceMode('tutorial'));

        // Initialize homescreen
        this.renderCatalog();
        await this.loadSavedSimulations();
    }

    setWorkspaceMode(mode) {
        this.workspaceMode = mode;
        
        // Remove active class from all tabs
        this.tabSandboxEl.classList.remove('active');
        this.tabNotesEl.classList.remove('active');
        this.tabTutorialsEl.classList.remove('active');

        // Reset workspace layout styles
        this.workspaceLayoutEl.classList.remove('portal-mode-sandbox', 'portal-mode-split');

        if (mode === 'sandbox') {
            this.tabSandboxEl.classList.add('active');
            this.workspaceLayoutEl.classList.add('portal-mode-sandbox');
        } else {
            if (mode === 'notes') {
                this.tabNotesEl.classList.add('active');
            } else {
                this.tabTutorialsEl.classList.add('active');
            }
            this.workspaceLayoutEl.classList.add('portal-mode-split');
            this.renderSidebarContent();
        }

        // Trigger window resize so Three.js adjust canvas resolution
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    renderSidebarContent() {
        if (!this.workspaceSidebarEl) return;
        this.workspaceSidebarEl.innerHTML = '';

        if (this.workspaceMode === 'notes') {
            this.renderNotesSidebar();
        } else if (this.workspaceMode === 'tutorial') {
            this.renderTutorialSidebar();
        }
    }

    renderNotesSidebar() {
        this.workspaceSidebarEl.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'workspace-sidebar-header';
        header.innerHTML = `
            <select class="sidebar-select" id="notes-chapter-select">
                <option value="chapter3" ${this.activeChapter === 'chapter3' ? 'selected' : ''}>Chapter 3: Magnetostatics</option>
                <option value="chapter4" ${this.activeChapter === 'chapter4' ? 'selected' : ''}>Chapter 4: Time-Varying Fields</option>
            </select>
            <select class="sidebar-select" id="notes-section-select"></select>
        `;
        this.workspaceSidebarEl.appendChild(header);

        const content = document.createElement('div');
        content.className = 'workspace-sidebar-content';
        content.id = 'notes-content-area';
        this.workspaceSidebarEl.appendChild(content);

        const chapterData = this.activeChapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
        const sectionSelect = document.getElementById('notes-section-select');
        const chapterSelect = document.getElementById('notes-chapter-select');

        // Populate sections list
        chapterData.sections.forEach((sec, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.innerText = sec.title;
            if (idx === this.activeSectionIdx) opt.selected = true;
            sectionSelect.appendChild(opt);
        });

        // Listeners
        chapterSelect.addEventListener('change', (e) => {
            this.activeChapter = e.target.value;
            this.activeSectionIdx = 0;
            this.renderNotesSidebar();
        });

        sectionSelect.addEventListener('change', (e) => {
            this.activeSectionIdx = parseInt(e.target.value);
            this.loadActiveSectionContent();
        });

        this.loadActiveSectionContent();
    }

    loadActiveSectionContent() {
        const contentArea = document.getElementById('notes-content-area');
        if (!contentArea) return;
        contentArea.innerHTML = '';

        const chapterData = this.activeChapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
        const section = chapterData.sections[this.activeSectionIdx];

        if (!section) return;

        // Render main text contents
        this.injectMarkdownContent(contentArea, section.content);

        // Render visualization if available
        if (section.visualization) {
            this.renderVisualizationPanel(contentArea, section.visualization);
        }
    }

    renderTutorialSidebar() {
        this.workspaceSidebarEl.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'workspace-sidebar-header';
        header.innerHTML = `
            <div style="font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); margin-bottom: 0.5rem;">
                Solved Question Paper
            </div>
            <select class="sidebar-select" id="tutorial-question-select"></select>
        `;
        this.workspaceSidebarEl.appendChild(header);

        const content = document.createElement('div');
        content.className = 'workspace-sidebar-content';
        content.id = 'tutorial-content-area';
        this.workspaceSidebarEl.appendChild(content);

        const qSelect = document.getElementById('tutorial-question-select');
        
        window.tutorialC3.sections.forEach((sec, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.innerText = sec.title.split(':')[0]; // Shorten title
            if (idx === this.activeQuestionIdx) opt.selected = true;
            qSelect.appendChild(opt);
        });

        qSelect.addEventListener('change', (e) => {
            this.activeQuestionIdx = parseInt(e.target.value);
            this.loadActiveQuestionContent();
        });

        this.loadActiveQuestionContent();
    }

    loadActiveQuestionContent() {
        const contentArea = document.getElementById('tutorial-content-area');
        if (!contentArea) return;
        contentArea.innerHTML = '';

        const question = window.tutorialC3.sections[this.activeQuestionIdx];
        if (!question) return;

        // Render contents
        this.injectMarkdownContent(contentArea, question.content);

        // Visualize button
        const syncButton = document.createElement('button');
        syncButton.className = 'btn-solve-action';
        syncButton.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Visualize in 3D Sandbox</span>
        `;
        syncButton.addEventListener('click', () => {
            this.syncQuestionToSandbox(this.activeQuestionIdx);
        });
        contentArea.appendChild(syncButton);

        // Render visualization if available
        if (question.visualization) {
            this.renderVisualizationPanel(contentArea, question.visualization);
        }
    }

    renderVisualizationPanel(container, vis) {
        const card = document.createElement('div');
        card.className = 'vis-panel-card';
        
        card.innerHTML = `
            <div class="vis-panel-header">
                <span>Interactive Simulation</span>
                <span style="font-size: 0.65rem; color: #666;">${vis.title}</span>
            </div>
            <div class="vis-panel-body">
                <div class="vis-panel-description">${vis.description}</div>
                <div id="vis-target-area" style="width: 100%;"></div>
            </div>
        `;
        container.appendChild(card);

        const target = card.querySelector('#vis-target-area');

        if (vis.type === 'html' && vis.html) {
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '360px';
            iframe.style.border = 'none';
            iframe.style.background = '#0d1326';
            iframe.srcdoc = vis.html;
            target.appendChild(iframe);
        } else if (vis.type === 'plot' && vis.config) {
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '240px';
            canvas.style.border = '1px solid var(--border-color)';
            target.appendChild(canvas);
            this.drawPlotOnCanvas(canvas, vis.config);
        } else if (vis.type === 'field2d' && vis.config) {
            const canvas = document.createElement('canvas');
            canvas.className = 'vector-field-canvas';
            target.appendChild(canvas);
            this.drawVectorFieldOnCanvas(canvas, vis.config);
        }
    }

    drawPlotOnCanvas(canvas, config) {
        // Adjust coordinate resolution
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 240 * dpr;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 240;

        const padLeft = 45;
        const padRight = 20;
        const padTop = 25;
        const padBottom = 35;

        const xMin = config.xRange[0];
        const xMax = config.xRange[1];
        const yMin = config.yRange[0];
        const yMax = config.yRange[1];

        // Draw background grid
        ctx.fillStyle = '#fdfdfd';
        ctx.fillRect(0, 0, w, h);
        
        ctx.strokeStyle = '#e9e9e9';
        ctx.lineWidth = 1;

        // X Grid
        const gridSteps = 5;
        for (let i = 0; i <= gridSteps; i++) {
            const val = xMin + (xMax - xMin) * (i / gridSteps);
            const xPx = padLeft + (val - xMin) / (xMax - xMin) * (w - padLeft - padRight);
            ctx.beginPath();
            ctx.moveTo(xPx, padTop);
            ctx.lineTo(xPx, h - padBottom);
            ctx.stroke();

            // Label X
            ctx.fillStyle = '#666';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(val.toFixed(1), xPx, h - padBottom + 12);
        }

        // Y Grid
        for (let i = 0; i <= gridSteps; i++) {
            const val = yMin + (yMax - yMin) * (i / gridSteps);
            const yPx = h - padBottom - (val - yMin) / (yMax - yMin) * (h - padTop - padBottom);
            ctx.beginPath();
            ctx.moveTo(padLeft, yPx);
            ctx.lineTo(w - padRight, yPx);
            ctx.stroke();

            // Label Y
            ctx.fillStyle = '#666';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(val.toFixed(1), padLeft - 6, yPx + 3);
        }

        // Draw Axes lines
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, padTop);
        ctx.lineTo(padLeft, h - padBottom);
        ctx.lineTo(w - padRight, h - padBottom);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#000';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(config.xLabel, padLeft + (w - padLeft - padRight)/2, h - 5);

        ctx.save();
        ctx.translate(12, padTop + (h - padTop - padBottom)/2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(config.yLabel, 0, 0);
        ctx.restore();

        // Helper: Eval math expression
        const evalExpr = (expr, x) => {
            try {
                let safe = expr
                    .replace(/cos\(/g, 'Math.cos(')
                    .replace(/sin\(/g, 'Math.sin(')
                    .replace(/tan\(/g, 'Math.tan(')
                    .replace(/sqrt\(/g, 'Math.sqrt(')
                    .replace(/pi/g, 'Math.PI')
                    .replace(/Math.Math./g, 'Math.');
                const fn = new Function('x', `return ${safe};`);
                return fn(x);
            } catch(e) {
                return 0;
            }
        };

        // Plot curves
        config.curves.forEach((curve, cIdx) => {
            ctx.strokeStyle = curve.color || '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            const steps = 100;
            let first = true;
            for (let i = 0; i <= steps; i++) {
                const xVal = xMin + (xMax - xMin) * (i / steps);
                const yVal = evalExpr(curve.expr, xVal);
                
                // Map to pixels
                const xPx = padLeft + (xVal - xMin) / (xMax - xMin) * (w - padLeft - padRight);
                const yPx = h - padBottom - (yVal - yMin) / (yMax - yMin) * (h - padTop - padBottom);
                
                if (yPx >= padTop && yPx <= h - padBottom) {
                    if (first) {
                        ctx.moveTo(xPx, yPx);
                        first = false;
                    } else {
                        ctx.lineTo(xPx, yPx);
                    }
                }
            }
            ctx.stroke();

            // Legend item
            const legX = padLeft + 10 + cIdx * 110;
            ctx.fillStyle = curve.color;
            ctx.fillRect(legX, 6, 12, 6);
            ctx.fillStyle = '#000';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(curve.label, legX + 16, 12);
        });
    }

    drawVectorFieldOnCanvas(canvas, config) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 250 * dpr;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 250;

        ctx.fillStyle = '#0d1326';
        ctx.fillRect(0, 0, w, h);

        const sources = config.sources || [];

        // Draw concentric field or vectors grid
        const gridSz = 16;
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
        ctx.lineWidth = 1.0;

        for (let gx = gridSz; gx < w; gx += gridSz) {
            for (let gy = gridSz; gy < h; gy += gridSz) {
                // Compute magnetic field vector at gx, gy
                let Hx = 0;
                let Hy = 0;

                sources.forEach(src => {
                    const srcX = src.x * w;
                    const srcY = src.y * h;

                    const dx = gx - srcX;
                    const dy = gy - srcY;
                    const r2 = dx*dx + dy*dy + 0.1;
                    const r = Math.sqrt(r2);
                    if (r < 10) return;

                    // Curl field wraps around current source: H_phi = (-dy, dx)
                    const str = (src.strength || 1.0) * 1500;
                    Hx += (-dy / r2) * str;
                    Hy += (dx / r2) * str;
                });

                const len = Math.sqrt(Hx*Hx + Hy*Hy);
                if (len > 0.1) {
                    const maxLen = 12;
                    const drawLen = Math.min(maxLen, len * 0.45);
                    const angle = Math.atan2(Hy, Hx);

                    // Draw grid arrow
                    ctx.save();
                    ctx.translate(gx, gy);
                    ctx.rotate(angle);
                    
                    ctx.strokeStyle = `rgba(96, 165, 250, ${Math.min(0.7, len * 0.1)})`;
                    ctx.beginPath();
                    ctx.moveTo(-drawLen/2, 0);
                    ctx.lineTo(drawLen/2, 0);
                    ctx.lineTo(drawLen/2 - 3, -2);
                    ctx.moveTo(drawLen/2, 0);
                    ctx.lineTo(drawLen/2 - 3, 2);
                    ctx.stroke();
                    
                    ctx.restore();
                }
            }
        }

        // Draw sources
        sources.forEach(src => {
            const sx = src.x * w;
            const sy = src.y * h;

            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label/Type indicator
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            if (src.strength > 0) {
                // Out of page: dot
                ctx.beginPath();
                ctx.arc(sx, sy, 1.5, 0, Math.PI*2);
                ctx.fill();
            } else {
                // Into page: cross
                ctx.fillText('×', sx, sy + 3);
            }
        });
    }

    async syncQuestionToSandbox(qIndex) {
        if (!this.activeCourse) return;

        let targetTopic = 'magnetostatics';
        let setupState = null;

        switch (qIndex) {
            case 0: // Q1: Semi-Infinite Filamentary Conductor
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 4.0, y: 6.0, z: 0.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'finite_wire_q1', type: 'finite_wire', x: 0.0, y: 0.0, z1: -15.0, z2: 0.0, current: 5.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 1: // Q2: Triangular Loop
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 0.0, y: 0.0, z: 5.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'triangle_loop_q2', type: 'triangular_loop', side: 4.0, zOffset: 0.0, current: 10.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 2: // Q3: On-Axis Circular Loop
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 0.0, y: 0.0, z: 4.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'loop_q3', type: 'circular_loop', radius: 3.0, zOffset: 0.0, current: 10.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 3: // Q4: Parallel Infinite Sheets
                targetTopic = 'magnetostatics';
                // Approximate sheets with infinite filamentary currents in opposite directions
                setupState = {
                    observationPoint: { x: 0.0, y: 0.0, z: 2.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'wire_q4_1', type: 'finite_wire', x: -2.0, y: 0.0, z1: -15.0, z2: 15.0, current: -10.0, solveMode: 'none', givenValue: 0 },
                        { id: 'wire_q4_2', type: 'finite_wire', x: 2.0, y: 0.0, z1: -15.0, z2: 15.0, current: 10.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 4: // Q5: Toroidal Coil
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 0.06, y: 0.09, z: 0.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'toroid_q5', type: 'toroid', rho0: 0.10, a: 0.01, N: 1000, current: 0.1, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 5: // Q6: Gauss's Law check
                targetTopic = 'coordinate_toolkit';
                setupState = { gridOverlayMode: 'cylindrical' };
                break;
            case 6: // Q7: Vector Potential Flux
                targetTopic = 'coordinate_toolkit';
                setupState = { gridOverlayMode: 'cylindrical' };
                break;
            case 7: // Q8: Semicircular Forces
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 0.0, y: 1.0, z: 0.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'loop_q8', type: 'circular_loop', radius: 2.0, zOffset: 0.0, current: 3.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 8: // Q9: Radial Force
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 2.12, y: 2.12, z: 0.0 },
                    activeMaterial: 'air',
                    spawnedObjects: [
                        { id: 'wire_q9', type: 'finite_wire', x: 2.12, y: 2.12, z1: -5.0, z2: 5.0, current: 2.5, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
            case 9: // Q10: Solenoid
                targetTopic = 'magnetostatics';
                setupState = {
                    observationPoint: { x: 0.0, y: 0.0, z: 0.0 },
                    activeMaterial: 'iron',
                    spawnedObjects: [
                        { id: 'solenoid_q10', type: 'solenoid', radius: 0.008, length: 0.1, N: 100, current: 5.0, solveMode: 'none', givenValue: 0 }
                    ]
                };
                break;
        }

        // Call loadTopic on active portal simulator
        if (window.activeSimulator && typeof window.activeSimulator.loadTopic === 'function') {
            await window.activeSimulator.loadTopic(targetTopic, setupState);
            alert(`Visualizing Question in 3D Sandbox!\nMounted: ${targetTopic === 'magnetostatics' ? 'Magnetostatics & Biot-Savart' : 'Coordinate Systems'}`);
        }
    }

    injectMarkdownContent(container, markdownText) {
        const { html, blockMath, inlineMath } = this.parseMarkdown(markdownText);
        container.innerHTML = `<div class="sidebar-text-content">${html}</div>`;
        
        // Render block math
        blockMath.forEach(math => {
            const el = container.querySelector(`.katex-display-placeholder[data-id="${math.id}"]`);
            if (el) {
                try {
                    katex.render(math.formula, el, { displayMode: true, throwOnError: false });
                } catch(e) {
                    el.innerText = '$$' + math.formula + '$$';
                }
            }
        });

        // Render inline math
        inlineMath.forEach(math => {
            const el = container.querySelector(`.katex-inline-placeholder[data-id="${math.id}"]`);
            if (el) {
                try {
                    katex.render(math.formula, el, { displayMode: false, throwOnError: false });
                } catch(e) {
                    el.innerText = '$' + math.formula + '$';
                }
            }
        });
    }

    parseMarkdown(text) {
        let blockMath = [];
        let inlineMath = [];
        
        // Extract display math $$...$$
        text = text.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
            const id = `__BLOCK_MATH_${blockMath.length}__`;
            blockMath.push({ id, formula: formula.trim() });
            return `<div class="katex-display-placeholder" data-id="${id}"></div>`;
        });
        
        // Extract inline math $...$
        text = text.replace(/\{(.*?)\}/g, (match, body) => {
             // Leave brackets inside KaTeX equations alone by checking for special placeholders
             return match;
        });
        text = text.replace(/\$(.*?)\$/g, (match, formula) => {
            const id = `__INLINE_MATH_${inlineMath.length}__`;
            inlineMath.push({ id, formula: formula.trim() });
            return `<span class="katex-inline-placeholder" data-id="${id}"></span>`;
        });

        const lines = text.split('\n');
        let html = '';
        let inList = false;
        let listType = ''; // 'ul' | 'ol'
        let inQuote = false;
        let inCalBox = false;

        lines.forEach(line => {
            let trimmed = line.trim();

            if (trimmed.startsWith('<div class="calculation-box">') || trimmed.startsWith('<div class="formula-box">')) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                if (inQuote) { html += '</blockquote>\n'; inQuote = false; }
                inCalBox = true;
                html += '<div class="calculation-box">\n';
                return;
            }
            if (trimmed.startsWith('</div>')) {
                if (inCalBox) {
                    html += '</div>\n';
                    inCalBox = false;
                    return;
                }
            }

            if (trimmed.startsWith('>')) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                if (!inQuote) { html += '<blockquote>\n'; inQuote = true; }
                line = trimmed.substring(1).trim();
                trimmed = line;
            } else if (inQuote && trimmed === '') {
                html += '</blockquote>\n';
                inQuote = false;
            }

            // Headers
            if (trimmed.startsWith('###')) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                html += `<h3>${trimmed.substring(3).trim()}</h3>\n`;
                return;
            }
            if (trimmed.startsWith('##')) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                html += `<h2>${trimmed.substring(2).trim()}</h2>\n`;
                return;
            }
            if (trimmed.startsWith('#')) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                html += `<h1>${trimmed.substring(1).trim()}</h1>\n`;
                return;
            }

            // Lists
            if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                if (!inList || listType !== 'ul') {
                    if (inList) { html += `</${listType}>\n`; }
                    html += '<ul>\n';
                    inList = true;
                    listType = 'ul';
                }
                html += `<li>${this.parseInlineFormatting(trimmed.substring(1).trim())}</li>\n`;
                return;
            }
            if (/^\d+\./.test(trimmed)) {
                if (!inList || listType !== 'ol') {
                    if (inList) { html += `</${listType}>\n`; }
                    html += '<ol>\n';
                    inList = true;
                    listType = 'ol';
                }
                const match = trimmed.match(/^\d+\.\s*(.*)/);
                html += `<li>${this.parseInlineFormatting(match[1])}</li>\n`;
                return;
            }

            if (trimmed === '') {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                return;
            }

            if (inList) { html += `</${listType}>\n`; inList = false; }

            if (trimmed.startsWith('<div') || trimmed.startsWith('<table') || trimmed.startsWith('<tr') || trimmed.startsWith('<th') || trimmed.startsWith('<td')) {
                html += line + '\n';
            } else {
                html += `<p>${this.parseInlineFormatting(trimmed)}</p>\n`;
            }
        });

        if (inList) html += `</${listType}>\n`;
        if (inQuote) html += '</blockquote>\n';
        if (inCalBox) html += '</div>\n';

        return { html, blockMath, inlineMath };
    }

    parseInlineFormatting(text) {
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
            if (url.startsWith('pdf-page://')) {
                const pageNum = url.replace('pdf-page://', '');
                return `<span class="font-mono text-xs border border-black px-1 cursor-pointer bg-gray-100 hover:bg-black hover:text-white" onclick="alert('Refer to Page ${pageNum} of the PDF document.')">PDF Page ${pageNum}</span>`;
            }
            return `<a href="${url}" target="_blank">${linkText}</a>`;
        });
        return text;
    }

    renderCatalog() {
        const catalogContainer = document.getElementById('course-catalog');
        catalogContainer.innerHTML = '';

        COURSE_CATALOG.forEach(sem => {
            const semDiv = document.createElement('div');
            semDiv.className = 'semester-section border-b border-black pb-4 mb-6';
            
            const semHeader = document.createElement('h3');
            semHeader.className = 'text-xl font-bold tracking-tight mb-4 flex items-center cursor-pointer select-none';
            semHeader.innerHTML = `📁 ${sem.semester}`;
            
            const courseList = document.createElement('div');
            courseList.className = 'course-list pl-6 grid gap-4 grid-cols-1 md:grid-cols-2';

            sem.courses.forEach(course => {
                const courseCard = document.createElement('div');
                courseCard.className = 'course-card border border-black p-4 bg-white hover:bg-black hover:text-white transition-colors duration-200 cursor-pointer flex flex-col justify-between';
                courseCard.innerHTML = `
                    <div>
                        <h4 class="font-bold text-lg mb-1">${course.name}</h4>
                        <p class="text-sm opacity-80 mb-4">${course.description}</p>
                    </div>
                    <span class="text-xs font-mono uppercase tracking-wider font-bold">Open Simulator →</span>
                `;
                courseCard.addEventListener('click', () => {
                    this.loadCourse(course);
                });
                courseList.appendChild(courseCard);
            });

            semDiv.appendChild(semHeader);
            semDiv.appendChild(courseList);
            catalogContainer.appendChild(semDiv);
        });
    }

    async loadSavedSimulations() {
        try {
            this.savedSimulations = await window.dbService.getSimulations();
            this.renderSavedSimulations();
        } catch (err) {
            console.error('Error loading saved simulations:', err);
        }
    }

    renderSavedSimulations() {
        if (!this.savedListEl) return;
        this.savedListEl.innerHTML = '';

        if (this.savedSimulations.length === 0) {
            this.savedListEl.innerHTML = '<p class="text-sm text-gray-500 italic">No saved simulations found.</p>';
            return;
        }

        this.savedSimulations.forEach(sim => {
            const item = document.createElement('div');
            item.className = 'border border-black p-3 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2';
            
            const dateStr = new Date(sim.timestamp).toLocaleString();
            
            item.innerHTML = `
                <div class="flex-1">
                    <div class="font-bold text-sm">${sim.name}</div>
                    <div class="text-xs text-gray-500">${sim.course} — ${dateStr}</div>
                </div>
                <div class="flex gap-2 w-full sm:w-auto">
                    <button class="btn-load text-xs border border-black px-2 py-1 flex-1 sm:flex-none hover:bg-black hover:text-white transition-colors">Load</button>
                    <button class="btn-rename text-xs border border-gray-400 text-gray-600 px-2 py-1 flex-1 sm:flex-none hover:bg-black hover:text-white hover:border-black transition-colors">Rename</button>
                    <button class="btn-delete text-xs border border-red-500 text-red-600 px-2 py-1 flex-1 sm:flex-none hover:bg-red-600 hover:text-white transition-colors">Delete</button>
                </div>
            `;

            // Event handlers
            item.querySelector('.btn-load').addEventListener('click', () => {
                const course = this.findCourseByName(sim.course);
                if (course) {
                    this.loadCourse(course, sim.state);
                } else {
                    alert('Course simulator module not found.');
                }
            });

            item.querySelector('.btn-rename').addEventListener('click', async () => {
                const newName = prompt('Enter new name:', sim.name);
                if (newName && newName.trim()) {
                    await window.dbService.renameSimulation(sim.id, newName.trim());
                    await this.loadSavedSimulations();
                }
            });

            item.querySelector('.btn-delete').addEventListener('click', async () => {
                if (confirm(`Delete "${sim.name}"?`)) {
                    await window.dbService.deleteSimulation(sim.id);
                    await this.loadSavedSimulations();
                }
            });

            this.savedListEl.appendChild(item);
        });
    }

    findCourseByName(name) {
        for (const sem of COURSE_CATALOG) {
            const course = sem.courses.find(c => c.name === name);
            if (course) return course;
        }
        return null;
    }

    async loadCourse(course, savedState = null) {
        this.activeCourse = course;
        this.showSimulator();
        
        // Reset workspace mode to Sandbox initially
        this.setWorkspaceMode('sandbox');
        
        // Clean container
        this.simContainerEl.innerHTML = '<div class="flex items-center justify-center h-64"><p class="text-lg animate-pulse">Loading simulator module...</p></div>';
        
        // Update Breadcrumbs
        this.navBreadcrumbsEl.innerHTML = `<span>/</span> <span class="font-bold">${course.name}</span>`;

        try {
            // Load simulator script dynamically
            await this.loadScript(course.path);

            if (window.activeSimulator) {
                // Destroy old one if exists
                if (this.activeSimulator && this.activeSimulator.destroy) {
                    this.activeSimulator.destroy();
                }
                
                this.simContainerEl.innerHTML = '';
                this.activeSimulator = window.activeSimulator;
                
                // Initialize the loaded simulator
                await this.activeSimulator.init(this.simContainerEl, savedState);
            } else {
                throw new Error('Simulator module loaded but activeSimulator not found on window.');
            }
        } catch (err) {
            console.error('Failed to load simulator module:', err);
            this.simContainerEl.innerHTML = `
                <div class="border border-red-500 p-4 text-red-600 bg-red-50">
                    <h4 class="font-bold mb-2">Error Loading Simulator</h4>
                    <p class="text-sm">${err.message}</p>
                </div>
            `;
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            // Remove existing scripts matching this path
            const existingScripts = document.querySelectorAll('script');
            existingScripts.forEach(s => {
                if (s.src && s.src.includes(src.split('?')[0])) {
                    s.remove();
                }
            });

            const script = document.createElement('script');
            script.src = src + '?t=' + Date.now();
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.body.appendChild(script);
        });
    }

    showHome() {
        this.currentView = 'home';
        this.homeViewEl.classList.remove('hidden');
        this.simViewEl.classList.add('hidden');
        this.navBreadcrumbsEl.innerHTML = '';
        
        if (this.activeSimulator && this.activeSimulator.destroy) {
            this.activeSimulator.destroy();
            this.activeSimulator = null;
        }
        this.activeCourse = null;
        this.loadSavedSimulations();
    }

    showSimulator() {
        this.currentView = 'simulator';
        this.homeViewEl.classList.add('hidden');
        this.simViewEl.classList.remove('hidden');
    }

    async handleSave() {
        if (!this.activeCourse || !this.activeSimulator) return;
        
        const simName = prompt('Enter a name to save this simulation state:', `${this.activeCourse.name} State`);
        if (!simName || !simName.trim()) return;

        try {
            const state = this.activeSimulator.getState ? this.activeSimulator.getState() : {};
            const id = 'sim_' + Date.now();
            await window.dbService.saveSimulation(id, simName.trim(), this.activeCourse.name, state);
            alert('Simulation state saved successfully!');
        } catch (err) {
            console.error('Error saving state:', err);
            alert('Failed to save state: ' + err.message);
        }
    }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
    window.appController = new AppController();
});
