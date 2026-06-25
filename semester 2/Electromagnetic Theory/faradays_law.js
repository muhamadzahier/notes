// Faraday's Law & Motional EMF Simulator Module
// For Semester 2 - Electromagnetic Theory

(function() {
    let scene, camera, renderer, controls;
    let container;
    let animationFrameId = null;
    let canvasParent, canvasTarget;

    // Simulation Clock for dynamic animations
    let simTime = 0.0;
    let clock = new THREE.Clock();

    // Physics State
    let bFieldMagnitude = 1.5; // B0 in Tesla
    let fieldFrequency = 2.0;  // Frequency in Hz for time-varying B(t)
    let turnsN = 10;            // Number of turns
    let railWidth = 2.0;       // Length of sliding bar L in meters
    let barVelocity = 1.0;     // Speed u in m/s
    let resistor1 = 10.0;      // R1 in Ohms
    let resistor2 = 20.0;      // R2 in Ohms
    
    // Animation bar position
    let barPositionX = -2.0;

    // Three.js Meshes
    let railsMesh = null;
    let slidingBarMesh = null;
    let fieldLineGroup = null;
    let currentArrowGroup = null;

    // Helper: Parse LaTeX formulas
    function renderMarkdownWithKaTeX(text) {
        return text.replace(/\$(.*?)\$/g, (match, formula) => {
            try {
                return katex.renderToString(formula, { throwOnError: false });
            } catch (e) {
                return match;
            }
        });
    }

    const faradaysSimulator = {
        mobileViewListener: null,
        async init(containerEl, savedState) {
            container = containerEl;

            if (savedState) {
                bFieldMagnitude = savedState.bFieldMagnitude || 1.5;
                fieldFrequency = savedState.fieldFrequency || 2.0;
                turnsN = savedState.turnsN || 10;
                railWidth = savedState.railWidth || 2.0;
                barVelocity = savedState.barVelocity || 1.0;
                resistor1 = savedState.resistor1 || 10.0;
                resistor2 = savedState.resistor2 || 20.0;
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
                        <div class="canvas-overlay-ui" style="background: rgba(255,255,255,0.7); padding: 5px; font-size: 11px;">
                            <span class="font-bold">Faraday Motional Rail Simulation</span>
                        </div>
                        <button id="btn-toggle-sidebar" class="btn-toggle-sidebar">
                            <span>Properties</span> <span id="toggle-sidebar-arrow">➔</span>
                        </button>
                        <div id="three-canvas-target" style="width: 100%; height: 100%;"></div>
                    </div>

                    <!-- Right: Config & Math Sidebar -->
                    <div class="sidebar-container" id="em-sidebar">
                        
                        <!-- Sub-Tabs -->
                        <div style="display: flex; border-bottom: 2px solid #000; background: #fff; position: sticky; top: 0; z-index: 5;">
                            <button class="tab-sub-btn active" id="btn-sub-prop" style="flex: 1; border: none; border-right: 1px solid #000; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Properties</button>
                            <button class="tab-sub-btn" id="btn-sub-calc" style="flex: 1; border: none; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Calculation</button>
                        </div>

                        <!-- SECTION 1: PROPERTIES -->
                        <div id="sec-sub-prop" class="sidebar-tab-content">
                            <!-- Rail System Parameters -->
                            <div class="sidebar-section">
                                <h4 class="text-xs font-bold uppercase tracking-wider mb-3">Conductive Rails & Field</h4>
                                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <!-- B0 field -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">B0 Field (Tesla)</span>
                                            <span id="lbl-b0" class="text-xs font-mono">1.50</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="0.1" max="5.0" step="0.1" id="slider-b0" style="flex: 1; accent-color:#000;" value="${bFieldMagnitude}">
                                            <input type="number" step="0.1" id="num-b0" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${bFieldMagnitude}">
                                        </div>
                                    </div>
                                    <!-- Bar velocity -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Bar Velocity u (m/s)</span>
                                            <span id="lbl-vel" class="text-xs font-mono">1.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="0.0" max="3.0" step="0.1" id="slider-vel" style="flex: 1; accent-color:#000;" value="${barVelocity}">
                                            <input type="number" step="0.1" id="num-vel" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${barVelocity}">
                                        </div>
                                    </div>
                                    <!-- Rails separation -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Rail Width L (m)</span>
                                            <span id="lbl-width" class="text-xs font-mono">2.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="1.0" max="3.0" step="0.1" id="slider-width" style="flex: 1; accent-color:#000;" value="${railWidth}">
                                            <input type="number" step="0.1" id="num-width" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${railWidth}">
                                        </div>
                                    </div>
                                    <!-- Time Frequency for Transformer EMF -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">B(t) Oscillation Frequency (Hz)</span>
                                            <span id="lbl-freq" class="text-xs font-mono">2.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="0.1" max="10.0" step="0.1" id="slider-freq" style="flex: 1; accent-color:#000;" value="${fieldFrequency}">
                                            <input type="number" step="0.1" id="num-freq" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${fieldFrequency}">
                                        </div>
                                    </div>
                                    <!-- Number of turns -->
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Coil Turns N</span>
                                            <span id="lbl-turns" class="text-xs font-mono">10</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="1" max="50" step="1" id="slider-turns" style="flex: 1; accent-color:#000;" value="${turnsN}">
                                            <input type="number" step="1" id="num-turns" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${turnsN}">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Resistor Divider Settings -->
                            <div class="sidebar-section">
                                <h4 class="text-xs font-bold uppercase tracking-wider mb-3">Multi-loop Resistors</h4>
                                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Left Resistor R1 (Ω)</span>
                                            <span id="lbl-r1" class="text-xs font-mono">10.0</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="1.0" max="100.0" step="1" id="slider-r1" style="flex: 1; accent-color:#000;" value="${resistor1}">
                                            <input type="number" step="1" id="num-r1" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${resistor1}">
                                        </div>
                                    </div>
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Right Resistor R2 (Ω)</span>
                                            <span id="lbl-r2" class="text-xs font-mono">20.0</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="1.0" max="100.0" step="1" id="slider-r2" style="flex: 1; accent-color:#000;" value="${resistor2}">
                                            <input type="number" step="1" id="num-r2" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${resistor2}">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 2: CALCULATION -->
                        <div id="sec-sub-calc" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Faraday's Law Calculations</h3>
                                <div class="math-derivations-box" id="math-derivation-output" style="white-space: normal; word-wrap: break-word;">
                                    <!-- Dynamic KaTeX -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            canvasParent = document.getElementById('em-canvas-parent');
            canvasTarget = document.getElementById('three-canvas-target');
        },

        initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xffffff);

            camera = new THREE.PerspectiveCamera(45, canvasTarget.clientWidth / canvasTarget.clientHeight, 0.1, 100);
            camera.position.set(0, 5, 8);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(canvasTarget.clientWidth, canvasTarget.clientHeight);
            canvasTarget.appendChild(renderer.domElement);

            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
            scene.add(ambientLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.35);
            dirLight.position.set(5, 10, 7);
            scene.add(dirLight);

            // Parallel conductive rails representation
            const railsGeom = new THREE.Group();
            
            // Parallel rail lines (Z = -railWidth/2 and +railWidth/2)
            const r1Geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, -railWidth/2), new THREE.Vector3(4, 0, -railWidth/2)]);
            const r2Geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, railWidth/2), new THREE.Vector3(4, 0, railWidth/2)]);
            const rMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
            railsGeom.add(new THREE.Line(r1Geom, rMat));
            railsGeom.add(new THREE.Line(r2Geom, rMat));

            // Left end short connector (resistors housing)
            const connGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, -railWidth/2), new THREE.Vector3(-4, 0, railWidth/2)]);
            railsGeom.add(new THREE.Line(connGeom, rMat));

            scene.add(railsGeom);
            railsMesh = railsGeom;

            // Sliding Bar
            const barGeom = new THREE.CylinderGeometry(0.06, 0.06, railWidth, 8);
            const barMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            slidingBarMesh = new THREE.Mesh(barGeom, barMat);
            // Orient along Z axis
            slidingBarMesh.rotation.x = Math.PI / 2;
            slidingBarMesh.position.set(barPositionX, 0, 0);
            scene.add(slidingBarMesh);

            // Magnetic field vectors background group
            fieldLineGroup = new THREE.Group();
            scene.add(fieldLineGroup);

            // Current direction arrows group
            currentArrowGroup = new THREE.Group();
            scene.add(currentArrowGroup);

            window.addEventListener('resize', faradaysSimulator.onResize);
            faradaysSimulator.animate();
        },

        animate() {
            if (!renderer || !scene || !camera) return;
            animationFrameId = requestAnimationFrame(() => faradaysSimulator.animate());

            // Bar Motion simulation along rails
            const dt = clock.getDelta();
            if (barVelocity > 0) {
                barPositionX += barVelocity * dt;
                if (barPositionX > 3.5) {
                    barPositionX = -3.5; // loop back
                }
                if (slidingBarMesh) {
                    slidingBarMesh.position.set(barPositionX, 0, 0);
                }
            }

            // Time varying phase
            simTime += dt;

            if (controls) controls.update();
            faradaysSimulator.updatePhysics();
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
            // Slider / input binders
            const bindValueSync = (sliderId, numId, labelId, setterFn) => {
                const slider = document.getElementById(sliderId);
                const num = document.getElementById(numId);
                const label = document.getElementById(labelId);

                const updateVal = (val) => {
                    val = parseFloat(val);
                    if (isNaN(val)) val = 0;
                    slider.value = val;
                    num.value = val;
                    label.innerText = val.toFixed(2);
                    setterFn(val);
                    faradaysSimulator.updatePhysics();
                };

                slider.addEventListener('input', () => updateVal(slider.value));
                num.addEventListener('input', () => updateVal(num.value));
            };

            bindValueSync('slider-b0', 'num-b0', 'lbl-b0', (val) => bFieldMagnitude = val);
            bindValueSync('slider-vel', 'num-vel', 'lbl-vel', (val) => barVelocity = val);
            bindValueSync('slider-width', 'num-width', 'lbl-width', (val) => {
                railWidth = val;
                faradaysSimulator.syncThreeScene();
            });
            bindValueSync('slider-freq', 'num-freq', 'lbl-freq', (val) => fieldFrequency = val);
            bindValueSync('slider-turns', 'num-turns', 'lbl-turns', (val) => turnsN = Math.round(val));
            bindValueSync('slider-r1', 'num-r1', 'lbl-r1', (val) => resistor1 = val);
            bindValueSync('slider-r2', 'num-r2', 'lbl-r2', (val) => resistor2 = val);

            // Tab toggling events for sub-tabs in sidebar
            const subTabs = {
                prop: { btn: document.getElementById('btn-sub-prop'), sec: document.getElementById('sec-sub-prop') },
                calc: { btn: document.getElementById('btn-sub-calc'), sec: document.getElementById('sec-sub-calc') }
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

            // Mobile Tabs
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
                faradaysSimulator.onResize();
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
                if (window.innerWidth < 768) {
                    resetTabs();
                    tab3d.classList.add('active');
                    canvasParent.classList.remove('hidden');
                } else {
                    canvasParent.classList.remove('hidden');
                    document.getElementById('em-sidebar').classList.remove('hidden');
                    switchSubTab('prop');
                }
            };
            faradaysSimulator.mobileViewListener = checkMobileView;
            window.addEventListener('resize', faradaysSimulator.mobileViewListener);
            checkMobileView();

            // Sidebar collapse toggler
            const emSidebar = container.querySelector('#em-sidebar');
            const btnToggle = container.querySelector('#btn-toggle-sidebar');
            const arrow = container.querySelector('#toggle-sidebar-arrow');

            const updateSidebarCollapseState = () => {
                if (window.sidebarCollapsed) {
                    emSidebar.classList.add('collapsed');
                    if (arrow) arrow.textContent = '◀';
                } else {
                    emSidebar.classList.remove('collapsed');
                    if (arrow) arrow.textContent = '➔';
                }
                faradaysSimulator.onResize();
            };

            if (btnToggle) {
                btnToggle.addEventListener('click', () => {
                    window.sidebarCollapsed = !window.sidebarCollapsed;
                    updateSidebarCollapseState();
                });
            }
            updateSidebarCollapseState();
        },

        updateUI() {
            const syncElement = (sliderId, numId, labelId, val) => {
                const slider = document.getElementById(sliderId);
                const num = document.getElementById(numId);
                const label = document.getElementById(labelId);
                if (slider) slider.value = val;
                if (num) num.value = val;
                if (label) label.innerText = val.toFixed(2);
            };

            syncElement('slider-b0', 'num-b0', 'lbl-b0', bFieldMagnitude);
            syncElement('slider-vel', 'num-vel', 'lbl-vel', barVelocity);
            syncElement('slider-width', 'num-width', 'lbl-width', railWidth);
            syncElement('slider-freq', 'num-freq', 'lbl-freq', fieldFrequency);
            syncElement('slider-turns', 'num-turns', 'lbl-turns', turnsN);
            syncElement('slider-r1', 'num-r1', 'lbl-r1', resistor1);
            syncElement('slider-r2', 'num-r2', 'lbl-r2', resistor2);
        },

        updatePhysics() {
            // Re-draw dynamic magnetic field lines
            while (fieldLineGroup.children.length > 0) {
                const child = fieldLineGroup.children[0];
                if (child.line) {
                    if (child.line.geometry) child.line.geometry.dispose();
                    if (child.line.material) child.line.material.dispose();
                }
                if (child.cone) {
                    if (child.cone.geometry) child.cone.geometry.dispose();
                    if (child.cone.material) child.cone.material.dispose();
                }
                fieldLineGroup.remove(child);
            }

            // Draw field arrows pointing vertically downward (-Y direction or upward)
            // Magnitude varies sinusoidally over time: B(t) = B0 * cos(2*pi*f*t)
            const omega = 2 * Math.PI * fieldFrequency;
            const bTimeVal = bFieldMagnitude * Math.cos(omega * simTime);
            
            const dir = new THREE.Vector3(0, bTimeVal > 0 ? 1 : -1, 0);
            const bMagAbs = Math.abs(bTimeVal);
            
            if (bMagAbs > 0.05) {
                const spacing = 1.0;
                for (let x = -3.0; x <= 3.0; x += spacing) {
                    for (let z = -1.5; z <= 1.5; z += spacing) {
                        const origin = new THREE.Vector3(x, bTimeVal > 0 ? -1 : 1, z);
                        const arrow = new THREE.ArrowHelper(dir, origin, 1.8, 0xaaaaaa, 0.15, 0.05);
                        fieldLineGroup.add(arrow);
                    }
                }
            }

            // Draw current flow directional helper arrows along loop
            while (currentArrowGroup.children.length > 0) {
                const child = currentArrowGroup.children[0];
                if (child.line) {
                    if (child.line.geometry) child.line.geometry.dispose();
                    if (child.line.material) child.line.material.dispose();
                }
                if (child.cone) {
                    if (child.cone.geometry) child.cone.geometry.dispose();
                    if (child.cone.material) child.cone.material.dispose();
                }
                currentArrowGroup.remove(child);
            }

            // Motional EMF = B0 * L * u
            const vMotional = bFieldMagnitude * railWidth * barVelocity;
            
            // Transformer EMF = - N * dB/dt * Area
            // Area = L * x_bar
            const loopArea = railWidth * (barPositionX + 4.0); // rails start at x = -4.0
            const dBdt = -bFieldMagnitude * omega * Math.sin(omega * simTime);
            const vTransformer = -turnsN * dBdt * loopArea;

            // Combined Induced EMF
            const vNet = vMotional + vTransformer;

            // Induced current direction based on Lenz's Law
            if (Math.abs(vNet) > 0.01) {
                const clockwise = vNet > 0;
                // Draw indicators along rails loop
                const arrowColor = 0xff0000;
                
                // Top rail arrow
                const topArrow = new THREE.ArrowHelper(
                    new THREE.Vector3(clockwise ? 1 : -1, 0, 0),
                    new THREE.Vector3(-1.0, 0, -railWidth/2),
                    0.6, arrowColor, 0.15, 0.06
                );
                currentArrowGroup.add(topArrow);

                // Bottom rail arrow
                const bottomArrow = new THREE.ArrowHelper(
                    new THREE.Vector3(clockwise ? -1 : 1, 0, 0),
                    new THREE.Vector3(-1.0, 0, railWidth/2),
                    0.6, arrowColor, 0.15, 0.06
                );
                currentArrowGroup.add(bottomArrow);

                // Sliding bar arrow
                const barArrow = new THREE.ArrowHelper(
                    new THREE.Vector3(0, 0, clockwise ? 1 : -1),
                    new THREE.Vector3(barPositionX, 0, 0),
                    0.6, arrowColor, 0.15, 0.06
                );
                currentArrowGroup.add(barArrow);
            }

            faradaysSimulator.renderMathDerivation(vMotional, vTransformer, vNet, loopArea, dBdt);
        },

        syncThreeScene() {
            // Re-initialize rails separation representation in ThreeJS
            if (railsMesh) {
                while (railsMesh.children.length > 0) {
                    const child = railsMesh.children[0];
                    child.geometry.dispose();
                    child.material.dispose();
                    railsMesh.remove(child);
                }

                const r1Geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, -railWidth/2), new THREE.Vector3(4, 0, -railWidth/2)]);
                const r2Geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, railWidth/2), new THREE.Vector3(4, 0, railWidth/2)]);
                const rMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
                railsMesh.add(new THREE.Line(r1Geom, rMat));
                railsMesh.add(new THREE.Line(r2Geom, rMat));

                const connGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, -railWidth/2), new THREE.Vector3(-4, 0, railWidth/2)]);
                railsMesh.add(new THREE.Line(connGeom, rMat));
            }

            // Adjust sliding bar length
            if (slidingBarMesh) {
                scene.remove(slidingBarMesh);
                slidingBarMesh.geometry.dispose();
                slidingBarMesh.material.dispose();

                const barGeom = new THREE.CylinderGeometry(0.06, 0.06, railWidth, 8);
                const barMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
                slidingBarMesh = new THREE.Mesh(barGeom, barMat);
                slidingBarMesh.rotation.x = Math.PI / 2;
                slidingBarMesh.position.set(barPositionX, 0, 0);
                scene.add(slidingBarMesh);
            }
        },

        renderMathDerivation(vMotional, vTransformer, vNet, loopArea, dBdt) {
            const out = document.getElementById('math-derivation-output');
            if (!out) return;

            let html = '';

            // 1. Transformer EMF section
            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1">1. Transformer EMF (Time-varying B(t)):</h4>`;
            html += `<div class="katex-render">B(t) = B_0 \\cos(\\omega t)</div>`;
            html += `<div class="katex-render">\\Phi_B = B(t) \\cdot A = B_0 (L x) \\cos(\\omega t)</div>`;
            html += `<div class="katex-render">V_{\\text{emf}}^{\\text{tr}} = -N \\frac{d\\Phi_B}{dt} = N B_0 L x \\omega \\sin(\\omega t)</div>`;
            
            const trDesc = `Active loop area $A = L \\cdot x = ${(loopArea).toFixed(2)}\\text{ m}^2$, $N = ${turnsN}$ turns.`;
            html += `<p class="text-xs mb-1">${renderMarkdownWithKaTeX(trDesc)}</p>`;
            html += `<div class="katex-render">\\frac{dB}{dt} = ${dBdt.toExponential(2)} \\text{ T/s}</div>`;
            html += `<div class="katex-render">V_{\\text{emf}}^{\\text{tr}} = ${vTransformer.toFixed(3)} \\text{ Volts}</div>`;

            // 2. Motional EMF section
            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">2. Motional EMF (Sliding Bar):</h4>`;
            html += `<div class="katex-render">V_{\\text{emf}}^{\\text{mot}} = \\int_0^L (\\mathbf{u} \\times \\mathbf{B}) \\cdot d\\mathbf{l} = B_0 L u</div>`;
            
            const motDesc = `Given velocity $u = ${barVelocity.toFixed(1)}\\text{ m/s}$, field $B_0 = ${bFieldMagnitude.toFixed(1)}\\text{ T}$, bar length $L = ${railWidth.toFixed(1)}\\text{ m}$.`;
            html += `<p class="text-xs mb-1">${renderMarkdownWithKaTeX(motDesc)}</p>`;
            html += `<div class="katex-render">V_{\\text{emf}}^{\\text{mot}} = ${vMotional.toFixed(3)} \\text{ Volts}</div>`;

            // 3. Combined / Net EMF & Divider
            const v1Divider = vNet * (resistor1 / (resistor1 + resistor2));
            const v2Divider = vNet * (resistor2 / (resistor1 + resistor2));

            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">3. Combined EMF & Resistor Divider:</h4>`;
            html += `<div class="katex-render">V_{\\text{emf}}^{\\text{net}} = V_{\\text{emf}}^{\\text{mot}} + V_{\\text{emf}}^{\\text{tr}} = ${vNet.toFixed(3)} \\text{ Volts}</div>`;
            html += `<p class="text-xs mb-1">${renderMarkdownWithKaTeX(`Voltage drops across load resistors $R_1 = ${resistor1}\\Omega$ and $R_2 = ${resistor2}\\Omega$ (Series Divider):`)}</p>`;
            html += `<div class="katex-render">V_{R1} = V_{\\text{emf}}^{\\text{net}} \\frac{R_1}{R_1 + R_2} = ${v1Divider.toFixed(3)} \\text{ V}</div>`;
            html += `<div class="katex-render">V_{R2} = V_{\\text{emf}}^{\\text{net}} \\frac{R_2}{R_1 + R_2} = ${v2Divider.toFixed(3)} \\text{ V}</div>`;

            // 4. Lenz's Law Right Hand Rule helper description
            html += `<p class="text-xs font-bold mt-2 text-red-600">${renderMarkdownWithKaTeX(`Lenz's Law: Induced current (red arrows) direction opposes the magnetic flux changes $\\frac{d\\Phi_B}{dt}$ inside rails.`)}</p>`;

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
                bFieldMagnitude,
                fieldFrequency,
                turnsN,
                railWidth,
                barVelocity,
                resistor1,
                resistor2
            };
        },

        destroy() {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            window.removeEventListener('resize', faradaysSimulator.onResize);
            if (faradaysSimulator.mobileViewListener) {
                window.removeEventListener('resize', faradaysSimulator.mobileViewListener);
            }
            if (controls) controls.dispose();
            // Traverse scene and dispose all GPU resources to prevent WebGL memory leaks
            if (scene) {
                scene.traverse((object) => {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        const mats = Array.isArray(object.material) ? object.material : [object.material];
                        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                    }
                });
            }
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

    window.activeSimulator = faradaysSimulator;
})();
