/**
 * Highlighter - Uses overlay divs positioned over text (doesn't modify page DOM)
 * This approach survives React/Vue/Angular re-renders
 */

import { 
  DetectedClaim, 
  HighlightedClaim, 
  Verification, 
  Rating,
  RATING_COLORS, 
  RATING_LABELS 
} from '@/types';

const HIGHLIGHT_CLASS = 'LieDetector-highlight';
const TOOLTIP_CLASS = 'LieDetector-tooltip';
export const OVERLAY_CONTAINER_ID = 'LieDetector-overlay-container';

// Track all highlighted claims with their text for re-finding
interface TrackedClaim {
  claimId: string;
  claimText: string;
  verification?: Verification;
  overlayElements: HTMLElement[];
  // Store original rects relative to document for refresh
  originalRects?: Array<{ top: number; left: number; width: number; height: number }>;
}

const trackedClaims = new Map<string, TrackedClaim>();

// Global tooltip management - only one tooltip visible at a time
let activeTooltip: HTMLElement | null = null;
let activeTooltipClaimId: string | null = null;
let tooltipHideTimeout: number | null = null;

function hideActiveTooltip(): void {
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
    activeTooltipClaimId = null;
  }
}

function hideActiveTooltipDelayed(): void {
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
  }
  tooltipHideTimeout = window.setTimeout(() => {
    hideActiveTooltip();
  }, 300);
}

function cancelTooltipHide(): void {
  if (tooltipHideTimeout) {
    clearTimeout(tooltipHideTimeout);
    tooltipHideTimeout = null;
  }
}

function showTooltipForClaim(claimId: string): void {
  cancelTooltipHide();
  
  const tracked = trackedClaims.get(claimId);
  if (!tracked?.verification) return;
  
  // If same tooltip is already showing, just cancel hide
  if (activeTooltipClaimId === claimId && activeTooltip && document.body.contains(activeTooltip)) {
    return;
  }
  
  // Remove any existing tooltip
  hideActiveTooltip();
  
  // Create new tooltip
  activeTooltip = createTooltip(tracked.verification);
  activeTooltip.setAttribute('data-claim-id', claimId);
  activeTooltipClaimId = claimId;
  document.body.appendChild(activeTooltip);
  
  // Position tooltip near the first overlay
  if (tracked.overlayElements.length > 0) {
    const firstOverlay = tracked.overlayElements[0];
    const rect = firstOverlay.getBoundingClientRect();
    
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;
    
    // Reposition after getting tooltip dimensions
    requestAnimationFrame(() => {
      if (!activeTooltip) return;
      const tooltipRect = activeTooltip.getBoundingClientRect();
      
      if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 16;
      }
      if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
        top = rect.top + window.scrollY - tooltipRect.height - 8;
      }
      
      activeTooltip.style.top = `${top}px`;
      activeTooltip.style.left = `${Math.max(8, left)}px`;
      activeTooltip.classList.add('visible');
    });
  }
  
  // Allow hovering over tooltip
  activeTooltip.addEventListener('mouseenter', cancelTooltipHide);
  activeTooltip.addEventListener('mouseleave', hideActiveTooltipDelayed);
}

