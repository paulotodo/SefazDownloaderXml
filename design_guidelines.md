# Design Guidelines: Aplicativo de Download XML SEFAZ

## Design Approach: Material Design System
**Rationale:** This is a utility-focused, data-intensive business application for tax compliance. Material Design provides excellent patterns for dashboards, data tables, forms, and status indicators - perfect for this productivity tool.

**Key Principles:**
- Professional and trustworthy appearance for business/tax software
- Efficient information display with clear visual hierarchy
- Minimal distractions - focus on data and functionality
- Real-time status feedback through clear indicators

---

## Typography

**Font Family:**
- Primary: 'Inter' (Google Fonts) - excellent for UI and data display
- Monospace: 'Roboto Mono' for CNPJ, NSU numbers, file paths

**Hierarchy:**
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Card Titles: text-base font-medium
- Body Text: text-sm font-normal
- Captions/Labels: text-xs font-medium uppercase tracking-wide
- Data Values: text-sm font-mono (for numbers, CNPJs)

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 3, 4, 6, 8** for consistency
- Component padding: p-4, p-6
- Card spacing: gap-4, space-y-6
- Form fields: space-y-3
- Section margins: mb-6, mb-8

**Grid Structure:**
- Sidebar Navigation: Fixed width 16rem (w-64)
- Main Content: Flexible with max-w-7xl container
- Dashboard Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Data Tables: Full-width responsive with horizontal scroll on mobile

---

## Core Layout Structure

**Main Application Layout:**
```
┌─────────────────────────────────────────┐
│  Top Bar (Logo + User Info)            │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │   Main Content Area          │
│ Nav      │   (Dashboard/Companies/Logs) │
│          │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

**Sidebar Navigation (Fixed, w-64):**
- Dashboard
- Empresas Cadastradas
- Logs de Sincronização
- Configurações

**Top Bar (h-16):**
- Logo/App name (left)
- Current sync status indicator (center)
- User profile/settings (right)

---

## Component Library

### 1. Dashboard Cards
- Rounded corners (rounded-lg)
- Subtle shadow (shadow-sm border)
- Padding: p-6
- Content: Icon + metric number + label
- Grid layout for stats: "Total Empresas", "XMLs Hoje", "Última Sincronização", "Status"

### 2. Company List/Table
- Table headers: Sticky with subtle background
- Row hover states for interactivity
- Columns: Logo/Avatar, CNPJ, Razão Social, UF, Status Badge, Último XML, Ações
- Action buttons: Icon buttons for Edit/Delete
- Status badges: Small rounded pills with dot indicators

### 3. Forms (Cadastro de Empresa)
- Vertical form layout (max-w-2xl)
- Field groups with clear labels (text-xs uppercase tracking-wide)
- Input fields: border rounded-md focus:ring-2
- File upload for .pfx certificate: Drag-drop zone with file preview
- Password field for certificate with show/hide toggle
- Select dropdown for UF with search
- Clear submit/cancel button pair

### 4. Status Indicators
- Sync badges: "Ativo", "Sincronizando", "Erro", "Pausado"
- Use dot indicators (w-2 h-2 rounded-full) before text
- Real-time pulse animation only for "Sincronizando" state

### 5. Log Viewer
- Monospace font display
- Scrollable container with fixed height
- Line numbers optional
- Timestamp + Level + Message columns
- Filter by level (Info/Warning/Error)

### 6. XML File Browser
- Tree/folder structure: CNPJ → Year → Month → Files
- Expandable/collapsible folders
- File icons and size display
- Download button per file
- Search/filter by date range or CNPJ

### 7. Navigation
- Vertical sidebar with icons + text labels
- Active state: Subtle background fill
- Hover state: Light background
- Icon size: w-5 h-5

### 8. Buttons
**Primary:** Solid background for main actions (Cadastrar, Salvar)
**Secondary:** Outlined for cancel/back actions
**Icon Buttons:** For table actions (edit/delete) - w-8 h-8 rounded-md
**Sizes:** px-4 py-2 for standard, px-6 py-3 for prominent

### 9. Data Display
- Definition lists for company details
- Stat cards with large numbers (text-3xl font-bold)
- Progress indicators for sync status
- Empty states with helpful illustrations and CTAs

---

## Animations

**Minimal Use Only:**
- Loading spinners for async operations
- Subtle fade-in for newly loaded content (duration-200)
- Pulse animation for "Sincronizando" badge
- No page transitions or decorative animations

---

## Page-Specific Layouts

### Dashboard Page
- 4-column stat cards at top (grid-cols-4)
- Recent activity feed below (2-column: Recent XMLs | Sync Logs)
- Quick actions card for adding new company

### Empresas Page
- Header with search bar + "Nova Empresa" button
- Data table with all companies
- Click row to expand details or edit inline

### Logs Page
- Filter toolbar at top (date range, level, company)
- Full-width log viewer with virtual scrolling
- Export logs button

### Configurações Page
- Tabbed interface: Geral, Agendamento, Notificações
- Form-based configuration with clear sections
- Sync interval configuration (hourly by default, adjustable)

---

## Professional Polish

- Consistent spacing rhythm throughout (multiples of 4)
- Clear visual separation between sections using borders/backgrounds
- Breadcrumbs for navigation context
- Toast notifications for success/error feedback
- Confirmation modals for destructive actions (delete company)
- Responsive design: Sidebar collapses to hamburger menu on mobile
- Loading states for all async operations
- Error states with retry options