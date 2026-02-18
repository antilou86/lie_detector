/**
 * Claim Detector - Identifies health/medical claims in page text
 * 
 * MVP Strategy:
 * 1. Pattern-based detection for statistics and percentages
 * 2. Medical keyword triggers (drug names, conditions, treatments)
 * 3. Quote patterns with attribution
 * 
 * Future: Replace with NLP model for better accuracy
 */

import { Claim, ClaimType, Entity, DetectedClaim } from '@/types';

// Common health/medical terms that signal verifiable claims
const HEALTH_KEYWORDS = [
  // Treatments & interventions
  'vaccine', 'vaccination', 'drug', 'medication', 'treatment', 'therapy',
  'dose', 'dosage', 'antibiotic', 'supplement', 'vitamin',
  
  // Conditions & diseases
  'cancer', 'diabetes', 'heart disease', 'covid', 'coronavirus', 'flu',
  'infection', 'disease', 'condition', 'syndrome', 'disorder',
  
  // Medical claims
  'cure', 'prevent', 'treat', 'cause', 'risk', 'symptom', 'side effect',
  'effective', 'efficacy', 'clinical trial', 'study shows', 'research shows',
  'scientists found', 'doctors say', 'experts say',
  
  // Organizations
  'FDA', 'CDC', 'WHO', 'NIH', 'NHS',
];

// Patterns that typically indicate verifiable statistics
const STATISTIC_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*%/g,                           // Percentages
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(people|patients|cases|deaths|million|billion)/gi,
  /(\d+)\s*(?:out of|in)\s*(\d+)/gi,                // Ratios like "1 in 10"
  /(\d+(?:\.\d+)?)\s*times\s*(more|less|higher|lower)/gi,
  /(\d+(?:\.\d+)?)\s*fold\s*(increase|decrease)/gi,
  /reduces?\s*(?:risk|chance)?\s*by\s*(\d+(?:\.\d+)?)\s*%/gi,
  /increases?\s*(?:risk|chance)?\s*by\s*(\d+(?:\.\d+)?)\s*%/gi,
];

// Quote detection patterns
const QUOTE_PATTERNS = [
  /"([^"]{20,300})"\s*(?:said|says|according to|stated)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  /(?:said|says|according to|stated)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,:]?\s*"([^"]{20,300})"/g,
];

let claimCounter = 0;

function generateClaimId(): string {
  return `claim_${Date.now()}_${++claimCounter}`;
}

function getXPath(element: Node): string {
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentNode!;
  }
  
  const paths: string[] = [];
  
  for (; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentNode as Element) {
    let index = 0;
    let hasFollowingSiblings = false;
    
    for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && 
          (sibling as Element).tagName === (element as Element).tagName) {
        index++;
      }
    }
    
    for (let sibling = element.nextSibling; sibling && !hasFollowingSiblings; sibling = sibling.nextSibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && 
          (sibling as Element).tagName === (element as Element).tagName) {
        hasFollowingSiblings = true;
      }
    }
    
    const tagName = (element as Element).tagName.toLowerCase();
    const pathIndex = (index || hasFollowingSiblings) ? `[${index + 1}]` : '';
    paths.unshift(tagName + pathIndex);
  }
  
  return paths.length ? '/' + paths.join('/') : '';
}

function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  
  // Extract percentages as statistics
  const percentMatches = text.matchAll(/(\d+(?:\.\d+)?)\s*%/g);
  for (const match of percentMatches) {
    entities.push({
      text: match[0],
      type: 'statistic',
    });
  }
  
  // Extract health organizations
  const orgPatterns = /(FDA|CDC|WHO|NIH|NHS|AMA)/g;
  const orgMatches = text.matchAll(orgPatterns);
  for (const match of orgMatches) {
    entities.push({
      text: match[0],
      type: 'organization',
    });
  }
  
  return entities;
}

