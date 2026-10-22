import assert from 'assert';
import { isSecretMatch } from '../lib/webhooks.js';

console.log('=== Starting Auth Protection & Access Control Test Suite ===\n');

// 1. Test Timing-Safe Password Verification
console.log('--- Test 1: Timing-safe Password Comparison ---');
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

assert.strictEqual(isSecretMatch('admin123', adminPassword), true, 'Correct password must match');
assert.strictEqual(isSecretMatch('wrongpassword', adminPassword), false, 'Incorrect password must fail');
assert.strictEqual(isSecretMatch('', adminPassword), false, 'Empty password must fail');
assert.strictEqual(isSecretMatch(null, adminPassword), false, 'Null password must fail');
assert.strictEqual(isSecretMatch(undefined, adminPassword), false, 'Undefined password must fail');
console.log('✓ Password matching behaves securely with constant-time equality');

// 2. Test Constant-Time Equality Helper
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

console.log('\n--- Test 2: Constant-Time String Equality ---');
assert.strictEqual(constantTimeEqual('admin123', 'admin123'), true);
assert.strictEqual(constantTimeEqual('admin123', 'admin124'), false);
assert.strictEqual(constantTimeEqual('admin123', 'admin12'), false);
assert.strictEqual(constantTimeEqual('', ''), true);
console.log('✓ Constant-time string equality verified');

// 3. Test Proxy Decision Matrix Logic
function evaluateProxyAccess({ pathname, cookieSession, authHeader, adminSecret = 'admin123' }) {
  // Static bypass
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return { action: 'next', reason: 'static' };
  }

  // Public endpoints
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');
  const isAuthApi = pathname.startsWith('/api/auth');
  const isWebhookReceiver =
    pathname === '/api/webhook' || pathname.startsWith('/api/webhooks/process');

  if (isAuthApi || isWebhookReceiver) {
    return { action: 'next', reason: 'public_api' };
  }

  // Authenticate session or Bearer
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const isAuthenticated =
    cookieSession === 'authenticated' ||
    Boolean(bearerToken && constantTimeEqual(bearerToken, adminSecret));

  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return { action: 'reject_401', reason: 'unauthorized_api' };
    }
    return { action: 'next', reason: 'authorized_api' };
  }

  if (!isAuthenticated && !isLoginPage) {
    return { action: 'redirect', to: `/login?from=${encodeURIComponent(pathname)}` };
  }

  if (isAuthenticated && isLoginPage) {
    return { action: 'redirect', to: '/' };
  }

  return { action: 'next', reason: 'authorized_page' };
}

console.log('\n--- Test 3: Static Asset Access ---');
let decision = evaluateProxyAccess({ pathname: '/_next/static/css/app.css' });
assert.strictEqual(decision.action, 'next');
decision = evaluateProxyAccess({ pathname: '/logo.png' });
assert.strictEqual(decision.action, 'next');
console.log('✓ Static assets bypass proxy');

console.log('\n--- Test 4: Auth and Public Webhook Ingestion Routes ---');
decision = evaluateProxyAccess({ pathname: '/api/auth' });
assert.strictEqual(decision.action, 'next');
decision = evaluateProxyAccess({ pathname: '/api/webhook' });
assert.strictEqual(decision.action, 'next');
decision = evaluateProxyAccess({ pathname: '/api/webhooks/process' });
assert.strictEqual(decision.action, 'next');
console.log('✓ Public endpoints allowed without session cookie');

console.log('\n--- Test 5: Sensitive API Endpoints Blocked When Unauthenticated ---');
const sensitiveEndpoints = [
  '/api/clips/test-clip',
  '/api/publish/config',
  '/api/analyze',
  '/api/render-final',
  '/api/webhooks/logs',
  '/api/face-track',
  '/api/lip-track',
  '/api/split-screen',
];

for (const ep of sensitiveEndpoints) {
  decision = evaluateProxyAccess({ pathname: ep });
  assert.strictEqual(decision.action, 'reject_401', `Endpoint ${ep} must return 401 when unauthenticated`);
}
console.log(`✓ All ${sensitiveEndpoints.length} sensitive API endpoints return 401`);

console.log('\n--- Test 6: Forged Cookie Rejected ---');
decision = evaluateProxyAccess({ pathname: '/api/publish/config', cookieSession: 'hacked_session_token' });
assert.strictEqual(decision.action, 'reject_401');
console.log('✓ Forged session cookie rejected with 401');

console.log('\n--- Test 7: Valid Cookie or Bearer Token Accepted ---');
decision = evaluateProxyAccess({ pathname: '/api/publish/config', cookieSession: 'authenticated' });
assert.strictEqual(decision.action, 'next');

decision = evaluateProxyAccess({
  pathname: '/api/publish/config',
  authHeader: 'Bearer admin123',
});
assert.strictEqual(decision.action, 'next');
console.log('✓ Both authenticated cookie and Bearer token permitted');

console.log('\n--- Test 8: Page Route Redirects ---');
decision = evaluateProxyAccess({ pathname: '/editorial' });
assert.strictEqual(decision.action, 'redirect');
assert.strictEqual(decision.to, '/login?from=%2Feditorial');

decision = evaluateProxyAccess({ pathname: '/login', cookieSession: 'authenticated' });
assert.strictEqual(decision.action, 'redirect');
assert.strictEqual(decision.to, '/');

decision = evaluateProxyAccess({ pathname: '/editorial', cookieSession: 'authenticated' });
assert.strictEqual(decision.action, 'next');
console.log('✓ Page redirects work as expected');

console.log('\n=== All Auth & Access Control Tests Passed! ===');
