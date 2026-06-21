/**
 * ai-handler.js — Gemini API: Section-Based Notes + Enhancement
 *
 * Exports:
 *   generateInsights(text, apiKey)   → full section-based study notes
 *   enhanceSection(section, apiKey)  → enhancement suggestions for one section
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/* ──────────────────────────────────────────────
 * System Prompt — Tutor-Style Section Notes
 * ────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert university professor and study-material architect.
You receive the raw extracted text from a university-level PDF document.

Your task: Write COMPREHENSIVE, ORIGINAL study notes for each major topic — as if YOU are
personally tutoring a student. Do NOT merely summarize the PDF. Instead:

• Explain each concept deeply — build intuition BEFORE formulas.
• AVOID UNEXPLAINED ACADEMIC JARGON. Assume the student does not already understand the terminology. If you must use a technical term (e.g. divergence, curl, flux, permittivity, permeability, conservative field, mutual induction, solenoid, etc.), explain it immediately using an intuitive, real-world analogy.
• Explanations of formulas must be thorough. For every single equation, you must:
  1. Define any mathematical operators used (e.g., explain that the inverted triangle $\nabla$ is the vector operator called nabla or del, that $\cdot$ represents the dot product which multiplies parallel components, that $\times$ represents the cross product which multiplies perpendicular components and results in a perpendicular vector, and that $\oint$ or $\oiint$ represent integration over a closed path or closed surface).
  2. Provide a symbol-by-symbol variable breakdown listing each symbol, its quantity name, its SI unit, and its physical role in that equation.
  3. Explain the physics of its layout (e.g., why a variable is in the numerator or denominator, and what happens physically if it increases/decreases).
• Show worked examples with step-by-step solutions under a clear "### Worked Example" or "### Worked Example: Title" heading.
• Cite specific PDF page numbers so the student can cross-reference.

Return a single valid JSON object (no markdown fences, no text outside the JSON) with:

1. "documentTitle" — A clean descriptive title for this document.

2. "overview" — One paragraph (3-5 sentences) summarizing what this document covers and why it matters.

3. "sections" — Array of section objects. Each section covers ONE major concept/topic. Include 4-10 sections. Each section has:
   - "title": Clear section heading
   - "pdfPages": Array of 1-indexed page numbers this section draws from
   - "content": Rich Markdown text with LaTeX math. Use $...$ for inline math and $$...$$ for display math.
     Structure each section as:
       1. Intuitive explanation (explaining jargon simply, using analogies)
       2. Formal definition / key formula derivation. Wrap key formulas in \`<div class="formula-box">$$...$$</div>\` tags, and make sure every math operator and variable is defined symbol-by-symbol.
       3. Physical interpretation and consequences, breaking down the equation variable-by-variable (explaining units, numerator/denominator physics).
       4. Worked example: Structure under "### Worked Example" or "### Worked Example: Title". Wrap the solution in \`<div class="calculation-box">**Solution:** ...</div>\` tags to make it stand out.
     Use **bold**, *italic*, bullet lists, numbered lists, and ### sub-headings freely.
   - "equations": Array of { "label": string, "latex": string } for the section's key equations.
     Use proper LaTeX: \\vec{}, \\frac{}, \\int, \\oint, \\nabla, \\partial, Greek letters, etc.
   - "visualization": Object specifying an interactive visualization for this concept:
      - "type": One of "html" | "field2d" | "wave" | "plot" | "3d"
      - "title": Short descriptive title
      - "description": Interactivity hint (e.g., "Drag the charges to see the field change")
      - "html": (Required if type is "html") A complete, self-contained HTML5 string. To ensure it fits perfectly and is responsive, it MUST include <meta name="viewport" content="width=device-width, initial-scale=1.0"> in the <head>, use width: 100% (or responsive layouts) without hardcoded pixel widths, and handle canvas or layout resizing cleanly. It should contain inline CSS in <style> and interactive Javascript in <script> presenting a premium interactive simulation. It can load common CDN scripts (like three.js, chart.js, tailwind, etc.) if needed.
      - "config": Type-specific configuration (Only if type is field2d, wave, plot, or 3d):

       For "field2d" (2D electric/magnetic field visualization):
       { "sources": [{ "x": 0-1, "y": 0-1, "strength": number, "label": "string", "type": "charge"|"current" }],
         "fieldType": "electric"|"magnetic", "lineCount": 12-24 }

       For "wave" (animated wave):
       { "waveType": "transverse"|"em"|"standing", "frequency": 0.5-3, "amplitude": 0.3-1.5, "wavelength": 100-300 }

       For "plot" (2D function graph):
       { "curves": [{ "expr": "JS math expression using x, e.g. sin(x)/x", "color": "#hex", "label": "string" }],
         "xRange": [min, max], "yRange": [min, max], "xLabel": "string", "yLabel": "string" }

       For "3d" (Three.js scene):
       { "background": "#hex", "camera": { "position": [x,y,z] },
         "objects": [{ "type": "sphere"|"box"|"torus"|"cylinder"|"cone"|"torusKnot"|"ring",
           "position": [x,y,z], "color": "#hex", "radius": n, "width": n, "height": n, "depth": n,
           "tube": n, "wireframe": bool, "opacity": 0-1,
           "animate": { "rotate": { "x": speed, "y": speed, "z": speed } } }],
         "lights": [{ "type": "ambient"|"point"|"directional", "color": "#hex", "intensity": n, "position": [x,y,z] }],
         "showGrid": bool,
         "lines": [{ "points": [[x,y,z],[x,y,z]], "color": "#hex" }] }

4. "mindMap" — A valid Mermaid.js graph definition string (graph TD or graph LR).
   Map the document's concepts and relationships. Keep node labels ≤5 words.
   Quote all labels inside square brackets, e.g. A["Label"]. Max 30 nodes.

RULES:
- Return ONLY the JSON object. No code fences. No commentary.
- All strings must be properly JSON-escaped.
- LaTeX: use standard notation (\\vec, \\frac, \\int, \\nabla, etc.)
- Each section MUST have at least one visualization.
- pdfPages must reference real page numbers from the document.
- Choose visualization types that best illustrate the physics/math. Prefer type "html" to generate custom, robust, and highly interactive HTML5/CSS/JS simulations specifically tailored to the topic (e.g., a charging circuit, ray optics bench, thermodynamic cycles, vector field animations). Fall back to "field2d", "wave", "plot", or "3d" configs only if a simple pre-defined canvas matches.
- Be THOROUGH. Each section should be 300-600 words of explanation. This must be BETTER than reading the PDF.`;

/* ──────────────────────────────────────────────
 * Enhancement Prompt — For Insights Panel
 * ────────────────────────────────────────────── */
