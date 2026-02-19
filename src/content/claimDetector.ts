/**
 * Claim Detector - Identifies verifiable claims in page text
 * 
 * MVP Strategy:
 * 1. Pattern-based detection for statistics and percentages
 * 2. Claim trigger phrases (studies, experts, research)
 * 3. Quote patterns with attribution
 * 
 * Future: Replace with NLP model for better accuracy
 */

import { Claim, ClaimType, Entity, DetectedClaim } from '@/types';

// Patterns that typically indicate verifiable statistics
const STATISTIC_PATTERNS = [
  // Percentages
  /(\d+(?:\.\d+)?)\s*%/g,
  /(\d+(?:\.\d+)?)\s*percent/gi,
  
  // Counts with units
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(people|patients|cases|deaths|americans|children|adults|women|men|users|participants|subjects)/gi,
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|thousand|hundred)/gi,
  /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(dollars|euros|\$|€)/gi,
  /\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|thousand)?/gi,
  
  // Ratios and comparisons
  /(\d+)\s*(?:out of|in)\s*(\d+)/gi,
  /(\d+(?:\.\d+)?)\s*times\s*(more|less|higher|lower|greater|as likely|as much)/gi,
  /(\d+(?:\.\d+)?)\s*-?\s*fold\s*(increase|decrease|higher|lower|more|less)?/gi,
  
  // Changes
  /reduces?\s*(?:risk|chance|likelihood)?\s*by\s*(\d+(?:\.\d+)?)/gi,
  /increases?\s*(?:risk|chance|likelihood)?\s*by\s*(\d+(?:\.\d+)?)/gi,
  /(doubled|tripled|quadrupled|halved)/gi,
  /rose\s*(?:by\s*)?(\d+(?:\.\d+)?)/gi,
  /fell\s*(?:by\s*)?(\d+(?:\.\d+)?)/gi,
  /grew\s*(?:by\s*)?(\d+(?:\.\d+)?)/gi,
  /dropped\s*(?:by\s*)?(\d+(?:\.\d+)?)/gi,
  
  // Time periods
  /(\d+)\s*(year|month|week|day|hour)s?\s*(ago|later|earlier)/gi,
  /since\s*(\d{4})/gi,
  /between\s*(\d{4})\s*and\s*(\d{4})/gi,
  
  // Rankings and positions
  /(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s*(largest|smallest|biggest|highest|lowest|most|least)/gi,
  /ranked?\s*#?\s*(\d+)/gi,
  /top\s*(\d+)/gi,
];

// Patterns that indicate factual claims (even without numbers)
const CLAIM_TRIGGER_PATTERNS = [
  // Research/study claims
  /stud(?:y|ies)\s+(?:show|found|suggest|reveal|indicate|demonstrate|confirm)/gi,
  /research\s+(?:show|found|suggest|reveal|indicate|demonstrate|confirm)/gi,
  /scientists?\s+(?:found|discovered|say|claim|believe|confirmed)/gi,
  /researchers?\s+(?:found|discovered|say|claim|believe|confirmed)/gi,
  /experts?\s+(?:say|warn|believe|agree|recommend|advise)/gi,
  /doctors?\s+(?:say|warn|believe|agree|recommend|advise)/gi,
  /according\s+to\s+(?:a\s+)?(?:new\s+)?(?:study|research|data|report|survey|poll|analysis)/gi,
  /data\s+(?:show|suggest|indicate|reveal)/gi,
  
  // Definitive claims
  /(?:is|are|was|were)\s+(?:proven|shown|confirmed|linked|associated|connected)\s+to/gi,
  /has\s+been\s+(?:proven|shown|confirmed|linked|associated|connected)/gi,
  /causes?\s+(?:cancer|disease|death|illness|damage|harm)/gi,
  /prevents?\s+(?:cancer|disease|death|illness|damage|harm)/gi,
  /cures?\s+(?:cancer|disease|illness)/gi,
  
  // Comparative claims  
  /more\s+(?:effective|dangerous|harmful|beneficial|likely)\s+than/gi,
  /less\s+(?:effective|dangerous|harmful|beneficial|likely)\s+than/gi,
  /the\s+(?:most|least|best|worst|safest|deadliest)/gi,
  
  // Certainty language
  /always|never|every|all|none|no\s+one/gi,
  /definitely|certainly|absolutely|undoubtedly/gi,
  /proven\s+(?:to|that)/gi,
  /fact\s+(?:is|that)/gi,
];

// Quote detection patterns
const QUOTE_PATTERNS = [
  /"([^"]{20,300})"\s*(?:said|says|according to|stated|wrote|claimed|argued)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  /(?:said|says|according to|stated|wrote|claimed|argued)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[,:]?\s*"([^"]{20,300})"/g,
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

let matchCount = 0; // Debug counter

function detectPatternClaims(textNode: Text, claims: DetectedClaim[], patterns: RegExp[], claimType: ClaimType): void {
  const text = textNode.textContent || '';
  
  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matchCount++;
      
      const boundary = findClaimBoundary(text, match.index, match.index + match[0].length);
      const sentenceText = text.slice(boundary.start, boundary.end).trim();
      
      // Skip if too short
      if (sentenceText.length < 20) continue;
      
      // Skip if too long (probably grabbed too much)
      if (sentenceText.length > 500) continue;
      
      try {
        const range = document.createRange();
        range.setStart(textNode, boundary.start);
        range.setEnd(textNode, boundary.end);
        
        const claim: Claim = {
          id: generateClaimId(),
          text: sentenceText,
          normalizedText: sentenceText.toLowerCase().trim(),
          claimType: claimType,
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
  
  console.log(`[LieDetector] Found ${textNodes.length} text nodes to scan`);
  
  // Debug: show some sample text content
  if (textNodes.length > 0) {
    console.log('[LieDetector] Sample text nodes:', textNodes.slice(0, 3).map(n => n.textContent?.substring(0, 100)));
  }
  
  for (const textNode of textNodes) {
    // Detect statistics (numbers, percentages, etc.)
    detectPatternClaims(textNode, claims, STATISTIC_PATTERNS, 'statistic');
    
    // Detect claim trigger phrases (studies show, experts say, etc.)
    detectPatternClaims(textNode, claims, CLAIM_TRIGGER_PATTERNS, 'event');
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
