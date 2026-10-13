const ALLOWED = ["280746926", "5911578566"];
const BUTTON = "💱 Курс сейчас";
const CACHE_MS = 10 * 60 * 1000;

const CODES = ["USD", "EUR"];
const FLAGS = { USD: "🇺🇸", EUR: "🇪🇺" };
const LINE = "━━━━━━━━━━";
const TZ = "Europe/Kyiv";

function change(pct, digits) {
   const v = Number(pct.toFixed(digits));
   const icon = v > 0 ? "🟢" : v < 0 ? "🔴" : "⚪";
   const sign = v > 0 ? "+" : "";
   return `${icon} (${sign}${v.toFixed(digits)}%)`;
}

function changePP(val, digits) {
   const v = Number(val.toFixed(digits));
   const icon = v > 0 ? "🟢" : v < 0 ? "🔴" : "⚪";
   const sign = v > 0 ? "+" : "";
   return `${icon} (${sign}${v.toFixed(digits)} п.п.)`;
}

async function getJson(url, options) {
   const r = await fetch(url, options);
   if (!r.ok) throw new Error(`${url} -> ${r.status}`);
   return r.json();
}

async function safe(name, fn) {
   try {
      return await fn();
   } catch (e) {
      console.log(name, "не получен:", e.message);
      return null;
   }
}

// ---------- НБУ ----------
async function nbuRate(code, date) {
   const d = await getJson(
      `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${code}&json` +
         (date ? `&date=${date}` : ""),
   );
   return d[0].rate;
}

async function nbuBlock(yesterday) {
   const lines = [];
   for (const code of CODES) {
      const rate = await nbuRate(code);
      let ch = "";
      try {
         const prev = await nbuRate(code, yesterday);
         ch = " " + change(((rate - prev) / prev) * 100, 2);
      } catch (e) {
         console.log("Вчерашний курс не получен", code, e.message);
      }
      lines.push(`${FLAGS[code]} <b>${code}</b>: ${rate.toFixed(2)} ₴${ch}`);
   }
   return ["🏛 <b>НБУ (официальный)</b>", ...lines];
}

// ---------- ПриватБанк ----------
async function privatBlock() {
   const d = await getJson(
      "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5",
   );
   const lines = CODES.map((code) => {
      const x = d.find((i) => i.ccy === code);
      return `${FLAGS[code]} <b>${code}</b>: ${Number(x.buy).toFixed(2)} / ${Number(x.sale).toFixed(2)}`;
   });
   return ["🏦 <b>ПриватБанк (покупка / продажа)</b>", ...lines];
}

// ---------- Золото, серебро, нефть ----------
async function metalLine(symbol, icon, name, digits) {
   const d = await getJson(`https://api.gold-api.com/price/${symbol}`);
   const price = Number(d.price);
   if (!price) throw new Error(`нет цены ${symbol}`);
   const shown =
      digits === 0
         ? Math.round(price).toLocaleString("en-US")
         : price.toFixed(digits);
   return `${icon} <b>${name}</b>: $${shown}`;
}

async function oilLine() {
   const d = await getJson(
      "https://api.oilpriceapi.com/v1/prices/latest?by_code=BRENT_CRUDE_USD",
      { headers: { Authorization: `Token ${process.env.OIL_API_KEY}` } },
   );
   const x = Array.isArray(d.data) ? d.data[0] : d.data;
   const price = Number(x.price);
   if (!price) throw new Error("нет цены Brent");

   let pct = null;
   if (x.changes && x.changes["24h"] && x.changes["24h"].percent != null) {
      pct = Number(x.changes["24h"].percent);
   } else if (x.change_percent != null) {
      pct = Number(x.change_percent);
   } else if (x.change != null) {
      pct = (Number(x.change) / (price - Number(x.change))) * 100;
   }

   if (pct === null || Number.isNaN(pct)) {
      return `🛢 <b>Нефть Brent</b>: $${price.toFixed(1)}`;
   }
   return `🛢 <b>Нефть Brent</b>: $${price.toFixed(1)} ${change(pct, 1)}`;
}

// ---------- Крипта ----------
async function cryptoData() {
   const coins = await getJson(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=125&page=1&price_change_percentage=24h",
   );
   const btc = coins.find((c) => c.id === "bitcoin");
   const eth = coins.find((c) => c.id === "ethereum");
   const price = (c) => Math.round(c.current_price).toLocaleString("en-US");

   const main = [
      `🪙 <b>BTC</b>: $${price(btc)} ${change(btc.price_change_percentage_24h, 1)}`,
      `💎 <b>ETH</b>: $${price(eth)} ${change(eth.price_change_percentage_24h, 1)}`,
   ];

   const alts = coins.filter((c) => c.id !== "bitcoin" && c.id !== "ethereum");
   const cur = alts.reduce((s, c) => s + (c.market_cap || 0), 0);
   const prev = alts.reduce((s, c) => {
      const ch = c.market_cap_change_percentage_24h || 0;
      return s + (c.market_cap || 0) / (1 + ch / 100);
   }, 0);
   const total3 = `🌍 <b>TOTAL3</b>: $${(cur / 1e9).toFixed(0)}B ${change((cur / prev - 1) * 100, 2)}`;

   let usdt = null;
   try {
      const g = (await getJson("https://api.coingecko.com/api/v3/global")).data;
      const tether = coins.find((c) => c.id === "tether");
      const totalNow = g.total_market_cap.usd;
      const totalPrev =
         totalNow / (1 + g.market_cap_change_percentage_24h_usd / 100);
      const tNow = tether.market_cap;
      const tPrev =
         tNow / (1 + (tether.market_cap_change_percentage_24h || 0) / 100);
      const domNow = (tNow / totalNow) * 100;
      const domPrev = (tPrev / totalPrev) * 100;
      usdt = `💲 <b>USDT.D</b>: ${domNow.toFixed(3)}% ${changePP(domNow - domPrev, 3)}`;
   } catch (e) {
      console.log("USDT.D не получен:", e.message);
   }

   return { main, total3, usdt };
}

