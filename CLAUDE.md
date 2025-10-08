# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Linkscanner is a CLI tool and Node.js library for recursively scanning websites to check for broken links, CSS, JavaScript files, and other resources. It can check both HTML pages (using cheerio to parse links) and JSON APIs (using JSONPath selectors).

## Development Commands

### Testing
- `npm test` or `jest` - Run all tests
- `jest path/to/file.test.ts` - Run a specific test file
- Test files are located alongside source files with `.test.ts` extension

### Building
- `npm run build` or `tsc` - Compile TypeScript to JavaScript (output to `dist/`)
- `npm run check-types` or `tsc --noemit` - Type check without building
- `npm run clean` - Remove build artifacts

### Linting
- `npm run lint` - Check code style
- `npm run fix` - Auto-fix linting issues

### Development Testing
- `bin/dev <url>` - Run linkscanner directly from TypeScript source (uses Babel register)
  - Note: This script uses `-S` flag in shebang for passing node options
- `node bin/linkscanner <url>` - Run the compiled CLI

## Architecture

### Stream-Based Pipeline

The core architecture is a Node.js streaming pipeline that processes URLs through multiple transformation stages:

1. **Source** (`src/source.ts`) - Takes input URLs and creates a Readable stream
2. **Build Pipeline** (`src/build_pipeline.ts`) - The main orchestrator that:
   - Parses URLs and tracks source hostnames
   - Uses a **Reentry** stream to handle recursive crawling (pushes EOF markers and manages recursion depth)
   - Routes chunks through the Fetcher
   - Splits into two paths via **DivergentStreamWrapper**:
     - Leaf nodes (external links, images, etc.) - just checked with HEAD requests
     - Non-leaf nodes (same-host HTML/JSON) - fetched with GET and parsed for more links
3. **Fetcher** (`src/fetcher.ts`) - Handles HTTP requests:
   - Respects robots.txt rules (via vendored robots-parser)
   - Uses HEAD for leaf nodes, GET for parseable content
   - Wrapped by **FetchInterfaceWrapper** for rate limiting and request pooling
4. **Parsers** (`src/parsers/`) - Extract URLs from responses:
   - `cheerio-parser.ts` - Parses HTML using CSS selectors (links, images, scripts, etc.)
   - `json-parser.ts` - Uses JSONPath to extract URLs from JSON responses
   - `regexp-parser.ts` - Fallback regex-based parser for other content types
5. **Formatters** (`src/formatters/`) - Output results as console, table, CSV, or JSON

### Key Components

- **Reentry** (`src/reentry.ts`) - Critical for recursive crawling. Manages recursion depth limits and EOF propagation through the pipeline
- **DivergentStreamWrapper** (`src/divergent_stream_wrapper.ts`) - Splits the stream into leaf/non-leaf paths that rejoin later
- **HostnameSet** (`src/hostname_set.ts`) - Tracks which hostnames should be crawled recursively vs. just checked
- **FetchInterfaceWrapper** (`src/fetch_interface.ts`) - Wraps cross-fetch with rate limiting, timeout, and custom headers

### Important Patterns

- The pipeline uses object-mode streams with `highWaterMark: 0` for backpressure control
- EOF chunks (special sentinel objects) flow through the pipeline to signal end-of-recursion at each depth level
- Results are typed as `SuccessResult`, `ErrorResult`, or `SkippedResult` (see `src/model/`)

## Dependencies

### Runtime
- **cheerio** v1.x - HTML parsing. IMPORTANT: Must use `import * as cheerio from 'cheerio'` (namespace import), not default import
- **cross-fetch** - Isomorphic fetch API
- **async-toolbox** - Stream utilities and async helpers
- **jsonpath-plus** - JSONPath queries for JSON parsing
- **yargs** - CLI argument parsing

### Development
- **jest** - Testing framework
- **typescript** - Type checking and compilation
- **@babel/register** - Runtime TypeScript compilation for `bin/dev`
- **eslint** - Linting

## Common Gotchas

- Cheerio import syntax changed in v1.x - must use namespace import
- The `bin/dev` script requires `-S` flag in shebang for node options
- Timeout values in CLI are in seconds but internally converted to milliseconds
- Test files use fetch-mock to mock HTTP requests
