import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/request-origin";
import { currentUser, serverClient } from "@/lib/supabase/server";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Request not allowed." },
      { status: 403 },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true });
  let name = "";
  let content = "";
  if (body.action === "welcome") {
    name = "dzirent-welcome";
    content = "seen";
  }
  if (
    body.action === "location" &&
    typeof body.city === "string" &&
    /^.{1,80}, [A-Z]{2}$/.test(body.city) &&
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng) &&
    Math.abs(body.lat) <= 90 &&
    Math.abs(body.lng) <= 180
  ) {
    name = "dzirent-location";
    content = JSON.stringify({
      city: body.city,
      lat: Math.round(body.lat * 100) / 100,
      lng: Math.round(body.lng * 100) / 100,
    });
  }
  if (
    body.action === "dates" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.start || "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.end || "") &&
    body.end >= body.start
  ) {
    name = "dzirent-dates";
    content = JSON.stringify({ start: body.start, end: body.end });
  }
  if (body.action === "clear-dates") {
    name = "dzirent-dates";
  }
  if (name === "dzirent-location") {
    const user = await currentUser();
    if (user) {
      const location = JSON.parse(content);
      const { error } = await (
        await serverClient()
      )
        .from("profiles")
        .update({
          city: location.city,
          approx_lat: location.lat,
          approx_lng: location.lng,
        })
        .eq("id", user.id);
      if (error)
        return NextResponse.json(
          { error: "Could not update your location. Please try again." },
          { status: 400 },
        );
    }
  }
  if (!name)
    return NextResponse.json(
      { error: "Please check your selection." },
      { status: 400 },
    );
  response.cookies.set(name, content, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: content ? 31536000 : 0,
  });
  return response;
}
