// Core domain types for the fact-checking extension
// Focused on health/medical claims for MVP

export type ClaimType = 'statistic' | 'quote' | 'event' | 'attribution';

export type Rating = 
  | 'verified' 
  | 'mostly_true' 
  | 'mixed' 
  | 'unverified' 
  | 'mostly_false' 
  | 'false' 
  | 'opinion' 
  | 'outdated';

export type SourceType = 
  | 'government' 
  | 'academic' 
  | 'news_wire' 
  | 'news_outlet' 
  | 'fact_checker' 
  | 'organization' 
  | 'individual';

export type EvidenceType = 'primary' | 'secondary' | 'fact_check' | 'academic';

// Health-specific source categories
export type HealthSourceCategory = 
  | 'public_health_agency'    // CDC, WHO, NHS
  | 'medical_journal'         // NEJM, Lancet, JAMA
  | 'research_database'       // PubMed, Cochrane
  | 'clinical_guidelines'     // NICE, USPSTF
  | 'drug_authority'          // FDA, EMA
  | 'medical_association';    // AMA, specialty societies

export interface Entity {
  text: string;
  type: 'drug' | 'condition' | 'statistic' | 'organization' | 'person' | 'study';
  normalized?: string;
  wikidata_id?: string;
}

export interface Claim {
  id: string;
  text: string;
  normalizedText: string;
  claimType: ClaimType;
  entities: Entity[];
  extractedFrom: {
    url: string;
    domain: string;
    timestamp: Date;
  };
  // Position in page for highlighting
  position?: {
    startOffset: number;
    endOffset: number;
    xpath: string;
  };
}

export interface Evidence {
  sourceId: string;
  sourceName: string;
  sourceType: EvidenceType;
  healthCategory?: HealthSourceCategory;
  reliability: number;  // 0-1
  relevance: number;    // 0-1
  supports: boolean;
  excerpt: string;
  url: string;
  retrievedAt: Date;
  // Health-specific metadata
  publicationDate?: Date;
  peerReviewed?: boolean;
  sampleSize?: number;
  studyType?: 'meta_analysis' | 'rct' | 'cohort' | 'case_control' | 'case_report' | 'review';
}

export interface Verification {
  claimId: string;
  rating: Rating;
  confidence: number;  // 0-1
  summary: string;
  evidence: Evidence[];
  lastUpdated: Date;
  humanReviewed: boolean;
  // Context for why this rating was given
  reasoning?: string;
  caveats?: string[];
}

export interface Source {
  id: string;
  name: string;
  domain: string;
  type: SourceType;
  healthCategory?: HealthSourceCategory;
  reliabilityScore: number;
  biasIndicators: string[];
  lastAudited: Date;
}

// Extension-specific types

export interface DetectedClaim {
  claim: Claim;
  element: HTMLElement;
  range: Range;
}

export interface HighlightedClaim {
  claimId: string;
  highlightElement: HTMLElement;
  verification?: Verification;
}

export interface ExtensionSettings {
  enabled: boolean;
  highlightAggressiveness: 'minimal' | 'moderate' | 'aggressive';
  showTooltips: boolean;
  enabledDomains: string[];
  disabledDomains: string[];
  minConfidenceToShow: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  highlightAggressiveness: 'moderate',
  showTooltips: true,
  enabledDomains: [],
  disabledDomains: [],
  minConfidenceToShow: 0.3,
};

// Message types for extension communication
export type MessageType = 
  | 'VERIFY_CLAIMS'
  | 'VERIFY_SELECTION'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'CLAIM_VERIFIED'
  | 'PAGE_SCANNED';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface VerifyClaimsMessage extends ExtensionMessage {
  type: 'VERIFY_CLAIMS';
  payload: {
    claims: Claim[];
    url: string;
  };
}

export interface VerifySelectionMessage extends ExtensionMessage {
  type: 'VERIFY_SELECTION';
  payload: {
    text: string;
    url: string;
  };
}

export interface ClaimVerifiedMessage extends ExtensionMessage {
  type: 'CLAIM_VERIFIED';
  payload: {
    claimId: string;
    verification: Verification;
  };
}

// Rating colors for UI
export const RATING_COLORS: Record<Rating, string> = {
  verified: '#22c55e',      // green
  mostly_true: '#84cc16',   // lime
  mixed: '#eab308',         // yellow
  unverified: '#9ca3af',    // gray
  mostly_false: '#f97316',  // orange
  false: '#ef4444',         // red
  opinion: '#8b5cf6',       // purple
  outdated: '#6b7280',      // dark gray
};

export const RATING_LABELS: Record<Rating, string> = {
  verified: 'Verified',
  mostly_true: 'Mostly True',
  mixed: 'Mixed Evidence',
  unverified: 'Unverified',
  mostly_false: 'Mostly False',
  false: 'False',
  opinion: 'Opinion',
  outdated: 'Outdated',
};
