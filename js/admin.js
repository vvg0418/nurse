// Админка: вход по почте и паролю, работа с базой через REST Supabase.
(function () {
  "use strict";
  var C = window.SITE_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var SKEY = "alina_admin_session_" + C.env;
  var session = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function note(node, t, kind) { node.textContent = t || ""; node.className = "note" + (kind ? " " + kind : ""); }
  function fmt(s) { try { return new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function saveSession(s) { session = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {} }
  function loadSession() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function mediaUrl(path) { return C.url + "/storage/v1/object/public/media/" + String(path).split("/").map(encodeURIComponent).join("/"); }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

  // ---------- авторизация ----------
  function auth(path, body) {
    return fetch(C.url + "/auth/v1/" + path, {
      method: "POST", headers: { apikey: C.key, "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.msg || d.error_description || d.message || ("http " + r.status)); e.code = d.error_code || d.code; throw e; }
        return d;
      });
    });
  }
  function storeTokens(d) {
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000 - 60000, email: d.user && d.user.email });
  }
  function ensureFresh() {
    if (!session) return Promise.reject(new Error("no_session"));
    if (Date.now() < session.expires_at) return Promise.resolve();
    return auth("token?grant_type=refresh_token", { refresh_token: session.refresh_token }).then(storeTokens)
      .catch(function (e) { saveSession(null); showLogin("Сессия закончилась, войдите снова."); throw e; });
  }
  function headers(extra) {
    var h = { apikey: C.key, Authorization: "Bearer " + session.access_token };
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }

  // ---------- запросы ----------
  function api(path, opts) {
    opts = opts || {};
    return ensureFresh().then(function () {
      var h = headers({ "Content-Type": "application/json" });
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(C.url + "/rest/v1/" + path, { method: opts.method || "GET", headers: h, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw new Error((d && d.message) || ("http " + r.status));
        return d;
      });
    });
  }
  function upsertTexts(pairs) {
    return api("site_texts?on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: pairs.map(function (p) { return { key: p[0], value: p[1] }; }) });
  }
  function upload(path, blob, type) {
    return ensureFresh().then(function () {
      return fetch(C.url + "/storage/v1/object/media/" + path, { method: "POST",
        headers: headers({ "Content-Type": type || blob.type || "application/octet-stream", "x-upsert": "false" }), body: blob });
    }).then(function (r) { if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || d.error || ("http " + r.status)); }); });
  }
  function removeFile(path) {
    return ensureFresh().then(function () {
      return fetch(C.url + "/storage/v1/object/media/" + path, { method: "DELETE", headers: headers() });
    });
  }

  // кнопка удаления с подтверждением вторым нажатием
  function dangerBtn(label, onConfirm) {
    var b = el("button", "btn danger", label); b.type = "button";
    var armed = false, t = null;
    b.addEventListener("click", function () {
      if (!armed) { armed = true; b.classList.add("armed"); b.textContent = "Точно?"; t = setTimeout(function () { armed = false; b.classList.remove("armed"); b.textContent = label; }, 3500); return; }
      clearTimeout(t); b.disabled = true; onConfirm(b);
    });
    return b;
  }
  function btn(label, cls, onClick) { var b = el("button", "btn " + (cls || ""), label); b.type = "button"; b.addEventListener("click", function () { onClick(b); }); return b; }

  // ---------- вход ----------
  var signup = false;
  function showLogin(msg) {
    $("appView").hidden = true; $("loginView").hidden = false;
    note($("lNote"), msg || "", msg ? "err" : "");
  }
  $("lMode").addEventListener("click", function () {
    signup = !signup;
    $("lPass2Wrap").hidden = !signup;
    $("lBtn").textContent = signup ? "Создать пароль" : "Войти";
    $("lMode").textContent = signup ? "У меня уже есть пароль" : "Первый вход: создать пароль";
    $("lPass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    note($("lNote"), "");
  });
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("lEmail").value.trim(), pass = $("lPass").value;
    if (!email || !pass) { note($("lNote"), "Введите почту и пароль.", "err"); return; }
    if (signup) {
      if (pass.length < 8) { note($("lNote"), "Пароль должен быть не короче 8 символов.", "err"); return; }
      if (pass !== $("lPass2").value) { note($("lNote"), "Пароли не совпадают.", "err"); return; }
    }
    $("lBtn").disabled = true; note($("lNote"), signup ? "Создаю…" : "Вхожу…");
    var p = signup ? auth("signup", { email: email, password: pass }) : auth("token?grant_type=password", { email: email, password: pass });
    p.then(function (d) {
      if (signup) {
        if (d.access_token) { storeTokens(d); return start(); }
        note($("lNote"), "Готово. На почту придёт письмо: нажмите ссылку в нём (страница после клика может не открыться, это нормально), затем войдите с этим паролем.", "ok");
        return;
      }
      storeTokens(d); return start();
    }).catch(function (err) {
      var m = String(err.message || "");
      if (/confirm/i.test(m)) note($("lNote"), "Почта ещё не подтверждена. Найдите письмо от Supabase и нажмите ссылку в нём.", "err");
      else if (/invalid login|invalid_credentials/i.test(m + err.code)) note($("lNote"), "Неверная почта или пароль.", "err");
      else if (/already registered|user_already_exists/i.test(m + err.code)) note($("lNote"), "Эта почта уже зарегистрирована. Нажмите «У меня уже есть пароль» и войдите.", "err");
      else note($("lNote"), "Не получилось: " + m, "err");
    }).then(function () { $("lBtn").disabled = false; });
  });
  $("logout").addEventListener("click", function () { saveSession(null); showLogin(); });

  function start() {
    return api("rpc/is_admin", { method: "POST", body: {} }).then(function (ok) {
      if (ok !== true) { saveSession(null); showLogin("Эта почта пока не в списке админов. Попросите добавить её."); return; }
      $("loginView").hidden = true; $("appView").hidden = false;
      $("whoami").textContent = session.email || "";
      var badge = $("envBadge");
      badge.textContent = C.env === "prod" ? "боевая база" : "тестовая база";
      badge.className = "env" + (C.env === "prod" ? " prod" : "");
      var tab = (location.hash || "").replace("#", "") || "reviews";
      openTab(qa('[data-tab="' + tab + '"]').length ? tab : "reviews");
      refreshBadges();
    }).catch(function () { showLogin("Не получилось проверить доступ. Войдите ещё раз."); });
  }

  // ---------- вкладки ----------
  var loaders = {};
  function openTab(name) {
    qa(".tab").forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === name)); });
    qa("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
    if (loaders[name]) loaders[name]();
  }
  qa(".tab").forEach(function (t) { t.addEventListener("click", function () { openTab(t.getAttribute("data-tab")); }); });

  function refreshBadges() {
    api("reviews?select=kind&approved=eq.false&hidden=eq.false").then(function (rows) {
      var r = 0, w = 0; (rows || []).forEach(function (x) { if (x.kind === "wish") w++; else r++; });
      $("badgeReviews").hidden = !r; $("badgeReviews").textContent = r;
      $("badgeWishes").hidden = !w; $("badgeWishes").textContent = w;
    }).catch(function () {});
  }

  // ---------- отзывы и поздравления ----------
  var filters = { review: "pending", wish: "pending" };
  qa("[data-filter-for]").forEach(function (seg) {
    var kind = seg.getAttribute("data-filter-for");
    qa("button", seg).forEach(function (b) {
      b.addEventListener("click", function () {
        filters[kind] = b.getAttribute("data-f");
        qa("button", seg).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        loadModeration(kind);
      });
    });
  });
  function loadModeration(kind) {
    var list = $(kind === "wish" ? "listWish" : "listReview");
    var f = filters[kind];
    var q = "reviews?select=id,name,text,created_at,approved,hidden&kind=eq." + kind + "&order=created_at.desc&limit=300";
    if (f === "pending") q += "&approved=eq.false&hidden=eq.false";
    if (f === "approved") q += "&approved=eq.true&hidden=eq.false";
    if (f === "hidden") q += "&hidden=eq.true";
    list.textContent = "";
    list.appendChild(el("p", "empty", "Загружаю…"));
    api(q).then(function (rows) {
      list.textContent = "";
      if (!rows || !rows.length) {
        list.appendChild(el("p", "empty", f === "pending" ? "Новых нет, всё проверено." : f === "approved" ? "Пока пусто." : "Скрытых нет."));
        return;
      }
      rows.forEach(function (r) {
        var it = el("div", "item");
        var meta = el("div", "meta");
        meta.appendChild(el("strong", null, r.name));
        meta.appendChild(el("span", null, fmt(r.created_at)));
        meta.appendChild(el("span", "pill " + (r.hidden ? "off" : r.approved ? "on" : "pending"), r.hidden ? "скрыт" : r.approved ? "на сайте" : "ждёт проверки"));
        it.appendChild(meta);
        it.appendChild(el("p", null, r.text));
        var row = el("div", "row");
        if (!r.approved || r.hidden) row.appendChild(btn("Показать", "", function (b) { b.disabled = true; act(r.id, { approved: true, hidden: false }, kind); }));
        if (!r.hidden) row.appendChild(btn("Скрыть", "quiet", function (b) { b.disabled = true; act(r.id, { hidden: true }, kind); }));
        row.appendChild(dangerBtn("Удалить", function () { api("reviews?id=eq." + r.id, { method: "DELETE" }).then(function () { loadModeration(kind); refreshBadges(); }); }));
        it.appendChild(row);
        list.appendChild(it);
      });
    }).catch(function (e) { list.textContent = ""; list.appendChild(el("p", "empty", "Ошибка загрузки: " + e.message)); });
  }
  function act(id, patch, kind) {
    api("reviews?id=eq." + id, { method: "PATCH", prefer: "return=minimal", body: patch })
      .then(function () { loadModeration(kind); refreshBadges(); });
  }
  loaders.reviews = function () { loadModeration("review"); };
  loaders.wishes = function () {
    loadModeration("wish");
    api("site_texts?select=value&key=eq.wishes_reveal_at").then(function (rows) {
      var v = rows && rows[0] && rows[0].value;
      var d = v ? new Date(v) : null;
      if (d && !isNaN(d)) $("wishLead").textContent = "Одобренные поздравления появятся на сайте " + d.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + ". До этого гости видят только их количество.";
    }).catch(function () {});
  };

  // ---------- мысли ----------
  function loadPosts() {
    var list = $("listPosts");
    api("posts?select=id,text,published,created_at&order=created_at.desc").then(function (rows) {
      list.textContent = "";
      if (!rows || !rows.length) { list.appendChild(el("p", "empty", "Записей пока нет.")); return; }
      rows.forEach(function (p) {
        var it = el("div", "item");
        var meta = el("div", "meta");
        meta.appendChild(el("span", null, fmt(p.created_at)));
        meta.appendChild(el("span", "pill " + (p.published ? "on" : "off"), p.published ? "на сайте" : "скрыта"));
        it.appendChild(meta);
        it.appendChild(el("p", null, p.text));
        var row = el("div", "row");
        row.appendChild(btn(p.published ? "Скрыть" : "Показать", "quiet", function () {
          api("posts?id=eq." + p.id, { method: "PATCH", prefer: "return=minimal", body: { published: !p.published } }).then(loadPosts);
        }));
        row.appendChild(dangerBtn("Удалить", function () { api("posts?id=eq." + p.id, { method: "DELETE" }).then(loadPosts); }));
        it.appendChild(row);
        list.appendChild(it);
      });
    });
  }
  $("postForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("postText").value.trim();
    if (!t) { note($("postNote"), "Напишите текст записи.", "err"); return; }
    note($("postNote"), "Публикую…");
    api("posts", { method: "POST", prefer: "return=minimal", body: { text: t } })
      .then(function () { $("postText").value = ""; note($("postNote"), "Запись на сайте.", "ok"); loadPosts(); })
      .catch(function (err) { note($("postNote"), "Не получилось: " + err.message, "err"); });
  });
  loaders.posts = loadPosts;

  // ---------- фото ----------
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (b && b.type === "image/webp") return resolve({ blob: b, ext: "webp" });
          cv.toBlob(function (j) { resolve({ blob: j || file, ext: j ? "jpg" : (file.name.split(".").pop() || "jpg") }); }, "image/jpeg", .85);
        }, "image/webp", .85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve({ blob: file, ext: (file.name.split(".").pop() || "jpg").toLowerCase() }); };
      img.src = url;
    });
  }
  $("photoFiles").addEventListener("change", function () {
    var files = Array.prototype.slice.call(this.files || []);
    var input = this;
    if (!files.length) return;
    var prog = $("photoProg"); prog.hidden = false; prog.max = files.length; prog.value = 0;
    var ok = 0, fail = 0;
    note($("photoNote"), "Загружаю 0 из " + files.length + "…");
    files.reduce(function (p, f) {
      return p.then(function () {
        return shrink(f).then(function (s) {
          var path = "gallery/" + uuid() + "." + s.ext;
          return upload(path, s.blob).then(function () {
            return api("gallery", { method: "POST", prefer: "return=minimal", body: { path: path, caption: "" } });
          });
        }).then(function () { ok++; }, function () { fail++; }).then(function () {
          prog.value = ok + fail; note($("photoNote"), "Загружаю " + (ok + fail) + " из " + files.length + "…");
        });
      });
    }, Promise.resolve()).then(function () {
      prog.hidden = true; input.value = "";
      note($("photoNote"), "Загружено: " + ok + (fail ? ", не получилось: " + fail : "") + ".", fail ? "err" : "ok");
      loadPhotos();
    });
  });
  function loadPhotos() {
    var list = $("listPhotos");
    api("gallery?select=id,path,caption,sort&order=sort.asc,created_at.desc").then(function (rows) {
      list.textContent = "";
      if (!rows || !rows.length) { list.appendChild(el("p", "empty", "Фото пока нет.")); return; }
      rows.forEach(function (g) {
        var t = el("div", "thumb");
        var img = el("img"); img.src = mediaUrl(g.path); img.alt = g.caption || ""; img.loading = "lazy";
        t.appendChild(img);
        var s = el("div", "stack");
        var cap = el("input"); cap.type = "text"; cap.maxLength = 300; cap.placeholder = "Подпись"; cap.value = g.caption || ""; cap.setAttribute("aria-label", "Подпись");
        s.appendChild(cap);
        var row = el("div", "row");
        row.appendChild(btn("Сохранить", "quiet", function (b) {
          b.disabled = true;
          api("gallery?id=eq." + g.id, { method: "PATCH", prefer: "return=minimal", body: { caption: cap.value.trim() } })
            .then(function () { b.textContent = "Сохранено"; }).catch(function () { b.textContent = "Ошибка"; })
            .then(function () { setTimeout(function () { b.disabled = false; b.textContent = "Сохранить"; }, 1500); });
        }));
        row.appendChild(dangerBtn("Удалить", function () {
          removeFile(g.path).then(function () { return api("gallery?id=eq." + g.id, { method: "DELETE" }); }).then(loadPhotos);
        }));
        s.appendChild(row);
        t.appendChild(s);
        list.appendChild(t);
      });
    });
  }
  loaders.photos = loadPhotos;

  // ---------- голоса ----------
  $("voiceForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("voiceName").value.trim(), f = $("voiceFile").files[0];
    if (!name || !f) { note($("voiceNoteMsg"), "Укажите, кто записал, и выберите файл.", "err"); return; }
    if (f.size > 50 * 1024 * 1024) { note($("voiceNoteMsg"), "Файл больше 50 МБ. Сожмите его или обрежьте.", "err"); return; }
    var media = /^video\//.test(f.type) ? "video" : "audio";
    var ext = (f.name.split(".").pop() || (media === "video" ? "mp4" : "m4a")).toLowerCase().replace(/[^a-z0-9]/g, "");
    var path = "voices/" + uuid() + "." + ext;
    note($("voiceNoteMsg"), "Загружаю…");
    upload(path, f, f.type || (media === "video" ? "video/mp4" : "audio/mp4"))
      .then(function () { return api("greetings", { method: "POST", prefer: "return=minimal", body: { name: name, note: $("voiceNote").value.trim(), path: path, media: media } }); })
      .then(function () { $("voiceForm").reset(); note($("voiceNoteMsg"), "Загружено, уже на сайте.", "ok"); loadVoices(); })
      .catch(function (err) { note($("voiceNoteMsg"), "Не получилось: " + err.message, "err"); });
  });
  function loadVoices() {
    var list = $("listVoices");
    api("greetings?select=id,name,note,path,media,sort&order=sort.asc,created_at.asc").then(function (rows) {
      list.textContent = "";
      if (!rows || !rows.length) { list.appendChild(el("p", "empty", "Записей пока нет.")); return; }
      rows.forEach(function (g) {
        var it = el("div", "item");
        var meta = el("div", "meta"); meta.appendChild(el("strong", null, g.name)); if (g.note) meta.appendChild(el("span", null, g.note));
        meta.appendChild(el("span", "pill", g.media === "video" ? "видео" : "аудио"));
        it.appendChild(meta);
        var m = el(g.media === "video" ? "video" : "audio"); m.controls = true; m.preload = "none"; m.src = mediaUrl(g.path); m.style.width = "100%";
        it.appendChild(m);
        var row = el("div", "row");
        row.appendChild(dangerBtn("Удалить", function () {
          removeFile(g.path).then(function () { return api("greetings?id=eq." + g.id, { method: "DELETE" }); }).then(loadVoices);
        }));
        it.appendChild(row);
        list.appendChild(it);
      });
    });
  }
  loaders.voices = loadVoices;

  // ---------- квиз ----------
  function resetQuizForm() {
    $("quizId").value = ""; $("quizQ").value = ""; $("quizOpts").value = ""; $("quizAns").value = 1;
    $("quizSave").textContent = "Добавить вопрос"; $("quizCancel").hidden = true;
  }
  $("quizCancel").addEventListener("click", resetQuizForm);
  $("quizForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("quizQ").value.trim();
    var opts = $("quizOpts").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var ans = parseInt($("quizAns").value, 10) - 1;
    if (!q) { note($("quizNote"), "Напишите вопрос.", "err"); return; }
    if (opts.length < 2 || opts.length > 6) { note($("quizNote"), "Нужно от 2 до 6 вариантов, каждый с новой строки.", "err"); return; }
    if (!(ans >= 0 && ans < opts.length)) { note($("quizNote"), "Номер правильного ответа должен быть от 1 до " + opts.length + ".", "err"); return; }
    var body = { question: q, options: opts, answer: ans, sort: parseInt($("quizSort").value, 10) || 0 };
    var id = $("quizId").value;
    var p = id ? api("quiz_questions?id=eq." + id, { method: "PATCH", prefer: "return=minimal", body: body })
               : api("quiz_questions", { method: "POST", prefer: "return=minimal", body: body });
    p.then(function () { note($("quizNote"), id ? "Вопрос обновлён." : "Вопрос добавлен.", "ok"); resetQuizForm(); loadQuiz(); })
     .catch(function (err) { note($("quizNote"), "Не получилось: " + err.message, "err"); });
  });
  function loadQuiz() {
    var list = $("listQuiz");
    api("quiz_questions?select=id,question,options,answer,sort&order=sort.asc,created_at.asc").then(function (rows) {
      list.textContent = "";
      if (!rows || !rows.length) { list.appendChild(el("p", "empty", "Вопросов нет, поэтому квиза на сайте не видно.")); return; }
      rows.forEach(function (q, i) {
        var it = el("div", "item");
        it.appendChild(el("strong", null, (i + 1) + ". " + q.question));
        var ol = el("div", "meta");
        q.options.forEach(function (o, j) { ol.appendChild(el("span", "pill" + (j === q.answer ? " on" : ""), o)); });
        it.appendChild(ol);
        var row = el("div", "row");
        row.appendChild(btn("Изменить", "quiet", function () {
          $("quizId").value = q.id; $("quizQ").value = q.question; $("quizOpts").value = q.options.join("\n");
          $("quizAns").value = q.answer + 1; $("quizSort").value = q.sort || 0;
          $("quizSave").textContent = "Сохранить вопрос"; $("quizCancel").hidden = false;
          $("quizForm").scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        row.appendChild(dangerBtn("Удалить", function () { api("quiz_questions?id=eq." + q.id, { method: "DELETE" }).then(loadQuiz); }));
        it.appendChild(row);
        list.appendChild(it);
      });
    });
  }
  var clearBtn = $("quizClear");
  clearBtn.addEventListener("click", (function () {
    var armed = false, t = null;
    return function () {
      if (!armed) { armed = true; clearBtn.classList.add("armed"); clearBtn.textContent = "Точно очистить?"; t = setTimeout(function () { armed = false; clearBtn.classList.remove("armed"); clearBtn.textContent = "Очистить таблицу"; }, 3500); return; }
      clearTimeout(t); armed = false; clearBtn.classList.remove("armed"); clearBtn.textContent = "Очистить таблицу";
      api("quiz_scores?id=not.is.null", { method: "DELETE" }).then(function () { note($("quizClearNote"), "Таблица результатов очищена.", "ok"); })
        .catch(function (err) { note($("quizClearNote"), "Не получилось: " + err.message, "err"); });
    };
  })());
  loaders.quiz = loadQuiz;

  // ---------- письмо ----------
  function loadLetter() {
    api("site_texts?select=key,value&key=in.(secret_letter_text,letter_hint,secret_letter_hashes)").then(function (rows) {
      var m = {}; (rows || []).forEach(function (r) { m[r.key] = r.value; });
      $("letterText").value = m.secret_letter_text || "";
      $("letterHint").value = m.letter_hint || "";
      var n = (m.secret_letter_hashes || "").split(",").filter(Boolean).length;
      $("letterCodesState").textContent = (n ? "Сейчас задано кодовых слов: " + n + ". " : "Кодовые слова ещё не заданы. ") + "Регистр и лишние пробелы не важны. Оставьте поле пустым, чтобы не менять текущие коды.";
    });
  }
  $("letterForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var codes = $("letterCodes").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    note($("letterNote"), "Сохраняю…");
    upsertTexts([["secret_letter_text", $("letterText").value], ["letter_hint", $("letterHint").value.trim()]])
      .then(function () { return codes.length ? api("rpc/set_letter_codes", { method: "POST", body: { codes: codes } }) : null; })
      .then(function () { $("letterCodes").value = ""; note($("letterNote"), "Письмо сохранено.", "ok"); loadLetter(); })
      .catch(function (err) { note($("letterNote"), "Не получилось: " + err.message, "err"); });
  });
  loaders.letter = loadLetter;

  // ---------- тексты ----------
  var EXTRA = [
    { key: "hero_name", label: "Имя на первом экране (латиницей смотрится как в референсе)", def: "alina" },
    { key: "bday_title", label: "Подпись на первом экране в день рождения", def: "С днём рождения, Алиночка!" }
  ];
  function htmlToText(node) {
    var c = node.cloneNode(true);
    qa("br", c).forEach(function (b) { b.replaceWith("\n"); });
    return c.textContent.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }
  function loadTexts() {
    var box = $("textFields");
    Promise.all([
      fetch("./index.html", { cache: "no-store" }).then(function (r) { return r.text(); }),
      api("site_texts?select=key,value")
    ]).then(function (res) {
      var doc = new DOMParser().parseFromString(res[0], "text/html");
      var cur = {}; (res[1] || []).forEach(function (r) { cur[r.key] = r.value; });
      var fields = [], seen = {};
      EXTRA.forEach(function (x) { fields.push(x); seen[x.key] = true; });
      qa("[data-text]", doc).forEach(function (n) {
        var k = n.getAttribute("data-text");
        if (seen[k]) return; seen[k] = true;
        fields.push({ key: k, label: n.getAttribute("data-label") || k, def: htmlToText(n) });
      });
      box.textContent = "";
      fields.forEach(function (f) {
        var wrap = el("div", "text-field");
        var has = Object.prototype.hasOwnProperty.call(cur, f.key);
        var lab = el("label", null, f.label);
        var ta = el("textarea"); ta.value = has ? cur[f.key] : f.def; ta.rows = Math.min(6, Math.max(1, (ta.value.match(/\n/g) || []).length + 1));
        ta.style.minHeight = "0";
        lab.appendChild(ta);
        wrap.appendChild(lab);
        var row = el("div", "row");
        var mark = el("span", "changed", has ? "изменено" : ""); row.appendChild(mark);
        var st = el("span", "note");
        row.appendChild(st);
        row.appendChild(btn("Как было", "quiet", function () {
          api("site_texts?key=eq." + encodeURIComponent(f.key), { method: "DELETE" }).then(function () { ta.value = f.def; mark.textContent = ""; note(st, "Вернул исходный текст.", "ok"); });
        }));
        row.appendChild(btn("Сохранить", "", function (b) {
          b.disabled = true;
          upsertTexts([[f.key, ta.value]]).then(function () { mark.textContent = "изменено"; note(st, "Сохранено.", "ok"); })
            .catch(function (err) { note(st, "Ошибка: " + err.message, "err"); }).then(function () { b.disabled = false; });
        }));
        wrap.appendChild(row);
        box.appendChild(wrap);
      });
    }).catch(function (err) { box.textContent = ""; box.appendChild(el("p", "empty", "Не получилось загрузить тексты: " + err.message)); });
  }
  loaders.texts = loadTexts;

  // ---------- настройки ----------
  function toLocalInput(v) {
    var d = new Date(v); if (isNaN(d)) return "";
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function loadSettings() {
    api("site_texts?select=key,value&key=in.(auto_approve,wishes_reveal_at,contact_telegram,contact_instagram,contact_phone)").then(function (rows) {
      var m = {}; (rows || []).forEach(function (r) { m[r.key] = r.value; });
      $("setAuto").checked = m.auto_approve === "true";
      $("setReveal").value = toLocalInput(m.wishes_reveal_at || "2026-11-01T00:00:00+04:00");
      $("setTg").value = m.contact_telegram || ""; $("setIg").value = m.contact_instagram || ""; $("setPhone").value = m.contact_phone || "";
    });
  }
  $("setForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var rv = $("setReveal").value ? new Date($("setReveal").value) : null;
    var pairs = [["auto_approve", $("setAuto").checked ? "true" : "false"],
      ["contact_telegram", $("setTg").value.trim()], ["contact_instagram", $("setIg").value.trim()], ["contact_phone", $("setPhone").value.trim()]];
    if (rv && !isNaN(rv)) pairs.push(["wishes_reveal_at", rv.toISOString()]);
    note($("setNote"), "Сохраняю…");
    upsertTexts(pairs).then(function () { note($("setNote"), "Настройки сохранены.", "ok"); })
      .catch(function (err) { note($("setNote"), "Не получилось: " + err.message, "err"); });
  });
  loaders.settings = loadSettings;

  // ---------- старт ----------
  session = loadSession();
  if (session) start(); else showLogin();
})();
