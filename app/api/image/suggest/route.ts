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

    const apiKey = getEnv("ANTHROPIC_API_KEY");

    // Fetch the image and convert to base64 for Claude
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      throw new Error(`Could not fetch image: ${imageResp.status}`);
    }
    const imageBuffer = await imageResp.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageResp.headers.get("content-type") ?? "image/jpeg";

    const prompt = `You are helping a second-hand marketplace search app find specific items of clothing and accessories.

Analyse this image carefully and return JSON only with this exact shape:
{
  "brand": string,
  "itemName": string,
  "category": string,
  "sizeHint": string,
  "color": string,
  "keywords": string,
  "searchQuery": string
}

Rules:
- brand: the brand name if visible on label or recognisable from design. Use "" if unclear.
- itemName: short description e.g. "sherpa fleece jacket", "cargo trousers", "leather boots"
- category: one of: Fleece, Jacket, Coat, Shirt, T-Shirt, Jumper / Knitwear, Hoodie / Sweatshirt, Trousers, Jeans, Shorts, Dress, Skirt, Boots, Trainers / Sneakers, Shoes, Bag, Belt, Hat / Cap, Jewellery, Watch, Sunglasses, Other
- sizeHint: only if a size label is clearly visible, otherwise ""
- color: primary colour(s) e.g. "navy blue", "navy blue with orange lining"
- keywords: distinctive features that make this item unique and searchable e.g. "aztec zip trim, orange mesh lining, sherpa texture, full zip". Be as specific as possible.
- searchQuery: the best possible eBay search phrase combining all available clues. Be specific — include distinctive details that narrow results.
- Output valid JSON only. No markdown, no explanation.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: contentType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
  console.error("[image/suggest] Claude API error:", JSON.stringify(data));
  return NextResponse.json(
    { error: data?.error?.message ?? `Claude vision request failed (${resp.status}): ${JSON.stringify(data)}` },
    { status: 500 }
  );
}

    const content = data?.content?.[0]?.text;

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "No suggestion returned" }, { status: 500 });
    }

    // Strip markdown code fences if present
    const cleaned = content.replace(/```json|```/g, "").trim();

    let parsed: {
      brand: string;
      itemName: string;
      category: string;
      sizeHint: string;
      color: string;
      keywords: string;
      searchQuery: string;
    };

    try {
      parsed = JSON.parse(cleaned);
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