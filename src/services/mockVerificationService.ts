/**
 * Mock Verification Service
 * 
 * Simulates backend verification for MVP testing.
 * Returns realistic mock data to test the UX.
 * 
 * Replace with real API calls in production.
 */

import { 
  Claim, 
  Verification, 
  Evidence, 
  Rating,
  HealthSourceCategory 
} from '@/types';

// Simulated delay to mimic API latency
const MOCK_DELAY_MS = 500 + Math.random() * 1000;

// Mock trusted health sources
const MOCK_SOURCES: Array<{
  id: string;
  name: string;
  category: HealthSourceCategory;
  reliability: number;
  url: string;
}> = [
  {
    id: 'cdc',
    name: 'Centers for Disease Control and Prevention',
    category: 'public_health_agency',
    reliability: 0.95,
    url: 'https://www.cdc.gov',
  },
  {
    id: 'who',
    name: 'World Health Organization',
    category: 'public_health_agency',
    reliability: 0.93,
    url: 'https://www.who.int',
  },
  {
    id: 'pubmed',
    name: 'PubMed / National Library of Medicine',
    category: 'research_database',
    reliability: 0.90,
    url: 'https://pubmed.ncbi.nlm.nih.gov',
  },
  {
    id: 'nejm',
    name: 'New England Journal of Medicine',
    category: 'medical_journal',
    reliability: 0.92,
    url: 'https://www.nejm.org',
  },
  {
    id: 'lancet',
    name: 'The Lancet',
    category: 'medical_journal',
    reliability: 0.91,
    url: 'https://www.thelancet.com',
  },
  {
    id: 'fda',
    name: 'U.S. Food and Drug Administration',
    category: 'drug_authority',
    reliability: 0.94,
    url: 'https://www.fda.gov',
  },
  {
    id: 'cochrane',
    name: 'Cochrane Library',
    category: 'research_database',
    reliability: 0.93,
    url: 'https://www.cochranelibrary.com',
  },
];

// Keywords that influence mock ratings
const RATING_KEYWORDS: Record<string, { rating: Rating; confidence: number }> = {
  // Likely true claims
  'vaccine effective': { rating: 'verified', confidence: 0.9 },
  'cdc recommends': { rating: 'verified', confidence: 0.88 },
  'fda approved': { rating: 'verified', confidence: 0.92 },
  'clinical trial': { rating: 'mostly_true', confidence: 0.75 },
  'peer reviewed': { rating: 'mostly_true', confidence: 0.8 },
  'meta-analysis': { rating: 'verified', confidence: 0.85 },
  
  // Likely false claims
  'cure cancer': { rating: 'mostly_false', confidence: 0.85 },
  'miracle cure': { rating: 'false', confidence: 0.9 },
  '100% effective': { rating: 'mostly_false', confidence: 0.8 },
  'doctors don\'t want': { rating: 'false', confidence: 0.88 },
  'big pharma': { rating: 'opinion', confidence: 0.7 },
  
  // Mixed/uncertain
  'some studies': { rating: 'mixed', confidence: 0.6 },
  'may help': { rating: 'unverified', confidence: 0.5 },
  'could prevent': { rating: 'unverified', confidence: 0.55 },
  'research suggests': { rating: 'mixed', confidence: 0.65 },
};

function generateMockEvidence(claim: Claim, supports: boolean): Evidence[] {
  const numEvidence = 1 + Math.floor(Math.random() * 3);
  const evidence: Evidence[] = [];
  
  const shuffledSources = [...MOCK_SOURCES].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < numEvidence && i < shuffledSources.length; i++) {
    const source = shuffledSources[i];
    
    evidence.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.category === 'medical_journal' ? 'academic' : 
                  source.category === 'public_health_agency' ? 'primary' : 'secondary',
      healthCategory: source.category,
      reliability: source.reliability,
      relevance: 0.7 + Math.random() * 0.3,
      supports,
      excerpt: generateMockExcerpt(claim.text, supports),
      url: `${source.url}/mock-article-${Date.now()}`,
      retrievedAt: new Date(),
      peerReviewed: source.category === 'medical_journal',
      studyType: source.category === 'medical_journal' ? 
                 (['meta_analysis', 'rct', 'cohort', 'review'] as const)[Math.floor(Math.random() * 4)] : 
                 undefined,
    });
  }
  
  return evidence;
}

function generateMockExcerpt(claimText: string, supports: boolean): string {
  const supportingExcerpts = [
    'Current evidence supports this finding, with multiple studies confirming the reported statistics.',
    'Our systematic review found consistent results across multiple populations and study designs.',
    'The data from controlled trials align with this claim within acceptable margins.',
    'Official guidelines confirm this recommendation based on available evidence.',
  ];
  
  const refutingExcerpts = [
    'The evidence does not support this claim. Studies show significantly different results.',
    'This figure appears to be taken out of context or misrepresents the original findings.',
    'Current scientific consensus contradicts this assertion.',
    'The cited statistic has not been verified by peer-reviewed research.',
  ];
  
  const excerpts = supports ? supportingExcerpts : refutingExcerpts;
  return excerpts[Math.floor(Math.random() * excerpts.length)];
}

