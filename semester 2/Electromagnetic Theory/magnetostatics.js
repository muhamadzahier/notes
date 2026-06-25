// Magnetostatics & Biot-Savart Simulator Module
// For Semester 2 - Electromagnetic Theory

(function() {
    let scene, camera, renderer, controls;
    let container;
    let animationFrameId = null;
    let canvasParent, canvasTarget;

    // Physics & Geometry State
    let observationPoint = { x: 0, y: 0, z: 2.0 };
    let spawnedObjects = [];
    
    // Constant parameters
    const MU_0 = 4 * Math.PI * 1e-7;
    const EPSILON_0 = 8.854e-12;
    const PI = Math.PI;

    // Material Permeability Map
    const materials = {
        air: { name: 'Air / Vacuum', mur: 1.0 },
        iron: { name: 'Soft Iron', mur: 5000.0 },
        ferrite: { name: 'Ferrite', mur: 20.0 },
        copper: { name: 'Copper', mur: 0.9999 }
    };
    let activeMaterial = 'air';

    // Three.js Objects
    let obsPointMesh;
    let fieldArrowH = null;
    let fieldArrowB = null;
    let dlArrow = null;
    let rArrow = null;
    let dbArrow = null;
    let wireMeshGroup = null;
    let AmperianLoopMesh = null;
    let gridHelper;

    // Field Probe System
    let probes = [];
    let probeGroup = null;
    let raycaster = null;
    let probeClickPlane = null;

    // Field Line Tracing
    let fieldLineGroup = null;
    let showFieldLines = false;

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

    // Helper: Generate segments for Biot-Savart wires
    function getWireSegments(obj) {
        const segments = [];
        if (obj.type === 'finite_wire') {
            // Straight wire from z1 to z2 along Z axis at offset (x, y)
            const zStart = obj.z1;
            const zEnd = obj.z2;
            const steps = 24;
            const stepSz = (zEnd - zStart) / steps;
            for (let i = 0; i < steps; i++) {
                segments.push({
                    start: new THREE.Vector3(obj.x, obj.y, zStart + i * stepSz),
                    end: new THREE.Vector3(obj.x, obj.y, zStart + (i + 1) * stepSz)
                });
            }
        } 
        else if (obj.type === 'circular_loop') {
            // Ring of radius a in XY plane at height z_offset
            const steps = 32;
            for (let i = 0; i < steps; i++) {
                const theta1 = (i / steps) * 2 * PI;
                const theta2 = ((i + 1) / steps) * 2 * PI;
                segments.push({
                    start: new THREE.Vector3(obj.radius * Math.cos(theta1), obj.radius * Math.sin(theta1), obj.zOffset),
                    end: new THREE.Vector3(obj.radius * Math.cos(theta2), obj.radius * Math.sin(theta2), obj.zOffset)
                });
            }
        } 
        else if (obj.type === 'triangular_loop') {
            // Triangle loop in XY plane at height z_offset
            const v1 = new THREE.Vector3(-obj.side/2, -obj.side/(2*Math.sqrt(3)), obj.zOffset);
            const v2 = new THREE.Vector3(obj.side/2, -obj.side/(2*Math.sqrt(3)), obj.zOffset);
            const v3 = new THREE.Vector3(0, obj.side/Math.sqrt(3), obj.zOffset);

            const addLinearSegments = (start, end, numSteps) => {
                const step = new THREE.Vector3().subVectors(end, start).multiplyScalar(1 / numSteps);
                for (let i = 0; i < numSteps; i++) {
                    segments.push({
                        start: start.clone().add(step.clone().multiplyScalar(i)),
                        end: start.clone().add(step.clone().multiplyScalar(i + 1))
                    });
                }
            };
            addLinearSegments(v1, v2, 8);
            addLinearSegments(v2, v3, 8);
            addLinearSegments(v3, v1, 8);
        }
        return segments;
    }

    // Solver Physics Formulas
    const physicsEngine = {
        calcHFieldBiotSavart(p, objects) {
            let H = new THREE.Vector3(0, 0, 0);
            let closestSeg = null;
            let minR = Infinity;

            objects.forEach(obj => {
                const segments = getWireSegments(obj);
                segments.forEach((seg, idx) => {
                    const dl = new THREE.Vector3().subVectors(seg.end, seg.start);
                    const center = new THREE.Vector3().addVectors(seg.start, seg.end).multiplyScalar(0.5);
                    const R = new THREE.Vector3().subVectors(p, center);
                    const rMag = R.length();
                    if (rMag < 0.05) return;

                    if (rMag < minR) {
                        minR = rMag;
                        closestSeg = { ...seg, idx, dl, center, R };
                    }

                    const Rhat = R.clone().normalize();
                    const cross = new THREE.Vector3().crossVectors(dl, Rhat);
                    // dH = I * dl x Rhat / (4 * pi * R^2)
                    const dH = cross.multiplyScalar(obj.current / (4 * PI * rMag * rMag));
                    H.add(dH);
                });
            });

            return { H, closestSeg };
        },

        calcAmpereLaw(p, objects) {
            let H = new THREE.Vector3(0, 0, 0);

            objects.forEach(obj => {
                if (obj.type === 'toroid') {
                    // Toroid axis is Z, center at origin
                    const rho = Math.sqrt(p.x*p.x + p.y*p.y);
                    const inside = (rho > (obj.rho0 - obj.a)) && (rho < (obj.rho0 + obj.a)) && (Math.abs(p.z) < obj.a);
                    if (inside) {
                        const mag = (obj.N * obj.current) / (2 * PI * rho);
                        // Direction is azimuthal a_phi = -sin(phi)ax + cos(phi)ay
                        const phi = Math.atan2(p.y, p.x);
                        H.set(-mag * Math.sin(phi), mag * Math.cos(phi), 0);
                    }
                } 
                else if (obj.type === 'solenoid') {
                    // Solenoid along Z-axis
                    const rho = Math.sqrt(p.x*p.x + p.y*p.y);
                    const inside = (rho < obj.radius) && (Math.abs(p.z) < obj.length / 2);
                    if (inside) {
                        const mag = (obj.N * obj.current) / obj.length;
                        H.set(0, 0, mag);
                    }
                }
            });

            return H;
        },

        calcForceOnWire(obj, BUniform) {
            // Force on spawned objects
            if (obj.type === 'finite_wire') {
                // F = I * L x B
                const length = obj.z2 - obj.z1;
                const L = new THREE.Vector3(0, 0, length);
                const F = new THREE.Vector3().crossVectors(L, BUniform).multiplyScalar(obj.current);
                return F;
            }
            return new THREE.Vector3(0,0,0);
        }
    };

    // ── RK4 Streamline Field Line Tracing (Magnetostatics) ─────────

    function magFieldEvaluator(pos, objects, dir) {
        const { H } = physicsEngine.calcHFieldBiotSavart(
            { x: pos.x, y: pos.y, z: pos.z }, objects
        );
        const mag = H.length();
        if (mag < 1e-12) return new THREE.Vector3(0, 0, 0);
        return H.clone().normalize().multiplyScalar(dir);
    }

    function traceMagFieldLines(objects, maxSteps, stepSize) {
        const lines = [];
        const sources = objects.filter(o => ['finite_wire', 'circular_loop', 'triangular_loop'].includes(o.type));

        sources.forEach(src => {
            let center = new THREE.Vector3(src.x || 0, src.y || 0, (src.z1 + src.z2) / 2 || 0);
            if (src.type === 'circular_loop') {
                center.set(0, 0, src.zOffset || 0);
            } else if (src.type === 'triangular_loop') {
                center.set(0, 0, src.zOffset || 0);
            }

            const nSeeds = 8;
            const seedRadius = 0.4;
            for (let i = 0; i < nSeeds; i++) {
                const phi = (2 * Math.PI * i) / nSeeds;
                const seed = new THREE.Vector3(
                    center.x + seedRadius * Math.cos(phi),
                    center.y + seedRadius * Math.sin(phi),
                    center.z + seedRadius * 0.3 * (i % 2 === 0 ? 1 : -1)
                );

                for (let dir = -1; dir <= 1; dir += 2) {
                    const points = [seed.clone()];
                    let pos = seed.clone();
                    for (let step = 0; step < maxSteps; step++) {
                        const k1 = magFieldEvaluator(pos, objects, dir);
                        const p2 = pos.clone().add(k1.clone().multiplyScalar(stepSize * 0.5));
                        const k2 = magFieldEvaluator(p2, objects, dir);
                        const p3 = pos.clone().add(k2.clone().multiplyScalar(stepSize * 0.5));
                        const k3 = magFieldEvaluator(p3, objects, dir);
                        const p4 = pos.clone().add(k3.clone().multiplyScalar(stepSize));
                        const k4 = magFieldEvaluator(p4, objects, dir);

                        const delta = k1.clone().multiplyScalar(1/6)
                            .add(k2.clone().multiplyScalar(2/6))
                            .add(k3.clone().multiplyScalar(2/6))
                            .add(k4.clone().multiplyScalar(1/6))
                            .multiplyScalar(stepSize);

                        pos = pos.clone().add(delta);
                        if (pos.length() > 12) break;
                        points.push(pos.clone());
                    }
                    if (points.length > 3) lines.push(points);
                }
            }
        });
        return lines;
    }

    // Main simulator object
    const magnetostaticsSimulator = {
        async init(containerEl, savedState) {
            container = containerEl;

            if (savedState) {
                observationPoint = savedState.observationPoint || { x: 0, y: 0, z: 2.0 };
                spawnedObjects = savedState.spawnedObjects || [];
                activeMaterial = savedState.activeMaterial || 'air';
            } else {
                observationPoint = { x: 0, y: 0, z: 2.0 };
                spawnedObjects = [
                    { id: 'wire_1', type: 'circular_loop', radius: 1.5, zOffset: 0.0, current: 8.0, solveMode: 'none', givenValue: 2 }
                ];
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
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-finite-wire">+ Straight Wire</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-loop">+ Circular Loop</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-triangle">+ Triangular Loop</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-toroid">+ Toroid</button>
                            <button class="btn-minimal text-xs bg-white" id="btn-spawn-solenoid">+ Solenoid</button>
                        </div>
                        <div class="canvas-label-coord" id="coord-label">P: (0.0, 0.0, 2.0)</div>
                        <div id="three-canvas-target" style="width: 100%; height: 100%;"></div>
                    </div>

                    <!-- Right: Config & Math Sidebar -->
                    <div class="sidebar-container" id="em-sidebar">
                        
                        <!-- Sub-Tabs -->
                        <div style="display: flex; border-bottom: 2px solid #000; background: #fff; position: sticky; top: 0; z-index: 5;">
                            <button class="tab-sub-btn active" id="btn-sub-prop" style="flex: 1; border: none; border-right: 1px solid #000; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Properties</button>
                            <button class="tab-sub-btn" id="btn-sub-calc" style="flex: 1; border: none; border-right: 1px solid #000; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Calculation</button>
                            <button class="tab-sub-btn" id="btn-sub-other" style="flex: 1; border: none; background: transparent; padding: 0.75rem 0.25rem; font-size: 0.75rem; font-weight: 800; cursor: pointer; text-transform: uppercase;">Material</button>
                        </div>

                        <!-- SECTION 1: PROPERTIES -->
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
                                <h3 class="sidebar-section-title">Spawned Currents / Coils</h3>
                                <div id="elements-list-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                                    <!-- Spawned items -->
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 2: CALCULATION -->
                        <div id="sec-sub-calc" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Magnetostatics Calculations</h3>
                                <div class="math-derivations-box" id="math-derivation-output" style="white-space: normal; word-wrap: break-word;">
                                    <!-- Dynamic KaTeX formulas -->
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 3: MATERIAL & SETTINGS -->
                        <div id="sec-sub-other" class="sidebar-tab-content hidden">
                            <div class="sidebar-section">
                                <h3 class="sidebar-section-title">Permeability Settings</h3>
                                <div class="form-group">
                                    <label for="material-select">Core Core Permeability (μ_r)</label>
                                    <select id="material-select" class="form-control">
                                        <option value="air">Air / Vacuum (μ_r = 1)</option>
                                        <option value="iron">Soft Iron Core (μ_r = 5000)</option>
                                        <option value="ferrite">Ferrite Core (μ_r = 20)</option>
                                        <option value="copper">Copper Core (μ_r ≈ 1)</option>
                                    </select>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <label class="flex items-center gap-2 text-xs font-bold font-mono cursor-pointer">
                                        <input type="checkbox" id="chk-show-fieldlines" ${showFieldLines ? 'checked' : ''} style="accent-color:#000;">
                                        Field Lines (RK4 Streamlines)
                                    </label>
                                </div>
                                <div style="margin-top: 1rem;">
                                    <button id="btn-clear-scene" class="btn-minimal text-xs w-full" style="width: 100%; border-color: #ff3b30; color: #ff3b30;">Clear Sandbox</button>
                                </div>
                            </div>

                            <!-- Field Probes Panel -->
                            <div class="sidebar-section border-t border-black">
                                <h3 class="sidebar-section-title">Field Probes <span style="font-size: 0.65rem; font-weight: normal; opacity: 0.6;">(Double-click canvas to place)</span></h3>
                                <div id="probes-table-container" style="max-height: 200px; overflow-y: auto;">
                                    <table style="width: 100%; font-size: 0.65rem; font-family: monospace; border-collapse: collapse;">
                                        <thead>
                                            <tr style="border-bottom: 1px solid #000;">
                                                <th style="text-align: left; padding: 2px;">#</th>
                                                <th style="text-align: left; padding: 2px;">Pos</th>
                                                <th style="text-align: right; padding: 2px;">|H|</th>
                                                <th style="text-align: right; padding: 2px;">|B|</th>
                                            </tr>
                                        </thead>
                                        <tbody id="probes-table-body"></tbody>
                                    </table>
                                </div>
                                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                                    <button id="btn-export-probes" class="btn-minimal" style="flex: 1; font-size: 0.65rem; padding: 0.25rem;">Export CSV</button>
                                    <button id="btn-clear-probes" class="btn-minimal" style="flex: 1; font-size: 0.65rem; padding: 0.25rem; border-color: #ff3b30; color: #ff3b30;">Clear All</button>
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
            camera.position.set(5, 5, 8);

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

            wireMeshGroup = new THREE.Group();
            scene.add(wireMeshGroup);

            // Field Probe click-to-place system
            probeGroup = new THREE.Group();
            scene.add(probeGroup);
            raycaster = new THREE.Raycaster();
            const planeGeom = new THREE.PlaneGeometry(50, 50);
            const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
            probeClickPlane = new THREE.Mesh(planeGeom, planeMat);
            scene.add(probeClickPlane);

            renderer.domElement.addEventListener('dblclick', (event) => {
                if (!camera || !renderer || !scene) return;
                const rect = renderer.domElement.getBoundingClientRect();
                const mouse = new THREE.Vector2(
                    ((event.clientX - rect.left) / rect.width) * 2 - 1,
                    -((event.clientY - rect.top) / rect.height) * 2 + 1
                );
                probeClickPlane.lookAt(camera.position);
                probeClickPlane.position.set(0, 0, 0);
                probeClickPlane.updateMatrixWorld();
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(probeClickPlane);
                if (intersects.length > 0) {
                    const pt = intersects[0].point;
                    magnetostaticsSimulator.placeProbe(
                        Math.round(pt.x * 10) / 10,
                        Math.round(pt.y * 10) / 10,
                        Math.round(pt.z * 10) / 10
                    );
                }
            });

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
            const materialSel = document.getElementById('material-select');
            const btnClear = document.getElementById('btn-clear-scene');

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
                };

                input.addEventListener('input', () => updateVal(input.value));
                slider.addEventListener('input', () => updateVal(slider.value));
            };

            bindCoordSync('p-x', 'p-x-slider', 'label-val-p-x', 'x');
            bindCoordSync('p-y', 'p-y-slider', 'label-val-p-y', 'y');
            bindCoordSync('p-z', 'p-z-slider', 'label-val-p-z', 'z');

            materialSel.addEventListener('change', (e) => {
                activeMaterial = e.target.value;
                this.updatePhysics();
            });

            // Field lines toggle
            const chkFieldLines = document.getElementById('chk-show-fieldlines');
            if (chkFieldLines) {
                chkFieldLines.addEventListener('change', (e) => {
                    showFieldLines = e.target.checked;
                    this.updatePhysics();
                });
            }

            btnClear.addEventListener('click', () => {
                if (confirm('Clear sandbox?')) {
                    spawnedObjects = [];
                    this.updateUI();
                    this.syncThreeScene();
                    this.clearProbes();
                }
            });

            // Field Probe buttons
            const btnExportProbes = document.getElementById('btn-export-probes');
            const btnClearProbes = document.getElementById('btn-clear-probes');
            if (btnExportProbes) btnExportProbes.addEventListener('click', () => this.exportProbesCSV());
            if (btnClearProbes) btnClearProbes.addEventListener('click', () => this.clearProbes());

            // Geometries Spawners
            document.getElementById('btn-spawn-finite-wire').addEventListener('click', () => {
                spawnedObjects.push({
                    id: 'wire_' + Date.now(),
                    type: 'finite_wire',
                    x: 0, y: 0, z1: -2, z2: 2,
                    current: 5.0, solveMode: 'none', givenValue: 10
                });
                this.updateUI();
                this.syncThreeScene();
                switchSubTab('prop');
            });

            document.getElementById('btn-spawn-loop').addEventListener('click', () => {
                spawnedObjects.push({
                    id: 'loop_' + Date.now(),
                    type: 'circular_loop',
                    radius: 1.5, zOffset: 0,
                    current: 5.0, solveMode: 'none', givenValue: 5
                });
                this.updateUI();
                this.syncThreeScene();
                switchSubTab('prop');
            });

            document.getElementById('btn-spawn-triangle').addEventListener('click', () => {
                spawnedObjects.push({
                    id: 'tri_' + Date.now(),
                    type: 'triangular_loop',
                    side: 2.0, zOffset: 0,
                    current: 5.0, solveMode: 'none', givenValue: 5
                });
                this.updateUI();
                this.syncThreeScene();
                switchSubTab('prop');
            });

            document.getElementById('btn-spawn-toroid').addEventListener('click', () => {
                spawnedObjects.push({
                    id: 'toroid_' + Date.now(),
                    type: 'toroid',
                    rho0: 3.0, a: 0.8, N: 100,
                    current: 2.0, solveMode: 'none', givenValue: 10
                });
                this.updateUI();
                this.syncThreeScene();
                switchSubTab('prop');
            });

            document.getElementById('btn-spawn-solenoid').addEventListener('click', () => {
                spawnedObjects.push({
                    id: 'sol_' + Date.now(),
                    type: 'solenoid',
                    radius: 1.0, length: 4.0, N: 200,
                    current: 2.0, solveMode: 'none', givenValue: 20
                });
                this.updateUI();
                this.syncThreeScene();
                switchSubTab('prop');
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

        updatePhysics() {
            // Helper: dispose ArrowHelper sub-objects to prevent GPU memory leaks
            function disposeArrow(arrow) {
                if (!arrow) return;
                arrow.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
                scene.remove(arrow);
            }
            // Remove and dispose arrows
            disposeArrow(fieldArrowH); fieldArrowH = null;
            disposeArrow(fieldArrowB); fieldArrowB = null;
            disposeArrow(dlArrow); dlArrow = null;
            disposeArrow(rArrow); rArrow = null;
            disposeArrow(dbArrow); dbArrow = null;
            if (AmperianLoopMesh) {
                AmperianLoopMesh.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
                scene.remove(AmperianLoopMesh); AmperianLoopMesh = null;
            }

            // Split spawned objects into Biot-Savart vs Ampere
            const BSObjects = spawnedObjects.filter(o => ['finite_wire', 'circular_loop', 'triangular_loop'].includes(o.type));
            const AmpObjects = spawnedObjects.filter(o => ['toroid', 'solenoid'].includes(o.type));

            // 1. Biot-Savart Law evaluations
            const { H: H_BS, closestSeg } = physicsEngine.calcHFieldBiotSavart(observationPoint, BSObjects);

            // 2. Ampere's Law evaluation
            const H_Amp = physicsEngine.calcAmpereLaw(observationPoint, AmpObjects);

            // Total H & B Fields
            const H_net = new THREE.Vector3().addVectors(H_BS, H_Amp);
            const mur = materials[activeMaterial].mur;
            const B_net = H_net.clone().multiplyScalar(MU_0 * mur);

            const pVec = new THREE.Vector3(observationPoint.x, observationPoint.y, observationPoint.z);

            // Draw field arrows at P
            const hMag = H_net.length();
            if (hMag > 1e-4) {
                const dir = H_net.clone().normalize();
                const len = Math.min(2.5, Math.log10(1 + hMag * 1e2) * 0.8);
                fieldArrowH = new THREE.ArrowHelper(dir, pVec, len, 0x000000, 0.2, 0.1);
                scene.add(fieldArrowH);
            }

            // Draw Biot-Savart differential geometry helpers on closest segment
            if (closestSeg) {
                // Current element dl (Red arrow)
                const dlDir = closestSeg.dl.clone().normalize();
                const dlLen = closestSeg.dl.length();
                dlArrow = new THREE.ArrowHelper(dlDir, closestSeg.start, dlLen, 0xff0000, 0.15, 0.05);
                scene.add(dlArrow);

                // Distance vector R (Dashed line / Gray arrow)
                const rDir = closestSeg.R.clone().normalize();
                rArrow = new THREE.ArrowHelper(rDir, closestSeg.center, closestSeg.R.length(), 0x555555, 0.15, 0.05);
                scene.add(rArrow);

                // Differential magnetic field dB (Blue arrow)
                const dbDir = new THREE.Vector3().crossVectors(closestSeg.dl, rDir).normalize();
                dbArrow = new THREE.ArrowHelper(dbDir, pVec, 0.5, 0x0000ff, 0.1, 0.04);
                scene.add(dbArrow);
            }

            // Amperian Loop Rendering
            AmpObjects.forEach(obj => {
                if (obj.type === 'toroid') {
                    // Draw circular Amperian loop matching observation radius rho
                    const rho = Math.sqrt(observationPoint.x*observationPoint.x + observationPoint.y*observationPoint.y);
                    const geom = new THREE.RingGeometry(rho - 0.02, rho + 0.02, 32);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
                    AmperianLoopMesh = new THREE.Mesh(geom, mat);
                    AmperianLoopMesh.rotation.x = Math.PI / 2;
                    scene.add(AmperianLoopMesh);
                }
            });

            // Field line rendering
            this.renderFieldLines();

            this.renderMathDerivation(H_net, B_net, closestSeg);
        },

        spawnPointCharge() {}, // Unused in magnetostatics

        renderFieldLines() {
            if (fieldLineGroup) {
                fieldLineGroup.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
                scene.remove(fieldLineGroup);
                fieldLineGroup = null;
            }
            if (!showFieldLines) return;

            const BSObjects = spawnedObjects.filter(o => ['finite_wire', 'circular_loop', 'triangular_loop'].includes(o.type));
            const lines = traceMagFieldLines(BSObjects, 150, 0.1);

            fieldLineGroup = new THREE.Group();
            lines.forEach(points => {
                if (points.length < 2) return;
                const geom = new THREE.BufferGeometry().setFromPoints(points);
                const mat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 });
                fieldLineGroup.add(new THREE.Line(geom, mat));
            });
            scene.add(fieldLineGroup);
        },
        deleteElement(id) {
            spawnedObjects = spawnedObjects.filter(o => o.id !== id);
            this.updateUI();
            this.syncThreeScene();
        },

        updateObject(id, key, value) {
            const idx = spawnedObjects.findIndex(o => o.id === id);
            if (idx !== -1) {
                if (key !== 'axis' && key !== 'solveMode') {
                    spawnedObjects[idx][key] = parseFloat(value) || 0;
                } else {
                    spawnedObjects[idx][key] = value;
                }
                this.updatePhysics();
                this.syncThreeSceneGeometryOnly();
            }
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

        updateUI() {
            // Coordinate values
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

            document.getElementById('material-select').value = activeMaterial;

            const listContainer = document.getElementById('elements-list-container');
            listContainer.innerHTML = '';

            if (spawnedObjects.length === 0) {
                listContainer.innerHTML = '<p class="text-xs italic text-gray-500">No current elements placed.</p>';
                return;
            }

            spawnedObjects.forEach(obj => {
                const row = document.createElement('div');
                row.className = 'border border-black p-3 bg-gray-50 flex flex-col gap-2 relative';
                
                const btnDel = document.createElement('button');
                btnDel.className = 'absolute top-1 right-2 text-xs font-bold text-red-500 hover:text-red-700';
                btnDel.innerText = '✕';
                btnDel.style.zIndex = '10';
                btnDel.onclick = () => this.deleteElement(obj.id);
                row.appendChild(btnDel);

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

                if (obj.type === 'finite_wire') {
                    contentWrap.innerHTML += `<div class="font-bold text-xs uppercase">Finite Straight Wire</div>`;
                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', 0.5, 20, 0.5));
                    contentWrap.appendChild(makeSyncInput('Z Start', 'z1', -5, 0, 0.1));
                    contentWrap.appendChild(makeSyncInput('Z End', 'z2', 0, 5, 0.1));
                } 
                else if (obj.type === 'circular_loop') {
                    contentWrap.innerHTML += `<div class="font-bold text-xs uppercase">Circular Current Loop</div>`;
                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', 0.5, 20, 0.5));
                    contentWrap.appendChild(makeSyncInput('Radius a (m)', 'radius', 0.5, 4, 0.1));
                    contentWrap.appendChild(makeSyncInput('Z Height Offset', 'zOffset', -3, 3, 0.1));
                }
                else if (obj.type === 'triangular_loop') {
                    contentWrap.innerHTML += `<div class="font-bold text-xs uppercase">Triangular Current Loop</div>`;
                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', 0.5, 20, 0.5));
                    contentWrap.appendChild(makeSyncInput('Side Length (m)', 'side', 0.5, 4, 0.1));
                    contentWrap.appendChild(makeSyncInput('Z Height Offset', 'zOffset', -3, 3, 0.1));
                }
                else if (obj.type === 'toroid') {
                    contentWrap.innerHTML += `<div class="font-bold text-xs uppercase">Toroidal Coil</div>`;
                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', 0.5, 10, 0.5));
                    contentWrap.appendChild(makeSyncInput('Mean Radius ρ₀', 'rho0', 1.0, 4.5, 0.1));
                    contentWrap.appendChild(makeSyncInput('Cross-sect. a', 'a', 0.2, 1.2, 0.05));
                    contentWrap.appendChild(makeSyncInput('Number of turns N', 'N', 50, 500, 10));
                }
                else if (obj.type === 'solenoid') {
                    contentWrap.innerHTML += `<div class="font-bold text-xs uppercase">Solenoid Coil</div>`;
                    contentWrap.appendChild(makeSyncInput('Current I (A)', 'current', 0.5, 10, 0.5));
                    contentWrap.appendChild(makeSyncInput('Radius a (m)', 'radius', 0.2, 2.0, 0.05));
                    contentWrap.appendChild(makeSyncInput('Length l (m)', 'length', 1.0, 6.0, 0.1));
                    contentWrap.appendChild(makeSyncInput('Number of turns N', 'N', 50, 500, 10));
                }

                row.appendChild(contentWrap);
                listContainer.appendChild(row);
            });
        },

        syncThreeSceneGeometryOnly() {
            this.syncThreeScene(); // Rebuild is cleaner for different wire shapes
        },

        syncThreeScene() {
            // Clean old meshes
            while (wireMeshGroup.children.length > 0) {
                const child = wireMeshGroup.children[0];
                child.geometry.dispose();
                child.material.dispose();
                wireMeshGroup.remove(child);
            }

            spawnedObjects.forEach(obj => {
                if (obj.type === 'finite_wire') {
                    // Straight cylinder along z axis
                    const len = obj.z2 - obj.z1;
                    const geom = new THREE.CylinderGeometry(0.06, 0.06, len, 8);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.rotation.x = Math.PI / 2;
                    mesh.position.set(obj.x, obj.y, (obj.z1 + obj.z2) / 2);
                    wireMeshGroup.add(mesh);
                } 
                else if (obj.type === 'circular_loop') {
                    // Circular ring wire representation
                    const geom = new THREE.RingGeometry(obj.radius - 0.03, obj.radius + 0.03, 32);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.position.set(0, 0, obj.zOffset);
                    wireMeshGroup.add(mesh);
                }
                else if (obj.type === 'triangular_loop') {
                    // Triangular ring representation
                    const geom = new THREE.RingGeometry(obj.side / 2, obj.side / 2 + 0.04, 3);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.position.set(0, 0, obj.zOffset);
                    mesh.rotation.z = Math.PI / 6; // align vertices
                    wireMeshGroup.add(mesh);
                }
                else if (obj.type === 'toroid') {
                    // Donut representation
                    const geom = new THREE.TorusGeometry(obj.rho0, obj.a, 8, 36);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
                    const mesh = new THREE.Mesh(geom, mat);
                    wireMeshGroup.add(mesh);
                }
                else if (obj.type === 'solenoid') {
                    // Cylinder helix coil wireframe
                    const geom = new THREE.CylinderGeometry(obj.radius, obj.radius, obj.length, 12, 12);
                    const mat = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
                    const mesh = new THREE.Mesh(geom, mat);
                    mesh.rotation.x = Math.PI / 2;
                    wireMeshGroup.add(mesh);
                }
            });

            this.updatePhysics();
        },

        renderMathDerivation(H_net, B_net, closestSeg) {
            const out = document.getElementById('math-derivation-output');
            if (!out) return;

            let html = '';

            // 1. Biot-Savart segment description
            if (closestSeg) {
                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1">Biot-Savart Law:</h4>`;
                html += `<div class="katex-render">d\\mathbf{H} = \\frac{I d\\mathbf{l} \\times \\hat{\\mathbf{a}}_R}{4\\pi R^2}</div>`;
                
                const segInfo = `Closest current element segment $d\\mathbf{l}$ at $(${closestSeg.center.x.toFixed(2)}, ${closestSeg.center.y.toFixed(2)}, ${closestSeg.center.z.toFixed(2)})$, distance $R = ${closestSeg.R.length().toFixed(3)}\\text{ m}$.`;
                html += `<p class="text-xs mb-2">${renderMarkdownWithKaTeX(segInfo)}</p>`;
            }

            // 2. Toroid / Solenoid Ampere's Law region logic
            const toroid = spawnedObjects.find(o => o.type === 'toroid');
            if (toroid) {
                const rho = Math.sqrt(observationPoint.x*observationPoint.x + observationPoint.y*observationPoint.y);
                const inside = (rho > (toroid.rho0 - toroid.a)) && (rho < (toroid.rho0 + toroid.a)) && (Math.abs(observationPoint.z) < toroid.a);
                
                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">Ampere's Law - Toroid:</h4>`;
                html += `<div class="katex-render">H_{\\phi} = \\begin{cases} \\frac{NI}{2\\pi \\rho} & \\text{inside} \\\\ 0 & \\text{outside} \\end{cases}</div>`;
                html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Current $\\rho = ${rho.toFixed(2)}\\text{ m}$. Toroid bounds: $\\rho \\in [${(toroid.rho0 - toroid.a).toFixed(2)}, ${(toroid.rho0 + toroid.a).toFixed(2)}]\\text{ m}$.`)}</p>`;
                html += `<p class="text-xs font-bold">${inside ? 'Observation point is INSIDE toroid.' : 'Observation point is OUTSIDE toroid.'}</p>`;
            }

            const solenoid = spawnedObjects.find(o => o.type === 'solenoid');
            if (solenoid) {
                const rho = Math.sqrt(observationPoint.x*observationPoint.x + observationPoint.y*observationPoint.y);
                const inside = (rho < solenoid.radius) && (Math.abs(observationPoint.z) < solenoid.length / 2);

                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">Ampere's Law - Solenoid:</h4>`;
                html += `<div class="katex-render">H_{z} = \\begin{cases} \\frac{NI}{l} & \\text{inside} \\\\ 0 & \\text{outside} \\end{cases}</div>`;
                html += `<p class="text-xs">${renderMarkdownWithKaTeX(`Current radius $\\rho = ${rho.toFixed(2)}\\text{ m}$, solenoid boundary: $a = ${solenoid.radius.toFixed(2)}\\text{ m}$.`)}</p>`;
                html += `<p class="text-xs font-bold">${inside ? 'Observation point is INSIDE solenoid.' : 'Observation point is OUTSIDE solenoid.'}</p>`;
            }

            // 3. Inductance & Energy Calculations
            if (solenoid) {
                const area = Math.PI * solenoid.radius * solenoid.radius;
                const mur = materials[activeMaterial].mur;
                const L = (mur * MU_0 * solenoid.N * solenoid.N * area) / solenoid.length;
                const W = 0.5 * L * solenoid.current * solenoid.current;

                html += `<h4 class="font-bold text-xs uppercase mb-2 border-b pb-1 mt-3">Inductance & Energy (Solenoid):</h4>`;
                html += `<div class="katex-render">L = \\frac{\\mu_r \\mu_0 N^2 A}{l} = ${L.toExponential(3)} \\text{ Henry}</div>`;
                html += `<div class="katex-render">W_m = \\frac{1}{2} L I^2 = ${W.toExponential(3)} \\text{ Joules}</div>`;
            }

            // 4. Net Field Sums
            html += `<div class="border-t-2 border-black pt-3 mt-4">`;
            html += `<span class="font-bold text-xs uppercase">Net Magnetic Intensity H:</span>`;
            html += `<div class="katex-render">\\mathbf{H}_{\\text{net}} = ${H_net.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${H_net.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${H_net.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ A/m}</div>`;
            html += `<div class="katex-render">|\\mathbf{H}_{\\text{net}}| = ${H_net.length().toExponential(3)} \\text{ A/m}</div>`;

            html += `<span class="font-bold text-xs uppercase mt-2 block">Net Flux Density B (B = μ_r * μ₀ * H):</span>`;
            html += `<div class="katex-render">\\mathbf{B}_{\\text{net}} = ${B_net.x.toExponential(2)}\\hat{\\mathbf{a}}_x + ${B_net.y.toExponential(2)}\\hat{\\mathbf{a}}_y + ${B_net.z.toExponential(2)}\\hat{\\mathbf{a}}_z \\text{ T}</div>`;
            html += `<div class="katex-render">|\\mathbf{B}_{\\text{net}}| = ${B_net.length().toExponential(3)} \\text{ Tesla}</div>`;
            html += `</div>`;

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
                activeMaterial
            };
        },

        placeProbe(x, y, z) {
            if (!scene || !probeGroup) return;
            const probe = { id: probes.length + 1, x, y, z, mesh: null, label: null };

            const geom = new THREE.SphereGeometry(0.06, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
            probe.mesh = new THREE.Mesh(geom, mat);
            probe.mesh.position.set(x, y, z);
            probeGroup.add(probe.mesh);

            const p = { x, y, z };
            const BSObjects = spawnedObjects.filter(o => ['finite_wire', 'circular_loop', 'triangular_loop'].includes(o.type));
            const AmpObjects = spawnedObjects.filter(o => ['toroid', 'solenoid'].includes(o.type));
            const { H: H_BS } = physicsEngine.calcHFieldBiotSavart(p, BSObjects);
            const H_Amp = physicsEngine.calcAmpereLaw(p, AmpObjects);
            const H_net = new THREE.Vector3().addVectors(H_BS, H_Amp);
            const B_net = H_net.clone().multiplyScalar(MU_0 * (materials[activeMaterial]?.mur || 1.0));
            const hMag = H_net.length();
            const bMag = B_net.length();

            probe.hMag = hMag;
            probe.bMag = bMag;

            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 256;
            labelCanvas.height = 64;
            const lctx = labelCanvas.getContext('2d');
            lctx.fillStyle = 'rgba(0,0,0,0.75)';
            lctx.fillRect(0, 0, 256, 64);
            lctx.fillStyle = '#ffffff';
            lctx.font = 'bold 14px monospace';
            lctx.fillText(`P${probe.id} (${x},${y},${z})`, 4, 16);
            lctx.font = '11px monospace';
            lctx.fillStyle = '#66aaff';
            lctx.fillText(`|H|=${hMag.toExponential(2)} A/m`, 4, 34);
            lctx.fillStyle = '#ff6600';
            lctx.fillText(`|B|=${bMag.toExponential(2)} T`, 4, 50);

            const texture = new THREE.CanvasTexture(labelCanvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
            probe.label = new THREE.Sprite(spriteMat);
            probe.label.position.set(x + 0.15, y + 0.15, z + 0.15);
            probe.label.scale.set(1.2, 0.3, 1);
            probeGroup.add(probe.label);

            probes.push(probe);
            this.renderProbesTable();
        },

        clearProbes() {
            if (probeGroup) {
                probeGroup.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                });
                while (probeGroup.children.length > 0) probeGroup.remove(probeGroup.children[0]);
            }
            probes = [];
            this.renderProbesTable();
        },

        renderProbesTable() {
            const tbody = document.getElementById('probes-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            probes.forEach((p) => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #ddd';
                tr.innerHTML = `
                    <td style="padding: 2px;">${p.id}</td>
                    <td style="padding: 2px;">(${p.x},${p.y},${p.z})</td>
                    <td style="text-align: right; padding: 2px;">${p.hMag.toExponential(2)}</td>
                    <td style="text-align: right; padding: 2px;">${p.bMag.toExponential(2)}</td>
                `;
                tbody.appendChild(tr);
            });
        },

        exportProbesCSV() {
            if (probes.length === 0) { alert('No probes to export.'); return; }
            let csv = 'Probe,X,Y,Z,|H| (A/m),|B| (T)\n';
            probes.forEach(p => {
                csv += `${p.id},${p.x},${p.y},${p.z},${p.hMag.toExponential(4)},${p.bMag.toExponential(4)}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'field_probes.csv';
            a.click();
            URL.revokeObjectURL(url);
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
            probes = [];
            probeGroup = null;
            raycaster = null;
            probeClickPlane = null;
            fieldLineGroup = null;
            showFieldLines = false;
        }
    };

    window.activeSimulator = magnetostaticsSimulator;
})();
