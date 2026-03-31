import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const loggedIn = !!req.auth;
  if (req.nextUrl.pathname.startsWith("/dashboard") && !loggedIn) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
