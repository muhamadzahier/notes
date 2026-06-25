// Consolidated Electromagnetic Sandbox Portal
// For Semester 2 - Electromagnetic Theory

(function() {
    let container;
    let activeTopic = 'electrostatics'; // 'electrostatics' | 'magnetostatics' | 'faradays_law' | 'coordinate_toolkit'
    let activeSubModule = null;
    let portalContainer = null;
    let subModuleContainer = null;

    // Sub-module script paths registry
    const TOPIC_MODULES = {
        electrostatics: {
            name: "Electrostatics Sandbox",
            path: "semester 2/Electromagnetic Theory/em_simulator.js",
            globalName: "electrostaticsModule"
        },
        magnetostatics: {
            name: "Magnetostatics & Biot-Savart",
            path: "semester 2/Electromagnetic Theory/magnetostatics.js",
            globalName: "magnetostaticsModule"
        },
        faradays_law: {
            name: "Faraday's Law & Motional EMF",
            path: "semester 2/Electromagnetic Theory/faradays_law.js",
            globalName: "faradaysLawModule"
        },
        coordinate_toolkit: {
            name: "Coordinate Transformation",
            path: "semester 2/Electromagnetic Theory/coordinate_toolkit.js",
            globalName: "coordinateToolkitModule"
        }
    };

    const sandboxPortal = {
        async init(containerEl, savedState) {
            container = containerEl;

            // Load saved topic if exists
            let subState = null;
            if (savedState) {
                activeTopic = savedState.activeTopic || 'electrostatics';
                subState = savedState.subState;
            }

            // Create portal skeleton layout
            this.buildPortalLayout();

            // Build navigation tabs in header bar
            this.buildHeaderTabs();

            // Load initial sub-module
            await this.loadTopic(activeTopic, subState);
        },

        buildPortalLayout() {
            container.innerHTML = `
                <div id="em-portal-wrapper" style="display: flex; flex-direction: column; width: 100%; height: 100%;">
                    <!-- Inner Container for Sub-Module injection -->
                    <div id="sub-module-target" style="flex: 1; width: 100%;"></div>
                </div>
            `;

            portalContainer = document.getElementById('em-portal-wrapper');
            subModuleContainer = document.getElementById('sub-module-target');
        },

        buildHeaderTabs() {
            const headerBar = document.querySelector('.simulator-header-bar');
            if (!headerBar) return;

            // Clean up existing tabs container if any
            let tabsContainer = document.getElementById('em-header-tabs');
            if (tabsContainer) {
                tabsContainer.remove();
            }

            tabsContainer = document.createElement('div');
            tabsContainer.id = 'em-header-tabs';
            tabsContainer.style.display = 'flex';
            tabsContainer.style.gap = '0.5rem';
            tabsContainer.style.flexWrap = 'wrap';

            const topics = [
                { key: 'electrostatics', label: 'Electrostatics' },
                { key: 'magnetostatics', label: 'Magnetostatics' },
                { key: 'faradays_law', label: "Faraday's Law" },
                { key: 'coordinate_toolkit', label: 'Coordinates' }
            ];

            topics.forEach(topic => {
                const btn = document.createElement('button');
                btn.className = 'btn-minimal';
                btn.innerText = topic.label;
                btn.style.fontSize = '0.75rem';
                btn.style.padding = '0.35rem 0.75rem';
                btn.style.fontWeight = 'bold';
                btn.style.transition = 'all 0.2s';
                btn.setAttribute('data-topic', topic.key);

                btn.addEventListener('click', async () => {
                    await this.loadTopic(topic.key);
                });

                tabsContainer.appendChild(btn);
            });

            // Related Notes cross-link button
            const relatedBtn = document.createElement('button');
            relatedBtn.className = 'btn-related-notes';
            relatedBtn.id = 'btn-related-notes';
            relatedBtn.innerText = '\u{1F4D6} Related Notes';
            relatedBtn.addEventListener('click', () => {
                if (window.appController && typeof window.appController.navigateToRelatedNotes === 'function') {
                    window.appController.navigateToRelatedNotes(activeTopic);
                }
            });
            tabsContainer.appendChild(relatedBtn);

            // Insert header tabs before the save button division
            headerBar.insertBefore(tabsContainer, headerBar.lastElementChild);

            this.updateHeaderTabsUI();
        },

        updateHeaderTabsUI() {
            const tabsContainer = document.getElementById('em-header-tabs');
            if (!tabsContainer) return;

            Array.from(tabsContainer.children).forEach(btn => {
                const topicKey = btn.getAttribute('data-topic');
                if (topicKey === activeTopic) {
                    btn.style.backgroundColor = '#000000';
                    btn.style.color = '#ffffff';
                } else {
                    btn.style.backgroundColor = 'transparent';
                    btn.style.color = '#000000';
                }
            });
        },

        async loadTopic(topicKey, savedSubState = null) {
            // Clean up previous active module
            if (activeSubModule && activeSubModule.destroy) {
                activeSubModule.destroy();
                activeSubModule = null;
            }

            activeTopic = topicKey;
            this.updateHeaderTabsUI();
            
            subModuleContainer.innerHTML = '<div class="flex items-center justify-center h-64"><p class="text-lg animate-pulse font-mono font-bold">Mounting ' + TOPIC_MODULES[topicKey].name + '...</p></div>';

            const moduleDef = TOPIC_MODULES[topicKey];

            try {
                // Dynamically inject script with cache-busting to ensure fresh execution
                await this.loadScript(moduleDef.path);

                // Initialize sub-module
                if (window.activeSimulator && window.activeSimulator !== sandboxPortal) {
                    activeSubModule = window.activeSimulator;
                    
                    // Bind module registration to specific names so they don't overwrite each other in cache
                    window[moduleDef.globalName] = activeSubModule;
                    
                    // Restore activeSimulator to the portal itself so that calls forward correctly
                    window.activeSimulator = sandboxPortal;
                    
                    subModuleContainer.innerHTML = '';
                    await activeSubModule.init(subModuleContainer, savedSubState);
                } else {
                    throw new Error('Script loaded but window.activeSimulator not found.');
                }
            } catch (err) {
                console.error('Failed to load topic:', err);
                subModuleContainer.innerHTML = `
                    <div class="border border-red-500 p-4 text-red-600 bg-red-50">
                        <h4 class="font-bold mb-2">Error Loading Course Module</h4>
                        <p class="text-sm">${err.message}</p>
                    </div>
                `;
            }
        },

        loadScript(src) {
            return new Promise((resolve, reject) => {
                // Remove existing script tags matching this path
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
        },

        updateObject(id, key, value) {
            if (activeSubModule && activeSubModule.updateObject) {
                activeSubModule.updateObject(id, key, value);
            }
        },
        toggleGearSolve(id, modeVal) {
            if (activeSubModule && activeSubModule.toggleGearSolve) {
                activeSubModule.toggleGearSolve(id, modeVal);
            }
        },
        updateGivenVal(id, val) {
            if (activeSubModule && activeSubModule.updateGivenVal) {
                activeSubModule.updateGivenVal(id, val);
            }
        },
        updateGivenType(id, type) {
            if (activeSubModule && activeSubModule.updateGivenType) {
                activeSubModule.updateGivenType(id, type);
            }
        },
        deleteElement(id) {
            if (activeSubModule && activeSubModule.deleteElement) {
                activeSubModule.deleteElement(id);
            }
        },
        removeFluxSurface(id) {
            if (activeSubModule && activeSubModule.removeFluxSurface) {
                activeSubModule.removeFluxSurface(id);
            }
        },

        getState() {
            return {
                activeTopic,
                subState: activeSubModule && activeSubModule.getState ? activeSubModule.getState() : null
            };
        },

        destroy() {
            // Clean up header tabs
            const tabsContainer = document.getElementById('em-header-tabs');
            if (tabsContainer) {
                tabsContainer.remove();
            }

            if (activeSubModule && activeSubModule.destroy) {
                activeSubModule.destroy();
            }

            // Remove stale named module globals to prevent dangling references
            Object.values(TOPIC_MODULES).forEach(mod => {
                if (window[mod.globalName]) {
                    delete window[mod.globalName];
                }
            });

            activeSubModule = null;
            activeTopic = 'electrostatics';
            container = null;
            portalContainer = null;
            subModuleContainer = null;
        }
    };

    window.activeSimulator = sandboxPortal;
})();
