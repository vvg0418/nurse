// Живые разделы сайта: тексты из базы, день рождения, отзывы и поздравления,
// лайки, письмо, квиз, мысли, галерея, голоса друзей, пасхалки.
(function () {
  "use strict";
  var C = window.SITE_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TEXTS = {};

  // ---------- мелочи ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  var CID = store("alina_cid");
  if (!CID) { CID = uuid(); store("alina_cid", CID); }
  var liked = {};
  (store("alina_liked") || []).forEach(function (id) { liked[id] = true; });

  function plural(n, forms) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return ""; }
  }
  var refreshTimer = null;
  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (window.SiteFx) window.SiteFx.refresh(); }, 120);
  }
  function show(node, on) { if (node) node.hidden = !on; }

  // ---------- запросы к базе ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = { apikey: C.key, "Content-Type": "application/json" };
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(C.url + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 204 || r.status === 201) return null;
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((data && data.message) || ("http " + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }
  function rpc(name, args) { return api("rpc/" + name, { method: "POST", body: args || {} }); }
  function mediaUrl(path) {
    return C.url + "/storage/v1/object/public/media/" + String(path).split("/").map(encodeURIComponent).join("/");
  }
  function isRate(err) { return err && /rate_limited/.test(err.message); }

  // ---------- тексты ----------
  function setText(node, value) {
    node.textContent = "";
    String(value).split("\n").forEach(function (line, i) {
      if (i) node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(line));
    });
  }
  function applyTexts() {
    qa("[data-text]").forEach(function (node) {
      var key = node.getAttribute("data-text");
      if (!Object.prototype.hasOwnProperty.call(TEXTS, key)) return;
      var v = TEXTS[key];
      setText(node, v);
      if (node.hasAttribute("data-hide-empty")) {
        var item = node.closest(".gang__list_item");
        if (item) item.hidden = !String(v).trim();
      }
    });
    var name = TEXTS.hero_name;
    if (name && name.trim()) {
      var h = $("heroName");
      h.setAttribute("aria-label", name.trim());
      h.textContent = "";
      splitName(name.trim()).forEach(function (part) { h.appendChild(el("span", null, part)); });
    }
  }
  function splitName(s) {
    if (s.length <= 3) return [s];
    var a = Math.ceil(s.length / 3), b = Math.ceil((s.length - a) / 2);
    return [s.slice(0, a), s.slice(a, a + b), s.slice(a + b)];
  }

  // ---------- конфетти ----------
  var Confetti = (function () {
    var cv = $("confetti"), ctx = cv && cv.getContext ? cv.getContext("2d") : null;
    var parts = [], running = false, W = 0, H = 0, dpr = 1;
    var colors = ["#ff3d8b", "#ff7ab0", "#ffd1e3", "#ffffff", "#dc1469"];
    function size() {
      if (!cv) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", size);
    function heart(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * .3);
      ctx.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3);
      ctx.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .8, x, y + s);
      ctx.bezierCurveTo(x, y + s * .8, x + s * .5, y + s * .6, x + s * .5, y + s * .3);
      ctx.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3);
      ctx.fill();
    }
    function loop() {
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter(function (p) { return p.life > 0 && p.y < H + 40; });
      parts.forEach(function (p) {
        p.vy += p.g; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 40);
        ctx.fillStyle = p.c;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.heart) heart(0, -p.s / 2, p.s);
        else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (parts.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, W, H); }
    }
    function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
    return {
      burst: function (n, x, y, hearts) {
        if (!ctx || reduce) return;
        if (!W) size();
        x = x == null ? W / 2 : x; y = y == null ? H * .35 : y;
        for (var i = 0; i < (n || 120); i++) {
          var a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
          parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, g: .22, s: 8 + Math.random() * 10,
            c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 160 + Math.random() * 80,
            heart: hearts ? true : Math.random() < .25 });
        }
        start();
      },
      rain: function (ms, hearts) {
        if (!ctx || reduce) return;
        if (!W) size();
        var until = Date.now() + (ms || 3000);
        (function drop() {
          for (var i = 0; i < 6; i++) {
            parts.push({ x: Math.random() * W, y: -20, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, g: .04,
              s: 10 + Math.random() * 14, c: colors[Math.floor(Math.random() * colors.length)], rot: 0,
              vr: (Math.random() - .5) * .05, life: 400, heart: hearts !== false });
          }
          start();
          if (Date.now() < until) setTimeout(drop, 90);
        })();
      }
    };
  })();
  window.Confetti = Confetti;

  // ---------- день рождения ----------
  var now = new Date();
  var forcedBday = /^#bday$/.test(location.hash);
  var isBday = forcedBday || (now.getMonth() === 10 && now.getDate() === 1);
  function daysToBday() {
    var y = now.getFullYear();
    var next = new Date(y, 10, 1);
    var today = new Date(y, now.getMonth(), now.getDate());
    if (next < today) next = new Date(y + 1, 10, 1);
    return Math.round((next - today) / 86400000);
  }
  var celebrated = false;
  function applyBirthday() {
    var meta = $("heroMeta");
    var d = daysToBday();
    if (isBday) {
      document.documentElement.classList.add("is-bday");
      setText($("heroSub"), TEXTS.bday_title || "С днём рождения, Алиночка!");
      meta.textContent = "сегодня твой день";
      var fb = $("floatBtn"); fb.textContent = "Поздравить"; fb.setAttribute("href", "#wishes");
      if (celebrated) return;
      celebrated = true;
      var fire = function () {
        Confetti.burst(180);
        setTimeout(function () { Confetti.rain(4500, true); }, 600);
      };
      if (window.SiteFx && window.SiteFx.introDone) fire();
      else document.addEventListener("site:intro", fire, { once: true });
    } else if (d > 0 && d <= 60) {
      meta.textContent = "до дня рождения " + d + " " + plural(d, ["день", "дня", "дней"]);
    }
  }

  // ---------- комплимент дня ----------
  var COMPLIMENTS = [
    "Ты делаешь мир спокойнее одним своим присутствием.",
    "Рядом с тобой даже длинная смена кажется короче.",
    "У тебя самые бережные руки и самое доброе сердце.",
    "Твоя улыбка лечит не хуже лекарств.",
    "Ты умеешь услышать то, что человек не сказал вслух.",
    "С тобой спокойно, и это редкий дар.",
    "Ты сильнее, чем думаешь, и нежнее, чем кажется.",
    "Твоя забота согревает даже тех, кто об этом не просил.",
    "Ты делаешь сложное спокойно, а это настоящее мастерство.",
    "У тебя потрясающее чувство юмора, которое спасает любой день.",
    "Ты выглядишь прекрасно даже после ночной смены.",
    "Твоё «всё будет хорошо» звучит как обещание, которое сбудется.",
    "Люди запоминают тебя надолго, потому что ты настоящая.",
    "Ты умеешь быть рядом так, что становится легче.",
    "Твоя доброта не громкая, но её чувствуют все.",
    "Ты пример того, как работать с сердцем.",
    "С тобой хочется смеяться и делиться самым важным.",
    "Ты замечаешь мелочи, из которых и складывается забота.",
    "Твоё спокойствие заразительно, и это прекрасно.",
    "Ты заслуживаешь столько же тепла, сколько отдаёшь.",
    "Ты светишься, даже когда устала.",
    "С тобой любой день становится чуточку лучше.",
    "Ты умеешь поддержать одним словом.",
    "Тебе невероятно идёт быть собой.",
    "Ты особенная, и это видно сразу.",
    "Твоя смелость тихая, но очень настоящая.",
    "Ты одна из тех людей, благодаря которым верится в хорошее.",
    "У тебя красивые глаза и ещё более красивая душа.",
    "Ты превращаешь заботу в искусство.",
    "Спасибо, что ты такая, какая есть."
  ];
  function initCompliment() {
    var t = $("compText"), btn = $("compNext");
    var start = new Date(now.getFullYear(), 0, 0);
    var day = Math.floor((now - start) / 86400000);
    var idx = day % COMPLIMENTS.length;
    t.textContent = COMPLIMENTS[idx];
    btn.addEventListener("click", function () {
      var next = idx;
      while (next === idx) next = Math.floor(Math.random() * COMPLIMENTS.length);
      idx = next;
      t.classList.add("swap");
      setTimeout(function () { t.textContent = COMPLIMENTS[idx]; t.classList.remove("swap"); }, 300);
      var r = btn.getBoundingClientRect();
      Confetti.burst(40, r.left + r.width / 2, r.top, true);
    });
  }

  // ---------- лайки ----------
  var LIKES = {};
  function loadLikes() {
    return rpc("like_counts").then(function (rows) {
      LIKES = {};
      (rows || []).forEach(function (r) { LIKES[r.review_id] = Number(r.likes) || 0; });
    }).catch(function () {});
  }
  function likeButton(id) {
    var b = el("button", "like" + (liked[id] ? " on" : ""));
    b.type = "button";
    b.setAttribute("aria-label", "Нравится");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>';
    var n = el("span", null, String(LIKES[id] || 0));
    b.appendChild(n);
    b.addEventListener("click", function () {
      b.classList.add("pop"); setTimeout(function () { b.classList.remove("pop"); }, 220);
      if (liked[id]) return;
      liked[id] = true;
      store("alina_liked", Object.keys(liked).slice(-500));
      b.classList.add("on");
      n.textContent = String((LIKES[id] || 0) + 1);
      var r = b.getBoundingClientRect();
      Confetti.burst(18, r.left + r.width / 2, r.top, true);
      rpc("like_review", { rid: id, cid: CID }).then(function (cnt) {
        if (typeof cnt === "number") { LIKES[id] = cnt; n.textContent = String(cnt); }
      }).catch(function () {});
    });
    return b;
  }

  // ---------- формы отзывов и поздравлений ----------
  function setupForm(cfg) {
    var shownAt = Date.now();
    function note(t, err) { cfg.note.textContent = t || ""; cfg.note.className = "note" + (err ? " err" : ""); }
    cfg.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = cfg.text.value.trim();
      var name = cfg.name.value.trim().slice(0, 60) || "Гость";
      if (text.length < 5) { note("Напишите хотя бы пару слов.", true); return; }
      if (cfg.hp.value || Date.now() - shownAt < 2500) {
        cfg.text.value = ""; note(cfg.okPending()); return;
      }
      cfg.btn.disabled = true; note("Отправляю…");
      api("reviews", { method: "POST", prefer: "return=minimal",
        body: { name: name, text: text.slice(0, 600), kind: cfg.kind, client_id: CID } })
        .then(function () {
          cfg.text.value = "";
          var auto = TEXTS.auto_approve === "true";
          note(auto ? cfg.okPublished() : cfg.okPending());
          var r = cfg.btn.getBoundingClientRect();
          Confetti.burst(60, r.left + r.width / 2, r.top, true);
          if (cfg.after) cfg.after();
        })
        .catch(function (err) {
          note(isRate(err) ? "Слишком много сообщений подряд. Попробуйте через 10 минут." : "Не получилось отправить. Попробуйте ещё раз чуть позже.", true);
        })
        .then(function () { cfg.btn.disabled = false; });
    });
  }

  // ---------- отзывы ----------
  function loadReviews() {
    var list = $("rlist");
    return Promise.all([api("reviews?select=id,name,text,created_at&kind=eq.review&order=created_at.desc&limit=100"), loadLikes()])
      .then(function (res) {
        var rows = res[0] || [];
        list.textContent = "";
        if (!rows.length) { list.appendChild(el("p", "empty", "Здесь появятся добрые слова. Будьте первым, кто оставит отзыв.")); refresh(); return; }
        rows.forEach(function (d) {
          var box = el("article", "rev");
          box.appendChild(el("q", null, String(d.text || "")));
          var who = el("div", "who");
          who.appendChild(el("strong", null, String(d.name || "Гость")));
          who.appendChild(el("span", null, fmtDate(d.created_at)));
          who.appendChild(likeButton(d.id));
          box.appendChild(who);
          list.appendChild(box);
        });
        refresh();
      })
      .catch(function () { list.textContent = ""; list.appendChild(el("p", "empty", "Не получилось загрузить отзывы. Обновите страницу.")); });
  }

  // ---------- стена поздравлений ----------
  function revealAt() {
    var t = Date.parse(TEXTS.wishes_reveal_at || "");
    return isNaN(t) ? Date.parse("2026-11-01T00:00:00+04:00") : t;
  }
  function revealLabel() {
    try { return new Date(revealAt()).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); } catch (e) { return "1 ноября"; }
  }
  var wishesCelebrated = false;
  function loadWishes() {
    var teaser = $("wishTeaser"), wall = $("wishWall");
    var revealed = Date.now() >= revealAt();
    if (!revealed) {
      show(wall, false);
      return rpc("wishes_count").then(function (n) {
        n = Number(n) || 0;
        teaser.textContent = "";
        if (n > 0) {
          teaser.appendChild(document.createTextNode("Уже "));
          teaser.appendChild(el("b", null, n + " " + plural(n, ["поздравление", "поздравления", "поздравлений"])));
          teaser.appendChild(document.createTextNode(" " + plural(n, ["ждёт", "ждут", "ждут"]) + " " + revealLabel() + ". Они откроются в день рождения."));
        } else {
          teaser.textContent = "Поздравления откроются " + revealLabel() + ". Оставьте своё первым.";
        }
        show(teaser, true); refresh();
      }).catch(function () { show(teaser, false); });
    }
    return Promise.all([api("reviews?select=id,name,text,created_at&kind=eq.wish&order=created_at.asc&limit=300"), loadLikes()])
      .then(function (res) {
        var rows = res[0] || [];
        wall.textContent = "";
        if (!rows.length) {
          teaser.textContent = "Здесь соберутся поздравления. Оставьте первое.";
          show(teaser, true); show(wall, false); refresh(); return;
        }
        show(teaser, false);
        rows.forEach(function (d) {
          var w = el("div", "wish");
          w.appendChild(el("q", null, String(d.text || "")));
          var who = el("div", "who");
          who.appendChild(el("strong", null, String(d.name || "Гость")));
          who.appendChild(likeButton(d.id));
          w.appendChild(who);
          wall.appendChild(w);
        });
        show(wall, true); refresh();
        if (!wishesCelebrated && "IntersectionObserver" in window) {
          var io = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
              if (e.isIntersecting && !wishesCelebrated) { wishesCelebrated = true; Confetti.burst(140); io.disconnect(); }
            });
          }, { threshold: .2 });
          io.observe(wall);
        }
      })
      .catch(function () { show(wall, false); });
  }

  // ---------- секретное письмо ----------
  function initLetter() {
    var form = $("lform"), input = $("lcode"), btn = $("lopen"), noteEl = $("lnote"), env = $("envelope"), paper = $("letterPaper");
    function note(t, err) { noteEl.textContent = t || ""; noteEl.className = "note" + (err ? " err" : ""); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = input.value.trim();
      if (!code) { note("Введите кодовое слово.", true); return; }
      btn.disabled = true; note("Проверяю…");
      rpc("open_letter", { code: code }).then(function (text) {
        if (text === null || text === undefined) {
          note("Не то слово. Попробуй ещё раз.", true);
          env.classList.remove("shake"); void env.offsetWidth; env.classList.add("shake");
          return;
        }
        note("");
        env.classList.add("open");
        setTimeout(function () {
          paper.textContent = text || "Письмо пока пустое.";
          show(paper, true);
          form.hidden = true;
          refresh();
          Confetti.rain(3500, true);
          setTimeout(function () {
            if (window.SiteFx && window.SiteFx.lenis) window.SiteFx.lenis.scrollTo(paper, { offset: -80, duration: 1.6 });
            else paper.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
        }, 1300);
      }).catch(function (err) {
        note(isRate(err) ? "Слишком много попыток. Подожди минутку." : "Не получилось проверить. Попробуй ещё раз.", true);
      }).then(function () { btn.disabled = false; });
    });
  }

  // ---------- квиз ----------
  function initQuiz(questions) {
    var sec = $("quiz"), card = $("quizCard");
    if (!questions || !questions.length) { show(sec, false); return; }
    show(sec, true);
    var idx = 0, score = 0;
    function progress() {
      var p = el("div", "quiz-progress");
      questions.forEach(function (_, i) { p.appendChild(el("i", i < idx ? "on" : "")); });
      return p;
    }
    function renderQ() {
      var q = questions[idx];
      card.textContent = "";
      card.appendChild(progress());
      card.appendChild(el("p", "kicker", "вопрос " + (idx + 1) + " из " + questions.length));
      card.appendChild(el("p", "quiz-q", q.question));
      var opts = el("div", "quiz-opts");
      var foot = el("div", "quiz-foot");
      var next = el("button", "btn", idx + 1 < questions.length ? "Дальше" : "Узнать результат");
      next.type = "button"; next.hidden = true;
      (q.options || []).forEach(function (text, i) {
        var b = el("button", "quiz-opt", text); b.type = "button";
        b.addEventListener("click", function () {
          qa(".quiz-opt", opts).forEach(function (x, j) {
            x.disabled = true;
            if (j === q.answer) x.classList.add("right");
          });
          if (i === q.answer) { score++; var r = b.getBoundingClientRect(); Confetti.burst(30, r.left + r.width / 2, r.top, true); }
          else b.classList.add("wrong");
          next.hidden = false; next.focus();
        });
        opts.appendChild(b);
      });
      next.addEventListener("click", function () { idx++; if (idx < questions.length) renderQ(); else renderResult(); });
      foot.appendChild(next);
      card.appendChild(opts); card.appendChild(foot);
      refresh();
    }
    function verdict() {
      var r = score / questions.length;
      if (r === 1) return "Идеально! Ты знаешь Алину лучше всех.";
      if (r >= .7) return "Отлично! Вы точно близки.";
      if (r >= .4) return "Неплохо, но есть что узнать.";
      return "Пора чаще болтать с Алиной!";
    }
    function renderResult() {
      idx = questions.length;
      card.textContent = "";
      card.appendChild(progress());
      card.appendChild(el("p", "quiz-result", score + " из " + questions.length));
      card.appendChild(el("p", "p_text", verdict()));
      if (score === questions.length) Confetti.burst(160);
      var save = el("form", "quiz-save");
      var inp = el("input"); inp.type = "text"; inp.maxLength = 40; inp.placeholder = "Ваше имя для таблицы"; inp.setAttribute("aria-label", "Ваше имя");
      var sb = el("button", "btn", "Сохранить результат"); sb.type = "submit";
      var again = el("button", "btn", "Сыграть ещё"); again.type = "button";
      again.style.background = "transparent"; again.style.color = "var(--pink)";
      var n = el("p", "note");
      save.appendChild(inp); save.appendChild(sb);
      card.appendChild(save); card.appendChild(n);
      var foot = el("div", "quiz-foot"); foot.appendChild(again); card.appendChild(foot);
      save.addEventListener("submit", function (e) {
        e.preventDefault();
        sb.disabled = true; n.textContent = "Сохраняю…"; n.className = "note";
        api("quiz_scores", { method: "POST", prefer: "return=minimal",
          body: { name: inp.value.trim().slice(0, 40) || "Гость", score: score, total: questions.length, client_id: CID } })
          .then(function () { n.textContent = "Результат в таблице!"; save.hidden = true; loadTop(); })
          .catch(function (err) {
            n.textContent = isRate(err) ? "Слишком много попыток подряд, попробуйте позже." : "Не получилось сохранить.";
            n.className = "note err"; sb.disabled = false;
          });
      });
      again.addEventListener("click", function () { idx = 0; score = 0; renderQ(); });
      refresh();
    }
    renderQ();
    loadTop();
  }
  function loadTop() {
    var top = $("quizTop");
    return api("quiz_scores?select=name,score,total,created_at&order=score.desc,created_at.asc&limit=10").then(function (rows) {
      top.textContent = "";
      if (!rows || !rows.length) { var li = el("li"); li.appendChild(el("span", "muted", "Пока никто не играл")); top.appendChild(li); return; }
      rows.forEach(function (r) {
        var li = el("li");
        li.appendChild(el("span", null, r.name));
        li.appendChild(el("b", null, r.score + " / " + r.total));
        top.appendChild(li);
      });
      refresh();
    }).catch(function () {});
  }

  // ---------- мысли, галерея, голоса ----------
  function loadPosts() {
    return api("posts?select=text,created_at&order=created_at.desc&limit=30").then(function (rows) {
      var list = $("postsList"); list.textContent = "";
      if (!rows || !rows.length) { show($("thoughts"), false); return; }
      rows.forEach(function (p) {
        var c = el("article", "post card");
        c.appendChild(el("p", null, p.text));
        var t = el("time", null, fmtDate(p.created_at)); t.dateTime = p.created_at;
        c.appendChild(t);
        list.appendChild(c);
      });
      show($("thoughts"), true); refresh();
    }).catch(function () {});
  }
  function loadGallery() {
    return api("gallery?select=path,caption&order=sort.asc,created_at.desc&limit=200").then(function (rows) {
      var grid = $("galleryGrid"); grid.textContent = "";
      if (!rows || !rows.length) { show($("gallery"), false); return; }
      rows.forEach(function (g) {
        var f = el("figure");
        var img = el("img"); img.src = mediaUrl(g.path); img.alt = g.caption || "Фото Алины"; img.loading = "lazy"; img.decoding = "async";
        img.addEventListener("load", refresh);
        f.appendChild(img);
        if (g.caption) f.appendChild(el("figcaption", null, g.caption));
        grid.appendChild(f);
      });
      show($("gallery"), true); refresh();
    }).catch(function () {});
  }
  function loadVoices() {
    return api("greetings?select=name,note,path,media&order=sort.asc,created_at.asc&limit=100").then(function (rows) {
      var list = $("voicesList"); list.textContent = "";
      if (!rows || !rows.length) { show($("voices"), false); return; }
      rows.forEach(function (g) {
        var c = el("article", "voice card");
        c.appendChild(el("strong", null, g.name));
        if (g.note) c.appendChild(el("span", null, g.note));
        var m = el(g.media === "video" ? "video" : "audio");
        m.controls = true; m.preload = "none"; m.src = mediaUrl(g.path);
        if (g.media === "video") { m.setAttribute("playsinline", ""); m.preload = "metadata"; }
        c.appendChild(m);
        list.appendChild(c);
      });
      show($("voices"), true); refresh();
    }).catch(function () {});
  }

  // ---------- контакты ----------
  function initContacts() {
    var items = [
      { key: "contact_telegram", label: "Telegram", link: function (v) { return "https://t.me/" + v.replace(/^@/, ""); } },
      { key: "contact_instagram", label: "Instagram", link: function (v) { return "https://instagram.com/" + v.replace(/^@/, ""); } },
      { key: "contact_phone", label: "Телефон", link: null }
    ].filter(function (c) { return (TEXTS[c.key] || "").trim(); });
    var box = $("clist"); box.textContent = "";
    if (!items.length) { show($("contacts"), false); return; }
    items.forEach(function (c) {
      var v = TEXTS[c.key].trim();
      var f = el("div", "copy-field");
      var span = el("span", null, c.label + ": " + v);
      f.appendChild(span);
      if (c.link) {
        var a = el("a", "btn", "Открыть"); a.href = c.link(v); a.target = "_blank"; a.rel = "noopener";
        f.appendChild(a);
      } else {
        var b = el("button", "btn", "Копировать"); b.type = "button";
        b.addEventListener("click", function () {
          try {
            navigator.clipboard.writeText(v).then(function () { b.textContent = "Скопировано"; setTimeout(function () { b.textContent = "Копировать"; }, 1600); },
              function () { var r = document.createRange(); r.selectNodeContents(span); var s = getSelection(); s.removeAllRanges(); s.addRange(r); });
          } catch (e) {}
        });
        f.appendChild(b);
      }
      box.appendChild(f);
    });
    show($("contacts"), true);
  }

  // ---------- просмотр фото ----------
  function initLightbox() {
    var lb = $("lightbox"), img = $("lbImg"), cap = $("lbCap");
    function open(src, alt) {
      img.src = src; img.alt = alt || ""; cap.textContent = alt && alt !== "Фото Алины" ? alt : "";
      show(lb, true);
      if (window.SiteFx && window.SiteFx.lenis) window.SiteFx.lenis.stop();
    }
    function close() {
      show(lb, false); img.removeAttribute("src");
      if (window.SiteFx && window.SiteFx.lenis) window.SiteFx.lenis.start();
    }
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t.tagName === "IMG" && t.closest("[data-zoom]") && !t.closest(".lightbox")) open(t.currentSrc || t.src, t.alt);
    });
    lb.addEventListener("click", function (e) { if (e.target !== img) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) close(); });
  }

  // ---------- пасхалки ----------
  function initEggs() {
    var clicks = [], egg = $("egg");
    $("heroName").addEventListener("click", function () {
      var t = Date.now();
      clicks = clicks.filter(function (x) { return t - x < 2000; });
      clicks.push(t);
      if (clicks.length >= 5) { clicks = []; show(egg, true); Confetti.burst(80, null, null, true); }
    });
    egg.addEventListener("click", function () { show(egg, false); });
    var buf = "";
    document.addEventListener("keydown", function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (!e.key || e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-8);
      if (/(алина|alina)$/.test(buf)) { buf = ""; Confetti.rain(3000, true); }
    });
    var heart = $("footerHeart");
    if (heart) {
      heart.style.cursor = "pointer";
      heart.addEventListener("click", function (e) { Confetti.burst(90, e.clientX, e.clientY, true); });
    }
  }

  // плавающая кнопка не мешает первому экрану
  function initFloat() {
    var fb = $("floatBtn");
    function upd() { fb.classList.toggle("away", window.scrollY < window.innerHeight * .8); }
    window.addEventListener("scroll", upd, { passive: true });
    upd();
  }

  // ---------- запуск ----------
  initFloat();
  initCompliment();
  initLightbox();
  initEggs();
  initLetter();
  applyBirthday();

  setupForm({ form: $("rform"), name: $("rname"), text: $("rtext"), hp: $("rweb"), btn: $("rsend"), note: $("rnote"), kind: "review",
    okPublished: function () { return "Спасибо! Ваш отзыв опубликован."; },
    okPending: function () { return "Спасибо! Отзыв появится на сайте после проверки."; },
    after: loadReviews });
  setupForm({ form: $("wform"), name: $("wname"), text: $("wtext"), hp: $("wweb"), btn: $("wsend"), note: $("wnote"), kind: "wish",
    okPublished: function () { return Date.now() >= revealAt() ? "Спасибо! Поздравление уже на стене." : "Спасибо! Алина увидит его " + revealLabel() + "."; },
    okPending: function () { return Date.now() >= revealAt() ? "Спасибо! Поздравление появится после проверки." : "Спасибо! Алина увидит его " + revealLabel() + "."; },
    after: loadWishes });

  api("site_texts?select=key,value").then(function (rows) {
    (rows || []).forEach(function (r) { TEXTS[r.key] = r.value; });
  }).catch(function () {}).then(function () {
    applyTexts();
    applyBirthday();
    initContacts();
    show($("letter"), TEXTS.letter_enabled === "true");
    loadReviews();
    loadWishes();
    loadPosts();
    loadGallery();
    loadVoices();
    api("quiz_questions?select=question,options,answer&order=sort.asc,created_at.asc&limit=50")
      .then(initQuiz).catch(function () { show($("quiz"), false); });
    refresh();
  });
})();
