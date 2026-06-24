// General-Purpose Standalone Block Diagram Builder
// Implements activeSimulator contract: init, getState, destroy

(function() {
    let containerEl = null;
    let canvasEl = null;
    let htmlLayerEl = null;
    let svgOverlayEl = null;
    let propertiesPanelEl = null;
    let minimapCanvasEl = null;
    let minimapViewportEl = null;
    let toastContainerEl = null;
    let currentCourseName = "Block Diagram Builder";
    let isUpdatingProperties = false;

    function updateProperty(callback) {
        isUpdatingProperties = true;
        try {
            callback();
        } finally {
            isUpdatingProperties = false;
        }
    }

    // Application state
    let state = {
        blocks: [],
        connections: [],
        annotations: [],
        groups: [],
        theme: 'default'
    };

    // Themes configuration
    const THEMES = {
        default: {
            canvasBg: '#ffffff',
            blockBg: '#ffffff',
            blockBorder: '#000000',
            blockLineWidth: 1.5,
            pinBg: '#ffffff',
            pinBorder: '#000000',
            fontFamily: 'sans-serif',
            fontColor: '#000000',
            lineColor: '#000000',
            lineWidth: 2.5
        },
        classic: {
            canvasBg: '#ffffff',
            blockBg: '#ffffff',
            blockBorder: '#000000',
            blockLineWidth: 1.0,
            pinBg: '#ffffff',
            pinBorder: '#000000',
            fontFamily: 'Times New Roman, serif',
            fontColor: '#000000',
            lineColor: '#000000',
            lineWidth: 2.0
        },
        tech: {
            canvasBg: '#f8fafc',
            blockBg: '#ffffff',
            blockBorder: '#64748b',
            blockLineWidth: 1.5,
            pinBg: '#ffffff',
            pinBorder: '#64748b',
            fontFamily: 'sans-serif',
            fontColor: '#1e293b',
            lineColor: '#475569',
            lineWidth: 2.5
        },
        retro: {
            canvasBg: '#ffffff',
            blockBg: '#ffffff',
            blockBorder: '#000000',
            blockLineWidth: 2.5,
            pinBg: '#ffffff',
            pinBorder: '#000000',
            fontFamily: 'monospace',
            fontColor: '#000000',
            lineColor: '#000000',
            lineWidth: 3.5,
            shadow: true
        },
        blueprint: {
            canvasBg: '#1e3a8a',
            blockBg: '#1e3a8a',
            blockBorder: '#ffffff',
            blockLineWidth: 1.5,
            pinBg: '#1e3a8a',
            pinBorder: '#ffffff',
            fontFamily: 'monospace',
            fontColor: '#ffffff',
            lineColor: '#ffffff',
            lineWidth: 2.5
        }
    };

    // Camera navigation state
    let camera = {
        panX: 0,
        panY: 0,
        scale: 1.0
    };

    // Last tracked mouse position for menu triggering via keyboard
    let lastMousePos = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, target: null };

    // History for Undo/Redo
    let history = [];
    let historyIndex = -1;

    // Interaction states
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let dragStartPin = null;
    let dragLineCoords = null;
    let resizeState = null; // { blockId, handle, startWidth, startHeight, startX, startY, mouseX, mouseY }
    let dragBlockState = null; // { blockIds, startCoords: [{id, x, y}], mouseX, mouseY }
    let selectedIds = []; // Selected element IDs
    let multiSelectActive = false;
    let dragSelectState = null; // { startX, startY, currentX, currentY }
    let dragSelectBoxEl = null;
    let activeArrowDraw = null; // { arrowId, handle }
    
    // Tap connection mode for mobile
    let tapStartPin = null;

    // Active tool state for pointer, pan, lasso
    let activeTool = 'select';
    let lassoPoints = [];
    let isLassoing = false;

    // Preset color swatches
    const COLOR_PRESETS = [
        { name: 'White', value: '#ffffff' },
        { name: 'Red', value: '#fee2e2' },
        { name: 'Orange', value: '#ffedd5' },
        { name: 'Yellow', value: '#fef9c3' },
        { name: 'Green', value: '#dcfce7' },
        { name: 'Blue', value: '#dbeafe' },
        { name: 'Purple', value: '#f3e8ff' },
        { name: 'Gray', value: '#f1f5f9' }
    ];

    // Templates
    const TEMPLATES = {
        blank: {
            name: "Blank Canvas",
            blocks: [],
            connections: [],
            annotations: [],
            groups: []
        },
        emf_loop: {
            name: "EMF Induction Loop",
            blocks: [
                {
                    id: "src_1",
                    name: "Solenoid Source",
                    color: "#ffffff",
                    x: 100, y: 150, width: 140, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: { label: "", pinCount: 0, pins: [] },
                        right: {
                            label: "EM Fields",
                            pinCount: 2,
                            pins: [
                                { name: "B_field", direction: "output" },
                                { name: "Flux", direction: "output" }
                            ]
                        }
                    }
                },
                {
                    id: "trans_1",
                    name: "Transformer Coil",
                    color: "#ffffff",
                    x: 350, y: 150, width: 150, height: 120,
                    borderStyle: "double",
                    sides: {
                        top: { label: "Control", pinCount: 1, pins: [{ name: "Gate", direction: "input" }] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "EM Input",
                            pinCount: 2,
                            pins: [
                                { name: "B_in", direction: "input" },
                                { name: "Flux_in", direction: "input" }
                            ]
                        },
                        right: {
                            label: "AC Output",
                            pinCount: 2,
                            pins: [
                                { name: "V_ac1", direction: "output" },
                                { name: "V_ac2", direction: "output" }
                            ]
                        }
                    }
                },
                {
                    id: "load_1",
                    name: "Resistor Load",
                    color: "#ffffff",
                    x: 600, y: 170, width: 120, height: 80,
                    borderStyle: "dashed",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "AC In",
                            pinCount: 2,
                            pins: [
                                { name: "V_in1", direction: "input" },
                                { name: "V_in2", direction: "input" }
                            ]
                        },
                        right: { label: "", pinCount: 0, pins: [] }
                    }
                }
            ],
            connections: [
                {
                    id: "conn_1",
                    sourceBlockId: "src_1",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "trans_1",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "B Induction",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "conn_2",
                    sourceBlockId: "src_1",
                    sourceSide: "right",
                    sourcePinIdx: 1,
                    targetBlockId: "trans_1",
                    targetSide: "left",
                    targetPinIdx: 1,
                    label: "dPhi/dt",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "conn_3",
                    sourceBlockId: "trans_1",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "load_1",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Line A",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "conn_4",
                    sourceBlockId: "trans_1",
                    sourceSide: "right",
                    sourcePinIdx: 1,
                    targetBlockId: "load_1",
                    targetSide: "left",
                    targetPinIdx: 1,
                    label: "Line B",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                }
            ],
            annotations: [
                {
                    id: "lbl_1",
                    type: "label",
                    text: "EMF Induction Loop (Tutorial C4 Q3 topology)",
                    x: 100, y: 70,
                    bold: true,
                    italic: false
                },
                {
                    id: "note_1",
                    type: "note",
                    text: "Solenoid current induces magnetic fields in coil, generating AC voltage output.",
                    x: 240, y: 340,
                    color: "#fef9c3"
                }
            ],
            groups: []
        },
        magnetic_circuit: {
            name: "Magnetic Circuit",
            blocks: [
                {
                    id: "mag_src",
                    name: "Solenoid Coil",
                    color: "#ffffff",
                    x: 100, y: 150, width: 130, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: { label: "", pinCount: 0, pins: [] },
                        right: {
                            label: "Output",
                            pinCount: 1,
                            pins: [{ name: "MMF_out", direction: "output" }]
                        }
                    }
                },
                {
                    id: "mag_core",
                    name: "Iron Core",
                    color: "#ffffff",
                    x: 320, y: 150, width: 140, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "Input",
                            pinCount: 1,
                            pins: [{ name: "MMF_in", direction: "input" }]
                        },
                        right: {
                            label: "Output",
                            pinCount: 1,
                            pins: [{ name: "Flux_out", direction: "output" }]
                        }
                    }
                },
                {
                    id: "mag_gap",
                    name: "Air Gap",
                    color: "#ffffff",
                    x: 550, y: 150, width: 100, height: 100,
                    borderStyle: "dashed",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "Input",
                            pinCount: 1,
                            pins: [{ name: "Flux_in", direction: "input" }]
                        },
                        right: { label: "", pinCount: 0, pins: [] }
                    }
                }
            ],
            connections: [
                {
                    id: "mag_c1",
                    sourceBlockId: "mag_src",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "mag_core",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "N*I (MMF)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "mag_c2",
                    sourceBlockId: "mag_core",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "mag_gap",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "B field",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                }
            ],
            annotations: [
                {
                    id: "mag_lbl",
                    type: "label",
                    text: "Magnetic Core Circuit Model",
                    x: 100, y: 80,
                    bold: true,
                    italic: false
                },
                {
                    id: "mag_note",
                    type: "note",
                    text: "Reluctance of the air gap dominates the circuit. Total reluctance: R_eq = R_core + R_gap",
                    x: 200, y: 300,
                    color: "#fef9c3"
                }
            ],
            groups: []
        },
        signal_chain: {
            name: "Signal Chain",
            blocks: [
                {
                    id: "sc_source",
                    name: "Sensor Source",
                    color: "#ffffff",
                    x: 80, y: 180, width: 120, height: 80,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: { label: "", pinCount: 0, pins: [] },
                        right: {
                            label: "Out",
                            pinCount: 1,
                            pins: [{ name: "V_out", direction: "output" }]
                        }
                    }
                },
                {
                    id: "sc_amp",
                    name: "Preamplifier",
                    color: "#ffffff",
                    x: 270, y: 170, width: 130, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "In",
                            pinCount: 1,
                            pins: [{ name: "V_in", direction: "input" }]
                        },
                        right: {
                            label: "Out",
                            pinCount: 1,
                            pins: [{ name: "V_out", direction: "output" }]
                        }
                    }
                },
                {
                    id: "sc_filter",
                    name: "Bandpass Filter",
                    color: "#ffffff",
                    x: 470, y: 170, width: 130, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "In",
                            pinCount: 1,
                            pins: [{ name: "V_in", direction: "input" }]
                        },
                        right: {
                            label: "Out",
                            pinCount: 1,
                            pins: [{ name: "V_out", direction: "output" }]
                        }
                    }
                },
                {
                    id: "sc_load",
                    name: "Load Resistor",
                    color: "#ffffff",
                    x: 670, y: 180, width: 110, height: 80,
                    borderStyle: "dashed",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "In",
                            pinCount: 1,
                            pins: [{ name: "V_in", direction: "input" }]
                        },
                        right: { label: "", pinCount: 0, pins: [] }
                    }
                }
            ],
            connections: [
                {
                    id: "sc_c1",
                    sourceBlockId: "sc_source",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "sc_amp",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Sensor Sig",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "sc_c2",
                    sourceBlockId: "sc_amp",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "sc_filter",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Amp'd Sig",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "sc_c3",
                    sourceBlockId: "sc_filter",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "sc_load",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Filtered",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                }
            ],
            annotations: [
                {
                    id: "sc_lbl",
                    type: "label",
                    text: "General Signal Processing Chain",
                    x: 80, y: 90,
                    bold: true,
                    italic: false
                }
            ],
            groups: []
        },
        ram_bus: {
            name: "Microprocessor & RAM Bus",
            blocks: [
                {
                    id: "cpu_core",
                    name: "CPU CORE\n(8-BIT)",
                    color: "#ffffff",
                    x: 100, y: 150, width: 140, height: 160,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: { label: "", pinCount: 0, pins: [] },
                        right: {
                            label: "System Bus",
                            pinCount: 3,
                            pins: [
                                { name: "ADDR (A0-A15)", direction: "output" },
                                { name: "DATA (D0-D7)", direction: "bidirectional" },
                                { name: "CTRL (MREQ)", direction: "output" }
                            ]
                        }
                    }
                },
                {
                    id: "addr_dec",
                    name: "ADDRESS\nDECODER",
                    color: "#ffffff",
                    x: 350, y: 100, width: 130, height: 90,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "CS_RAM", direction: "output" }]
                        },
                        left: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "ADDR_IN", direction: "input" }]
                        },
                        right: { label: "", pinCount: 0, pins: [] }
                    }
                },
                {
                    id: "ram_chip",
                    name: "62256 RAM\n(32KB)",
                    color: "#ffffff",
                    x: 580, y: 150, width: 150, height: 180,
                    borderStyle: "double",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "RAM Signals",
                            pinCount: 3,
                            pins: [
                                { name: "A0-A14", direction: "input" },
                                { name: "I/O 0-7", direction: "bidirectional" },
                                { name: "CS", direction: "input" }
                            ]
                        },
                        right: { label: "", pinCount: 0, pins: [] }
                    }
                }
            ],
            connections: [
                {
                    id: "dec_c1",
                    sourceBlockId: "cpu_core",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "addr_dec",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "A15-A11",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "ram_c1",
                    sourceBlockId: "cpu_core",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "ram_chip",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "ADDR (A0-A14)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "ram_c2",
                    sourceBlockId: "cpu_core",
                    sourceSide: "right",
                    sourcePinIdx: 1,
                    targetBlockId: "ram_chip",
                    targetSide: "left",
                    targetPinIdx: 1,
                    label: "DATA (D0-D7)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "bidirectional"
                },
                {
                    id: "ram_c3",
                    sourceBlockId: "addr_dec",
                    sourceSide: "bottom",
                    sourcePinIdx: 0,
                    targetBlockId: "ram_chip",
                    targetSide: "left",
                    targetPinIdx: 2,
                    label: "CS Selection",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                }
            ],
            annotations: [
                {
                    id: "ram_lbl",
                    type: "label",
                    text: "Microprocessor & RAM Bus Connection (Academic Map)",
                    x: 100, y: 50,
                    bold: true,
                    italic: false
                },
                {
                    id: "ram_note",
                    type: "note",
                    text: "Address bus (A0-A14) maps the memory space, decoder selects the RAM chip using address lines (A15-A11) via CS.",
                    x: 220, y: 360,
                    color: "#fef9c3"
                }
            ],
            groups: []
        },
        feedback_loop: {
            name: "Feedback Control Loop",
            blocks: [
                {
                    id: "fb_ref",
                    name: "REFERENCE\nINPUT",
                    color: "#ffffff",
                    x: 60, y: 180, width: 110, height: 70,
                    borderStyle: "dashed",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: { label: "", pinCount: 0, pins: [] },
                        right: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "r(t)", direction: "output" }]
                        }
                    }
                },
                {
                    id: "fb_sum",
                    name: "SUMMING\nJUNCTION",
                    color: "#ffffff",
                    x: 230, y: 175, width: 90, height: 80,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "y_f(t)", direction: "input" }]
                        },
                        left: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "+", direction: "input" }]
                        },
                        right: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "e(t)", direction: "output" }]
                        }
                    }
                },
                {
                    id: "fb_ctrl",
                    name: "PID\nCONTROLLER",
                    color: "#ffffff",
                    x: 370, y: 165, width: 130, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "e_in", direction: "input" }]
                        },
                        right: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "u(t)", direction: "output" }]
                        }
                    }
                },
                {
                    id: "fb_plant",
                    name: "SYSTEM / PLANT\n(PROCESS)",
                    color: "#ffffff",
                    x: 550, y: 165, width: 140, height: 100,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "u_in", direction: "input" }]
                        },
                        right: {
                            label: "",
                            pinCount: 2,
                            pins: [
                                { name: "y(t)", direction: "output" },
                                { name: "y_branch", direction: "output" }
                            ]
                        }
                    }
                },
                {
                    id: "fb_sensor",
                    name: "FEEDBACK\nSENSOR",
                    color: "#ffffff",
                    x: 370, y: 310, width: 130, height: 90,
                    borderStyle: "solid",
                    sides: {
                        top: { label: "", pinCount: 0, pins: [] },
                        bottom: { label: "", pinCount: 0, pins: [] },
                        left: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "y_f_out", direction: "output" }]
                        },
                        right: {
                            label: "",
                            pinCount: 1,
                            pins: [{ name: "y_in", direction: "input" }]
                        }
                    }
                }
            ],
            connections: [
                {
                    id: "fb_c1",
                    sourceBlockId: "fb_ref",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "fb_sum",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Ref r(t)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "fb_c2",
                    sourceBlockId: "fb_sum",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "fb_ctrl",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Error e(t)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "fb_c3",
                    sourceBlockId: "fb_ctrl",
                    sourceSide: "right",
                    sourcePinIdx: 0,
                    targetBlockId: "fb_plant",
                    targetSide: "left",
                    targetPinIdx: 0,
                    label: "Control u(t)",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "fb_c4",
                    sourceBlockId: "fb_plant",
                    sourceSide: "right",
                    sourcePinIdx: 1,
                    targetBlockId: "fb_sensor",
                    targetSide: "right",
                    targetPinIdx: 0,
                    label: "Measure",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                },
                {
                    id: "fb_c5",
                    sourceBlockId: "fb_sensor",
                    sourceSide: "left",
                    sourcePinIdx: 0,
                    targetBlockId: "fb_sum",
                    targetSide: "bottom",
                    targetPinIdx: 0,
                    label: "Feedback",
                    style: "solid",
                    color: "#000000",
                    arrowhead: "forward"
                }
            ],
            annotations: [
                {
                    id: "fb_lbl",
                    type: "label",
                    text: "Closed-Loop Feedback Control System",
                    x: 100, y: 70,
                    bold: true,
                    italic: false
                },
                {
                    id: "fb_note",
                    type: "note",
                    text: "Summing junction computes e(t) = r(t) - y_f(t). PID controller adjusts control variable u(t) to minimize error.",
                    x: 540, y: 310,
                    color: "#fef9c3"
                }
            ],
            groups: []
        }
    };

    // CSS Styling
    const CSS_STYLES = `
        .bdb-wrapper {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            position: relative;
            background-color: #ffffff;
            color: #000000;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-weight: 500;
        }

        /* Toolbar styles */
        .bdb-toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1rem;
            border-bottom: 2px solid #000000;
            background-color: #ffffff;
            z-index: 20;
        }
        .bdb-toolbar-section {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            border-right: 1px solid #e2e8f0;
            padding-right: 0.5rem;
            margin-right: 0.25rem;
        }
        .bdb-toolbar-section:last-child {
            border-right: none;
            padding-right: 0;
            margin-right: 0;
        }
        .bdb-btn {
            background: transparent;
            border: 1px solid #000000;
            color: #000000;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 0.35rem 0.65rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            transition: all 0.15s ease;
        }
        .bdb-btn:hover {
            background-color: #000000;
            color: #ffffff;
        }
        .bdb-btn.active {
            background-color: #000000;
            color: #ffffff;
        }
        .bdb-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
        .bdb-btn:disabled:hover {
            background-color: transparent;
            color: #000000;
        }
        .bdb-select {
            border: 1px solid #000000;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            padding: 0.3rem 0.5rem;
            background: transparent;
            cursor: pointer;
        }
        .bdb-select:focus {
            outline: none;
        }

        /* Viewport and Canvas */
        .bdb-viewport {
            flex: 1;
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
            background-color: #fafafa;
            cursor: grab;
        }
        .bdb-viewport.panning {
            cursor: grabbing;
        }
        .bdb-canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 2000px;
            height: 1500px;
            transform-origin: 0 0;
            background-color: #ffffff;
            border: 1px solid #cbd5e1;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
        }

        /* HTML Layer Elements */
        .bdb-html-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 5;
        }
        .bdb-html-layer * {
            pointer-events: auto;
        }

        /* SVG Overlay for Connections */
        .bdb-svg-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 4;
            overflow: visible;
        }
        .bdb-connection-line {
            fill: none;
            stroke-width: 2.5;
            cursor: pointer;
            pointer-events: stroke;
            transition: stroke-width 0.15s ease;
        }
        .bdb-connection-line:hover, .bdb-connection-line.selected {
            stroke-width: 4;
        }
        .bdb-connection-text-bg {
            fill: #ffffff;
            stroke: #000000;
            stroke-width: 1px;
            rx: 3;
            ry: 3;
        }
        .bdb-connection-text {
            font-size: 9px;
            font-family: monospace;
            font-weight: bold;
            fill: #000000;
            text-anchor: middle;
            dominant-baseline: middle;
            pointer-events: none;
        }

        /* Blocks */
        .bdb-block {
            position: absolute;
            background-color: #ffffff;
            border: 1px solid #000000;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            user-select: none;
            cursor: move;
            z-index: 8;
            padding: 10px;
        }
        .bdb-block.selected {
            outline: 2px dashed #3b82f6;
            outline-offset: 4px;
        }
        .bdb-block-name {
            font-weight: 800;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: -0.01em;
            text-align: center;
            word-wrap: break-word;
            white-space: pre-wrap;
            width: 100%;
            pointer-events: none;
        }

        /* Pin Containers & Pins */
        .bdb-pin {
            position: absolute;
            width: 8px;
            height: 8px;
            background-color: #ffffff;
            border: 1.5px solid #000000;
            cursor: crosshair;
            z-index: 10;
            box-sizing: border-box;
            transform: translate(-50%, -50%);
            transition: transform 0.1s ease, background-color 0.1s ease;
        }
        .bdb-pin:hover {
            transform: translate(-50%, -50%) scale(1.35);
            background-color: #000000;
        }
        
        .bdb-pin-name-inside {
            font-size: 7.5px;
            font-family: monospace;
            font-weight: bold;
            color: #1e293b;
            pointer-events: none;
            white-space: nowrap;
            user-select: none;
            z-index: 9;
        }
        
        /* Tooltip style */
        .bdb-pin-tooltip {
            position: absolute;
            background-color: #000000;
            color: #ffffff;
            font-size: 8px;
            font-family: monospace;
            padding: 2px 4px;
            border-radius: 2px;
            pointer-events: none;
            white-space: nowrap;
            z-index: 100;
            transform: translate(-50%, -135%);
            display: none;
        }
        .bdb-pin:hover .bdb-pin-tooltip {
            display: block;
        }
        .bdb-side-label-text {
            position: absolute;
            font-size: 7.5px;
            font-weight: bold;
            font-family: monospace;
            color: #4b5563;
            pointer-events: none;
            white-space: nowrap;
        }

        /* Resize Handles */
        .bdb-resize-handle {
            position: absolute;
            width: 7px;
            height: 7px;
            background-color: #ffffff;
            border: 1px solid #000000;
            z-index: 12;
            box-sizing: border-box;
        }
        .bdb-resize-handle.top-left { top: -4px; left: -4px; cursor: nwse-resize; }
        .bdb-resize-handle.top-right { top: -4px; right: -4px; cursor: nesw-resize; }
        .bdb-resize-handle.bottom-left { bottom: -4px; left: -4px; cursor: nesw-resize; }
        .bdb-resize-handle.bottom-right { bottom: -4px; right: -4px; cursor: nwse-resize; }
        .bdb-resize-handle.top { top: -4px; left: calc(50% - 3.5px); cursor: ns-resize; }
        .bdb-resize-handle.bottom { bottom: -4px; left: calc(50% - 3.5px); cursor: ns-resize; }
        .bdb-resize-handle.left { left: -4px; top: calc(50% - 3.5px); cursor: ew-resize; }
        .bdb-resize-handle.right { right: -4px; top: calc(50% - 3.5px); cursor: ew-resize; }

        /* Properties Panel */
        .bdb-properties-panel {
            position: absolute;
            top: 60px;
            right: 15px;
            width: 320px;
            max-height: calc(100% - 90px);
            background-color: #ffffff;
            border: 2px solid #000000;
            box-shadow: 6px 6px 0px #000000;
            z-index: 15;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .bdb-properties-panel.hidden {
            transform: translateX(350px);
        }
        .bdb-properties-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background-color: #f1f5f9;
            padding: 0.5rem 0.75rem;
            border-bottom: 2px solid #000000;
            font-weight: 800;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .bdb-properties-close {
            background: transparent;
            border: none;
            cursor: pointer;
            font-weight: 800;
            font-size: 1rem;
        }
        .bdb-properties-content {
            padding: 1rem;
            overflow-y: auto;
            flex: 1;
            font-size: 0.8rem;
        }
        .bdb-prop-group {
            margin-bottom: 1rem;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 0.75rem;
        }
        .bdb-prop-group:last-child {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 0;
        }
        .bdb-prop-group h4 {
            text-transform: uppercase;
            font-size: 0.75rem;
            margin-bottom: 0.4rem;
            font-weight: 800;
        }
        .bdb-label {
            display: block;
            font-size: 0.7rem;
            text-transform: uppercase;
            font-weight: 700;
            margin-bottom: 0.25rem;
            color: #4b5563;
        }
        .bdb-input {
            width: 100%;
            padding: 0.35rem 0.5rem;
            font-size: 0.8rem;
            border: 1px solid #000000;
            background-color: #ffffff;
            box-sizing: border-box;
            margin-bottom: 0.5rem;
        }
        .bdb-input:focus {
            outline: none;
            background-color: #f8fafc;
        }
        .bdb-swatches {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 0.25rem;
            margin-bottom: 0.5rem;
        }
        .bdb-swatch {
            height: 20px;
            border: 1px solid #000000;
            cursor: pointer;
        }
        .bdb-swatch:hover, .bdb-swatch.active {
            outline: 2px solid #3b82f6;
        }
        .bdb-side-accordion {
            border: 1px solid #000000;
            margin-bottom: 0.5rem;
        }
        .bdb-side-header {
            background-color: #f8fafc;
            padding: 0.35rem 0.5rem;
            font-weight: 700;
            text-transform: uppercase;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #000000;
            font-size: 0.7rem;
        }
        .bdb-side-body {
            padding: 0.5rem;
            background-color: #ffffff;
            display: none;
        }
        .bdb-side-accordion.expanded .bdb-side-body {
            display: block;
        }
        .bdb-pin-row {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            margin-bottom: 0.25rem;
        }
        .bdb-pin-row input[type="text"] {
            flex: 1;
            padding: 0.2rem 0.35rem;
            font-size: 0.7rem;
            border: 1px solid #000000;
        }
        .bdb-pin-row button {
            background: transparent;
            border: 1px solid #000000;
            font-size: 0.6rem;
            font-weight: 700;
            padding: 0.2rem 0.35rem;
            cursor: pointer;
            text-transform: uppercase;
        }
        .bdb-pin-row button.direction-output {
            background-color: #000000;
            color: #ffffff;
        }

        /* Sticky Notes & Labels */
        .bdb-sticky-note {
            position: absolute;
            width: 140px;
            min-height: 120px;
            background-color: #fef08a;
            border: 1px solid #eab308;
            box-shadow: 3px 3px 6px rgba(0,0,0,0.1);
            padding: 10px;
            box-sizing: border-box;
            z-index: 6;
            cursor: move;
            font-family: "Comic Sans MS", "Outfit", cursive, sans-serif;
            font-size: 0.8rem;
            display: flex;
            flex-direction: column;
            transform: rotate(-1deg);
        }
        .bdb-sticky-note.selected {
            outline: 2px dashed #3b82f6;
        }
        .bdb-sticky-note-text {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            resize: none;
            font-family: inherit;
            font-size: inherit;
            color: inherit;
            pointer-events: auto;
            overflow: hidden;
        }
        .bdb-sticky-note-text:focus {
            outline: none;
        }
        .bdb-floating-label {
            position: absolute;
            background: transparent;
            border: 1px solid transparent;
            padding: 4px 8px;
            z-index: 6;
            cursor: move;
            white-space: nowrap;
            font-size: 0.85rem;
            user-select: none;
        }
        .bdb-floating-label.selected {
            border: 1px dashed #3b82f6;
        }
        .bdb-floating-label-input {
            background: #ffffff;
            border: 1px solid #000000;
            font-family: inherit;
            font-size: inherit;
            padding: 2px 4px;
        }

        /* Arrow Annotation Drag Handles */
        .bdb-arrow-handle {
            position: absolute;
            width: 8px;
            height: 8px;
            background-color: #3b82f6;
            border: 1px solid #ffffff;
            border-radius: 50%;
            z-index: 15;
            cursor: move;
            transform: translate(-50%, -50%);
        }

        /* Groups */
        .bdb-group-boundary {
            position: absolute;
            border: 2px dashed #000000;
            background-color: rgba(241, 245, 249, 0.45);
            z-index: 2;
            pointer-events: auto;
            cursor: move;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }
        .bdb-group-boundary.selected {
            border-color: #3b82f6;
            background-color: rgba(59, 130, 246, 0.08);
        }
        .bdb-group-header {
            background-color: rgba(0, 0, 0, 0.05);
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            padding: 4px 8px;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }
        .bdb-group-collapse-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            font-weight: 900;
            font-size: 9px;
        }
        .bdb-group-collapsed-box {
            position: absolute;
            border: 2.5px dashed #000000;
            background-color: #f1f5f9;
            box-shadow: 4px 4px 0px #000000;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: move;
            z-index: 7;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 0.85rem;
            box-sizing: border-box;
        }
        .bdb-group-collapsed-box.selected {
            outline: 2px dashed #3b82f6;
            outline-offset: 4px;
        }

        /* Minimap style */
        .bdb-minimap {
            position: absolute;
            bottom: 15px;
            right: 15px;
            width: 150px;
            height: 150px;
            background-color: #ffffff;
            border: 2px solid #000000;
            box-shadow: 4px 4px 0px #000000;
            z-index: 10;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .bdb-minimap-canvas {
            width: 100%;
            height: 100%;
            display: block;
        }
        .bdb-minimap-viewport {
            position: absolute;
            border: 1.5px solid #ff3b30;
            background-color: rgba(255, 59, 48, 0.05);
            pointer-events: none;
        }

        /* Context Menu */
        .bdb-context-menu {
            position: absolute;
            background-color: #ffffff;
            border: 2px solid #000000;
            box-shadow: 4px 4px 0px #000000;
            z-index: 1000;
            display: none;
            flex-direction: column;
            width: 140px;
        }
        .bdb-context-item {
            padding: 0.35rem 0.75rem;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            cursor: pointer;
            text-align: left;
            background: transparent;
            border: none;
            border-bottom: 1px solid #e2e8f0;
        }
        .bdb-context-item:last-child {
            border-bottom: none;
        }
        .bdb-context-item:hover {
            background-color: #000000;
            color: #ffffff;
        }

        /* Drag Selection Box */
        .bdb-drag-select-box {
            position: absolute;
            border: 1.5px dashed #3b82f6;
            background-color: rgba(59, 130, 246, 0.1);
            pointer-events: none;
            z-index: 100;
            display: none;
        }

        /* Toasts */
        .bdb-toast-container {
            position: absolute;
            bottom: 15px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            pointer-events: none;
        }
        .bdb-toast {
            background-color: #ef4444;
            color: #ffffff;
            border: 2px solid #000000;
            box-shadow: 3px 3px 0px #000000;
            padding: 0.5rem 1rem;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            pointer-events: auto;
            animation: bdb-toast-in 0.2s ease forwards;
        }
        @keyframes bdb-toast-in {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        /* Custom Modals */
        .bdb-modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(1px);
            z-index: 3000;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: bdb-fade-in 0.15s ease-out;
        }
        .bdb-modal-box {
            background-color: #ffffff;
            border: 2px solid #000000;
            box-shadow: 4px 4px 0px #000000;
            padding: 1.5rem;
            width: 320px;
            max-width: 90%;
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
            animation: bdb-scale-in 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .bdb-modal-text {
            font-size: 0.85rem;
            font-weight: bold;
            color: #000000;
            line-height: 1.4;
            word-break: break-word;
        }
        .bdb-modal-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
        }
        .bdb-modal-btn {
            padding: 0.4rem 1rem;
            font-size: 0.75rem;
            font-weight: bold;
            cursor: pointer;
            border: 2px solid #000000;
            background-color: #ffffff;
            box-shadow: 2px 2px 0px #000000;
            text-transform: uppercase;
            transition: transform 0.05s ease, box-shadow 0.05s ease;
        }
        .bdb-modal-btn:active {
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0px #000000;
        }
        .bdb-modal-btn.confirm-btn {
            background-color: #000000;
            color: #ffffff;
        }
        .bdb-modal-btn.confirm-btn:hover {
            opacity: 0.9;
        }
        .bdb-modal-btn.cancel-btn {
            background-color: #e2e8f0;
            color: #000000;
        }
        @keyframes bdb-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes bdb-scale-in {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        /* Theme overrides for modal overlay & box */
        .bdb-wrapper.theme-classic .bdb-modal-box {
            font-family: "Times New Roman", Times, serif !important;
            background-color: #ffffff !important;
            box-shadow: none !important;
            border-width: 1px !important;
        }
        .bdb-wrapper.theme-classic .bdb-modal-btn {
            font-family: "Times New Roman", Times, serif !important;
            box-shadow: none !important;
            border-width: 1px !important;
            border-radius: 0px !important;
        }
        .bdb-wrapper.theme-classic .bdb-modal-btn.confirm-btn {
            background-color: #000000 !important;
            color: #ffffff !important;
        }

        .bdb-wrapper.theme-tech .bdb-modal-box {
            font-family: "Outfit", sans-serif !important;
            background-color: #ffffff !important;
            border-radius: 6px !important;
            border-color: #cbd5e1 !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }
        .bdb-wrapper.theme-tech .bdb-modal-text {
            font-family: "Outfit", sans-serif !important;
            color: #334155 !important;
        }
        .bdb-wrapper.theme-tech .bdb-modal-btn {
            font-family: "Outfit", sans-serif !important;
            border-radius: 4px !important;
            border-color: #cbd5e1 !important;
            box-shadow: none !important;
        }
        .bdb-wrapper.theme-tech .bdb-modal-btn.confirm-btn {
            background-color: #3b82f6 !important;
            border-color: #3b82f6 !important;
            color: #ffffff !important;
        }

        .bdb-wrapper.theme-retro .bdb-modal-box {
            font-family: "Courier New", Courier, monospace !important;
            background-color: #ffffff !important;
            box-shadow: 4px 4px 0px #000000 !important;
        }
        .bdb-wrapper.theme-retro .bdb-modal-btn {
            font-family: "Courier New", Courier, monospace !important;
            box-shadow: 2px 2px 0px #000000 !important;
        }

        .bdb-wrapper.theme-blueprint .bdb-modal-box {
            font-family: "Courier New", Courier, monospace !important;
            background-color: #1e3a8a !important;
            color: #ffffff !important;
            border-color: #ffffff !important;
            box-shadow: none !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-modal-text {
            font-family: "Courier New", Courier, monospace !important;
            color: #ffffff !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-modal-btn {
            font-family: "Courier New", Courier, monospace !important;
            border-color: #ffffff !important;
            background-color: #1e3a8a !important;
            color: #ffffff !important;
            box-shadow: none !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-modal-btn.cancel-btn {
            background-color: #1d4ed8 !important;
            color: #bfdbfe !important;
        }

        .bdb-mobile-fab-container {
            display: none;
        }

        /* Mobile specific adaptations */
        @media (max-width: 768px) {
            .bdb-properties-panel {
                width: 100% !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                top: auto !important;
                max-height: 50% !important;
                border-left: none !important;
                border-right: none !important;
                border-bottom: none !important;
                border-top: 3px solid #000000 !important;
                box-shadow: none !important;
                transform: translateY(100%);
            }
            .bdb-properties-panel.hidden {
                transform: translateY(100%);
            }
            .bdb-properties-panel:not(.hidden) {
                transform: translateY(0);
            }
            
            /* Collapse toolbar into FAB */
            .bdb-toolbar {
                display: none; /* We will render a floating action button on mobile */
            }
            .bdb-mobile-fab-container {
                display: block;
                position: absolute;
                top: 15px;
                left: 15px;
                z-index: 25;
            }
            .bdb-fab-main {
                width: 42px;
                height: 42px;
                border-radius: 50%;
                background-color: #000000;
                color: #ffffff;
                border: 2px solid #000000;
                box-shadow: 3px 3px 0px #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-weight: bold;
                font-size: 1.25rem;
            }
            .bdb-fab-menu {
                position: absolute;
                top: 50px;
                left: 0;
                display: none;
                flex-direction: column;
                gap: 0.35rem;
            }
            .bdb-mobile-fab-container.active .bdb-fab-menu {
                display: flex;
            }
            .bdb-fab-item {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background-color: #ffffff;
                color: #000000;
                border: 2px solid #000000;
                box-shadow: 2px 2px 0px #000000;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 0.65rem;
                font-weight: 800;
                text-transform: uppercase;
            }
        }

        /* Global Themes Overrides */
        
        /* Classic Theme */
        .bdb-wrapper.theme-classic .bdb-canvas {
            background-color: #ffffff !important;
            border-color: #000000 !important;
        }
        .bdb-wrapper.theme-classic .bdb-block {
            background-color: #ffffff !important;
            border-color: #000000 !important;
            border-width: 1px !important;
            font-family: "Times New Roman", Times, serif !important;
        }
        .bdb-wrapper.theme-classic .bdb-block-name {
            font-family: "Times New Roman", Times, serif !important;
        }
        .bdb-wrapper.theme-classic .bdb-pin {
            background-color: #ffffff !important;
            border-color: #000000 !important;
        }
        .bdb-wrapper.theme-classic .bdb-pin-name-inside {
            font-family: "Times New Roman", Times, serif !important;
            color: #000000 !important;
        }
        .bdb-wrapper.theme-classic .bdb-connection-line {
            stroke: #000000 !important;
        }
        .bdb-wrapper.theme-classic .bdb-connection-text-bg {
            fill: #ffffff !important;
            stroke: #000000 !important;
        }
        .bdb-wrapper.theme-classic .bdb-connection-text {
            fill: #000000 !important;
            font-family: "Times New Roman", Times, serif !important;
        }
        .bdb-wrapper.theme-classic .bdb-floating-label {
            color: #000000 !important;
            font-family: "Times New Roman", Times, serif !important;
        }

        /* Tech Clean Theme */
        .bdb-wrapper.theme-tech .bdb-canvas {
            background-color: #f8fafc !important;
            border-color: #cbd5e1 !important;
        }
        .bdb-wrapper.theme-tech .bdb-block {
            background-color: #ffffff !important;
            border-color: #64748b !important;
            border-radius: 4px !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important;
            font-family: "Outfit", sans-serif !important;
        }
        .bdb-wrapper.theme-tech .bdb-block-name {
            font-family: "Outfit", sans-serif !important;
            color: #1e293b !important;
        }
        .bdb-wrapper.theme-tech .bdb-pin {
            background-color: #ffffff !important;
            border-color: #64748b !important;
            border-radius: 50% !important;
        }
        .bdb-wrapper.theme-tech .bdb-pin-name-inside {
            font-family: "Outfit", sans-serif !important;
            color: #475569 !important;
        }
        .bdb-wrapper.theme-tech .bdb-connection-line {
            stroke: #475569 !important;
        }
        .bdb-wrapper.theme-tech .bdb-connection-text-bg {
            fill: #ffffff !important;
            stroke: #64748b !important;
        }
        .bdb-wrapper.theme-tech .bdb-connection-text {
            fill: #1e293b !important;
            font-family: "Outfit", sans-serif !important;
        }
        .bdb-wrapper.theme-tech .bdb-floating-label {
            color: #1e293b !important;
            font-family: "Outfit", sans-serif !important;
        }

        /* Retro Brutalist Theme */
        .bdb-wrapper.theme-retro .bdb-canvas {
            background-color: #ffffff !important;
            border-color: #000000 !important;
        }
        .bdb-wrapper.theme-retro .bdb-block {
            background-color: #ffffff !important;
            border-color: #000000 !important;
            border-width: 2px !important;
            box-shadow: 4px 4px 0px #000000 !important;
            font-family: "Courier New", Courier, monospace !important;
        }
        .bdb-wrapper.theme-retro .bdb-block-name {
            font-family: "Courier New", Courier, monospace !important;
            color: #000000 !important;
        }
        .bdb-wrapper.theme-retro .bdb-pin {
            background-color: #ffffff !important;
            border-color: #000000 !important;
            border-width: 2px !important;
        }
        .bdb-wrapper.theme-retro .bdb-pin-name-inside {
            font-family: "Courier New", Courier, monospace !important;
            color: #000000 !important;
        }
        .bdb-wrapper.theme-retro .bdb-connection-line {
            stroke: #000000 !important;
            stroke-width: 3.5px !important;
        }
        .bdb-wrapper.theme-retro .bdb-connection-text-bg {
            fill: #ffffff !important;
            stroke: #000000 !important;
            stroke-width: 2px !important;
        }
        .bdb-wrapper.theme-retro .bdb-connection-text {
            fill: #000000 !important;
            font-family: "Courier New", Courier, monospace !important;
        }
        .bdb-wrapper.theme-retro .bdb-floating-label {
            color: #000000 !important;
            font-family: "Courier New", Courier, monospace !important;
        }

        /* Blueprint Theme */
        .bdb-wrapper.theme-blueprint .bdb-canvas {
            background-color: #1e3a8a !important;
            border-color: #3b82f6 !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-block {
            background-color: rgba(30, 58, 138, 0.8) !important;
            border-color: #ffffff !important;
            font-family: "Courier New", Courier, monospace !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-block-name {
            font-family: "Courier New", Courier, monospace !important;
            color: #ffffff !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-pin {
            background-color: #1e3a8a !important;
            border-color: #ffffff !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-pin-name-inside {
            font-family: "Courier New", Courier, monospace !important;
            color: #93c5fd !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-connection-line {
            stroke: #ffffff !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-connection-text-bg {
            fill: #1e3a8a !important;
            stroke: #ffffff !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-connection-text {
            fill: #ffffff !important;
            font-family: "Courier New", Courier, monospace !important;
        }
        .bdb-wrapper.theme-blueprint .bdb-floating-label {
            color: #ffffff !important;
            font-family: "Courier New", Courier, monospace !important;
        }
    `;

    // Inject styles
    function injectStyles() {
        const styleId = "bdb-styles";
        if (document.getElementById(styleId)) return;
        const style = document.createElement("style");
        style.id = styleId;
        style.innerHTML = CSS_STYLES;
        document.head.appendChild(style);
    }

    // Core module interface definition
    const blockDiagramBuilder = {
        async init(container, savedState) {
            containerEl = container;
            injectStyles();

            // Set up DOM elements
            this.buildLayout();
            
            // Set initial state
            if (savedState) {
                state = savedState.state || { blocks: [], connections: [], annotations: [], groups: [] };
                camera = savedState.camera || { panX: 0, panY: 0, scale: 1.0 };
            } else {
                // Load default empty template
                this.loadTemplateState('blank');
            }
            if (!state.theme) state.theme = 'default';
            const themeSelect = document.getElementById('tb-theme-select');
            if (themeSelect) {
                themeSelect.value = state.theme;
            }
            const wrapper = document.querySelector('.bdb-wrapper');
            if (wrapper) {
                wrapper.className = `bdb-wrapper theme-${state.theme}`;
            }

            // Render
            this.updateCanvasTransform();
            this.renderDiagram();
            this.initEvents();
            this.updateUndoRedoButtons();
            this.loadCustomLibraryDropdown();
            
            // Render minimap first time
            setTimeout(() => this.drawMinimap(), 100);
        },

        buildLayout() {
            containerEl.innerHTML = `
                <div class="bdb-wrapper">
                    <!-- Float Toolbar -->
                    <div class="bdb-toolbar" id="bdb-toolbar">
                        <div class="bdb-toolbar-section">
                            <button class="bdb-btn active" id="tb-tool-select" title="Pointer Tool">Pointer</button>
                            <button class="bdb-btn" id="tb-tool-pan" title="Pan Canvas Tool">Pan</button>
                            <button class="bdb-btn" id="tb-tool-lasso" title="Lasso Selection Tool">Lasso</button>
                        </div>
                        <div class="bdb-toolbar-section">
                            <button class="bdb-btn" id="tb-add-block">+ Block</button>
                            <button class="bdb-btn" id="tb-add-label">+ Label</button>
                            <button class="bdb-btn" id="tb-add-note">+ Sticky</button>
                            <button class="bdb-btn" id="tb-add-arrow">+ Arrow</button>
                        </div>
                        <div class="bdb-toolbar-section">
                            <button class="bdb-btn" id="tb-undo" disabled>Undo</button>
                            <button class="bdb-btn" id="tb-redo" disabled>Redo</button>
                            <button class="bdb-btn" id="tb-clear">Clear</button>
                        </div>
                        <div class="bdb-toolbar-section">
                             <select class="bdb-select" id="tb-template-select">
                                <option value="" disabled selected>Templates</option>
                                <option value="blank">Blank Canvas</option>
                                <option value="emf_loop">EMF Induction Loop</option>
                                <option value="magnetic_circuit">Magnetic Circuit</option>
                                <option value="signal_chain">Signal Chain</option>
                                <option value="ram_bus">Microprocessor & RAM Bus</option>
                                <option value="feedback_loop">Feedback Control Loop</option>
                            </select>
                        </div>
                        <div class="bdb-toolbar-section">
                            <select class="bdb-select" id="tb-theme-select">
                                <option value="default" selected>Theme: Default</option>
                                <option value="classic">Theme: Classic (B&W)</option>
                                <option value="tech">Theme: Tech Clean</option>
                                <option value="retro">Theme: Retro Brutalist</option>
                                <option value="blueprint">Theme: Blueprint</option>
                            </select>
                        </div>
                        <div class="bdb-toolbar-section">
                            <select class="bdb-select" id="tb-library-select">
                                <option value="" disabled selected>Block Library</option>
                                <option value="save_current" id="tb-lib-save-current" disabled>Save Selected Block...</option>
                                <option value="" disabled>--- Saved Blocks ---</option>
                            </select>
                        </div>
                        <div class="bdb-toolbar-section">
                            <select class="bdb-select" id="tb-align-select">
                                <option value="" disabled selected>Align / Distribute</option>
                                <option value="left">Align Left</option>
                                <option value="center">Align Center</option>
                                <option value="right">Align Right</option>
                                <option value="top">Align Top</option>
                                <option value="middle">Align Middle</option>
                                <option value="bottom">Align Bottom</option>
                                <option value="dist-h">Distribute Horizontally</option>
                                <option value="dist-v">Distribute Vertically</option>
                            </select>
                        </div>
                        <div class="bdb-toolbar-section">
                            <button class="bdb-btn" id="tb-save" style="background-color: #000000; color: #ffffff;">Save Run</button>
                            <button class="bdb-btn" id="tb-export-png">Export PNG</button>
                            <button class="bdb-btn" id="tb-export-json">Export JSON</button>
                            <label class="bdb-btn" style="display:inline-flex; align-items:center; margin-bottom:0; cursor:pointer;">
                                Import JSON
                                <input type="file" id="tb-import-json" accept=".json" style="display:none;">
                            </label>
                        </div>
                    </div>

                    <!-- Mobile FAB Menu -->
                    <div class="bdb-mobile-fab-container" id="bdb-fab-container">
                        <div class="bdb-fab-main" id="bdb-fab-main">+</div>
                        <div class="bdb-fab-menu">
                            <div class="bdb-fab-item" id="fab-add-block" title="Add Block">Blk</div>
                            <div class="bdb-fab-item" id="fab-add-label" title="Add Label">Lbl</div>
                            <div class="bdb-fab-item" id="fab-add-note" title="Add Sticky">Stk</div>
                            <div class="bdb-fab-item" id="fab-add-arrow" title="Add Arrow">Arr</div>
                            <div class="bdb-fab-item" id="fab-undo" title="Undo">Und</div>
                            <div class="bdb-fab-item" id="fab-redo" title="Redo">Red</div>
                        </div>
                    </div>

                    <!-- Viewport -->
                    <div class="bdb-viewport" id="bdb-viewport">
                        <div class="bdb-canvas" id="bdb-canvas">
                            <!-- SVG overlay for connections and connection drawing -->
                            <svg class="bdb-svg-overlay" id="bdb-svg-overlay"></svg>
                            <!-- HTML elements (blocks, notes, labels) -->
                            <div class="bdb-html-layer" id="bdb-html-layer"></div>
                        </div>
                        
                        <!-- Drag Selection Box -->
                        <div class="bdb-drag-select-box" id="bdb-drag-select-box"></div>
                    </div>

                    <!-- Properties Panel -->
                    <div class="bdb-properties-panel hidden" id="bdb-properties-panel">
                        <div class="bdb-properties-header">
                            <span id="prop-panel-title">Properties</span>
                            <button class="bdb-properties-close" id="prop-panel-close">&times;</button>
                        </div>
                        <div class="bdb-properties-content" id="bdb-properties-content">
                            <!-- Populated dynamically based on selection -->
                        </div>
                    </div>

                    <!-- Minimap -->
                    <div class="bdb-minimap" id="bdb-minimap">
                        <canvas class="bdb-minimap-canvas" id="bdb-minimap-canvas"></canvas>
                        <div class="bdb-minimap-viewport" id="bdb-minimap-viewport"></div>
                    </div>

                    <!-- Right-click Context Menu -->
                    <div class="bdb-context-menu" id="bdb-context-menu">
                        <button class="bdb-context-item" id="ctx-duplicate">Duplicate</button>
                        <button class="bdb-context-item" id="ctx-group">Group</button>
                        <button class="bdb-context-item" id="ctx-ungroup">Ungroup</button>
                        <button class="bdb-context-item" id="ctx-delete">Delete</button>
                        <button class="bdb-context-item" id="ctx-save-to-lib">Save to Library</button>
                    </div>

                    <!-- Toast warning container -->
                    <div class="bdb-toast-container" id="bdb-toast-container"></div>
                </div>
            `;

            // Cache DOM elements
            canvasEl = document.getElementById('bdb-canvas');
            htmlLayerEl = document.getElementById('bdb-html-layer');
            svgOverlayEl = document.getElementById('bdb-svg-overlay');
            propertiesPanelEl = document.getElementById('bdb-properties-panel');
            minimapCanvasEl = document.getElementById('bdb-minimap-canvas');
            minimapViewportEl = document.getElementById('bdb-minimap-viewport');
            toastContainerEl = document.getElementById('bdb-toast-container');
            dragSelectBoxEl = document.getElementById('bdb-drag-select-box');
        },

        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'bdb-toast';
            toast.innerText = message;
            toastContainerEl.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'none';
                toast.offsetHeight; // Trigger reflow
                toast.style.animation = 'bdb-toast-in 0.2s reverse forwards';
                setTimeout(() => toast.remove(), 250);
            }, 3000);
        },

        showAlert(message) {
            const overlay = document.createElement('div');
            overlay.className = 'bdb-modal-overlay';
            
            const box = document.createElement('div');
            box.className = 'bdb-modal-box';
            
            const text = document.createElement('div');
            text.className = 'bdb-modal-text';
            text.innerText = message;
            
            const buttons = document.createElement('div');
            buttons.className = 'bdb-modal-buttons';
            
            const okBtn = document.createElement('button');
            okBtn.className = 'bdb-modal-btn confirm-btn';
            okBtn.innerText = 'OK';
            okBtn.addEventListener('click', () => {
                overlay.remove();
            });
            
            buttons.appendChild(okBtn);
            box.appendChild(text);
            box.appendChild(buttons);
            overlay.appendChild(box);
            
            containerEl.appendChild(overlay);
        },

        showConfirm(message, onConfirm, onCancel) {
            const overlay = document.createElement('div');
            overlay.className = 'bdb-modal-overlay';
            
            const box = document.createElement('div');
            box.className = 'bdb-modal-box';
            
            const text = document.createElement('div');
            text.className = 'bdb-modal-text';
            text.innerText = message;
            
            const buttons = document.createElement('div');
            buttons.className = 'bdb-modal-buttons';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'bdb-modal-btn cancel-btn';
            cancelBtn.innerText = 'Cancel';
            cancelBtn.addEventListener('click', () => {
                overlay.remove();
                if (onCancel) onCancel();
            });
            
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'bdb-modal-btn confirm-btn';
            confirmBtn.innerText = 'Confirm';
            confirmBtn.addEventListener('click', () => {
                overlay.remove();
                if (onConfirm) onConfirm();
            });
            
            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            box.appendChild(text);
            box.appendChild(buttons);
            overlay.appendChild(box);
            
            containerEl.appendChild(overlay);
        },

        showPrompt(message, defaultValue, onConfirm) {
            const overlay = document.createElement('div');
            overlay.className = 'bdb-modal-overlay';
            
            const box = document.createElement('div');
            box.className = 'bdb-modal-box';
            
            const text = document.createElement('div');
            text.className = 'bdb-modal-text';
            text.innerText = message;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue || '';
            input.style.width = '100%';
            input.style.padding = '0.35rem';
            input.style.border = '2px solid #000000';
            input.style.boxSizing = 'border-box';
            input.style.fontFamily = 'inherit';
            input.style.fontSize = '0.75rem';
            
            const buttons = document.createElement('div');
            buttons.className = 'bdb-modal-buttons';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'bdb-modal-btn cancel-btn';
            cancelBtn.innerText = 'Cancel';
            cancelBtn.addEventListener('click', () => {
                overlay.remove();
            });
            
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'bdb-modal-btn confirm-btn';
            confirmBtn.innerText = 'OK';
            confirmBtn.addEventListener('click', () => {
                const val = input.value.trim();
                overlay.remove();
                if (onConfirm) onConfirm(val);
            });
            
            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            box.appendChild(text);
            box.appendChild(input);
            box.appendChild(buttons);
            overlay.appendChild(box);
            
            containerEl.appendChild(overlay);
            
            // Auto focus input
            setTimeout(() => input.focus(), 50);
        },

        // --- Camera Pan & Zoom ---
        constrainCamera() {
            const viewport = document.getElementById('bdb-viewport');
            if (!viewport) return;
            const rect = viewport.getBoundingClientRect();
            const vw = rect.width || 800;
            const vh = rect.height || 600;
            const cw = 2000;
            const ch = 1500;

            // Constrain scale (min 0.3, max 3.0)
            camera.scale = Math.min(3.0, Math.max(0.3, camera.scale));

            const canvasW = cw * camera.scale;
            const canvasH = ch * camera.scale;

            if (canvasW <= vw) {
                camera.panX = (vw - canvasW) / 2;
            } else {
                camera.panX = Math.min(0, Math.max(vw - canvasW, camera.panX));
            }

            if (canvasH <= vh) {
                camera.panY = (vh - canvasH) / 2;
            } else {
                camera.panY = Math.min(0, Math.max(vh - canvasH, camera.panY));
            }
        },

        updateCanvasTransform() {
            this.constrainCamera();
            canvasEl.style.transform = `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.scale})`;
            this.drawMinimap();
        },

        panBy(dx, dy) {
            camera.panX += dx;
            camera.panY += dy;
            this.updateCanvasTransform();
        },

        zoomAt(zoomFactor, mouseX, mouseY) {
            const newScale = Math.min(3.0, Math.max(0.3, camera.scale * zoomFactor));
            if (newScale === camera.scale) return;

            // Zoom centered on cursor
            // Target point on canvas: X_canvas = (mouseX - panX) / scale
            const targetX = (mouseX - camera.panX) / camera.scale;
            const targetY = (mouseY - camera.panY) / camera.scale;

            camera.scale = newScale;
            camera.panX = mouseX - targetX * camera.scale;
            camera.panY = mouseY - targetY * camera.scale;

            this.updateCanvasTransform();
        },

        // --- Undo / Redo History ---
        saveHistory() {
            // Trim forward history if we were in the middle
            if (historyIndex < history.length - 1) {
                history = history.slice(0, historyIndex + 1);
            }
            
            // Deep clone state
            const clone = JSON.parse(JSON.stringify(state));
            history.push(clone);
            historyIndex = history.length - 1;
            
            this.updateUndoRedoButtons();
        },

        undo() {
            if (historyIndex > 0) {
                historyIndex--;
                state = JSON.parse(JSON.stringify(history[historyIndex]));
                this.renderDiagram();
                this.updateUndoRedoButtons();
                this.closePropertiesPanel();
                this.drawMinimap();
            }
        },

        redo() {
            if (historyIndex < history.length - 1) {
                historyIndex++;
                state = JSON.parse(JSON.stringify(history[historyIndex]));
                this.renderDiagram();
                this.updateUndoRedoButtons();
                this.closePropertiesPanel();
                this.drawMinimap();
            }
        },

        updateUndoRedoButtons() {
            const undoBtn = document.getElementById('tb-undo');
            const redoBtn = document.getElementById('tb-redo');
            if (undoBtn) undoBtn.disabled = (historyIndex <= 0);
            if (redoBtn) redoBtn.disabled = (historyIndex >= history.length - 1);
            
            const fabUndo = document.getElementById('fab-undo');
            const fabRedo = document.getElementById('fab-redo');
            if (fabUndo) fabUndo.style.opacity = (historyIndex <= 0) ? '0.35' : '1';
            if (fabRedo) fabRedo.style.opacity = (historyIndex >= history.length - 1) ? '0.35' : '1';
        },

        // --- Selection Helpers ---
        selectElements(ids, isToggle = false) {
            if (isToggle) {
                ids.forEach(id => {
                    const idx = selectedIds.indexOf(id);
                    if (idx > -1) {
                        selectedIds.splice(idx, 1);
                    } else {
                        selectedIds.push(id);
                    }
                });
            } else {
                selectedIds = [...ids];
            }

            // Update UI selected classes
            // Blocks
            Array.from(htmlLayerEl.children).forEach(el => {
                const elId = el.getAttribute('data-id');
                if (selectedIds.includes(elId)) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            });

            // SVG Connection Paths
            Array.from(svgOverlayEl.querySelectorAll('.bdb-connection-line')).forEach(path => {
                const connId = path.getAttribute('data-id');
                if (selectedIds.includes(connId)) {
                    path.classList.add('selected');
                    path.style.stroke = '#3b82f6';
                } else {
                    path.classList.remove('selected');
                    // Reset to connection color
                    const conn = state.connections.find(c => c.id === connId);
                    path.style.stroke = conn ? (conn.color || '#000000') : '#000000';
                }
            });

            // Show Arrow handles if arrow is selected
            this.renderArrowHandles();

            // Populate properties
            if (selectedIds.length === 1) {
                if (!isUpdatingProperties) {
                    this.openPropertiesPanel(selectedIds[0]);
                }
            } else {
                if (!isUpdatingProperties) {
                    this.closePropertiesPanel();
                }
            }

            // Update library save option state
            const saveOption = document.getElementById('tb-lib-save-current');
            if (saveOption) {
                if (selectedIds.length === 1 && state.blocks.some(b => b.id === selectedIds[0])) {
                    saveOption.disabled = false;
                    saveOption.innerText = "Save Selected Block...";
                } else {
                    saveOption.disabled = true;
                    saveOption.innerText = "Save Selected Block (Select 1 Block first)";
                }
            }
        },

        clearSelection() {
            this.selectElements([]);
        },

        // --- Templating ---
        loadTemplateState(templateKey) {
            const template = TEMPLATES[templateKey] || TEMPLATES.blank;
            state = JSON.parse(JSON.stringify(template));
            if (!state.theme) state.theme = 'default';
            const themeSelect = document.getElementById('tb-theme-select');
            if (themeSelect) {
                themeSelect.value = state.theme;
            }
            const wrapper = document.querySelector('.bdb-wrapper');
            if (wrapper) {
                wrapper.className = `bdb-wrapper theme-${state.theme}`;
            }
            
            // Recenter view based on content bounds
            camera.scale = 1.0;
            camera.panX = 0;
            camera.panY = 0;
            
            if (state.blocks.length > 0) {
                // Recenter camera to wrap blocks roughly
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                state.blocks.forEach(b => {
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                });
                const viewport = document.getElementById('bdb-viewport');
                if (viewport) {
                    const rect = viewport.getBoundingClientRect();
                    const w = maxX - minX;
                    const h = maxY - minY;
                    camera.panX = Math.max(20, (rect.width - w) / 2 - minX);
                    camera.panY = Math.max(20, (rect.height - h) / 2 - minY);
                }
            }

            selectedIds = [];
            this.renderDiagram();
            this.updateCanvasTransform();
            
            // Clear history and save this as first point
            history = [];
            historyIndex = -1;
            this.saveHistory();
            this.closePropertiesPanel();
        },

        // --- Rendering Core ---
        renderDiagram() {
            // 1. Clear HTML layers and SVG overlay
            htmlLayerEl.innerHTML = '';
            
            // Clear connections but keep marker definitions
            svgOverlayEl.innerHTML = `
                <defs>
                    <marker id="arrow-forward" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#000000"/>
                    </marker>
                    <marker id="arrow-backward" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 10 0 L 0 5 L 10 10 z" fill="#000000"/>
                    </marker>
                    <marker id="arrow-bidirectional" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <!-- Custom double head handles orientation -->
                    </marker>
                </defs>
                <path id="bdb-lasso-path" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4,4" style="display: none;" />
            `;

            // 2. Render Groups Boundaries
            state.groups.forEach(grp => {
                if (grp.collapsed) {
                    this.renderCollapsedGroup(grp);
                } else {
                    this.renderExpandedGroup(grp);
                }
            });

            // 3. Render Blocks
            state.blocks.forEach(blk => {
                // If block is in a collapsed group, do not render it directly
                const parentGroup = state.groups.find(g => g.blockIds.includes(blk.id));
                if (parentGroup && parentGroup.collapsed) return;

                this.renderBlock(blk);
            });

            // 4. Render Annotations (Notes, Labels, Standalone Arrows)
            state.annotations.forEach(anno => {
                if (anno.type === 'note') {
                    this.renderStickyNote(anno);
                } else if (anno.type === 'label') {
                    this.renderFloatingLabel(anno);
                } else if (anno.type === 'arrow') {
                    this.renderStandaloneArrow(anno);
                }
            });

            // 5. Render Connections
            state.connections.forEach(conn => {
                this.renderConnection(conn);
            });

            // Re-render selection overlays
            this.selectElements(selectedIds);
            this.drawMinimap();
        },

        // --- Render Helpers ---

        // Render standard Block
        renderBlock(blk) {
            const div = document.createElement('div');
            div.className = 'bdb-block';
            div.setAttribute('data-id', blk.id);
            div.style.left = `${blk.x}px`;
            div.style.top = `${blk.y}px`;
            div.style.width = `${blk.width}px`;
            div.style.height = `${blk.height}px`;
            div.style.backgroundColor = blk.color || '#ffffff';
            div.style.borderStyle = blk.borderStyle || 'solid';
            if (blk.borderStyle === 'double') {
                div.style.borderWidth = '6px'; // Double borders need thicker styles
            }
            if (blk.fontFamily) {
                div.style.fontFamily = blk.fontFamily;
            }

            // Name
            const nameEl = document.createElement('div');
            nameEl.className = 'bdb-block-name';
            nameEl.innerText = blk.name;
            div.appendChild(nameEl);

            // Add resize handles if selected
            if (selectedIds.includes(blk.id)) {
                ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'].forEach(h => {
                    const handle = document.createElement('div');
                    handle.className = `bdb-resize-handle ${h}`;
                    handle.setAttribute('data-handle', h);
                    div.appendChild(handle);
                });
            }

            // Render pins on edges
            this.renderPinsOnBlock(div, blk);

            htmlLayerEl.appendChild(div);
        },

        renderPinsOnBlock(blockDiv, blk) {
            const sides = ['top', 'right', 'bottom', 'left'];
            sides.forEach(side => {
                const sideDef = blk.sides[side];
                if (!sideDef || sideDef.pinCount === 0) return;

                const count = sideDef.pinCount;
                
                // Draw side label inside the block boundary
                if (sideDef.label) {
                    const sideLbl = document.createElement('div');
                    sideLbl.className = 'bdb-side-label-text';
                    sideLbl.innerText = sideDef.label;
                    
                    if (side === 'top') {
                        sideLbl.style.top = '4px';
                        sideLbl.style.left = '50%';
                        sideLbl.style.transform = 'translateX(-50%)';
                    } else if (side === 'bottom') {
                        sideLbl.style.bottom = '4px';
                        sideLbl.style.left = '50%';
                        sideLbl.style.transform = 'translateX(-50%)';
                    } else if (side === 'left') {
                        sideLbl.style.left = '8px';
                        sideLbl.style.top = '50%';
                        sideLbl.style.transform = 'translateY(-50%) rotate(-90deg)';
                        sideLbl.style.transformOrigin = 'left center';
                    } else if (side === 'right') {
                        sideLbl.style.right = '8px';
                        sideLbl.style.top = '50%';
                        sideLbl.style.transform = 'translateY(-50%) rotate(90deg)';
                        sideLbl.style.transformOrigin = 'right center';
                    }
                    blockDiv.appendChild(sideLbl);
                }

                // Render pins
                for (let i = 0; i < count; i++) {
                    const pin = sideDef.pins[i] || { name: `Pin ${i+1}`, direction: 'input' };
                    const dot = document.createElement('div');
                    dot.className = `bdb-pin direction-${pin.direction}`;
                    dot.setAttribute('data-block-id', blk.id);
                    dot.setAttribute('data-side', side);
                    dot.setAttribute('data-pin-idx', i);

                    // Position pins evenly along edge
                    const pct = (i + 1) / (count + 1) * 100;
                    if (side === 'top') {
                        dot.style.top = '0px';
                        dot.style.left = `${pct}%`;
                    } else if (side === 'bottom') {
                        dot.style.top = '100%';
                        dot.style.left = `${pct}%`;
                    } else if (side === 'left') {
                        dot.style.left = '0px';
                        dot.style.top = `${pct}%`;
                    } else if (side === 'right') {
                        dot.style.left = '100%';
                        dot.style.top = `${pct}%`;
                    }

                    // Tooltip
                    const tooltip = document.createElement('div');
                    tooltip.className = 'bdb-pin-tooltip';
                    tooltip.innerText = `${pin.name}`;
                    dot.appendChild(tooltip);

                    blockDiv.appendChild(dot);

                    // Render pin name on the inside of the block boundary next to the pin
                    const pinNameEl = document.createElement('div');
                    pinNameEl.className = 'bdb-pin-name-inside';
                    pinNameEl.innerText = pin.name;
                    pinNameEl.style.position = 'absolute';
                    
                    if (side === 'left') {
                        pinNameEl.style.left = '18px';
                        pinNameEl.style.top = `${pct}%`;
                        pinNameEl.style.transform = 'translateY(-50%)';
                        pinNameEl.style.textAlign = 'left';
                    } else if (side === 'right') {
                        pinNameEl.style.right = '18px';
                        pinNameEl.style.top = `${pct}%`;
                        pinNameEl.style.transform = 'translateY(-50%)';
                        pinNameEl.style.textAlign = 'right';
                    } else if (side === 'top') {
                        pinNameEl.style.top = '18px';
                        pinNameEl.style.left = `${pct}%`;
                        pinNameEl.style.transform = 'translateX(-50%)';
                        pinNameEl.style.textAlign = 'center';
                    } else if (side === 'bottom') {
                        pinNameEl.style.bottom = '18px';
                        pinNameEl.style.left = `${pct}%`;
                        pinNameEl.style.transform = 'translateX(-50%)';
                        pinNameEl.style.textAlign = 'center';
                    }
                    
                    blockDiv.appendChild(pinNameEl);
                }
            });
        },

        // Render Expanded Group
        renderExpandedGroup(grp) {
            const div = document.createElement('div');
            div.className = 'bdb-group-boundary';
            div.setAttribute('data-id', grp.id);
            div.style.left = `${grp.x}px`;
            div.style.top = `${grp.y}px`;
            div.style.width = `${grp.width}px`;
            div.style.height = `${grp.height}px`;

            // Header
            const header = document.createElement('div');
            header.className = 'bdb-group-header';
            header.innerHTML = `
                <span>Group: ${grp.name}</span>
                <button class="bdb-group-collapse-btn" data-id="${grp.id}" title="Collapse group">[-]</button>
            `;
            
            // Handle collapse click
            header.querySelector('.bdb-group-collapse-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleGroupCollapsed(grp.id);
            });

            div.appendChild(header);
            htmlLayerEl.appendChild(div);
        },

        // Render Collapsed Group Block
        renderCollapsedGroup(grp) {
            const div = document.createElement('div');
            div.className = 'bdb-group-collapsed-box';
            div.setAttribute('data-id', grp.id);
            div.style.left = `${grp.x}px`;
            div.style.top = `${grp.y}px`;
            div.style.width = `${grp.width}px`;
            div.style.height = `${grp.height}px`;

            // Display name & expand button
            div.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:0.25rem;">
                    <div>${grp.name} [Collapsed]</div>
                    <button class="bdb-btn" style="font-size:0.6rem; padding:2px 6px;" data-id="${grp.id}">Expand</button>
                </div>
            `;

            div.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleGroupCollapsed(grp.id);
            });

            htmlLayerEl.appendChild(div);
        },

        // Toggle group collapse state
        toggleGroupCollapsed(groupId) {
            const grp = state.groups.find(g => g.id === groupId);
            if (!grp) return;

            grp.collapsed = !grp.collapsed;
            
            // Adjust size to default collapsed size if collapsed, or recalculate children bounds
            if (grp.collapsed) {
                grp.width = 160;
                grp.height = 100;
            } else {
                // Recalculate size from member blocks
                this.recalculateGroupBounds(grp);
            }

            this.saveHistory();
            this.renderDiagram();
        },

        recalculateGroupBounds(grp) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            grp.blockIds.forEach(id => {
                const b = state.blocks.find(x => x.id === id);
                if (b) {
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                }
            });

            if (minX !== Infinity) {
                grp.x = minX - 15;
                grp.y = minY - 35; // Extra padding top for header
                grp.width = (maxX - minX) + 30;
                grp.height = (maxY - minY) + 50;
            }
        },

        // Render Annotations
        renderStickyNote(note) {
            const div = document.createElement('div');
            div.className = 'bdb-sticky-note';
            div.setAttribute('data-id', note.id);
            div.style.left = `${note.x}px`;
            div.style.top = `${note.y}px`;
            if (note.height) {
                div.style.height = `${note.height}px`;
            }
            if (note.color) div.style.backgroundColor = note.color;
            if (note.fontFamily) {
                div.style.fontFamily = note.fontFamily;
            }

            const textarea = document.createElement('textarea');
            textarea.className = 'bdb-sticky-note-text';
            textarea.value = note.text;
            textarea.placeholder = "Sticky note...";
            if (note.height) {
                textarea.style.height = `${note.height - 20}px`;
            }
            
            const adjustHeight = () => {
                textarea.style.height = 'auto';
                const textHeight = textarea.scrollHeight;
                // Give it a minimum height of 120px
                const finalHeight = Math.max(120, textHeight + 20);
                textarea.style.height = `${finalHeight - 20}px`;
                div.style.height = `${finalHeight}px`;
                note.height = finalHeight;
            };

            // Update note on input
            textarea.addEventListener('input', (e) => {
                note.text = e.target.value;
                adjustHeight();
            });
            textarea.addEventListener('change', () => {
                this.saveHistory();
            });

            div.appendChild(textarea);
            htmlLayerEl.appendChild(div);
            
            // Adjust height synchronously to avoid rendering layout flickers
            adjustHeight();
        },

        renderFloatingLabel(label) {
            const div = document.createElement('div');
            div.className = 'bdb-floating-label';
            div.setAttribute('data-id', label.id);
            div.style.left = `${label.x}px`;
            div.style.top = `${label.y}px`;
            if (label.fontFamily) {
                div.style.fontFamily = label.fontFamily;
            }

            // Support bold, italic, and subscripts
            let formattedText = label.text || "Label text";
            
            // Format subscripts: V_in or V_1 or V_{sub} -> V<sub>sub</sub>
            formattedText = formattedText.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
            formattedText = formattedText.replace(/_([a-zA-Z0-9])/g, '<sub>$1</sub>');
            
            // Support simple Markdown bold/italic
            formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            formattedText = formattedText.replace(/\*([^*]+)\*/g, '<em>$1</em>');

            div.innerHTML = formattedText;

            // Edit on double click
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.className = 'bdb-floating-label-input';
                input.type = 'text';
                input.value = label.text;
                div.innerHTML = '';
                div.appendChild(input);
                input.focus();

                const commit = () => {
                    label.text = input.value;
                    this.saveHistory();
                    this.renderDiagram();
                };

                input.addEventListener('blur', commit);
                input.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') commit();
                });
            });

            htmlLayerEl.appendChild(div);
        },

        renderStandaloneArrow(arrow) {
            // Draw arrows in the SVG layer
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute('class', 'bdb-connection-line');
            path.setAttribute('data-id', arrow.id);
            
            // Calculate coordinates
            const dStr = `M ${arrow.x1} ${arrow.y1} L ${arrow.x2} ${arrow.y2}`;
            path.setAttribute('d', dStr);
            path.setAttribute('stroke', arrow.color || '#000000');
            path.setAttribute('stroke-width', arrow.size || 2);
            path.setAttribute('stroke-dasharray', arrow.style === 'dashed' ? '5,5' : arrow.style === 'dotted' ? '2,2' : 'none');
            path.setAttribute('marker-end', 'url(#arrow-forward)');

            svgOverlayEl.appendChild(path);
        },

        renderArrowHandles() {
            // Remove existing arrow handles
            Array.from(htmlLayerEl.querySelectorAll('.bdb-arrow-handle')).forEach(h => h.remove());

            selectedIds.forEach(id => {
                const arrow = state.annotations.find(a => a.id === id && a.type === 'arrow');
                if (!arrow) return;

                // Render start and end handles
                const createHandle = (x, y, type) => {
                    const h = document.createElement('div');
                    h.className = 'bdb-arrow-handle';
                    h.style.left = `${x}px`;
                    h.style.top = `${y}px`;
                    h.setAttribute('data-arrow-id', arrow.id);
                    h.setAttribute('data-handle-type', type);
                    htmlLayerEl.appendChild(h);
                };

                createHandle(arrow.x1, arrow.y1, 'start');
                createHandle(arrow.x2, arrow.y2, 'end');
            });
        },

        // Render Connection
        renderConnection(conn) {
            // Calculate source and target points
            const startPt = this.getPinAbsoluteCoords(conn.sourceBlockId, conn.sourceSide, conn.sourcePinIdx);
            const endPt = this.getPinAbsoluteCoords(conn.targetBlockId, conn.targetSide, conn.targetPinIdx);

            if (!startPt || !endPt) return;

            let d = '';
            let midX = 0;
            let midY = 0;
            const pts = [];

            if (conn.routing === 'direct') {
                d = `M ${startPt.coords.x} ${startPt.coords.y} L ${endPt.coords.x} ${endPt.coords.y}`;
                midX = (startPt.coords.x + endPt.coords.x) / 2;
                midY = (startPt.coords.y + endPt.coords.y) / 2;
            } else if (conn.routing === 'curved') {
                const p1 = startPt.coords;
                const p2 = endPt.coords;
                const dx = Math.abs(p2.x - p1.x);
                const dy = Math.abs(p2.y - p1.y);
                const dist = Math.max(40, Math.min(120, Math.max(dx, dy) * 0.5));
                
                let cp1x = p1.x;
                let cp1y = p1.y;
                if (startPt.side === 'left') cp1x -= dist;
                else if (startPt.side === 'right') cp1x += dist;
                else if (startPt.side === 'top') cp1y -= dist;
                else if (startPt.side === 'bottom') cp1y += dist;
                
                let cp2x = p2.x;
                let cp2y = p2.y;
                if (endPt.side === 'left') cp2x -= dist;
                else if (endPt.side === 'right') cp2x += dist;
                else if (endPt.side === 'top') cp2y -= dist;
                else if (endPt.side === 'bottom') cp2y += dist;
                
                d = `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                midX = 0.125 * p1.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * p2.x;
                midY = 0.125 * p1.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * p2.y;
            } else {
                // Orthogonal
                const oPts = computeOrthogonalPoints(startPt.coords, startPt.side, endPt.coords, endPt.side);
                d = `M ${oPts[0].x} ${oPts[0].y}`;
                for (let i = 1; i < oPts.length; i++) {
                    d += ` L ${oPts[i].x} ${oPts[i].y}`;
                }
                const midIdx = Math.floor(oPts.length / 2);
                const ptA = oPts[midIdx - 1];
                const ptB = oPts[midIdx];
                midX = (ptA.x + ptB.x) / 2;
                midY = (ptA.y + ptB.y) / 2;
            }

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute('class', 'bdb-connection-line');
            path.setAttribute('data-id', conn.id);
            path.setAttribute('d', d);

            // Style connection
            const strokeColor = conn.color || '#000000';
            path.setAttribute('stroke', selectedIds.includes(conn.id) ? '#3b82f6' : strokeColor);
            
            const isSelected = selectedIds.includes(conn.id);
            const baseThickness = conn.style === 'bus' ? 5.5 : 2.5;
            path.setAttribute('stroke-width', isSelected ? baseThickness + 1.5 : baseThickness);
            
            if (conn.style === 'dashed') {
                path.setAttribute('stroke-dasharray', '6,6');
            } else if (conn.style === 'dotted') {
                path.setAttribute('stroke-dasharray', '2,3');
            } else {
                path.removeAttribute('stroke-dasharray');
            }

            // Arrowheads
            if (conn.arrowhead === 'forward') {
                path.setAttribute('marker-end', 'url(#arrow-forward)');
            } else if (conn.arrowhead === 'backward') {
                path.setAttribute('marker-start', 'url(#arrow-backward)');
            } else if (conn.arrowhead === 'bidirectional') {
                path.setAttribute('marker-start', 'url(#arrow-backward)');
                path.setAttribute('marker-end', 'url(#arrow-forward)');
            } else {
                path.removeAttribute('marker-end');
                path.removeAttribute('marker-start');
            }

            svgOverlayEl.appendChild(path);

            // Draw text label overlay at midpoint segment
            if (conn.label) {

                const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                
                // Overlay label box background
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute('class', 'bdb-connection-text');
                text.setAttribute('x', midX);
                text.setAttribute('y', midY);
                text.textContent = conn.label;

                // Add to overlay first so we can compute bounding box
                svgOverlayEl.appendChild(text);
                const bbox = text.getBBox();
                svgOverlayEl.removeChild(text);

                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute('class', 'bdb-connection-text-bg');
                rect.setAttribute('x', bbox.x - 3);
                rect.setAttribute('y', bbox.y - 2);
                rect.setAttribute('width', bbox.width + 6);
                rect.setAttribute('height', bbox.height + 4);
                rect.style.stroke = strokeColor;

                textGroup.appendChild(rect);
                textGroup.appendChild(text);
                
                // Allow clicking the text label to select connection
                textGroup.style.cursor = 'pointer';
                textGroup.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectElements([conn.id]);
                });

                svgOverlayEl.appendChild(textGroup);
            }
        },

        // Helper to get absolute coordinate of a pin
        getPinAbsoluteCoords(blockId, side, pinIdx) {
            // Check if group is collapsed. If so, coordinate should point to group border
            const blockInGroup = state.groups.find(g => g.blockIds.includes(blockId));
            if (blockInGroup && blockInGroup.collapsed) {
                // Return coordinate on collapsed group border relative to target
                return {
                    coords: {
                        x: blockInGroup.x + blockInGroup.width / 2,
                        y: blockInGroup.y + blockInGroup.height / 2
                    },
                    side: side
                };
            }

            const blk = state.blocks.find(b => b.id === blockId);
            if (!blk) return null;

            const sideDef = blk.sides[side];
            if (!sideDef || pinIdx >= sideDef.pinCount) return null;

            const count = sideDef.pinCount;
            const pct = (pinIdx + 1) / (count + 1);

            let px = blk.x;
            let py = blk.y;

            if (side === 'top') {
                px += blk.width * pct;
            } else if (side === 'bottom') {
                px += blk.width * pct;
                py += blk.height;
            } else if (side === 'left') {
                py += blk.height * pct;
            } else if (side === 'right') {
                px += blk.width;
                py += blk.height * pct;
            }

            return {
                coords: { x: px, y: py },
                side: side
            };
        },

        getBlockColor(blockId) {
            const blk = state.blocks.find(b => b.id === blockId);
            return blk ? (blk.color || '#000000') : '#000000';
        },

        // --- Alignments & Distributions ---
        // --- Alignments & Distributions ---
        getSelectedDraggableItems() {
            const items = [];
            selectedIds.forEach(id => {
                const b = state.blocks.find(x => x.id === id);
                if (b) {
                    items.push({ type: 'block', obj: b, x: b.x, y: b.y, w: b.width, h: b.height });
                    return;
                }
                const n = state.annotations.find(x => x.id === id && x.type === 'note');
                if (n) {
                    items.push({ type: 'note', obj: n, x: n.x, y: n.y, w: 140, h: 120 });
                    return;
                }
                const l = state.annotations.find(x => x.id === id && x.type === 'label');
                if (l) {
                    items.push({ type: 'label', obj: l, x: l.x, y: l.y, w: 80, h: 20 });
                    return;
                }
                const g = state.groups.find(x => x.id === id);
                if (g) {
                    items.push({ type: 'group', obj: g, x: g.x, y: g.y, w: g.width, h: g.height });
                    return;
                }
            });
            return items;
        },

        alignSelection(alignment) {
            const items = this.getSelectedDraggableItems();
            if (items.length <= 1) return;

            if (alignment === 'left') {
                const minX = Math.min(...items.map(item => item.x));
                items.forEach(item => {
                    item.obj.x = Math.max(0, Math.min(2000 - item.w, minX));
                });
            } else if (alignment === 'center') {
                const centers = items.map(item => item.x + item.w / 2);
                const avgCenter = centers.reduce((sum, c) => sum + c, 0) / centers.length;
                items.forEach(item => {
                    item.obj.x = Math.max(0, Math.min(2000 - item.w, avgCenter - item.w / 2));
                });
            } else if (alignment === 'right') {
                const maxX = Math.max(...items.map(item => item.x + item.w));
                items.forEach(item => {
                    item.obj.x = Math.max(0, Math.min(2000 - item.w, maxX - item.w));
                });
            } else if (alignment === 'top') {
                const minY = Math.min(...items.map(item => item.y));
                items.forEach(item => {
                    item.obj.y = Math.max(0, Math.min(1500 - item.h, minY));
                });
            } else if (alignment === 'middle') {
                const middles = items.map(item => item.y + item.h / 2);
                const avgMiddle = middles.reduce((sum, m) => sum + m, 0) / middles.length;
                items.forEach(item => {
                    item.obj.y = Math.max(0, Math.min(1500 - item.h, avgMiddle - item.h / 2));
                });
            } else if (alignment === 'bottom') {
                const maxY = Math.max(...items.map(item => item.y + item.h));
                items.forEach(item => {
                    item.obj.y = Math.max(0, Math.min(1500 - item.h, maxY - item.h));
                });
            }

            // Move containing groups if needed
            state.groups.forEach(grp => {
                this.recalculateGroupBounds(grp);
            });

            this.saveHistory();
            this.renderDiagram();
        },

        distributeSelection(direction) {
            const items = this.getSelectedDraggableItems();
            if (items.length <= 2) return;

            if (direction === 'horizontal') {
                items.sort((a, b) => a.x - b.x);
                const first = items[0];
                const last = items[items.length - 1];
                
                const totalSpace = last.x - (first.x + first.w);
                const innerWidth = items.slice(1, -1).reduce((sum, item) => sum + item.w, 0);
                const remainingSpace = totalSpace - innerWidth;
                const gap = remainingSpace / (items.length - 1);

                let currentX = first.x + first.w + gap;
                for (let i = 1; i < items.length - 1; i++) {
                    const item = items[i];
                    item.obj.x = Math.max(0, Math.min(2000 - item.w, currentX));
                    currentX += item.w + gap;
                }
            } else if (direction === 'vertical') {
                items.sort((a, b) => a.y - b.y);
                const first = items[0];
                const last = items[items.length - 1];
                
                const totalSpace = last.y - (first.y + first.h);
                const innerHeight = items.slice(1, -1).reduce((sum, item) => sum + item.h, 0);
                const remainingSpace = totalSpace - innerHeight;
                const gap = remainingSpace / (items.length - 1);

                let currentY = first.y + first.h + gap;
                for (let i = 1; i < items.length - 1; i++) {
                    const item = items[i];
                    item.obj.y = Math.max(0, Math.min(1500 - item.h, currentY));
                    currentY += item.h + gap;
                }
            }

            state.groups.forEach(grp => {
                if (grp.blockIds.some(id => selectedIds.includes(id))) {
                    this.recalculateGroupBounds(grp);
                }
            });

            this.saveHistory();
            this.renderDiagram();
        },

        // --- Properties Configuration Panel ---
        openPropertiesPanel(elementId) {
            if (propertiesPanelEl && propertiesPanelEl.contains(document.activeElement)) {
                return;
            }

            const block = state.blocks.find(b => b.id === elementId);
            const conn = state.connections.find(c => c.id === elementId);
            const label = state.annotations.find(a => a.id === elementId && a.type === 'label');
            const note = state.annotations.find(a => a.id === elementId && a.type === 'note');
            const arrow = state.annotations.find(a => a.id === elementId && a.type === 'arrow');

            const contentEl = document.getElementById('bdb-properties-content');
            const titleEl = document.getElementById('prop-panel-title');
            contentEl.innerHTML = '';

            propertiesPanelEl.classList.remove('hidden');

            if (block) {
                titleEl.innerText = "Block Properties";
                this.buildBlockProperties(contentEl, block);
            } else if (conn) {
                titleEl.innerText = "Connection Properties";
                this.buildConnectionProperties(contentEl, conn);
            } else if (label) {
                titleEl.innerText = "Label Properties";
                this.buildLabelProperties(contentEl, label);
            } else if (note) {
                titleEl.innerText = "Sticky Note Properties";
                this.buildStickyProperties(contentEl, note);
            } else if (arrow) {
                titleEl.innerText = "Arrow Properties";
                this.buildArrowProperties(contentEl, arrow);
            } else {
                this.closePropertiesPanel();
            }
        },

        closePropertiesPanel() {
            propertiesPanelEl.classList.add('hidden');
        },

        buildBlockProperties(parent, blk) {
            // Block Name
            const nameGroup = document.createElement('div');
            nameGroup.className = 'bdb-prop-group';
            nameGroup.innerHTML = `
                <label class="bdb-label">Block Name</label>
                <textarea class="bdb-input" id="prop-block-name" rows="2">${blk.name}</textarea>
            `;
            parent.appendChild(nameGroup);

            const nameInput = nameGroup.querySelector('#prop-block-name');
            nameInput.addEventListener('input', (e) => {
                updateProperty(() => {
                    blk.name = e.target.value;
                    const blockEl = htmlLayerEl.querySelector(`[data-id="${blk.id}"] .bdb-block-name`);
                    if (blockEl) blockEl.innerText = blk.name;
                });
            });
            nameInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            // Font Family Selector
            const fontGroup = document.createElement('div');
            fontGroup.className = 'bdb-prop-group';
            fontGroup.innerHTML = `
                <label class="bdb-label">Font Style</label>
                <select class="bdb-select" id="prop-block-font" style="width:100%;">
                    <option value="sans-serif" ${blk.fontFamily === 'sans-serif' ? 'selected' : ''}>Sans-Serif</option>
                    <option value="'Times New Roman', Times, serif" ${blk.fontFamily === "'Times New Roman', Times, serif" ? 'selected' : ''}>Times New Roman</option>
                    <option value="monospace" ${blk.fontFamily === 'monospace' ? 'selected' : ''}>Monospace</option>
                </select>
            `;
            parent.appendChild(fontGroup);

            fontGroup.querySelector('#prop-block-font').addEventListener('change', (e) => {
                updateProperty(() => {
                    blk.fontFamily = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Block Color Swatches & Hex
            const colorGroup = document.createElement('div');
            colorGroup.className = 'bdb-prop-group';
            colorGroup.innerHTML = `
                <label class="bdb-label">Block Color</label>
                <div class="bdb-swatches" id="prop-swatches"></div>
                <label class="bdb-label">Custom Hex</label>
                <input type="text" class="bdb-input" id="prop-block-color-hex" value="${blk.color || '#ffffff'}">
            `;
            parent.appendChild(colorGroup);

            const swatchesArea = colorGroup.querySelector('#prop-swatches');
            COLOR_PRESETS.forEach(preset => {
                const swatch = document.createElement('div');
                swatch.className = `bdb-swatch ${blk.color === preset.value ? 'active' : ''}`;
                swatch.style.backgroundColor = preset.value;
                swatch.addEventListener('click', () => {
                    updateProperty(() => {
                        blk.color = preset.value;
                        colorHex.value = preset.value;
                        colorGroup.querySelectorAll('.bdb-swatch').forEach(s => s.classList.remove('active'));
                        swatch.classList.add('active');
                        
                        const blockDiv = htmlLayerEl.querySelector(`[data-id="${blk.id}"]`);
                        if (blockDiv) blockDiv.style.backgroundColor = preset.value;
                        
                        this.saveHistory();
                        this.renderDiagram();
                    });
                });
                swatchesArea.appendChild(swatch);
            });

            const colorHex = colorGroup.querySelector('#prop-block-color-hex');
            colorHex.addEventListener('change', (e) => {
                updateProperty(() => {
                    let color = e.target.value.trim();
                    if (!color.startsWith('#')) color = '#' + color;
                    if (/^#[0-9A-F]{6}$/i.test(color)) {
                        blk.color = color;
                        const blockDiv = htmlLayerEl.querySelector(`[data-id="${blk.id}"]`);
                        if (blockDiv) blockDiv.style.backgroundColor = color;
                        this.saveHistory();
                        this.renderDiagram();
                    } else {
                        this.showAlert('Invalid hex code format (e.g. #ffffff)');
                    }
                });
            });

            // Block Size (Width, Height)
            const sizeGroup = document.createElement('div');
            sizeGroup.className = 'bdb-prop-group';
            sizeGroup.innerHTML = `
                <label class="bdb-label">Width (${blk.width}px)</label>
                <input type="range" class="bdb-input" id="prop-block-width" min="60" max="400" value="${blk.width}">
                <label class="bdb-label">Height (${blk.height}px)</label>
                <input type="range" class="bdb-input" id="prop-block-height" min="40" max="300" value="${blk.height}">
            `;
            parent.appendChild(sizeGroup);

            const wInput = sizeGroup.querySelector('#prop-block-width');
            wInput.addEventListener('input', (e) => {
                updateProperty(() => {
                    blk.width = parseInt(e.target.value);
                    const blockDiv = htmlLayerEl.querySelector(`[data-id="${blk.id}"]`);
                    if (blockDiv) blockDiv.style.width = `${blk.width}px`;
                    sizeGroup.querySelector('label:first-child').innerText = `Width (${blk.width}px)`;
                    this.renderDiagram();
                });
            });
            wInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            const hInput = sizeGroup.querySelector('#prop-block-height');
            hInput.addEventListener('input', (e) => {
                updateProperty(() => {
                    blk.height = parseInt(e.target.value);
                    const blockDiv = htmlLayerEl.querySelector(`[data-id="${blk.id}"]`);
                    if (blockDiv) blockDiv.style.height = `${blk.height}px`;
                    sizeGroup.querySelector('label:nth-child(3)').innerText = `Height (${blk.height}px)`;
                    this.renderDiagram();
                });
            });
            hInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            // Border Style
            const borderGroup = document.createElement('div');
            borderGroup.className = 'bdb-prop-group';
            borderGroup.innerHTML = `
                <label class="bdb-label">Border Style</label>
                <select class="bdb-select" id="prop-border-style" style="width:100%;">
                    <option value="solid" ${blk.borderStyle === 'solid' ? 'selected' : ''}>Solid</option>
                    <option value="dashed" ${blk.borderStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                    <option value="double" ${blk.borderStyle === 'double' ? 'selected' : ''}>Double</option>
                </select>
            `;
            parent.appendChild(borderGroup);

            borderGroup.querySelector('#prop-border-style').addEventListener('change', (e) => {
                updateProperty(() => {
                    blk.borderStyle = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Pins Configuration for each side
            const pinsGroup = document.createElement('div');
            pinsGroup.className = 'bdb-prop-group';
            pinsGroup.innerHTML = `<h4>Sides & Pins Configuration</h4>`;
            
            ['top', 'right', 'bottom', 'left'].forEach(side => {
                const sideDef = blk.sides[side] || { label: '', pinCount: 0, pins: [] };
                const acc = document.createElement('div');
                acc.className = 'bdb-side-accordion' + (blk._expandedSide === side ? ' expanded' : '');
                acc.innerHTML = `
                    <div class="bdb-side-header">
                        <span>Side: ${side} (${sideDef.pinCount} pins)</span>
                        <span>▼</span>
                    </div>
                    <div class="bdb-side-body">
                        <label class="bdb-label">Side Label</label>
                        <input type="text" class="bdb-input side-label" value="${sideDef.label || ''}">
                        <label class="bdb-label">Pin Count (0-16)</label>
                        <input type="number" class="bdb-input pin-count" min="0" max="16" value="${sideDef.pinCount}">
                        <div class="pins-list-area"></div>
                    </div>
                `;

                // Accordion logic
                acc.querySelector('.bdb-side-header').addEventListener('click', () => {
                    const isExpanded = acc.classList.contains('expanded');
                    parent.querySelectorAll('.bdb-side-accordion').forEach(a => a.classList.remove('expanded'));
                    if (!isExpanded) {
                        acc.classList.add('expanded');
                        blk._expandedSide = side;
                    } else {
                        blk._expandedSide = null;
                    }
                });

                // Inputs change logic
                const countInput = acc.querySelector('.pin-count');
                const listArea = acc.querySelector('.pins-list-area');
                const sLabelInput = acc.querySelector('.side-label');

                sLabelInput.addEventListener('input', (e) => {
                    updateProperty(() => {
                        sideDef.label = e.target.value;
                        this.renderDiagram();
                    });
                });
                sLabelInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

                const updatePinsList = () => {
                    listArea.innerHTML = '';
                    const count = parseInt(countInput.value) || 0;
                    
                    // Adjust sideDef pins array size
                    sideDef.pinCount = Math.min(16, Math.max(0, count));
                    while (sideDef.pins.length < sideDef.pinCount) {
                        sideDef.pins.push({ name: `Pin ${sideDef.pins.length + 1}`, direction: 'input' });
                    }
                    if (sideDef.pins.length > sideDef.pinCount) {
                        sideDef.pins = sideDef.pins.slice(0, sideDef.pinCount);
                    }

                    // Render list inputs
                    for (let i = 0; i < sideDef.pinCount; i++) {
                        const pin = sideDef.pins[i];
                        const row = document.createElement('div');
                        row.className = 'bdb-pin-row';
                        row.innerHTML = `
                            <input type="text" value="${pin.name}" placeholder="Pin name">
                        `;

                        // Edit name
                        row.querySelector('input').addEventListener('input', (evt) => {
                            updateProperty(() => {
                                pin.name = evt.target.value;
                                this.renderDiagram();
                            });
                        });
                        row.querySelector('input').addEventListener('change', () => updateProperty(() => this.saveHistory()));

                        listArea.appendChild(row);
                    }
                };

                countInput.addEventListener('input', () => {
                    updateProperty(() => {
                        updatePinsList();
                        this.renderDiagram();
                    });
                });
                countInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

                updatePinsList();
                pinsGroup.appendChild(acc);
            });

            parent.appendChild(pinsGroup);

            // Save to Library Button
            const libGroup = document.createElement('div');
            libGroup.className = 'bdb-prop-group';
            libGroup.style.marginTop = '1rem';
            libGroup.innerHTML = `
                <button class="bdb-btn" id="prop-save-to-lib" style="width: 100%; justify-content: center; background-color: #000000; color: #ffffff;">Save to Library</button>
            `;
            parent.appendChild(libGroup);

            libGroup.querySelector('#prop-save-to-lib').addEventListener('click', () => {
                this.showPrompt("Enter a template name for this block in the library:", blk.name, (customName) => {
                    if (customName) {
                        const blockTemplate = {
                            id: 'cb_' + Date.now(),
                            name: customName,
                            width: blk.width,
                            height: blk.height,
                            color: blk.color || '#ffffff',
                            borderStyle: blk.borderStyle || 'solid',
                            fontFamily: blk.fontFamily || 'sans-serif',
                            sides: JSON.parse(JSON.stringify(blk.sides))
                        };
                        dbService.saveCustomBlock(blockTemplate).then(() => {
                            this.showAlert('Block saved to Custom Library!');
                            this.loadCustomLibraryDropdown();
                        }).catch(err => {
                            console.error(err);
                            this.showAlert('Failed to save block to library: ' + err.message);
                        });
                    }
                });
            });
        },

        buildConnectionProperties(parent, conn) {
            // Label
            const lblGroup = document.createElement('div');
            lblGroup.className = 'bdb-prop-group';
            lblGroup.innerHTML = `
                <label class="bdb-label">Connection Label</label>
                <input type="text" class="bdb-input" id="prop-conn-label" value="${conn.label || ''}">
            `;
            parent.appendChild(lblGroup);

            const lblInput = lblGroup.querySelector('#prop-conn-label');
            lblInput.addEventListener('input', (e) => {
                updateProperty(() => {
                    conn.label = e.target.value;
                    this.renderDiagram();
                });
            });
            lblInput.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            // Style (Solid / Dashed / Dotted / Bus)
            const styleGroup = document.createElement('div');
            styleGroup.className = 'bdb-prop-group';
            styleGroup.innerHTML = `
                <label class="bdb-label">Line Style</label>
                <select class="bdb-select" id="prop-conn-style" style="width:100%;">
                    <option value="solid" ${conn.style === 'solid' ? 'selected' : ''}>Solid</option>
                    <option value="dashed" ${conn.style === 'dashed' ? 'selected' : ''}>Dashed</option>
                    <option value="dotted" ${conn.style === 'dotted' ? 'selected' : ''}>Dotted</option>
                    <option value="bus" ${conn.style === 'bus' ? 'selected' : ''}>Bus Line</option>
                </select>
            `;
            parent.appendChild(styleGroup);

            styleGroup.querySelector('#prop-conn-style').addEventListener('change', (e) => {
                updateProperty(() => {
                    conn.style = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Routing Style
            const routingGroup = document.createElement('div');
            routingGroup.className = 'bdb-prop-group';
            routingGroup.innerHTML = `
                <label class="bdb-label">Routing Style</label>
                <select class="bdb-select" id="prop-conn-routing" style="width:100%;">
                    <option value="orthogonal" ${conn.routing === 'orthogonal' || !conn.routing ? 'selected' : ''}>Orthogonal</option>
                    <option value="curved" ${conn.routing === 'curved' ? 'selected' : ''}>Curved (Smooth)</option>
                    <option value="direct" ${conn.routing === 'direct' ? 'selected' : ''}>Direct Line</option>
                </select>
            `;
            parent.appendChild(routingGroup);

            routingGroup.querySelector('#prop-conn-routing').addEventListener('change', (e) => {
                updateProperty(() => {
                    conn.routing = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Arrowheads
            const arrowGroup = document.createElement('div');
            arrowGroup.className = 'bdb-prop-group';
            arrowGroup.innerHTML = `
                <label class="bdb-label">Arrowhead</label>
                <select class="bdb-select" id="prop-conn-arrow" style="width:100%;">
                    <option value="none" ${conn.arrowhead === 'none' ? 'selected' : ''}>None</option>
                    <option value="forward" ${conn.arrowhead === 'forward' ? 'selected' : ''}>Forward</option>
                    <option value="backward" ${conn.arrowhead === 'backward' ? 'selected' : ''}>Backward</option>
                    <option value="bidirectional" ${conn.arrowhead === 'bidirectional' ? 'selected' : ''}>Bidirectional</option>
                </select>
            `;
            parent.appendChild(arrowGroup);

            arrowGroup.querySelector('#prop-conn-arrow').addEventListener('change', (e) => {
                updateProperty(() => {
                    conn.arrowhead = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Color Overrides
            const colorGroup = document.createElement('div');
            colorGroup.className = 'bdb-prop-group';
            colorGroup.innerHTML = `
                <label class="bdb-label">Custom Color Override</label>
                <input type="text" class="bdb-input" id="prop-conn-color" value="${conn.color || ''}" placeholder="Default (Inherits Source)">
            `;
            parent.appendChild(colorGroup);

            const colorInput = colorGroup.querySelector('#prop-conn-color');
            colorInput.addEventListener('change', (e) => {
                updateProperty(() => {
                    const color = e.target.value.trim();
                    if (color === '' || /^#[0-9A-F]{6}$/i.test(color)) {
                        conn.color = color || null;
                        this.saveHistory();
                        this.renderDiagram();
                    } else {
                        this.showAlert('Invalid hex code format (e.g. #000000)');
                    }
                });
            });
        },

        buildLabelProperties(parent, label) {
            const textGroup = document.createElement('div');
            textGroup.className = 'bdb-prop-group';
            textGroup.innerHTML = `
                <label class="bdb-label">Label Text</label>
                <textarea class="bdb-input" id="prop-label-text" rows="3">${label.text || ''}</textarea>
                <div style="font-size:0.65rem; color:#666; margin-top:0.25rem; line-height:1.4;">
                    Format subscripts: <b>V_in</b>, <b>V_{sub}</b><br>
                    Bold: <b>**text**</b> | Italic: <b>*text*</b>
                </div>
            `;
            parent.appendChild(textGroup);

            const textarea = textGroup.querySelector('#prop-label-text');
            textarea.addEventListener('input', (e) => {
                updateProperty(() => {
                    label.text = e.target.value;
                    this.renderDiagram();
                });
            });
            textarea.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            // Font Family Selector
            const fontGroup = document.createElement('div');
            fontGroup.className = 'bdb-prop-group';
            fontGroup.innerHTML = `
                <label class="bdb-label">Font Style</label>
                <select class="bdb-select" id="prop-label-font" style="width:100%;">
                    <option value="sans-serif" ${label.fontFamily === 'sans-serif' ? 'selected' : ''}>Sans-Serif</option>
                    <option value="'Times New Roman', Times, serif" ${label.fontFamily === "'Times New Roman', Times, serif" ? 'selected' : ''}>Times New Roman</option>
                    <option value="monospace" ${label.fontFamily === 'monospace' ? 'selected' : ''}>Monospace</option>
                </select>
            `;
            parent.appendChild(fontGroup);

            fontGroup.querySelector('#prop-label-font').addEventListener('change', (e) => {
                updateProperty(() => {
                    label.fontFamily = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });
        },

        buildStickyProperties(parent, note) {
            const textGroup = document.createElement('div');
            textGroup.className = 'bdb-prop-group';
            textGroup.innerHTML = `
                <label class="bdb-label">Sticky Note Text</label>
                <textarea class="bdb-input" id="prop-note-text" rows="4">${note.text || ''}</textarea>
            `;
            parent.appendChild(textGroup);

            const textarea = textGroup.querySelector('#prop-note-text');
            textarea.addEventListener('input', (e) => {
                updateProperty(() => {
                    note.text = e.target.value;
                    // Sync with notes textbox rendered on canvas
                    const cardText = htmlLayerEl.querySelector(`[data-id="${note.id}"] .bdb-sticky-note-text`);
                    if (cardText) cardText.value = note.text;
                });
            });
            textarea.addEventListener('change', () => updateProperty(() => this.saveHistory()));

            // Font Family Selector
            const fontGroup = document.createElement('div');
            fontGroup.className = 'bdb-prop-group';
            fontGroup.innerHTML = `
                <label class="bdb-label">Font Style</label>
                <select class="bdb-select" id="prop-note-font" style="width:100%;">
                    <option value="sans-serif" ${note.fontFamily === 'sans-serif' ? 'selected' : ''}>Sans-Serif</option>
                    <option value="'Times New Roman', Times, serif" ${note.fontFamily === "'Times New Roman', Times, serif" ? 'selected' : ''}>Times New Roman</option>
                    <option value="monospace" ${note.fontFamily === 'monospace' ? 'selected' : ''}>Monospace</option>
                </select>
            `;
            parent.appendChild(fontGroup);

            fontGroup.querySelector('#prop-note-font').addEventListener('change', (e) => {
                updateProperty(() => {
                    note.fontFamily = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Background color
            const colorGroup = document.createElement('div');
            colorGroup.className = 'bdb-prop-group';
            colorGroup.innerHTML = `
                <label class="bdb-label">Background Color</label>
                <div class="bdb-swatches" id="prop-note-swatches"></div>
            `;
            parent.appendChild(colorGroup);

            const swatches = colorGroup.querySelector('#prop-note-swatches');
            const notePresets = [
                { name: 'Yellow', value: '#fef08a' },
                { name: 'Pink', value: '#fbcfe8' },
                { name: 'Blue', value: '#bfdbfe' },
                { name: 'Green', value: '#bbf7d0' }
            ];

            notePresets.forEach(preset => {
                const swatch = document.createElement('div');
                swatch.className = `bdb-swatch ${note.color === preset.value ? 'active' : ''}`;
                swatch.style.backgroundColor = preset.value;
                swatch.addEventListener('click', () => {
                    updateProperty(() => {
                        note.color = preset.value;
                        colorGroup.querySelectorAll('.bdb-swatch').forEach(s => s.classList.remove('active'));
                        swatch.classList.add('active');
                        
                        const card = htmlLayerEl.querySelector(`[data-id="${note.id}"]`);
                        if (card) card.style.backgroundColor = preset.value;
                        this.saveHistory();
                    });
                });
                swatches.appendChild(swatch);
            });
        },

        buildArrowProperties(parent, arrow) {
            // Style
            const styleGroup = document.createElement('div');
            styleGroup.className = 'bdb-prop-group';
            styleGroup.innerHTML = `
                <label class="bdb-label">Arrow Style</label>
                <select class="bdb-select" id="prop-arrow-style" style="width:100%;">
                    <option value="solid" ${arrow.style === 'solid' ? 'selected' : ''}>Solid</option>
                    <option value="dashed" ${arrow.style === 'dashed' ? 'selected' : ''}>Dashed</option>
                    <option value="dotted" ${arrow.style === 'dotted' ? 'selected' : ''}>Dotted</option>
                </select>
            `;
            parent.appendChild(styleGroup);

            styleGroup.querySelector('#prop-arrow-style').addEventListener('change', (e) => {
                updateProperty(() => {
                    arrow.style = e.target.value;
                    this.saveHistory();
                    this.renderDiagram();
                });
            });

            // Size (Thickness) with Slider + Input side-by-side
            const sizeGroup = document.createElement('div');
            sizeGroup.className = 'bdb-prop-group';
            sizeGroup.innerHTML = `
                <label class="bdb-label">Arrow Size (Thickness)</label>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="range" id="prop-arrow-size-slider" min="1" max="10" step="1" value="${arrow.size || 2}" style="flex:1;">
                    <input type="number" id="prop-arrow-size-num" min="1" max="10" value="${arrow.size || 2}" style="width:50px;" class="bdb-input">
                </div>
            `;
            parent.appendChild(sizeGroup);

            const slider = sizeGroup.querySelector('#prop-arrow-size-slider');
            const numInput = sizeGroup.querySelector('#prop-arrow-size-num');

            const updateSize = (newVal) => {
                let val = parseInt(newVal, 10);
                if (isNaN(val) || val < 1) val = 1;
                if (val > 10) val = 10;
                
                slider.value = val;
                numInput.value = val;
                
                updateProperty(() => {
                    arrow.size = val;
                    this.saveHistory();
                    this.renderDiagram();
                });
            };

            slider.addEventListener('input', (e) => updateSize(e.target.value));
            numInput.addEventListener('input', (e) => updateSize(e.target.value));

            // Color
            const colorGroup = document.createElement('div');
            colorGroup.className = 'bdb-prop-group';
            colorGroup.innerHTML = `
                <label class="bdb-label">Color</label>
                <input type="text" class="bdb-input" id="prop-arrow-color" value="${arrow.color || '#000000'}">
            `;
            parent.appendChild(colorGroup);

            colorGroup.querySelector('#prop-arrow-color').addEventListener('change', (e) => {
                updateProperty(() => {
                    arrow.color = e.target.value.trim();
                    this.saveHistory();
                    this.renderDiagram();
                });
            });
        },

        // --- Multi-Block Group Actions ---
        groupSelection() {
            const blockIds = state.blocks.filter(b => selectedIds.includes(b.id)).map(b => b.id);
            if (blockIds.length <= 1) return;

            // Remove selected blocks from any existing group first
            state.groups.forEach(grp => {
                grp.blockIds = grp.blockIds.filter(id => !blockIds.includes(id));
            });
            // Prune empty groups
            state.groups = state.groups.filter(grp => grp.blockIds.length > 0);

            const groupId = 'group_' + Date.now();
            const grp = {
                id: groupId,
                name: `Group ${state.groups.length + 1}`,
                blockIds: blockIds,
                collapsed: false,
                x: 0, y: 0, width: 100, height: 100
            };

            this.recalculateGroupBounds(grp);
            state.groups.push(grp);
            
            selectedIds = [groupId];
            this.saveHistory();
            this.renderDiagram();
        },

        ungroupSelection() {
            // Find if a group is selected
            const activeGroupIds = state.groups.filter(g => selectedIds.includes(g.id)).map(g => g.id);
            if (activeGroupIds.length === 0) return;

            state.groups = state.groups.filter(grp => !activeGroupIds.includes(grp.id));
            selectedIds = [];
            this.saveHistory();
            this.renderDiagram();
        },

        duplicateBlock(blockId) {
            const blk = state.blocks.find(b => b.id === blockId);
            if (!blk) return;

            // Deep clone properties but generate new ID and shift coordinates offset
            const dup = JSON.parse(JSON.stringify(blk));
            dup.id = 'block_' + Date.now();
            dup.name = blk.name + " Copy";
            dup.x += 40;
            dup.y += 40;

            state.blocks.push(dup);
            this.saveHistory();
            this.renderDiagram();
            this.selectElements([dup.id]);
        },

        deleteElements(ids) {
            if (ids.length === 0) return;

            // Delete blocks
            state.blocks = state.blocks.filter(b => !ids.includes(b.id));

            // Delete annotations
            state.annotations = state.annotations.filter(a => !ids.includes(a.id));

            // Delete connections referencing these blocks, or connections directly deleted
            state.connections = state.connections.filter(c => {
                if (ids.includes(c.id)) return false;
                if (ids.includes(c.sourceBlockId) || ids.includes(c.targetBlockId)) return false;
                return true;
            });

            // Delete groups or remove members
            state.groups = state.groups.filter(grp => {
                if (ids.includes(grp.id)) return false;
                
                // Keep group but prune deleted blocks
                grp.blockIds = grp.blockIds.filter(bid => !ids.includes(bid));
                return grp.blockIds.length > 0;
            });

            selectedIds = [];
            this.saveHistory();
            this.renderDiagram();
            this.closePropertiesPanel();
        },

        // --- File & IndexedDB Actions ---
        async handleJSONImport(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    if (parsed.blocks && parsed.connections) {
                        state = parsed;
                        selectedIds = [];
                        this.renderDiagram();
                        
                        camera.scale = 1.0;
                        camera.panX = 0;
                        camera.panY = 0;
                        this.updateCanvasTransform();

                        this.saveHistory();
                        this.showToast('Diagram imported successfully!');
                    } else {
                        throw new Error('Invalid schema format');
                    }
                } catch(err) {
                    this.showAlert('Error parsing JSON diagram file: ' + err.message);
                }
            };
            reader.readAsText(file);
        },

        handleJSONExport() {
            const jsonStr = JSON.stringify(state, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `diagram_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        handlePNGExport() {
            // Find overall diagram bounds
            if (state.blocks.length === 0 && state.annotations.length === 0) {
                this.showAlert('Diagram is empty. Cannot export.');
                return;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            // Collect bounding boxes
            state.blocks.forEach(b => {
                minX = Math.min(minX, b.x);
                minY = Math.min(minY, b.y);
                maxX = Math.max(maxX, b.x + b.width);
                maxY = Math.max(maxY, b.y + b.height);
            });
            state.annotations.forEach(a => {
                if (a.type === 'arrow') {
                    minX = Math.min(minX, a.x1, a.x2);
                    minY = Math.min(minY, a.y1, a.y2);
                    maxX = Math.max(maxX, a.x1, a.x2);
                    maxY = Math.max(maxY, a.y1, a.y2);
                } else if (a.type === 'note') {
                    minX = Math.min(minX, a.x);
                    minY = Math.min(minY, a.y);
                    maxX = Math.max(maxX, a.x + 140);
                    maxY = Math.max(maxY, a.y + (a.height || 120));
                } else {
                    minX = Math.min(minX, a.x);
                    minY = Math.min(minY, a.y);
                    maxX = Math.max(maxX, a.x + 150);
                    maxY = Math.max(maxY, a.y + 100);
                }
            });

            // Pad
            minX = Math.max(0, minX - 40);
            minY = Math.max(0, minY - 40);
            maxX = maxX + 40;
            maxY = maxY + 40;

            const width = maxX - minX;
            const height = maxY - minY;

            // Render to high-res temporary 2D Canvas
            const canvas = document.createElement('canvas');
            const dpr = 2.0; // High res pixel density
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            // Shift context to bounds
            ctx.translate(-minX, -minY);            const themeName = state.theme || 'default';
            const theme = THEMES[themeName] || THEMES.default;

            // Fill background based on theme
            ctx.fillStyle = theme.canvasBg;
            ctx.fillRect(minX, minY, width, height);

            // 1. Draw Groups
            state.groups.forEach(grp => {
                ctx.strokeStyle = theme.lineColor;
                ctx.lineWidth = grp.collapsed ? theme.blockLineWidth : 1.5;
                ctx.setLineDash([6, 6]);
                ctx.strokeRect(grp.x, grp.y, grp.width, grp.height);
                
                // Group Name
                ctx.fillStyle = theme.fontColor;
                ctx.font = `bold 9px ${theme.fontFamily}`;
                ctx.fillText(`GROUP: ${grp.name}`, grp.x + 8, grp.y + 15);
            });
            ctx.setLineDash([]); // Reset line dash

            // 2. Draw Connection Lines
            state.connections.forEach(conn => {
                const startPt = this.getPinAbsoluteCoords(conn.sourceBlockId, conn.sourceSide, conn.sourcePinIdx);
                const endPt = this.getPinAbsoluteCoords(conn.targetBlockId, conn.targetSide, conn.targetPinIdx);

                if (!startPt || !endPt) return;

                ctx.strokeStyle = conn.color || theme.lineColor;
                const baseThickness = conn.style === 'bus' ? 5.5 : 2.5;
                ctx.lineWidth = baseThickness;

                if (conn.style === 'dashed') {
                    ctx.setLineDash([6, 6]);
                } else if (conn.style === 'dotted') {
                    ctx.setLineDash([2, 3]);
                } else {
                    ctx.setLineDash([]);
                }

                let midX, midY, angle;

                if (conn.routing === 'direct') {
                    const p1 = startPt.coords;
                    const p2 = endPt.coords;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();

                    midX = (p1.x + p2.x) / 2;
                    midY = (p1.y + p2.y) / 2;
                    angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                } else if (conn.routing === 'curved') {
                    const p1 = startPt.coords;
                    const p2 = endPt.coords;
                    const dx = Math.abs(p2.x - p1.x);
                    const dy = Math.abs(p2.y - p1.y);
                    const dist = Math.max(40, Math.min(120, Math.max(dx, dy) * 0.5));
                    
                    let cp1x = p1.x;
                    let cp1y = p1.y;
                    if (startPt.side === 'left') cp1x -= dist;
                    else if (startPt.side === 'right') cp1x += dist;
                    else if (startPt.side === 'top') cp1y -= dist;
                    else if (startPt.side === 'bottom') cp1y += dist;
                    
                    let cp2x = p2.x;
                    let cp2y = p2.y;
                    if (endPt.side === 'left') cp2x -= dist;
                    else if (endPt.side === 'right') cp2x += dist;
                    else if (endPt.side === 'top') cp2y -= dist;
                    else if (endPt.side === 'bottom') cp2y += dist;

                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
                    ctx.stroke();

                    midX = 0.125 * p1.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * p2.x;
                    midY = 0.125 * p1.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * p2.y;
                    angle = Math.atan2(p2.y - cp2y, p2.x - cp2x);
                } else {
                    // Orthogonal
                    const oPts = computeOrthogonalPoints(startPt.coords, startPt.side, endPt.coords, endPt.side);
                    ctx.beginPath();
                    ctx.moveTo(oPts[0].x, oPts[0].y);
                    for (let i = 1; i < oPts.length; i++) {
                        ctx.lineTo(oPts[i].x, oPts[i].y);
                    }
                    ctx.stroke();

                    const midIdx = Math.floor(oPts.length / 2);
                    const ptA = oPts[midIdx - 1];
                    const ptB = oPts[midIdx];
                    midX = (ptA.x + ptB.x) / 2;
                    midY = (ptA.y + ptB.y) / 2;
                    angle = Math.atan2(ptB.y - ptA.y, ptB.x - ptA.x);
                }
                ctx.setLineDash([]); // Reset

                // Draw end arrow head manually
                if (conn.arrowhead === 'forward' || conn.arrowhead === 'bidirectional') {
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.save();
                    ctx.translate(endPt.coords.x, endPt.coords.y);
                    ctx.rotate(angle);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-8, -4);
                    ctx.lineTo(-8, 4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                if (conn.arrowhead === 'backward' || conn.arrowhead === 'bidirectional') {
                    let startAngle = angle;
                    if (conn.routing === 'curved') {
                        const p1 = startPt.coords;
                        const p2 = endPt.coords;
                        const dx = Math.abs(p2.x - p1.x);
                        const dy = Math.abs(p2.y - p1.y);
                        const dist = Math.max(40, Math.min(120, Math.max(dx, dy) * 0.5));
                        let cp1x = p1.x;
                        let cp1y = p1.y;
                        if (startPt.side === 'left') cp1x -= dist;
                        else if (startPt.side === 'right') cp1x += dist;
                        else if (startPt.side === 'top') cp1y -= dist;
                        else if (startPt.side === 'bottom') cp1y += dist;
                        startAngle = Math.atan2(cp1y - p1.y, cp1x - p1.x);
                    } else if (conn.routing === 'direct') {
                        startAngle = Math.atan2(endPt.coords.y - startPt.coords.y, endPt.coords.x - startPt.coords.x);
                    } else {
                        const oPts = computeOrthogonalPoints(startPt.coords, startPt.side, endPt.coords, endPt.side);
                        startAngle = Math.atan2(oPts[1].y - oPts[0].y, oPts[1].x - oPts[0].x);
                    }

                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.save();
                    ctx.translate(startPt.coords.x, startPt.coords.y);
                    ctx.rotate(startAngle);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(8, -4);
                    ctx.lineTo(8, 4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }

                // Draw text label overlay at midpoint segment
                if (conn.label) {
                    ctx.font = `bold 8px ${theme.fontFamily}`;
                    const textWidth = ctx.measureText(conn.label).width;

                    ctx.fillStyle = theme.canvasBg;
                    ctx.strokeStyle = ctx.strokeStyle;
                    ctx.lineWidth = 1;
                    ctx.fillRect(midX - textWidth / 2 - 3, midY - 6, textWidth + 6, 12);
                    ctx.strokeRect(midX - textWidth / 2 - 3, midY - 6, textWidth + 6, 12);

                    ctx.fillStyle = theme.fontColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(conn.label, midX, midY);
                }
            });

            // 3. Draw Blocks
            state.blocks.forEach(blk => {
                const parentGroup = state.groups.find(g => g.blockIds.includes(blk.id));
                if (parentGroup && parentGroup.collapsed) return;

                // Draw box
                const blkBg = theme.blockBg === '#1e3a8a' ? 'rgba(30,58,138,0.8)' : (blk.color && blk.color !== '#ffffff' ? blk.color : theme.blockBg);
                ctx.fillStyle = blkBg;
                ctx.strokeStyle = theme.blockBorder;
                ctx.lineWidth = theme.blockLineWidth;
                
                // Shadow for retro theme
                if (theme.shadow) {
                    ctx.save();
                    ctx.fillStyle = theme.blockBorder;
                    ctx.fillRect(blk.x + 4, blk.y + 4, blk.width, blk.height);
                    ctx.restore();
                }
                
                if (blk.borderStyle === 'double') {
                    ctx.fillRect(blk.x, blk.y, blk.width, blk.height);
                    ctx.strokeRect(blk.x, blk.y, blk.width, blk.height);
                    ctx.strokeRect(blk.x + 3, blk.y + 3, blk.width - 6, blk.height - 6);
                } else if (blk.borderStyle === 'dashed') {
                    ctx.setLineDash([5, 5]);
                    ctx.fillRect(blk.x, blk.y, blk.width, blk.height);
                    ctx.strokeRect(blk.x, blk.y, blk.width, blk.height);
                    ctx.setLineDash([]);
                } else {
                    ctx.fillRect(blk.x, blk.y, blk.width, blk.height);
                    ctx.strokeRect(blk.x, blk.y, blk.width, blk.height);
                }

                // Text (Support multiline names & customized font family)
                ctx.fillStyle = theme.fontColor;
                let fontFamily = theme.fontFamily;
                if (blk.fontFamily) {
                    if (blk.fontFamily.toLowerCase().includes('sans')) fontFamily = 'sans-serif';
                    else if (blk.fontFamily.toLowerCase().includes('times') || blk.fontFamily.toLowerCase().includes('roman')) fontFamily = 'Times New Roman, serif';
                    else if (blk.fontFamily.toLowerCase().includes('mono')) fontFamily = 'monospace';
                }
                ctx.font = `bold 12px ${fontFamily}`;
                
                const lines = blk.name.toUpperCase().split('\n');
                const lineHeight = 14;
                const totalHeight = lines.length * lineHeight;
                let startY = blk.y + (blk.height - totalHeight) / 2 + lineHeight / 2;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                lines.forEach((line, idx) => {
                    ctx.fillText(line, blk.x + blk.width / 2, startY + idx * lineHeight);
                });

                // Draw side labels in PNG export
                const sides = ['top', 'right', 'bottom', 'left'];
                sides.forEach(side => {
                    const sideDef = blk.sides[side];
                    if (sideDef && sideDef.label && sideDef.pinCount > 0) {
                        ctx.fillStyle = '#4b5563';
                        ctx.font = 'bold 7.5px monospace';
                        ctx.save();
                        if (side === 'left') {
                            ctx.translate(blk.x + 8, blk.y + blk.height * 0.5);
                            ctx.rotate(-Math.PI / 2);
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(sideDef.label, 0, 0);
                        } else if (side === 'right') {
                            ctx.translate(blk.x + blk.width - 8, blk.y + blk.height * 0.5);
                            ctx.rotate(Math.PI / 2);
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(sideDef.label, 0, 0);
                        } else if (side === 'top') {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillText(sideDef.label, blk.x + blk.width * 0.5, blk.y + 4);
                        } else if (side === 'bottom') {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(sideDef.label, blk.x + blk.width * 0.5, blk.y + blk.height - 4);
                        }
                        ctx.restore();
                    }
                });

                // Draw pins (rectangular pins & internal pin names)
                sides.forEach(side => {
                    const sideDef = blk.sides[side];
                    if (!sideDef || sideDef.pinCount === 0) return;
                    for (let i = 0; i < sideDef.pinCount; i++) {
                        const pin = sideDef.pins[i];
                        const pinCoords = this.getPinAbsoluteCoords(blk.id, side, i);
                        if (pinCoords) {
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = 1.5;
                            ctx.fillStyle = '#ffffff';
                            
                            ctx.fillRect(pinCoords.coords.x - 4, pinCoords.coords.y - 4, 8, 8);
                            ctx.strokeRect(pinCoords.coords.x - 4, pinCoords.coords.y - 4, 8, 8);

                            ctx.fillStyle = '#1e293b';
                            ctx.font = 'bold 7.5px monospace';
                            if (side === 'left') {
                                ctx.textAlign = 'left';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(pin.name, blk.x + 18, pinCoords.coords.y);
                            } else if (side === 'right') {
                                ctx.textAlign = 'right';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(pin.name, blk.x + blk.width - 18, pinCoords.coords.y);
                            } else if (side === 'top') {
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'top';
                                ctx.fillText(pin.name, pinCoords.coords.x, blk.y + 18);
                            } else if (side === 'bottom') {
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillText(pin.name, pinCoords.coords.x, blk.y + blk.height - 18);
                            }
                        }
                    }
                });
            });

            // 4. Draw Annotations (Sticky notes & Labels)
            state.annotations.forEach(anno => {
                if (anno.type === 'note') {
                    ctx.save();
                    // Slight note rotation
                    ctx.translate(anno.x, anno.y);
                    ctx.rotate(-1 * Math.PI / 180);
                    
                    ctx.fillStyle = anno.color || '#fef08a';
                    ctx.strokeStyle = '#eab308';
                    ctx.lineWidth = 1;
                    
                    const noteHeight = anno.height || 120;
                    ctx.fillRect(0, 0, 140, noteHeight);
                    ctx.strokeRect(0, 0, 140, noteHeight);

                    // Text drawing (support customized font family)
                    ctx.fillStyle = '#000000';
                    let fontFamily = 'cursive, sans-serif';
                    if (anno.fontFamily) {
                        if (anno.fontFamily.toLowerCase().includes('sans')) fontFamily = 'sans-serif';
                        else if (anno.fontFamily.toLowerCase().includes('times') || anno.fontFamily.toLowerCase().includes('roman')) fontFamily = 'Times New Roman, serif';
                        else if (anno.fontFamily.toLowerCase().includes('mono')) fontFamily = 'monospace';
                    }
                    ctx.font = `9px ${fontFamily}`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    
                    // Text wrapping with newline support
                    const lines = anno.text.split('\n');
                    let yOffset = 8;
                    const maxWidth = 124;
                    const lineHeight = 11;
                    
                    lines.forEach(rawLine => {
                        const words = rawLine.split(' ');
                        let line = '';
                        for (let n = 0; n < words.length; n++) {
                            let testLine = line + words[n] + ' ';
                            let metrics = ctx.measureText(testLine);
                            if (metrics.width > maxWidth && n > 0) {
                                ctx.fillText(line, 8, yOffset);
                                line = words[n] + ' ';
                                yOffset += lineHeight;
                            } else {
                                line = testLine;
                            }
                        }
                        ctx.fillText(line, 8, yOffset);
                        yOffset += lineHeight;
                    });
                    ctx.restore();
                } else if (anno.type === 'label') {
                    ctx.fillStyle = '#000000';
                    let fontFamily = 'sans-serif';
                    if (anno.fontFamily) {
                        if (anno.fontFamily.toLowerCase().includes('sans')) fontFamily = 'sans-serif';
                        else if (anno.fontFamily.toLowerCase().includes('times') || anno.fontFamily.toLowerCase().includes('roman')) fontFamily = 'Times New Roman, serif';
                        else if (anno.fontFamily.toLowerCase().includes('mono')) fontFamily = 'monospace';
                    }
                    ctx.font = anno.bold ? `bold 12px ${fontFamily}` : `12px ${fontFamily}`;
                    if (anno.italic) ctx.font = 'italic ' + ctx.font;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    
                    // Format subscript for exporting manually
                    let text = anno.text;
                    let rx = anno.x;
                    let ry = anno.y;

                    // A very basic drawing of subscripts for PNG
                    if (text.includes('_')) {
                        const parts = text.split('_');
                        ctx.fillText(parts[0], rx, ry);
                        const width0 = ctx.measureText(parts[0]).width;
                        
                        ctx.font = `8px ${fontFamily}`;
                        ctx.fillText(parts[1].replace('{', '').replace('}', ''), rx + width0, ry + 4);
                    } else {
                        ctx.fillText(text, rx, ry);
                    }
                } else if (anno.type === 'arrow') {
                    // Draw arrows
                    ctx.strokeStyle = anno.color || '#000000';
                    ctx.lineWidth = anno.size || 2;
                    ctx.beginPath();
                    ctx.moveTo(anno.x1, anno.y1);
                    ctx.lineTo(anno.x2, anno.y2);
                    ctx.stroke();

                    // Arrow head scaled with stroke width
                    const dx = anno.x2 - anno.x1;
                    const dy = anno.y2 - anno.y1;
                    const angle = Math.atan2(dy, dx);
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.save();
                    ctx.translate(anno.x2, anno.y2);
                    ctx.rotate(angle);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    const arrowLen = 4 * (anno.size || 2);
                    const arrowHalfWidth = 2 * (anno.size || 2);
                    ctx.lineTo(-arrowLen, -arrowHalfWidth);
                    ctx.lineTo(-arrowLen, arrowHalfWidth);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            });

            // Convert to download link
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `block_diagram_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },

        // --- Minimap Drawing ---
        drawMinimap() {
            if (!minimapCanvasEl) return;
            const w = minimapCanvasEl.offsetWidth;
            const h = minimapCanvasEl.offsetHeight;
            minimapCanvasEl.width = w;
            minimapCanvasEl.height = h;

            const ctx = minimapCanvasEl.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            // Compute canvas bounds based on existing blocks
            let minX = 0, minY = 0, maxX = 1200, maxY = 800;
            if (state.blocks.length > 0) {
                state.blocks.forEach(b => {
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                });
            }

            // Pad
            minX -= 100; minY -= 100; maxX += 100; maxY += 100;
            const worldW = maxX - minX;
            const worldH = maxY - minY;

            const scaleX = w / worldW;
            const scaleY = h / worldH;
            const mapScale = Math.min(scaleX, scaleY);

            // Shift and scale
            ctx.save();
            ctx.scale(mapScale, mapScale);
            ctx.translate(-minX, -minY);

            // 1. Draw Blocks
            state.blocks.forEach(b => {
                ctx.fillStyle = b.color || '#cccccc';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.fillRect(b.x, b.y, b.width, b.height);
                ctx.strokeRect(b.x, b.y, b.width, b.height);
            });

            // 2. Draw Connections
            state.connections.forEach(conn => {
                const startPt = this.getPinAbsoluteCoords(conn.sourceBlockId, conn.sourceSide, conn.sourcePinIdx);
                const endPt = this.getPinAbsoluteCoords(conn.targetBlockId, conn.targetSide, conn.targetPinIdx);
                if (startPt && endPt) {
                    ctx.strokeStyle = conn.color || '#000000';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(startPt.coords.x, startPt.coords.y);
                    ctx.lineTo(endPt.coords.x, endPt.coords.y);
                    ctx.stroke();
                }
            });

            ctx.restore();

            // 3. Draw Viewport Indicator
            const viewport = document.getElementById('bdb-viewport');
            if (viewport) {
                const vRect = viewport.getBoundingClientRect();
                
                // Map viewport coordinates back to world space
                const viewportWorldX = -camera.panX / camera.scale;
                const viewportWorldY = -camera.panY / camera.scale;
                const viewportWorldW = vRect.width / camera.scale;
                const viewportWorldH = vRect.height / camera.scale;

                const indicatorX = (viewportWorldX - minX) * mapScale;
                const indicatorY = (viewportWorldY - minY) * mapScale;
                const indicatorW = viewportWorldW * mapScale;
                const indicatorH = viewportWorldH * mapScale;

                minimapViewportEl.style.left = `${indicatorX}px`;
                minimapViewportEl.style.top = `${indicatorY}px`;
                minimapViewportEl.style.width = `${indicatorW}px`;
                minimapViewportEl.style.height = `${indicatorH}px`;
            }
        },

        // --- Interaction Event Handlers ---
        initEvents() {
            const viewport = document.getElementById('bdb-viewport');
            
            // Global click away closes context menu and clears selection
            document.addEventListener('click', () => {
                const ctxMenu = document.getElementById('bdb-context-menu');
                if (ctxMenu) ctxMenu.style.display = 'none';
            });

            // Close properties
            document.getElementById('prop-panel-close').addEventListener('click', () => {
                this.closePropertiesPanel();
            });

            // Toolbar buttons
            document.getElementById('tb-add-block').addEventListener('click', () => this.addNewBlock());
            document.getElementById('tb-add-label').addEventListener('click', () => this.addNewLabel());
            document.getElementById('tb-add-note').addEventListener('click', () => this.addNewStickyNote());
            document.getElementById('tb-add-arrow').addEventListener('click', () => this.addNewArrow());

            document.getElementById('tb-undo').addEventListener('click', () => this.undo());
            document.getElementById('tb-redo').addEventListener('click', () => this.redo());
            document.getElementById('tb-clear').addEventListener('click', () => {
                this.showConfirm('Clear entire diagram?', () => {
                    state = { blocks: [], connections: [], annotations: [], groups: [] };
                    selectedIds = [];
                    this.saveHistory();
                    this.renderDiagram();
                    this.closePropertiesPanel();
                });
            });

            document.getElementById('tb-export-png').addEventListener('click', () => this.handlePNGExport());
            document.getElementById('tb-export-json').addEventListener('click', () => this.handleJSONExport());
            document.getElementById('tb-import-json').addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleJSONImport(e.target.files[0]);
                }
            });

            // Save Run button
            document.getElementById('tb-save').addEventListener('click', () => {
                if (window.appController && typeof window.appController.handleSave === 'function') {
                    window.appController.handleSave();
                }
            });

            // Align / Distribute selection dropdown
            document.getElementById('tb-align-select').addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'dist-h') {
                    this.distributeSelection('horizontal');
                } else if (val === 'dist-v') {
                    this.distributeSelection('vertical');
                } else {
                    this.alignSelection(val);
                }
                e.target.value = ''; // Reset selection dropdown
            });

            // Templates drop down
            document.getElementById('tb-template-select').addEventListener('change', (e) => {
                this.loadTemplateState(e.target.value);
                // Reset dropdown back to templates title
                e.target.value = '';
            });

            // Theme selection dropdown
            document.getElementById('tb-theme-select').addEventListener('change', (e) => {
                state.theme = e.target.value;
                const wrapper = document.querySelector('.bdb-wrapper');
                if (wrapper) {
                    wrapper.className = `bdb-wrapper theme-${state.theme}`;
                }
                this.saveHistory();
                this.renderDiagram();
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.deleteElements(selectedIds);
                } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    this.undo();
                } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    this.redo();
                } else if (e.key.toLowerCase() === 'm') {
                    e.preventDefault();
                    this.triggerMenuAtCursor();
                }
            });

            // Tool selector button handlers
            const btnToolSelect = document.getElementById('tb-tool-select');
            const btnToolPan = document.getElementById('tb-tool-pan');
            const btnToolLasso = document.getElementById('tb-tool-lasso');

            const setTool = (tool) => {
                activeTool = tool;
                [btnToolSelect, btnToolPan, btnToolLasso].forEach(btn => {
                    if (btn) btn.classList.remove('active');
                });
                if (tool === 'select' && btnToolSelect) btnToolSelect.classList.add('active');
                if (tool === 'pan' && btnToolPan) btnToolPan.classList.add('active');
                if (tool === 'lasso' && btnToolLasso) btnToolLasso.classList.add('active');

                // Adjust viewport cursor
                if (viewport) {
                    if (tool === 'pan') {
                        viewport.style.cursor = 'grab';
                    } else if (tool === 'lasso') {
                        viewport.style.cursor = 'crosshair';
                    } else {
                        viewport.style.cursor = 'default';
                    }
                }
            };

            if (btnToolSelect) btnToolSelect.addEventListener('click', () => setTool('select'));
            if (btnToolPan) btnToolPan.addEventListener('click', () => setTool('pan'));
            if (btnToolLasso) btnToolLasso.addEventListener('click', () => setTool('lasso'));

            // Hold Spacebar for temporary Pan tool
            let previousToolBeforeSpace = null;
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    if (activeTool !== 'pan' && !previousToolBeforeSpace) {
                        previousToolBeforeSpace = activeTool;
                        setTool('pan');
                    }
                }
            });
            document.addEventListener('keyup', (e) => {
                if (e.key === ' ' || e.code === 'Space') {
                    if (previousToolBeforeSpace) {
                        setTool(previousToolBeforeSpace);
                        previousToolBeforeSpace = null;
                    }
                }
            });

            // Context Menu Save to Library Action
            document.getElementById('ctx-save-to-lib').addEventListener('click', () => {
                if (selectedIds.length === 1) {
                    const blk = state.blocks.find(b => b.id === selectedIds[0]);
                    if (blk) {
                        this.showPrompt("Enter a template name for this block in the library:", blk.name, (customName) => {
                            if (customName) {
                                const blockTemplate = {
                                    id: 'cb_' + Date.now(),
                                    name: customName,
                                    width: blk.width,
                                    height: blk.height,
                                    color: blk.color || '#ffffff',
                                    borderStyle: blk.borderStyle || 'solid',
                                    fontFamily: blk.fontFamily || 'sans-serif',
                                    sides: JSON.parse(JSON.stringify(blk.sides))
                                };
                                dbService.saveCustomBlock(blockTemplate).then(() => {
                                    this.showAlert('Block saved to Custom Library!');
                                    this.loadCustomLibraryDropdown();
                                }).catch(err => this.showAlert('Error saving block: ' + err.message));
                            }
                        });
                    }
                }
            });

            // Custom Block Library dropdown
            const libSelect = document.getElementById('tb-library-select');
            if (libSelect) {
                libSelect.addEventListener('change', (e) => {
                    const val = e.target.value;
                    if (!val) return;
                    
                    if (val === 'save_current') {
                        if (selectedIds.length === 1) {
                            const blk = state.blocks.find(b => b.id === selectedIds[0]);
                            if (blk) {
                                this.showPrompt("Enter a template name for this block in the library:", blk.name, (customName) => {
                                    if (customName) {
                                        const blockTemplate = {
                                            id: 'cb_' + Date.now(),
                                            name: customName,
                                            width: blk.width,
                                            height: blk.height,
                                            color: blk.color || '#ffffff',
                                            borderStyle: blk.borderStyle || 'solid',
                                            fontFamily: blk.fontFamily || 'sans-serif',
                                            sides: JSON.parse(JSON.stringify(blk.sides))
                                        };
                                        dbService.saveCustomBlock(blockTemplate).then(() => {
                                            this.showAlert('Block saved to Custom Library!');
                                            this.loadCustomLibraryDropdown();
                                        }).catch(err => this.showAlert('Error saving block: ' + err.message));
                                    }
                                });
                            }
                        }
                        libSelect.value = "";
                    } else if (val.startsWith('place_')) {
                        const templateId = val.substring('place_'.length);
                        dbService.getCustomBlocks().then(blocks => {
                            const b = blocks.find(x => x.id === templateId);
                            if (b) {
                                const center = this.getViewportCenterCoords();
                                const newBlock = {
                                    id: 'block_' + Date.now(),
                                    name: b.name,
                                    width: b.width,
                                    height: b.height,
                                    color: b.color || '#ffffff',
                                    borderStyle: b.borderStyle || 'solid',
                                    fontFamily: b.fontFamily || 'sans-serif',
                                    x: center.x - (b.width / 2),
                                    y: center.y - (b.height / 2),
                                    sides: JSON.parse(JSON.stringify(b.sides))
                                };
                                const sides = ['top', 'right', 'bottom', 'left'];
                                sides.forEach(s => {
                                    if (newBlock.sides[s] && newBlock.sides[s].pins) {
                                        newBlock.sides[s].pins.forEach(p => {
                                            delete p.connected;
                                        });
                                    }
                                });
                                state.blocks.push(newBlock);
                                this.saveHistory();
                                this.renderDiagram();
                            }
                        });
                        libSelect.value = "";
                    } else if (val.startsWith('delete_')) {
                        const templateId = val.substring('delete_'.length);
                        this.showConfirm('Are you sure you want to delete this block template from the library?', () => {
                            dbService.deleteCustomBlock(templateId).then(() => {
                                this.showAlert('Block template deleted.');
                                this.loadCustomLibraryDropdown();
                            });
                        });
                        libSelect.value = "";
                    }
                });
            }

            // Context Menu Actions
            document.getElementById('ctx-duplicate').addEventListener('click', () => {
                if (selectedIds.length === 1) {
                    this.duplicateBlock(selectedIds[0]);
                }
            });
            document.getElementById('ctx-group').addEventListener('click', () => this.groupSelection());
            document.getElementById('ctx-ungroup').addEventListener('click', () => this.ungroupSelection());
            document.getElementById('ctx-delete').addEventListener('click', () => this.deleteElements(selectedIds));

            // --- Mouse Event Listeners for Canvas Navigation & Elements ---
            viewport.addEventListener('mousedown', (e) => {
                const target = e.target;
                
                // Track mouse position
                lastMousePos.clientX = e.clientX;
                lastMousePos.clientY = e.clientY;
                lastMousePos.target = e.target;

                // Hide context menu
                document.getElementById('bdb-context-menu').style.display = 'none';

                // Right click disabled (blocked) from showing custom context menu, now triggered via 'M' key
                if (e.button === 2) {
                    e.preventDefault();
                    return;
                }

                if (e.button !== 0) return; // Left click only

                const clientX = e.clientX;
                const clientY = e.clientY;
                
                // Convert mouse position to canvas coords
                const rect = viewport.getBoundingClientRect();
                const canvasX = (clientX - rect.left - camera.panX) / camera.scale;
                const canvasY = (clientY - rect.top - camera.panY) / camera.scale;

                // 1. Resizing check (resizing handle clicked)
                if (target.classList.contains('bdb-resize-handle')) {
                    const blockId = target.parentElement.getAttribute('data-id');
                    const handle = target.getAttribute('data-handle');
                    const block = state.blocks.find(b => b.id === blockId);
                    if (block) {
                        resizeState = {
                            blockId,
                            handle,
                            startWidth: block.width,
                            startHeight: block.height,
                            startX: block.x,
                            startY: block.y,
                            mouseX: clientX,
                            mouseY: clientY
                        };
                    }
                    return;
                }

                // 2. Standalone Arrow Handles
                if (target.classList.contains('bdb-arrow-handle')) {
                    const arrowId = target.getAttribute('data-arrow-id');
                    const handleType = target.getAttribute('data-handle-type');
                    activeArrowDraw = { arrowId, handle: handleType };
                    return;
                }

                // 3. Pin connection drawing
                if (target.classList.contains('bdb-pin')) {
                    const blockId = target.getAttribute('data-block-id');
                    const side = target.getAttribute('data-side');
                    const pinIdx = parseInt(target.getAttribute('data-pin-idx'));
                    
                    const blk = state.blocks.find(b => b.id === blockId);
                    const pin = blk.sides[side].pins[pinIdx];

                    // Mobile adaptation tap-to-connect logic
                    const isMobile = window.innerWidth <= 768;
                    if (isMobile) {
                        if (!tapStartPin) {
                            tapStartPin = { blockId, side, pinIdx, pin };
                            this.showToast(`Selected Pin: ${pin.name}. Tap target pin to connect.`);
                            target.style.transform = 'translate(-50%, -50%) scale(1.4)';
                        } else {
                            this.createConnection(tapStartPin, { blockId, side, pinIdx, pin });
                            tapStartPin = null;
                            this.renderDiagram();
                        }
                        return;
                    }

                    // Desktop drag-to-connect
                    dragStartPin = { blockId, side, pinIdx };
                    const pinCoords = this.getPinAbsoluteCoords(blockId, side, pinIdx);
                    dragLineCoords = {
                        x1: pinCoords.coords.x,
                        y1: pinCoords.coords.y,
                        x2: pinCoords.coords.x,
                        y2: pinCoords.coords.y
                    };
                    return;
                }

                // 4. Element Dragging (Blocks, Notes, Labels)
                const draggableEl = target.closest('.bdb-block, .bdb-sticky-note, .bdb-floating-label, .bdb-group-boundary, .bdb-group-collapsed-box');
                if (draggableEl) {
                    const dragId = draggableEl.getAttribute('data-id');
                    
                    // Handle selection
                    if (e.shiftKey) {
                        this.selectElements([dragId], true);
                    } else if (!selectedIds.includes(dragId)) {
                        this.selectElements([dragId]);
                    }

                    // Prepare dragging delta state for all selected items
                    const dragStartCoords = [];
                    selectedIds.forEach(id => {
                        const b = state.blocks.find(x => x.id === id);
                        const n = state.annotations.find(x => x.id === id && x.type === 'note');
                        const l = state.annotations.find(x => x.id === id && x.type === 'label');
                        const g = state.groups.find(x => x.id === id);
                        
                        if (b) dragStartCoords.push({ type: 'block', id, x: b.x, y: b.y, w: b.width, h: b.height });
                        if (n) dragStartCoords.push({ type: 'note', id, x: n.x, y: n.y, w: 140, h: n.height || 120 });
                        if (l) dragStartCoords.push({ type: 'label', id, x: l.x, y: l.y, w: 80, h: 20 });
                        if (g) {
                            dragStartCoords.push({ type: 'group', id, x: g.x, y: g.y, w: g.width, h: g.height });
                            // Also drag all blocks inside the group together
                            g.blockIds.forEach(bid => {
                                const gb = state.blocks.find(x => x.id === bid);
                                if (gb && !selectedIds.includes(bid)) {
                                    dragStartCoords.push({ type: 'block', id: bid, x: gb.x, y: gb.y, w: gb.width, h: gb.height });
                                }
                            });
                        }
                    });

                    dragBlockState = {
                        dragStartCoords,
                        mouseX: clientX,
                        mouseY: clientY
                    };
                    return;
                }

                // 4.5. Connection selection check
                if (target.classList.contains('bdb-connection-line')) {
                    const connId = target.getAttribute('data-id');
                    if (e.shiftKey) {
                        this.selectElements([connId], true);
                    } else {
                        this.selectElements([connId]);
                    }
                    return;
                }

                // 5. Drag multi-select drawing box or panning empty space
                if (target === viewport || target === canvasEl || target === svgOverlayEl || target.id === 'bdb-html-layer') {
                    if (activeTool === 'lasso') {
                        isLassoing = true;
                        lassoPoints = [{ x: canvasX, y: canvasY }];
                        const lassoPath = document.getElementById('bdb-lasso-path');
                        if (lassoPath) {
                            lassoPath.style.display = 'block';
                            lassoPath.setAttribute('d', `M ${canvasX} ${canvasY}`);
                        }
                    } else if (activeTool === 'pan' || (!e.shiftKey && activeTool === 'select')) {
                        // Pan canvas
                        isPanning = true;
                        panStart = { x: clientX - camera.panX, y: clientY - camera.panY };
                        viewport.classList.add('panning');
                    } else if (e.shiftKey && activeTool === 'select') {
                        // Multi drag-select
                        multiSelectActive = true;
                        dragSelectState = {
                            startX: canvasX,
                            startY: canvasY,
                            currentX: canvasX,
                            currentY: canvasY
                        };
                        dragSelectBoxEl.style.display = 'block';
                    }
                    
                    this.clearSelection();
                }
            });

            viewport.addEventListener('mousemove', (e) => {
                // Track mouse position
                lastMousePos.clientX = e.clientX;
                lastMousePos.clientY = e.clientY;
                lastMousePos.target = e.target;

                const clientX = e.clientX;
                const clientY = e.clientY;

                // Convert to canvas space
                const rect = viewport.getBoundingClientRect();
                const canvasX = (clientX - rect.left - camera.panX) / camera.scale;
                const canvasY = (clientY - rect.top - camera.panY) / camera.scale;

                // Handle Lasso drawing
                if (activeTool === 'lasso' && isLassoing) {
                    lassoPoints.push({ x: canvasX, y: canvasY });
                    const d = lassoPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                    const lassoPath = document.getElementById('bdb-lasso-path');
                    if (lassoPath) lassoPath.setAttribute('d', d);
                    return;
                }

                // Handle Camera Panning
                if (isPanning) {
                    camera.panX = clientX - panStart.x;
                    camera.panY = clientY - panStart.y;
                    this.updateCanvasTransform();
                    return;
                }

                // Handle Connection drawing line
                if (dragStartPin && dragLineCoords) {
                    dragLineCoords.x2 = canvasX;
                    dragLineCoords.y2 = canvasY;
                    this.drawDraggingLine();
                    return;
                }

                // Handle Resize block
                if (resizeState) {
                    const block = state.blocks.find(b => b.id === resizeState.blockId);
                    if (block) {
                        const dx = (clientX - resizeState.mouseX) / camera.scale;
                        const dy = (clientY - resizeState.mouseY) / camera.scale;

                        if (resizeState.handle.includes('right')) {
                            block.width = Math.min(2000 - block.x, Math.max(60, resizeState.startWidth + dx));
                        }
                        if (resizeState.handle.includes('bottom')) {
                            block.height = Math.min(1500 - block.y, Math.max(40, resizeState.startHeight + dy));
                        }
                        if (resizeState.handle.includes('left')) {
                            const rightEdge = resizeState.startX + resizeState.startWidth;
                            const targetX = Math.max(0, Math.min(rightEdge - 60, resizeState.startX + dx));
                            block.x = targetX;
                            block.width = rightEdge - targetX;
                        }
                        if (resizeState.handle.includes('top')) {
                            const bottomEdge = resizeState.startY + resizeState.startHeight;
                            const targetY = Math.max(0, Math.min(bottomEdge - 40, resizeState.startY + dy));
                            block.y = targetY;
                            block.height = bottomEdge - targetY;
                        }
                        
                        // Recalculate group boundaries if block belongs to group
                        state.groups.forEach(grp => {
                            if (grp.blockIds.includes(block.id)) {
                                this.recalculateGroupBounds(grp);
                            }
                        });

                        this.renderDiagram();
                    }
                    return;
                }

                // Handle Standalone Arrow handles dragging
                if (activeArrowDraw) {
                    const arrow = state.annotations.find(a => a.id === activeArrowDraw.arrowId && a.type === 'arrow');
                    if (arrow) {
                        const targetX = Math.max(0, Math.min(2000, canvasX));
                        const targetY = Math.max(0, Math.min(1500, canvasY));
                        if (activeArrowDraw.handle === 'start') {
                            arrow.x1 = targetX;
                            arrow.y1 = targetY;
                        } else {
                            arrow.x2 = targetX;
                            arrow.y2 = targetY;
                        }
                        this.renderDiagram();
                    }
                    return;
                }

                // Handle Multi Drag select drawing box
                if (multiSelectActive && dragSelectState) {
                    dragSelectState.currentX = canvasX;
                    dragSelectState.currentY = canvasY;

                    const left = Math.min(dragSelectState.startX, dragSelectState.currentX);
                    const top = Math.min(dragSelectState.startY, dragSelectState.currentY);
                    const width = Math.abs(dragSelectState.startX - dragSelectState.currentX);
                    const height = Math.abs(dragSelectState.startY - dragSelectState.currentY);

                    // Position inside viewport coordinates
                    dragSelectBoxEl.style.left = `${left * camera.scale + camera.panX}px`;
                    dragSelectBoxEl.style.top = `${top * camera.scale + camera.panY}px`;
                    dragSelectBoxEl.style.width = `${width * camera.scale}px`;
                    dragSelectBoxEl.style.height = `${height * camera.scale}px`;
                    return;
                }

                // Handle Block/Annotation dragging
                if (dragBlockState) {
                    const dx = (clientX - dragBlockState.mouseX) / camera.scale;
                    const dy = (clientY - dragBlockState.mouseY) / camera.scale;

                    let minX = Infinity, minY = Infinity;
                    let maxX = -Infinity, maxY = -Infinity;
                    dragBlockState.dragStartCoords.forEach(start => {
                        minX = Math.min(minX, start.x);
                        minY = Math.min(minY, start.y);
                        maxX = Math.max(maxX, start.x + (start.w || 0));
                        maxY = Math.max(maxY, start.y + (start.h || 0));
                    });

                    const clampedDx = (minX !== Infinity) ? Math.max(-minX, Math.min(2000 - maxX, dx)) : dx;
                    const clampedDy = (minY !== Infinity) ? Math.max(-minY, Math.min(1500 - maxY, dy)) : dy;

                    dragBlockState.dragStartCoords.forEach(start => {
                        if (start.type === 'block') {
                            const b = state.blocks.find(x => x.id === start.id);
                            if (b) { b.x = start.x + clampedDx; b.y = start.y + clampedDy; }
                        } else if (start.type === 'note') {
                            const n = state.annotations.find(x => x.id === start.id);
                            if (n) { n.x = start.x + clampedDx; n.y = start.y + clampedDy; }
                        } else if (start.type === 'label') {
                            const l = state.annotations.find(x => x.id === start.id);
                            if (l) { l.x = start.x + clampedDx; l.y = start.y + clampedDy; }
                        } else if (start.type === 'group') {
                            const g = state.groups.find(x => x.id === start.id);
                            if (g) { g.x = start.x + clampedDx; g.y = start.y + clampedDy; }
                        }
                    });

                    // Recalculate group boundaries for expanded groups whose blocks moved
                    state.groups.forEach(grp => {
                        if (!grp.collapsed && grp.blockIds.some(bid => selectedIds.includes(bid))) {
                            this.recalculateGroupBounds(grp);
                        }
                    });

                    this.renderDiagram();
                }
            });

            window.addEventListener('mouseup', (e) => {
                // Done Panning
                if (isPanning) {
                    isPanning = false;
                    viewport.classList.remove('panning');
                    this.drawMinimap();
                }

                // Done Resizing
                if (resizeState) {
                    resizeState = null;
                    this.saveHistory();
                    this.renderDiagram();
                }

                // Done dragging standalone arrow
                if (activeArrowDraw) {
                    activeArrowDraw = null;
                    this.saveHistory();
                    this.renderDiagram();
                }

                // Done dragging elements
                if (dragBlockState) {
                    dragBlockState = null;
                    this.saveHistory();
                    this.renderDiagram();
                }

                // Done connection dragging
                if (dragStartPin) {
                    const target = e.target;
                    // Check if dropped on target input pin
                    if (target.classList.contains('bdb-pin')) {
                        const targetBlockId = target.getAttribute('data-block-id');
                        const targetSide = target.getAttribute('data-side');
                        const targetPinIdx = parseInt(target.getAttribute('data-pin-idx'));
                        
                        const targetBlk = state.blocks.find(b => b.id === targetBlockId);
                        const targetPin = targetBlk.sides[targetSide].pins[targetPinIdx];

                        this.createConnection(dragStartPin, { blockId: targetBlockId, side: targetSide, pinIdx: targetPinIdx, pin: targetPin });
                    }

                    dragStartPin = null;
                    dragLineCoords = null;
                    // Remove temporary drag line
                    const tempLine = svgOverlayEl.querySelector('.bdb-temp-drag-line');
                    if (tempLine) tempLine.remove();
                    this.renderDiagram();
                }

                // Done Multi Drag Selection
                if (multiSelectActive && dragSelectState) {
                    multiSelectActive = false;
                    dragSelectBoxEl.style.display = 'none';

                    // Compute bounding box
                    const left = Math.min(dragSelectState.startX, dragSelectState.currentX);
                    const top = Math.min(dragSelectState.startY, dragSelectState.currentY);
                    const right = Math.max(dragSelectState.startX, dragSelectState.currentX);
                    const bottom = Math.max(dragSelectState.startY, dragSelectState.currentY);

                    // Select all blocks and annotations inside bounds
                    const idsInside = [];
                    state.blocks.forEach(b => {
                        // Simple collision
                        if (b.x >= left && b.x + b.width <= right && b.y >= top && b.y + b.height <= bottom) {
                            idsInside.push(b.id);
                        }
                    });

                    state.annotations.forEach(a => {
                        let ax = a.x, ay = a.y;
                        if (a.type === 'arrow') {
                            ax = Math.min(a.x1, a.x2);
                            ay = Math.min(a.y1, a.y2);
                        }
                        if (ax >= left && ax <= right && ay >= top && ay <= bottom) {
                            idsInside.push(a.id);
                        }
                    });

                    if (idsInside.length > 0) {
                        this.selectElements(idsInside);
                    }
                    dragSelectState = null;
                }

                // Done Lasso Selection
                if (activeTool === 'lasso' && isLassoing) {
                    isLassoing = false;
                    const lassoPath = document.getElementById('bdb-lasso-path');
                    if (lassoPath) lassoPath.style.display = 'none';

                    if (lassoPoints.length > 2) {
                        const selected = [];
                        
                        // Helper: PIP algorithm
                        const isPointInPolygon = (px, py, polygon) => {
                            let inside = false;
                            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                                const xi = polygon[i].x, yi = polygon[i].y;
                                const xj = polygon[j].x, yj = polygon[j].y;
                                const intersect = ((yi > py) !== (yj > py))
                                    && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                                if (intersect) inside = !inside;
                            }
                            return inside;
                        };

                        // 1. Blocks
                        state.blocks.forEach(b => {
                            const cx = b.x + b.width / 2;
                            const cy = b.y + b.height / 2;
                            if (isPointInPolygon(cx, cy, lassoPoints)) {
                                selected.push(b.id);
                            }
                        });

                        // 2. Annotations (Sticky notes, Labels, Arrows)
                        state.annotations.forEach(a => {
                            if (a.type === 'note') {
                                const cx = a.x + 70;
                                const cy = a.y + (a.height || 120) / 2;
                                if (isPointInPolygon(cx, cy, lassoPoints)) {
                                    selected.push(a.id);
                                }
                            } else if (a.type === 'label') {
                                const cx = a.x + 75;
                                const cy = a.y + 15;
                                if (isPointInPolygon(cx, cy, lassoPoints)) {
                                    selected.push(a.id);
                                }
                            } else if (a.type === 'arrow') {
                                const cx = (a.x1 + a.x2) / 2;
                                const cy = (a.y1 + a.y2) / 2;
                                if (isPointInPolygon(cx, cy, lassoPoints)) {
                                    selected.push(a.id);
                                }
                            }
                        });

                        if (selected.length > 0) {
                            this.selectElements(selected);
                        } else {
                            this.clearSelection();
                        }
                        // Reset tool to select/pointer tool after lasso complete
                        setTool('select');
                    }
                    lassoPoints = [];
                }
            });

            // Prevent browser right click menu
            viewport.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            // --- Mouse Wheel Zooming ---
            viewport.addEventListener('wheel', (e) => {
                e.preventDefault();
                const rect = viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const factor = e.deltaY < 0 ? 1.1 : 0.9;
                this.zoomAt(factor, mouseX, mouseY);
            }, { passive: false });

            // Mobile FAB toggle
            const fabMain = document.getElementById('bdb-fab-main');
            const fabContainer = document.getElementById('bdb-fab-container');
            if (fabMain) {
                fabMain.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fabContainer.classList.toggle('active');
                });
                // Close FAB on click away
                document.addEventListener('click', () => {
                    fabContainer.classList.remove('active');
                });
            }

            // Mobile FAB specific actions
            const bindFab = (id, action) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', (e) => { e.stopPropagation(); action(); fabContainer.classList.remove('active'); });
            };
            bindFab('fab-add-block', () => this.addNewBlock());
            bindFab('fab-add-label', () => this.addNewLabel());
            bindFab('fab-add-note', () => this.addNewStickyNote());
            bindFab('fab-add-arrow', () => this.addNewArrow());
            bindFab('fab-undo', () => this.undo());
            bindFab('fab-redo', () => this.redo());
        },

        // Draw temporary drag-to-connect line
        drawDraggingLine() {
            let tempLine = svgOverlayEl.querySelector('.bdb-temp-drag-line');
            if (!tempLine) {
                tempLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
                tempLine.setAttribute('class', 'bdb-temp-drag-line');
                tempLine.setAttribute('stroke', '#3b82f6');
                tempLine.setAttribute('stroke-width', '2');
                tempLine.setAttribute('stroke-dasharray', '4,4');
                tempLine.setAttribute('fill', 'none');
                svgOverlayEl.appendChild(tempLine);
            }

            // Route orthogonally to current cursor position
            const startPt = this.getPinAbsoluteCoords(dragStartPin.blockId, dragStartPin.side, dragStartPin.pinIdx);
            
            // Guess side direction for cursor based on coordinate differences
            let guessedSide = 'left';
            const dx = dragLineCoords.x2 - startPt.coords.x;
            const dy = dragLineCoords.y2 - startPt.coords.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                guessedSide = dx > 0 ? 'left' : 'right'; // enter target opposite from cursor delta direction
            } else {
                guessedSide = dy > 0 ? 'top' : 'bottom';
            }

            const pts = computeOrthogonalPoints(
                startPt.coords, 
                startPt.side, 
                { x: dragLineCoords.x2, y: dragLineCoords.y2 }, 
                guessedSide
            );

            let d = `M ${pts[0].x} ${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) {
                d += ` L ${pts[i].x} ${pts[i].y}`;
            }
            tempLine.setAttribute('d', d);
        },

        // Connection creation rules validation
        createConnection(sourcePin, destPin) {
            // Create connection
            const conn = {
                id: 'conn_' + Date.now(),
                sourceBlockId: sourcePin.blockId,
                sourceSide: sourcePin.side,
                sourcePinIdx: sourcePin.pinIdx,
                targetBlockId: destPin.blockId,
                targetSide: destPin.side,
                targetPinIdx: destPin.pinIdx,
                label: '',
                style: 'solid',
                color: null,
                arrowhead: 'forward'
            };

            state.connections.push(conn);
            this.saveHistory();
            this.renderDiagram();
        },

        // Context popup menu position using cursor coordinates
        triggerMenuAtCursor() {
            const viewport = document.getElementById('bdb-viewport');
            if (!viewport) return;
            const rect = viewport.getBoundingClientRect();
            const mouseX = lastMousePos.clientX - rect.left;
            const mouseY = lastMousePos.clientY - rect.top;

            const target = lastMousePos.target || viewport;
            const draggableEl = target.closest ? target.closest('.bdb-block, .bdb-sticky-note, .bdb-floating-label, .bdb-group-boundary') : null;
            const ctxMenu = document.getElementById('bdb-context-menu');
            if (!ctxMenu) return;

            // Select it if not selected
            if (draggableEl) {
                const id = draggableEl.getAttribute('data-id');
                if (!selectedIds.includes(id)) {
                    this.selectElements([id]);
                }
                
                // Toggle Group / Ungroup visibility in context
                document.getElementById('ctx-duplicate').style.display = 'block';
                const isGroup = state.groups.some(g => g.id === id);
                document.getElementById('ctx-group').style.display = isGroup ? 'none' : 'block';
                document.getElementById('ctx-ungroup').style.display = isGroup ? 'block' : 'none';
            } else {
                this.clearSelection();
                document.getElementById('ctx-duplicate').style.display = 'none';
                document.getElementById('ctx-group').style.display = 'none';
                document.getElementById('ctx-ungroup').style.display = 'none';
            }

            // Toggle Save to Library button based on if block is selected
            const isBlock = draggableEl && state.blocks.some(b => b.id === draggableEl.getAttribute('data-id'));
            const ctxSaveBtn = document.getElementById('ctx-save-to-lib');
            if (ctxSaveBtn) {
                ctxSaveBtn.style.display = isBlock ? 'block' : 'none';
            }

            // Position context menu
            ctxMenu.style.left = `${mouseX}px`;
            ctxMenu.style.top = `${mouseY}px`;
            ctxMenu.style.display = 'flex';
        },

        handleRightClick(e) {
            lastMousePos.clientX = e.clientX;
            lastMousePos.clientY = e.clientY;
            lastMousePos.target = e.target;
            this.triggerMenuAtCursor();
        },

        loadCustomLibraryDropdown() {
            const select = document.getElementById('tb-library-select');
            if (!select) return;
            
            // Keep the first 3 options (Block Library header, Save Current, divider)
            while (select.options.length > 3) {
                select.remove(3);
            }
            
            dbService.getCustomBlocks().then(blocks => {
                if (blocks.length === 0) {
                    const opt = document.createElement('option');
                    opt.value = "";
                    opt.disabled = true;
                    opt.text = "(No custom blocks saved)";
                    select.appendChild(opt);
                    return;
                }
                
                blocks.forEach(b => {
                    // Option 1: Spawn/Place Block
                    const optPlace = document.createElement('option');
                    optPlace.value = 'place_' + b.id;
                    optPlace.text = `Place: ${b.name}`;
                    select.appendChild(optPlace);
                    
                    // Option 2: Delete Block
                    const optDelete = document.createElement('option');
                    optDelete.value = 'delete_' + b.id;
                    optDelete.text = `   Delete: ${b.name}`;
                    select.appendChild(optDelete);
                });
            }).catch(err => console.error('Error loading library:', err));
        },

        // Add Annotations or Blocks to center of current viewport screen
        getViewportCenterCoords() {
            const viewport = document.getElementById('bdb-viewport');
            const rect = viewport.getBoundingClientRect();
            const cx = (rect.width / 2 - camera.panX) / camera.scale;
            const cy = (rect.height / 2 - camera.panY) / camera.scale;
            return { x: cx, y: cy };
        },

        addNewBlock() {
            const center = this.getViewportCenterCoords();
            const blk = {
                id: 'block_' + Date.now(),
                name: `Block ${state.blocks.length + 1}`,
                color: '#ffffff',
                x: center.x - 75,
                y: center.y - 50,
                width: 150,
                height: 100,
                borderStyle: 'solid',
                sides: {
                    top: { label: '', pinCount: 0, pins: [] },
                    bottom: { label: '', pinCount: 0, pins: [] },
                    left: { label: 'In', pinCount: 1, pins: [{ name: 'In 1', direction: 'input' }] },
                    right: { label: 'Out', pinCount: 1, pins: [{ name: 'Out 1', direction: 'output' }] }
                }
            };

            state.blocks.push(blk);
            this.saveHistory();
            this.renderDiagram();
            this.selectElements([blk.id]);
        },

        addNewLabel() {
            const center = this.getViewportCenterCoords();
            const label = {
                id: 'label_' + Date.now(),
                type: 'label',
                text: 'New Label',
                x: center.x - 40,
                y: center.y - 10,
                bold: false,
                italic: false
            };

            state.annotations.push(label);
            this.saveHistory();
            this.renderDiagram();
            this.selectElements([label.id]);
        },

        addNewStickyNote() {
            const center = this.getViewportCenterCoords();
            const note = {
                id: 'note_' + Date.now(),
                type: 'note',
                text: '',
                x: center.x - 70,
                y: center.y - 60,
                color: '#fef08a'
            };

            state.annotations.push(note);
            this.saveHistory();
            this.renderDiagram();
            this.selectElements([note.id]);
        },

        addNewArrow() {
            const center = this.getViewportCenterCoords();
            const arrow = {
                id: 'arrow_' + Date.now(),
                type: 'arrow',
                x1: center.x - 50,
                y1: center.y,
                x2: center.x + 50,
                y2: center.y,
                style: 'solid',
                color: '#000000',
                size: 2
            };

            state.annotations.push(arrow);
            this.saveHistory();
            this.renderDiagram();
            this.selectElements([arrow.id]);
        },

        // --- Active Simulator Contract Interface methods ---
        getState() {
            return {
                activeTopic: 'block_diagram_builder',
                state: state,
                camera: camera
            };
        },

        destroy() {
            // Clean up mobile fab radial container if exists
            const fab = document.getElementById('bdb-fab-container');
            if (fab) fab.remove();

            // Clear right click menu
            const ctx = document.getElementById('bdb-context-menu');
            if (ctx) ctx.remove();
            
            // Clear headers tabs inside active simulator app layout
            const headerTabs = document.getElementById('em-header-tabs');
            if (headerTabs) headerTabs.remove();
        }
    };

    // --- Auxiliary Orthogonal Routing Helper ---
    // Simple S-curve / L-curve route generator
    function computeOrthogonalPoints(p1, dir1, p2, dir2) {
        const start = { x: p1.x, y: p1.y };
        const end = { x: p2.x, y: p2.y };
        
        const offset = 22; // Offset segments from block edge
        let s = { x: start.x, y: start.y };
        let e = { x: end.x, y: end.y };
        
        if (dir1 === 'right') s.x += offset;
        else if (dir1 === 'left') s.x -= offset;
        else if (dir1 === 'bottom') s.y += offset;
        else if (dir1 === 'top') s.y -= offset;
        
        if (dir2 === 'right') e.x += offset;
        else if (dir2 === 'left') e.x -= offset;
        else if (dir2 === 'bottom') e.y += offset;
        else if (dir2 === 'top') e.y -= offset;
        
        const points = [start, s];
        
        // Horizontal to Horizontal
        if (dir1 === 'left' || dir1 === 'right') {
            if (dir2 === 'left' || dir2 === 'right') {
                if ((dir1 === 'right' && s.x < e.x) || (dir1 === 'left' && s.x > e.x)) {
                    // S-curve route
                    const midX = (s.x + e.x) / 2;
                    points.push({ x: midX, y: s.y });
                    points.push({ x: midX, y: e.y });
                } else {
                    // Overlap, go around
                    const midY = (s.y + e.y) / 2;
                    const diffY = Math.abs(s.y - e.y);
                    const yAdjust = diffY < 50 ? (s.y < e.y ? s.y - 70 : s.y + 70) : midY;
                    points.push({ x: s.x, y: yAdjust });
                    points.push({ x: e.x, y: yAdjust });
                }
            } else {
                // Horizontal to Vertical
                points.push({ x: e.x, y: s.y });
            }
        } else { // top or bottom
            if (dir2 === 'top' || dir2 === 'bottom') {
                if ((dir1 === 'bottom' && s.y < e.y) || (dir1 === 'top' && s.y > e.y)) {
                    const midY = (s.y + e.y) / 2;
                    points.push({ x: s.x, y: midY });
                    points.push({ x: e.x, y: midY });
                } else {
                    const midX = (s.x + e.x) / 2;
                    const diffX = Math.abs(s.x - e.x);
                    const xAdjust = diffX < 50 ? (s.x < e.x ? s.x - 70 : s.x + 70) : midX;
                    points.push({ x: xAdjust, y: s.y });
                    points.push({ x: xAdjust, y: e.y });
                }
            } else {
                // Vertical to Horizontal
                points.push({ x: s.x, y: e.y });
            }
        }
        
        points.push(e);
        points.push(end);
        
        // Collinear reduction
        const simplified = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const prev = simplified[simplified.length - 1];
            const curr = points[i];
            if (prev.x === curr.x && prev.y === curr.y) continue;
            
            if (i < points.length - 1) {
                const next = points[i + 1];
                if ((prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y)) {
                    continue;
                }
            }
            simplified.push(curr);
        }
        return simplified;
    }

    // Export module to global scope
    window.activeSimulator = blockDiagramBuilder;
})();
