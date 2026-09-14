'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './WebhookModal.module.css';

export function WebhookTriggerButton({ onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className || styles.triggerBtn}
      title="Open Webhook & Automation API Settings"
    >
      <span className={styles.pulseDot}></span>
      <span>⚡ Webhook API</span>
    </button>
  );
}

export default function WebhookModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('quickstart'); // 'quickstart' | 'testing' | 'logs'
  const [copiedKey, setCopiedKey] = useState('');
  const [secret, setSecret] = useState('arlo_clipper_secret_key');
  const [showSecret, setShowSecret] = useState(false);
  const [snippetLanguage, setSnippetLanguage] = useState('curl'); // 'curl' | 'n8n' | 'make' | 'zapier' | 'js' | 'python'

  // Testing tab state
  const [testCallbackUrl, setTestCallbackUrl] = useState('');
  const [testPingLoading, setTestPingLoading] = useState(false);
  const [testPingResult, setTestPingResult] = useState(null);

  const [testVideoUrl, setTestVideoUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [testRatio, setTestRatio] = useState('9:16');
  const [testFaceTracking, setTestFaceTracking] = useState(false);
  const [testSplitScreen, setTestSplitScreen] = useState(false);
  const [testBroll, setTestBroll] = useState('auto');
  const [testBgm, setTestBgm] = useState('upbeat-energetic');
  const [testDucking, setTestDucking] = useState('medium');
  const [testInboundLoading, setTestInboundLoading] = useState(false);
  const [testInboundResult, setTestInboundResult] = useState(null);

  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const inboundUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/process`
    : 'http://localhost:3000/api/webhooks/process';

  const refreshLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/webhooks/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.secret) setSecret(data.secret);
      }
    } catch (e) {
      console.warn('Failed to fetch webhook logs:', e);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      fetch('/api/webhooks/logs')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            setLogs(data.logs || []);
            if (data.secret) setSecret(data.secret);
          }
        })
        .catch((e) => console.warn('Failed to fetch webhook logs:', e));
    }
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (text, key) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all webhook activity logs?')) return;
    try {
      await fetch('/api/webhooks/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  };

  const handleSendTestPing = async (e) => {
    e.preventDefault();
    if (!testCallbackUrl) return;
    setTestPingLoading(true);
    setTestPingResult(null);

    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callbackUrl: testCallbackUrl,
          secret,
          event: 'clip.completed',
        }),
      });
      const data = await res.json();
      setTestPingResult(data);
      refreshLogs();
    } catch (err) {
      setTestPingResult({ error: err.message });
    } finally {
      setTestPingLoading(false);
    }
  };

  const handleTriggerInboundTest = async (e) => {
    e.preventDefault();
    if (!testVideoUrl) return;
    setTestInboundLoading(true);
    setTestInboundResult(null);

    try {
      const res = await fetch('/api/webhooks/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-arlo-secret': secret,
        },
        body: JSON.stringify({
          url: testVideoUrl,
          ratio: testRatio,
          faceTracking: testFaceTracking,
          splitScreen: testSplitScreen,
          subtitles: true,
          subtitleAnimation: 'Pop',
          broll: testBroll,
          bgm: testBgm,
          ducking: testDucking,
          callbackUrl: testCallbackUrl || undefined,
          async: true,
        }),
      });
      const data = await res.json();
      setTestInboundResult({ status: res.status, ...data });
      refreshLogs();
    } catch (err) {
      setTestInboundResult({ error: err.message });
    } finally {
      setTestInboundLoading(false);
    }
  };

  // Generate copyable snippets
  const getCurlSnippet = () => {
    return `curl -X POST "${inboundUrl || 'https://your-domain.com/api/webhooks/process'}" \\
  -H "Content-Type: application/json" \\
  -H "x-arlo-secret: ${secret}" \\
  -d '{
    "url": "https://www.youtube.com/watch?v=YOUR_VIDEO_ID",
    "ratio": "9:16",
    "faceTracking": false,
    "splitScreen": false,
    "subtitles": true,
    "subtitleAnimation": "Pop",
    "broll": "auto",
    "bgm": "upbeat-energetic",
    "ducking": "medium",
    "sfx": true,
    "callbackUrl": "https://your-automation-server.com/webhook/receive"
  }'`;
  };

  const getN8nSnippet = () => {
    return JSON.stringify(
      {
        nodes: [
          {
            name: 'Arlo Clipper Webhook',
            type: 'n8n-nodes-base.httpRequest',
            typeVersion: 4.2,
            position: [250, 300],
            parameters: {
              method: 'POST',
              url: inboundUrl || 'http://localhost:3000/api/webhooks/process',
              sendHeaders: true,
              headerParameters: {
                parameters: [
                  { name: 'Content-Type', value: 'application/json' },
                  { name: 'x-arlo-secret', value: secret },
                ],
              },
              sendBody: true,
              bodyParameters: {
                parameters: [
                  { name: 'url', value: '={{ $json.youtube_url }}' },
                  { name: 'ratio', value: '9:16' },
                  { name: 'subtitles', value: true },
                  { name: 'subtitleAnimation', value: 'Pop' },
                  { name: 'broll', value: 'auto' },
                  { name: 'bgm', value: 'upbeat-energetic' },
                  { name: 'ducking', value: 'medium' },
                  { name: 'sfx', value: true },
                  { name: 'callbackUrl', value: '={{ $execution.resumeUrl }}' },
                ],
              },
            },
          },
        ],
      },
      null,
      2
    );
  };

  const getMakeSnippet = () => {
    return JSON.stringify(
      {
        url: inboundUrl || 'http://localhost:3000/api/webhooks/process',
        method: 'POST',
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'x-arlo-secret', value: secret },
        ],
        body: {
          url: '{{1.youtube_url}}',
          ratio: '9:16',
          subtitles: true,
          subtitleAnimation: 'Pop',
          broll: 'auto',
          bgm: 'upbeat-energetic',
          ducking: 'medium',
          sfx: true,
          callbackUrl: '{{webhook.url}}',
        },
      },
      null,
      2
    );
  };

  const getZapierSnippet = () => {
    return JSON.stringify(
      {
        action: 'Webhooks by Zapier (POST)',
        url: inboundUrl || 'http://localhost:3000/api/webhooks/process',
        payload_type: 'json',
        data: {
          url: '{{step1.youtube_url}}',
          ratio: '9:16',
          subtitles: true,
          subtitleAnimation: 'Pop',
          broll: 'auto',
          bgm: 'upbeat-energetic',
          ducking: 'medium',
          sfx: true,
          callbackUrl: '{{zapier_catch_hook_url}}',
        },
        headers: {
          'Content-Type': 'application/json',
          'x-arlo-secret': secret,
        },
      },
      null,
      2
    );
  };

  const getJsSnippet = () => {
    return `const response = await fetch("${inboundUrl || 'https://your-domain.com/api/webhooks/process'}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-arlo-secret": "${secret}",
  },
  body: JSON.stringify({
    url: "https://www.youtube.com/watch?v=VIDEO_ID",
    ratio: "9:16",
    faceTracking: false,
    splitScreen: false,
    subtitles: true,
    subtitleAnimation: "Pop",
    broll: "auto",
    bgm: "upbeat-energetic",
    ducking: "medium",
    sfx: true,
    callbackUrl: "https://your-backend.com/api/clip-webhook",
  }),
});

const result = await response.json();
console.log("Job Queued:", result.jobId);`;
  };

  const getPythonSnippet = () => {
    return `import requests

url = "${inboundUrl || 'https://your-domain.com/api/webhooks/process'}"
headers = {
    "Content-Type": "application/json",
    "x-arlo-secret": "${secret}"
}
payload = {
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "ratio": "9:16",
    "subtitles": True,
    "subtitleAnimation": "Pop",
    "broll": "auto",
    "bgm": "upbeat-energetic",
    "ducking": "medium",
    "sfx": True,
    "callbackUrl": "https://your-backend.com/api/clip-webhook"
}

response = requests.post(url, json=payload, headers=headers)
print("Response:", response.status_code, response.json())`;
  };

  const getActiveCode = () => {
    switch (snippetLanguage) {
      case 'curl': return getCurlSnippet();
      case 'n8n': return getN8nSnippet();
      case 'make': return getMakeSnippet();
      case 'zapier': return getZapierSnippet();
      case 'js': return getJsSnippet();
      case 'python': return getPythonSnippet();
      default: return getCurlSnippet();
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>⚡</div>
            <div>
              <h2 className={styles.title}>Webhook Automation</h2>
              <p className={styles.subtitle}>
                Autopilot video clipping API for n8n, Make.com, Zapier & Bot integrations
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn} title="Close">
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'quickstart' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('quickstart')}
          >
            🔌 API & Integrations
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'testing' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('testing')}
          >
            🧪 Test & Trigger
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.tabBtnActive : ''}`}
            onClick={() => {
              setActiveTab('logs');
              fetchLogs();
            }}
          >
            📊 Activity Logs ({logs.length})
          </button>
        </div>

        {/* Content Body */}
        <div className={styles.content}>
          {activeTab === 'quickstart' && (
            <>
              {/* Endpoint box */}
              <div className={styles.endpointBox}>
                <div className={styles.endpointLabel}>
                  <span>Inbound Webhook Endpoint</span>
                  <span className={styles.methodBadge}>POST</span>
                </div>
                <div className={styles.endpointRow}>
                  <div className={styles.endpointUrl}>{inboundUrl || '/api/webhooks/process'}</div>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copiedKey === 'url' ? styles.copyBtnSuccess : ''}`}
                    onClick={() => handleCopy(inboundUrl || 'http://localhost:3000/api/webhooks/process', 'url')}
                  >
                    {copiedKey === 'url' ? '✓ Copied' : '📋 Copy URL'}
                  </button>
                </div>
              </div>

              {/* Secret box */}
              <div className={styles.endpointBox}>
                <div className={styles.endpointLabel}>
                  <span>Webhook Secret (Authentication)</span>
                  <span style={{ fontSize: '0.72rem', color: '#818cf8' }}>
                    Header: <code>x-arlo-secret</code> or <code>Authorization: Bearer</code>
                  </span>
                </div>
                <div className={styles.endpointRow}>
                  <div className={styles.endpointUrl}>
                    {showSecret ? secret : '••••••••••••••••••••••••••••••••'}
                  </div>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => setShowSecret(!showSecret)}
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? '👁️ Hide' : '👁️ Show'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copiedKey === 'secret' ? styles.copyBtnSuccess : ''}`}
                    onClick={() => handleCopy(secret, 'secret')}
                  >
                    {copiedKey === 'secret' ? '✓ Copied' : '📋 Copy Secret'}
                  </button>
                </div>
              </div>

              {/* Code Snippets */}
              <div className={styles.snippetSection}>
                <div className={styles.snippetHeader}>
                  <span className={styles.snippetTitle}>Integration Examples & Payloads</span>
                  <div className={styles.snippetPills}>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'curl' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('curl')}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'n8n' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('n8n')}
                    >
                      n8n
                    </button>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'make' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('make')}
                    >
                      Make.com
                    </button>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'zapier' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('zapier')}
                    >
                      Zapier
                    </button>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'js' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('js')}
                    >
                      JavaScript
                    </button>
                    <button
                      type="button"
                      className={`${styles.snippetPill} ${snippetLanguage === 'python' ? styles.snippetPillActive : ''}`}
                      onClick={() => setSnippetLanguage('python')}
                    >
                      Python
                    </button>
                  </div>
                </div>

                <div className={styles.codeBox}>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${styles.codeCopyFloating} ${
                      copiedKey === 'code' ? styles.copyBtnSuccess : ''
                    }`}
                    onClick={() => handleCopy(getActiveCode(), 'code')}
                  >
                    {copiedKey === 'code' ? '✓ Copied' : '📋 Copy Snippet'}
                  </button>
                  <pre>{getActiveCode()}</pre>
                </div>
              </div>
            </>
          )}

          {activeTab === 'testing' && (
            <div className={styles.testGrid}>
              {/* Test Outbound Ping */}
              <div className={styles.testCard}>
                <div className={styles.testCardTitle}>
                  <span>📡 Test Outbound Callback</span>
                </div>
                <p className={styles.testCardDesc}>
                  Kirimkan sampel event <code>clip.completed</code> lengkap dengan HMAC SHA-256 signature ke target webhook URL Anda (misal n8n / webhook.site).
                </p>

                <form onSubmit={handleSendTestPing} className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Target Callback URL</label>
                  <input
                    type="url"
                    placeholder="https://webhook.site/... or n8n webhook URL"
                    value={testCallbackUrl}
                    onChange={(e) => setTestCallbackUrl(e.target.value)}
                    required
                    className={styles.inputField}
                  />

                  <button
                    type="submit"
                    disabled={testPingLoading || !testCallbackUrl}
                    className={styles.primaryActionBtn}
                    style={{ marginTop: '0.5rem' }}
                  >
                    {testPingLoading ? 'Mengirim Ping...' : '🚀 Kirim Test Ping'}
                  </button>
                </form>

                {testPingResult && (
                  <div className={styles.testResultBox}>
                    {JSON.stringify(testPingResult, null, 2)}
                  </div>
                )}
              </div>

              {/* Test Inbound Pipeline Trigger */}
              <div className={styles.testCard}>
                <div className={styles.testCardTitle}>
                  <span>⚙️ Trigger Inbound Video Job</span>
                </div>
                <p className={styles.testCardDesc}>
                  Simulasi request pemrosesan video otomatis via API lokal secara langsung.
                </p>

                <form onSubmit={handleTriggerInboundTest} className={styles.inputGroup}>
                  <label className={styles.inputLabel}>YouTube URL</label>
                  <input
                    type="url"
                    value={testVideoUrl}
                    onChange={(e) => setTestVideoUrl(e.target.value)}
                    required
                    className={styles.inputField}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.35rem' }}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>Ratio</label>
                      <select
                        value={testRatio}
                        onChange={(e) => setTestRatio(e.target.value)}
                        className={styles.inputField}
                      >
                        <option value="9:16">9:16 (Vertical Shorts/Reels)</option>
                        <option value="16:9">16:9 (Landscape)</option>
                      </select>
                    </div>

                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>BGM Track</label>
                      <select
                        value={testBgm}
                        onChange={(e) => setTestBgm(e.target.value)}
                        className={styles.inputField}
                      >
                        <option value="upbeat-energetic">Upbeat & Energetic</option>
                        <option value="chill-lofi">Chill & Lofi</option>
                        <option value="dramatic-suspense">Dramatic Suspense</option>
                        <option value="none">None (No BGM)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem' }}>
                    <label style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={testFaceTracking}
                        onChange={(e) => {
                          setTestFaceTracking(e.target.checked);
                          if (e.target.checked) setTestSplitScreen(false);
                        }}
                      />
                      Face Tracking
                    </label>

                    <label style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={testSplitScreen}
                        onChange={(e) => {
                          setTestSplitScreen(e.target.checked);
                          if (e.target.checked) setTestFaceTracking(false);
                        }}
                      />
                      Split Screen (2-P)
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={testInboundLoading || !testVideoUrl}
                    className={styles.primaryActionBtn}
                    style={{ marginTop: '0.5rem' }}
                  >
                    {testInboundLoading ? 'Memproses Request...' : '▶ Submit Webhook Job'}
                  </button>
                </form>

                {testInboundResult && (
                  <div className={styles.testResultBox}>
                    {JSON.stringify(testInboundResult, null, 2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <>
              <div className={styles.logsHeader}>
                <span className={styles.logsCount}>
                  {logsLoading ? 'Loading logs...' : `Showing last ${logs.length} webhook events`}
                </span>
                <div className={styles.logsActions}>
                  <button type="button" onClick={fetchLogs} className={styles.refreshBtn}>
                    🔄 Refresh
                  </button>
                  {logs.length > 0 && (
                    <button type="button" onClick={handleClearLogs} className={styles.clearBtn}>
                      🗑️ Clear Logs
                    </button>
                  )}
                </div>
              </div>

              {logs.length === 0 ? (
                <div className={styles.emptyLogs}>
                  <p>Belum ada riwayat aktivitas webhook.</p>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-sub)' }}>
                    Kirimkan request ke <code>/api/webhooks/process</code> atau jalankan test untuk melihat log aktivitas di sini.
                  </p>
                </div>
              ) : (
                <div className={styles.logsList}>
                  {logs.map((log) => {
                    const isSuccess = log.status === 'success' || (log.statusCode >= 200 && log.statusCode < 300);
                    const isProc = log.status === 'processing';
                    return (
                      <div key={log.id || log.timestamp} className={styles.logItem}>
                        <div className={styles.logItemTop}>
                          <div className={styles.logItemBadgeWrap}>
                            <span
                              className={
                                isProc
                                  ? styles.statusProcessing
                                  : isSuccess
                                  ? styles.statusSuccess
                                  : styles.statusFailed
                              }
                            >
                              {log.statusCode || (isSuccess ? 200 : isProc ? 202 : 500)} {log.type?.toUpperCase()}
                            </span>
                            <span className={styles.logEvent}>{log.event}</span>
                          </div>
                          <span className={styles.logTime}>
                            {new Date(log.timestamp).toLocaleTimeString()} · {log.durationMs || 0}ms
                          </span>
                        </div>

                        {log.url && <div className={styles.logUrl}>{log.url}</div>}

                        {log.error && (
                          <div style={{ color: '#f87171', fontSize: '0.72rem' }}>
                            Error: {log.error}
                          </div>
                        )}

                        {log.details && (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {log.details.clipCount !== undefined && `Generated: ${log.details.clipCount} clips `}
                            {log.details.ratio && `· Ratio: ${log.details.ratio} `}
                            {log.details.bgm && `· BGM: ${log.details.bgm}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
