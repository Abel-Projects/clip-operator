import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorizedApi(): NextResponse {
  // No WWW-Authenticate header — avoids the browser's native login dialog.
  // The workbench unlock form sends Authorization on API calls instead.
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password) {
    return NextResponse.next();
  }

  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorizedApi();
  }

  const encoded = authorization.slice("Basic ".length);
  let decoded = "";

  try {
    decoded = atob(encoded);
  } catch {
    return unauthorizedApi();
  }

  const separator = decoded.indexOf(":");
  const suppliedPassword =
    separator >= 0 ? decoded.slice(separator + 1) : decoded;

  if (suppliedPassword !== password) {
    return unauthorizedApi();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
