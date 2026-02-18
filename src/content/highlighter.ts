/**
 * Highlighter - Manages visual highlighting of claims and tooltips
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

// Track all highlighted claims
const highlightedClaims = new Map<string, HighlightedClaim>();

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

function getUnderlineStyle(rating: Rating): string {
  const color = RATING_COLORS[rating];
  // Use a dotted underline for unverified, solid for others
  const style = rating === 'unverified' ? 'dotted' : 'solid';
  // Use !important to override page styles
  return `border-bottom: 2px ${style} ${color} !important; background-color: ${color}22 !important; padding: 2px 0 !important;`;
}

function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  // Default: position below the highlight
  let top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;
  
  // If tooltip would go off the right edge, align to right
  if (left + tooltipRect.width > window.innerWidth) {
    left = window.innerWidth - tooltipRect.width - 16;
  }
  
  // If tooltip would go off the bottom, show above instead
  if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
    top = rect.top + window.scrollY - tooltipRect.height - 8;
  }
  
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${Math.max(8, left)}px`;
}

export function highlightClaim(
  detectedClaim: DetectedClaim, 
  verification?: Verification
): HighlightedClaim | null {
  const { claim, element } = detectedClaim;
  
  // Don't re-highlight already highlighted claims
  if (highlightedClaims.has(claim.id)) {
    // But update verification if provided
    if (verification) {
      updateVerification(claim.id, verification);
    }
    return highlightedClaims.get(claim.id)!;
  }
  
  try {
    // Instead of wrapping text (which fails on dynamic pages),
    // mark the parent element directly
    const targetElement = element;
    
    // Add our highlight class and data attributes to the parent element
    targetElement.classList.add(HIGHLIGHT_CLASS);
    targetElement.dataset.claimId = claim.id;
    
    // Default to unverified styling
    const rating = verification?.rating || 'unverified';
    const color = RATING_COLORS[rating];
    const style = rating === 'unverified' ? 'dotted' : 'solid';
    
    // Apply inline styles with !important to override page styles
    targetElement.style.setProperty('border-bottom', `2px ${style} ${color}`, 'important');
    targetElement.style.setProperty('background-color', `${color}22`, 'important');
    targetElement.setAttribute('data-rating', rating);
    
    // Setup tooltip interactions
    let tooltip: HTMLElement | null = null;
    let hideTimeout: number | null = null;
    
    const showTooltip = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      
      if (!tooltip && verification) {
        tooltip = createTooltip(verification);
        document.body.appendChild(tooltip);
        positionTooltip(tooltip, targetElement);
        
        // Allow hovering over tooltip
        tooltip.addEventListener('mouseenter', showTooltip);
        tooltip.addEventListener('mouseleave', () => hideTooltipDelayed());
      }
      
      if (tooltip) {
        tooltip.classList.add('visible');
      }
    };
    
    const hideTooltipDelayed = () => {
      hideTimeout = window.setTimeout(() => {
        if (tooltip) {
          tooltip.classList.remove('visible');
        }
      }, 200);
    };
    
    const hideTooltipImmediate = () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    };
    
    targetElement.addEventListener('mouseenter', showTooltip);
    targetElement.addEventListener('mouseleave', hideTooltipDelayed);
    targetElement.addEventListener('click', (e) => {
      // Don't prevent default - let links still work
      console.log('[LieDetector] Claim clicked:', claim.id);
    });
    
    const highlighted: HighlightedClaim = {
      claimId: claim.id,
      highlightElement: targetElement,
      verification,
    };
    
    highlightedClaims.set(claim.id, highlighted);
    
    console.log('[LieDetector] Successfully highlighted claim:', claim.id, claim.text.substring(0, 50));
    
    return highlighted;
  } catch (e) {
    console.error('[LieDetector] Failed to highlight claim:', e, 'Claim:', claim.text.substring(0, 50));
    return null;
  }
}

export function updateVerification(claimId: string, verification: Verification): void {
  const highlighted = highlightedClaims.get(claimId);
  if (!highlighted) return;
  
  highlighted.verification = verification;
  
  // Update highlight style
  const rating = verification.rating;
  const color = RATING_COLORS[rating];
  const style = rating === 'unverified' ? 'dotted' : 'solid';
  
  highlighted.highlightElement.style.setProperty('border-bottom', `2px ${style} ${color}`, 'important');
  highlighted.highlightElement.style.setProperty('background-color', `${color}22`, 'important');
  highlighted.highlightElement.setAttribute('data-rating', rating);
  
  // Remove old tooltip if exists (will be recreated on next hover)
  const existingTooltip = document.querySelector(`.${TOOLTIP_CLASS}[data-claim-id="${claimId}"]`);
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

export function removeHighlight(claimId: string): void {
  const highlighted = highlightedClaims.get(claimId);
  if (!highlighted) return;
  
  const element = highlighted.highlightElement;
  
  // Remove our styles and classes (don't remove the element itself)
  element.classList.remove(HIGHLIGHT_CLASS);
  element.style.removeProperty('border-bottom');
  element.style.removeProperty('background-color');
  element.removeAttribute('data-claim-id');
  element.removeAttribute('data-rating');
  
  // Remove tooltip if exists
  const tooltip = document.querySelector(`.${TOOLTIP_CLASS}[data-claim-id="${claimId}"]`);
  if (tooltip) {
    tooltip.remove();
  }
  
  highlightedClaims.delete(claimId);
}

export function removeAllHighlights(): void {
  for (const claimId of highlightedClaims.keys()) {
    removeHighlight(claimId);
  }
}

export function getHighlightedClaims(): Map<string, HighlightedClaim> {
  return new Map(highlightedClaims);
}

export function getHighlightedClaimById(claimId: string): HighlightedClaim | undefined {
  return highlightedClaims.get(claimId);
}
