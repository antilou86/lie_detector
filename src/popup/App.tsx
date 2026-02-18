import React, { useState, useEffect } from 'react';
import { 
  ExtensionSettings, 
  DEFAULT_SETTINGS, 
  Claim,
  Rating,
  RATING_COLORS,
  RATING_LABELS
} from '@/types';

interface PageState {
  claims: Claim[];
  url: string;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: 'white',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  logo: {
    width: '24px',
    height: '24px',
    background: 'white',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
  },
  subtitle: {
    fontSize: '12px',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: '8px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
  },
  statCard: {
    padding: '12px',
    borderRadius: '8px',
    background: '#f9fafb',
    textAlign: 'center' as const,
  },
  statNumber: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1f2937',
  },
  statLabel: {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '2px',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    borderRadius: '8px',
    background: '#f9fafb',
    marginBottom: '8px',
  },
  toggleLabel: {
    fontSize: '14px',
    fontWeight: 500,
  },
  toggleSwitch: {
    position: 'relative' as const,
    width: '44px',
    height: '24px',
    cursor: 'pointer',
  },
  toggleTrack: {
    position: 'absolute' as const,
    inset: 0,
    borderRadius: '12px',
    transition: 'background-color 0.2s',
  },
  toggleThumb: {
    position: 'absolute' as const,
    top: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '10px',
    background: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    transition: 'transform 0.2s',
  },
  claimList: {
    maxHeight: '180px',
    overflowY: 'auto' as const,
  },
  claimItem: {
    padding: '8px 12px',
    borderRadius: '6px',
    background: '#f9fafb',
    marginBottom: '6px',
    fontSize: '12px',
  },
  claimText: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    marginBottom: '4px',
  },
  ratingBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px 16px',
    color: '#6b7280',
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #e5e7eb',
    fontSize: '11px',
    color: '#9ca3af',
    textAlign: 'center' as const,
  },
  link: {
    color: '#6366f1',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  button: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#6366f1',
    color: 'white',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonSecondary: {
    background: '#f3f4f6',
    color: '#374151',
  },
};

function Toggle({ 
  checked, 
  onChange 
}: { 
  checked: boolean; 
  onChange: (checked: boolean) => void;
}) {
  return (
    <div 
      style={styles.toggleSwitch}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <div 
        style={{
          ...styles.toggleTrack,
          backgroundColor: checked ? '#6366f1' : '#d1d5db',
        }}
      />
      <div 
        style={{
          ...styles.toggleThumb,
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
        }}
      />
    </div>
  );
}

function RatingBadge({ rating }: { rating: Rating }) {
  return (
    <span
      style={{
        ...styles.ratingBadge,
        backgroundColor: `${RATING_COLORS[rating]}20`,
        color: RATING_COLORS[rating],
      }}
    >
      {RATING_LABELS[rating]}
    </span>
  );
}

export default function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [pageState, setPageState] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response) {
        setSettings(response);
      }
    });

    // Get current tab's claims
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'GET_PAGE_CLAIMS' },
          (response) => {
            if (response) {
              setPageState(response);
            }
            setLoading(false);
          }
        );
      } else {
        setLoading(false);
      }
    });
  }, []);

  const updateSettings = (updates: Partial<ExtensionSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: newSettings,
    });
  };

  const handleRescan = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESCAN_PAGE' });
      }
    });
  };

  const claimCount = pageState?.claims.length || 0;
  
  // Mock rating distribution for demo
  const ratingCounts = {
    verified: Math.floor(claimCount * 0.3),
    issues: Math.floor(claimCount * 0.1),
    unverified: claimCount - Math.floor(claimCount * 0.4),
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.logo}>✓</div>
          <span style={styles.title}>LieDetector</span>
        </div>
        <div style={styles.subtitle}>Fact Verification</div>
      </header>

      {/* Content */}
      <main style={styles.content}>
        {/* Enable/Disable Toggle */}
        <div style={styles.section}>
          <div style={styles.toggle}>
            <span style={styles.toggleLabel}>Extension Enabled</span>
            <Toggle
              checked={settings.enabled}
              onChange={(enabled) => updateSettings({ enabled })}
            />
          </div>
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            <div>Loading...</div>
          </div>
        ) : !settings.enabled ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⏸️</div>
            <div>Extension is disabled</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              Turn it on to start checking claims
            </div>
          </div>
        ) : claimCount === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🔍</div>
            <div>No claims detected</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              This page doesn't appear to contain verifiable health claims
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>This Page</div>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div style={styles.statNumber}>{claimCount}</div>
                  <div style={styles.statLabel}>Claims Found</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#22c55e' }}>
                    {ratingCounts.verified}
                  </div>
                  <div style={styles.statLabel}>Verified</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#9ca3af' }}>
                    {ratingCounts.unverified}
                  </div>
                  <div style={styles.statLabel}>Unverified</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#ef4444' }}>
                    {ratingCounts.issues}
                  </div>
                  <div style={styles.statLabel}>Issues</div>
                </div>
              </div>
            </div>

            {/* Claims List */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Recent Claims</div>
              <div style={styles.claimList}>
                {pageState?.claims.slice(0, 5).map((claim, index) => (
                  <div key={claim.id || index} style={styles.claimItem}>
                    <div style={styles.claimText}>{claim.text}</div>
                    <RatingBadge rating="unverified" />
                  </div>
                ))}
              </div>
            </div>

            {/* Rescan Button */}
            <button 
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleRescan}
            >
              Rescan Page
            </button>
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <a style={styles.link}>Methodology</a>
        {' · '}
        <a style={styles.link}>Report Issue</a>
        {' · '}
        <a style={styles.link}>Settings</a>
      </footer>
    </div>
  );
}