function generateMockSummary(rating: Rating, claimText: string): string {
  const summaries: Record<Rating, string[]> = {
    verified: [
      'This claim is supported by official health authority data and peer-reviewed research.',
      'Multiple credible sources confirm this statistic.',
      'This information aligns with current medical consensus.',
    ],
    mostly_true: [
      'This claim is largely accurate but may lack some nuance or context.',
      'The core assertion is supported, though some details may vary.',
      'Evidence generally supports this claim with minor caveats.',
    ],
    mixed: [
      'Evidence on this claim is mixed, with studies showing varying results.',
      'Some sources support this claim while others contradict it.',
      'The truth appears more nuanced than this claim suggests.',
    ],
    unverified: [
      'We could not find sufficient evidence to verify this claim.',
      'This claim requires further investigation and verification.',
      'Insufficient data available to confirm or refute this assertion.',
    ],
    mostly_false: [
      'This claim is mostly inaccurate based on available evidence.',
      'The evidence contradicts key aspects of this claim.',
      'This assertion misrepresents or significantly distorts the data.',
    ],
    false: [
      'This claim is false according to scientific consensus and official data.',
      'No credible evidence supports this assertion.',
      'This claim has been debunked by health authorities.',
    ],
    opinion: [
      'This appears to be an opinion or value judgment rather than a verifiable fact.',
      'This statement reflects a perspective that cannot be objectively verified.',
      'This is presented as fact but functions as opinion.',
    ],
    outdated: [
      'This information may have been accurate previously but is now outdated.',
      'Newer research has superseded the data in this claim.',
      'This claim references data that has since been updated.',
    ],
  };
  
  const options = summaries[rating];
  return options[Math.floor(Math.random() * options.length)];
}

function generateMockCaveats(rating: Rating): string[] {
  const caveats: string[] = [];
  
  if (rating === 'mixed' || rating === 'mostly_true') {
    const options = [
      'Individual results may vary based on health conditions.',
      'This applies to the general population; specific groups may differ.',
      'More recent data may be available.',
      'Context and dosage are important factors not captured in this claim.',
    ];
    caveats.push(options[Math.floor(Math.random() * options.length)]);
  }
  
  return caveats;
}

function determineRating(claimText: string): { rating: Rating; confidence: number } {
  const normalizedText = claimText.toLowerCase();
  
  // Check for keyword matches
  for (const [keyword, result] of Object.entries(RATING_KEYWORDS)) {
    if (normalizedText.includes(keyword)) {
      return result;
    }
  }
  
  // Default: random-ish for demo purposes (weighted toward middle ratings)
  const ratings: Array<{ rating: Rating; weight: number }> = [
    { rating: 'verified', weight: 15 },
    { rating: 'mostly_true', weight: 25 },
    { rating: 'mixed', weight: 20 },
    { rating: 'unverified', weight: 20 },
    { rating: 'mostly_false', weight: 10 },
    { rating: 'false', weight: 5 },
    { rating: 'opinion', weight: 5 },
  ];
  
  const totalWeight = ratings.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { rating, weight } of ratings) {
    random -= weight;
    if (random <= 0) {
      return { 
        rating, 
        confidence: 0.5 + Math.random() * 0.4 
      };
    }
  }
  
  return { rating: 'unverified', confidence: 0.5 };
}

export async function verifyClaim(claim: Claim): Promise<Verification> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS));
  
  const { rating, confidence } = determineRating(claim.text);
  
  const supports = ['verified', 'mostly_true'].includes(rating);
  
  return {
    claimId: claim.id,
    rating,
    confidence,
    summary: generateMockSummary(rating, claim.text),
    evidence: generateMockEvidence(claim, supports),
    lastUpdated: new Date(),
    humanReviewed: false,
    caveats: generateMockCaveats(rating),
  };
}

export async function verifyClaimsBatch(claims: Claim[]): Promise<Map<string, Verification>> {
  const results = new Map<string, Verification>();
  
  // Process in parallel with some staggering
  const verifications = await Promise.all(
    claims.map((claim, index) => 
      new Promise<Verification>(resolve => {
        setTimeout(async () => {
          const verification = await verifyClaim(claim);
          resolve(verification);
        }, index * 200); // Stagger requests slightly
      })
    )
  );
  
  for (const verification of verifications) {
    results.set(verification.claimId, verification);
  }
  
  return results;
}
