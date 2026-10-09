"use strict";

/* =====================================================================
   validators.js — frontend (mean.js) bilan bir xil qoidalar
   ===================================================================== */

const DIRECTIONS = ["Frontend", "Backend", "Python", "UI/UX", "Data Analytics", "AI"];
const POSITIONS = ["Administrator", "Menejer", "Operator", "Sotuvchi", "O'qituvchi", "Buxgalter"];

// Har qanday ko'rinishdagi raqamni "+998 90 123 45 67" ga keltiradi.
// Noto'g'ri bo'lsa null qaytaradi.
function formatPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 9) digits = "998" + digits;
    if (digits.length !== 12 || !digits.startsWith("998")) return null;
    return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
}

function isValidPhone(value) {
    return /^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(String(value || ""));
}

function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// Xato matnini qaytaradi, xato bo'lmasa ""
function nameError(value) {
    const v = cleanText(value);
    if (!v) return "Ism kiritilishi shart";
    if (v.length < 2) return "Ism kamida 2 ta harfdan iborat bo'lsin";
    if (v.length > 50) return "Ism juda uzun";
    if (/\d/.test(v)) return "Ismda raqam bo'lmasligi kerak";
    return "";
}

function groupError(value) {
    const v = cleanText(value);
    if (!v) return "Guruh kiritilishi shart";
    if (v.length > 30) return "Guruh nomi juda uzun";
    return "";
}

function textError(value, label, max = 50) {
    const v = cleanText(value);
    if (!v) return `${label} kiritilishi shart`;
    if (v.length > max) return `${label} juda uzun`;
    return "";
}

module.exports = {
    DIRECTIONS,
    POSITIONS,
    formatPhone,
    isValidPhone,
    cleanText,
    nameError,
    groupError,
    textError,
};
