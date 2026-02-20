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

/**
 * Get all text nodes within a range
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Check if node is within the range
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);
        const isInRange = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0 &&
                         range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0;
        return isInRange ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent && node.textContent.trim()) {
      textNodes.push(node as Text);
    }
  }
  return textNodes;
}

export function highlightClaim(
  detectedClaim: DetectedClaim, 
  verification?: Verification
): HighlightedClaim | null {
  const { claim, element, range } = detectedClaim;
  
  // Check if already highlighted and element still exists
  if (highlightedClaims.has(claim.id)) {
    const existing = highlightedClaims.get(claim.id)!;
    // Check if the element is still in the DOM
    if (document.contains(existing.highlightElement)) {
      if (verification) {
        updateVerification(claim.id, verification);
      }
      return existing;
    } else {
      // Element was removed (re-render), remove from tracking
      highlightedClaims.delete(claim.id);
    }
  }
  
  try {
    // Check if parent element still exists
    if (!document.contains(element)) {
      console.log('[LieDetector] Element no longer in DOM, skipping');
      return null;
    }
    
    // Get verification from tracking if available
    const rating = verification?.rating || 'unverified';
    const color = RATING_COLORS[rating];
    const style = rating === 'unverified' ? 'dotted' : 'solid';
    
    let targetElement: HTMLElement;
    
    // Try multiple strategies to highlight the text
    const wrapperStyles = (el: HTMLElement) => {
      el.className = HIGHLIGHT_CLASS;
      el.dataset.claimId = claim.id;
      el.style.setProperty('border-bottom', `2px ${style} ${color}`, 'important');
      el.style.setProperty('background-color', `${color}22`, 'important');
      el.style.setProperty('padding', '2px 0', 'important');
      el.setAttribute('data-rating', rating);
    };
    
    // Strategy 1: Try surroundContents (works for simple text nodes)
    let wrapped = false;
    try {
      const wrapper = document.createElement('span');
      wrapperStyles(wrapper);
      range.surroundContents(wrapper);
      targetElement = wrapper;
      wrapped = true;
      console.debug('[LieDetector] Highlighted using surroundContents');
    } catch (e1) {
      console.debug('[LieDetector] surroundContents failed:', e1);
    }
    
    // Strategy 2: Try extractContents + insertNode (works when range crosses elements)
    if (!wrapped) {
      try {
        const wrapper = document.createElement('span');
        wrapperStyles(wrapper);
        const contents = range.extractContents();
        wrapper.appendChild(contents);
        range.insertNode(wrapper);
        targetElement = wrapper;
        wrapped = true;
        console.debug('[LieDetector] Highlighted using extractContents fallback');
      } catch (e2) {
        console.debug('[LieDetector] extractContents fallback failed:', e2);
      }
    }
    
    // Strategy 3: Fall back to highlighting all text nodes in range individually
    if (!wrapped) {
      try {
        const textNodes = getTextNodesInRange(range);
        if (textNodes.length > 0) {
          // Wrap the first text node and use it as target
          const firstWrapper = document.createElement('span');
          wrapperStyles(firstWrapper);
          const firstNode = textNodes[0];
          const firstParent = firstNode.parentNode;
          if (firstParent) {
            firstParent.replaceChild(firstWrapper, firstNode);
            firstWrapper.appendChild(firstNode);
          }
          targetElement = firstWrapper;
          
          // Wrap remaining text nodes
          for (let i = 1; i < textNodes.length; i++) {
            const wrapper = document.createElement('span');
            wrapperStyles(wrapper);
            const node = textNodes[i];
            const parent = node.parentNode;
            if (parent) {
              parent.replaceChild(wrapper, node);
              wrapper.appendChild(node);
            }
          }
          wrapped = true;
          console.debug('[LieDetector] Highlighted using text node wrapping');
        }
      } catch (e3) {
        console.debug('[LieDetector] Text node wrapping failed:', e3);
      }
    }
    
    // Strategy 4: Last resort - style the parent element
    if (!wrapped) {
      console.debug('[LieDetector] All wrapping strategies failed, styling parent element');
      targetElement = element;
      targetElement.classList.add(HIGHLIGHT_CLASS);
      targetElement.dataset.claimId = claim.id;
      targetElement.style.setProperty('border-bottom', `2px ${style} ${color}`, 'important');
      targetElement.style.setProperty('background-color', `${color}22`, 'important');
      targetElement.setAttribute('data-rating', rating);
    }
    
    const finalTarget = targetElement!;
    
    // Setup tooltip interactions
    let tooltip: HTMLElement | null = null;
    let hideTimeout: number | null = null;
    const claimId = claim.id;
    
    const showTooltip = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      
      // Get current verification from stored state (may be updated after initial highlight)
      const currentData = highlightedClaims.get(claimId);
      const currentVerification = currentData?.verification;
      
      console.log('[LieDetector] showTooltip called, verification:', currentVerification ? 'yes' : 'no');
      
      // Check if tooltip was removed (e.g., by updateVerification)
      if (tooltip && !document.body.contains(tooltip)) {
        tooltip = null;
      }
      
      if (!tooltip && currentVerification) {
        console.log('[LieDetector] Creating tooltip for claim:', claimId);
        tooltip = createTooltip(currentVerification);
        tooltip.setAttribute('data-claim-id', claimId);
        document.body.appendChild(tooltip);
        positionTooltip(tooltip, finalTarget);
        
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
    
    finalTarget.addEventListener('mouseenter', showTooltip);
    finalTarget.addEventListener('mouseleave', hideTooltipDelayed);
    finalTarget.addEventListener('click', (e) => {
      // Don't prevent default - let links still work
      console.log('[LieDetector] Claim clicked:', claim.id);
    });
    
    const highlighted: HighlightedClaim = {
      claimId: claim.id,
      highlightElement: finalTarget,
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
  if (!highlighted) {
    console.log('[LieDetector] updateVerification: claim not found', claimId);
    return;
  }
  
  console.log('[LieDetector] updateVerification:', claimId, verification.rating);
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
