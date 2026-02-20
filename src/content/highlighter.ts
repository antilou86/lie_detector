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
const OVERLAY_CONTAINER_ID = 'LieDetector-overlay-container';

// Track all highlighted claims with their text for re-finding
interface TrackedClaim {
  claimId: string;
  claimText: string;
  verification?: Verification;
  overlayElements: HTMLElement[];
}

const trackedClaims = new Map<string, TrackedClaim>();

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
  rating: Rating,
  onHover: () => void,
  onLeave: () => void
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
    
    overlay.addEventListener('mouseenter', onHover);
    overlay.addEventListener('mouseleave', onLeave);
    
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
  const { claim } = detectedClaim;
  
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
  const rects = findTextRects(claim.text);
  
  if (rects.length === 0) {
    console.debug('[LieDetector] Could not find text for claim:', claim.text.substring(0, 50));
    return null;
  }
  
  // Tooltip state
  let tooltip: HTMLElement | null = null;
  let hideTimeout: number | null = null;
  
  const showTooltip = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    
    const tracked = trackedClaims.get(claim.id);
    if (!tracked?.verification) return;
    
    if (!tooltip || !document.body.contains(tooltip)) {
      tooltip = createTooltip(tracked.verification);
      tooltip.setAttribute('data-claim-id', claim.id);
      tooltip.style.pointerEvents = 'auto';
      document.body.appendChild(tooltip);
      
      // Position tooltip near the first overlay
      if (tracked.overlayElements.length > 0) {
        const firstOverlay = tracked.overlayElements[0];
        const rect = firstOverlay.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX;
        
        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 16;
        }
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
          top = rect.top + window.scrollY - tooltipRect.height - 8;
        }
        
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${Math.max(8, left)}px`;
      }
      
      tooltip.addEventListener('mouseenter', showTooltip);
      tooltip.addEventListener('mouseleave', hideTooltipDelayed);
    }
    
    tooltip.classList.add('visible');
  };
  
  const hideTooltipDelayed = () => {
    hideTimeout = window.setTimeout(() => {
      if (tooltip) {
        tooltip.classList.remove('visible');
      }
    }, 200);
  };
  
  const overlays = createOverlays(claim.id, rects, rating, showTooltip, hideTooltipDelayed);
  
  if (overlays.length === 0) {
    return null;
  }
  
  const tracked: TrackedClaim = {
    claimId: claim.id,
    claimText: claim.text,
    verification,
    overlayElements: overlays,
  };
  
  trackedClaims.set(claim.id, tracked);
  
  console.log('[LieDetector] Successfully highlighted claim:', claim.id, claim.text.substring(0, 50));
  
  return {
    claimId: claim.id,
    highlightElement: overlays[0],
    verification,
  };
}

export function updateVerification(claimId: string, verification: Verification): void {
  const tracked = trackedClaims.get(claimId);
  if (!tracked) {
    console.log('[LieDetector] updateVerification: claim not found', claimId);
    return;
  }
  
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
  
  // Remove old tooltip (will be recreated on next hover)
  const existingTooltip = document.querySelector(`.${TOOLTIP_CLASS}[data-claim-id="${claimId}"]`);
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

/**
 * Refresh all overlay positions by re-finding text in DOM
 */
export function refreshOverlayPositions(): void {
  for (const [claimId, tracked] of trackedClaims) {
    // Remove old overlays
    removeOverlays(tracked.overlayElements);
    
    // Find text again and create new overlays
    const rects = findTextRects(tracked.claimText);
    
    if (rects.length === 0) {
      console.debug('[LieDetector] Could not re-find text for claim:', tracked.claimText.substring(0, 30));
      continue;
    }
    
    const rating = tracked.verification?.rating || 'unverified';
    
    // Tooltip handlers (recreate)
    let tooltip: HTMLElement | null = null;
    let hideTimeout: number | null = null;
    
    const showTooltip = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      
      const t = trackedClaims.get(claimId);
      if (!t?.verification) return;
      
      if (!tooltip || !document.body.contains(tooltip)) {
        tooltip = createTooltip(t.verification);
        tooltip.setAttribute('data-claim-id', claimId);
        tooltip.style.pointerEvents = 'auto';
        document.body.appendChild(tooltip);
        
        if (t.overlayElements.length > 0) {
          const firstOverlay = t.overlayElements[0];
          const rect = firstOverlay.getBoundingClientRect();
          const tooltipRect = tooltip.getBoundingClientRect();
          
          let top = rect.bottom + window.scrollY + 8;
          let left = rect.left + window.scrollX;
          
          if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - 16;
          }
          if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
            top = rect.top + window.scrollY - tooltipRect.height - 8;
          }
          
          tooltip.style.top = `${top}px`;
          tooltip.style.left = `${Math.max(8, left)}px`;
        }
        
        tooltip.addEventListener('mouseenter', showTooltip);
        tooltip.addEventListener('mouseleave', hideTooltipDelayed);
      }
      
      tooltip.classList.add('visible');
    };
    
    const hideTooltipDelayed = () => {
      hideTimeout = window.setTimeout(() => {
        if (tooltip) {
          tooltip.classList.remove('visible');
        }
      }, 200);
    };
    
    const newOverlays = createOverlays(claimId, rects, rating, showTooltip, hideTooltipDelayed);
    tracked.overlayElements = newOverlays;
  }
  
  console.debug('[LieDetector] Refreshed overlay positions for', trackedClaims.size, 'claims');
}

export function removeHighlight(claimId: string): void {
  const tracked = trackedClaims.get(claimId);
  if (!tracked) return;
  
  removeOverlays(tracked.overlayElements);
  
  // Remove tooltip if exists
  const tooltip = document.querySelector(`.${TOOLTIP_CLASS}[data-claim-id="${claimId}"]`);
  if (tooltip) {
    tooltip.remove();
  }
  
  trackedClaims.delete(claimId);
}

export function removeAllHighlights(): void {
  for (const claimId of trackedClaims.keys()) {
    removeHighlight(claimId);
  }
  
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
