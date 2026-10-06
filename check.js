const CHAT_IDS = ["280746926", "5911578566"];
const CODES = ["USD", "EUR"];

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

   const time = now.toLocaleString("ru-RU", {
      timeZone: "Europe/Kyiv",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
   });

   const lines = [];
   for (const code of CODES) {
      const r = await fetch(
         `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${code}&json`,
      );
      const rate = (await r.json())[0].rate;
      lines.push(`${code}: ${rate} грн`);
   }

   const text = `Курс НБУ (Киев, ${time})\n${lines.join("\n")}`;

   for (const chat_id of CHAT_IDS) {
      await fetch(
         `https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`,
         {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id, text }),
         },
      );
   }
}

main();
