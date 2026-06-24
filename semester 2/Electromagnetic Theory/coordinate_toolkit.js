// Coordinate Transformation Toolkit Module
// For Semester 2 - Electromagnetic Theory

(function() {
    let scene, camera, renderer, controls;
    let container;
    let animationFrameId = null;
    let canvasParent, canvasTarget;

    // Coordinate States (Cartesian is primary, others derived)
    let cartesian = { x: 1.5, y: 1.5, z: 1.5 };
    
    // Input Vector in Cartesian
    let vectorA = { x: 1.0, y: 1.0, z: 1.0 };

    // Active coordinate visual overlay mode
    let gridOverlayMode = 'cylindrical'; // 'cylindrical' | 'spherical'

    // Three.js meshes
    let obsPointMesh;
    let vectorArrow = null;
    let coordinateShelGroup = null;
    let unitVectorGroup = null;

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

    // Projections and conversions helper
    const mathEngine = {
        cartesianToCylindrical(c) {
            const rho = Math.sqrt(c.x*c.x + c.y*c.y);
            const phi = Math.atan2(c.y, c.x); // in radians
            return { rho, phi, z: c.z };
        },

        cartesianToSpherical(c) {
            const r = Math.sqrt(c.x*c.x + c.y*c.y + c.z*c.z);
            const theta = r > 0 ? Math.acos(c.z / r) : 0;
            const phi = Math.atan2(c.y, c.x);
            return { r, theta, phi };
        },

        transformVectorToCylindrical(A, c) {
            const cyl = this.cartesianToCylindrical(c);
            const cosPhi = cyl.rho > 0 ? c.x / cyl.rho : 1;
            const sinPhi = cyl.rho > 0 ? c.y / cyl.rho : 0;

            const Arho = A.x * cosPhi + A.y * sinPhi;
            const Aphi = -A.x * sinPhi + A.y * cosPhi;
            return { rho: Arho, phi: Aphi, z: A.z };
        },

        transformVectorToSpherical(A, c) {
            const sph = this.cartesianToSpherical(c);
            const rho = Math.sqrt(c.x*c.x + c.y*c.y);
            
            const cosPhi = rho > 0 ? c.x / rho : 1;
            const sinPhi = rho > 0 ? c.y / rho : 0;
            
            const r = sph.r;
            const cosTheta = r > 0 ? c.z / r : 1;
            const sinTheta = r > 0 ? rho / r : 0;

            const Ar = A.x * sinTheta * cosPhi + A.y * sinTheta * sinPhi + A.z * cosTheta;
            const Atheta = A.x * cosTheta * cosPhi + A.y * cosTheta * sinPhi - A.z * sinTheta;
            const Aphi = -A.x * sinPhi + A.y * cosPhi;
            
            return { r: Ar, theta: Atheta, phi: Aphi };
        }
    };

    const coordinateToolkit = {
        mobileViewListener: null,
        async init(containerEl, savedState) {
            container = containerEl;

            if (savedState) {
                cartesian = savedState.cartesian || { x: 1.5, y: 1.5, z: 1.5 };
                vectorA = savedState.vectorA || { x: 1.0, y: 1.0, z: 1.0 };
                gridOverlayMode = savedState.gridOverlayMode || 'cylindrical';
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
                        <div class="canvas-overlay-ui" style="background: rgba(255,255,255,0.75); padding: 5px; font-size: 11px;">
                            <span class="font-bold">Coordinate Toolkit Visualizer</span>
                        </div>
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
                            <!-- Coordinate sliders -->
                            <div class="sidebar-section">
                                <h4 class="text-xs font-bold uppercase tracking-wider mb-3">Observation Point Position P</h4>
                                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">X Position</span>
                                            <span id="lbl-cart-x" class="text-xs font-mono">1.50</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-4" max="4" step="0.1" id="slider-cart-x" style="flex: 1; accent-color:#000;" value="${cartesian.x}">
                                            <input type="number" step="0.1" id="num-cart-x" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${cartesian.x}">
                                        </div>
                                    </div>
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Y Position</span>
                                            <span id="lbl-cart-y" class="text-xs font-mono">1.50</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-4" max="4" step="0.1" id="slider-cart-y" style="flex: 1; accent-color:#000;" value="${cartesian.y}">
                                            <input type="number" step="0.1" id="num-cart-y" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${cartesian.y}">
                                        </div>
                                    </div>
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Z Position</span>
                                            <span id="lbl-cart-z" class="text-xs font-mono">1.50</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-4" max="4" step="0.1" id="slider-cart-z" style="flex: 1; accent-color:#000;" value="${cartesian.z}">
                                            <input type="number" step="0.1" id="num-cart-z" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${cartesian.z}">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Vector A inputs -->
                            <div class="sidebar-section">
                                <h4 class="text-xs font-bold uppercase tracking-wider mb-3">Cartesian Vector Components A</h4>
                                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Ax component</span>
                                            <span id="lbl-vec-x" class="text-xs font-mono">1.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-3" max="3" step="0.1" id="slider-vec-x" style="flex: 1; accent-color:#000;" value="${vectorA.x}">
                                            <input type="number" step="0.1" id="num-vec-x" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${vectorA.x}">
                                        </div>
                                    </div>
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Ay component</span>
                                            <span id="lbl-vec-y" class="text-xs font-mono">1.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-3" max="3" step="0.1" id="slider-vec-y" style="flex: 1; accent-color:#000;" value="${vectorA.y}">
                                            <input type="number" step="0.1" id="num-vec-y" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${vectorA.y}">
                                        </div>
                                    </div>
                                    <div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem;">
                                            <span class="text-xs font-bold font-mono">Az component</span>
                                            <span id="lbl-vec-z" class="text-xs font-mono">1.00</span>
                                        </div>
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input type="range" min="-3" max="3" step="0.1" id="slider-vec-z" style="flex: 1; accent-color:#000;" value="${vectorA.z}">
                                            <input type="number" step="0.1" id="num-vec-z" style="width: 60px;" class="border border-black px-1 text-xs py-0.5" value="${vectorA.z}">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 2: CALCULATION -->
                        <div id="sec-sub-calc" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <div class="form-group mb-4">
                                    <label for="overlay-select">Coordinate System Overlays</label>
                                    <select id="overlay-select" class="form-control border-black text-xs py-1">
                                        <option value="cylindrical">Cylindrical Coordinate Shells</option>
                                        <option value="spherical">Spherical Coordinate Shells</option>
                                    </select>
                                </div>
                                <h3 class="sidebar-section-title">Vector Conversions & Equations</h3>
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
            camera.position.set(4, 4, 6);

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

            // Coordinate grid base
            gridHelper = new THREE.GridHelper(10, 10, 0x000000, 0xdddddd);
            gridHelper.rotation.x = Math.PI / 2;
            scene.add(gridHelper);

            // Axis labels helpers
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

            // Point P marker
            const pGeom = new THREE.SphereGeometry(0.1, 16, 16);
            const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            obsPointMesh = new THREE.Mesh(pGeom, pMat);
            scene.add(obsPointMesh);

            coordinateShelGroup = new THREE.Group();
            scene.add(coordinateShelGroup);

            unitVectorGroup = new THREE.Group();
            scene.add(unitVectorGroup);

            window.addEventListener('resize', coordinateToolkit.onResize);
            coordinateToolkit.animate();
        },

        animate() {
            if (!renderer || !scene || !camera) return;
            animationFrameId = requestAnimationFrame(() => coordinateToolkit.animate());
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
            const overlaySelect = document.getElementById('overlay-select');

            const bindValueSync = (sliderId, numId, labelId, key, targetState) => {
                const slider = document.getElementById(sliderId);
                const num = document.getElementById(numId);
                const label = document.getElementById(labelId);

                const updateVal = (val) => {
                    val = parseFloat(val);
                    if (isNaN(val)) val = 0;
                    slider.value = val;
                    num.value = val;
                    label.innerText = val.toFixed(2);
                    targetState[key] = val;
                    
                    obsPointMesh.position.set(cartesian.x, cartesian.y, cartesian.z);
                    coordinateToolkit.updatePhysics();
                    coordinateToolkit.syncThreeScene();
                };

                slider.addEventListener('input', () => updateVal(slider.value));
                num.addEventListener('input', () => updateVal(num.value));
            };

            bindValueSync('slider-cart-x', 'num-cart-x', 'lbl-cart-x', 'x', cartesian);
            bindValueSync('slider-cart-y', 'num-cart-y', 'lbl-cart-y', 'y', cartesian);
            bindValueSync('slider-cart-z', 'num-cart-z', 'lbl-cart-z', 'z', cartesian);

            bindValueSync('slider-vec-x', 'num-vec-x', 'lbl-vec-x', 'x', vectorA);
            bindValueSync('slider-vec-y', 'num-vec-y', 'lbl-vec-y', 'y', vectorA);
            bindValueSync('slider-vec-z', 'num-vec-z', 'lbl-vec-z', 'z', vectorA);

            overlaySelect.addEventListener('change', (e) => {
                gridOverlayMode = e.target.value;
                coordinateToolkit.syncThreeScene();
            });

            // Sub-Tabs
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
                coordinateToolkit.onResize();
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
            coordinateToolkit.mobileViewListener = checkMobileView;
            window.addEventListener('resize', coordinateToolkit.mobileViewListener);
            checkMobileView();
        },

        updatePhysics() {
            // Remove previous arrows
            if (vectorArrow) {
                if (vectorArrow.line) {
                    if (vectorArrow.line.geometry) vectorArrow.line.geometry.dispose();
                    if (vectorArrow.line.material) vectorArrow.line.material.dispose();
                }
                if (vectorArrow.cone) {
                    if (vectorArrow.cone.geometry) vectorArrow.cone.geometry.dispose();
                    if (vectorArrow.cone.material) vectorArrow.cone.material.dispose();
                }
                scene.remove(vectorArrow);
                vectorArrow = null;
            }
            
            while (unitVectorGroup.children.length > 0) {
                const child = unitVectorGroup.children[0];
                if (child.line) {
                    if (child.line.geometry) child.line.geometry.dispose();
                    if (child.line.material) child.line.material.dispose();
                }
                if (child.cone) {
                    if (child.cone.geometry) child.cone.geometry.dispose();
                    if (child.cone.material) child.cone.material.dispose();
                }
                unitVectorGroup.remove(child);
            }

            const pVec = new THREE.Vector3(cartesian.x, cartesian.y, cartesian.z);
            if (obsPointMesh) {
                obsPointMesh.position.copy(pVec);
            }

            // Draw primary vector A at P
            const aMag = Math.sqrt(vectorA.x*vectorA.x + vectorA.y*vectorA.y + vectorA.z*vectorA.z);
            if (aMag > 0.05) {
                const dir = new THREE.Vector3(vectorA.x, vectorA.y, vectorA.z).normalize();
                vectorArrow = new THREE.ArrowHelper(dir, pVec, aMag, 0x000000, 0.15, 0.05);
                scene.add(vectorArrow);
            }

            // Draw Cylindrical / Spherical unit vectors at P
            const cyl = mathEngine.cartesianToCylindrical(cartesian);
            const sph = mathEngine.cartesianToSpherical(cartesian);

            // Azimuthal unit vector a_phi
            const phi = cyl.phi;
            const aPhiDir = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
            const aPhiArrow = new THREE.ArrowHelper(aPhiDir, pVec, 0.6, 0x00ff00, 0.12, 0.04);
            unitVectorGroup.add(aPhiArrow);

            if (gridOverlayMode === 'cylindrical') {
                // Radial unit vector a_rho
                const aRhoDir = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
                const aRhoArrow = new THREE.ArrowHelper(aRhoDir, pVec, 0.6, 0xff0000, 0.12, 0.04);
                unitVectorGroup.add(aRhoArrow);
            } else {
                // Radial unit vector a_r
                const aRDir = new THREE.Vector3(
                    Math.sin(sph.theta) * Math.cos(phi),
                    Math.sin(sph.theta) * Math.sin(phi),
                    Math.cos(sph.theta)
                );
                const aRArrow = new THREE.ArrowHelper(aRDir, pVec, 0.6, 0xff0000, 0.12, 0.04);
                unitVectorGroup.add(aRArrow);

                // Polar unit vector a_theta
                const aThetaDir = new THREE.Vector3(
                    Math.cos(sph.theta) * Math.cos(phi),
                    Math.cos(sph.theta) * Math.sin(phi),
                    -Math.sin(sph.theta)
                );
                const aThetaArrow = new THREE.ArrowHelper(aThetaDir, pVec, 0.6, 0x0000ff, 0.12, 0.04);
                unitVectorGroup.add(aThetaArrow);
            }

            // Calculations printouts
            coordinateToolkit.renderMathDerivation(cyl, sph);
        },

        syncThreeScene() {
            // Clear coordinate shells
            while (coordinateShelGroup.children.length > 0) {
                const child = coordinateShelGroup.children[0];
                child.geometry.dispose();
                child.material.dispose();
                coordinateShelGroup.remove(child);
            }

            const cyl = mathEngine.cartesianToCylindrical(cartesian);
            const sph = mathEngine.cartesianToSpherical(cartesian);

            if (gridOverlayMode === 'cylindrical') {
                // Draw Cylinder of radius rho
                if (cyl.rho > 0.05) {
                    const geom = new THREE.CylinderGeometry(cyl.rho, cyl.rho, 6, 32, 1, true);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true, transparent: true, opacity: 0.15 });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.rotation.x = Math.PI / 2;
                    mesh.position.set(0, 0, 0);
                    coordinateShelGroup.add(mesh);
                }
            } else {
                // Draw Latitude Sphere of radius r
                if (sph.r > 0.05) {
                    const geom = new THREE.SphereGeometry(sph.r, 16, 16);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true, transparent: true, opacity: 0.15 });
                    const mesh = new THREE.Mesh(geom, mat);
                    coordinateShelGroup.add(mesh);
                }
            }

            coordinateToolkit.updatePhysics();
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

            syncElement('slider-cart-x', 'num-cart-x', 'lbl-cart-x', cartesian.x);
            syncElement('slider-cart-y', 'num-cart-y', 'lbl-cart-y', cartesian.y);
            syncElement('slider-cart-z', 'num-cart-z', 'lbl-cart-z', cartesian.z);

            syncElement('slider-vec-x', 'num-vec-x', 'lbl-vec-x', vectorA.x);
            syncElement('slider-vec-y', 'num-vec-y', 'lbl-vec-y', vectorA.y);
            syncElement('slider-vec-z', 'num-vec-z', 'lbl-vec-z', vectorA.z);

            const overlaySelect = document.getElementById('overlay-select');
            if (overlaySelect) overlaySelect.value = gridOverlayMode;
        },

        renderMathDerivation(cyl, sph) {
            const out = document.getElementById('math-derivation-output');
            if (!out) return;

            // Compute vector conversions
            const cylVec = mathEngine.transformVectorToCylindrical(vectorA, cartesian);
            const sphVec = mathEngine.transformVectorToSpherical(vectorA, cartesian);

            let html = '';

            // 1. Cartesian positions readout
            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1">1. Coordinate Transformation Readout:</h4>`;
            html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Point $P_{\\text{cart}} = (${cartesian.x.toFixed(2)}, ${cartesian.y.toFixed(2)}, ${cartesian.z.toFixed(2)})\\text{ m}$.`)}</p>`;
            html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Cylindrical $P_{\\text{cyl}} = (\\rho = ${cyl.rho.toFixed(2)}\\text{ m}, \\phi = ${(cyl.phi * 180 / Math.PI).toFixed(1)}^\\circ, z = ${cyl.z.toFixed(2)}\\text{ m})$.`)}</p>`;
            html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Spherical $P_{\\text{sph}} = (r = ${sph.r.toFixed(2)}\\text{ m}, \\theta = ${(sph.theta * 180 / Math.PI).toFixed(1)}^\\circ, \\phi = ${(sph.phi * 180 / Math.PI).toFixed(1)}^\\circ)$.`)}</p>`;

            // 2. Vector transformations equations
            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">2. Vector Transform (A_cart → A_cyl / A_sph):</h4>`;
            html += `<div class="katex-render">\\mathbf{A}_{\\text{cart}} = ${vectorA.x.toFixed(2)}\\hat{\\mathbf{a}}_x + ${vectorA.y.toFixed(2)}\\hat{\\mathbf{a}}_y + ${vectorA.z.toFixed(2)}\\hat{\\mathbf{a}}_z</div>`;
            
            html += `<p class="text-xs font-bold mt-2">Cylindrical components:</p>`;
            html += `<div class="katex-render">A_\\rho = A_x \\cos\\phi + A_y \\sin\\phi = ${cylVec.rho.toFixed(3)}</div>`;
            html += `<div class="katex-render">A_\\phi = -A_x \\sin\\phi + A_y \\cos\\phi = ${cylVec.phi.toFixed(3)}</div>`;
            html += `<div class="katex-render">\\mathbf{A}_{\\text{cyl}} = ${cylVec.rho.toFixed(3)}\\hat{\\mathbf{a}}_\\rho + ${cylVec.phi.toFixed(3)}\\hat{\\mathbf{a}}_\\phi + ${cylVec.z.toFixed(3)}\\hat{\\mathbf{a}}_z</div>`;

            html += `<p class="text-xs font-bold mt-2">Spherical components:</p>`;
            html += `<div class="katex-render">A_r = ${sphVec.r.toFixed(3)}, \\quad A_\\theta = ${sphVec.theta.toFixed(3)}, \\quad A_\\phi = ${sphVec.phi.toFixed(3)}</div>`;
            html += `<div class="katex-render">\\mathbf{A}_{\\text{sph}} = ${sphVec.r.toFixed(3)}\\hat{\\mathbf{a}}_r + ${sphVec.theta.toFixed(3)}\\hat{\\mathbf{a}}_\\theta + ${sphVec.phi.toFixed(3)}\\hat{\\mathbf{a}}_\\phi</div>`;

            // 3. Differential Elements overview
            html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">3. Differential Geometry Elements:</h4>`;
            html += `<p class="text-xs font-bold">Cartesian:</p>`;
            html += `<div class="katex-render">d\\mathbf{l} = dx \\hat{\\mathbf{a}}_x + dy \\hat{\\mathbf{a}}_y + dz \\hat{\\mathbf{a}}_z</div>`;
            html += `<div class="katex-render">dV = dx \\, dy \\, dz</div>`;

            html += `<p class="text-xs font-bold mt-1">Cylindrical:</p>`;
            html += `<div class="katex-render">d\\mathbf{l} = d\\rho \\hat{\\mathbf{a}}_\\rho + \\rho d\\phi \\hat{\\mathbf{a}}_\\phi + dz \\hat{\\mathbf{a}}_z</div>`;
            html += `<div class="katex-render">dV = \\rho \\, d\\rho \\, d\\phi \\, dz</div>`;

            html += `<p class="text-xs font-bold mt-1">Spherical:</p>`;
            html += `<div class="katex-render">d\\mathbf{l} = dr \\hat{\\mathbf{a}}_r + r d\\theta \\hat{\\mathbf{a}}_\\theta + r \\sin\\theta d\\phi \\hat{\\mathbf{a}}_\\phi</div>`;
            html += `<div class="katex-render">dV = r^2 \\sin\\theta \\, dr \\, d\\theta \\, d\\phi</div>`;

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
                cartesian,
                vectorA,
                gridOverlayMode
            };
        },

        destroy() {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            window.removeEventListener('resize', coordinateToolkit.onResize);
            if (coordinateToolkit.mobileViewListener) {
                window.removeEventListener('resize', coordinateToolkit.mobileViewListener);
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

    window.activeSimulator = coordinateToolkit;
})();
