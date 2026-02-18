# LieDetector Chrome Extension

Real-time fact verification as you browse. Highlights claims with sources and confidence levels.

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
cd extension
npm install
```

### Build

```bash
# Development build (with watch mode)
npm run dev

# Production build
npm run build
```

### Load in Chrome

1. Run `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `extension/dist` folder

### Development Workflow

1. Run `npm run dev` for watch mode
2. Make changes to source files
3. Click the refresh icon on the extension card in `chrome://extensions/`
4. Reload the test page

## Project Structure

```
extension/
├── manifest.json          # Extension manifest (MV3)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── webpack.config.js      # Build configuration
├── icons/                 # Extension icons
├── src/
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts
│   ├── content/           # Content script (runs on web pages)
│   │   ├── index.ts       # Entry point
│   │   ├── claimDetector.ts  # Claim detection logic
│   │   └── highlighter.ts    # Highlight & tooltip rendering
│   ├── background/        # Service worker (background)
│   │   └── serviceWorker.ts
│   ├── popup/             # Popup UI (React)
│   │   ├── popup.html
│   │   ├── index.tsx
│   │   └── App.tsx
│   ├── services/          # Shared services
│   │   └── mockVerificationService.ts
│   └── styles/
│       └── content.css    # Injected page styles
└── dist/                  # Built extension (gitignored)
```

## Architecture

### Content Script
Runs on every page to:
- Detect verifiable health claims using pattern matching
- Highlight claims with color-coded underlines
- Show tooltips with verification details on hover

### Background Service Worker
Handles:
- Communication with verification API (currently mocked)
- Context menu "Check this claim" functionality
- Badge updates showing claim counts

### Popup
React-based UI showing:
- Extension enable/disable toggle
- Page statistics (claims found, verified, issues)
- List of detected claims
- Links to methodology and settings

## MVP Limitations

This is an MVP scaffold. Current limitations:

1. **Mock Verification**: Uses randomized mock data instead of real API
2. **Pattern-Based Detection**: Uses regex + keywords instead of NLP
3. **Health Focus**: Only detects health/medical claims
4. **No Human Review**: All verifications are automated
5. **No Persistence**: Claims aren't cached between page loads

## Next Steps

See [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) for the full roadmap.

Immediate priorities:
1. Replace mock service with real backend API
2. Implement NLP-based claim extraction
3. Curate initial health source database
4. Add user settings panel
5. Implement claim caching

## Icons

The SVG icons need to be converted to PNG for Chrome:

```bash
# Using ImageMagick or similar tool
convert icon16.svg icon16.png
convert icon48.svg icon48.png
convert icon128.svg icon128.png
```

Or create proper PNG icons using a design tool.
