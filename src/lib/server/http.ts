import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { UnauthorizedError } from "@/lib/server/auth";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues[0]?.message ?? "Invalid request payload.",
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: noStoreHeaders,
      },
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }

  return NextResponse.json(
    { error: "Unexpected server error." },
    {
      status: 500,
      headers: noStoreHeaders,
    },
  );
}
