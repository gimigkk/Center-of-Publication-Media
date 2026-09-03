# Center of Publication Media (COPM)

A collaborative Kanban-style publication and design request workflow management platform developed for IEEE SB IPB University.

---

## Showcase

![COPM Showcase](public/showcase.gif)

---

## Core Workflows

### Kanban Pipeline & Drag-and-Drop
Move cards across workflow columns (*Antrian*, *Sedang Dikerjakan*, *Revisi*, *Selesai*) and drag completed jobs directly down into the Archive Table.

![Kanban Drag and Drop](public/snippet_kanban_drag.gif)

### Multi-Workspace Page Switching
Switch between organizational divisions and sub-boards (e.g. *Creative n' Marketing 2026*, *Dokumentasi & Publikasi Event*) with independent pipelines.

![Workspace Page Switching](public/snippet_page_switcher.gif)

### Job Request Creation Workflow
Submit publication and design requests with automatic Google Docs brief link validation, deadline selection, and division targeting.

![Job Request Creation](public/snippet_job_request.gif)

### Deliverables & Design Gallery
Review, inspect high-resolution submitted artwork, and download completed deliverables directly inside the job detail modal.

![Deliverables Gallery](public/snippet_deliverables_gallery.gif)

---

## Features

- **Interactive Kanban Pipeline**: 4 workflow stages with drag-and-drop powered by `@dnd-kit`.
- **Multi-Workspace Pages**: Seamless workspace switching for independent division boards.
- **Archive Drop Zone**: Drag completed job cards into the archive table for structured tracking.
- **Job Request Workflow**: Standardized form modal with Google Docs brief link auto-detection.
- **Deliverables Gallery**: Modal preview for reviewing and downloading submitted artwork.
- **Collaborator Presence**: Real-time presence indicators and active collaborator badges.
- **Notification Center**: In-app notifications for assignments, revisions, and status updates.
- **Search & Filtering**: Client-side filtering across requestors, assignees, divisions, and deadlines.

---

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions)
- **Frontend**: [React 19](https://react.dev/), TypeScript
- **Drag and Drop**: [`@dnd-kit/core`](https://dndkit.com/), `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Styling**: Vanilla CSS, TailwindCSS
- **Database & ORM**: PostgreSQL / Supabase, [Drizzle ORM](https://orm.drizzle.team/)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## Getting Started

### Prerequisites
- Node.js 18.18+ or later
- npm / pnpm / yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/gimigkk/Center-of-Publication-Media.git
   cd COPM
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env.local # or configure .env.local directly
   ```

   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   USE_MOCK_DATA=true # Enables standalone in-memory demo mode
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## License

Developed for IEEE SB IPB University.
