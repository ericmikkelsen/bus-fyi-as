# bus-fyi-as

Bus schedules using AssemblyScript - A static site generator for GTFS transit data.

## About

This project is a static site generator built with [Vite](https://vitejs.dev/) and [AssemblyScript](https://www.assemblyscript.org/) that reads GTFS (General Transit Feed Specification) data and generates HTML files for displaying transit information.

## Project Structure

Inspired by [astro.build](https://github.com/withastro/astro) project structure:

- **dist/** - Build folder with generated static site (not git tracked)
- **src/** - Source code
  - **src/assembly/** - AssemblyScript modules and components
  - **src/style.css** - CSS styling
  - **src/generate.ts** - Static site generator script
- **data/** - GTFS data with one folder per agency (not git tracked)
- **public/** - Static assets

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

```bash
npm install
```

### Quick Start with BART Data

1. Create the BART data directory:
   ```bash
   mkdir -p data/bart
   ```

2. Download and extract BART GTFS data:
   ```bash
   # Download from: https://www.bart.gov/sites/default/files/2025-12/google_transit_20250811-20251231_v03.zip
   # Extract the zip file contents to data/bart/
   ```

3. Generate stop pages:
   ```bash
   npm run generate:stops
   ```

4. View the generated stop pages at `dist/stops/[stop-id]/index.html`

### Build AssemblyScript Modules

Compile the AssemblyScript modules to WebAssembly:

```bash
npm run asbuild
```

### Generate Static Site

Generate the main site pages:

```bash
npm run generate
```

Generate stop pages from GTFS data:

```bash
npm run generate:stops
```

Generate stop pages with performance optimizations (parallel processing):

```bash
npm run generate:stops:fast
```

**Recommended for large datasets** (10,000+ stops). Uses worker threads and write streams for 5x speedup.

Generate stop pages with ultra-performance optimizations:

```bash
npm run generate:stops:ultra
```

**Maximum performance** for production builds. Adds fast CSV parsing, pre-built indexes, Buffer-based writes, and increased parallelization for 8x speedup. See `docs/ULTRA-PERFORMANCE.md` for details.

### Development

Start the development server:

```bash
npm run dev
```

### Build for Production

Build the complete static site:

```bash
npm run build
```

### Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## GTFS Data

Place your GTFS data in the `data/` directory with one subdirectory per transit agency. See `data/README.md` for more information on GTFS file formats and where to obtain data.

## Technology Stack

- **[Vite](https://vitejs.dev/)** - Build tool and dev server
- **[AssemblyScript](https://www.assemblyscript.org/)** - TypeScript-like language that compiles to WebAssembly
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **WebAssembly** - High-performance binary format for the web

## Features

- 🚀 Fast builds with Vite
- ⚡ High-performance WebAssembly modules
- 📊 GTFS data processing
- 🎨 Responsive design
- 📱 Mobile-friendly
- 🌙 Dark/light mode support

## License

MIT

