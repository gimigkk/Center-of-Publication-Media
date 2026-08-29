<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CRITICAL PROJECT RULES — DO NOT VIOLATE
1. **NEVER TOUCH OR MODIFY THE FIGJAM DOT GRID BACKGROUND (`.figjam-canvas`)**:
   The canvas dot grid MUST ALWAYS be:
   `background-image: radial-gradient(rgba(0, 0, 0, 0.13) 1px, transparent 1.6px);`
   `background-size: 20px 20px;`
   `background-color: var(--bg-canvas);`
   Do NOT change dot size, dot color, or spacing, and NEVER remove this background.

