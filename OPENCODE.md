# COPM (Creative Ops Project Manager)

Kanban-based job and design request management dashboard.

## Tech Stack
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **State & Realtime**: Custom React hooks (`useRealtimeBoard`, `usePresence`, `useCursors`), Supabase Realtime Channels
- **Database & ORM**: PostgreSQL, Supabase, Drizzle ORM (`src/lib/db/schema.ts`)
- **Storage**: Cloudflare R2 (`src/lib/r2.ts`), Supabase Storage (`src/lib/storage.ts`)
- **Styling**: Modular Vanilla CSS (`src/styles/`)

## Codebase Architecture
```
src/
├── app/
│   ├── actions/               # Server Actions (Mutations & DB operations)
│   │   ├── jobs/              # Job actions (mutations, queries, archive, designers)
│   │   ├── auth.ts            # User auth actions
│   │   ├── board.ts           # Board drag & drop, column updates
│   │   ├── deliverables.ts    # File deliverable uploads to R2
│   │   ├── divisions.ts       # Division management
│   │   ├── notifications.ts   # User notification inbox
│   │   └── pages.ts           # Multi-page / workspace switcher
│   ├── (auth)/                # Auth routes (/login, /signup, /reset-password)
│   └── page.tsx               # Main Kanban Board page
├── components/
│   ├── forms/                 # Modals (JobFormModal, JobDetailModal, AssignDesigner, etc.)
│   │   └── job-detail/        # Sub-panels (DeliverablesPanel, BriefBox, Properties, Footer)
│   ├── header/                # Header bar, PageSwitcher, NotificationInbox
│   └── ui/                    # Core UI primitives (Modal, Avatar, Icons)
├── hooks/                     # Board operations, presence, realtime sync, modals
├── lib/                       # DB client, schema, Supabase clients, auth guards, email
├── styles/                    # Modular CSS stylesheets (modals/, header/, archive/, etc.)
└── types/                     # Shared TypeScript interfaces (Job, Profile, Page, etc.)
```

## Critical Project Rules
1. **FIGJAM DOT GRID BACKGROUND (`.figjam-canvas`)**:
   Never remove or alter the dot grid background:
   - `background-image: radial-gradient(rgba(0, 0, 0, 0.13) 1px, transparent 1.6px);`
   - `background-size: 20px 20px;`
   - `background-color: var(--bg-canvas);`
2. **Styling Paradigm**:
   - Use Vanilla CSS matching the existing modular files in `src/styles/`.
   - Reusable variables live in `src/styles/globals.css`.

## Common Commands
- `npm run dev`: Start Next.js local dev server
- `npm run build`: Typecheck and build production bundle
- `npm run lint`: Run ESLint checks
- `npm run db:push`: Push Drizzle schema updates to Postgres
- `npm run db:seed`: Seed local/staging database

## Agent Execution Guidelines
- **Fast Edits**: Immediately apply required file edits. Keep reasoning concise and avoid overthinking.
- **Scope Restriction**: Search only inside `src/`. Never grep in `node_modules/`, `.next/`, or dist directories.

