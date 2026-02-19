/**
 * Content Script Entry Point
 * 
 * Runs on every page to detect and highlight health/medical claims
 */

import { detectClaims, detectClaimsInSelection } from './claimDetector';
import { highlightClaim, updateVerification, removeAllHighlights } from './highlighter';
import { 
  ExtensionSettings, 
  DEFAULT_SETTINGS, 
  ClaimVerifiedMessage,
  DetectedClaim,
  Verification
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
  
  // Detect claims
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

function handleSelectionVerify(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  
  const selectedClaims = detectClaimsInSelection(selection);
  if (selectedClaims.length === 0) return;
  
  // Highlight and verify
  for (const detected of selectedClaims) {
    highlightClaim(detected);
    detectedClaims.push(detected);
  }
  
  chrome.runtime.sendMessage({
    type: 'VERIFY_SELECTION',
    payload: {
      text: selection.toString(),
      url: window.location.href,
    },
  });
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
  
  // Re-apply highlights on DOM changes (for SPAs and virtual scrolling)
  const observer = new MutationObserver(
    throttle(() => {
      console.log('[LieDetector] DOM changed, re-applying highlights...');
      reapplyHighlights();
    }, 500)
  );
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Re-apply highlights to elements that match our detected claim texts
function reapplyHighlights(): void {
  if (detectedClaims.length === 0) return;
  
  for (const detected of detectedClaims) {
    // Check if current element is still valid and highlighted
    if (document.contains(detected.element) && 
        detected.element.classList.contains('LieDetector-highlight')) {
      continue; // Already highlighted and in DOM
    }
    
    // Find elements containing this claim text
    const searchText = detected.claim.text.substring(0, 30); // Use first 30 chars for matching
    
    // Use TreeWalker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(searchText)) {
        const parent = node.parentElement;
        if (parent && !parent.classList.contains('LieDetector-highlight')) {
          // Update the element reference
          detected.element = parent;
          // Get cached verification if available
          const cachedVerification = verificationCache.get(detected.claim.id);
          highlightClaim(detected, cachedVerification);
          break; // Found and highlighted, move to next claim
        }
      }
    }
  }
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
