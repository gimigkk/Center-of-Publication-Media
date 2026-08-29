# COPM Platform — Spec

## Purpose
Replace the current manual workflow (Google Form intake → manual spreadsheet consolidation → manual designer assignment → manual middleman communication) with a single platform.

## Intake
- Custom form built inside the platform (replaces Google Form)
- form consist of the brief link (pasted google docs link, has a validation check too -> only accepting google links), requesting division, Job title, description, publication media, deadline (with hard rule minimum h-10 requirement).

- Submission creates a job card in the **In Queue** kanban list

## Dashboard
- Kanban board, drag-and-drop
- Lists, in order:
  1. **In Queue**
  2. **Work In Progress**
  3. **Revisions**
  4. **Done**

## Workflow
1. Job submitted via form → lands in **In Queue**
2. Admin assigns a designer → card moves to **Work In Progress**
   - Platform shows a suggested designer based on current workload
3. Designer finishes draft → card moves to **Revisions**
4. Requestor reviews the draft:
   - Requests revisions → card goes back to **Work In Progress**
   - Accepts as final → card moves to **Done**

## Notifications
- Sent via SMTP email
- Triggered on every kanban stage transition

## Real-time
- WebSocket-based live sync of the board across all connected users
- Real-time collaborative cursors (Figma-style) on the space

## Auth
- Email + password (no Google OAuth)
- Self-registration (no manual account provisioning by admin)
- **Requestors**: auto-approved if their email matches the org's domain
- **Designers / Admins**: require manual admin approval after signup
- Role-based access (Requestor, Designer, Admin)
- Only Admins can assign designers

## Storage
- Supabase (database + auth + storage)
- Job attachments stored in Supabase Storage
- Job cards in Postgres (kanban state + job data + assigned designer)

## Design
- Looks like figma's jam (light mode coop work) but with job cards.
- top left is for current account logged in
- top right list of active, and last seen users, with their role and profile picture
- main workspace for the kanban board filling the whole viewport like figjam
- Our main inspiration is straight up just figma jam
- no right side bar, no bottom bar, nothing.
- press [/] to turn cursor into bubble chat like in figma
- 