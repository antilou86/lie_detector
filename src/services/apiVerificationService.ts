/**
 * API Verification Service - Calls the LieDetector backend
 */

import { Claim, Verification } from '@/types';

// Backend URL - can be configured via extension options later
const BACKEND_URL = 'http://localhost:3001';

interface ApiVerification {
  claimId: string;
  rating: string;
  confidence: number;
  summary: string;
  evidence: Array<{
    url: string;
    sourceName: string;
    quote?: string;
    datePublished?: string;
    peerReviewed?: boolean;
  }>;
  checkedAt: string;
  caveats?: string[];
}

interface ApiVerifyResponse {
  verifications: ApiVerification[];
  cached: boolean;
  meta?: {
    total: number;
    fromCache: number;
  };
}

/**
 * Convert API response to extension's Verification type
 */
function toVerification(api: ApiVerification): Verification {
  return {
    claimId: api.claimId,
    rating: api.rating as Verification['rating'],
    confidence: api.confidence,
    summary: api.summary,
    evidence: api.evidence.map(e => ({
      sourceId: `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceName: e.sourceName,
      sourceType: 'fact_check' as const,
      reliability: 0.8, // Default for fact-checkers
      relevance: 0.9,
      supports: !['false', 'mostly_false'].includes(api.rating),
      excerpt: e.quote || '',
      url: e.url,
      retrievedAt: new Date(),
      publicationDate: e.datePublished ? new Date(e.datePublished) : undefined,
      peerReviewed: e.peerReviewed,
    })),
    lastUpdated: new Date(api.checkedAt),
    humanReviewed: false,
    caveats: api.caveats,
  };
}

/**
 * Verify multiple claims via the backend API
 */
export async function verifyClaimsApi(
  claims: Claim[],
  url?: string
): Promise<Map<string, Verification>> {
  const results = new Map<string, Verification>();
  
  if (claims.length === 0) {
    return results;
  }
  
  try {
    // Prepare claims for API (strip DOM-specific fields)
    const apiClaims = claims.map(claim => ({
      id: claim.id,
      text: claim.text,
      context: claim.normalizedText,
      sourceUrl: url,
    }));
    
    const response = await fetch(`${BACKEND_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claims: apiClaims,
        url,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }
    
    const data: ApiVerifyResponse = await response.json();
    
    // Map verifications by claim ID (converting from API format to extension format)
    for (const apiVerification of data.verifications) {
      results.set(apiVerification.claimId, toVerification(apiVerification));
    }
    
    console.log(`[ApiVerificationService] Verified ${claims.length} claims, ${data.meta?.fromCache || 0} from cache`);
    
  } catch (error) {
    console.error('[ApiVerificationService] Backend request failed:', error);
    
    // Fall back to unverified status for all claims
    for (const claim of claims) {
      results.set(claim.id, {
        claimId: claim.id,
        rating: 'unverified',
        confidence: 0,
        summary: 'Unable to verify - backend service unavailable. Please ensure the backend server is running.',
        evidence: [],
        lastUpdated: new Date(),
        humanReviewed: false,
        caveats: ['Backend service unavailable'],
      });
    }
  }
  
  return results;
}

/**
 * Verify a single claim via the backend API
 */
export async function verifyClaimApi(
  claim: Claim,
  url?: string
): Promise<Verification> {
  const results = await verifyClaimsApi([claim], url);
  return results.get(claim.id) || {
    claimId: claim.id,
    rating: 'unverified',
    confidence: 0,
    summary: 'Verification failed',
    evidence: [],
    lastUpdated: new Date(),
    humanReviewed: false,
  };
}

/**
 * NLP-extracted claim with additional metadata
 */
export interface NlpClaimDetails {
  text: string;
  claimType: string;
  confidence: number;
  entities: Array<{ text: string; label: string }>;
  keywords: string[];
  charStart: number;
  charEnd: number;
}

interface ApiExtractAndVerifyResponse {
  claims: Array<{
    id: string;
    text: string;
    context?: string;
    sourceUrl?: string;
  }>;
  verifications: ApiVerification[];
  meta: {
    total: number;
    fromCache: number;
    source: 'nlp' | 'fallback';
    nlpDetails?: NlpClaimDetails[];
    error?: string;
  };
}

/**
 * Extract claims using NLP and verify them in one call
 */
export async function extractAndVerifyApi(
  text: string,
  url?: string,
  maxClaims: number = 20
): Promise<{
  claims: Claim[];
  verifications: Map<string, Verification>;
  nlpDetails?: NlpClaimDetails[];
  source: 'nlp' | 'fallback';
}> {
  const verifications = new Map<string, Verification>();
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/extract-and-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        url,
        maxClaims,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }
    
    const data: ApiExtractAndVerifyResponse = await response.json();
    
    // Convert claims to extension format with all required fields
    const claims: Claim[] = data.claims.map((c, i) => ({
      id: c.id,
      text: c.text,
      normalizedText: c.text.toLowerCase(),
      claimType: (data.meta.nlpDetails?.[i]?.claimType as Claim['claimType']) || 'statistic',
      entities: [],
      extractedFrom: {
        url: url || '',
        domain: url ? new URL(url).hostname : '',
        timestamp: new Date(),
      },
    }));
    
    // Map verifications
    for (const apiVerification of data.verifications) {
      verifications.set(apiVerification.claimId, toVerification(apiVerification));
    }
    
    console.log(
      `[ApiVerificationService] NLP extracted ${claims.length} claims, ` +
      `${data.meta.fromCache} from cache, source: ${data.meta.source}`
    );
    
    return {
      claims,
      verifications,
      nlpDetails: data.meta.nlpDetails,
      source: data.meta.source,
    };
    
  } catch (error) {
    console.error('[ApiVerificationService] Extract-and-verify failed:', error);
    
    return {
      claims: [],
      verifications,
      source: 'fallback',
    };
  }
}

/**
 * Check if the backend is available
 */
export async function checkBackendHealth(): Promise<{
  available: boolean;
  services: { googleFactCheck: boolean; nlpService: boolean; llmVerification: boolean };
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      timeout: 5000,
    } as RequestInit);
    
    if (!response.ok) {
      return { 
        available: false, 
        services: { googleFactCheck: false, nlpService: false, llmVerification: false } 
      };
    }
    
    const data = await response.json();
    return {
      available: true,
      services: {
        googleFactCheck: data.services?.googleFactCheck || false,
        nlpService: data.services?.nlpService || false,
        llmVerification: data.services?.llmVerification || false,
      },
    };
  } catch {
    return { 
      available: false, 
      services: { googleFactCheck: false, nlpService: false, llmVerification: false } 
    };
  }
}
