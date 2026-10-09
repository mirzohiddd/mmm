"use strict";

/* =====================================================================
   mean.js — Dashboard loyihasi uchun yagona JavaScript fayl
   Ishlaydigan sahifalar:
     index.html        → Login (kirish)
     Dashbort.html     → Dashboard (statistika, so'nggi o'quvchilar)
     Hodimlar.html     → Hodimlar (qo'shish, tahrirlash, o'chirish, qidirish)
     O'quvchilar.html  → O'quvchilar (qo'shish, tahrirlash, o'chirish, qidirish)
     Analetika.html    → Analitika (hisoblangan statistika)
     Sozlamalar.html   → Profil, parol, tizim sozlamalari
   O'quvchilar va hodimlar serverda (data/db.json) saqlanadi — server.js orqali.
   Telegram bot qo'shganlar ham shu yerda avtomatik ko'rinadi.
   Profil, parol va sozlamalar brauzerning localStorage xotirasida.

   Standart login:  admin
   Standart parol:  admin123
   ===================================================================== */

(function () {
    /* ================================================================
       1. SOZLAMALAR VA BOSHLANG'ICH MA'LUMOTLAR
    ================================================================ */

    const KEYS = {
        students: "dash_students",
        employees: "dash_employees",
        profile: "dash_profile",
        auth: "dash_auth",
        settings: "dash_settings",
        session: "dash_session",
    };

    const PAGES = {
        login: "index.html",
        dashboard: "Dashbort.html",
    };

    const DIRECTIONS = ["Frontend", "Backend", "Python", "UI/UX", "Data Analytics", "AI"];
    const POSITIONS = ["Administrator", "Menejer", "Operator", "Sotuvchi", "O'qituvchi", "Buxgalter"];
    const MONTHS = [
        "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
        "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
    ];

    const DEFAULT_PROFILE = {
        name: "Mirzohid",
        surname: "Shermanov",
        email: "",
        phone: "",
    };

    const DEFAULT_AUTH = {
        login: "admin",
        password: "admin123",
    };

    const DEFAULT_SETTINGS = {
        emailNotify: true,
        autoRefresh: true,
        protectProfile: false,
    };

    const AUTO_REFRESH_MS = 30000;

    /* ================================================================
       2. YORDAMCHI FUNKSIYALAR
    ================================================================ */

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    const storage = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                toast("Ma'lumotni saqlab bo'lmadi (xotira to'lgan bo'lishi mumkin)", "error");
                return false;
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (e) { /* e'tiborsiz */ }
        },
    };

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function escapeHTML(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalize(text) {
        return String(text || "").toLowerCase().replace(/[‘’ʻʼ`]/g, "'").trim();
    }

    // Telefonni "+998 90 123 45 67" ko'rinishiga keltiradi
    function formatPhone(value) {
        let digits = String(value || "").replace(/\D/g, "");
        if (!digits.startsWith("998")) digits = "998" + digits;
        digits = digits.slice(0, 12);

        const parts = [
            digits.slice(0, 3),
            digits.slice(3, 5),
            digits.slice(5, 8),
            digits.slice(8, 10),
            digits.slice(10, 12),
        ].filter(Boolean);

        return "+" + parts.join(" ");
    }

    function isValidPhone(value) {
        return /^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(value);
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    }

    function percent(part, total) {
        return total > 0 ? Math.round((part / total) * 100) : 0;
    }

    function isThisMonth(iso) {
        const d = new Date(iso);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    // Shu oy qo'shilganlar foizi (o'tgan oylarga nisbatan o'sish)
    function monthlyGrowth(list) {
        const added = list.filter((item) => isThisMonth(item.createdAt)).length;
        const before = list.length - added;
        if (before === 0) return added > 0 ? 100 : 0;
        return Math.round((added / before) * 100);
    }

    function currentPage() {
        const file = decodeURIComponent(location.pathname.split("/").pop() || "");
        return file || PAGES.login;
    }

    /* ================================================================
       3. MA'LUMOTLAR OMBORI (CRUD)
    ================================================================ */

    /*
      O'quvchilar va hodimlar endi serverda (data/db.json) saqlanadi.
      Sahifa ochilganda /api/data dan yuklanadi va har SYNC_MS da yangilanadi —
      Telegram bot orqali qo'shilganlar ham avtomatik ko'rinadi.
      Server ishlamasa — oxirgi nusxa (localStorage) ko'rsatiladi.
    */
    const API = "/api";
    const SYNC_MS = 5000;
    const COLLECTION = {
        [KEYS.students]: "students",
        [KEYS.employees]: "employees",
    };

    const remote = {
        data: { students: [], employees: [] },
        online: false,
        listeners: [],
        lastJSON: "",

        onChange(fn) {
            remote.listeners.push(fn);
        },

        emit(added) {
            remote.listeners.forEach((fn) => {
                try { fn(added); } catch (e) { console.error(e); }
            });
        },

        cacheLocal() {
            storage.set(KEYS.students, remote.data.students);
            storage.set(KEYS.employees, remote.data.employees);
        },

        loadLocal() {
            remote.data = {
                students: storage.get(KEYS.students, []),
                employees: storage.get(KEYS.employees, []),
            };
        },

        async request(method, path, body) {
            const res = await fetch(API + path, {
                method,
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
                cache: "no-store",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = new Error(json.error || "Server xatosi");
                err.errors = json.errors;
                throw err;
            }
            return json;
        },

        // Serverdan yangi ma'lumot olish. O'zgargan bo'lsa listenerlarni chaqiradi.
        async sync() {
            try {
                const data = await remote.request("GET", "/data");
                const json = JSON.stringify(data);
                const wasOnline = remote.online;
                remote.online = true;
                if (json === remote.lastJSON) return false;

                // Telegram bot orqali yangi qo'shilganlarni aniqlash (toast uchun)
                const added = { students: [], employees: [] };
                if (remote.lastJSON) {
                    ["students", "employees"].forEach((name) => {
                        const known = new Set(remote.data[name].map((x) => x.id));
                        added[name] = data[name].filter((x) => !known.has(x.id) && x.source === "telegram");
                    });
                }

                remote.lastJSON = json;
                remote.data = data;
                remote.cacheLocal();
                if (!wasOnline && remote.everOffline) toast("Server bilan aloqa tiklandi", "info");
                remote.emit(added);
                return true;
            } catch (e) {
                if (remote.online || !remote.everOffline) {
                    toast("Server bilan aloqa yo'q. \"npm start\" bilan serverni ishga tushiring.", "error");
                }
                remote.online = false;
                remote.everOffline = true;
                return false;
            }
        },

        // Lokal o'zgarishni serverga yuborish; xato bo'lsa serverdagi holatga qaytarish
        push(method, path, body) {
            remote.lastJSON = JSON.stringify(remote.data);
            remote.cacheLocal();
            remote.request(method, path, body)
                .then(() => remote.sync())
                .catch((err) => {
                    const fieldErrors = err.errors ? Object.values(err.errors).join(", ") : "";
                    toast(fieldErrors || (remote.online ? err.message : "Server bilan aloqa yo'q — saqlanmadi"), "error");
                    remote.lastJSON = "";
                    remote.sync();
                });
        },
    };

    const db = {
        students() {
            return remote.data.students;
        },
        employees() {
            return remote.data.employees;
        },
        add(key, item) {
            const record = { id: uid(), createdAt: new Date().toISOString(), source: "crm", ...item };
            remote.data[COLLECTION[key]].push(record);
            remote.push("POST", `/${COLLECTION[key]}`, record);
            return true;
        },
        update(key, id, data) {
            const list = remote.data[COLLECTION[key]];
            const index = list.findIndex((item) => item.id === id);
            if (index === -1) return false;
            list[index] = { ...list[index], ...data };
            remote.push("PUT", `/${COLLECTION[key]}/${encodeURIComponent(id)}`, data);
            return true;
        },
        remove(key, id) {
            const name = COLLECTION[key];
            remote.data[name] = remote.data[name].filter((item) => item.id !== id);
            remote.push("DELETE", `/${name}/${encodeURIComponent(id)}`);
            return true;
        },
        profile() {
            return { ...DEFAULT_PROFILE, ...storage.get(KEYS.profile, {}) };
        },
        auth() {
            return { ...DEFAULT_AUTH, ...storage.get(KEYS.auth, {}) };
        },
        settings() {
            return { ...DEFAULT_SETTINGS, ...storage.get(KEYS.settings, {}) };
        },
    };

    /* ================================================================
       4. QO'SHIMCHA STILLAR (modal, toast, xatolar)
    ================================================================ */

    function injectStyles() {
        if ($("#mean-js-styles")) return;

        const style = document.createElement("style");
        style.id = "mean-js-styles";
        style.textContent = `
            a.formButton { display: block; text-align: center; text-decoration: none; }

            .js-field-error { color: #dc2626; font-size: 12px; margin-top: 6px; min-height: 14px; }
            .js-input-error { border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important; }
            .js-login-error { background: #fee2e2; color: #b91c1c; padding: 11px 14px; border-radius: 10px;
                font-size: 14px; margin-bottom: 18px; display: none; }
            .js-login-error.show { display: block; animation: jsShake 0.35s; }
            .js-login-hint { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px; }
            @keyframes jsShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

            .js-actions { display: flex; gap: 8px; }
            .js-delete-button { border: none; background: #fef2f2; color: #dc2626; padding: 8px 12px; border-radius: 8px;
                cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.3s; }
            .js-delete-button:hover { background: #dc2626; color: white; }
            .js-empty-row td { text-align: center; color: #9ca3af; padding: 30px 20px; }

            .js-overlay { position: fixed; inset: 0; background: rgba(17, 24, 39, 0.5); display: flex; align-items: center;
                justify-content: center; padding: 20px; z-index: 1000; opacity: 0; transition: opacity 0.2s; }
            .js-overlay.show { opacity: 1; }
            .js-modal { width: 100%; max-width: 480px; max-height: calc(100vh - 40px); overflow-y: auto; background: white;
                border-radius: 16px; box-shadow: 0 25px 60px rgba(0,0,0,0.25); transform: translateY(15px); transition: transform 0.2s; }
            .js-overlay.show .js-modal { transform: translateY(0); }
            .js-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px;
                border-bottom: 1px solid #e5e7eb; }
            .js-modal-header h2 { font-size: 19px; }
            .js-modal-close { border: none; background: #f3f4f6; width: 34px; height: 34px; border-radius: 8px;
                font-size: 20px; cursor: pointer; color: #6b7280; line-height: 1; }
            .js-modal-close:hover { background: #e5e7eb; color: #111827; }
            .js-modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
            .js-modal-body p.js-confirm-text { color: #374151; font-size: 15px; line-height: 1.5; }
            .js-modal-field label { display: block; font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 7px; }
            .js-modal-field input, .js-modal-field select { width: 100%; padding: 12px 14px; border: 1px solid #d1d5db;
                border-radius: 10px; outline: none; font-size: 14px; background: white; transition: 0.3s; font-family: inherit; }
            .js-modal-field input:focus, .js-modal-field select:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
            .js-modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px 22px; flex-wrap: wrap; }
            .js-btn { border: none; padding: 11px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.3s; }
            .js-btn-primary { background: #2563eb; color: white; }
            .js-btn-primary:hover { background: #1d4ed8; }
            .js-btn-light { background: #f3f4f6; color: #374151; }
            .js-btn-light:hover { background: #e5e7eb; }
            .js-btn-danger { background: #dc2626; color: white; }
            .js-btn-danger:hover { background: #b91c1c; }

            .js-toast-box { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 2000; }
            .js-toast { min-width: 240px; max-width: 360px; padding: 13px 16px; border-radius: 10px; color: white; font-size: 14px;
                font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.15); opacity: 0; transform: translateX(30px); transition: 0.3s; }
            .js-toast.show { opacity: 1; transform: translateX(0); }
            .js-toast.success { background: #16a34a; }
            .js-toast.error { background: #dc2626; }
            .js-toast.info { background: #2563eb; }

            .progress-bar { transition: width 0.8s ease; }
            .js-highlight { background: #fef9c3; border-radius: 3px; }
            body.js-modal-open { overflow: hidden; }
            .js-tg-badge { display: inline-block; margin-left: 6px; padding: 2px 6px; border-radius: 6px; background: #e0f2fe;
                color: #0369a1; font-size: 10px; font-weight: 700; vertical-align: middle; letter-spacing: 0.3px; }
        `;
        document.head.appendChild(style);
    }

    /* ================================================================
       5. TOAST XABARLAR
    ================================================================ */

    function toast(message, type = "success") {
        let box = $(".js-toast-box");
        if (!box) {
            box = document.createElement("div");
            box.className = "js-toast-box";
            document.body.appendChild(box);
        }

        const item = document.createElement("div");
        item.className = `js-toast ${type}`;
        item.textContent = message;
        box.appendChild(item);

        requestAnimationFrame(() => item.classList.add("show"));

        setTimeout(() => {
            item.classList.remove("show");
            setTimeout(() => item.remove(), 300);
        }, 3000);
    }

    /* ================================================================
       6. MODAL OYNA
    ================================================================ */

    function closeModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove("show");
        document.body.classList.remove("js-modal-open");
        document.removeEventListener("keydown", overlay._escHandler);
        setTimeout(() => overlay.remove(), 200);
    }

    function createOverlay(title, bodyHTML, footerHTML) {
        const overlay = document.createElement("div");
        overlay.className = "js-overlay";
        overlay.innerHTML = `
            <div class="js-modal" role="dialog" aria-modal="true">
                <div class="js-modal-header">
                    <h2>${escapeHTML(title)}</h2>
                    <button type="button" class="js-modal-close" aria-label="Yopish">&times;</button>
                </div>
                ${bodyHTML}
                ${footerHTML}
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.classList.add("js-modal-open");
        requestAnimationFrame(() => overlay.classList.add("show"));

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay || e.target.closest(".js-modal-close") || e.target.closest("[data-cancel]")) {
                closeModal(overlay);
            }
        });

        overlay._escHandler = (e) => {
            if (e.key === "Escape") closeModal(overlay);
        };
        document.addEventListener("keydown", overlay._escHandler);

        return overlay;
    }

    // Tasdiqlash oynasi → Promise<boolean>
    function confirmDialog(message, okText = "O'chirish") {
        return new Promise((resolve) => {
            let answered = false;
            const overlay = createOverlay(
                "Tasdiqlang",
                `<div class="js-modal-body"><p class="js-confirm-text">${escapeHTML(message)}</p></div>`,
                `<div class="js-modal-footer">
                    <button type="button" class="js-btn js-btn-light" data-cancel>Bekor qilish</button>
                    <button type="button" class="js-btn js-btn-danger" data-ok>${escapeHTML(okText)}</button>
                 </div>`
            );

            $("[data-ok]", overlay).addEventListener("click", () => {
                answered = true;
                closeModal(overlay);
                resolve(true);
            });

            const observer = new MutationObserver(() => {
                if (!document.body.contains(overlay)) {
                    observer.disconnect();
                    if (!answered) resolve(false);
                }
            });
            observer.observe(document.body, { childList: true });

            $("[data-ok]", overlay).focus();
        });
    }

    /*
      Forma oynasi.
      fields: [{ name, label, type: "text"|"tel"|"select", options, placeholder, validate(value) → xato matni yoki "" }]
      onSubmit(values) → true qaytarsa oyna yopiladi
    */
    function formModal({ title, fields, values = {}, submitText = "Saqlash", onSubmit, onDelete }) {
        const fieldsHTML = fields.map((f) => {
            const value = values[f.name] != null ? values[f.name] : "";
            let control;

            if (f.type === "select") {
                control = `<select id="js-f-${f.name}" name="${f.name}">
                    ${f.options.map((opt) => {
                        const optValue = typeof opt === "object" ? opt.value : opt;
                        const optLabel = typeof opt === "object" ? opt.label : opt;
                        const selected = String(optValue) === String(value) ? "selected" : "";
                        return `<option value="${escapeHTML(optValue)}" ${selected}>${escapeHTML(optLabel)}</option>`;
                    }).join("")}
                </select>`;
            } else {
                control = `<input id="js-f-${f.name}" name="${f.name}" type="${f.type || "text"}"
                    value="${escapeHTML(value)}" placeholder="${escapeHTML(f.placeholder || "")}" autocomplete="off">`;
            }

            return `<div class="js-modal-field">
                <label for="js-f-${f.name}">${escapeHTML(f.label)}</label>
                ${control}
                <div class="js-field-error" data-error-for="${f.name}"></div>
            </div>`;
        }).join("");

        const overlay = createOverlay(
            title,
            `<form class="js-modal-body" novalidate>${fieldsHTML}<button type="submit" hidden></button></form>`,
            `<div class="js-modal-footer">
                ${onDelete ? `<button type="button" class="js-btn js-btn-danger" data-delete style="margin-right:auto">O'chirish</button>` : ""}
                <button type="button" class="js-btn js-btn-light" data-cancel>Bekor qilish</button>
                <button type="button" class="js-btn js-btn-primary" data-submit>${escapeHTML(submitText)}</button>
             </div>`
        );

        const form = $("form", overlay);

        // Telefon maydonlariga avtomatik format
        $$('input[type="tel"]', form).forEach(attachPhoneMask);

        // Yozishni boshlaganda xatoni tozalash
        form.addEventListener("input", (e) => {
            if (e.target.name) setFieldError(form, e.target.name, "");
        });

        function submit() {
            const data = {};
            let hasError = false;

            fields.forEach((f) => {
                const input = form.elements[f.name];
                const value = input.value.trim();
                data[f.name] = value;

                const error = f.validate ? f.validate(value) : "";
                setFieldError(form, f.name, error);
                if (error) hasError = true;
            });

            if (hasError) {
                const firstError = $(".js-input-error", form);
                if (firstError) firstError.focus();
                return;
            }

            if (onSubmit(data) !== false) closeModal(overlay);
        }

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            submit();
        });
        $("[data-submit]", overlay).addEventListener("click", submit);

        if (onDelete) {
            $("[data-delete]", overlay).addEventListener("click", async () => {
                closeModal(overlay);
                await onDelete();
            });
        }

        const first = $("input, select", form);
        if (first) setTimeout(() => first.focus(), 50);
    }

    function setFieldError(root, name, message) {
        const input = root.querySelector(`[name="${name}"]`) || root.querySelector(`#${name}`);
        const box = root.querySelector(`[data-error-for="${name}"]`);
        if (input) input.classList.toggle("js-input-error", Boolean(message));
        if (box) box.textContent = message || "";
    }

    function attachPhoneMask(input) {
        input.addEventListener("focus", () => {
            if (!input.value) input.value = "+998 ";
        });
        input.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "");
            input.value = digits.length <= 3 ? "+998 " : formatPhone(digits);
        });
        input.addEventListener("blur", () => {
            if (input.value.replace(/\D/g, "") === "998") input.value = "";
        });
    }

    // Umumiy validatorlar
    const rules = {
        name(value) {
            if (!value) return "Ism kiritilishi shart";
            if (value.length < 2) return "Ism kamida 2 ta harfdan iborat bo'lsin";
            if (value.length > 50) return "Ism juda uzun";
            if (/\d/.test(value)) return "Ismda raqam bo'lmasligi kerak";
            return "";
        },
        phone(value) {
            if (!value) return "Telefon raqam kiritilishi shart";
            if (!isValidPhone(value)) return "Format: +998 90 123 45 67";
            return "";
        },
        required(label) {
            return (value) => (value ? "" : `${label} kiritilishi shart`);
        },
    };

    function uniquePhone(list, currentId) {
        return (value) => {
            const base = rules.phone(value);
            if (base) return base;
            const exists = list().some((item) => item.phone === value && item.id !== currentId);
            return exists ? "Bu raqam allaqachon ro'yxatda bor" : "";
        };
    }

    /* ================================================================
       7. AVTORIZATSIYA (login / logout / himoya)
    ================================================================ */

    const auth = {
        getSession() {
            try {
                const raw = sessionStorage.getItem(KEYS.session) || localStorage.getItem(KEYS.session);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                return null;
            }
        },
        login(login) {
            const session = JSON.stringify({ login, at: Date.now() });
            const protect = db.settings().protectProfile;
            try {
                // "Profilni himoyalash" yoqilgan bo'lsa — brauzer yopilganda chiqib ketadi
                if (protect) {
                    sessionStorage.setItem(KEYS.session, session);
                    localStorage.removeItem(KEYS.session);
                } else {
                    localStorage.setItem(KEYS.session, session);
                }
            } catch (e) { /* e'tiborsiz */ }
        },
        logout() {
            try {
                sessionStorage.removeItem(KEYS.session);
                localStorage.removeItem(KEYS.session);
            } catch (e) { /* e'tiborsiz */ }
        },
        isLoggedIn() {
            return Boolean(auth.getSession());
        },
    };

    /* ================================================================
       8. LOGIN SAHIFASI (index.html)
    ================================================================ */

    function initLoginPage() {
        if (auth.isLoggedIn()) {
            location.replace(PAGES.dashboard);
            return;
        }

        const form = $(".login-card form");
        const loginInput = $("#Login");
        const passInput = $("#Parol");
        const button = $(".formButton");
        if (!form || !loginInput || !passInput || !button) return;

        // Umumiy xato bloki
        const errorBox = document.createElement("div");
        errorBox.className = "js-login-error";
        form.prepend(errorBox);

        // Har bir input ostiga xato joyi
        [loginInput, passInput].forEach((input) => {
            const err = document.createElement("div");
            err.className = "js-field-error";
            err.dataset.errorFor = input.name;
            input.parentElement.appendChild(err);
            input.addEventListener("input", () => {
                setFieldError(form, input.name, "");
                errorBox.classList.remove("show");
            });
        });

        const hint = document.createElement("p");
        hint.className = "js-login-hint";
        hint.textContent = "Standart: admin / admin123";
        form.appendChild(hint);

        loginInput.setAttribute("autocomplete", "username");
        passInput.setAttribute("autocomplete", "current-password");
        button.setAttribute("role", "button");

        function submit() {
            const login = loginInput.value.trim();
            const password = passInput.value;
            let hasError = false;

            setFieldError(form, loginInput.name, login ? "" : "Loginni kiriting");
            setFieldError(form, passInput.name, password ? "" : "Parolni kiriting");
            if (!login || !password) hasError = true;

            if (hasError) {
                (login ? passInput : loginInput).focus();
                return;
            }

            const creds = db.auth();
            const profile = db.profile();
            const loginOk =
                normalize(login) === normalize(creds.login) ||
                (profile.email && normalize(login) === normalize(profile.email));

            if (!loginOk || password !== creds.password) {
                errorBox.textContent = "Login yoki parol noto'g'ri";
                errorBox.classList.remove("show");
                void errorBox.offsetWidth; // animatsiyani qayta ishga tushirish
                errorBox.classList.add("show");
                passInput.value = "";
                passInput.focus();
                return;
            }

            auth.login(creds.login);
            button.textContent = "Kirilmoqda...";
            setTimeout(() => location.assign(PAGES.dashboard), 300);
        }

        button.addEventListener("click", (e) => {
            e.preventDefault();
            submit();
        });

        form.addEventListener("submit", (e) => {
            e.preventDefault();
            submit();
        });

        // <a> tugma bo'lgani uchun Enter bilan yuborish
        [loginInput, passInput].forEach((input) => {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                }
            });
        });

        loginInput.focus();
    }

    /* ================================================================
       9. SIDEBAR (Chiqish tugmasi)
    ================================================================ */

    function initSidebar() {
        const logoutLink = $$(".sizebar a").find((a) => /index\.html$/i.test(a.getAttribute("href") || ""));
        if (!logoutLink) return;

        logoutLink.addEventListener("click", async (e) => {
            e.preventDefault();
            const ok = await confirmDialog("Tizimdan chiqmoqchimisiz?", "Chiqish");
            if (!ok) return;
            auth.logout();
            location.assign(PAGES.login);
        });
    }

    /* ================================================================
       10. JADVAL SAHIFALARI UCHUN UMUMIY MODUL
           (Hodimlar va O'quvchilar)
    ================================================================ */

    function statusBadge(active) {
        return active
            ? `<span class="status active-status">Faol</span>`
            : `<span class="status inactive-status">Nofaol</span>`;
    }

    function highlight(text, query) {
        const safe = escapeHTML(text);
        if (!query) return safe;
        const index = normalize(text).indexOf(query);
        if (index === -1) return safe;
        const raw = String(text);
        return (
            escapeHTML(raw.slice(0, index)) +
            `<mark class="js-highlight">${escapeHTML(raw.slice(index, index + query.length))}</mark>` +
            escapeHTML(raw.slice(index + query.length))
        );
    }

    function initCrudPage(config) {
        const tbody = $(`${config.boxSelector} tbody`);
        const counter = $(`${config.boxSelector} .table-header span`);
        const searchInput = $(".search-input");
        const addButton = $(".page-header .add-button");
        if (!tbody) return;

        let query = "";

        function render() {
            const all = config.list();
            const filtered = query
                ? all.filter((item) => config.searchFields.some((f) => normalize(f(item)).includes(query)))
                : all;

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr class="js-empty-row"><td colspan="${config.columns}">
                    ${query ? "Hech narsa topilmadi" : config.emptyText}
                </td></tr>`;
            } else {
                tbody.innerHTML = filtered.map((item, i) => config.row(item, i + 1, query)).join("");
            }

            if (counter) {
                counter.textContent = query
                    ? `Topildi: ${filtered.length} / ${all.length}`
                    : config.counterText(all.length);
            }
        }

        function openForm(item) {
            formModal({
                title: item ? config.editTitle : config.addTitle,
                fields: config.fields(item),
                values: item ? config.toForm(item) : config.defaults(),
                submitText: item ? "Saqlash" : "Qo'shish",
                onSubmit(data) {
                    const payload = config.fromForm(data);
                    const ok = item
                        ? db.update(config.key, item.id, payload)
                        : db.add(config.key, payload);
                    if (!ok) return false;
                    render();
                    toast(item ? "O'zgarishlar saqlandi" : config.addedText);
                    return true;
                },
                onDelete: item ? () => removeItem(item) : null,
            });
        }

        async function removeItem(item) {
            const ok = await confirmDialog(`"${item.name}" ni ro'yxatdan o'chirmoqchimisiz?`);
            if (!ok) return;
            db.remove(config.key, item.id);
            render();
            toast("O'chirildi", "info");
        }

        // Jadvaldagi tugmalar (event delegation)
        tbody.addEventListener("click", (e) => {
            const button = e.target.closest("button[data-id]");
            if (!button) return;
            const item = config.list().find((x) => x.id === button.dataset.id);
            if (!item) {
                render();
                return;
            }
            if (button.classList.contains("edit-button")) openForm(item);
            if (button.classList.contains("js-delete-button")) removeItem(item);
        });

        if (addButton) addButton.addEventListener("click", () => openForm(null));

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                query = normalize(searchInput.value);
                render();
            });
            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    searchInput.value = "";
                    query = "";
                    render();
                }
            });
        }

        // Serverda o'zgarsa (boshqa tab, boshqa kompyuter yoki Telegram bot) — yangilash
        remote.onChange((added) => {
            render();
            const fresh = added[COLLECTION[config.key]] || [];
            if (fresh.length === 1) toast(`🤖 Telegram bot: ${fresh[0].name} qo'shildi`, "info");
            if (fresh.length > 1) toast(`🤖 Telegram bot: ${fresh.length} ta yangi yozuv qo'shildi`, "info");
        });

        render();
    }

    // Telegram bot orqali kelgan yozuvlar uchun kichik belgi
    function tgBadge(item) {
        if (item.source !== "telegram") return "";
        const title = item.telegramUsername ? `@${item.telegramUsername}` : "Telegram bot orqali";
        return ` <span class="js-tg-badge" title="${escapeHTML(title)}">TG</span>`;
    }

    function actionButtons(id) {
        return `<div class="js-actions">
            <button class="edit-button" data-id="${escapeHTML(id)}">Tahrirlash</button>
            <button class="js-delete-button" data-id="${escapeHTML(id)}">O'chirish</button>
        </div>`;
    }

    function withCurrent(options, current) {
        return current && !options.includes(current) ? [current, ...options] : options;
    }

    /* ================================================================
       11. HODIMLAR SAHIFASI
    ================================================================ */

    function initEmployeesPage() {
        initCrudPage({
            key: KEYS.employees,
            boxSelector: ".employees-box",
            columns: 6,
            list: db.employees,
            emptyText: "Hozircha hodimlar yo'q. \"+ Hodim qo'shish\" tugmasini bosing.",
            addTitle: "Yangi hodim qo'shish",
            editTitle: "Hodimni tahrirlash",
            addedText: "Hodim qo'shildi",
            counterText: (n) => `${n} ta hodim`,
            searchFields: [(x) => x.name, (x) => x.position, (x) => x.phone, (x) => (x.active ? "faol" : "nofaol")],
            row: (x, n, q) => `
                <tr>
                    <td>${n}</td>
                    <td><strong>${highlight(x.name, q)}</strong>${tgBadge(x)}</td>
                    <td>${highlight(x.position, q)}</td>
                    <td>${highlight(x.phone, q)}</td>
                    <td>${statusBadge(x.active)}</td>
                    <td>${actionButtons(x.id)}</td>
                </tr>`,
            fields: (item) => [
                { name: "name", label: "Ism", placeholder: "Masalan: Malika", validate: rules.name },
                { name: "position", label: "Lavozim", type: "select", options: withCurrent(POSITIONS, item && item.position) },
                { name: "phone", label: "Telefon", type: "tel", placeholder: "+998 90 123 45 67",
                    validate: uniquePhone(db.employees, item && item.id) },
                { name: "active", label: "Holat", type: "select",
                    options: [{ value: "1", label: "Faol" }, { value: "0", label: "Nofaol" }] },
            ],
            defaults: () => ({ position: POSITIONS[0], active: "1" }),
            toForm: (x) => ({ ...x, active: x.active ? "1" : "0" }),
            fromForm: (d) => ({ name: d.name, position: d.position, phone: d.phone, active: d.active === "1" }),
        });
    }

    /* ================================================================
       12. O'QUVCHILAR SAHIFASI
    ================================================================ */

    function initStudentsPage() {
        initCrudPage({
            key: KEYS.students,
            boxSelector: ".students-box",
            columns: 7,
            list: db.students,
            emptyText: "Hozircha o'quvchilar yo'q. \"+ O'quvchi qo'shish\" tugmasini bosing.",
            addTitle: "Yangi o'quvchi qo'shish",
            editTitle: "O'quvchini tahrirlash",
            addedText: "O'quvchi qo'shildi",
            counterText: (n) => `Jami: ${n} ta o'quvchi`,
            searchFields: [(x) => x.name, (x) => x.phone, (x) => x.direction, (x) => x.group,
                (x) => (x.active ? "faol" : "nofaol")],
            row: (x, n, q) => `
                <tr>
                    <td>${n}</td>
                    <td>${highlight(x.name, q)}${tgBadge(x)}</td>
                    <td>${highlight(x.phone, q)}</td>
                    <td>${highlight(x.direction, q)}</td>
                    <td>${highlight(x.group, q)}</td>
                    <td>${statusBadge(x.active)}</td>
                    <td>${actionButtons(x.id)}</td>
                </tr>`,
            fields: (item) => [
                { name: "name", label: "Ism familiya", placeholder: "Masalan: Ali Valiyev", validate: rules.name },
                { name: "phone", label: "Telefon", type: "tel", placeholder: "+998 90 123 45 67",
                    validate: uniquePhone(db.students, item && item.id) },
                { name: "direction", label: "Yo'nalish", type: "select", options: withCurrent(DIRECTIONS, item && item.direction) },
                { name: "group", label: "Guruh", placeholder: "Masalan: Frontend-01",
                    validate: (v) => (!v ? "Guruh kiritilishi shart" : v.length > 30 ? "Guruh nomi juda uzun" : "") },
                { name: "active", label: "Status", type: "select",
                    options: [{ value: "1", label: "Faol" }, { value: "0", label: "Nofaol" }] },
            ],
            defaults: () => ({ direction: DIRECTIONS[0], group: "", active: "1" }),
            toForm: (x) => ({ ...x, active: x.active ? "1" : "0" }),
            fromForm: (d) => ({
                name: d.name,
                phone: d.phone,
                direction: d.direction,
                group: d.group,
                active: d.active === "1",
            }),
        });
    }

    /* ================================================================
       13. STATISTIKA (Dashboard va Analitika uchun umumiy)
    ================================================================ */

    function getStats() {
        const students = db.students();
        const employees = db.employees();
        const active = students.filter((s) => s.active).length;
        const inactive = students.length - active;

        return {
            students,
            employees,
            totalStudents: students.length,
            totalEmployees: employees.length,
            active,
            inactive,
            activePercent: percent(active, students.length),
            inactivePercent: percent(inactive, students.length),
            studentGrowth: monthlyGrowth(students),
            employeeGrowth: monthlyGrowth(employees),
            newThisMonth: students.filter((s) => isThisMonth(s.createdAt)).length,
        };
    }

    // Raqamni 0 dan sanab chiqish animatsiyasi
    function animateNumber(el, target, prefix = "") {
        if (!el) return;
        const from = Number(el.dataset.value || 0);
        el.dataset.value = target;
        if (from === target) {
            el.textContent = prefix + target;
            return;
        }
        const duration = 600;
        const start = performance.now();
        function step(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = prefix + Math.round(from + (target - from) * eased);
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // 4 ta statistik kartani to'ldirish
    function fillStatCards(cards, stats) {
        const values = [
            { value: stats.totalStudents, note: `+${stats.studentGrowth}% bu oy` },
            { value: stats.totalEmployees, note: `+${stats.employeeGrowth}% bu oy` },
            { value: stats.active, note: `${stats.activePercent}% faol` },
            { value: stats.inactive, note: `${stats.inactivePercent}% nofaol` },
        ];

        cards.forEach((card, i) => {
            if (!values[i]) return;
            animateNumber($("h2", card), values[i].value);
            const note = $("span", card);
            if (note) note.textContent = values[i].note;
        });
    }

    function startAutoRefresh(render) {
        let timer = null;

        function schedule() {
            clearInterval(timer);
            if (db.settings().autoRefresh) timer = setInterval(render, AUTO_REFRESH_MS);
        }

        // Boshqa tabda sozlama/profil o'zgarsa
        window.addEventListener("storage", (e) => {
            if (e.key === KEYS.settings) schedule();
            if (db.settings().autoRefresh && e.key === KEYS.profile) render();
        });

        // Serverda ma'lumot o'zgarsa (jumladan Telegram bot orqali) — darhol yangilash
        remote.onChange(() => {
            if (db.settings().autoRefresh) render();
        });

        // Sahifaga qaytilganda (bfcache) yangilash
        window.addEventListener("pageshow", (e) => {
            if (e.persisted) render();
        });

        schedule();
    }

    /* ================================================================
       14. DASHBOARD SAHIFASI
    ================================================================ */

    function initDashboardPage() {
        function render() {
            const stats = getStats();

            fillStatCards($$(".dashboard-stat-card"), stats);

            // So'nggi qo'shilgan 4 ta o'quvchi
            const tbody = $(".dashboard-table-wrapper tbody");
            if (tbody) {
                const recent = [...stats.students]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 4);

                tbody.innerHTML = recent.length
                    ? recent.map((s, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${escapeHTML(s.name)}</td>
                            <td>${escapeHTML(s.phone)}</td>
                            <td>${escapeHTML(s.direction)}</td>
                            <td>${statusBadge(s.active)}</td>
                        </tr>`).join("")
                    : `<tr class="js-empty-row"><td colspan="5">Hozircha o'quvchilar yo'q</td></tr>`;
            }

            // Xush kelibsiz matni
            const welcome = $(".dashboard-welcome h2");
            if (welcome) {
                const name = db.profile().name || "Admin";
                welcome.textContent = `Xush kelibsiz, ${name}! 👋`;
            }
        }

        render();
        startAutoRefresh(render);
    }

    /* ================================================================
       15. ANALITIKA SAHIFASI
    ================================================================ */

    function initAnalyticsPage() {
        function renderDirections(box, students) {
            if (!box) return;
            $$(".progress-item", box).forEach((el) => el.remove());

            const counts = {};
            students.forEach((s) => {
                counts[s.direction] = (counts[s.direction] || 0) + 1;
            });

            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const max = entries.length ? entries[0][1] : 0;

            if (!entries.length) {
                const empty = document.createElement("div");
                empty.className = "progress-item";
                empty.innerHTML = `<p style="color:#9ca3af;font-size:14px">Ma'lumot yo'q</p>`;
                box.appendChild(empty);
                return;
            }

            entries.forEach(([direction, count]) => {
                const item = document.createElement("div");
                item.className = "progress-item";
                item.innerHTML = `
                    <div class="progress-info">
                        <span>${escapeHTML(direction)}</span>
                        <strong>${count}</strong>
                    </div>
                    <div class="progress">
                        <div class="progress-bar" style="width:0%"></div>
                    </div>`;
                box.appendChild(item);

                const bar = $(".progress-bar", item);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        bar.style.width = `${percent(count, max)}%`;
                    });
                });
            });
        }

        // Oxirgi 6 oy oxiridagi jami o'quvchilar soni
        function renderMonthly(list, students) {
            if (!list) return;
            const now = new Date();
            const rows = [];

            for (let i = 5; i >= 0; i--) {
                const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                const total = students.filter((s) => new Date(s.createdAt) < monthEnd).length;
                rows.push({ label: `${MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}`, total });
            }

            list.innerHTML = rows.map((r) => `
                <div class="month-item">
                    <span>${r.label}</span>
                    <strong>${r.total}</strong>
                </div>`).join("");
        }

        function renderSummary(stats) {
            const items = $$(".summary-item");
            const groups = new Set(stats.students.map((s) => s.group).filter(Boolean));
            const activeGroups = new Set(stats.students.filter((s) => s.active).map((s) => s.group).filter(Boolean));

            const map = {
                "yangi o'quvchilar": `+${stats.newThisMonth}`,
                "faol guruhlar": activeGroups.size,
                "jami guruhlar": groups.size,
            };

            items.forEach((item) => {
                const label = normalize($("span", item) && $("span", item).textContent);
                const strong = $("strong", item);
                if (strong && map[label] !== undefined) strong.textContent = map[label];
            });
        }

        function render() {
            const stats = getStats();
            fillStatCards($$(".analytics-card"), stats);

            const boxes = $$(".analytics-grid .analytics-box");
            renderDirections(boxes[0], stats.students);
            renderMonthly($(".monthly-list"), stats.students);
            renderSummary(stats);
        }

        render();
        startAutoRefresh(render);
    }

    /* ================================================================
       16. SOZLAMALAR SAHIFASI
    ================================================================ */

    function initSettingsPage() {
        const boxes = $$(".settings-box");
        const profileBox = boxes[0];
        const passwordBox = boxes[1];
        const systemBox = boxes[2];

        function addErrorSlots(box) {
            $$(".settings-input-group input", box).forEach((input) => {
                const err = document.createElement("div");
                err.className = "js-field-error";
                err.dataset.errorFor = input.id;
                input.parentElement.appendChild(err);
                input.addEventListener("input", () => setFieldError(box, input.id, ""));
            });
        }

        /* ---------- Profil ---------- */
        if (profileBox) {
            addErrorSlots(profileBox);

            const fields = {
                name: $("#name", profileBox),
                surname: $("#surname", profileBox),
                email: $("#email", profileBox),
                phone: $("#phone", profileBox),
            };

            const profile = db.profile();
            Object.keys(fields).forEach((key) => {
                if (fields[key]) fields[key].value = profile[key] || "";
            });

            if (fields.phone) attachPhoneMask(fields.phone);

            const saveButton = $(".save-button", profileBox);
            if (saveButton) {
                saveButton.addEventListener("click", () => {
                    const data = {
                        name: fields.name.value.trim(),
                        surname: fields.surname.value.trim(),
                        email: fields.email.value.trim(),
                        phone: fields.phone.value.trim(),
                    };

                    const errors = {
                        name: rules.name(data.name),
                        surname: data.surname && /\d/.test(data.surname) ? "Familiyada raqam bo'lmasligi kerak" : "",
                        email: data.email && !isValidEmail(data.email) ? "Email noto'g'ri, masalan: example@gmail.com" : "",
                        phone: data.phone && !isValidPhone(data.phone) ? "Format: +998 90 123 45 67" : "",
                    };

                    let hasError = false;
                    Object.keys(errors).forEach((key) => {
                        setFieldError(profileBox, key, errors[key]);
                        if (errors[key]) hasError = true;
                    });

                    if (hasError) {
                        toast("Maydonlarni to'g'ri to'ldiring", "error");
                        return;
                    }

                    if (storage.set(KEYS.profile, data)) toast("Profil ma'lumotlari saqlandi");
                });
            }
        }

        /* ---------- Parol ---------- */
        if (passwordBox) {
            addErrorSlots(passwordBox);

            const oldInput = $("#oldPassword", passwordBox);
            const newInput = $("#newPassword", passwordBox);
            const confirmInput = $("#confirmPassword", passwordBox);
            const button = $(".save-button", passwordBox);

            if (button && oldInput && newInput && confirmInput) {
                button.addEventListener("click", () => {
                    const creds = db.auth();
                    const oldPass = oldInput.value;
                    const newPass = newInput.value;
                    const confirmPass = confirmInput.value;

                    const errors = {
                        oldPassword: !oldPass
                            ? "Eski parolni kiriting"
                            : oldPass !== creds.password ? "Eski parol noto'g'ri" : "",
                        newPassword: !newPass
                            ? "Yangi parolni kiriting"
                            : newPass.length < 6 ? "Parol kamida 6 ta belgidan iborat bo'lsin"
                            : newPass === oldPass ? "Yangi parol eskisidan farq qilishi kerak" : "",
                        confirmPassword: !confirmPass
                            ? "Parolni qayta kiriting"
                            : confirmPass !== newPass ? "Parollar mos kelmadi" : "",
                    };

                    let hasError = false;
                    Object.keys(errors).forEach((key) => {
                        setFieldError(passwordBox, key, errors[key]);
                        if (errors[key]) hasError = true;
                    });

                    if (hasError) return;

                    if (storage.set(KEYS.auth, { ...creds, password: newPass })) {
                        oldInput.value = "";
                        newInput.value = "";
                        confirmInput.value = "";
                        toast("Parol muvaffaqiyatli yangilandi");
                    }
                });
            }
        }

        /* ---------- Tizim sozlamalari (switchlar) ---------- */
        if (systemBox) {
            const order = ["emailNotify", "autoRefresh", "protectProfile"];
            const labels = {
                emailNotify: "Email bildirishnomalar",
                autoRefresh: "Avtomatik yangilash",
                protectProfile: "Profilni himoyalash",
            };
            const settings = db.settings();

            $$('.switch input[type="checkbox"]', systemBox).forEach((checkbox, i) => {
                const key = order[i];
                if (!key) return;

                checkbox.checked = Boolean(settings[key]);

                checkbox.addEventListener("change", () => {
                    const current = db.settings();
                    current[key] = checkbox.checked;
                    storage.set(KEYS.settings, current);

                    // Himoya o'zgarsa — sessiya qayerda saqlanishini yangilash
                    if (key === "protectProfile") {
                        const session = auth.getSession();
                        if (session) auth.login(session.login);
                    }

                    toast(`${labels[key]}: ${checkbox.checked ? "yoqildi" : "o'chirildi"}`, "info");
                });
            });
        }
    }

    /* ================================================================
       17. ISHGA TUSHIRISH (ROUTER)
    ================================================================ */

    function init() {
        injectStyles();

        const isLoginPage = document.body.classList.contains("login-page");

        if (isLoginPage) {
            initLoginPage();
            return;
        }

        // Himoya: tizimga kirmagan foydalanuvchi login sahifasiga qaytariladi
        if (!auth.isLoggedIn()) {
            location.replace(PAGES.login);
            return;
        }

        // Avval oxirgi saqlangan nusxa bilan darhol chizamiz, keyin serverdan yangilaymiz
        remote.loadLocal();

        initSidebar();

        if ($(".employees-box")) initEmployeesPage();
        if ($(".students-box")) initStudentsPage();
        if ($(".dashboard-statistics")) initDashboardPage();
        if ($(".analytics-cards")) initAnalyticsPage();
        if ($(".settings-box")) initSettingsPage();

        // Server bilan sinxronlash: darhol va har SYNC_MS da (tab ko'rinib turganda)
        remote.sync();
        setInterval(() => {
            if (!document.hidden) remote.sync();
        }, SYNC_MS);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) remote.sync();
        });
    }

    // Boshqa tabda chiqib ketilsa — bu tabni ham login sahifasiga o'tkazish
    window.addEventListener("storage", (e) => {
        if (e.key === KEYS.session && !e.newValue && !document.body.classList.contains("login-page")) {
            if (!auth.isLoggedIn()) location.replace(PAGES.login);
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();