/**
 * Content Script Entry Point
 * 
 * Runs on every page to detect and highlight health/medical claims
 */

import { detectClaims, detectClaimsInSelection } from './claimDetector';
import { highlightClaim, updateVerification, removeAllHighlights, refreshOverlayPositions } from './highlighter';
import { 
  ExtensionSettings, 
  DEFAULT_SETTINGS, 
  ClaimVerifiedMessage,
  NlpClaimsDetectedMessage,
  DetectedClaim,
  Verification,
  Claim
} from '@/types';

let settings: ExtensionSettings = DEFAULT_SETTINGS;
let isInitialized = false;
let detectedClaims: DetectedClaim[] = [];
// Store verifications so we can re-apply them after re-render
const verificationCache = new Map<string, Verification>();

// Throttle function for scroll/resize handlers
function throttle<T extends (...args: unknown[]) => void>(
  func: T, 
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function(this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

async function loadSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (result) => {
      resolve(result.settings || DEFAULT_SETTINGS);
    });
  });
}

function shouldRunOnPage(): boolean {
  const hostname = window.location.hostname;
  
  // Check disabled domains
  if (settings.disabledDomains.includes(hostname)) {
    return false;
  }
  
  // If enabled domains is set, only run on those
  if (settings.enabledDomains.length > 0) {
    return settings.enabledDomains.includes(hostname);
  }
  
  return settings.enabled;
}

function scanPage(): void {
  if (!shouldRunOnPage()) {
    console.log('[LieDetector] Disabled for this page');
    return;
  }
  
  // Check if we should use NLP extraction
  if (settings.useNlpExtraction) {
    console.log('[LieDetector] Using NLP-based claim extraction');
    scanPageWithNlp();
    return;
  }
  
  // Fallback to pattern-based detection
  detectedClaims = detectClaims(document.body);
  
  if (detectedClaims.length === 0) {
    console.log('[LieDetector] No claims detected');
    return;
  }
  
  console.log(`[LieDetector] Found ${detectedClaims.length} claims, highlighting...`);
  
  // Highlight all detected claims (initially as unverified)
  for (const detected of detectedClaims) {
    highlightClaim(detected);
  }
  
  // Send claims to background for verification
  chrome.runtime.sendMessage({
    type: 'VERIFY_CLAIMS',
    payload: {
      claims: detectedClaims.map(d => d.claim),
      url: window.location.href,
    },
  });
  
  // Notify popup about scan results
  chrome.runtime.sendMessage({
    type: 'PAGE_SCANNED',
    payload: {
      claimCount: detectedClaims.length,
      url: window.location.href,
    },
  });
}

/**
 * Extract text from the page for NLP processing
 * Filters out scripts, styles, navigation, ads, etc.
 */
function extractPageText(): string {
  const excludeSelectors = [
    'script', 'style', 'noscript', 'iframe',
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.ad', '.ads', '.advertisement', '[data-ad]',
    '.sidebar', '.menu', '.nav', '.navigation',
    '.comment', '.comments', '#comments',
    '.social', '.share', '.sharing',
  ];
  
  // Clone body and remove unwanted elements
  const clone = document.body.cloneNode(true) as HTMLElement;
  
  for (const selector of excludeSelectors) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }
  
  // Get text content
  const text = clone.textContent || '';
  
  // Clean up whitespace
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Scan page using NLP-based extraction on the backend
 */
function scanPageWithNlp(): void {
  const pageText = extractPageText();
  
  if (pageText.length < 100) {
    console.log('[LieDetector] Page text too short for NLP extraction');
    return;
  }
  
  console.log(`[LieDetector] Sending ${pageText.length} chars to NLP service`);
  
  // Send text to background for NLP extraction and verification
  chrome.runtime.sendMessage({
    type: 'EXTRACT_AND_VERIFY',
    payload: {
      text: pageText,
      url: window.location.href,
      maxClaims: 20,
    },
  });
}

/**
 * Handle NLP claims detected from the backend
 * Creates DetectedClaim objects by finding the text in the DOM
 */
