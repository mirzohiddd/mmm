"use strict";

/* =====================================================================
   bot.js — Telegram bot
   Menyu: faqat 2 ta tugma → "👨‍💼 Hodim" va "🎓 O'quvchi"

   Hodim:    Ism → Lavozim → Telefon → Tasdiqlash  → CRM "Hodimlar"
   O'quvchi: Ism familiya → Telefon → Yo'nalish → Guruh → Tasdiqlash → CRM "O'quvchilar"

   Tasdiqlangandan so'ng ma'lumot data/db.json ga yoziladi,
   CRM sahifasida avtomatik paydo bo'ladi va ADMIN_ID ga xabar boradi.
   ===================================================================== */

const { Telegraf, Markup } = require("telegraf");
const config = require("./config");
const storage = require("./storage");
const v = require("./validators");

const BTN = {
    employee: "👨‍💼 Hodim",
    student: "🎓 O'quvchi",
    cancel: "❌ Bekor qilish",
    sendPhone: "📱 Raqamni yuborish",
    skipGroup: "⏭ Bilmayman",
};

const UNKNOWN_GROUP = "Belgilanmagan";

// Foydalanuvchi holati (chatId → { type, step, data })
const sessions = new Map();

/* ---------------- Klaviaturalar ---------------- */

const mainMenu = Markup.keyboard([[BTN.employee, BTN.student]]).resize();

const cancelKb = Markup.keyboard([[BTN.cancel]]).resize();

const phoneKb = Markup.keyboard([
    [Markup.button.contactRequest(BTN.sendPhone)],
    [BTN.cancel],
]).resize();

function optionsKb(options, extra = []) {
    const rows = [];
    for (let i = 0; i < options.length; i += 2) rows.push(options.slice(i, i + 2));
    if (extra.length) rows.push(extra);
    rows.push([BTN.cancel]);
    return Markup.keyboard(rows).resize();
}

const confirmKb = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Tasdiqlash", "confirm")],
    [Markup.button.callback("✏️ Qaytadan", "restart"), Markup.button.callback("❌ Bekor", "cancel")],
]);

/* ---------------- Yordamchilar ---------------- */

