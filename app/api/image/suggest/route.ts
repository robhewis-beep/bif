import { NextResponse } from "next/server";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    if (!isHttpUrl(imageUrl)) {
      return NextResponse.json({ error: "imageUrl must be a valid http(s) URL" }, { status: 400 });
    }

    const apiKey = getEnv("OPENAI_API_KEY");

    const prompt = `
You are helping a second-hand shopping search app.

Look at the uploaded product image and return JSON only with this shape:
{
  "brand": string,
  "itemName": string,
  "category": string,
  "sizeHint": string,
  "searchQuery": string
}

Rules:
- Be concise and practical.
- If brand is not clear, use "".
- itemName should be short, e.g. "Detroit jacket", "work jacket", "cargo trousers".
- category should be a simple retail category like "jacket", "coat", "jeans", "boots", "bag".
- sizeHint should only be filled if visually obvious, otherwise "".
- searchQuery should be a strong marketplace search phrase using the best available clues.
- Output valid JSON only.
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "image_search_suggestion",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                brand: { type: "string" },
                itemName: { type: "string" },
                category: { type: "string" },
                sizeHint: { type: "string" },
                searchQuery: { type: "string" },
              },
              required: ["brand", "itemName", "category", "sizeHint", "searchQuery"],
            },
          },
        },
        messages: [
          {
            role: "developer",
            content: prompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Suggest the best search fields for this item image.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? "Vision request failed" },
        { status: 500 }
      );
    }

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "No suggestion returned" }, { status: 500 });
    }

    let parsed: {
      brand: string;
      itemName: string;
      category: string;
      sizeHint: string;
      searchQuery: string;
    };

    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, suggestion: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}