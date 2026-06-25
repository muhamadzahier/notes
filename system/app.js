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
        this.workspaceMode = 'sandbox'; // 'sandbox' | 'notes' | 'tutorial' | 'quiz'
        this.layoutMode = 'split'; // 'split' | 'sidebar' | 'viewport'
        
        this.activeChapter = 'chapter3'; // 'chapter3' | 'chapter4'
        this.activeSectionIdx = 0;
        this.activeQuestionIdx = 0;

        // Progress tracking
        this.viewedSections = new Set(); // keys like "chapter3_0", "chapter4_2"
        this.bookmarks = []; // [{chapter, sectionIdx}]
        this.progressDebounceTimer = null;

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
        this.tabQuizEl = document.getElementById('mode-tab-quiz');

        this.layoutToggleContainerEl = document.getElementById('layout-toggle-container');
        this.btnLayoutSplitEl = document.getElementById('btn-layout-split');
        this.btnLayoutSidebarEl = document.getElementById('btn-layout-sidebar');
        this.btnLayoutViewportEl = document.getElementById('btn-layout-viewport');

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
        this.tabQuizEl.addEventListener('click', () => this.setWorkspaceMode('quiz'));

        this.btnLayoutSplitEl.addEventListener('click', () => this.setLayoutMode('split'));
        this.btnLayoutSidebarEl.addEventListener('click', () => this.setLayoutMode('sidebar'));
        this.btnLayoutViewportEl.addEventListener('click', () => this.setLayoutMode('viewport'));

        // Quiz state
        this.quizQuestions = [];
        this.quizCurrentIdx = 0;
        this.quizAnswers = {}; // { questionId: { correct: bool, selected: ... } }
        this.buildQuizQuestions();

        // Initialize homescreen
        this.renderCatalog();
        await this.loadSavedSimulations();

        // Build search index & bind command palette shortcut
        this.buildSearchIndex();
        this.initCommandPalette();
    }

    // ── Cross-Linking & Toast ────────────────────────────────────

    showToast(message) {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
    }

    // Mapping: activeTopic -> related note chapter/section indices
    getRelatedNotes(topicKey) {
        const mapping = {
            electrostatics: { chapter: 'chapter3', sectionIdx: 1 }, // Gauss's Law / Electrostatics section
            magnetostatics: { chapter: 'chapter3', sectionIdx: 0 },  // Intro to Magnetostatics
            faradays_law: { chapter: 'chapter4', sectionIdx: 0 },    // Faraday's Law
            coordinate_toolkit: { chapter: 'chapter3', sectionIdx: 0 }
        };
        return mapping[topicKey] || null;
    }

    openSandboxTopic(topicKey) {
        if (window.activeSimulator && typeof window.activeSimulator.loadTopic === 'function') {
            window.activeSimulator.loadTopic(topicKey, null);
            this.setWorkspaceMode('sandbox');
            this.showToast(`Opened ${topicKey} in 3D Sandbox`);
        }
    }

    navigateToRelatedNotes(topicKey) {
        const related = this.getRelatedNotes(topicKey);
        if (!related) return;
        this.activeChapter = related.chapter;
        this.activeSectionIdx = related.sectionIdx;
        this.setWorkspaceMode('notes');
    }

    // ── Progress Tracking ────────────────────────────────────────

    async loadProgress() {
        if (!this.activeCourse) return;
        try {
            const records = await window.dbService.getProgress(this.activeCourse.id);
            this.viewedSections = new Set();
            this.bookmarks = [];
            records.forEach(rec => {
                if (rec.viewedKeys) rec.viewedKeys.forEach(k => this.viewedSections.add(k));
                if (rec.bookmarks) this.bookmarks = this.bookmarks.concat(rec.bookmarks);
            });
        } catch (e) {
            console.warn('Could not load progress:', e);
        }
    }

    saveProgressDebounced() {
        if (this.progressDebounceTimer) clearTimeout(this.progressDebounceTimer);
        this.progressDebounceTimer = setTimeout(() => this._saveProgressNow(), 2000);
    }

    async _saveProgressNow() {
        if (!this.activeCourse) return;
        try {
            const id = 'progress_' + this.activeCourse.id;
            await window.dbService.saveProgress(
                id,
                this.activeCourse.id,
                this.activeChapter,
                this.activeSectionIdx,
                this.bookmarks,
                // Also save viewed keys
            );
            // Update the record with viewed keys
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('AcademicSimulationsDB');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction('progress', 'readwrite');
            const store = tx.objectStore('progress');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const data = getReq.result;
                if (data) {
                    data.viewedKeys = Array.from(this.viewedSections);
                    store.put(data);
                }
            };
        } catch (e) {
            console.warn('Could not save progress:', e);
        }
    }

    toggleBookmark(chapter, sectionIdx) {
        const existing = this.bookmarks.findIndex(b => b.chapter === chapter && b.sectionIdx === sectionIdx);
        if (existing >= 0) {
            this.bookmarks.splice(existing, 1);
        } else {
            const chapterData = chapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
            const title = chapterData && chapterData.sections[sectionIdx] ? chapterData.sections[sectionIdx].title : `Section ${sectionIdx}`;
            this.bookmarks.push({ chapter, sectionIdx, title });
        }
        this._saveProgressNow();
        this.renderNotesSidebar();
    }

    isBookmarked(chapter, sectionIdx) {
        return this.bookmarks.some(b => b.chapter === chapter && b.sectionIdx === sectionIdx);
    }

    // ── Command Palette (Ctrl+K) ──────────────────────────────────

    buildSearchIndex() {
        this.searchIndex = [];

        // Index note sections
        const chapters = [
            { key: 'chapter3', data: window.chapter3Notes, label: 'Ch3 Notes' },
            { key: 'chapter4', data: window.chapter4Notes, label: 'Ch4 Notes' }
        ];
        chapters.forEach(ch => {
            if (!ch.data || !ch.data.sections) return;
            ch.data.sections.forEach((sec, idx) => {
                const snippet = (sec.content || '').replace(/[#*$~`\[\]()>]/g, '').substring(0, 100);
                this.searchIndex.push({
                    type: 'note',
                    badge: ch.label,
                    title: sec.title,
                    snippet: snippet,
                    chapter: ch.key,
                    sectionIdx: idx
                });
            });
        });

        // Index tutorial questions
        if (window.tutorialC3 && window.tutorialC3.sections) {
            window.tutorialC3.sections.forEach((sec, idx) => {
                const snippet = (sec.content || '').replace(/[#*$~`\[\]()>]/g, '').substring(0, 100);
                this.searchIndex.push({
                    type: 'tutorial',
                    badge: 'Tutorial',
                    title: sec.title,
                    snippet: snippet,
                    questionIdx: idx
                });
            });
        }

        // Index simulator topics
        const topics = [
            { title: 'Electrostatics Sandbox', topic: 'electrostatics' },
            { title: 'Magnetostatics & Biot-Savart', topic: 'magnetostatics' },
            { title: "Faraday's Law & Motional EMF", topic: 'faradays_law' },
            { title: 'Coordinate Transformation', topic: 'coordinate_toolkit' }
        ];
        topics.forEach(t => {
            this.searchIndex.push({
                type: 'simulator',
                badge: 'Sandbox',
                title: t.title,
                snippet: 'Open in 3D sandbox',
                topic: t.topic
            });
        });
    }

    initCommandPalette() {
        this.cmdOverlay = document.getElementById('cmd-palette-overlay');
        this.cmdInput = document.getElementById('cmd-palette-input');
        this.cmdResults = document.getElementById('cmd-palette-results');
        this.cmdSelectedIdx = 0;
        this.cmdFilteredResults = [];

        // Ctrl+K / Cmd+K shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.showCommandPalette();
            }
            if (e.key === 'Escape' && this.cmdOverlay && this.cmdOverlay.style.display !== 'none') {
                this.hideCommandPalette();
            }
        });

        // Input filtering
        if (this.cmdInput) {
            this.cmdInput.addEventListener('input', () => this.filterCommandResults());
            this.cmdInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); this.moveCmdSelection(1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); this.moveCmdSelection(-1); }
                if (e.key === 'Enter') { e.preventDefault(); this.selectCmdResult(); }
            });
        }

        // Close on overlay click
        if (this.cmdOverlay) {
            this.cmdOverlay.addEventListener('click', (e) => {
                if (e.target === this.cmdOverlay) this.hideCommandPalette();
            });
        }
    }

    showCommandPalette() {
        if (!this.cmdOverlay) return;
        this.cmdOverlay.style.display = '';
        this.cmdInput.value = '';
        this.cmdSelectedIdx = 0;
        this.filterCommandResults();
        this.cmdInput.focus();
    }

    hideCommandPalette() {
        if (this.cmdOverlay) this.cmdOverlay.style.display = 'none';
    }

    filterCommandResults() {
        const query = (this.cmdInput.value || '').toLowerCase().trim();
        if (!query) {
            this.cmdFilteredResults = this.searchIndex.slice(0, 20);
        } else {
            this.cmdFilteredResults = this.searchIndex.filter(item => {
                return item.title.toLowerCase().includes(query) ||
                       item.snippet.toLowerCase().includes(query) ||
                       item.badge.toLowerCase().includes(query);
            }).slice(0, 20);
        }
        this.cmdSelectedIdx = 0;
        this.renderCommandResults();
    }

    renderCommandResults() {
        if (!this.cmdResults) return;
        if (this.cmdFilteredResults.length === 0) {
            this.cmdResults.innerHTML = '<div class="cmd-empty">No results found</div>';
            return;
        }
        this.cmdResults.innerHTML = '';
        this.cmdFilteredResults.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'cmd-palette-item' + (idx === this.cmdSelectedIdx ? ' selected' : '');
            div.innerHTML = `
                <span class="cmd-badge">${item.badge}</span>
                <span>${item.title}</span>
                <span class="cmd-hint">${item.type === 'note' ? item.snippet.substring(0, 50) + '...' : ''}</span>
            `;
            div.addEventListener('click', () => {
                this.cmdSelectedIdx = idx;
                this.selectCmdResult();
            });
            div.addEventListener('mouseenter', () => {
                this.cmdSelectedIdx = idx;
                this.renderCommandResults();
            });
            this.cmdResults.appendChild(div);
        });
    }

    moveCmdSelection(dir) {
        const len = this.cmdFilteredResults.length;
        if (len === 0) return;
        this.cmdSelectedIdx = (this.cmdSelectedIdx + dir + len) % len;
        this.renderCommandResults();
        // Scroll into view
        const items = this.cmdResults.querySelectorAll('.cmd-palette-item');
        if (items[this.cmdSelectedIdx]) items[this.cmdSelectedIdx].scrollIntoView({ block: 'nearest' });
    }

    selectCmdResult() {
        const item = this.cmdFilteredResults[this.cmdSelectedIdx];
        if (!item) return;
        this.hideCommandPalette();

        if (item.type === 'note') {
            // Ensure EM course is loaded, switch to notes mode
            if (!this.activeCourse || this.activeCourse.id !== 'em_theory') {
                const course = COURSE_CATALOG[0].courses.find(c => c.id === 'em_theory');
                if (course) this.loadCourse(course);
            }
            this.activeChapter = item.chapter;
            this.activeSectionIdx = item.sectionIdx;
            this.setWorkspaceMode('notes');
        } else if (item.type === 'tutorial') {
            if (!this.activeCourse || this.activeCourse.id !== 'em_theory') {
                const course = COURSE_CATALOG[0].courses.find(c => c.id === 'em_theory');
                if (course) this.loadCourse(course);
            }
            this.activeQuestionIdx = item.questionIdx;
            this.setWorkspaceMode('tutorial');
        } else if (item.type === 'simulator') {
            if (window.activeSimulator && typeof window.activeSimulator.loadTopic === 'function') {
                window.activeSimulator.loadTopic(item.topic, null);
            }
            this.setWorkspaceMode('sandbox');
        }
    }

    setWorkspaceMode(mode) {
        this.workspaceMode = mode;
        
        // Remove active class from all tabs
        this.tabSandboxEl.classList.remove('active');
        this.tabNotesEl.classList.remove('active');
        this.tabTutorialsEl.classList.remove('active');
        this.tabQuizEl.classList.remove('active');

        // Reset workspace layout styles
        this.workspaceLayoutEl.classList.remove('portal-mode-sandbox', 'portal-mode-split', 'layout-split', 'layout-sidebar-only', 'layout-viewport-only');

        if (mode === 'sandbox') {
            this.tabSandboxEl.classList.add('active');
            this.workspaceLayoutEl.classList.add('portal-mode-sandbox');
            if (this.layoutToggleContainerEl) {
                this.layoutToggleContainerEl.style.display = 'none';
            }
        } else {
            if (this.layoutToggleContainerEl) {
                this.layoutToggleContainerEl.style.display = 'flex';
            }
            if (mode === 'quiz') {
                this.tabQuizEl.classList.add('active');
                this.workspaceLayoutEl.classList.add('portal-mode-split');
                this.renderQuizSidebar();
            } else {
                if (mode === 'notes') {
                    this.tabNotesEl.classList.add('active');
                } else {
                    this.tabTutorialsEl.classList.add('active');
                }
                this.workspaceLayoutEl.classList.add('portal-mode-split');
                this.renderSidebarContent();
            }
            // Apply the layout mode
            this.setLayoutMode(this.layoutMode);
        }

        // Trigger window resize so Three.js adjust canvas resolution
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 50);
    }

    setLayoutMode(layout) {
        this.layoutMode = layout;
        
        // Remove existing layout mode classes
        this.workspaceLayoutEl.classList.remove('layout-split', 'layout-sidebar-only', 'layout-viewport-only');
        
        // Remove active class from layout buttons
        this.btnLayoutSplitEl.classList.remove('active');
        this.btnLayoutSidebarEl.classList.remove('active');
        this.btnLayoutViewportEl.classList.remove('active');

        if (layout === 'split') {
            this.workspaceLayoutEl.classList.add('layout-split');
            this.btnLayoutSplitEl.classList.add('active');
        } else if (layout === 'sidebar') {
            this.workspaceLayoutEl.classList.add('layout-sidebar-only');
            this.btnLayoutSidebarEl.classList.add('active');
        } else if (layout === 'viewport') {
            this.workspaceLayoutEl.classList.add('layout-viewport-only');
            this.btnLayoutViewportEl.classList.add('active');
        }

        // Trigger window resize so that Canvas elements update their layout/sizes
        window.dispatchEvent(new Event('resize'));

        // Propagate resize event to all child iframes immediately and after a short delay
        const resizeIframes = () => {
            document.querySelectorAll('iframe').forEach(iframe => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.dispatchEvent(new Event('resize'));
                }
            });
        };
        resizeIframes();
        setTimeout(resizeIframes, 100);
        setTimeout(resizeIframes, 300);
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

        // Progress bar
        const chapterData = this.activeChapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
        const totalSections = chapterData.sections.length;
        const viewedCount = chapterData.sections.filter((_, idx) =>
            this.viewedSections.has(`${this.activeChapter}_${idx}`)
        ).length;
        const pct = totalSections > 0 ? Math.round((viewedCount / totalSections) * 100) : 0;

        const progressDiv = document.createElement('div');
        progressDiv.style.cssText = 'padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--gray-light); font-size: 0.7rem; font-weight: 700;';
        progressDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                <span>${viewedCount} of ${totalSections} sections viewed</span>
                <span>${pct}%</span>
            </div>
            <div style="height: 4px; background: var(--gray-medium); width: 100%;">
                <div style="height: 100%; width: ${pct}%; background: #000; transition: width 0.3s;"></div>
            </div>
        `;
        this.workspaceSidebarEl.appendChild(progressDiv);

        // Bookmarks section
        const bmSections = this.bookmarks.filter(b => b.chapter === this.activeChapter);
        if (bmSections.length > 0) {
            const bmDiv = document.createElement('div');
            bmDiv.style.cssText = 'padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 0.7rem;';
            bmDiv.innerHTML = '<div style="font-weight: 700; margin-bottom: 0.25rem;">\u2605 Bookmarks</div>';
            bmSections.forEach(bm => {
                const bmItem = document.createElement('div');
                bmItem.style.cssText = 'cursor: pointer; padding: 0.15rem 0; color: var(--gray-dark);';
                bmItem.textContent = `\u2605 ${bm.title}`;
                bmItem.addEventListener('click', () => {
                    this.activeSectionIdx = bm.sectionIdx;
                    this.renderNotesSidebar();
                });
                bmDiv.appendChild(bmItem);
            });
            this.workspaceSidebarEl.appendChild(bmDiv);
        }

        const header = document.createElement('div');
        header.className = 'workspace-sidebar-header';
        const bmActive = this.isBookmarked(this.activeChapter, this.activeSectionIdx);
        header.innerHTML = `
            <select class="sidebar-select" id="notes-chapter-select">
                <option value="chapter3" ${this.activeChapter === 'chapter3' ? 'selected' : ''}>Chapter 3: Magnetostatics</option>
                <option value="chapter4" ${this.activeChapter === 'chapter4' ? 'selected' : ''}>Chapter 4: Time-Varying Fields</option>
            </select>
            <div style="display: flex; gap: 0.5rem;">
                <select class="sidebar-select" id="notes-section-select" style="flex: 1;"></select>
                <button id="btn-toggle-bookmark" title="Toggle bookmark" style="border: 1px solid var(--border-color); background: ${bmActive ? '#000' : '#fff'}; color: ${bmActive ? '#fff' : '#000'}; cursor: pointer; padding: 0 0.5rem; font-size: 1rem;">\u2605</button>
            </div>
        `;
        this.workspaceSidebarEl.appendChild(header);

        const content = document.createElement('div');
        content.className = 'workspace-sidebar-content';
        content.id = 'notes-content-area';
        this.workspaceSidebarEl.appendChild(content);

        const sectionSelect = document.getElementById('notes-section-select');
        const chapterSelect = document.getElementById('notes-chapter-select');

        // Populate sections list
        chapterData.sections.forEach((sec, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            const viewed = this.viewedSections.has(`${this.activeChapter}_${idx}`);
            opt.innerText = (viewed ? '\u2713 ' : '') + sec.title;
            if (idx === this.activeSectionIdx) opt.selected = true;
            sectionSelect.appendChild(opt);
        });

        // Bookmark toggle
        const btnBm = document.getElementById('btn-toggle-bookmark');
        if (btnBm) {
            btnBm.addEventListener('click', () => {
                this.toggleBookmark(this.activeChapter, this.activeSectionIdx);
            });
        }

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

    updateProgressBar() {
        // Re-render sidebar to update progress bar (lightweight approach)
        // Only if already in notes mode
        if (this.workspaceMode === 'notes') {
            // Find and update just the progress bar without full re-render
            const progressDiv = this.workspaceSidebarEl.querySelector('div[style*="sections viewed"]');
            if (!progressDiv) return;
            const chapterData = this.activeChapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
            const totalSections = chapterData.sections.length;
            const viewedCount = chapterData.sections.filter((_, idx) =>
                this.viewedSections.has(`${this.activeChapter}_${idx}`)
            ).length;
            const pct = totalSections > 0 ? Math.round((viewedCount / totalSections) * 100) : 0;
            const parent = progressDiv.parentElement;
            if (parent) {
                parent.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                        <span>${viewedCount} of ${totalSections} sections viewed</span>
                        <span>${pct}%</span>
                    </div>
                    <div style="height: 4px; background: var(--gray-medium); width: 100%;">
                        <div style="height: 100%; width: ${pct}%; background: #000; transition: width 0.3s;"></div>
                    </div>
                `;
            }
        }
    }

    // ── Quiz Mode (Active Recall) ───────────────────────────────

    buildQuizQuestions() {
        this.quizQuestions = [];
        const chapters = [
            { key: 'chapter3', data: window.chapter3Notes },
            { key: 'chapter4', data: window.chapter4Notes }
        ];

        chapters.forEach(ch => {
            if (!ch.data || !ch.data.sections) return;
            ch.data.sections.forEach((sec, secIdx) => {
                if (!sec.equations) return;
                sec.equations.forEach((eq, eqIdx) => {
                    // MCQ: "Which equation represents <label>?"
                    const correctLatex = eq.latex;
                    // Generate distractors from other equations
                    const allEqs = [];
                    chapters.forEach(c2 => {
                        if (!c2.data || !c2.data.sections) return;
                        c2.data.sections.forEach(s2 => {
                            if (s2.equations) s2.equations.forEach(e => allEqs.push(e));
                        });
                    });
                    const distractors = allEqs
                        .filter(e => e.latex !== correctLatex)
                        .sort(() => Math.random() - 0.5)
                        .slice(0, 3);

                    const options = [
                        { label: eq.latex, correct: true },
                        ...distractors.map(d => ({ label: d.latex, correct: false }))
                    ].sort(() => Math.random() - 0.5);

                    this.quizQuestions.push({
                        id: `mcq_${ch.key}_${secIdx}_${eqIdx}`,
                        type: 'mcq',
                        question: `Which equation represents "${eq.label}"?`,
                        options,
                        answer: eq.latex,
                        explanation: `The correct equation for ${eq.label} is: ${eq.latex}`,
                        relatedChapter: ch.key,
                        relatedSection: secIdx,
                        sectionTitle: sec.title
                    });

                    // Derive-and-reveal: "Write the equation for <label>"
                    this.quizQuestions.push({
                        id: `dar_${ch.key}_${secIdx}_${eqIdx}`,
                        type: 'derive',
                        question: `Write the mathematical equation for: ${eq.label}`,
                        answer: eq.latex,
                        explanation: `The equation for ${eq.label}: ${eq.latex}`,
                        relatedChapter: ch.key,
                        relatedSection: secIdx,
                        sectionTitle: sec.title
                    });
                });
            });
        });
    }

    renderQuizSidebar() {
        if (!this.workspaceSidebarEl) return;
        this.workspaceSidebarEl.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'workspace-sidebar-header';
        header.innerHTML = `
            <div style="font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary);">
                Active Recall Quiz
            </div>
            <div style="font-size: 0.7rem; color: #666;">${Object.keys(this.quizAnswers).length} / ${this.quizQuestions.length} answered</div>
        `;
        this.workspaceSidebarEl.appendChild(header);

        const content = document.createElement('div');
        content.className = 'workspace-sidebar-content';
        content.id = 'quiz-content-area';
        this.workspaceSidebarEl.appendChild(content);

        if (this.quizQuestions.length === 0) {
            content.innerHTML = '<p style="font-size: 0.8rem; color: #666; padding: 1rem;">No quiz questions available. Load a course first.</p>';
            return;
        }

        // Check if all answered -> show summary
        if (Object.keys(this.quizAnswers).length >= this.quizQuestions.length) {
            this.renderQuizSummary(content);
            return;
        }

        const q = this.quizQuestions[this.quizCurrentIdx % this.quizQuestions.length];
        const answered = this.quizAnswers[q.id];

        const qDiv = document.createElement('div');
        qDiv.style.cssText = 'padding: 0.5rem 0;';

        // Question counter
        qDiv.innerHTML = `
            <div style="font-size: 0.65rem; color: #888; margin-bottom: 0.5rem;">
                Question ${this.quizCurrentIdx + 1} of ${this.quizQuestions.length}
                <span style="margin-left: 0.5rem; border: 1px solid #ddd; padding: 0 0.3rem;">${q.type.toUpperCase()}</span>
            </div>
            <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 1rem;">${q.question}</div>
        `;

        if (q.type === 'mcq') {
            q.options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.style.cssText = `display: block; width: 100%; text-align: left; padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid var(--border-color); cursor: pointer; font-size: 0.8rem; background: white; transition: all 0.15s;`;
                btn.innerHTML = `<span style="font-weight: 700; margin-right: 0.5rem;">${String.fromCharCode(65 + i)}.</span><span class="katex-opt-${i}">${opt.label}</span>`;

                if (answered) {
                    btn.disabled = true;
                    btn.style.cursor = 'default';
                    if (opt.correct) {
                        btn.style.background = '#dcfce7';
                        btn.style.borderColor = '#22c55e';
                    } else if (answered.selected === opt.label && !opt.correct) {
                        btn.style.background = '#fef2f2';
                        btn.style.borderColor = '#dc2626';
                    }
                } else {
                    btn.addEventListener('click', () => this.checkQuizAnswer(q, opt.label));
                }
                qDiv.appendChild(btn);
            });
        } else if (q.type === 'derive') {
            const revealBtn = document.createElement('button');
            revealBtn.className = 'btn-solve-action';
            revealBtn.textContent = answered ? 'Already Revealed' : 'Reveal Answer';
            revealBtn.style.marginBottom = '0.75rem';
            if (!answered) {
                revealBtn.addEventListener('click', () => this.checkQuizAnswer(q, '__reveal__'));
            }
            qDiv.appendChild(revealBtn);

            if (answered) {
                const ansDiv = document.createElement('div');
                ansDiv.style.cssText = 'border: 2px solid var(--border-color); padding: 0.75rem; background: var(--gray-light);';
                ansDiv.innerHTML = `<div class="katex-derive-answer">${q.answer}</div>`;
                qDiv.appendChild(ansDiv);
            }
        }

        // Explanation (shown after answering)
        if (answered) {
            const expDiv = document.createElement('div');
            expDiv.style.cssText = 'margin-top: 1rem; padding: 0.75rem; border: 1px solid var(--border-color); background: #fafafa; font-size: 0.75rem;';
            expDiv.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.25rem; color: ${answered.correct ? '#16a34a' : '#dc2626'};">
                    ${answered.correct ? '\u2705 Correct!' : '\u274C Incorrect'}
                </div>
                <div class="katex-explanation">${q.explanation}</div>
                <div style="margin-top: 0.5rem;">
                    <a href="#" class="quiz-review-link" style="font-size: 0.7rem; color: #3b82f6;">Review: ${q.sectionTitle}</a>
                </div>
            `;
            qDiv.appendChild(expDiv);

            // Review link
            const reviewLink = expDiv.querySelector('.quiz-review-link');
            if (reviewLink) {
                reviewLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.activeChapter = q.relatedChapter;
                    this.activeSectionIdx = q.relatedSection;
                    this.setWorkspaceMode('notes');
                });
            }
        }

        // Navigation buttons
        const navDiv = document.createElement('div');
        navDiv.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 1rem;';
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn-minimal';
        prevBtn.style.cssText = 'flex: 1; font-size: 0.7rem; text-align: center;';
        prevBtn.textContent = '\u2190 Previous';
        prevBtn.addEventListener('click', () => {
            this.quizCurrentIdx = (this.quizCurrentIdx - 1 + this.quizQuestions.length) % this.quizQuestions.length;
            this.renderQuizSidebar();
        });
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-minimal';
        nextBtn.style.cssText = 'flex: 1; font-size: 0.7rem; text-align: center;';
        nextBtn.textContent = 'Next \u2192';
        nextBtn.addEventListener('click', () => {
            this.quizCurrentIdx = (this.quizCurrentIdx + 1) % this.quizQuestions.length;
            this.renderQuizSidebar();
        });
        navDiv.appendChild(prevBtn);
        navDiv.appendChild(nextBtn);
        qDiv.appendChild(navDiv);

        content.appendChild(qDiv);

        // Render KaTeX in options
        setTimeout(() => {
            content.querySelectorAll('.katex-opt-0, .katex-opt-1, .katex-opt-2, .katex-opt-3, .katex-derive-answer, .katex-explanation').forEach(el => {
                try {
                    katex.render(el.textContent, el, { displayMode: false, throwOnError: false });
                } catch (e) { /* leave as text */ }
            });
        }, 50);
    }

    checkQuizAnswer(question, selected) {
        let correct = false;
        if (question.type === 'mcq') {
            correct = selected === question.answer;
        } else if (question.type === 'derive') {
            correct = true; // Reveal always shows the answer
        }

        this.quizAnswers[question.id] = { correct, selected };
        this.renderQuizSidebar();
    }

    renderQuizSummary(container) {
        const total = this.quizQuestions.length;
        const answered = Object.keys(this.quizAnswers).length;
        const correctCount = Object.values(this.quizAnswers).filter(a => a.correct).length;
        const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

        container.innerHTML = `
            <div style="padding: 1rem 0;">
                <h3 style="font-size: 1rem; font-weight: 800; text-transform: uppercase; margin-bottom: 1rem;">Quiz Complete!</h3>
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem;">
                    <span>Score</span>
                    <span style="font-weight: 700;">${correctCount} / ${total} (${pct}%)</span>
                </div>
                <div style="height: 8px; background: var(--gray-medium); margin-bottom: 1.5rem;">
                    <div style="height: 100%; width: ${pct}%; background: ${pct >= 70 ? '#22c55e' : '#ef4444'}; transition: width 0.3s;"></div>
                </div>
                <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.5rem;">Weak Areas (Review These):</div>
                <div id="quiz-weak-areas"></div>
                <button class="btn-minimal" id="btn-retry-quiz" style="width: 100%; text-align: center; margin-top: 1rem; font-size: 0.75rem;">Retry Quiz</button>
            </div>
        `;

        const weakArea = container.querySelector('#quiz-weak-areas');
        const wrongQuestions = this.quizQuestions.filter(q => this.quizAnswers[q.id] && !this.quizAnswers[q.id].correct);
        if (wrongQuestions.length === 0) {
            weakArea.innerHTML = '<div style="font-size: 0.75rem; color: #22c55e;">Perfect score! No weak areas.</div>';
        } else {
            wrongQuestions.forEach(q => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 0.35rem 0; border-bottom: 1px solid var(--gray-medium); font-size: 0.75rem; cursor: pointer;';
                item.innerHTML = `<span style="color: #dc2626;">\u274C</span> ${q.question.substring(0, 60)}... <span style="color: #3b82f6;">[${q.sectionTitle}]</span>`;
                item.addEventListener('click', () => {
                    this.activeChapter = q.relatedChapter;
                    this.activeSectionIdx = q.relatedSection;
                    this.setWorkspaceMode('notes');
                });
                weakArea.appendChild(item);
            });
        }

        const retryBtn = container.querySelector('#btn-retry-quiz');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.quizAnswers = {};
                this.quizCurrentIdx = 0;
                this.renderQuizSidebar();
            });
        }
    }

    loadActiveSectionContent() {
        const contentArea = document.getElementById('notes-content-area');
        if (!contentArea) return;
        contentArea.innerHTML = '';

        const chapterData = this.activeChapter === 'chapter3' ? window.chapter3Notes : window.chapter4Notes;
        const section = chapterData.sections[this.activeSectionIdx];

        if (!section) return;

        // Track progress
        this.viewedSections.add(`${this.activeChapter}_${this.activeSectionIdx}`);
        this.saveProgressDebounced();
        this.updateProgressBar();

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
            iframe.style.height = '500px';
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
        } else if (vis.type === 'wave' && vis.config) {
            const canvas = document.createElement('canvas');
            canvas.className = 'vector-field-canvas';
            target.appendChild(canvas);
            this.drawWaveOnCanvas(canvas, vis.config);
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

    drawWaveOnCanvas(canvas, config) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 250 * dpr;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = 250;
        const midY = h / 2;

        // Dark background
        ctx.fillStyle = '#0d1326';
        ctx.fillRect(0, 0, w, h);

        const freq = config.frequency || 1.0;
        const amp = (config.amplitude || 0.8) * (h * 0.35);
        const wavelengthPx = config.wavelength || 150;
        const k = (2 * Math.PI) / wavelengthPx;
        const padX = 30;
        const drawW = w - padX * 2;

        // Draw propagation axis
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padX, midY);
        ctx.lineTo(w - padX, midY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Axis label
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('propagation →', w - padX, midY - 5);

        // Draw E-field wave (red, vertical oscillation)
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px <= drawW; px++) {
            const x = padX + px;
            const y = midY - amp * Math.sin(k * px);
            if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw B-field wave (blue, horizontal oscillation shown as depth offset)
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px <= drawW; px++) {
            const x = padX + px;
            const y = midY - amp * Math.cos(k * px);
            if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw vertical field vectors at key points for E-field
        const step = wavelengthPx / 4;
        ctx.lineWidth = 1;
        for (let px = 0; px <= drawW; px += step) {
            const x = padX + px;
            const eVal = amp * Math.sin(k * px);
            // E-field arrow (red)
            ctx.strokeStyle = 'rgba(239,68,68,0.5)';
            ctx.beginPath();
            ctx.moveTo(x, midY);
            ctx.lineTo(x, midY - eVal);
            ctx.stroke();
        }

        // Legend
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(padX + 5, 8, 12, 6);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('E-field', padX + 22, 14);

        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(padX + 80, 8, 12, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('B-field', padX + 97, 14);

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`f=${freq} Hz, λ=${wavelengthPx}px`, padX + 5, h - 8);
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
            this.showToast(`Visualizing in 3D Sandbox: ${targetTopic === 'magnetostatics' ? 'Magnetostatics & Biot-Savart' : 'Coordinate Systems'}`);
            this.setWorkspaceMode('sandbox');
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
        let inCodeBlock = false;
        let codeBlockContent = '';
        let codeBlockLang = '';

        lines.forEach(line => {
            let trimmed = line.trim();

            // Fenced code blocks (```)
            if (trimmed.startsWith('```')) {
                if (!inCodeBlock) {
                    if (inList) { html += `</${listType}>\n`; inList = false; }
                    if (inQuote) { html += '</blockquote>\n'; inQuote = false; }
                    inCodeBlock = true;
                    codeBlockLang = trimmed.substring(3).trim();
                    codeBlockContent = '';
                } else {
                    const escaped = codeBlockContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    html += `<pre class="formula-box"><code>${escaped}</code></pre>\n`;
                    inCodeBlock = false;
                    codeBlockContent = '';
                    codeBlockLang = '';
                }
                return;
            }
            if (inCodeBlock) {
                codeBlockContent += line + '\n';
                return;
            }

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

            // Headers (h6 first to avoid false matches on h5, h4, etc.)
            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
            if (headingMatch) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                const level = headingMatch[1].length;
                const tag = level <= 3 ? `h${level}` : 'h3'; // cap at h3 for styling
                html += `<${tag}>${headingMatch[2].trim()}</${tag}>\n`;
                return;
            }

            // Horizontal rules
            if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
                if (inList) { html += `</${listType}>\n`; inList = false; }
                html += '<hr>\n';
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

            if (trimmed.startsWith('<div') || trimmed.startsWith('<table') || trimmed.startsWith('<tr') || trimmed.startsWith('<th') || trimmed.startsWith('<td') || trimmed.startsWith('</')) {
                html += line + '\n';
            } else {
                html += `<p>${this.parseInlineFormatting(trimmed)}</p>\n`;
            }
        });

        if (inList) html += `</${listType}>\n`;
        if (inQuote) html += '</blockquote>\n';
        if (inCalBox) html += '</div>\n';
        // Handle unterminated code block
        if (inCodeBlock) {
            const escaped = codeBlockContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<pre class="formula-box"><code>${escaped}</code></pre>\n`;
        }

        return { html, blockMath, inlineMath };
    }

    parseInlineFormatting(text) {
        // Sandbox cross-link tags: {{sandbox:topicKey}}
        text = text.replace(/\{\{sandbox:([a-z_]+)\}\}/gi, (match, topic) => {
            return `<button class="sandbox-link-pill" onclick="window.appController.openSandboxTopic('${topic}')">\u25B6 Open in 3D: ${topic}</button>`;
        });
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/~~(.*?)~~/g, '<del>$1</del>');
        // Images: ![alt](url)
        text = text.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;border:1px solid var(--border-color);">');
        // Links: [text](url)
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
        
        // Load saved progress
        await this.loadProgress();

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
