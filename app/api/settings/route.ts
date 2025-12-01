import { NextResponse } from "next/server";
import settings from "./settings.json";

export async function GET() {
  return NextResponse.json(
    {
      // Static settings imported from JSON (ads etc.)
      ...settings,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}

