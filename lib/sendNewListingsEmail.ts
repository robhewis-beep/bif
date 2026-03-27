import { Resend } from "resend";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendNewListingsEmail(params: {
  supabaseAdmin: any;
  userId: string;
  emailFrom: string;
  resendKey: string;
  appBaseUrl: string;
}) {
  const { supabaseAdmin, userId, emailFrom, resendKey, appBaseUrl } = params;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("last_digest_sent_at, digest_opt_in")
    .eq("id", userId)
    .single();

  const profile = prof as
    | {
        last_digest_sent_at?: string | null;
        digest_opt_in?: boolean | null;
      }
    | null
    | undefined;

  if (profile && profile.digest_opt_in === false) {
    return { sent: false as const };
  }

  const lastSent = profile?.last_digest_sent_at
    ? new Date(profile.last_digest_sent_at).getTime()
    : 0;

  const now = Date.now();
  if (lastSent && now - lastSent < 24 * 60 * 60 * 1000) {
    return { sent: false as const };
  }

  const { data: userRes, error: userErr } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  const to = userRes?.user?.email;
  if (userErr || !to) return { sent: false as const };

  const { data: rows, error } = await supabaseAdmin
    .from("found_listings")
    .select(`
      id,
      title,
      listing_url,
      matched_at,
      platform,
      image_url,
      price_value,
      price_currency,
      item_condition,
      matches:found_listing_matches (
        tracked_item_id
      )
    `)
    .eq("user_id", userId)
    .eq("notified", false)
    .order("matched_at", { ascending: false })
    .limit(50);

  const foundRows = (rows ?? []) as any[];

  if (error || foundRows.length === 0) {
    return { sent: false as const };
  }

  const resend = new Resend(resendKey);

  const lines = foundRows
    .slice(0, 20)
    .map((r) => {
      const price =
        r.price_value != null
          ? `${r.price_currency ?? ""} ${r.price_value}`.trim()
          : "";
      const cond = r.item_condition ? ` • ${r.item_condition}` : "";
      return `• ${r.title}${[price, cond].filter(Boolean).join("")}\n  ${r.listing_url}`;
    })
    .join("\n\n");

  const cardsHtml = foundRows
    .slice(0, 20)
    .map((r) => {
      const price =
        r.price_value != null
          ? `${r.price_currency ?? ""} ${r.price_value}`.trim()
          : "";
      const cond = r.item_condition ?? "";
      const meta = [price, cond].filter(Boolean).join(" • ");

      const trackedItemId = r.matches?.[0]?.tracked_item_id ?? null;
      const deepLink = trackedItemId
        ? `${appBaseUrl}/found?tracked_item_id=${trackedItemId}`
        : `${appBaseUrl}/found`;

      return `
        <div style="display:flex;gap:12px;align-items:center;border:1px solid #eee;border-radius:12px;padding:12px;margin:12px 0;">
          ${r.image_url ? `<img src="${r.image_url}" width="72" height="72" style="object-fit:cover;border-radius:10px;" />` : ""}
          <div style="flex:1;">
            <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(String(r.title ?? ""))}</div>
            ${meta ? `<div style="opacity:0.8;font-size:13px;margin-bottom:8px;">${escapeHtml(meta)}</div>` : ""}
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
              <a href="${r.listing_url}" target="_blank" rel="noreferrer" style="font-weight:700;">View listing</a>
              <a href="${deepLink}" target="_blank" rel="noreferrer" style="font-weight:700;">View new items</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const result = await resend.emails.send({
    from: emailFrom,
    to,
    subject: `BIF: ${foundRows.length} new listings found`,
    text: `We found ${foundRows.length} new listings.\n\n${lines}\n\nView all: ${appBaseUrl}/found`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;">
        <h2 style="margin:0 0 12px;">${foundRows.length} new listings found</h2>
        <p style="margin:0 0 16px;">
          View all here:
          <a href="${appBaseUrl}/found">${appBaseUrl}/found</a>
        </p>
        ${cardsHtml}
      </div>
    `,
  });

  if ((result as any)?.error) return { sent: false as const };

  const ids = foundRows.map((r) => r.id);

  await supabaseAdmin
    .from("found_listings")
    .update({ notified: true } as any)
    .in("id", ids);

  await supabaseAdmin
    .from("profiles")
    .update({ last_digest_sent_at: new Date().toISOString() } as any)
    .eq("id", userId);

  return { sent: true as const, count: foundRows.length };
}