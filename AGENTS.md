# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Running the Project

This is a **pure static web application** — no build step, no bundler, no package manager. Open `index.html` directly in a browser, or serve it with any static file server:

```bash
# Example using Python
python -m http.server 8000

# Example using Node.js npx
npx serve .
```

There are no tests, linting, or compilation commands. All JavaScript is loaded via `<script>` tags in `index.html`.

## Architecture Overview

### Application Shell (`index.html` + `system/app.js`)

The app is a single-page application with two views: a **home dashboard** and a **simulator workspace**. `AppController` (in `system/app.js`) manages all routing, view switching, and dynamic script loading.

- **Course Catalog**: Defined as a static `COURSE_CATALOG` array at the top of `system/app.js`. Each course entry specifies a JS file path to its simulator module.
- **Dynamic Script Loading**: Simulator modules are loaded on-demand via `loadScript()`, which injects `<script>` tags with `?t=Date.now()` cache-busting. Editing a simulator JS file and re-loading the course picks up changes without a full page refresh. The loaded module must set `window.activeSimulator` to an object conforming to the simulator contract.
- **Workspace Modes**: Three tabs — Sandbox (3D sim), Study Notes, and Tutorial Solver. The sidebar content changes per mode via `renderSidebarContent()`.

### Simulator Module Contract

Every simulator module (e.g., `em_sandbox_portal.js`, `block_diagram_builder.js`) **must** be an IIFE that assigns to `window.activeSimulator` (or its designated global like `window.electrostaticsModule`) an object with:

- `init(containerEl, savedState)` — Mount into the DOM element, optionally restore state
- `getState()` — Return serializable state object
- `destroy()` — Clean up: remove event listeners, cancel `requestAnimationFrame`, **traverse the scene to dispose all geometries/materials/textures, then call `renderer.dispose()`**
- `loadTopic(topicName, setupState)` — (optional) Switch to a specific sub-topic with optional state

**Critical**: If the IIFE does not set its `window.*` global, the portal fails silently — the script loads but `window.activeSimulator` is undefined, causing a generic error message. Always verify the global assignment when creating or modifying modules.

**Three.js cleanup pattern**: All `destroy()` methods use `scene.traverse()` to dispose every `Geometry`, `Material`, and `Texture` (including `.map`) before calling `renderer.dispose()`. ArrowHelpers require `traverse()` on the arrow object to dispose internal `line` and `cone` sub-objects before `scene.remove()`. When creating new dynamic Three.js objects that are frequently rebuilt (e.g., in `updatePhysics()`), always dispose sub-objects before removing from scene.

### Electromagnetic Theory Simulator (Nested Module System)

`em_sandbox_portal.js` is itself a **portal/hub** that lazy-loads sub-modules:

| Topic ID | Module File | Global Name |
|---|---|---|
| `electrostatics` | `em_simulator.js` | `window.electrostaticsModule` |
| `magnetostatics` | `magnetostatics.js` | `window.magnetostaticsModule` |
| `faradays_law` | `faradays_law.js` | `window.faradaysLawModule` |
| `coordinate_toolkit` | `coordinate_toolkit.js` | `window.coordinateToolkitModule` |

Each sub-module is also an IIFE that exposes its API on its global name. The portal handles tab switching and delegates `getState`/`destroy`/`loadTopic` to the active sub-module.

### Persistence (`system/db.js`)

Uses **IndexedDB** directly (no ORM). Two object stores:
- `simulations` — Saved simulator states (CRUD via `window.dbService`)
- `custom_blocks` — Block Diagram Builder custom components

### Data Files (Notes & Tutorials)

Study notes and tutorial solutions are plain JS files that attach data to `window`:
- `window.chapter3Notes`, `window.chapter4Notes` — Study notes with markdown content, LaTeX equations, and visualization configs
- `window.tutorialC3` — Solved tutorial problems with the same structure