const ENHANCE_PROMPT = `You are reviewing study notes written for a university student.
Analyze the section below and provide enhancement suggestions.

Return a JSON object:
{
  "suggestions": [
    {
      "type": "detail" | "example" | "clarification" | "misconception" | "practice",
      "title": "Short title",
      "content": "Detailed suggestion with markdown and LaTeX math ($...$ inline, $$...$$ display). Be specific and actionable."
    }
  ]
}

Provide 3-6 suggestions. Focus on:
1. Gaps in explanation that need more depth
2. Additional worked examples that would help
3. Common student misconceptions to address
4. Connections to related topics
5. Practice problems with solutions

Return ONLY the JSON object.`;

/* ──────────────────────────────────────────────
 * Main API — Generate Full Notes
 * ────────────────────────────────────────────── */
export async function generateInsights(text, apiKey) {
  if (!apiKey) throw new AIError('No API key. Open Settings to add your Gemini key.', 'NO_KEY');
  if (!text || text.trim().length < 50) throw new AIError('Extracted text is too short to analyze.', 'NO_TEXT');

  const truncated = text.length > 120000
    ? text.slice(0, 120000) + '\n\n[...truncated for token limit]'
    : text;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: SYSTEM_PROMPT + '\n\n---\n\nDOCUMENT TEXT:\n\n' + truncated }]
    }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 30000,
      responseMimeType: 'application/json'
    }
  };

  const raw = await callGemini(body, apiKey);
  return parseNotesResponse(raw);
}

/* ──────────────────────────────────────────────
 * Enhance Section — For Insights Panel
 * ────────────────────────────────────────────── */