// ---------- Индекс альтсезона (Blockchaincenter, 90 дней) ----------
async function altseasonLine() {
   const r = await fetch("https://blockchaincenter.net/altcoin-season-index/", {
      headers: { "User-Agent": "Mozilla/5.0" },
   });
   if (!r.ok) throw new Error(`Blockchaincenter -> ${r.status}`);
   const html = await r.text();
   const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

   const m =
      text.match(/Altcoin Season\s*\((\d{1,3})\)/i) ||
      text.match(/It is (?:not )?Altcoin Season!?\s*(\d{1,3})/i);
   if (!m) throw new Error("число не найдено на странице");
   const v = Number(m[1]);
   const label =
      v <= 25 ? "Сезон биткоина" : v >= 75 ? "Альтсезон" : "Нейтрально";
   return `🔄 <b>Альтсезон</b>: ${v}/100 (${label})`;
}

// ---------- Страх и жадность ----------
async function fearLine() {
   const d = await getJson("https://api.alternative.me/fng/");
   const v = Number(d.data[0].value);
   const label =
      v <= 24
         ? "Крайний страх"
         : v <= 44
           ? "Страх"
           : v <= 55
             ? "Нейтрально"
             : v <= 75
               ? "Жадность"
               : "Крайняя жадность";
   return `😱 <b>Страх и жадность</b>: ${v} (${label})`;
}

// ---------- Сборка сообщения ----------
async function buildText() {
   const now = new Date();
   const date = now.toLocaleDateString("ru-RU", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
   });
   const time = now.toLocaleTimeString("ru-RU", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
   });
   const yesterday = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
   })
      .format(new Date(now.getTime() - 24 * 60 * 60 * 1000))
      .replaceAll("-", "");

   const [nbu, privat, gold, silver, oil, crypto, altseason, fear] =
      await Promise.all([
         safe("НБУ", () => nbuBlock(yesterday)),
         safe("ПриватБанк", privatBlock),
         safe("Золото", () => metalLine("XAU", "🥇", "Золото", 0)),
         safe("Серебро", () => metalLine("XAG", "🥈", "Серебро", 1)),
         safe("Нефть", oilLine),
         safe("Крипта", cryptoData),
         safe("Альтсезон", altseasonLine),
         safe("Страх и жадность", fearLine),
      ]);

   const blocks = [
      nbu,
      privat,
      [gold, silver, oil].filter(Boolean),
      crypto && crypto.main,
      [crypto && crypto.total3, crypto && crypto.usdt, altseason, fear].filter(
         Boolean,
      ),
   ].filter((b) => b && b.length);

   return (
      `${"🟦".repeat(13)}\n` +
      `📅 <b>${date}</b> · 🕐 <b>${time}</b> (Киев)\n` +
      `${LINE}\n` +
      blocks.map((b) => b.join("\n")).join(`\n${LINE}\n`)
   );
}

// кэш на 10 минут, чтобы не тратить лимиты источников
let cache = { text: null, at: 0 };
async function getText() {
   if (cache.text && Date.now() - cache.at < CACHE_MS) return cache.text;
   const text = await buildText();
   cache = { text, at: Date.now() };
   return text;
}

async function tg(method, body) {
   const res = await fetch(
      `https://api.telegram.org/bot${process.env.TG_TOKEN}/${method}`,
      {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(body),
      },
   );
   if (!res.ok) console.log(method, res.status, await res.text());
}

module.exports = async (req, res) => {
   // принимаем запросы только от Telegram
   if (
      req.headers["x-telegram-bot-api-secret-token"] !==
      process.env.WEBHOOK_SECRET
   ) {
      return res.status(401).send("no");
   }

   try {
      const msg = req.body && req.body.message;
      if (msg && msg.text) {
         const chat_id = String(msg.chat.id);
         // отвечаем только вам двоим
         if (ALLOWED.includes(chat_id)) {
            if (msg.text === "/start") {
               await tg("sendMessage", {
                  chat_id,
                  text: "👇",
                  reply_markup: {
                     keyboard: [[{ text: BUTTON }]],
                     resize_keyboard: true,
                     is_persistent: true,
                  },
               });
            } else if (msg.text === BUTTON) {
               await tg("deleteMessage", {
                  chat_id,
                  message_id: msg.message_id,
               });
               await tg("sendChatAction", { chat_id, action: "typing" });
               const text = await getText();
               // вы нажали: только вам. Виталий нажал: обоим
               const recipients = chat_id === "280746926" ? [chat_id] : ALLOWED;
               await Promise.all(
                  recipients.map((id) =>
                     tg("sendMessage", {
                        chat_id: id,
                        text,
                        parse_mode: "HTML",
                     }),
                  ),
               );
            }
         }
      }
   } catch (e) {
      console.log(e);
   }
   res.status(200).send("ok");
};
