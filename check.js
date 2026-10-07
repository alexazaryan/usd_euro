const CHAT_IDS = ["280746926", "5911578566"];
const CODES = ["USD", "EUR"];
const FLAGS = { USD: "🇺🇸", EUR: "🇪🇺" };

async function main() {
   const now = new Date();
   const kyivHour = Number(
      new Intl.DateTimeFormat("en-GB", {
         timeZone: "Europe/Kyiv",
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
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
   });
   const time = now.toLocaleTimeString("ru-RU", {
      timeZone: "Europe/Kyiv",
      hour: "2-digit",
      minute: "2-digit",
   });

   const lines = [];
   for (const code of CODES) {
      const r = await fetch(
         `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${code}&json`,
      );
      const rate = (await r.json())[0].rate;
      lines.push(`${FLAGS[code]} <b>${code}</b>: ${rate.toFixed(2)} ₴`);
   }

   const text =
      `💱 <b>Курс НБУ Украина</b>\n` +
      `━━━━━━━━━━\n` +
      `📅 ${date}\n` +
      `🕐 ${time} (по Киеву)\n` +
      `━━━━━━━━━━\n` +
      lines.join("\n");

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
   }
}

main();
