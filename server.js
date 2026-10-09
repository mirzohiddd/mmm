"use strict";

/* =====================================================================
   server.js — ishga tushirish nuqtasi
     1) CRM frontend (public/) + REST API (/api)  → http://localhost:PORT
     2) Telegram bot (BOT_TOKEN bo'lsa)
   Ikkalasi bitta data/db.json faylidan foydalanadi.
   ===================================================================== */

const express = require("express");
const config = require("./src/config");
const storage = require("./src/storage");
const createApi = require("./src/api");
const createBot = require("./src/bot");

storage.all(); // JSON faylni tayyorlab qo'yish

const app = express();
app.use("/api", createApi());
app.use(express.static(config.publicDir, { extensions: ["html"] }));

// Port band bo'lsa keyingisini sinaydi (3000 → 3001 → ... 3010)
let server = null;

function listen(port, triesLeft) {
    server = app.listen(port, (err) => {
        if (!err) {
            console.log(`[server] CRM ishga tushdi: http://localhost:${port}`);
            return;
        }
        if (err.code === "EADDRINUSE" && triesLeft > 0) {
            console.warn(`[server] ${port}-port band, ${port + 1} sinab ko'rilmoqda...`);
            return listen(port + 1, triesLeft - 1);
        }
        console.error(`[server] Serverni ishga tushirib bo'lmadi: ${err.message}`);
        console.error("         .env faylda boshqa PORT yozib ko'ring, masalan: PORT=4000");
        process.exit(1);
    });
}

listen(config.port, 10);

let bot = null;

if (!config.botToken) {
    if (config.botTokenRaw) {
        console.warn("[bot] BOT_TOKEN noto'g'ri formatda. To'g'ri ko'rinish: BOT_TOKEN=123456789:AAH...");
        console.warn("      (qo'shtirnoq, bo'sh joy yoki boshqa belgilar bo'lmasin)");
    } else {
        console.warn(`[bot] BOT_TOKEN topilmadi. Faylni tekshiring: ${config.envFile}`);
    }
    console.warn("      Bot ishga tushmadi, CRM ishlayapti.");
} else {
    if (!config.adminIds.length) console.warn("[bot] ADMIN_ID .env faylda yo'q — adminga xabar yuborilmaydi.");

    bot = createBot();
    bot.launch({ dropPendingUpdates: true }, () => {
        console.log(`[bot] Bot ishga tushdi: @${bot.botInfo.username}`);
    }).catch((err) => {
        console.error(`[bot] Botni ishga tushirib bo'lmadi: ${err.message}`);
        console.error("      BOT_TOKEN to'g'riligini tekshiring (@BotFather).");
    });
}

function shutdown(signal) {
    console.log(`\n[server] To'xtatilmoqda (${signal})...`);
    if (bot) {
        try { bot.stop(signal); } catch (e) { /* bot ishga tushmagan bo'lishi mumkin */ }
    }
    if (server) server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));