function esc(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function isAdmin(ctx) {
    return Boolean(ctx.from) && config.adminIds.includes(ctx.from.id);
}

function telegramInfo(ctx) {
    return {
        telegramId: ctx.from.id,
        telegramUsername: ctx.from.username || "",
    };
}

function summary(type, d) {
    if (type === "employee") {
        return [
            "<b>👨‍💼 Hodim ma'lumotlari</b>",
            "",
            `👤 Ism: <b>${esc(d.name)}</b>`,
            `💼 Lavozim: <b>${esc(d.position)}</b>`,
            `📞 Telefon: <b>${esc(d.phone)}</b>`,
        ].join("\n");
    }
    return [
        "<b>🎓 O'quvchi ma'lumotlari</b>",
        "",
        `👤 Ism familiya: <b>${esc(d.name)}</b>`,
        `📞 Telefon: <b>${esc(d.phone)}</b>`,
        `📚 Yo'nalish: <b>${esc(d.direction)}</b>`,
        `👥 Guruh: <b>${esc(d.group)}</b>`,
    ].join("\n");
}

function collectionOf(type) {
    return type === "employee" ? "employees" : "students";
}

async function showMenu(ctx, text) {
    sessions.delete(ctx.chat.id);
    await ctx.reply(text || "Kim sifatida ro'yxatdan o'tasiz? 👇", mainMenu);
}

async function notifyAdmins(bot, text) {
    for (const id of config.adminIds) {
        try {
            await bot.telegram.sendMessage(id, text, { parse_mode: "HTML" });
        } catch (err) {
            console.error(`[bot] Adminga (${id}) xabar yuborilmadi: ${err.message}`);
        }
    }
}

/* ---------------- Savollar ---------------- */

const ask = {
    name(ctx, type) {
        const text = type === "employee"
            ? "👤 Ismingizni kiriting:\n<i>Masalan: Malika</i>"
            : "👤 Ism va familiyangizni kiriting:\n<i>Masalan: Ali Valiyev</i>";
        return ctx.reply(text, { parse_mode: "HTML", ...cancelKb });
    },
    position(ctx) {
        return ctx.reply("💼 Lavozimingizni tanlang yoki yozing:", optionsKb(v.POSITIONS));
    },
    phone(ctx) {
        return ctx.reply(
            "📞 Telefon raqamingizni yuboring.\n\n" +
            "Pastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing yoki qo'lda yozing:\n<i>Masalan: +998 90 123 45 67</i>",
            { parse_mode: "HTML", ...phoneKb }
        );
    },
    direction(ctx) {
        return ctx.reply("📚 Qaysi yo'nalishda o'qiysiz?", optionsKb(v.DIRECTIONS));
    },
    group(ctx) {
        return ctx.reply(
            "👥 Guruhingizni kiriting:\n<i>Masalan: Frontend-01</i>\n\nBilmasangiz «⏭ Bilmayman» ni bosing.",
            { parse_mode: "HTML", ...optionsKb([], [BTN.skipGroup]) }
        );
    },
    async confirm(ctx, session) {
        session.step = "confirm";
        await ctx.reply("Deyarli tayyor ✅", Markup.removeKeyboard());
        return ctx.reply(`${summary(session.type, session.data)}\n\nMa'lumotlar to'g'rimi?`, {
            parse_mode: "HTML",
            ...confirmKb,
        });
    },
};

// Har bir tur uchun qadamlar ketma-ketligi
const FLOWS = {
    employee: ["name", "position", "phone"],
    student: ["name", "phone", "direction", "group"],
};

async function nextStep(ctx, session) {
    const steps = FLOWS[session.type];
    const index = steps.indexOf(session.step);
    const next = steps[index + 1];
    if (!next) return ask.confirm(ctx, session);
    session.step = next;
    return ask[next](ctx, session.type);
}

async function startFlow(ctx, type) {
    const collection = collectionOf(type);
    const already = storage.list(collection).find((x) => x.telegramId === ctx.from.id);
    if (already) {
        return ctx.reply(
            `Siz allaqachon ${type === "employee" ? "hodim" : "o'quvchi"} sifatida ro'yxatdan o'tgansiz ✅\n\n` +
            `${summary(type, already)}\n\nO'zgartirish kerak bo'lsa, administratorga murojaat qiling.`,
            { parse_mode: "HTML", ...mainMenu }
        );
    }

    const session = { type, step: FLOWS[type][0], data: {} };
    sessions.set(ctx.chat.id, session);
    return ask[session.step](ctx, type);
}

/* ---------------- Javoblarni qabul qilish ---------------- */

// Har bir qadam: xato bo'lsa matn qaytaradi, bo'lmasa session.data ga yozadi
const handlers = {
    name(session, text) {
        const error = v.nameError(text);
        if (error) return `⚠️ ${error}. Qaytadan kiriting:`;
        session.data.name = v.cleanText(text);
        return "";
    },
    position(session, text) {
        const error = v.textError(text, "Lavozim", 40);
        if (error) return `⚠️ ${error}. Qaytadan kiriting:`;
        session.data.position = v.cleanText(text);
        return "";
    },
    phone(session, text) {
        const phone = v.formatPhone(text);
        if (!phone) return "⚠️ Raqam noto'g'ri. Format: <b>+998 90 123 45 67</b>\nQaytadan yuboring:";
        if (storage.phoneExists(collectionOf(session.type), phone)) {
            return "⚠️ Bu raqam allaqachon ro'yxatda bor. Boshqa raqam kiriting yoki «❌ Bekor qilish» ni bosing:";
        }
        session.data.phone = phone;
        return "";
    },
    direction(session, text) {
        const value = v.DIRECTIONS.find((d) => d.toLowerCase() === v.cleanText(text).toLowerCase());
        if (!value) return "⚠️ Iltimos, pastdagi tugmalardan birini tanlang:";
        session.data.direction = value;
        return "";
    },
    group(session, text) {
        if (text === BTN.skipGroup) {
            session.data.group = UNKNOWN_GROUP;
            return "";
        }
        const error = v.groupError(text);
        if (error) return `⚠️ ${error}. Qaytadan kiriting:`;
        session.data.group = v.cleanText(text);
        return "";
    },
};

async function handleAnswer(ctx, value) {
    const session = sessions.get(ctx.chat.id);
    if (!session) return showMenu(ctx, "Quyidagilardan birini tanlang 👇");

    if (session.step === "confirm") {
        return ctx.reply("Iltimos, yuqoridagi xabardagi tugmalardan birini bosing ☝️");
    }

    const error = handlers[session.step](session, value);
    if (error) return ctx.reply(error, { parse_mode: "HTML" });
    return nextStep(ctx, session);
}

/* ---------------- Saqlash ---------------- */

async function save(ctx, bot, session) {
    const collection = collectionOf(session.type);
    const d = session.data;

    // Oxirgi tekshiruv (kutish paytida boshqa birov shu raqamni qo'shgan bo'lishi mumkin)
    if (storage.phoneExists(collection, d.phone)) {
        session.step = "phone";
        await ctx.reply("⚠️ Bu raqam allaqachon ro'yxatda bor. Boshqa raqam yuboring:", phoneKb);
        return;
    }

    const base = { name: d.name, phone: d.phone, active: true, source: "telegram", ...telegramInfo(ctx) };
    const record = session.type === "employee"
        ? storage.add(collection, { ...base, position: d.position })
        : storage.add(collection, { ...base, direction: d.direction, group: d.group });

    sessions.delete(ctx.chat.id);

    await ctx.reply(
        "🎉 Rahmat! Siz muvaffaqiyatli ro'yxatdan o'tdingiz.\nMa'lumotlaringiz CRM tizimiga qo'shildi.",
        mainMenu
    );

    const who = ctx.from.username ? `@${esc(ctx.from.username)}` : esc(ctx.from.first_name || "");
    await notifyAdmins(
        bot,
        `🆕 <b>Bot orqali yangi ${session.type === "employee" ? "hodim" : "o'quvchi"}</b>\n\n` +
        `${summary(session.type, record)}\n\n` +
        `🔗 Telegram: ${who} (<code>${ctx.from.id}</code>)\n` +
        `🕒 ${new Date(record.createdAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`
    );

    console.log(`[bot] Yangi ${collection}: ${record.name} (${record.phone})`);
}

/* ---------------- Bot yaratish ---------------- */

function createBot() {
    const bot = new Telegraf(config.botToken);

    bot.start((ctx) =>
        showMenu(
            ctx,
            `Assalomu alaykum, ${ctx.from.first_name || "do'stim"}! 👋\n\n` +
            "Ro'yxatdan o'tish uchun kim ekaningizni tanlang 👇"
        )
    );

    // Admin buyruqlari
    bot.command("stats", (ctx) => {
        if (!isAdmin(ctx)) return showMenu(ctx);
        const { students, employees } = storage.all();
        const fromBot = (list) => list.filter((x) => x.source === "telegram").length;
        return ctx.reply(
            "📊 <b>CRM statistikasi</b>\n\n" +
            `🎓 O'quvchilar: <b>${students.length}</b> (faol: ${students.filter((s) => s.active).length})\n` +
            `👨‍💼 Hodimlar: <b>${employees.length}</b> (faol: ${employees.filter((e) => e.active).length})\n\n` +
            `🤖 Bot orqali: ${fromBot(students)} o'quvchi, ${fromBot(employees)} hodim`,
            { parse_mode: "HTML" }
        );
    });

    bot.command("id", (ctx) => ctx.reply(`Sizning Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: "HTML" }));

    bot.command("cancel", (ctx) => showMenu(ctx, "Bekor qilindi."));

    bot.hears(BTN.employee, (ctx) => startFlow(ctx, "employee"));
    bot.hears(BTN.student, (ctx) => startFlow(ctx, "student"));
    bot.hears(BTN.cancel, (ctx) => showMenu(ctx, "❌ Bekor qilindi."));

    // Kontakt tugmasi orqali telefon
    bot.on("contact", (ctx) => {
        const session = sessions.get(ctx.chat.id);
        if (!session || session.step !== "phone") return handleAnswer(ctx, "");
        return handleAnswer(ctx, ctx.message.contact.phone_number);
    });

    bot.on("text", (ctx) => handleAnswer(ctx, ctx.message.text));

    // Inline tugmalar (tasdiqlash)
    bot.action("confirm", async (ctx) => {
        await ctx.answerCbQuery();
        const session = sessions.get(ctx.chat.id);
        if (!session || session.step !== "confirm") return ctx.editMessageReplyMarkup(undefined).catch(() => {});
        await ctx.editMessageReplyMarkup(undefined).catch(() => {});
        return save(ctx, bot, session);
    });

    bot.action("restart", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageReplyMarkup(undefined).catch(() => {});
        const session = sessions.get(ctx.chat.id);
        if (!session) return showMenu(ctx);
        sessions.delete(ctx.chat.id);
        await ctx.reply("Qaytadan boshlaymiz ✏️");
        return startFlow(ctx, session.type);
    });

    bot.action("cancel", async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageReplyMarkup(undefined).catch(() => {});
        return showMenu(ctx, "❌ Bekor qilindi.");
    });

    // Rasm, stiker va boshqalar
    bot.on("message", (ctx) => {
        const session = sessions.get(ctx.chat.id);
        if (session) return ctx.reply("Iltimos, matn ko'rinishida javob bering ✍️");
        return showMenu(ctx);
    });

    bot.catch((err, ctx) => {
        console.error(`[bot] Xato (${ctx.updateType}):`, err);
        ctx.reply("Kechirasiz, xatolik yuz berdi. /start ni bosib qaytadan urinib ko'ring.").catch(() => {});
    });

    return bot;
}

module.exports = createBot;
