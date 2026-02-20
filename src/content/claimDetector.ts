/**
 * Claim Detector - Identifies verifiable claims in page text
 * 
 * Strategies:
 * 1. Pattern-based detection for statistics and percentages
 * 2. Claim trigger phrases (studies, experts, research)
 * 3. Negative patterns to filter out junk (ads, UI text, metadata)
 * 4. Source-aware DOM filtering (skip ads, nav, forms)
 * 5. Claim-worthiness scoring
 * 
 * Future: Add LLM-based filtering for better accuracy
 */

import { Claim, ClaimType, Entity, DetectedClaim } from '@/types';

// ============================================
// NEGATIVE PATTERNS - Text that should NOT be treated as claims
// ============================================
const JUNK_PATTERNS = [
  // View counts, timestamps, metadata
  /^\d+K?\+?\s*views?/i,
  /^\d+\s*(days?|weeks?|months?|years?)\s*ago/i,
  /^\d+\s*(minutes?|hours?)\s*(ago|read)/i,
  /^(posted|published|updated|modified)\s*(on|:)/i,
  /^\d+\s*comments?/i,
  /^\d+\s*(likes?|shares?|retweets?)/i,
  
  // UI/Navigation text
  /^(read more|see more|show more|view all|load more)/i,
  /^(click here|tap here|learn more|find out)/i,
  /^(subscribe|sign up|join|register|log ?in|sign ?in)/i,
  /^(share|tweet|post|email|print)/i,
  /^(next|previous|back|forward|menu|home)/i,
  /^(skip to|jump to|go to)/i,
  /delivered to your (inbox|email)/i,
  
  // Ads and clickbait
  /didn't know this (simple )?trick/i,
  /doctors (hate|don't want you to know)/i,
  /(one weird|simple) trick/i,
  /you won't believe/i,
  /sponsored( content| post)?$/i,
  /advertisement/i,
  /promoted/i,
  
  // Cookie/privacy notices
  /we use cookies/i,
  /privacy policy/i,
  /terms (of service|and conditions)/i,
  /accept (all )?cookies/i,
  
  // Form labels and buttons
  /^(submit|cancel|ok|yes|no|close|save|delete)$/i,
  /^(name|email|password|username|phone|address)$/i,
  /^(select|choose|pick|enter)/i,
  
  // Generic marketing
  /make the most (of|out of)/i,
  /customiz(e|ing) your (profile|settings|experience)/i,
  /have a (complex )?challenge/i,
  /need (some )?help\??/i,
  /free trial/i,
  /limited time offer/i,
  /act now/i,
  /don't miss (out|this)/i,
  
  // Ad headlines disguised as news
  /forbes reveals/i,
  /\d+x cheaper than/i,
  /cheaper than ozempic/i,
  /best .* programmes?/i,
  /\(\d+x cheaper/i,  
  // Literary quotes and aphorisms (not verifiable claims)
  /^"[^"]+"\s*[-—]/,  // Quotes with attribution dash
  /breeds reptiles of the mind/i,  // Specific Blake quote
  /like standing water/i,
  
  // Incomplete sentences / fragments
  /^(the|a|an|this|that|these|those|in|on|at|by|for|with|to)\s+\w+$/i, // Just article + word
  /^[^.!?]{0,15}$/,  // Very short without punctuation
  
  // Photo captions and media credits
  /^\s*(photo|image|video|credit|source|courtesy|via|by)\s*[:\|]/i,
  /\((ap|reuters|getty|afp|epa)\)/i,
  /\.(jpg|jpeg|png|gif|mp4|webp)/i,
  
  // Bylines and author info
  /^by\s+[A-Z][a-z]+/i,
  /staff (writer|reporter|correspondent)/i,
  /contributing (writer|editor)/i,
  
  // Newsletter/subscription prompts
  /newsletter/i,
  /sign up (for|to)/i,
  /get (our|the) (newsletter|updates)/i,
  /subscribe (to|for)/i,
  
  // Related content teasers
  /^(related|see also|more from|recommended|you may also like)/i,
  /^(trending|popular|most read|top stories)/i,
  
  // Social proof without substance
  /^(trusted by|used by|loved by|recommended by)/i,
  /^(as seen on|featured in)/i,
  
  // Code/technical snippets
  /^(function|const|let|var|import|export|class)\s/,
  /^\{|\}$/,
  /^<\/?[a-z]+/i,
];

// Patterns indicating promotional/ad containers
const AD_CONTAINER_PATTERNS = [
  /ad[-_]?(banner|unit|container|wrapper|slot|block)/i,
  /sponsor/i,
  /promo(tion|tional)?/i,
  /advertisement/i,
  /commercial/i,
  /partner[-_]?content/i,
  /outbrain|taboola|revcontent/i,
  /dfp|gpt[-_]?ad/i,
];

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
  
  // Trim whitespace from start
  while (start < matchStart && /\s/.test(text[start])) {
    start++;
  }
  
  // Clean up leading punctuation and conjunctions that indicate fragments
  const leadingJunk = /^[,;:\-–—"'\s]*(and|but|or|so|yet|for|nor|which|who|that|where|when|while|although|though|because|since|if|unless|until|as|after|before)\s+/i;
  let extracted = text.slice(start, end);
  const junkMatch = extracted.match(leadingJunk);
  if (junkMatch) {
    start += junkMatch[0].length;
  }
  
  // Also strip any remaining leading punctuation
  while (start < end && /^[,;:\-–—"'\s]/.test(text[start])) {
    start++;
  }
  
  return { start, end };
}

/**
 * Check if a sentence is a valid complete sentence (starts with capital, ends with punctuation)
 */
function isCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  
  // Must be at least 40 chars
  if (trimmed.length < 40) return false;
  
  // Should start with a capital letter, number, or opening quote
  if (!/^[A-Z0-9"'"']/.test(trimmed)) return false;
  
  // Should end with sentence-ending punctuation
  if (!/[.!?]["']?$/.test(trimmed)) return false;
  
  // Should not start with certain words that indicate a fragment
  if (/^(And|But|Or|So|Yet|For|Nor|Which|Who|That|Where|When|While|Although|Though|Because|Since|If|Unless|Until|After|Before)\s/i.test(trimmed)) {
    return false;
  }
  
  return true;
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
      
      // Skip incomplete sentences (fragments starting with conjunctions, etc.)
      if (!isCompleteSentence(sentenceText)) {
        console.debug(`[LieDetector] Skipped incomplete sentence: "${sentenceText.substring(0, 50)}..."`);
        continue;
      }
      
      // Skip if too long (reduced from 500 to 400)
      if (sentenceText.length > 400) continue;
      
      // Apply claim-worthiness scoring
      const worthiness = assessClaimWorthiness(sentenceText);
      if (!worthiness.isWorthy) {
        console.debug(`[LieDetector] Skipped low-worthiness claim (score=${worthiness.score}): "${sentenceText.substring(0, 50)}..." - ${worthiness.reasons.join(', ')}`);
        continue;
      }
      
      console.debug(`[LieDetector] Found worthy claim (score=${worthiness.score}): "${sentenceText.substring(0, 50)}..." - ${worthiness.reasons.join(', ')}`);
      
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
  const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CODE', 'PRE', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'FORM'];
  const skipClasses = ['LieDetector-highlight', 'LieDetector-tooltip'];
  
  if (skipTags.includes(element.tagName)) return true;
  if (skipClasses.some(cls => element.classList.contains(cls))) return true;
  if (!isElementVisible(element)) return true;
  
  // Skip nav, footer, sidebar elements (usually not main content)
  const role = element.getAttribute('role');
  if (role && ['navigation', 'banner', 'contentinfo', 'complementary', 'search', 'form'].includes(role)) {
    return true;
  }
  
  // Skip by tag semantics
  const semanticSkipTags = ['NAV', 'ASIDE', 'FOOTER', 'HEADER'];
  if (semanticSkipTags.includes(element.tagName)) return true;
  
  // Check for ad containers by class/id
  const classAndId = `${element.className} ${element.id}`.toLowerCase();
  if (AD_CONTAINER_PATTERNS.some(pattern => pattern.test(classAndId))) {
    return true;
  }
  
  // Check ancestors for ad containers (but limit depth to avoid performance issues)
  let ancestor: Element | null = element;
  let depth = 0;
  while (ancestor && depth < 5) {
    const ancestorClassId = `${ancestor.className} ${ancestor.id}`.toLowerCase();
    if (AD_CONTAINER_PATTERNS.some(pattern => pattern.test(ancestorClassId))) {
      return true;
    }
    ancestor = ancestor.parentElement;
    depth++;
  }
  
  return false;
}

// ============================================
// CLAIM-WORTHINESS SCORING
// ============================================

interface ClaimWorthinessResult {
  isWorthy: boolean;
  score: number;
  reasons: string[];
}

function assessClaimWorthiness(text: string): ClaimWorthinessResult {
  const reasons: string[] = [];
  let score = 0;
  let positiveSignals = 0;
  
  // Check against junk patterns first
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(text)) {
      return { isWorthy: false, score: 0, reasons: ['Matches junk pattern'] };
    }
  }
  
  // Minimum length check (increased from 30 to 40)
  if (text.length < 40) {
    return { isWorthy: false, score: 0, reasons: ['Too short (min 40 chars)'] };
  }
  
  // Maximum length check - very long text is usually not a single claim
  if (text.length > 400) {
    return { isWorthy: false, score: 0, reasons: ['Too long (max 400 chars)'] };
  }
  
  // Reject if it's mostly numbers (data tables, statistics without context)
  const numericRatio = (text.match(/\d/g) || []).length / text.length;
  if (numericRatio > 0.3) {
    return { isWorthy: false, score: 0, reasons: ['Too many numbers (likely data/table)'] };
  }
  
  // Reject if it lacks proper sentence structure (no ending punctuation)
  if (!/[.!]$/.test(text.trim())) {
    score -= 20;
    reasons.push('No sentence-ending punctuation');
  }
  
  // Check for subject-verb structure (simple heuristic: has a verb-like word)
  const verbPatterns = /\b(is|are|was|were|has|have|had|shows?|found|said|says|claims?|proves?|causes?|prevents?|reduces?|increases?|kills?|cures?|treats?|affects?|linked|associated|connected|confirmed|demonstrated|revealed)\b/i;
  if (verbPatterns.test(text)) {
    score += 15;
    reasons.push('Has verb structure');
    positiveSignals++;
  }
  
  // Contains meaningful statistics (not just any number)
  const meaningfulStats = /(\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand|times|fold|people|patients|deaths|cases)/i;
  if (meaningfulStats.test(text)) {
    score += 35;
    reasons.push('Contains meaningful statistics');
    positiveSignals++;
  } else if (/\d+/.test(text)) {
    // Has numbers but not clearly statistical
    score += 10;
    reasons.push('Contains numbers');
  }
  
  // References authoritative organizations/entities
  const entityPatterns = /(FDA|CDC|WHO|NIH|NHS|EPA|FBI|CIA|DOJ|government|president|congress|senate|supreme court|university|study|research|scientist|doctor|expert|professor|official|spokesman|spokesperson)/i;
  if (entityPatterns.test(text)) {
    score += 30;
    reasons.push('References authoritative entity');
    positiveSignals++;
  }
  
  // Contains strong claim trigger phrases
  const claimTriggers = /(according to|study (shows?|found|proves?)|research (shows?|found|proves?)|experts? (say|believe|warn|agree)|scientists? (found|discovered|say)|data (shows?|suggests?|indicates?)|evidence (shows?|suggests?)|proven (to|that)|confirmed (that|to)|linked to|associated with)/i;
  if (claimTriggers.test(text)) {
    score += 30;
    reasons.push('Has claim trigger phrase');
    positiveSignals++;
  }
  
  // Penalty for question marks (questions aren't claims)
  if (text.includes('?')) {
    score -= 50;
    reasons.push('Is a question');
  }
  
  // Penalty for imperative/command structure
  if (/^(go|get|try|buy|click|sign|join|make|do|don't|never|always|start|stop|check|see|watch|read|find|discover)\b/i.test(text)) {
    score -= 40;
    reasons.push('Appears to be imperative/command');
  }
  
  // Penalty for first person (personal opinions vs factual claims)
  if (/^(I|my|we|our)\b/i.test(text)) {
    score -= 30;
    reasons.push('First person (opinion indicator)');
  }
  
  // Penalty for ellipsis (incomplete text)
  if (/\.{3}|…/.test(text)) {
    score -= 15;
    reasons.push('Contains ellipsis (incomplete)');
  }
  
  // Penalty for excessive capitalization (clickbait/ads)
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.3) {
    score -= 25;
    reasons.push('Excessive capitalization');
  }
  
  // Bonus for longer, more detailed claims (but not too long)
  if (text.length > 80 && text.length <= 300) {
    score += 10;
    reasons.push('Substantive length');
  }
  
  // REQUIRE at least one positive signal to be considered worthy
  if (positiveSignals === 0) {
    return { isWorthy: false, score, reasons: [...reasons, 'No positive verification signals'] };
  }
  
  // Raised minimum threshold from 30 to 40
  const isWorthy = score >= 40;
  
  return { isWorthy, score, reasons };
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
