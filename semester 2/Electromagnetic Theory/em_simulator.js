// 3D Electromagnetics Simulator Module
// For Semester 2 - Electromagnetic Theory

(function() {
    let scene, camera, renderer, controls;
    let container;
    let animationFrameId = null;
    let canvasParent, canvasTarget;
    
    // Physics State
    let observationPoint = { x: 0, y: 0, z: 2 };
    let spawnedObjects = []; // Point charges, lines, sheets, currents
    let fieldMode = 'electric'; // 'electric' | 'magnetic'
    
    // Visual toggles state
    let toggles = {
        showE: true,
        showD: false,
        showV: false,
        showPhiE: false,
        showB: false,
        showH: true,
        showPhiB: false,
        showR: true,
        showUnitVectors: true,
        showObsMarker: true,
        showConstants: true
    };
    
    // Three.js Objects reference storage for dynamic updates
    let obsPointMesh;
    let fieldArrowE = null;
    let fieldArrowD = null;
    let fieldArrowB = null;
    let fieldArrowH = null;
    let rVectorLines = [];
    let unitVectorArrows = [];
    let equipotentialSpheres = [];
    let gridHelper;
    let axesHelpers = [];

    // Permanent Physical Constants
    const EPSILON_0 = 8.854e-12; // F/m
    const MU_0 = 4 * Math.PI * 1e-7; // H/m
    const K_COULOMB = 1 / (4 * Math.PI * EPSILON_0); // ~8.988e9
    const PI = Math.PI;

    // Helper: Parse mixed markdown & latex strings
    function renderMarkdownWithKaTeX(text) {
        return text.replace(/\$(.*?)\$/g, (match, formula) => {
            try {
                return katex.renderToString(formula, { throwOnError: false });
            } catch (e) {
                return match;
            }
        });
    }

    // Physics Calculations Engine
    const physicsEngine = {
        calcEFieldAt(p, objects) {
            let Ex = 0, Ey = 0, Ez = 0;
            
            objects.forEach(obj => {
                // If this object is solved, it uses its calculated value
                if (obj.type === 'point') {
                    const dx = p.x - obj.x;
                    const dy = p.y - obj.y;
                    const dz = p.z - obj.z;
                    const r2 = dx*dx + dy*dy + dz*dz;
                    const r = Math.sqrt(r2);
                    if (r < 0.05) return;
                    
                    const q_c = obj.q * 1e-9;
                    const mag = (K_COULOMB * q_c) / r2;
                    
                    Ex += mag * (dx / r);
                    Ey += mag * (dy / r);
                    Ez += mag * (dz / r);
                } 
                else if (obj.type === 'line') {
                    let dx = 0, dy = 0, dz = 0;
                    let rho2 = 0;
                    
                    if (obj.axis === 'z') {
                        dx = p.x - obj.coord1;
                        dy = p.y - obj.coord2;
                        rho2 = dx*dx + dy*dy;
                    } else if (obj.axis === 'y') {
                        dx = p.x - obj.coord1;
                        dz = p.z - obj.coord2;
                        rho2 = dx*dx + dz*dz;
                    } else if (obj.axis === 'x') {
                        dy = p.y - obj.coord1;
                        dz = p.z - obj.coord2;
                        rho2 = dy*dy + dz*dz;
                    }

                    const rho = Math.sqrt(rho2);
                    if (rho < 0.05) return;
                    
                    const rhol_c = obj.rhol * 1e-9;
                    const mag = (rhol_c) / (2 * PI * EPSILON_0 * rho);

                    if (obj.axis === 'z') {
                        Ex += mag * (dx / rho);
                        Ey += mag * (dy / rho);
                    } else if (obj.axis === 'y') {
                        Ex += mag * (dx / rho);
                        Ez += mag * (dz / rho);
                    } else if (obj.axis === 'x') {
                        Ey += mag * (dy / rho);
                        Ez += mag * (dz / rho);
                    }
                } 
                else if (obj.type === 'sheet') {
                    const rhos_c = obj.rhos * 1e-9;
                    const mag = rhos_c / (2 * EPSILON_0);
                    
                    if (obj.axis === 'z') {
                        const dir = p.z > obj.pos ? 1 : -1;
                        Ez += mag * dir;
                    } else if (obj.axis === 'y') {
                        const dir = p.y > obj.pos ? 1 : -1;
                        Ey += mag * dir;
                    } else if (obj.axis === 'x') {
                        const dir = p.x > obj.pos ? 1 : -1;
                        Ex += mag * dir;
                    }
                }
            });

            return { x: Ex, y: Ey, z: Ez };
        },

        calcEFluxDensityAt(eField) {
            return {
                x: EPSILON_0 * eField.x,
                y: EPSILON_0 * eField.y,
                z: EPSILON_0 * eField.z
            };
        },

        calcPotentialAt(p, objects) {
            let potential = 0;
            objects.forEach(obj => {
                if (obj.type === 'point') {
                    const dx = p.x - obj.x;
                    const dy = p.y - obj.y;
                    const dz = p.z - obj.z;
                    const r = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (r < 0.05) return;
                    const q_c = obj.q * 1e-9;
                    potential += (K_COULOMB * q_c) / r;
                }
                // Potential is mathematically infinite for infinite line/sheets relative to infinity,
                // so we prioritize point potential calculations for numerical evaluations in UI.
            });
            return potential;
        },

        calcHFieldAt(p, objects) {
            let Hx = 0, Hy = 0, Hz = 0;

            objects.forEach(obj => {
                if (obj.type === 'current') {
                    let dx = 0, dy = 0, dz = 0;
                    let rho2 = 0;

                    if (obj.axis === 'z') {
                        dx = p.x - obj.coord1;
                        dy = p.y - obj.coord2;
                        rho2 = dx*dx + dy*dy;
                    } else if (obj.axis === 'y') {
                        dx = p.x - obj.coord1;
                        dz = p.z - obj.coord2;
                        rho2 = dx*dx + dz*dz;
                    } else if (obj.axis === 'x') {
                        dy = p.y - obj.coord1;
                        dz = p.z - obj.coord2;
                        rho2 = dy*dy + dz*dz;
                    }

                    const rho = Math.sqrt(rho2);
                    if (rho < 0.05) return;

                    const I = obj.current;
                    const mag = I / (2 * PI * rho);

                    if (obj.axis === 'z') {
                        Hx += mag * (-dy / rho);
                        Hy += mag * (dx / rho);
                    } else if (obj.axis === 'y') {
                        Hx += mag * (dz / rho);
                        Hz += mag * (-dx / rho);
                    } else if (obj.axis === 'x') {
                        Hy += mag * (-dz / rho);
                        Hz += mag * (dy / rho);
                    }
                }
            });

            return { x: Hx, y: Hy, z: Hz };
        },

        calcBFieldAt(hField) {
            return {
                x: MU_0 * hField.x,
                y: MU_0 * hField.y,
                z: MU_0 * hField.z
            };
        }
    };

    // Main simulator controller
    const emSimulator = {
        async init(containerEl, savedState) {
            container = containerEl;
            
            // Set up state
            if (savedState) {
                observationPoint = savedState.observationPoint || { x: 0, y: 0, z: 2 };
                spawnedObjects = savedState.spawnedObjects || [];
                fieldMode = savedState.fieldMode || 'electric';
                toggles = savedState.toggles || toggles;
            } else {
                observationPoint = { x: 0, y: 0, z: 2 };
                spawnedObjects = [
                    { 
                        id: 'pt_1', 
                        type: 'point', 
                        x: 0, 
                        y: 0, 
                        z: 0, 
                        q: 5,
                        solveMode: 'none', // 'none' | 'q' | 'r'
                        givenValue: 11230,  // User input target E-field magnitude or potential
                        givenType: 'e_field' // 'e_field' | 'potential'
                    }
                ];
                fieldMode = 'electric';
            }

            this.buildLayout();
            this.initThree();
            this.bindEvents();
            this.updateUI();
            this.syncThreeScene();
        },

        buildLayout() {
            container.innerHTML = `
                <div class="mobile-tabs">
                    <button class="tab-btn active" id="tab-btn-3d">3D View</button>
                    <button class="tab-btn" id="tab-btn-controls">Settings</button>
                    <button class="tab-btn" id="tab-btn-math">Derivations</button>
                </div>
                <div class="em-grid">
                    <!-- Left: 3D Canvas -->
                    <div class="canvas-container" id="em-canvas-parent">
                        <div class="canvas-overlay-ui">
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-point">+ Point Charge</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-line">+ Line Charge</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-sheet">+ Sheet Charge</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-current">+ Line Current</button>
                        </div>
                        <div class="canvas-label-coord" id="coord-label">P: (0.0, 0.0, 2.0)</div>
                        <div id="three-canvas-target" style="width: 100%; height: 100%;"></div>
                    </div>

                    <!-- Right: Dynamic Tabbed Sidebar -->
                    <div class="sidebar-container" id="em-sidebar">
                        
                        <!-- Sidebar Sub-Tabs Row -->
                        <div style="display: flex; border-bottom: 2px solid #000; background: #fff; position: sticky; top: 0; z-index: 5;">
                            <button class="tab-sub-btn active" id="btn-sub-prop" style="flex: 1; border: none; border-right: 1px solid #000; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Properties</button>
                            <button class="tab-sub-btn" id="btn-sub-calc" style="flex: 1; border: none; border-right: 1px solid #000; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Calculation</button>
                            <button class="tab-sub-btn" id="btn-sub-other" style="flex: 1; border: none; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Toggles</button>
                        </div>

                        <!-- SECTION 1: PROPERTIES TAB -->
                        <div id="sec-sub-prop" class="sidebar-tab-content">
                            <!-- Observation Point Editor -->
                            <div class="sidebar-section">
                                <h4 class="text-xs font-bold uppercase tracking-wider mb-3">Observation Point P(x, y, z)</h4>
                                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <!-- Coord X -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">X Coordinate</span>
                                            <span id="label-val-p-x" class="text-xs font-mono">0.0</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-5" max="5" step="0.1" id="p-x-slider" style="flex: 1; accent-color: #000;" value="${observationPoint.x}">
                                            <input type="number" step="0.1" id="p-x" style="width: 65px;" class="border border-black px-1 text-xs py-0.5" value="${observationPoint.x}">
                                        </div>
                                    </div>
                                    <!-- Coord Y -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Y Coordinate</span>
                                            <span id="label-val-p-y" class="text-xs font-mono">0.0</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-5" max="5" step="0.1" id="p-y-slider" style="flex: 1; accent-color: #000;" value="${observationPoint.y}">
                                            <input type="number" step="0.1" id="p-y" style="width: 65px;" class="border border-black px-1 text-xs py-0.5" value="${observationPoint.y}">
                                        </div>
                                    </div>
                                    <!-- Coord Z -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Z Coordinate</span>
                                            <span id="label-val-p-z" class="text-xs font-mono">2.0</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-5" max="5" step="0.1" id="p-z-slider" style="flex: 1; accent-color: #000;" value="${observationPoint.z}">
                                            <input type="number" step="0.1" id="p-z" style="width: 65px;" class="border border-black px-1 text-xs py-0.5" value="${observationPoint.z}">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Spawned Items Editor -->
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Spawned Charges / Currents</h3>
                                <div id="elements-list-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <!-- Spawned elements rows go here -->
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 2: CALCULATION TAB -->
                        <div id="sec-sub-calc" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Vector Calculus Derivation</h3>
                                <div class="math-derivations-box" id="math-derivation-output" style="white-space: normal; word-wrap: break-word;">
                                    <!-- Dynamic KaTeX formulas -->
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 3: TOGGLES & CONFIGS TAB -->
                        <div id="sec-sub-other" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Visual Overlays Toggle</h3>
                                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-e" ${toggles.showE ? 'checked' : ''} style="accent-color:#000;">
                                        E: Electric Field Intensity (Arrows)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-d" ${toggles.showD ? 'checked' : ''} style="accent-color:#000;">
                                        D: Electric Flux Density (Arrows)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-v" ${toggles.showV ? 'checked' : ''} style="accent-color:#000;">
                                        V: Potential Equipotential (Shell/Scalar)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-phie" ${toggles.showPhiE ? 'checked' : ''} style="accent-color:#000;">
                                        Φ_E: Electric Flux (Value display)
                                    </label>
                                    <hr class="border-gray-300">
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-b" ${toggles.showB ? 'checked' : ''} style="accent-color:#000;">
                                        B: Magnetic Flux Density (Arrows)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-h" ${toggles.showH ? 'checked' : ''} style="accent-color:#000;">
                                        H: Magnetic Field Intensity (Arrows)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-phib" ${toggles.showPhiB ? 'checked' : ''} style="accent-color:#000;">
                                        Φ_B: Magnetic Flux (Value display)
                                    </label>
                                    <hr class="border-gray-300">
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-r" ${toggles.showR ? 'checked' : ''} style="accent-color:#000;">
                                        R: Distance Vectors (Source to P)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-units" ${toggles.showUnitVectors ? 'checked' : ''} style="accent-color:#000;">
                                        Unit Vectors (a_r, a_n, a_phi)
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-obs" ${toggles.showObsMarker ? 'checked' : ''} style="accent-color:#000;">
                                        P: Observation Point Marker
                                    </label>
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-const" ${toggles.showConstants ? 'checked' : ''} style="accent-color:#000;">
                                        Show Physical Constants Panel
                                    </label>
                                </div>

                                <div class="form-group border-t border-black pt-3">
                                    <label for="field-mode-select">Field Mode</label>
                                    <select id="field-mode-select" class="form-control">
                                        <option value="electric">Electric Field Mode</option>
                                        <option value="magnetic">Magnetic Field Mode</option>
                                    </select>
                                </div>
                                <div style="margin-top: 1rem;">
                                    <button id="btn-clear-scene" class="btn-minimal text-xs w-full" style="width: 100%; text-align: center; border-color: #ff3b30; color: #ff3b30;">Clear Sandbox</button>
                                </div>
                            </div>

                            <!-- Physical Constants Box -->
                            <div class="sidebar-section border-t border-black" id="constants-panel">
                                <h3 class="sidebar-section-title">Physical Constants</h3>
                                <div style="font-family: monospace; font-size: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem;">
                                    <div>ε₀ = 8.854 × 10⁻¹² F/m</div>
                                    <div>μ₀ = 4π × 10⁻⁷ H/m</div>
                                    <div>k  = 1/(4πe₀) ≈ 8.988 × 10⁹</div>
                                    <div>c  ≈ 3.00 × 10⁸ m/s</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .tab-sub-btn {
                        transition: background-color 0.2s, color 0.2s;
                    }
                    .tab-sub-btn.active {
                        background-color: #000 !important;
                        color: #fff !important;
                    }
                    .sidebar-tab-content {
                        display: flex;
                        flex-direction: column;
                    }
                    .sidebar-tab-content.hidden {
                        display: none !important;
                    }
                </style>
            `;
            
            canvasParent = document.getElementById('em-canvas-parent');
            canvasTarget = document.getElementById('three-canvas-target');
        },

        initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff);

            camera = new THREE.PerspectiveCamera(45, canvasTarget.clientWidth / canvasTarget.clientHeight, 0.1, 100);
            camera.position.set(5, 5, 8);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(canvasTarget.clientWidth, canvasTarget.clientHeight);
            canvasTarget.appendChild(renderer.domElement);

            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
            scene.add(ambientLight);
            
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
            dirLight.position.set(5, 10, 7);
            scene.add(dirLight);

            gridHelper = new THREE.GridHelper(10, 10, 0x000000, 0xcccccc);
            gridHelper.rotation.x = Math.PI / 2;
            scene.add(gridHelper);

            const axesGroup = new THREE.Group();
            const xGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0)]);
            const xMat = new THREE.LineBasicMaterial({ color: 0x990000 });
            axesGroup.add(new THREE.Line(xGeom, xMat));

            const yGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, 5, 0)]);
            const yMat = new THREE.LineBasicMaterial({ color: 0x009900 });
            axesGroup.add(new THREE.Line(yGeom, yMat));

            const zGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5)]);
            const zMat = new THREE.LineBasicMaterial({ color: 0x000099 });
            axesGroup.add(new THREE.Line(zGeom, zMat));

            scene.add(axesGroup);

            const pGeom = new THREE.SphereGeometry(0.12, 16, 16);
            const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            obsPointMesh = new THREE.Mesh(pGeom, pMat);
            scene.add(obsPointMesh);

            window.addEventListener('resize', this.onResize);
            this.animate();
        },

        animate() {
            if (!renderer || !scene || !camera) return;
            animationFrameId = requestAnimationFrame(() => this.animate());
            if (controls) controls.update();
            renderer.render(scene, camera);
        },

        onResize() {
            if (!canvasTarget || !renderer || !camera) return;
            const w = canvasTarget.clientWidth;
            const h = canvasTarget.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        },

        bindEvents() {
            const selectMode = document.getElementById('field-mode-select');
            const btnClear = document.getElementById('btn-clear-scene');

            // Sidebar tabs event handler
            const subTabs = {
                prop: { btn: document.getElementById('btn-sub-prop'), sec: document.getElementById('sec-sub-prop') },
                calc: { btn: document.getElementById('btn-sub-calc'), sec: document.getElementById('sec-sub-calc') },
                other: { btn: document.getElementById('btn-sub-other'), sec: document.getElementById('sec-sub-other') }
            };

            const switchSubTab = (activeKey) => {
                Object.keys(subTabs).forEach(key => {
                    if (key === activeKey) {
                        subTabs[key].btn.classList.add('active');
                        subTabs[key].sec.classList.remove('hidden');
                    } else {
                        subTabs[key].btn.classList.remove('active');
                        subTabs[key].sec.classList.add('hidden');
                    }
                });
            };

            Object.keys(subTabs).forEach(key => {
                subTabs[key].btn.addEventListener('click', () => switchSubTab(key));
            });

            // Bind slider and numeric inputs for observation coordinates
            const bindCoordSync = (inputElId, sliderElId, valLabelId, key) => {
                const input = document.getElementById(inputElId);
                const slider = document.getElementById(sliderElId);
                const label = document.getElementById(valLabelId);

                const updateVal = (val) => {
                    val = parseFloat(val);
                    if (isNaN(val)) val = 0;
                    observationPoint[key] = val;
                    input.value = val;
                    slider.value = val;
                    label.innerText = val.toFixed(1);
                    
                    document.getElementById('coord-label').innerText = `P: (${observationPoint.x.toFixed(1)}, ${observationPoint.y.toFixed(1)}, ${observationPoint.z.toFixed(1)})`;
                    obsPointMesh.position.set(observationPoint.x, observationPoint.y, observationPoint.z);
                    this.updatePhysics();
                    this.drawGeometryOverlays();
                };

                input.addEventListener('input', () => updateVal(input.value));
                slider.addEventListener('input', () => updateVal(slider.value));
            };

            bindCoordSync('p-x', 'p-x-slider', 'label-val-p-x', 'x');
            bindCoordSync('p-y', 'p-y-slider', 'label-val-p-y', 'y');
            bindCoordSync('p-z', 'p-z-slider', 'label-val-p-z', 'z');

            selectMode.addEventListener('change', (e) => {
                fieldMode = e.target.value;
                this.updateUI();
                this.syncThreeScene();
            });

            // Visual overlay checkboxes bindings
            const bindToggle = (chkId, toggleKey) => {
                const chk = document.getElementById(chkId);
                chk.addEventListener('change', (e) => {
                    toggles[toggleKey] = e.target.checked;
                    if (toggleKey === 'showObsMarker') {
                        obsPointMesh.visible = toggles[toggleKey];
                    }
                    if (toggleKey === 'showConstants') {
                        document.getElementById('constants-panel').style.display = toggles[toggleKey] ? 'block' : 'none';
                    }
                    this.updatePhysics();
                    this.drawGeometryOverlays();
                });
            };

            bindToggle('chk-show-e', 'showE');
            bindToggle('chk-show-d', 'showD');
            bindToggle('chk-show-v', 'showV');
            bindToggle('chk-show-phie', 'showPhiE');
            bindToggle('chk-show-b', 'showB');
            bindToggle('chk-show-h', 'showH');
            bindToggle('chk-show-phib', 'showPhiB');
            bindToggle('chk-show-r', 'showR');
            bindToggle('chk-show-units', 'showUnitVectors');
            bindToggle('chk-show-obs', 'showObsMarker');
            bindToggle('chk-show-const', 'showConstants');

            btnClear.addEventListener('click', () => {
                if (confirm('Clear all objects from sandbox?')) {
                    spawnedObjects = [];
                    this.updateUI();
                    this.syncThreeScene();
                }
            });

            // Spawners
            document.getElementById('btn-spawn-point').addEventListener('click', () => {
                this.spawnPointCharge();
                switchSubTab('prop');
            });
            document.getElementById('btn-spawn-line').addEventListener('click', () => {
                this.spawnLineCharge();
                switchSubTab('prop');
            });
            document.getElementById('btn-spawn-sheet').addEventListener('click', () => {
                this.spawnSheetCharge();
                switchSubTab('prop');
            });
            document.getElementById('btn-spawn-current').addEventListener('click', () => {
                this.spawnLineCurrent();
                switchSubTab('prop');
            });

            // Mobile view tab toggling
            const tab3d = document.getElementById('tab-btn-3d');
            const tabControls = document.getElementById('tab-btn-controls');
            const tabMath = document.getElementById('tab-btn-math');

            const resetTabs = () => {
                [tab3d, tabControls, tabMath].forEach(btn => btn.classList.remove('active'));
                canvasParent.classList.add('hidden');
                document.getElementById('em-sidebar').classList.add('hidden');
            };

            tab3d.addEventListener('click', () => {
                resetTabs();
                tab3d.classList.add('active');
                canvasParent.classList.remove('hidden');
                this.onResize();
            });

            tabControls.addEventListener('click', () => {
                resetTabs();
                tabControls.classList.add('active');
                document.getElementById('em-sidebar').classList.remove('hidden');
                switchSubTab('prop');
            });

            tabMath.addEventListener('click', () => {
                resetTabs();
                tabMath.classList.add('active');
                document.getElementById('em-sidebar').classList.remove('hidden');
                switchSubTab('calc');
            });

            const checkMobileView = () => {
                if (window.innerWidth < 992) {
                    resetTabs();
                    tab3d.classList.add('active');
                    canvasParent.classList.remove('hidden');
                } else {
                    canvasParent.classList.remove('hidden');
                    document.getElementById('em-sidebar').classList.remove('hidden');
                    switchSubTab('prop');
                }
            };

            this.mobileViewListener = checkMobileView;
            window.addEventListener('resize', this.mobileViewListener);
            checkMobileView();
        },

        // Physics Update loop
        updatePhysics() {
            // Apply granular parameter solvers
            spawnedObjects.forEach(obj => {
                if (obj.solveMode !== 'none') {
                    if (obj.type === 'point') {
                        const dx = observationPoint.x - obj.x;
                        const dy = observationPoint.y - obj.y;
                        const dz = observationPoint.z - obj.z;
                        const r2 = dx*dx + dy*dy + dz*dz;
                        const r = Math.sqrt(r2);

                        if (obj.solveMode === 'q') {
                            if (obj.givenType === 'e_field') {
                                // Q = 4 * PI * EPSILON_0 * R^2 * E
                                const q_c = (obj.givenValue * r2) / K_COULOMB;
                                obj.q = q_c * 1e9;
                            } else if (obj.givenType === 'potential') {
                                // Q = 4 * PI * EPSILON_0 * R * V
                                const q_c = (obj.givenValue * r) / K_COULOMB;
                                obj.q = q_c * 1e9;
                            }
                        } else if (obj.solveMode === 'r') {
                            // Find distance R
                            if (obj.givenType === 'e_field' && obj.givenValue > 0) {
                                const q_c = obj.q * 1e-9;
                                const r_val = Math.sqrt((K_COULOMB * q_c) / obj.givenValue);
                                // Shift observation point coordinates to match solved radial distance
                                observationPoint.z = obj.z + r_val;
                                observationPoint.x = obj.x;
                                observationPoint.y = obj.y;
                            }
                        }
                    }
                    else if (obj.type === 'line' && obj.solveMode === 'rhol') {
                        let dx = 0, dy = 0, dz = 0, rho2 = 0;
                        if (obj.axis === 'z') {
                            dx = observationPoint.x - obj.coord1;
                            dy = observationPoint.y - obj.coord2;
                            rho2 = dx*dx + dy*dy;
                        } else if (obj.axis === 'y') {
                            dx = observationPoint.x - obj.coord1;
                            dz = observationPoint.z - obj.coord2;
                            rho2 = dx*dx + dz*dz;
                        } else if (obj.axis === 'x') {
                            dy = observationPoint.y - obj.coord1;
                            dz = observationPoint.z - obj.coord2;
                            rho2 = dy*dy + dz*dz;
                        }
                        const rho = Math.sqrt(rho2);
                        if (rho > 0.01) {
                            // rhol = 2 * PI * EPSILON_0 * rho * E
                            const rhol_c = obj.givenValue * 2 * PI * EPSILON_0 * rho;
                            obj.rhol = rhol_c * 1e9;
                        }
                    }
                    else if (obj.type === 'sheet' && obj.solveMode === 'rhos') {
                        // rhos = 2 * EPSILON_0 * E
                        const rhos_c = 2 * EPSILON_0 * obj.givenValue;
                        obj.rhos = rhos_c * 1e9;
                    }
                    else if (obj.type === 'current' && obj.solveMode === 'current') {
                        let dx = 0, dy = 0, dz = 0, rho2 = 0;
                        if (obj.axis === 'z') {
                            dx = observationPoint.x - obj.coord1;
                            dy = observationPoint.y - obj.coord2;
                            rho2 = dx*dx + dy*dy;
                        }
                        const rho = Math.sqrt(rho2);
                        if (rho > 0.01) {
                            // I = 2 * PI * rho * H
                            obj.current = 2 * PI * rho * obj.givenValue;
                        }
                    }
                }
            });

            // Recalculate and draw vector arrows
            if (fieldArrowE) { scene.remove(fieldArrowE); fieldArrowE = null; }
            if (fieldArrowD) { scene.remove(fieldArrowD); fieldArrowD = null; }
            if (fieldArrowB) { scene.remove(fieldArrowB); fieldArrowB = null; }
            if (fieldArrowH) { scene.remove(fieldArrowH); fieldArrowH = null; }

            const eField = physicsEngine.calcEFieldAt(observationPoint, spawnedObjects);
            const dField = physicsEngine.calcEFluxDensityAt(eField);
            const hField = physicsEngine.calcHFieldAt(observationPoint, spawnedObjects);
            const bField = physicsEngine.calcBFieldAt(hField);

            const origin = new THREE.Vector3(observationPoint.x, observationPoint.y, observationPoint.z);

            if (fieldMode === 'electric') {
                const eMag = Math.sqrt(eField.x*eField.x + eField.y*eField.y + eField.z*eField.z);
                if (toggles.showE && eMag > 1e-4) {
                    const dir = new THREE.Vector3(eField.x, eField.y, eField.z).normalize();
                    const len = Math.min(2.5, Math.log10(1 + eMag * 1e5) * 0.8);
                    fieldArrowE = new THREE.ArrowHelper(dir, origin, len, 0x000000, 0.2, 0.1);
                    scene.add(fieldArrowE);
                }

                const dMag = Math.sqrt(dField.x*dField.x + dField.y*dField.y + dField.z*dField.z);
                if (toggles.showD && dMag > 1e-15) {
                    const dir = new THREE.Vector3(dField.x, dField.y, dField.z).normalize();
                    const len = Math.min(2.5, Math.log10(1 + dMag * 1e15) * 0.8);
                    fieldArrowD = new THREE.ArrowHelper(dir, origin, len, 0x555555, 0.2, 0.1);
                    scene.add(fieldArrowD);
                }
            } else {
                const hMag = Math.sqrt(hField.x*hField.x + hField.y*hField.y + hField.z*hField.z);
                if (toggles.showH && hMag > 1e-4) {
                    const dir = new THREE.Vector3(hField.x, hField.y, hField.z).normalize();
                    const len = Math.min(2.5, Math.log10(1 + hMag * 1e2) * 0.8);
                    fieldArrowH = new THREE.ArrowHelper(dir, origin, len, 0x000000, 0.2, 0.1);
                    scene.add(fieldArrowH);
                }

                const bMag = Math.sqrt(bField.x*bField.x + bField.y*bField.y + bField.z*bField.z);
                if (toggles.showB && bMag > 1e-10) {
                    const dir = new THREE.Vector3(bField.x, bField.y, bField.z).normalize();
                    const len = Math.min(2.5, Math.log10(1 + bMag * 1e8) * 0.8);
                    fieldArrowB = new THREE.ArrowHelper(dir, origin, len, 0x555555, 0.2, 0.1);
                    scene.add(fieldArrowB);
                }
            }

            this.renderMathDerivation(eField, dField, hField, bField);
        },

        // Draw R geometry lines, unit vectors, potential grids
        drawGeometryOverlays() {
            // Remove previous objects
            rVectorLines.forEach(l => scene.remove(l));
            rVectorLines = [];

            unitVectorArrows.forEach(a => scene.remove(a));
            unitVectorArrows = [];

            equipotentialSpheres.forEach(s => scene.remove(s));
            equipotentialSpheres = [];

            const p = new THREE.Vector3(observationPoint.x, observationPoint.y, observationPoint.z);

            spawnedObjects.forEach(obj => {
                let sourcePos = new THREE.Vector3(0, 0, 0);
                if (obj.type === 'point') {
                    sourcePos.set(obj.x, obj.y, obj.z);
                } else if (obj.type === 'line' || obj.type === 'current') {
                    if (obj.axis === 'z') sourcePos.set(obj.coord1, obj.coord2, p.z);
                    else if (obj.axis === 'y') sourcePos.set(obj.coord1, p.y, obj.coord2);
                    else if (obj.axis === 'x') sourcePos.set(p.x, obj.coord1, obj.coord2);
                } else if (obj.type === 'sheet') {
                    if (obj.axis === 'z') sourcePos.set(p.x, p.y, obj.pos);
                    else if (obj.axis === 'y') sourcePos.set(p.x, obj.pos, p.z);
                    else if (obj.axis === 'x') sourcePos.set(obj.pos, p.y, p.z);
                }

                // Draw distance line R
                if (toggles.showR) {
                    const geom = new THREE.BufferGeometry().setFromPoints([sourcePos, p]);
                    const mat = new THREE.LineDashedMaterial({
                        color: 0x888888,
                        dashSize: 0.15,
                        gapSize: 0.08
                    });
                    const line = new THREE.Line(geom, mat);
                    line.computeLineDistances();
                    scene.add(line);
                    rVectorLines.push(line);
                }

                // Equipotential sphere around point charge
                if (toggles.showV && obj.type === 'point') {
                    const dist = sourcePos.distanceTo(p);
                    if (dist > 0.1) {
                        const geom = new THREE.SphereGeometry(dist, 32, 16);
                        const mat = new THREE.MeshBasicMaterial({
                            color: 0xcccccc,
                            wireframe: true,
                            transparent: true,
                            opacity: 0.05
                        });
                        const sphere = new THREE.Mesh(geom, mat);
                        sphere.position.copy(sourcePos);
                        scene.add(sphere);
                        equipotentialSpheres.push(sphere);
                    }
                }

                // Unit vector arrows at P
                if (toggles.showUnitVectors) {
                    const dir = new THREE.Vector3().subVectors(p, sourcePos).normalize();
                    if (obj.type === 'point') {
                        // a_r unit vector
                        const arrow = new THREE.ArrowHelper(dir, p, 0.6, 0x000000, 0.15, 0.06);
                        scene.add(arrow);
                        unitVectorArrows.push(arrow);
                    } else if (obj.type === 'sheet') {
                        // a_n normal unit vector
                        let nDir = new THREE.Vector3(0, 0, 1);
                        if (obj.axis === 'y') nDir.set(0, 1, 0);
                        else if (obj.axis === 'x') nDir.set(1, 0, 0);
                        if (p.dot(nDir) < obj.pos) nDir.negate();

                        const arrow = new THREE.ArrowHelper(nDir, p, 0.6, 0x555555, 0.15, 0.06);
                        scene.add(arrow);
                        unitVectorArrows.push(arrow);
                    }
                }
            });
        },

        spawnPointCharge() {
            const id = 'pt_' + Date.now();
            spawnedObjects.push({
                id,
                type: 'point',
                x: 0,
                y: 0,
                z: 0,
                q: 10,
                solveMode: 'none',
                givenValue: 10000,
                givenType: 'e_field'
            });
            this.updateUI();
            this.syncThreeScene();
        },

        spawnLineCharge() {
            const id = 'line_' + Date.now();
            spawnedObjects.push({
                id,
                type: 'line',
                axis: 'z',
                coord1: 0,
                coord2: 0,
                rhol: 20,
                solveMode: 'none',
                givenValue: 10000,
                givenType: 'e_field'
            });
            this.updateUI();
            this.syncThreeScene();
        },

        spawnSheetCharge() {
            const id = 'sheet_' + Date.now();
            spawnedObjects.push({
                id,
                type: 'sheet',
                axis: 'z',
                pos: 0,
                rhos: 5,
                solveMode: 'none',
                givenValue: 200,
                givenType: 'e_field'
            });
            this.updateUI();
            this.syncThreeScene();
        },

        spawnLineCurrent() {
            const id = 'curr_' + Date.now();
            spawnedObjects.push({
                id,
                type: 'current',
                axis: 'z',
                coord1: 0,
                coord2: 0,
                current: 2,
                solveMode: 'none',
                givenValue: 1,
                givenType: 'h_field'
            });
            this.updateUI();
            this.syncThreeScene();
        },

        toggleGearSolve(id, modeVal) {
            const obj = spawnedObjects.find(o => o.id === id);
            if (obj) {
                obj.solveMode = modeVal;
                this.updateUI();
                this.updatePhysics();
                this.syncThreeScene();
            }
        },

        updateGivenVal(id, val) {
            const obj = spawnedObjects.find(o => o.id === id);
            if (obj) {
                obj.givenValue = parseFloat(val) || 0;
                this.updatePhysics();
            }
        },

        updateGivenType(id, type) {
            const obj = spawnedObjects.find(o => o.id === id);
            if (obj) {
                obj.givenType = type;
                this.updateUI();
                this.updatePhysics();
            }
        },

        deleteElement(id) {
            spawnedObjects = spawnedObjects.filter(o => o.id !== id);
            emSimulator.updateUI();
            emSimulator.syncThreeScene();
        },

        updateObject(id, key, value) {
            const idx = spawnedObjects.findIndex(o => o.id === id);
            if (idx !== -1) {
                if (key !== 'axis') {
                    spawnedObjects[idx][key] = parseFloat(value) || 0;
                } else {
                    spawnedObjects[idx][key] = value;
                }
                this.updatePhysics();
                this.syncThreeSceneGeometryOnly();
                this.drawGeometryOverlays();
            }
        },

        updateUI() {
            // Select Mode
            document.getElementById('field-mode-select').value = fieldMode;

            // Coordinate values syncing
            document.getElementById('p-x').value = observationPoint.x;
            document.getElementById('p-x-slider').value = observationPoint.x;
            document.getElementById('label-val-p-x').innerText = observationPoint.x.toFixed(1);

            document.getElementById('p-y').value = observationPoint.y;
            document.getElementById('p-y-slider').value = observationPoint.y;
            document.getElementById('label-val-p-y').innerText = observationPoint.y.toFixed(1);

            document.getElementById('p-z').value = observationPoint.z;
            document.getElementById('p-z-slider').value = observationPoint.z;
            document.getElementById('label-val-p-z').innerText = observationPoint.z.toFixed(1);

            document.getElementById('coord-label').innerText = `P: (${observationPoint.x.toFixed(1)}, ${observationPoint.y.toFixed(1)}, ${observationPoint.z.toFixed(1)})`;
            obsPointMesh.position.set(observationPoint.x, observationPoint.y, observationPoint.z);

            // Spawned elements cards renderer
            const listContainer = document.getElementById('elements-list-container');
            listContainer.innerHTML = '';

            if (spawnedObjects.length === 0) {
                listContainer.innerHTML = '<p class="text-xs italic text-gray-500">No objects placed in the sandbox.</p>';
                return;
            }

            spawnedObjects.forEach(obj => {
                const row = document.createElement('div');
                row.className = 'border border-black p-3 bg-gray-50 flex flex-col gap-2 relative';
                row.style.wordBreak = 'break-all';

                // Delete button
                const btnDel = document.createElement('button');
                btnDel.className = 'absolute top-1 right-2 text-xs font-bold text-red-500 hover:text-red-700';
                btnDel.innerText = '✕';
                btnDel.style.zIndex = '10';
                btnDel.onclick = () => emSimulator.deleteElement(obj.id);
                row.appendChild(btnDel);

                // Gear setting panel toggle button
                const btnGear = document.createElement('button');
                btnGear.className = 'absolute top-1 right-6 text-xs font-bold hover:opacity-70';
                btnGear.innerHTML = '⚙️';
                btnGear.style.zIndex = '10';
                btnGear.onclick = () => {
                    const gPanel = document.getElementById(`gear-panel-${obj.id}`);
                    gPanel.classList.toggle('hidden');
                };
                row.appendChild(btnGear);

                let contentWrap = document.createElement('div');
                contentWrap.className = 'flex flex-col gap-2';

                const makeSyncInput = (labelName, key, minVal, maxVal, stepVal, disableControl = false) => {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'flex flex-col';
                    
                    const labelInfo = document.createElement('div');
                    labelInfo.className = 'flex justify-between items-center mb-0.5';
                    labelInfo.innerHTML = `<span class="text-xs font-mono font-bold">${labelName}</span>
                                           <span id="lbl-${obj.id}-${key}" class="text-xs font-mono">${obj[key].toFixed(2)}</span>`;
                    
                    const controlsDiv = document.createElement('div');
                    controlsDiv.className = 'flex gap-2 align-center';
                    
                    const rRange = document.createElement('input');
                    rRange.type = 'range';
                    rRange.id = `slider-${obj.id}-${key}`;
                    rRange.min = minVal;
                    rRange.max = maxVal;
                    rRange.step = stepVal;
                    rRange.value = obj[key];
                    rRange.style.flex = '1';
                    rRange.style.accentColor = '#000';
                    if (disableControl) rRange.disabled = true;

                    const rNum = document.createElement('input');
                    rNum.type = 'number';
                    rNum.id = `num-${obj.id}-${key}`;
                    rNum.step = stepVal;
                    rNum.value = obj[key].toFixed(2);
                    rNum.style.width = '60px';
                    rNum.className = 'border border-black px-1 text-xs';
                    if (disableControl) rNum.disabled = true;

                    const updateVal = (val) => {
                        val = parseFloat(val);
                        if (isNaN(val)) val = 0;
                        obj[key] = val;
                        rRange.value = val;
                        rNum.value = val;
                        document.getElementById(`lbl-${obj.id}-${key}`).innerText = val.toFixed(2);
                        this.updatePhysics();
                        this.syncThreeSceneGeometryOnly();
                        this.drawGeometryOverlays();
                    };

                    if (!disableControl) {
                        rRange.addEventListener('input', () => updateVal(rRange.value));
                        rNum.addEventListener('input', () => updateVal(rNum.value));
                    }

                    controlsDiv.appendChild(rRange);
                    controlsDiv.appendChild(rNum);
                    rowDiv.appendChild(labelInfo);
                    rowDiv.appendChild(controlsDiv);
                    return rowDiv;
                };

                const isSolved = obj.solveMode !== 'none';

                if (obj.type === 'point') {
                    const title = document.createElement('div');
                    title.className = 'font-bold text-xs uppercase mb-1' + (isSolved ? ' text-blue-600' : '');
                    title.innerText = 'Point Charge (Q)' + (isSolved ? ' [SOLVER ACTIVE]' : '');
                    contentWrap.appendChild(title);
                    
                    contentWrap.appendChild(makeSyncInput('Q (nC)', 'q', -50, 50, 1, obj.solveMode === 'q'));
                    contentWrap.appendChild(makeSyncInput('X Coordinate', 'x', -5, 5, 0.1, obj.solveMode === 'r'));
                    contentWrap.appendChild(makeSyncInput('Y Coordinate', 'y', -5, 5, 0.1, obj.solveMode === 'r'));
                    contentWrap.appendChild(makeSyncInput('Z Coordinate', 'z', -5, 5, 0.1, obj.solveMode === 'r'));
                } 
                else if (obj.type === 'line') {
                    const title = document.createElement('div');
                    title.className = 'font-bold text-xs uppercase mb-1' + (isSolved ? ' text-blue-600' : '');
                    title.innerText = 'Line Charge (ρ_l)' + (isSolved ? ' [SOLVER ACTIVE]' : '');
                    contentWrap.appendChild(title);

                    contentWrap.appendChild(makeSyncInput('ρ_l (nC/m)', 'rhol', -50, 50, 1, obj.solveMode === 'rhol'));

                    const axisDiv = document.createElement('div');
                    axisDiv.className = 'flex items-center gap-2 mt-1';
                    axisDiv.innerHTML = `<span class="text-xs font-mono font-bold">Parallel Axis:</span>`;
                    const select = document.createElement('select');
                    select.className = 'border border-black text-xs px-1';
                    ['z', 'y', 'x'].forEach(ax => {
                        const opt = document.createElement('option');
                        opt.value = ax;
                        opt.text = ax.toUpperCase();
                        if (obj.axis === ax) opt.selected = true;
                        select.appendChild(opt);
                    });
                    select.onchange = (e) => {
                        obj.axis = e.target.value;
                        this.updatePhysics();
                        this.syncThreeScene();
                    };
                    axisDiv.appendChild(select);
                    contentWrap.appendChild(axisDiv);

                    contentWrap.appendChild(makeSyncInput('Offset Coord 1', 'coord1', -5, 5, 0.1));
                    contentWrap.appendChild(makeSyncInput('Offset Coord 2', 'coord2', -5, 5, 0.1));
                } 
                else if (obj.type === 'sheet') {
                    const title = document.createElement('div');
                    title.className = 'font-bold text-xs uppercase mb-1' + (isSolved ? ' text-blue-600' : '');
                    title.innerText = 'Sheet Charge (ρ_s)' + (isSolved ? ' [SOLVER ACTIVE]' : '');
                    contentWrap.appendChild(title);

                    contentWrap.appendChild(makeSyncInput('ρ_s (nC/m²)', 'rhos', -20, 20, 1, obj.solveMode === 'rhos'));

                    const normDiv = document.createElement('div');
                    normDiv.className = 'flex items-center gap-2 mt-1';
                    normDiv.innerHTML = `<span class="text-xs font-mono font-bold">Normal Axis:</span>`;
                    const select = document.createElement('select');
                    select.className = 'border border-black text-xs px-1';
                    ['z', 'y', 'x'].forEach(ax => {
                        const opt = document.createElement('option');
                        opt.value = ax;
                        opt.text = ax.toUpperCase();
                        if (obj.axis === ax) opt.selected = true;
                        select.appendChild(opt);
                    });
                    select.onchange = (e) => {
                        obj.axis = e.target.value;
                        this.updatePhysics();
                        this.syncThreeScene();
                    };
                    normDiv.appendChild(select);
                    contentWrap.appendChild(normDiv);

                    contentWrap.appendChild(makeSyncInput('Offset Position', 'pos', -5, 5, 0.1));
                } 
                else if (obj.type === 'current') {
                    const title = document.createElement('div');
                    title.className = 'font-bold text-xs uppercase mb-1' + (isSolved ? ' text-blue-600' : '');
                    title.innerText = 'Line Current (I)' + (isSolved ? ' [SOLVER ACTIVE]' : '');
                    contentWrap.appendChild(title);

                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', -10, 10, 0.5, obj.solveMode === 'current'));

                    const axisDiv = document.createElement('div');
                    axisDiv.className = 'flex items-center gap-2 mt-1';
                    axisDiv.innerHTML = `<span class="text-xs font-mono font-bold">Current Axis:</span>`;
                    const select = document.createElement('select');
                    select.className = 'border border-black text-xs px-1';
                    ['z', 'y', 'x'].forEach(ax => {
                        const opt = document.createElement('option');
                        opt.value = ax;
                        opt.text = ax.toUpperCase();
                        if (obj.axis === ax) opt.selected = true;
                        select.appendChild(opt);
                    });
                    select.onchange = (e) => {
                        obj.axis = e.target.value;
                        this.updatePhysics();
                        this.syncThreeScene();
                    };
                    axisDiv.appendChild(select);
                    contentWrap.appendChild(axisDiv);

                    contentWrap.appendChild(makeSyncInput('Offset Coord 1', 'coord1', -5, 5, 0.1));
                    contentWrap.appendChild(makeSyncInput('Offset Coord 2', 'coord2', -5, 5, 0.1));
                }

                // Gear Settings Modal Dropdown content
                const gearPanel = document.createElement('div');
                gearPanel.id = `gear-panel-${obj.id}`;
                gearPanel.className = 'hidden border-t border-black pt-2 mt-2 flex flex-col gap-2 bg-white p-2';
                
                let gearHtml = `<h5 class="text-xs font-bold uppercase tracking-wider text-gray-700">Gear Solver Settings</h5>
                                <div class="form-group mb-1">
                                    <label class="text-[10px] font-bold">Solve For Parameter</label>
                                    <select onchange="window.activeSimulator.toggleGearSolve('${obj.id}', this.value)" class="form-control text-xs py-0.5 border-black">
                                        <option value="none" ${obj.solveMode === 'none' ? 'selected' : ''}>Disabled (Forward Sim)</option>`;
                
                if (obj.type === 'point') {
                    gearHtml += `<option value="q" ${obj.solveMode === 'q' ? 'selected' : ''}>Charge value Q (nC)</option>
                                 <option value="r" ${obj.solveMode === 'r' ? 'selected' : ''}>Radial distance R (m)</option>`;
                } else if (obj.type === 'line') {
                    gearHtml += `<option value="rhol" ${obj.solveMode === 'rhol' ? 'selected' : ''}>Line charge density rhol (nC/m)</option>`;
                } else if (obj.type === 'sheet') {
                    gearHtml += `<option value="rhos" ${obj.solveMode === 'rhos' ? 'selected' : ''}>Surface charge density rhos (nC/m²)</option>`;
                } else if (obj.type === 'current') {
                    gearHtml += `<option value="current" ${obj.solveMode === 'current' ? 'selected' : ''}>Line current value I (A)</option>`;
                }

                gearHtml += `</select></div>`;

                if (obj.solveMode !== 'none') {
                    let givenOpts = '';
                    if (fieldMode === 'electric') {
                        givenOpts = `<option value="e_field" ${obj.givenType === 'e_field' ? 'selected' : ''}>Known field E (V/m)</option>`;
                        if (obj.type === 'point') {
                            givenOpts += `<option value="potential" ${obj.givenType === 'potential' ? 'selected' : ''}>Known potential V (Volts)</option>`;
                        }
                    } else {
                        givenOpts = `<option value="h_field" ${obj.givenType === 'h_field' ? 'selected' : ''}>Known field H (A/m)</option>`;
                    }

                    gearHtml += `<div class="form-group mb-1">
                                    <label class="text-[10px] font-bold">Given Known Downstream</label>
                                    <select onchange="window.activeSimulator.updateGivenType('${obj.id}', this.value)" class="form-control text-xs py-0.5 border-black">
                                        ${givenOpts}
                                    </select>
                                 </div>
                                 <div class="form-group mb-1">
                                    <label class="text-[10px] font-bold">Value</label>
                                    <input type="number" value="${obj.givenValue}" oninput="window.activeSimulator.updateGivenVal('${obj.id}', this.value)" class="form-control text-xs py-0.5 border-black">
                                 </div>`;
                }

                gearPanel.innerHTML = gearHtml;
                row.appendChild(contentWrap);
                row.appendChild(gearPanel);
                listContainer.appendChild(row);
            });
        },

        syncThreeSceneGeometryOnly() {
            let childIdx = 0;
            scene.traverse(child => {
                if (child.isMesh && child !== obsPointMesh) {
                    const obj = spawnedObjects[childIdx];
                    if (obj) {
                        if (obj.type === 'point') {
                            child.position.set(obj.x, obj.y, obj.z);
                        } else if (obj.type === 'line' || obj.type === 'current') {
                            if (obj.axis === 'z') child.position.set(obj.coord1, obj.coord2, 0);
                            else if (obj.axis === 'y') child.position.set(obj.coord1, 0, obj.coord2);
                            else if (obj.axis === 'x') child.position.set(0, obj.coord1, obj.coord2);
                        } else if (obj.type === 'sheet') {
                            if (obj.axis === 'z') child.position.set(0, 0, obj.pos);
                            else if (obj.axis === 'y') child.position.set(0, obj.pos, 0);
                            else if (obj.axis === 'x') child.position.set(obj.pos, 0, 0);
                        }
                    }
                    childIdx++;
                }
            });
        },

        syncThreeScene() {
            const meshesToRemove = [];
            scene.traverse(child => {
                if (child.isMesh && child !== obsPointMesh) {
                    meshesToRemove.push(child);
                }
            });
            meshesToRemove.forEach(mesh => {
                mesh.geometry.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
                scene.remove(mesh);
            });

            spawnedObjects.forEach(obj => {
                if (obj.type === 'point') {
                    const isPos = obj.q >= 0;
                    const geom = new THREE.SphereGeometry(0.18, 16, 16);
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0x000000,
                        wireframe: !isPos
                    });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.position.set(obj.x, obj.y, obj.z);
                    scene.add(mesh);
                } 
                else if (obj.type === 'line' || obj.type === 'current') {
                    const isCurrent = obj.type === 'current';
                    const geom = new THREE.CylinderGeometry(0.06, 0.06, 10, 8);
                    const mat = new THREE.MeshBasicMaterial({ 
                        color: isCurrent ? 0x555555 : 0x000000,
                        wireframe: true 
                    });
                    const mesh = new THREE.Mesh(geom, mat);

                    if (obj.axis === 'z') {
                        mesh.rotation.x = Math.PI / 2;
                        mesh.position.set(obj.coord1, obj.coord2, 0);
                    } else if (obj.axis === 'y') {
                        mesh.position.set(obj.coord1, 0, obj.coord2);
                    } else if (obj.axis === 'x') {
                        mesh.rotation.z = Math.PI / 2;
                        mesh.position.set(0, obj.coord1, obj.coord2);
                    }
                    scene.add(mesh);
                } 
                else if (obj.type === 'sheet') {
                    const geom = new THREE.PlaneGeometry(10, 10);
                    const mat = new THREE.MeshBasicMaterial({
                        color: 0x000000,
                        wireframe: true,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.15
                    });
                    const mesh = new THREE.Mesh(geom, mat);

                    if (obj.axis === 'z') {
                        mesh.position.set(0, 0, obj.pos);
                    } else if (obj.axis === 'y') {
                        mesh.rotation.x = Math.PI / 2;
                        mesh.position.set(0, obj.pos, 0);
                    } else if (obj.axis === 'x') {
                        mesh.rotation.y = Math.PI / 2;
                        mesh.position.set(obj.pos, 0, 0);
                    }
                    scene.add(mesh);
                }
            });

            this.updatePhysics();
            this.drawGeometryOverlays();
        },

        renderMathDerivation(eField, dField, hField, bField) {
            const out = document.getElementById('math-derivation-output');
            if (!out) return;

            let html = '';

            // Check if any gear solvers are active and show steps
            const activeSolvers = spawnedObjects.filter(o => o.solveMode !== 'none');
            if (activeSolvers.length > 0) {
                html += `<div class="border-2 border-black p-3 mb-4 bg-gray-50">`;
                html += `<h4 class="font-bold text-xs uppercase mb-2 text-blue-600">${renderMarkdownWithKaTeX('Gear Solver calculations:')}</h4>`;

                activeSolvers.forEach((obj, idx) => {
                    html += `<div class="mb-3">`;
                    html += `<span class="font-bold text-xs">Object ${idx+1} (${obj.type}):</span>`;
                    
                    if (obj.type === 'point') {
                        const dx = observationPoint.x - obj.x;
                        const dy = observationPoint.y - obj.y;
                        const dz = observationPoint.z - obj.z;
                        const r = Math.sqrt(dx*dx + dy*dy + dz*dz);

                        if (obj.solveMode === 'q') {
                            if (obj.givenType === 'e_field') {
                                html += `<div class="katex-render">Q = \\frac{4\\pi\\epsilon_0 R^2 E}{10^{-9}} = \\frac{R^2 E}{k \\cdot 10^{-9}}</div>`;
                                html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Solve for charge $Q$ given field $E = ${obj.givenValue.toFixed(1)}\\text{ V/m}$, distance $R = ${r.toFixed(3)}\\text{ m}$.`)}</p>`;
                                html += `<div class="katex-render">Q = ${obj.q.toFixed(2)} \\text{ nC}</div>`;
                            } else if (obj.givenType === 'potential') {
                                html += `<div class="katex-render">Q = \\frac{4\\pi\\epsilon_0 R V}{10^{-9}} = \\frac{R V}{k \\cdot 10^{-9}}</div>`;
                                html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Solve for charge $Q$ given Potential $V = ${obj.givenValue.toFixed(1)}\\text{ V}$, distance $R = ${r.toFixed(3)}\\text{ m}$.`)}</p>`;
                                html += `<div class="katex-render">Q = ${obj.q.toFixed(2)} \\text{ nC}</div>`;
                            }
                        } else if (obj.solveMode === 'r') {
                            html += `<div class="katex-render">R = \\sqrt{\\frac{Q \\cdot 10^{-9}}{4\\pi\\epsilon_0 E}} = \\sqrt{\\frac{k \\cdot Q \\cdot 10^{-9}}{E}}</div>`;
                            html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Solve for distance $R$ given $Q = ${obj.q.toFixed(1)}\\text{ nC}$, target field $E = ${obj.givenValue.toFixed(1)}\\text{ V/m}$.`)}</p>`;
                            html += `<div class="katex-render">R = ${r.toFixed(3)} \\text{ m}</div>`;
                        }
                    }
                    else if (obj.type === 'line') {
                        if (obj.solveMode === 'rhol') {
                            html += `<div class="katex-render">\\rho_l = \\frac{2\\pi\\epsilon_0 \\rho E}{10^{-9}}</div>`;
                            html += `<div class="katex-render">\\rho_l = ${obj.rhol.toFixed(2)} \\text{ nC/m}</div>`;
                        }
                    }
                    else if (obj.type === 'sheet') {
                        if (obj.solveMode === 'rhos') {
                            html += `<div class="katex-render">\\rho_s = \\frac{2\\epsilon_0 E}{10^{-9}}</div>`;
                            html += `<div class="katex-render">\\rho_s = ${obj.rhos.toFixed(2)} \\text{ nC/m}^2</div>`;
                        }
                    }
                    else if (obj.type === 'current') {
                        if (obj.solveMode === 'current') {
                            html += `<div class="katex-render">I = 2\\pi \\rho H</div>`;
                            html += `<div class="katex-render">I = ${obj.current.toFixed(2)} \\text{ A}</div>`;
                        }
                    }
                    html += `</div>`;
                });
                html += `</div>`;
            }

            // Standard forward math outputs
            const eMag = Math.sqrt(eField.x*eField.x + eField.y*eField.y + eField.z*eField.z);
            const dMag = Math.sqrt(dField.x*dField.x + dField.y*dField.y + dField.z*dField.z);
            const hMag = Math.sqrt(hField.x*hField.x + hField.y*hField.y + hField.z*hField.z);
            const bMag = Math.sqrt(bField.x*bField.x + bField.y*bField.y + bField.z*bField.z);

            if (fieldMode === 'electric') {
                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1">${renderMarkdownWithKaTeX('Electrostatic Fields ($E$ / $D$ / $V$):')}</h4>`;
                
                if (toggles.showE) {
                    html += `<p class="text-xs font-bold">${renderMarkdownWithKaTeX('Electric Field Intensity $\\mathbf{E}$:')}</p>`;
                    html += `<div class="katex-render">\\mathbf{E}_{\\text{net}} = ${eField.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${eField.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${eField.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ V/m}</div>`;
                    html += `<div class="katex-render">|\\mathbf{E}_{\\text{net}}| = ${eMag.toExponential(3)} \\text{ V/m}</div>`;
                }

                if (toggles.showD) {
                    html += `<p class="text-xs font-bold mt-2">${renderMarkdownWithKaTeX('Electric Flux Density $\\mathbf{D}$:')}</p>`;
                    html += `<div class="katex-render">\\mathbf{D}_{\\text{net}} = ${dField.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${dField.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${dField.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ C/m}^2</div>`;
                    html += `<div class="katex-render">|\\mathbf{D}_{\\text{net}}| = ${dMag.toExponential(3)} \\text{ C/m}^2</div>`;
                }

                if (toggles.showV) {
                    const vVal = physicsEngine.calcPotentialAt(observationPoint, spawnedObjects);
                    html += `<p class="text-xs font-bold mt-2">${renderMarkdownWithKaTeX('Electric Potential $V$ (superposition of active points):')}</p>`;
                    html += `<div class="katex-render">V = \\sum_{i} \\frac{Q_i}{4\\pi\\epsilon_0 R_i} = ${vVal.toFixed(2)} \\text{ Volts}</div>`;
                }

                if (toggles.showPhiE) {
                    // Phi = D . S. For point charge, net flux enclosing is Q. Show net source charge sum.
                    const qSum = spawnedObjects.filter(o => o.type === 'point').reduce((acc, curr) => acc + curr.q, 0);
                    html += `<p class="text-xs font-bold mt-2">${renderMarkdownWithKaTeX('Net Enclosed Electric Flux $\\Phi_E$ (Gauss\'s Law closed bounds):')}</p>`;
                    html += `<div class="katex-render">\\Phi_E = Q_{\\text{enclosed}} = ${qSum.toFixed(2)} \\text{ nC}</div>`;
                }
            } else {
                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1">${renderMarkdownWithKaTeX('Magnetostatic Fields ($B$ / $H$):')}</h4>`;

                if (toggles.showH) {
                    html += `<p class="text-xs font-bold">${renderMarkdownWithKaTeX('Magnetic Field Intensity $\\mathbf{H}$:')}</p>`;
                    html += `<div class="katex-render">\\mathbf{H}_{\\text{net}} = ${hField.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${hField.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${hField.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ A/m}</div>`;
                    html += `<div class="katex-render">|\\mathbf{H}_{\\text{net}}| = ${hMag.toExponential(3)} \\text{ A/m}</div>`;
                }

                if (toggles.showB) {
                    html += `<p class="text-xs font-bold mt-2">${renderMarkdownWithKaTeX('Magnetic Flux Density $\\mathbf{B}$:')}</p>`;
                    html += `<div class="katex-render">\\mathbf{B}_{\\text{net}} = ${bField.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${bField.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${bField.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ T}</div>`;
                    html += `<div class="katex-render">|\\mathbf{B}_{\\text{net}}| = ${bMag.toExponential(3)} \\text{ Tesla}</div>`;
                }
            }

            out.innerHTML = html;

            const renders = out.querySelectorAll('.katex-render');
            renders.forEach(el => {
                try {
                    const formula = el.textContent;
                    katex.render(formula, el, { displayMode: true, throwOnError: false });
                } catch (e) {
                    console.error("KaTeX rendering error: ", e);
                }
            });
        },

        getState() {
            return {
                observationPoint,
                spawnedObjects,
                fieldMode,
                toggles
            };
        },

        destroy() {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            window.removeEventListener('resize', this.onResize);
            if (this.mobileViewListener) {
                window.removeEventListener('resize', this.mobileViewListener);
            }
            if (controls) controls.dispose();
            if (renderer) {
                renderer.dispose();
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            }
            scene = null;
            camera = null;
            renderer = null;
            controls = null;
        }
    };

    window.activeSimulator = emSimulator;
})();
