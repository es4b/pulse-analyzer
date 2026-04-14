import createMiddleware from 'next-intl/middleware';
import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const authMiddleware = withAuth(
  function onSuccess(req) {
    return intlMiddleware(req as NextRequest);
  },
  {
    callbacks: {
      authorized: ({ token }) => token != null,
    },
    pages: {
      signIn: '/auth',
    },
  }
);

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isDashboard = routing.locales.some((locale) =>
    pathname.startsWith(`/${locale}/dashboard`)
  );

  if (isDashboard) {
    return (authMiddleware as unknown as (req: NextRequest) => NextResponse)(req);
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