function handleNlpClaimsDetected(message: NlpClaimsDetectedMessage): void {
  const { claims, verifications } = message.payload;
  
  console.log(`[LieDetector] Received ${claims.length} NLP-extracted claims`);
  
  // Build a map of verifications by claimId
  const verificationMap = new Map<string, Verification>();
  for (const v of verifications) {
    verificationMap.set(v.claimId, v.verification);
  }
  
  // Cache verifications for later re-application
  for (const [id, verification] of verificationMap) {
    verificationCache.set(id, verification);
  }
  
  // Find each claim in the DOM and create highlights
  for (const claim of claims) {
    const detected = findClaimInDom(claim);
    if (detected) {
      detectedClaims.push(detected);
      highlightClaim(detected);
      
      // If we have a verification, apply it immediately
      const verification = verificationMap.get(claim.id);
      if (verification) {
        updateVerification(claim.id, verification);
      }
    } else {
      console.debug(`[LieDetector] Could not find claim in DOM: "${claim.text.substring(0, 50)}..."`);
    }
  }
  
  // Notify popup about scan results
  chrome.runtime.sendMessage({
    type: 'PAGE_SCANNED',
    payload: {
      claimCount: detectedClaims.length,
      url: window.location.href,
    },
  });
}

/**
 * Find a claim text in the DOM and create a DetectedClaim
 */
function findClaimInDom(claim: { id: string; text: string; claimType: string; confidence: number }): DetectedClaim | null {
  const trimmedText = claim.text.trim();
  // Use first 80 chars for matching (handles line breaks etc)
  const searchText = trimmedText.substring(0, 80);
  
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while ((node = walker.nextNode())) {
    const textContent = node.textContent || '';
    const index = textContent.indexOf(searchText);
    
    if (index !== -1) {
      try {
        const range = document.createRange();
        const endOffset = Math.min(index + trimmedText.length, textContent.length);
        range.setStart(node, index);
        range.setEnd(node, endOffset);
        
        const element = node.parentElement;
        if (!element) continue;
        
        const fullClaim: Claim = {
          id: claim.id,
          text: trimmedText,
          normalizedText: trimmedText.toLowerCase(),
          claimType: claim.claimType as Claim['claimType'],
          entities: [],
          extractedFrom: {
            url: window.location.href,
            domain: window.location.hostname,
            timestamp: new Date(),
          },
        };
        
        return {
          claim: fullClaim,
          element,
          range,
        };
      } catch (e) {
        console.debug('[LieDetector] Failed to create range for NLP claim:', e);
      }
    }
  }
  
  return null;
}

function handleSelectionVerify(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  
  const text = selection.toString().trim();
  if (text.length < 10) {
    console.log('[LieDetector] Selection too short to verify');
    return;
  }
  
  // Create a claim from the selection directly (don't require pattern matching)
  const claimId = `selection_${Date.now()}`;
  const claim: Claim = {
    id: claimId,
    text: text,
    normalizedText: text.toLowerCase().trim(),
    claimType: 'statistic', // default type for manual selection
    entities: [],
    extractedFrom: {
      url: window.location.href,
      domain: window.location.hostname,
      timestamp: new Date(),
    },
  };
  
  // Get the range from selection
  const range = selection.getRangeAt(0);
  const element = range.commonAncestorContainer.parentElement;
  
  if (!element) return;
  
  const detected: DetectedClaim = {
    claim,
    element,
    range: range.cloneRange(),
  };
  
  // Highlight immediately (will show as "unverified" until backend responds)
  highlightClaim(detected);
  detectedClaims.push(detected);
  
  console.log('[LieDetector] Manual selection highlighted:', text.substring(0, 50));
  
  // Send to background for verification
  chrome.runtime.sendMessage({
    type: 'VERIFY_SELECTION',
    payload: {
      claimId: claimId,
      text: text,
      url: window.location.href,
    },
  });
}

/**
 * Handle VERIFY_SELECTION message from background (context menu click)
 */
