const CHAT_IDS = ["280746926", "5911578566"];
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

// если источник не ответил, его строка просто пропускается
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
      "https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BZUSDT",
   );
   return `🛢 <b>Нефть Brent</b>: $${Number(d.lastPrice).toFixed(1)} ${change(Number(d.priceChangePercent), 1)}`;
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

   // TOTAL3: топ-125 без BTC и ETH
   const alts = coins.filter((c) => c.id !== "bitcoin" && c.id !== "ethereum");
   const cur = alts.reduce((s, c) => s + (c.market_cap || 0), 0);
   const prev = alts.reduce((s, c) => {
      const ch = c.market_cap_change_percentage_24h || 0;
      return s + (c.market_cap || 0) / (1 + ch / 100);
   }, 0);
   const total3 = `🌍 <b>TOTAL3</b>: $${(cur / 1e9).toFixed(0)}B ${change((cur / prev - 1) * 100, 2)}`;

   // USDT.D: доля USDT в общей капитализации рынка
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
      usdt = `💲 <b>USDT.D</b>: ${domNow.toFixed(1)}% ${changePP(domNow - domPrev, 1)}`;
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
   if (!m) {
      const i = text.search(/Altcoin Season/i);
      console.log("Фрагмент страницы:", text.slice(Math.max(i, 0), i + 300));
      throw new Error("число не найдено на странице");
   }
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

async function main() {
   const now = new Date();
   const kyivHour = Number(
      new Intl.DateTimeFormat("en-GB", {
         timeZone: TZ,
         hour: "2-digit",
         hour12: false,
      }).format(now),
   );

   // по расписанию GitHub отправляем только в 12:xx по Киеву
   if (process.env.GITHUB_EVENT_NAME === "schedule" && kyivHour !== 12) {
      console.log("Не 12:00 по Киеву, пропуск");
      return;
   }

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
      [crypto && crypto.total3, altseason, crypto && crypto.usdt, fear].filter(
         Boolean,
      ),
   ].filter((b) => b && b.length);

   const text =
      `${"🟦".repeat(13)}\n` +
      `📅 <b>${date}</b> · 🕐 <b>${time}</b> (Киев)\n` +
      `${LINE}\n` +
      blocks.map((b) => b.join("\n")).join(`\n${LINE}\n`);

   for (const chat_id of CHAT_IDS) {
      const res = await fetch(
         `https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`,
         {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
         },
      );
      console.log(chat_id, res.status);
      if (!res.ok) console.log(await res.text());
   }
}

main();
