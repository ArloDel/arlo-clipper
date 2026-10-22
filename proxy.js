import { NextResponse } from 'next/server';

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // 1. Static assets & Next.js internals: bypass proxy
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Public endpoints (login page & auth API)
  const isLoginPage = pathname === '/login' || pathname.startsWith('/login/');
  const isAuthApi = pathname.startsWith('/api/auth');

  // External webhook receivers (secured via internal signature/secret verification)
  const isWebhookReceiver =
    pathname === '/api/webhook' || pathname.startsWith('/api/webhooks/process');

  if (isAuthApi || isWebhookReceiver) {
    return NextResponse.next();
  }

  // 3. Authenticate session cookie or Authorization Bearer token
  const sessionCookie = request.cookies.get('session')?.value;
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const isAuthenticated =
    sessionCookie === 'authenticated' ||
    Boolean(bearerToken && constantTimeEqual(bearerToken, adminPassword));

  // 4. API routes: return JSON 401 if unauthenticated
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // 5. Page routes: redirect to /login if unauthenticated
  if (!isAuthenticated && !isLoginPage) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 6. Already authenticated: redirect away from login to home
  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