function handleVerifySelectionFromBackground(text: string, claimId?: string): void {
  const selection = window.getSelection();
  
  // Try to use current selection if it matches
  if (selection && !selection.isCollapsed && selection.toString().trim() === text.trim()) {
    // Use the existing selection - better for highlighting
    handleSelectionVerify();
    return;
  }
  
  // Otherwise, search for the text in the document
  const trimmedText = text.trim();
  if (trimmedText.length < 10) return;
  
  // Find the text in the DOM
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while ((node = walker.nextNode())) {
    const textContent = node.textContent || '';
    const index = textContent.indexOf(trimmedText.substring(0, 50));
    
    if (index !== -1) {
      try {
        const range = document.createRange();
        const endOffset = Math.min(index + trimmedText.length, textContent.length);
        range.setStart(node, index);
        range.setEnd(node, endOffset);
        
        const element = node.parentElement;
        if (!element) continue;
        
        const id = claimId || `selection_${Date.now()}`;
        const claim: Claim = {
          id: id,
          text: trimmedText,
          normalizedText: trimmedText.toLowerCase(),
          claimType: 'statistic',
          entities: [],
          extractedFrom: {
            url: window.location.href,
            domain: window.location.hostname,
            timestamp: new Date(),
          },
        };
        
        const detected: DetectedClaim = {
          claim,
          element,
          range,
        };
        
        highlightClaim(detected);
        detectedClaims.push(detected);
        
        console.log('[LieDetector] Context menu selection highlighted:', trimmedText.substring(0, 50));
        return;
      } catch (e) {
        console.debug('[LieDetector] Failed to create range for selection:', e);
      }
    }
  }
  
  console.log('[LieDetector] Could not find selection text in DOM');
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'CLAIM_VERIFIED': {
      const { claimId, verification } = (message as ClaimVerifiedMessage).payload;
      // Cache for re-application on re-render
      verificationCache.set(claimId, verification);
      updateVerification(claimId, verification);
      return false;
    }
    
    case 'NLP_CLAIMS_DETECTED': {
      // Handle claims extracted via NLP on the backend
      handleNlpClaimsDetected(message as NlpClaimsDetectedMessage);
      return false;
    }
    
    case 'VERIFY_SELECTION': {
      // Context menu clicked - highlight and verify the selection
      const { text, claimId } = message.payload;
      handleVerifySelectionFromBackground(text, claimId);
      return false;
    }
    
    case 'GET_PAGE_CLAIMS': {
      sendResponse({
        claims: detectedClaims.map(d => d.claim),
        url: window.location.href,
      });
      return true; // Keep channel open for response
    }
    
    case 'UPDATE_SETTINGS': {
      settings = message.payload as ExtensionSettings;
      if (!settings.enabled) {
        removeAllHighlights();
      } else if (!isInitialized) {
        scanPage();
      }
      return false;
    }
    
    case 'RESCAN_PAGE': {
      removeAllHighlights();
      detectedClaims = [];
      scanPage();
      return false;
    }
  }
  
  return false;
});

// Initialize on DOM ready
async function initialize(): Promise<void> {
  if (isInitialized) return;
  
  settings = await loadSettings();
  
  if (!settings.enabled) {
    console.log('[LieDetector] Extension disabled');
    return;
  }
  
  isInitialized = true;
  
  // Wait a bit for dynamic content to load
  setTimeout(() => {
    scanPage();
  }, 1000);
  
  // Refresh overlay positions on DOM changes and scroll
  // The new overlay approach doesn't modify DOM, so we just need to update positions
  const observer = new MutationObserver(
    throttle(() => {
      console.log('[LieDetector] DOM changed, refreshing overlay positions...');
      refreshOverlayPositions();
    }, 500)
  );
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Refresh on scroll (text positions change)
  let scrollTimeout: number | null = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = window.setTimeout(() => {
      refreshOverlayPositions();
    }, 100);
  }, { passive: true });
  
  // Refresh on resize
  window.addEventListener('resize', throttle(() => {
    refreshOverlayPositions();
  }, 200));
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Expose for context menu "Check this" functionality
(window as unknown as { LieDetectorVerifySelection: () => void }).LieDetectorVerifySelection = handleSelectionVerify;

console.log('[LieDetector] Content script loaded');
