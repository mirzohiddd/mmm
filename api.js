"use strict";

/* =====================================================================
   api.js — CRM frontend uchun REST API
     GET    /api/data                 → { students, employees }
     GET    /api/students             → ro'yxat
     POST   /api/students             → qo'shish
     PUT    /api/students/:id         → tahrirlash
     DELETE /api/students/:id         → o'chirish
     (xuddi shunday /api/employees)
   ===================================================================== */

const express = require("express");
const storage = require("./storage");
const v = require("./validators");

// Har bir kolleksiya uchun maydonlar va tekshiruv
const schemas = {
    students(body) {
        const errors = {};
        const data = {
            name: v.cleanText(body.name),
            phone: v.formatPhone(body.phone) || v.cleanText(body.phone),
            direction: v.cleanText(body.direction),
            group: v.cleanText(body.group),
            active: body.active === undefined ? true : Boolean(body.active),
        };
        if (v.nameError(data.name)) errors.name = v.nameError(data.name);
        if (!v.isValidPhone(data.phone)) errors.phone = "Format: +998 90 123 45 67";
        if (v.textError(data.direction, "Yo'nalish", 40)) errors.direction = v.textError(data.direction, "Yo'nalish", 40);
        if (v.groupError(data.group)) errors.group = v.groupError(data.group);
        return { data, errors };
    },
    employees(body) {
        const errors = {};
        const data = {
            name: v.cleanText(body.name),
            position: v.cleanText(body.position),
            phone: v.formatPhone(body.phone) || v.cleanText(body.phone),
            active: body.active === undefined ? true : Boolean(body.active),
        };
        if (v.nameError(data.name)) errors.name = v.nameError(data.name);
        if (v.textError(data.position, "Lavozim", 40)) errors.position = v.textError(data.position, "Lavozim", 40);
        if (!v.isValidPhone(data.phone)) errors.phone = "Format: +998 90 123 45 67";
        return { data, errors };
    },
};

function createApi() {
    const router = express.Router();
    router.use(express.json({ limit: "100kb" }));

    router.get("/health", (req, res) => res.json({ ok: true }));

    router.get("/data", (req, res) => res.json(storage.all()));

    for (const name of storage.COLLECTIONS) {
        router.get(`/${name}`, (req, res) => res.json(storage.list(name)));

        router.post(`/${name}`, (req, res) => {
            const { data, errors } = schemas[name](req.body || {});
            if (!errors.phone && storage.phoneExists(name, data.phone)) {
                errors.phone = "Bu raqam allaqachon ro'yxatda bor";
            }
            if (Object.keys(errors).length) return res.status(400).json({ errors });

            const record = storage.add(name, { id: req.body.id, ...data, source: "crm" });
            res.status(201).json(record);
        });

        router.put(`/${name}/:id`, (req, res) => {
            const current = storage.find(name, req.params.id);
            if (!current) return res.status(404).json({ error: "Topilmadi" });

            const { data, errors } = schemas[name]({ ...current, ...(req.body || {}) });
            if (!errors.phone && storage.phoneExists(name, data.phone, current.id)) {
                errors.phone = "Bu raqam allaqachon ro'yxatda bor";
            }
            if (Object.keys(errors).length) return res.status(400).json({ errors });

            res.json(storage.update(name, current.id, data));
        });

        router.delete(`/${name}/:id`, (req, res) => {
            if (!storage.remove(name, req.params.id)) return res.status(404).json({ error: "Topilmadi" });
            res.json({ ok: true });
        });
    }

    // Noto'g'ri JSON va boshqa xatolar
    router.use((err, req, res, next) => {
        console.error("[api]", err.message);
        res.status(err.status || 500).json({ error: err.status === 400 ? "Noto'g'ri so'rov" : "Server xatosi" });
    });

    return router;
}

module.exports = createApi;
