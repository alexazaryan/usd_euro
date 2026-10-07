const CHAT_IDS = ["280746926", "5911578566"];
const CODES = ["USD", "EUR"];
const FLAGS = { USD: "🇺🇸", EUR: "🇪🇺" };
const ISO = { USD: 840, EUR: 978 };
const LINE = "━━━━━━━━━━";
const TZ = "Europe/Kyiv";

function change(pct, digits) {
   const v = Number(pct.toFixed(digits));
   const icon = v > 0 ? "🟢" : v < 0 ? "🔴" : "⚪";
   const sign = v > 0 ? "+" : "";
   return `${icon} (${sign}${v.toFixed(digits)}%)`;
}

async function getJson(url) {
   const r = await fetch(url);
   if (!r.ok) throw new Error(`${url} -> ${r.status}`);
   return r.json();
}

// если источник не ответил, его блок просто пропускается
async function safe(name, fn) {
   try {
      return await fn();
   } catch (e) {
      console.log(name, "не получен:", e.message);
      return null;
   }
}

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

async function monoBlock() {
   const d = await getJson("https://api.monobank.ua/bank/currency");
   const lines = CODES.map((code) => {
      const x = d.find(
         (i) => i.currencyCodeA === ISO[code] && i.currencyCodeB === 980,
      );
      return `${FLAGS[code]} <b>${code}</b>: ${x.rateBuy.toFixed(2)} / ${x.rateSell.toFixed(2)}`;
   });
   return ["🐈‍⬛ <b>Монобанк (покупка / продажа)</b>", ...lines];
}

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

   return { main, total3 };
}

async function fearLine() {
   const d = await getJson("https://api.alternative.me/fng/");
   const v = Number(d.data[0].value);
   const label =
      v <= 24
         ? "Сильный страх"
         : v <= 44
           ? "Страх"
           : v <= 55
             ? "Нейтрально"
             : v <= 75
               ? "Жадность"
               : "Сильная жадность";
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

   // по расписанию отправляем только в 12:xx по Киеву
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

   const [nbu, privat, mono, crypto, fear] = await Promise.all([
      safe("НБУ", () => nbuBlock(yesterday)),
      safe("ПриватБанк", privatBlock),
      safe("Монобанк", monoBlock),
      safe("Крипта", cryptoData),
      safe("Страх и жадность", fearLine),
   ]);

   const blocks = [
      nbu,
      privat,
      mono,
      crypto && crypto.main,
      [crypto && crypto.total3, fear].filter(Boolean),
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