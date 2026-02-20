# LieDetector Chrome Extension

Real-time fact verification as you browse. Highlights claims with sources and confidence levels.

## Features

- **Automatic Claim Detection**: Uses NLP-based extraction via backend service
- **Manual Verification**: Right-click any text and select "Check this claim"  
- **Overlay Highlighting**: Non-destructive highlights that survive page re-renders (React/Vue/Angular)
- **Smart Tooltips**: Hover over highlights to see verification details, sources, and confidence levels
- **Multi-node Text Support**: Correctly highlights text spanning multiple DOM elements

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Backend API running on port 3001
- NLP service running on port 3002 (optional, for NLP extraction mode)

### Installation

```bash
cd lie_detector
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
5. Select the `lie_detector/dist` folder

### Development Workflow

1. Run `npm run dev` for watch mode
2. Make changes to source files
3. Click the refresh icon on the extension card in `chrome://extensions/`
4. Reload the test page

## Project Structure

```
lie_detector/
├── manifest.json          # Extension manifest (MV3)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── webpack.config.js      # Build configuration
├── icons/                 # Extension icons
├── src/
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts
│   ├── content/           # Content script (runs on web pages)
│   │   ├── index.ts       # Entry point, message handling
│   │   ├── claimDetector.ts  # Pattern-based claim detection
│   │   └── highlighter.ts    # Overlay highlights & tooltips
│   ├── background/        # Service worker (background)
│   │   └── serviceWorker.ts  # API calls, context menu
│   ├── popup/             # Popup UI (React)
│   │   ├── popup.html
│   │   ├── index.tsx
│   │   └── App.tsx
│   └── styles/
│       └── content.css    # Injected page styles
└── dist/                  # Built extension (gitignored)
```

## Architecture

### Content Script (`src/content/`)
Runs on every page to:
- Detect verifiable claims using pattern matching or NLP extraction
- Create overlay highlights positioned over text (doesn't modify page DOM)
- Show tooltips with verification details on hover
- Handle selection caching for context menu verification
- Manage DOM mutation observers for dynamic pages

### Background Service Worker (`src/background/`)
Handles:
- Communication with verification API (port 3001)
- Context menu "Check this claim" functionality
- Badge updates showing claim counts
- Message passing between content scripts and backend

### Popup (`src/popup/`)
React-based UI showing:
- Extension enable/disable toggle
- Page statistics (claims found, verified, issues)
- List of detected claims with ratings
- Extraction mode toggle (Pattern/NLP)

## Verification Flow

1. User loads a page or selects text
2. Content script detects claims or user right-clicks "Check this claim"
3. Background script sends claims to backend API
4. Backend queries Google Fact Check API, falls back to OpenAI analysis
5. Verification results sent back to content script
6. Overlays updated with color-coded ratings

## Rating Colors

| Rating | Color | Description |
|--------|-------|-------------|
| `verified` | Green | Confirmed true |
| `mostly_true` | Light Green | Mostly accurate |
| `mixed` | Yellow | Contains both true and false |
| `mostly_false` | Orange | Mostly inaccurate |
| `false` | Red | Confirmed false |
| `unverified` | Gray (dotted) | No fact-checks found |

## Troubleshooting

### Highlights disappear after DOM changes
The extension uses stored rect positions as fallback when text can't be re-found in DOM.

### Tooltip flashing
Ensure the backend is responding quickly. Slow responses can cause UI issues.

### Claims not being verified
1. Check that backend is running on port 3001
2. Check browser console for errors
3. Verify API keys are configured in backend `.env`
