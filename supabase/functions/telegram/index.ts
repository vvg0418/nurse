// Уведомления о новых отзывах и поздравлениях в Telegram.
//
// Три источника запросов, у каждого своя проверка:
//   1. Триггер базы (заголовок x-hook-token) — новый отзыв, отправляем сообщение с кнопками.
//   2. Telegram (заголовок x-telegram-bot-api-secret-token) — нажатия кнопок и команда /start.
//   3. Админка сайта (JWT вошедшего админа) — подключить бота и отправить проверочное сообщение.
//
// Нужен секрет TELEGRAM_BOT_TOKEN (Supabase → Edge Functions → Secrets).
// Без него функция ничего не отправляет и не падает.

const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  return await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers });
}

async function setting(key: string): Promise<string> {
  const r = await rest(`site_texts?select=value&key=eq.${encodeURIComponent(key)}`);
  if (!r.ok) return "";
  const rows = await r.json();
  return rows?.[0]?.value ?? "";
}

async function tg(method: string, payload: Record<string, unknown>) {
  if (!BOT) return null;
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await r.json().catch(() => null);
}

function clip(s: unknown, n: number) {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const hookToken = await setting("secret_hook_token");
  if (!hookToken) return json({ error: "not_configured" }, 500);

  // 1. Новый отзыв из базы
  const hook = req.headers.get("x-hook-token");
  if (hook !== null) {
    if (hook !== hookToken) return json({ error: "forbidden" }, 403);
    const ev = await req.json().catch(() => ({}));
    const chat = await setting("telegram_chat_id");
    if (!BOT || !chat) return json({ skipped: true });
    const label = ev.kind === "wish" ? "Новое поздравление" : "Новый отзыв";
    const status = ev.approved ? "уже на сайте" : "ждёт проверки";
    await tg("sendMessage", {
      chat_id: chat,
      text: `${label} (${status})\n\n${clip(ev.name, 60)}:\n${clip(ev.text, 600)}`,
      reply_markup: {
        inline_keyboard: [[
          { text: "Показать", callback_data: `a:${ev.id}` },
          { text: "Скрыть", callback_data: `h:${ev.id}` },
          { text: "Удалить", callback_data: `d:${ev.id}` },
        ]],
      },
    });
    return json({ ok: true });
  }

  // 2. Вебхук Telegram
  const tgSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (tgSecret !== null) {
    if (tgSecret !== hookToken) return json({ error: "forbidden" }, 403);
    const upd = await req.json().catch(() => ({}));
    const chat = await setting("telegram_chat_id");

    const msg = upd.message;
    if (msg?.text?.startsWith("/start")) {
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        text: `Привет! Ваш chat id: ${msg.chat.id}\n\nВставьте это число в админке сайта, раздел «Настройки» → Telegram, чтобы получать уведомления об отзывах.`,
      });
      return json({ ok: true });
    }

    const cq = upd.callback_query;
    if (cq) {
      if (!chat || String(cq.message?.chat?.id) !== String(chat)) {
        await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Нет доступа" });
        return json({ ok: true });
      }
      const [act, id] = String(cq.data ?? "").split(":");
      const safeId = /^[0-9a-f-]{36}$/i.test(id ?? "") ? id : "";
      let done = "";
      if (safeId && act === "a") {
        await rest(`reviews?id=eq.${safeId}`, { method: "PATCH", body: JSON.stringify({ approved: true, hidden: false }) });
        done = "Показан на сайте";
      } else if (safeId && act === "h") {
        await rest(`reviews?id=eq.${safeId}`, { method: "PATCH", body: JSON.stringify({ hidden: true }) });
        done = "Скрыт";
      } else if (safeId && act === "d") {
        await rest(`reviews?id=eq.${safeId}`, { method: "DELETE" });
        done = "Удалён";
      }
      await tg("answerCallbackQuery", { callback_query_id: cq.id, text: done || "Готово" });
      if (done && cq.message) {
        await tg("editMessageReplyMarkup", {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: `✓ ${done}`, callback_data: "noop" }]] },
        });
      }
      return json({ ok: true });
    }
    return json({ ok: true });
  }

  // 3. Действия из админки: проверяем, что вошёл админ
  const auth = req.headers.get("authorization") ?? "";
  const check = await fetch(`${SB_URL}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const isAdmin = check.ok ? await check.json() : false;
  if (isAdmin !== true) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  if (!BOT) return json({ error: "no_token" }, 400);

  if (body.action === "setup") {
    const res = await tg("setWebhook", {
      url: `${SB_URL}/functions/v1/telegram`,
      secret_token: hookToken,
      allowed_updates: ["message", "callback_query"],
    });
    const me = await tg("getMe", {});
    return json({ ok: !!res?.ok, bot: me?.result?.username ?? null, description: res?.description ?? null });
  }
  if (body.action === "test") {
    const chat = await setting("telegram_chat_id");
    if (!chat) return json({ error: "no_chat" }, 400);
    const res = await tg("sendMessage", { chat_id: chat, text: "Проверка: уведомления с сайта работают." });
    return json({ ok: !!res?.ok, description: res?.description ?? null });
  }
  return json({ error: "unknown_action" }, 400);
});
