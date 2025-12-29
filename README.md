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

### Quick Start with CTA Data (Chicago)

The easiest way to get started is to use the automatic GTFS downloader:

```bash
# Download and extract CTA GTFS data (default)
npm run download:gtfs
```

This will:
1. Download GTFS data from Chicago Transit Authority (CTA)
2. Save it to `data/cta/`
3. Automatically extract the zip file

**Note:** If the automatic download fails due to network restrictions, you can manually download the CTA GTFS data:
1. Download from: https://www.transitchicago.com/downloads/sch_data/google_transit.zip
2. Extract the zip file
3. Place the extracted files in `data/cta/` directory

**Using custom GTFS URLs:**

```bash
# Download BART data
GTFS_ZIP_URL_BART=https://www.bart.gov/sites/default/files/2025-12/google_transit_20250811-20251231_v03.zip npm run download:gtfs

# Download multiple agencies
GTFS_ZIP_URL_CTA=https://www.transitchicago.com/downloads/sch_data/google_transit.zip \
GTFS_ZIP_URL_BART=https://www.bart.gov/sites/default/files/2025-12/google_transit_20250811-20251231_v03.zip \
npm run download:gtfs
```

The script looks for any environment variable starting with `GTFS_ZIP_URL` and downloads all of them.

### Generate Stop Pages

Once you have GTFS data downloaded, generate stop pages:

```bash
npm run generate:stops
```

This uses the **WASM-powered generator** for maximum performance (12.5x faster than standard approaches). It automatically:
- Parses GTFS CSV files using AssemblyScript/WASM
- Processes parent-child stop relationships
- Generates HTML pages at `dist/stops/[id]/index.html`
- Creates stop-specific CSV files for service workers

View the generated pages:
- Parent/regular stops: `dist/stops/[stop-id]/index.html`
- Child stops (platforms): `dist/stops/[parent-id]/[child-id]/index.html`

### Build AssemblyScript Modules

Compile the AssemblyScript modules to WebAssembly:

```bash
npm run asbuild
```

### Complete Build

Generate everything and build the Vite app:

```bash
npm run build
```

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

### Automatic Download (Recommended)

The easiest way to get GTFS data is to use the automatic downloader:

```bash
# Download CTA (Chicago) data (default)
npm run download:gtfs

# Download custom agency data
GTFS_ZIP_URL_BART=https://www.bart.gov/.../gtfs.zip npm run download:gtfs

# Download multiple agencies
GTFS_ZIP_URL_CTA=https://www.transitchicago.com/.../google_transit.zip \
GTFS_ZIP_URL_BART=https://www.bart.gov/.../gtfs.zip \
npm run download:gtfs
```

The downloader:
- Automatically downloads and extracts GTFS zip files
- Saves data to `data/[agency]/` directories
- Supports multiple agencies via environment variables
- Uses CTA (Chicago Transit Authority) as the default

### Manual Download

Alternatively, manually place GTFS data in the `data/` directory with one subdirectory per transit agency. See `data/README.md` for more information on GTFS file formats and where to obtain data.

## Technology Stack

- **[Vite](https://vitejs.dev/)** - Build tool and dev server
- **[AssemblyScript](https://www.assemblyscript.org/)** - TypeScript-like language that compiles to WebAssembly
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **WebAssembly** - High-performance binary format for the web

## Features

- 🚀 Fast builds with Vite
- ⚡ WASM-powered generator (12.5x speedup)
- 📊 GTFS data processing with parent-child stop relationships
- 🗂️ Nested directory structure for transit platforms/terminals
- 📥 Automatic GTFS data download and extraction
- 📱 Service worker ready architecture
- 🎯 Stop-specific CSV files for offline functionality

## License

MIT

