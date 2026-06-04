import { NextResponse } from "next/server";
import { z } from "zod";
import { applyHtmlInstruction } from "@/lib/htmlAssistant";

export const runtime = "nodejs";

const requestSchema = z.object({
  html: z.string().min(1),
  instruction: z.string().min(1),
  slideName: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await applyHtmlInstruction(body.html, body.instruction, body.slideName);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The HTML assistant request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}