// Create or get the overlay container
function getOverlayContainer(): HTMLElement {
  let container = document.getElementById(OVERLAY_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = OVERLAY_CONTAINER_ID;
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: 2147483646;
    `;
    document.body.appendChild(container);
  }
  return container;
}

function createTooltip(verification: Verification): HTMLElement {
  const tooltip = document.createElement('div');
  tooltip.className = TOOLTIP_CLASS;
  
  const color = RATING_COLORS[verification.rating];
  const label = RATING_LABELS[verification.rating];
  
  tooltip.innerHTML = `
    <div class="LieDetector-tooltip-header" style="border-left: 3px solid ${color}">
      <span class="LieDetector-rating" style="color: ${color}">${label}</span>
      <span class="LieDetector-confidence">${Math.round(verification.confidence * 100)}% confidence</span>
    </div>
    <div class="LieDetector-tooltip-body">
      <p class="LieDetector-summary">${verification.summary}</p>
      ${verification.evidence.length > 0 ? `
        <div class="LieDetector-sources">
          <span class="LieDetector-sources-label">Sources:</span>
          <ul>
            ${verification.evidence.slice(0, 3).map(e => `
              <li>
                <a href="${e.url}" target="_blank" rel="noopener noreferrer">
                  ${e.sourceName}
                </a>
                ${e.peerReviewed ? '<span class="LieDetector-peer-reviewed" title="Peer Reviewed">✓</span>' : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      ${verification.caveats && verification.caveats.length > 0 ? `
        <div class="LieDetector-caveats">
          <span class="LieDetector-caveats-label">Note:</span>
          ${verification.caveats[0]}
        </div>
      ` : ''}
    </div>
  `;
  
  return tooltip;
}

/**
 * Find text in the DOM and return its bounding rectangles
 */
function findTextRects(searchText: string): DOMRect[] {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  // Try different search strategies
  const searchStrategies = [
    searchText.substring(0, 80),
    searchText.substring(0, 50),
    searchText.substring(0, 30),
  ].filter(s => s.length > 0);
  
  for (const search of searchStrategies) {
    walker.currentNode = document.body;
    
    let node;
    while ((node = walker.nextNode())) {
      const textContent = node.textContent || '';
      const index = textContent.indexOf(search);
      
      if (index !== -1) {
        try {
          const range = document.createRange();
          const endOffset = Math.min(index + searchText.length, textContent.length);
          range.setStart(node, index);
          range.setEnd(node, endOffset);
          
          // Get all client rects (text may wrap across lines)
          const rects = Array.from(range.getClientRects());
          if (rects.length > 0) {
            return rects;
          }
        } catch (e) {
          // Range creation can fail
        }
      }
    }
  }
  
  return [];
}

/**
 * Create overlay elements for the given rectangles
 */
function createOverlays(
  claimId: string,
  rects: DOMRect[], 
  rating: Rating
): HTMLElement[] {
  const container = getOverlayContainer();
  const color = RATING_COLORS[rating];
  const borderStyle = rating === 'unverified' ? 'dotted' : 'solid';
  const overlays: HTMLElement[] = [];
  
  for (const rect of rects) {
    // Skip tiny rects (likely whitespace)
    if (rect.width < 5 || rect.height < 5) continue;
    
    const overlay = document.createElement('div');
    overlay.className = HIGHLIGHT_CLASS;
    overlay.dataset.claimId = claimId;
    overlay.dataset.rating = rating;
    overlay.style.cssText = `
      position: absolute;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background-color: ${color}22;
      border-bottom: 2px ${borderStyle} ${color};
      pointer-events: auto;
      cursor: pointer;
      box-sizing: border-box;
    `;
    
    // Use global tooltip management
    overlay.addEventListener('mouseenter', () => showTooltipForClaim(claimId));
    overlay.addEventListener('mouseleave', hideActiveTooltipDelayed);
    
    container.appendChild(overlay);
    overlays.push(overlay);
  }
  
  return overlays;
}

/**
 * Create overlay elements from stored document-relative positions
 */
function createOverlaysFromStoredRects(
  claimId: string,
  rects: Array<{ top: number; left: number; width: number; height: number }>,
  rating: Rating
): HTMLElement[] {
  const container = getOverlayContainer();
  const color = RATING_COLORS[rating];
  const borderStyle = rating === 'unverified' ? 'dotted' : 'solid';
  const overlays: HTMLElement[] = [];
  
  for (const rect of rects) {
    // Skip tiny rects (likely whitespace)
    if (rect.width < 5 || rect.height < 5) continue;
    
    const overlay = document.createElement('div');
    overlay.className = HIGHLIGHT_CLASS;
    overlay.dataset.claimId = claimId;
    overlay.dataset.rating = rating;
    // Positions are already document-relative (include scroll offset from creation time)
    overlay.style.cssText = `
      position: absolute;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background-color: ${color}22;
      border-bottom: 2px ${borderStyle} ${color};
      pointer-events: auto;
      cursor: pointer;
      box-sizing: border-box;
    `;
    
    // Use global tooltip management
    overlay.addEventListener('mouseenter', () => showTooltipForClaim(claimId));
    overlay.addEventListener('mouseleave', hideActiveTooltipDelayed);
    
    container.appendChild(overlay);
    overlays.push(overlay);
  }
  
  return overlays;
}

/**
 * Remove overlays for a claim
 */
function removeOverlays(overlays: HTMLElement[]): void {
  for (const overlay of overlays) {
    overlay.remove();
  }
}

export function highlightClaim(
  detectedClaim: DetectedClaim, 
  verification?: Verification
): HighlightedClaim | null {
  const { claim, range } = detectedClaim;
  
  // Check if already tracked
  if (trackedClaims.has(claim.id)) {
    const tracked = trackedClaims.get(claim.id)!;
    if (verification) {
      updateVerification(claim.id, verification);
    }
    // Return a HighlightedClaim-compatible object
    return {
      claimId: claim.id,
      highlightElement: tracked.overlayElements[0] || document.createElement('div'),
      verification: tracked.verification,
    };
  }
  
  const rating = verification?.rating || 'unverified';
  
  // First try using the provided range (from selection) - works for multi-node text
  let rects: DOMRect[] = [];
  if (range) {
    try {
      rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      if (rects.length > 0) {
        console.debug('[LieDetector] Using selection range for highlighting:', claim.id);
      }
    } catch (e) {
      console.debug('[LieDetector] Could not get rects from range:', e);
    }
  }
  
  // Fall back to text search if range didn't work
  if (rects.length === 0) {
    rects = findTextRects(claim.text);
  }
  
  if (rects.length === 0) {
    console.debug('[LieDetector] Could not find text for claim:', claim.text.substring(0, 50));
    return null;
  }
  
  const overlays = createOverlays(claim.id, rects, rating);
  
  if (overlays.length === 0) {
    return null;
  }
  
  // Store original rects as document-relative positions for refresh
  const originalRects = rects.map(r => ({
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
  }));
  
  const tracked: TrackedClaim = {
    claimId: claim.id,
    claimText: claim.text,
    verification,
    overlayElements: overlays,
    originalRects,
  };
  
  trackedClaims.set(claim.id, tracked);
  
  console.log('[LieDetector] Successfully highlighted claim:', claim.id, claim.text.substring(0, 50));
  
  // Check if there's a pending verification that arrived before registration
  const pendingVerification = pendingVerifications.get(claim.id);
  if (pendingVerification) {
    console.log('[LieDetector] Applying pending verification for:', claim.id);
    pendingVerifications.delete(claim.id);
    tracked.verification = pendingVerification;
    // Update overlay styles with the verified status
    const pColor = RATING_COLORS[pendingVerification.rating];
    const pBorderStyle = pendingVerification.rating === 'unverified' ? 'dotted' : 'solid';
    for (const overlay of tracked.overlayElements) {
      overlay.style.backgroundColor = `${pColor}22`;
      overlay.style.borderBottom = `2px ${pBorderStyle} ${pColor}`;
      overlay.dataset.rating = pendingVerification.rating;
    }
  }
  
  return {
    claimId: claim.id,
    highlightElement: overlays[0],
    verification: tracked.verification || verification,
  };
}

// Pending verifications that arrived before claim was registered
const pendingVerifications = new Map<string, Verification>();

export function updateVerification(claimId: string, verification: Verification, retryCount = 0): void {
  const tracked = trackedClaims.get(claimId);
  if (!tracked) {
    // Claim not found - might be a race condition where verification arrived
    // before the content script finished processing the highlight
    if (retryCount < 5) {
      console.log(`[LieDetector] updateVerification: claim not found yet, retry ${retryCount + 1}/5`, claimId);
      // Store pending verification and retry after a short delay
      pendingVerifications.set(claimId, verification);
      setTimeout(() => {
        updateVerification(claimId, verification, retryCount + 1);
      }, 100 * (retryCount + 1)); // Exponential backoff: 100ms, 200ms, 300ms, 400ms, 500ms
      return;
    }
    console.log('[LieDetector] updateVerification: claim not found after retries', claimId);
    // Keep it in pending in case the claim is registered later
    pendingVerifications.set(claimId, verification);
    return;
  }
  
  // Clear from pending if it was there
  pendingVerifications.delete(claimId);
  
  console.log('[LieDetector] updateVerification:', claimId, verification.rating);
  tracked.verification = verification;
  
  // Update overlay styles
  const rating = verification.rating;
  const color = RATING_COLORS[rating];
  const borderStyle = rating === 'unverified' ? 'dotted' : 'solid';
  
  for (const overlay of tracked.overlayElements) {
    overlay.style.backgroundColor = `${color}22`;
    overlay.style.borderBottom = `2px ${borderStyle} ${color}`;
    overlay.dataset.rating = rating;
  }
  
  // Hide tooltip if it's for this claim (will be recreated with new data on next hover)
  if (activeTooltipClaimId === claimId) {
    hideActiveTooltip();
  }
}

/**
 * Refresh all overlay positions by re-finding text in DOM
 */
export function refreshOverlayPositions(): void {
  // Hide any active tooltip during refresh
  hideActiveTooltip();
  
  for (const [claimId, tracked] of trackedClaims) {
    // Skip claims with no visual overlays (registered without highlight)
    if (tracked.overlayElements.length === 0 && !tracked.originalRects) {
      continue;
    }
    
    // Remove old overlays
    removeOverlays(tracked.overlayElements);
    
    // Try to find text again and create new overlays
    const rects = findTextRects(tracked.claimText);
    const rating = tracked.verification?.rating || 'unverified';
    
    if (rects.length > 0) {
      // Text found - create new overlays and update stored positions
      const newOverlays = createOverlays(claimId, rects, rating);
      tracked.overlayElements = newOverlays;
      // Update stored rects
      tracked.originalRects = rects.map(r => ({
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      }));
    } else if (tracked.originalRects && tracked.originalRects.length > 0) {
      // Text not found but we have stored positions - use them
      console.debug('[LieDetector] Using stored rects for claim:', tracked.claimText.substring(0, 30));
      const newOverlays = createOverlaysFromStoredRects(claimId, tracked.originalRects, rating);
      tracked.overlayElements = newOverlays;
    } else {
      console.debug('[LieDetector] Could not re-find text and no stored rects for claim:', tracked.claimText.substring(0, 30));
      tracked.overlayElements = [];
    }
  }
  
  console.debug('[LieDetector] Refreshed overlay positions for', trackedClaims.size, 'claims');
}

export function removeHighlight(claimId: string): void {
  const tracked = trackedClaims.get(claimId);
  if (!tracked) return;
  
  removeOverlays(tracked.overlayElements);
  
  // Hide tooltip if it belongs to this claim
  if (activeTooltipClaimId === claimId) {
    hideActiveTooltip();
  }
  
  trackedClaims.delete(claimId);
}

export function removeAllHighlights(): void {
  // Hide any active tooltip first
  hideActiveTooltip();
  
  for (const claimId of trackedClaims.keys()) {
    const tracked = trackedClaims.get(claimId);
    if (tracked) {
      removeOverlays(tracked.overlayElements);
    }
  }
  trackedClaims.clear();
  
  // Also remove the container
  const container = document.getElementById(OVERLAY_CONTAINER_ID);
  if (container) {
    container.remove();
  }
}

export function getHighlightedClaims(): Map<string, HighlightedClaim> {
  const result = new Map<string, HighlightedClaim>();
  for (const [id, tracked] of trackedClaims) {
    result.set(id, {
      claimId: id,
      highlightElement: tracked.overlayElements[0] || document.createElement('div'),
      verification: tracked.verification,
    });
  }
  return result;
}

export function getHighlightedClaimById(claimId: string): HighlightedClaim | undefined {
  const tracked = trackedClaims.get(claimId);
  if (!tracked) return undefined;
  return {
    claimId,
    highlightElement: tracked.overlayElements[0] || document.createElement('div'),
    verification: tracked.verification,
  };
}

/**
 * Register a claim for tracking without creating visual highlights.
 * Used when the claim text can't be found in the DOM (e.g., spans multiple nodes)
 * but we still want to receive verification updates.
 */
export function registerClaimWithoutHighlight(claim: { id: string; text: string }): void {
  if (trackedClaims.has(claim.id)) {
    console.debug('[LieDetector] Claim already tracked:', claim.id);
    return;
  }
  
  const tracked: TrackedClaim = {
    claimId: claim.id,
    claimText: claim.text,
    verification: undefined,
    overlayElements: [], // No visual elements
  };
  
  trackedClaims.set(claim.id, tracked);
  console.log('[LieDetector] Registered claim without highlight:', claim.id, claim.text.substring(0, 50));
  
  // Check if there's a pending verification that arrived before registration
  const pendingVerification = pendingVerifications.get(claim.id);
  if (pendingVerification) {
    console.log('[LieDetector] Applying pending verification for non-highlighted claim:', claim.id);
    pendingVerifications.delete(claim.id);
    tracked.verification = pendingVerification;
  }
}
