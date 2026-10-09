"use strict";

/* =====================================================================
   config.js — .env fayldan sozlamalarni o'qiydi
   ===================================================================== */

const path = require("path");

const envFile = path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envFile, quiet: true });

// Qo'shtirnoq, bo'sh joy va ko'rinmas belgilarni olib tashlaydi
function clean(value) {
    return String(value || "")
        .replace(/[​-‍﻿]/g, "")
        .trim()
        .replace(/^["'`]+|["'`]+$/g, "")
        .trim();
}

// ADMIN_ID bir nechta bo'lishi mumkin: 12345,67890
const adminIds = clean(process.env.ADMIN_ID)
    .split(",")
    .map((id) => clean(id))
    .filter((id) => /^-?\d+$/.test(id))
    .map(Number);

const botTokenRaw = clean(process.env.BOT_TOKEN);
const isPlaceholder = !botTokenRaw || botTokenRaw === "bu_yerga_bot_tokenni_yozing";

const config = {
    envFile,
    botTokenRaw: isPlaceholder ? "" : botTokenRaw,
    // Token ko'rinishi: 123456789:AAH...
    botToken: /^\d+:[\w-]{20,}$/.test(botTokenRaw) ? botTokenRaw : "",
    adminIds,
    port: Number(clean(process.env.PORT)) || 3000,
    dataFile: path.resolve(__dirname, "..", clean(process.env.DATA_FILE) || "data/db.json"),
    publicDir: path.join(__dirname, "..", "public"),
};

module.exports = config;