Content uses a custom markdown subset parsed by `AppController.injectMarkdownContent()`, with KaTeX for math (`$...$` inline, `$$...$$` block) and special `pdf-page://` link protocol.

**Notes data schema** — Each notes/tutorial object must follow this shape:
```js
window.someNotes = {
  documentTitle: "...",
  overview: "...",
  sections: [
    {
      title: "Section Title",
      pdfPages: [1, 2, 3],           // Referenced PDF page numbers
      content: "### Markdown...",    // Custom markdown with $LaTeX$
      equations: [                    // Optional: key equations list
        { label: "Name", latex: "\\nabla \\cdot B = 0" }
      ],
      visualization: {                // Optional: inline visualization
        type: "field2d" | "plot" | "html",
        title: "...",
        description: "...",
        config: { /* type-specific */ }
      }
    }
  ]
};
```

### Block Diagram Builder (`system/block_diagram_builder.js`)

A standalone canvas-based diagram editor (**~5600 lines in a single file**). Uses HTML5 Canvas + SVG overlay for rendering blocks, connections, annotations, and groups. Has its own theming system and properties panel. When modifying this file, use targeted search rather than full-file reads due to its size.

### Visualization Types in Notes/Tutorials

The `visualization` field on sections supports four types rendered by `AppController.renderVisualizationPanel()`:
- `html` — Embedded via iframe `srcdoc`
- `plot` — 2D function plots drawn on `<canvas>` (curves defined as JS math expressions)
- `field2d` — 2D vector field visualization (magnetic field lines around current sources)
- `wave` — Electromagnetic wave visualization showing orthogonal E-field (red) and B-field (blue) oscillations along a propagation axis

### Tutorial-to-Sandbox Sync

The "Visualize in 3D Sandbox" button in tutorial questions maps to sandbox states via a **hardcoded switch/case** in `syncQuestionToSandbox()` (`system/app.js` ~lines 521-625). Adding a new tutorial question that should sync to the 3D sandbox requires adding a new `case` in that switch block with the appropriate `targetTopic` and `setupState`.

## Key External Dependencies (CDN)

- **Three.js r128** + OrbitControls — All 3D simulators
- **KaTeX 0.16.8** — Math typesetting in notes and sidebar content

## Gotchas & Pitfalls

- **File paths contain spaces**: Directory names like `"semester 2/Electromagnetic Theory/"` have spaces. Paths in `COURSE_CATALOG` and `TOPIC_MODULES` must match exactly. URL-encoding issues can arise if paths are passed through encoding functions.
- **Custom markdown parser is limited**: `parseMarkdown()` in `system/app.js` supports headers (`#` through `######`), unordered/ordered lists, bold, italic, strikethrough, links, images, blockquotes, fenced code blocks, horizontal rules, and raw HTML `<div>`/`<table>` passthrough. It does **not** support nested lists or markdown-syntax tables (tables must be raw HTML).
- **`$...$` inline math conflicts with literal dollar signs**: The regex `/\$(.*?)\$/g` is greedy-first-match. Avoid unescaped `$` in non-math text content.
- **Three.js cleanup is mandatory**: All simulator `destroy()` methods must traverse the scene graph and dispose every `Geometry`, `Material`, and `Texture` before calling `renderer.dispose()`. ArrowHelpers in particular have internal `line` and `cone` sub-objects that leak GPU memory if not explicitly disposed. Use `traverse()` on ArrowHelper before `scene.remove()`. Failure causes WebGL "too many contexts" errors when switching simulators.

## Adding a New Course/Simulator

1. Create the simulator JS file as an IIFE that sets `window.activeSimulator` (or a named global for sub-modules) to an object implementing `init`, `getState`, `destroy`
2. Add an entry to `COURSE_CATALOG` in `system/app.js` with the file path
3. The file will be dynamically loaded when the user clicks the course card
4. If adding tutorial questions that should sync to 3D, add a case in `syncQuestionToSandbox()`