function findClaimBoundary(text: string, matchStart: number, matchEnd: number): { start: number; end: number } {
  // Expand to sentence boundaries
  let start = matchStart;
  let end = matchEnd;
  
  // Find sentence start (look for . ! ? or start of text)
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) {
    start--;
  }
  
  // Find sentence end
  while (end < text.length && !/[.!?\n]/.test(text[end])) {
    end++;
  }
  
  // Include the ending punctuation
  if (end < text.length && /[.!?]/.test(text[end])) {
    end++;
  }
  
  // Trim whitespace
  while (start < matchStart && /\s/.test(text[start])) {
    start++;
  }
  
  return { start, end };
}

function detectStatisticClaims(textNode: Text, claims: DetectedClaim[]): void {
  const text = textNode.textContent || '';
  
  for (const pattern of STATISTIC_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Check if this text contains health-related keywords
      const boundary = findClaimBoundary(text, match.index, match.index + match[0].length);
      const sentenceText = text.slice(boundary.start, boundary.end).trim();
      
      const hasHealthContext = HEALTH_KEYWORDS.some(keyword => 
        sentenceText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (!hasHealthContext) continue;
      
      // Skip if too short
      if (sentenceText.length < 20) continue;
      
      try {
        const range = document.createRange();
        range.setStart(textNode, boundary.start);
        range.setEnd(textNode, boundary.end);
        
        const claim: Claim = {
          id: generateClaimId(),
          text: sentenceText,
          normalizedText: sentenceText.toLowerCase().trim(),
          claimType: 'statistic',
          entities: extractEntities(sentenceText),
          extractedFrom: {
            url: window.location.href,
            domain: window.location.hostname,
            timestamp: new Date(),
          },
          position: {
            startOffset: boundary.start,
            endOffset: boundary.end,
            xpath: getXPath(textNode),
          },
        };
        
        claims.push({
          claim,
          element: textNode.parentElement!,
          range,
        });
      } catch (e) {
        // Range creation can fail for various reasons
        console.debug('Failed to create range for claim:', e);
      }
    }
  }
}

function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && 
         style.visibility !== 'hidden' && 
         style.opacity !== '0';
}

function shouldSkipElement(element: Element): boolean {
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CODE', 'PRE'];
  const skipClasses = ['LieDetector-highlight', 'LieDetector-tooltip'];
  
  if (skipTags.includes(element.tagName)) return true;
  if (skipClasses.some(cls => element.classList.contains(cls))) return true;
  if (!isElementVisible(element)) return true;
  
  // Skip nav, footer, sidebar elements (usually not main content)
  const role = element.getAttribute('role');
  if (role && ['navigation', 'banner', 'contentinfo', 'complementary'].includes(role)) {
    return true;
  }
  
  return false;
}

function getTextNodes(root: Element): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || shouldSkipElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip empty or whitespace-only nodes
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );
  
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  
  return textNodes;
}

export function detectClaims(root: Element = document.body): DetectedClaim[] {
  const claims: DetectedClaim[] = [];
  const textNodes = getTextNodes(root);
  
  for (const textNode of textNodes) {
    detectStatisticClaims(textNode, claims);
  }
  
  // Deduplicate overlapping claims (keep the more specific one)
  const uniqueClaims = deduplicateClaims(claims);
  
  console.log(`[LieDetector] Detected ${uniqueClaims.length} claims`);
  
  return uniqueClaims;
}

function deduplicateClaims(claims: DetectedClaim[]): DetectedClaim[] {
  const seen = new Set<string>();
  const unique: DetectedClaim[] = [];
  
  for (const claim of claims) {
    const key = claim.claim.normalizedText;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(claim);
    }
  }
  
  return unique;
}

export function detectClaimsInSelection(selection: Selection): DetectedClaim[] {
  if (!selection.rangeCount) return [];
  
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  
  if (text.length < 20) return [];
  
  const claim: Claim = {
    id: generateClaimId(),
    text: text,
    normalizedText: text.toLowerCase().trim(),
    claimType: 'statistic', // Default for user selection
    entities: extractEntities(text),
    extractedFrom: {
      url: window.location.href,
      domain: window.location.hostname,
      timestamp: new Date(),
    },
  };
  
  return [{
    claim,
    element: range.commonAncestorContainer.parentElement!,
    range: range.cloneRange(),
  }];
}
