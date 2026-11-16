/**
 * proxy.ts — (ex-middleware, renommé en Next.js 16)
 *
 * 🔐 Le panel admin (/panel/...) n'est servi QUE via la passerelle admin :
 *    http://localhost:2025  (npm run admin) — accessible uniquement depuis ce PC.
 * Sur le port du chat (1608, ouvert au Wi-Fi), /panel répond une page 404 ordinaire,
 * comme si le panel n'existait pas.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_GATEWAY_HEADER, isAdminGatewayRequest } from '@/lib/adminGateway';

export function proxy(request: NextRequest) {
  if (isAdminGatewayRequest(request.headers.get(ADMIN_GATEWAY_HEADER))) {
    return NextResponse.next();
  }
  return NextResponse.rewrite(new URL('/__page-introuvable', request.url), { status: 404 });
}

export const config = {
  matcher: ['/panel', '/panel/:path*'],
};