export async function enhanceSection(sectionTitle, sectionContent, apiKey) {
  if (!apiKey) throw new AIError('No API key.', 'NO_KEY');

  const body = {
    contents: [{
      role: 'user',
      parts: [{
        text: ENHANCE_PROMPT + `\n\n---\n\nSECTION TITLE: ${sectionTitle}\n\nSECTION CONTENT:\n${sectionContent}`
      }]
    }],
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json'
    }
  };

  const raw = await callGemini(body, apiKey);
  return parseEnhanceResponse(raw);
}

/* ──────────────────────────────────────────────
 * Chat with Section — Context-Aware Tutor Chat
 * ────────────────────────────────────────────── */
export async function chatWithSection(query, history, sectionTitle, sectionContent, pdfPageText, apiKey) {
  if (!apiKey) throw new AIError('No API key.', 'NO_KEY');

  const systemInstructionText = `You are a helpful, expert university physics and engineering tutor.
The student is reading a study notes section called "${sectionTitle}" and wants to ask you questions, clarify concepts, request simplifications, or generate visual simulations.

Below is the context of the notes section they are viewing:
=== SECTION CONTENT ===
${sectionContent}

${pdfPageText ? `Below is the text content extracted from the cited PDF pages of this section:
=== CITED PDF PAGES TEXT ===
${pdfPageText}` : ''}

GUIDELINES:
1. Explain concepts intuitively and deeply, using real-world analogies. Avoid academic jargon unless you explain it immediately in simple terms.
2. STRICTLY AVOID USING ANY EMOJIS IN YOUR RESPONSE. Do not output any emoji under any circumstances.
3. Use LaTeX for math equations. Use $...$ for inline math and $$...$$ for display math block equations. Always explain variables and symbols when equations are introduced or when asked.
4. If the student asks to simplify a concept or equation, break it down step-by-step.
5. If the student asks for practice questions/quizzes, design a conceptual or numerical quiz, provide the question, and explain the solution step-by-step.
6. You are equipped to suggest interactive visual simulations to help the student understand or illustrate a concept or quiz.
   Instead of using simple hardcoded templates, you MUST write complete, self-contained HTML5 code for interactive visual simulations specifically tailored to the topic being discussed.
   Format your HTML5 simulation inside a fenced code block with the language label "html-viz" at the end of your response.

   Inside the html-viz block:
   - It MUST be a complete standalone HTML document starting with <!DOCTYPE html> and containing <html>, <head> (with <title> tag, a viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1.0">, and any other meta tags), and <body>.
   - The <title> tag should be the name of the simulation (e.g. <title>RLC Circuit Simulator</title>).
   - Include a comment at the top of the file to provide an interactivity hint/description: <!-- description: Drag sliders and click components to interact with the simulation. -->
   - Style it beautifully and modernly with CSS inside a <style> tag. Use sleek gradients, tailored colors (like slate, indigo, HSL palettes), and clear layouts.
   - All components, canvases, and layout wrappers MUST be fully responsive and fit viewport width (e.g. use width: 100% or w-full, never use hardcoded static width like 800px).
   - Add interactive controls (sliders, buttons, checkboxes) so the student can change parameters and see the animation update dynamically.
   - You may load CDNs (e.g., Chart.js, Tailwind CSS, Three.js) if needed.

   Example html-viz block format:
   \`\`\`html-viz
   <!DOCTYPE html>
   <html>
   <head>
     <title>Pendulum Simulation</title>
     <!-- description: Adjust the length and gravity to see how the period changes in real-time. -->
     <script src="https://cdn.tailwindcss.com"></script>
     <style>
       /* custom modern styling */
     </style>
   </head>
   <body class="bg-slate-50 p-4 font-sans text-slate-800">
     <div class="max-w-md mx-auto bg-white p-4 rounded-xl shadow-md">
       <h3 class="text-lg font-semibold mb-2">Interactive Pendulum</h3>
       <canvas id="pendulumCanvas" class="w-full h-48 bg-slate-100 rounded-lg"></canvas>
       <div class="mt-4">
         <label class="block text-sm">Length: <span id="lenVal">150</span>px</label>
         <input type="range" id="lenSlider" min="50" max="200" value="150" class="w-full">
       </div>
     </div>
     <script>
       // simulation logic...
     </script>
   </body>
   </html>
   \`\`\`
   
   Ensure the HTML inside the fence is valid and doesn't contain errors. Do not include markdown or other commentary inside the html-viz block itself. You may also still fall back to recommending standard "json-viz" configurations if the concept is extremely basic and fits one of the existing visualizers (field2d, wave, plot, 3d), but prefer "html-viz" for custom visual needs.`;

  // Map history to Gemini's content roles
  // Gemini expects: { role: 'user' | 'model', parts: [{ text: '...' }] }
  const contents = [];
  
  if (history && history.length > 0) {
    history.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    });
  }

  // Append new user message
  contents.push({
    role: 'user',
    parts: [{ text: query }]
  });

  const body = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 8192
    }
  };

  const raw = await callGemini(body, apiKey);
  return raw;
}

