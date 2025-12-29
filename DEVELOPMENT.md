# Development Guide

## Project Overview

Bus FYI is a static site generator built with Vite and AssemblyScript that processes GTFS (General Transit Feed Specification) data and generates static HTML pages.

## Architecture

### Technology Stack

- **Vite**: Build tool and development server
- **AssemblyScript**: TypeScript-like language compiled to WebAssembly
- **TypeScript**: For build scripts and tooling
- **WebAssembly**: High-performance execution of data processing

### Project Structure

```
bus-fyi-as/
├── src/
│   ├── assembly/          # AssemblyScript source files
│   │   ├── index.ts       # Main entry point
│   │   ├── gtfs.ts        # GTFS data structures
│   │   └── html-generator.ts  # HTML generation utilities
│   ├── generator.mjs      # Node.js generator script
│   └── style.css          # Global styles
├── dist/                  # Generated output (gitignored)
│   ├── *.wasm            # Compiled WebAssembly modules
│   ├── *.html            # Generated HTML pages
│   └── style.css         # Copied styles
├── data/                  # GTFS data (gitignored)
│   ├── README.md         # GTFS documentation
│   └── [agency-name]/    # Agency-specific GTFS files
├── public/               # Static assets
├── tests/                # Test files
└── index.html           # Development server index
```

## Development Workflow

### 1. Install Dependencies

```bash
npm install
```

### 2. Build AssemblyScript Modules

Compile AssemblyScript to WebAssembly:

```bash
npm run asbuild
```

This creates:
- `dist/debug.wasm` - Debug build with source maps
- `dist/release.wasm` - Optimized production build

### 3. Generate Static Site

Run the static site generator:

```bash
npm run generate
```

This will:
1. Build the AssemblyScript modules
2. Load the compiled WASM modules
3. Generate HTML pages (index.html, routes.html, stops.html)
4. Copy CSS styles to dist/

### 4. Development Server

Start the Vite development server:

```bash
npm run dev
```

Access at `http://localhost:5173/`

### 5. Run Tests

```bash
npm test
```

## Adding GTFS Data

1. Create a directory in `data/` for your transit agency:
   ```bash
   mkdir data/my-agency
   ```

2. Download GTFS files from your transit agency and extract into the directory

3. Required GTFS files:
   - `agency.txt`
   - `routes.txt`
   - `stops.txt`
   - `trips.txt`
   - `stop_times.txt`
   - `calendar.txt`

4. Run the generator to process the data:
   ```bash
   npm run generate
   ```

## Extending the Generator

### Adding New AssemblyScript Modules

1. Create a new `.ts` file in `src/assembly/`
2. Write your AssemblyScript code
3. Export functions from `src/assembly/index.ts`
4. Rebuild with `npm run asbuild`

### Adding New HTML Pages

Modify `src/generator.mjs` to add new page generation logic:

```javascript
const newPageContent = generatePage('Title', '<h2>Content</h2>');
writeFileSync(join(distDir, 'newpage.html'), newPageContent);
```

## Build Commands Reference

- `npm run dev` - Start development server
- `npm run build` - Full production build (asbuild + generate + vite build)
- `npm run generate` - Generate static site from GTFS data
- `npm run asbuild` - Build both debug and release WASM
- `npm run asbuild:debug` - Build debug WASM only
- `npm run asbuild:release` - Build release WASM only
- `npm test` - Run tests
- `npm run preview` - Preview production build

## Tips

- Use `dist/debug.wasm` during development for better error messages
- Use `dist/release.wasm` for production (smaller, faster)
- The `data/` directory is gitignored - don't commit GTFS data
- Generated files in `dist/` are also gitignored

## Common Issues

### "Module not found" errors
Run `npm run asbuild` to compile the AssemblyScript modules first.

### HTML not updating
Run `npm run generate` to regenerate the HTML files.

### GTFS data not showing
Ensure your GTFS files are in the correct format and location in `data/[agency-name]/`.
