import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCompiledPresentationHtml } from "@/lib/compiledPresentation";

export const runtime = "nodejs";

const slideSchema = z.object({
  name: z.string().min(1),
  originalHtml: z.string().min(1),
});

const requestSchema = z.object({
  slides: z.array(slideSchema).min(1),
});

const netlifyBaseUrl = "https://api.netlify.com/api/v1";

function getToken() {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) {
    throw new Error("NETLIFY_AUTH_TOKEN is not set.");
  }

  return token;
}

function buildHeaders(token: string, contentType = "application/json") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
    "User-Agent": "html-arrange-tool",
  };
}

async function readResponseMessage(response: Response) {
  const text = await response.text();

  if (!text) {
    return response.statusText || "Unknown Netlify API error.";
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
}

async function netlifyRequest<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const response = await fetch(`${netlifyBaseUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(token),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readResponseMessage(response));
  }

  return (await response.json()) as T;
}

async function createSite(token: string) {
  const suffix = createHash("sha1").update(`${Date.now()}-${randomUUID()}`).digest("hex").slice(0, 10);
  const name = `html-arrange-${suffix}`;

  return netlifyRequest<{ id: string }>(
    "/sites",
    {
      method: "POST",
      body: JSON.stringify({ name }),
    },
    token
  );
}

async function getSiteUrl(siteId: string, token: string) {
  const site = await netlifyRequest<{ url?: string; ssl_url?: string; name?: string; deploy_url?: string }>(
    `/sites/${encodeURIComponent(siteId)}`,
    { method: "GET" },
    token
  );

  return site.ssl_url || site.url || (site.name ? `https://${site.name}.netlify.app` : null) || site.deploy_url || null;
}

async function waitForDeploy(siteId: string, deployId: string, token: string) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const deploy = await netlifyRequest<{ state?: string }>(
      `/sites/${encodeURIComponent(siteId)}/deploys/${encodeURIComponent(deployId)}`,
      { method: "GET" },
      token
    );

    if (deploy.state === "ready" || deploy.state === "current") {
      return;
    }

    if (deploy.state === "error" || deploy.state === "failed") {
      throw new Error(`Netlify deploy failed with state ${deploy.state}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Timed out waiting for the Netlify deploy to finish.");
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const token = getToken();
    const html = buildCompiledPresentationHtml(body.slides);
    const htmlBytes = new TextEncoder().encode(html);
    const htmlSha = createHash("sha1").update(htmlBytes).digest("hex");

    const siteId = process.env.NETLIFY_SITE_ID || (await createSite(token)).id;

    const deploy = await netlifyRequest<{ id: string; required?: string[] }>(
      `/sites/${encodeURIComponent(siteId)}/deploys`,
      {
        method: "POST",
        body: JSON.stringify({
          files: {
            "/index.html": htmlSha,
          },
        }),
      },
      token
    );

    if (deploy.required?.includes(htmlSha)) {
      const uploadResponse = await fetch(
        `${netlifyBaseUrl}/deploys/${encodeURIComponent(deploy.id)}/files/index.html`,
        {
          method: "PUT",
          headers: {
            ...buildHeaders(token, "application/octet-stream"),
          },
          body: htmlBytes,
        }
      );

      if (!uploadResponse.ok) {
        throw new Error(await readResponseMessage(uploadResponse));
      }
    }

    await waitForDeploy(siteId, deploy.id, token);

    const url = await getSiteUrl(siteId, token);

    if (!url) {
      throw new Error("Netlify did not return a public URL for the site.");
    }

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Netlify publish request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}