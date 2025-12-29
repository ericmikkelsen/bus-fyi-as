# Source Directory Structure

This directory follows the [Astro project structure](https://docs.astro.build/en/basics/project-structure/) pattern.

## Directory Overview

```
src/
├── components/     # UI component parts (buttons, lists, headings, etc.)
├── layouts/        # Page layouts with html, head, body structure  
├── pages/          # Complete pages combining layouts and components
├── modules/        # Utilities, helpers, and AssemblyScript modules
│   ├── assembly/   # AssemblyScript source files (compiled to WASM)
│   └── *.mjs       # JavaScript/Node.js helper modules
└── *.css           # Styles
```

## Components (`src/components/`)

**Purpose**: Reusable UI parts that return markup strings

Components are written in AssemblyScript and compiled to WebAssembly for performance. They represent individual UI elements like:
- `StopHeader.ts` - Header section for stop pages
- `TerminalsList.ts` - List of child terminals
- `ScheduleList.ts` - Schedule entries and hour headers

**Usage**: Components are imported and called from pages or layouts

## Layouts (`src/layouts/`)

**Purpose**: Define the basic HTML structure (html, head, body tags)

Layouts provide the wrapper structure for pages. Written in AssemblyScript:
- `BaseLayout.ts` - Basic HTML document structure

**Usage**: Pages call layouts to wrap their content

## Pages (`src/pages/`)

**Purpose**: Complete pages that combine layouts with components and content

Pages orchestrate the assembly of components within layouts. Written in AssemblyScript:
- `StopPage.ts` - Generates complete stop pages

**Usage**: Generator scripts call page functions to create HTML output

## Modules (`src/modules/`)

**Purpose**: Utilities, helpers, and core logic

### AssemblyScript Modules (`src/modules/assembly/`)

AssemblyScript code compiled to WebAssembly:
- `index.ts` - Main entry point, exports all AS functions
- `gtfs.ts` - GTFS data structures
- `html-generator.ts` - Legacy HTML utilities

### JavaScript Modules (`src/modules/*.mjs`)

Node.js utilities for build-time operations:
- `gtfs-parser.mjs` - Parses GTFS CSV files

## Design for Service Workers

The AssemblyScript components, layouts, and pages are designed to work in both:
- **Node.js** (for build-time generation)
- **Service Workers** (for runtime generation and caching)

This means:
- No Node.js-specific APIs in AssemblyScript code
- Pure functions that take strings and return strings
- Data fetching happens outside of AS components

## Build Process

1. **Compile AssemblyScript**: `npm run asbuild`
   - Compiles `src/modules/assembly/index.ts` (which imports components/layouts/pages)
   - Outputs to `dist/debug.wasm` and `dist/release.wasm`

2. **Generate Pages**: `npm run generate:stops`
   - Loads compiled WASM module
   - Reads GTFS data with Node.js
   - Calls AS functions to generate HTML
   - Writes files to `dist/stops/`
     - Parent/regular stops: `dist/stops/[stop-id]/index.html`
     - Child stops (platforms): `dist/stops/[parent-id]/[child-id]/index.html`

## Example: Creating a New Component

```typescript
// src/components/RouteCard.ts

/**
 * Generates a route card
 */
export function RouteCard(routeNumber: string, routeName: string): string {
  return `<div class="route-card">
  <span class="route-number">${routeNumber}</span>
  <span class="route-name">${routeName}</span>
</div>`;
}
```

Then export it in `src/modules/assembly/index.ts`:

```typescript
export { RouteCard } from '../../components/RouteCard';
```

Use it in a page or generator:

```javascript
const html = wasmModule.RouteCard('1', 'Downtown Express');
```
