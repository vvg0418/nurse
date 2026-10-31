// Заставка с обратным отсчётом: до дня рождения сайт закрыт кружком-таймером.
// Включается ещё до отрисовки (скрипт в <head> ставит класс gate-on).
// Обход для своих: добавить #preview к адресу.
(function () {
  "use strict";
  var html = document.documentElement;
  var gate = document.getElementById("gate");
  var Gate = window.Gate = { locked: false };
  if (!gate) return;
  if (!html.classList.contains("gate-on")) { gate.parentNode.removeChild(gate); return; }

  var C = window.SITE_CONFIG;
  var DAY = 86400000;
  var target = Date.parse("2026-11-01T00:00:00+04:00");
  var $ = function (id) { return document.getElementById(id); };
  var ring = $("gateRing"), sec = $("gateSec"), tEl = $("gateTime"), dEl = $("gateDays");
  var finished = false, timer = null;

  function lockScroll(on) {
    html.classList.toggle("gate-lock", on);
    var l = window.SiteFx && window.SiteFx.lenis;
    if (l) { try { on ? l.stop() : l.start(); } catch (e) {} }
  }
  Gate.locked = true;
  lockScroll(true);

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function plural(n, f) { var a = n % 100, b = a % 10; if (a > 10 && a < 20) return f[2]; if (b > 1 && b < 5) return f[1]; if (b === 1) return f[0]; return f[2]; }

  function tick() {
    var left = target - Date.now();
    if (left <= 0) { finish(); return; }
    var s = Math.floor(left / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    tEl.textContent = pad(h) + ":" + pad(m) + ":" + pad(ss);
    dEl.textContent = d > 0 ? d + " " + plural(d, ["день", "дня", "дней"]) + " и" : "";
    // внешнее кольцо тает за последние сутки, внутреннее отсчитывает секунды
    ring.style.strokeDashoffset = String(100 * (1 - Math.min(left / DAY, 1)));
    sec.style.strokeDashoffset = String(100 * (1 - ss / 60));
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    tEl.textContent = "00:00:00";
    ring.style.strokeDashoffset = "0";
    sec.style.strokeDashoffset = "0";
    gate.classList.add("gate--done");
    var lab = gate.querySelector(".gate__label"); if (lab) lab.textContent = "наступило 1 ноября";
    dEl.textContent = "";
    var go = $("gateOpen");
    if (go) { go.addEventListener("click", function () { location.reload(); }); setTimeout(function () { go.focus(); }, 50); }
    if (window.Confetti) {
      window.Confetti.burst(200);
      setTimeout(function () { window.Confetti.rain(6000, true); }, 700);
    }
  }

  // открыть без праздника: заставка выключена в админке или время уже прошло
  function openNow() {
    if (!Gate.locked) return;
    clearInterval(timer);
    gate.classList.add("gate--out");
    setTimeout(function () {
      if (gate.parentNode) gate.parentNode.removeChild(gate);
      html.classList.remove("gate-on");
      Gate.locked = false;
      lockScroll(false);
      if (window.SiteFx) window.SiteFx.refresh();
    }, 600);
  }
  Gate.openNow = openNow;

  timer = setInterval(tick, 250);
  tick();

  // время и включение берём из настроек сайта
  fetch(C.url + "/rest/v1/site_texts?select=key,value&key=in.(gate_until,gate_enabled,wishes_reveal_at)", { headers: { apikey: C.key } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var m = {};
      (rows || []).forEach(function (r) { m[r.key] = r.value; });
      if (m.gate_enabled === "false") { openNow(); return; }
      var t = Date.parse(m.gate_until || m.wishes_reveal_at || "");
      if (isNaN(t)) return;
      if (t <= Date.now()) { openNow(); return; }
      target = t;
      tick();
    })
    .catch(function () {});

  var wbtn = $("gateWishBtn"), wform = $("gform");
  if (wbtn && wform) {
    wbtn.addEventListener("click", function () {
      wform.hidden = !wform.hidden;
      wbtn.setAttribute("aria-expanded", String(!wform.hidden));
      if (!wform.hidden) $("gtext").focus();
    });
  }
})();
