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
 * Check if the backend is available
 */
export async function checkBackendHealth(): Promise<{
  available: boolean;
  services: { googleFactCheck: boolean };
}> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      timeout: 5000,
    } as RequestInit);
    
    if (!response.ok) {
      return { available: false, services: { googleFactCheck: false } };
    }
    
    const data = await response.json();
    return {
      available: true,
      services: data.services || { googleFactCheck: false },
    };
  } catch {
    return { available: false, services: { googleFactCheck: false } };
  }
}
