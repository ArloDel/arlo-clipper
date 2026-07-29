import { NextResponse } from 'next/server';

export function middleware(request) {
  const session = request.cookies.get('session');
  
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');
  const isAuthApi = request.nextUrl.pathname.startsWith('/api/auth');
  const isStatic = request.nextUrl.pathname.startsWith('/_next') || request.nextUrl.pathname.includes('.');

  if (isStatic || isAuthApi) {
    return NextResponse.next();
  }

  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