/* ──────────────────────────────────────────────
 * Gemini API Call
 * ────────────────────────────────────────────── */
async function callGemini(body, apiKey) {
  const url = `${GEMINI_ENDPOINT}?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new AIError('Network error — check your connection.', 'NETWORK', err);
  }

  if (!response.ok) {
    const status = response.status;
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch (_) {}

    if (status === 401 || status === 403)
      throw new AIError(`Auth failed (${status}). Check your API key. ${detail}`, 'AUTH');
    if (status === 429)
      throw new AIError('Rate limit. Wait a minute and retry.', 'RATE_LIMIT');
    if (status === 400)
      throw new AIError(`Bad request. ${detail || 'PDF text may be unsupported.'}`, 'BAD_REQUEST');
    throw new AIError(`API error ${status}. ${detail}`, 'API_ERROR');
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    const reason = data?.candidates?.[0]?.finishReason;
    if (reason === 'SAFETY')
      throw new AIError('Blocked by safety filters. Try a different document.', 'SAFETY');
    throw new AIError('Empty response from Gemini. Try again.', 'EMPTY');
  }
  return rawText;
}

/* ──────────────────────────────────────────────
 * Response Parsers
 * ────────────────────────────────────────────── */
function parseNotesResponse(raw) {
  const parsed = extractJSON(raw);

  return {
    documentTitle: parsed.documentTitle || 'Untitled',
    overview: parsed.overview || '',
    sections: Array.isArray(parsed.sections) ? parsed.sections.map(s => ({
      title: s.title || 'Untitled Section',
      pdfPages: Array.isArray(s.pdfPages) ? s.pdfPages : [],
      content: s.content || '',
      equations: Array.isArray(s.equations) ? s.equations : [],
      visualization: s.visualization || null
    })) : [],
    mindMap: typeof parsed.mindMap === 'string' ? sanitizeMermaid(parsed.mindMap) : null
  };
}

function parseEnhanceResponse(raw) {
  const parsed = extractJSON(raw);
  return {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  };
}

function extractJSON(raw) {
  let str = raw.trim();
  const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) str = fence[1].trim();

  try { return JSON.parse(str); } catch (_) {}

  const b0 = str.indexOf('{');
  const b1 = str.lastIndexOf('}');
  if (b0 !== -1 && b1 > b0) {
    try { return JSON.parse(str.slice(b0, b1 + 1)); } catch (_) {}
  }
  throw new AIError('Failed to parse AI response as JSON. Try regenerating.', 'PARSE');
}

/* ──────────────────────────────────────────────
 * Mermaid sanitizer
 * ────────────────────────────────────────────── */
function sanitizeMermaid(code) {
  let c = code.trim();
  if (!/^(graph|flowchart|mindmap|classDiagram|sequenceDiagram)/i.test(c)) {
    c = 'graph TD\n' + c;
  }
  c = c.replace(/```mermaid\s*/gi, '').replace(/```\s*$/g, '');
  c = c.replace(/(\w+)\(([^)]+)\)/g, '$1["$2"]');
  return c;
}

/* ──────────────────────────────────────────────
 * Error class
 * ────────────────────────────────────────────── */
export class AIError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}
