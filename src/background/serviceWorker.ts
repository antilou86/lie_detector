/**
 * Background Service Worker
 * 
 * Handles:
 * - Communication between content scripts and backend API
 * - Context menu for "Check this" functionality
 * - Badge updates showing claim counts
 */

import { 
  Claim, 
  ExtensionSettings, 
  DEFAULT_SETTINGS,
  VerifyClaimsMessage,
  VerifySelectionMessage 
} from '@/types';
import { verifyClaimsApi, verifyClaimApi, checkBackendHealth } from '@/services/apiVerificationService';

// Initialize context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'LieDetector-verify',
    title: 'Check this claim',
    contexts: ['selection'],
  });
  
  // Set default settings
  chrome.storage.sync.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
  });
  
  console.log('[LieDetector] Extension installed');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'LieDetector-verify' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'VERIFY_SELECTION',
      payload: {
        text: info.selectionText,
        url: tab.url,
      },
    });
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  switch (message.type) {
    case 'VERIFY_CLAIMS': {
      const { claims, url } = (message as VerifyClaimsMessage).payload;
      handleVerifyClaims(claims, tabId, url);
      break;
    }
    
    case 'VERIFY_SELECTION': {
      const { text, url } = (message as VerifySelectionMessage).payload;
      handleVerifySelection(text, url, tabId);
      break;
    }
    
    case 'PAGE_SCANNED': {
      const { claimCount } = message.payload;
      updateBadge(claimCount, tabId);
      break;
    }
    
    case 'GET_SETTINGS': {
      chrome.storage.sync.get(['settings'], (result) => {
        sendResponse(result.settings || DEFAULT_SETTINGS);
      });
      return true; // Keep channel open for async response
    }
    
    case 'UPDATE_SETTINGS': {
      const settings = message.payload as ExtensionSettings;
      chrome.storage.sync.set({ settings }, () => {
        // Broadcast to all tabs
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: 'UPDATE_SETTINGS',
                payload: settings,
              }).catch(() => {
                // Tab might not have content script
              });
            }
          }
        });
        sendResponse({ success: true });
      });
      return true;
    }
  }
  
  return false;
});

async function handleVerifyClaims(claims: Claim[], tabId?: number, url?: string): Promise<void> {
  if (!claims.length) return;
  
  console.log(`[LieDetector] Verifying ${claims.length} claims via backend API`);
  
  try {
    // Use real backend API
    const verifications = await verifyClaimsApi(claims, url);
    
    // Send verifications back to content script
    if (tabId) {
      for (const [claimId, verification] of verifications) {
        chrome.tabs.sendMessage(tabId, {
          type: 'CLAIM_VERIFIED',
          payload: {
            claimId,
            verification,
          },
        }).catch(err => {
          console.debug('[LieDetector] Failed to send verification:', err);
        });
      }
    }
    
    // Update badge with verification summary
    const ratings = Array.from(verifications.values()).map(v => v.rating);
    const hasIssues = ratings.some(r => 
      ['mostly_false', 'false', 'outdated'].includes(r)
    );
    
    if (hasIssues && tabId) {
      chrome.action.setBadgeBackgroundColor({ 
        color: '#ef4444', 
        tabId 
      });
    }
    
  } catch (error) {
    console.error('[LieDetector] Verification failed:', error);
  }
}

async function handleVerifySelection(text: string, url: string, tabId?: number): Promise<void> {
  const claim: Claim = {
    id: `selection_${Date.now()}`,
    text: text,
    normalizedText: text.toLowerCase().trim(),
    claimType: 'statistic',
    entities: [],
    extractedFrom: {
      url,
      domain: new URL(url).hostname,
      timestamp: new Date(),
    },
  };
  
  try {
    const verification = await verifyClaimApi(claim, url);
    
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'CLAIM_VERIFIED',
        payload: {
          claimId: claim.id,
          verification,
        },
      });
    }
  } catch (error) {
    console.error('[LieDetector] Selection verification failed:', error);
  }
}

function updateBadge(claimCount: number, tabId?: number): void {
  if (!tabId) return;
  
  if (claimCount > 0) {
    chrome.action.setBadgeText({ 
      text: claimCount.toString(), 
      tabId 
    });
    chrome.action.setBadgeBackgroundColor({ 
      color: '#6366f1', // indigo
      tabId 
    });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

console.log('[LieDetector] Background service worker started');
