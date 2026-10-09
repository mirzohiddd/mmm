"use strict";

/* =====================================================================
   storage.js — barcha ma'lumotlar bitta JSON faylda saqlanadi
   Tuzilishi:  { "students": [...], "employees": [...] }

   - Fayl yo'q bo'lsa boshlang'ich ma'lumotlar bilan yaratiladi
   - Yozish "atomic": avval .tmp faylga, keyin rename (fayl buzilmaydi)
   - Bot ham, API ham shu modul orqali ishlaydi → ma'lumot doim bir xil
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");

const COLLECTIONS = ["students", "employees"];

function monthsAgo(n, day) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    d.setDate(day || 10);
    return d.toISOString();
}

function uid() {
    return Date.now().toString(36) + crypto.randomBytes(4).toString("hex").slice(0, 6);
}

// Frontenddagi boshlang'ich ma'lumotlar bilan bir xil
function defaultData() {
    const students = [
        { name: "Azizbek Rustamov", phone: "+998 94 456 78 90", direction: "Python", group: "Python-01", active: false, createdAt: monthsAgo(5, 3) },
        { name: "Jasur Ahmedov", phone: "+998 93 345 67 89", direction: "Data Analytics", group: "Data-01", active: false, createdAt: monthsAgo(4, 8) },
        { name: "Madina Xasanova", phone: "+998 93 345 67 80", direction: "UI/UX", group: "UIUX-01", active: true, createdAt: monthsAgo(4, 15) },
        { name: "Sardor Karimov", phone: "+998 91 234 56 79", direction: "Backend", group: "Backend-01", active: true, createdAt: monthsAgo(3, 6) },
        { name: "Shahzoda Aliyeva", phone: "+998 95 567 89 01", direction: "Frontend", group: "Frontend-02", active: true, createdAt: monthsAgo(2, 12) },
        { name: "Aziza Sobirova", phone: "+998 94 456 78 91", direction: "UI/UX", group: "UIUX-01", active: true, createdAt: monthsAgo(1, 4) },
        { name: "Jasur Ahmedov", phone: "+998 93 345 67 81", direction: "AI", group: "AI-01", active: true, createdAt: monthsAgo(1, 20) },
        { name: "Madina Karimova", phone: "+998 91 234 56 78", direction: "Backend", group: "Backend-01", active: true, createdAt: monthsAgo(0, 2) },
        { name: "Ali Valiyev", phone: "+998 90 123 45 67", direction: "Frontend", group: "Frontend-01", active: true, createdAt: monthsAgo(0, 3) },
    ];
    const employees = [
        { name: "Muslimaxon", position: "Administrator", phone: "+998 90 123 45 67", active: true, createdAt: monthsAgo(6) },
        { name: "Malika", position: "Menejer", phone: "+998 91 222 33 44", active: true, createdAt: monthsAgo(5) },
        { name: "Hadicha", position: "Operator", phone: "+998 93 555 66 77", active: true, createdAt: monthsAgo(3) },
        { name: "Maryam", position: "Sotuvchi", phone: "+998 95 777 88 99", active: false, createdAt: monthsAgo(2) },
        { name: "Emona", position: "Menejer", phone: "+998 97 111 22 33", active: true, createdAt: monthsAgo(0, 2) },
    ];
    const withId = (x) => ({ id: uid(), source: "crm", ...x });
    return { students: students.map(withId), employees: employees.map(withId) };
}

let cache = null;

function load() {
    if (cache) return cache;

    if (!fs.existsSync(config.dataFile)) {
        cache = defaultData();
        persist();
        console.log(`[storage] Yangi ma'lumotlar fayli yaratildi: ${config.dataFile}`);
        return cache;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(config.dataFile, "utf8"));
        cache = {
            students: Array.isArray(parsed.students) ? parsed.students : [],
            employees: Array.isArray(parsed.employees) ? parsed.employees : [],
        };
    } catch (err) {
        // Fayl buzilgan bo'lsa — zaxira nusxa olib, toza fayl yaratamiz
        const backup = `${config.dataFile}.broken-${Date.now()}`;
        fs.copyFileSync(config.dataFile, backup);
        console.error(`[storage] JSON o'qib bo'lmadi, zaxira: ${backup}`);
        cache = { students: [], employees: [] };
        persist();
    }
    return cache;
}

function persist() {
    fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
    const tmp = `${config.dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
    fs.renameSync(tmp, config.dataFile);
}

function assertCollection(name) {
    if (!COLLECTIONS.includes(name)) throw new Error(`Noma'lum kolleksiya: ${name}`);
}

const storage = {
    COLLECTIONS,

    all() {
        const data = load();
        return { students: data.students, employees: data.employees };
    },

    list(name) {
        assertCollection(name);
        return load()[name];
    },

    find(name, id) {
        return storage.list(name).find((x) => x.id === id) || null;
    },

    phoneExists(name, phone, exceptId) {
        return storage.list(name).some((x) => x.phone === phone && x.id !== exceptId);
    },

    add(name, item) {
        const list = storage.list(name);
        const id = typeof item.id === "string" && /^[a-z0-9]{6,32}$/i.test(item.id) && !storage.find(name, item.id)
            ? item.id
            : uid();
        const record = { ...item, id, createdAt: item.createdAt || new Date().toISOString() };
        list.push(record);
        persist();
        return record;
    },

    update(name, id, data) {
        const list = storage.list(name);
        const index = list.findIndex((x) => x.id === id);
        if (index === -1) return null;
        list[index] = { ...list[index], ...data, id, createdAt: list[index].createdAt };
        persist();
        return list[index];
    },

    remove(name, id) {
        const list = storage.list(name);
        const index = list.findIndex((x) => x.id === id);
        if (index === -1) return false;
        list.splice(index, 1);
        persist();
        return true;
    },
};

module.exports = storage;
