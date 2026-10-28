// Анимации и сценарий прокрутки. Без GSAP страница просто остаётся статичной.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rem = function (n) { return n * parseFloat(getComputedStyle(document.documentElement).fontSize); };
  var hasG = !!(window.gsap && window.ScrollTrigger) && !reduce;

  window.SiteFx = {
    hasG: hasG,
    refresh: function () { if (window.ScrollTrigger) { try { ScrollTrigger.refresh(); } catch (e) {} } }
  };

  function introDone() {
    window.SiteFx.introDone = true;
    try { document.dispatchEvent(new CustomEvent("site:intro")); } catch (e) {}
  }

  // ---- прелоадер
  var pre = $("preloader"), pct = $("percent");
  var loaded = document.readyState === "complete", cur = 0, started = performance.now(), finished = false;
  window.addEventListener("load", function () { loaded = true; });
  function endPreloader() {
    if (finished) return; finished = true;
    var done = function () { if (pre && pre.parentNode) pre.parentNode.removeChild(pre); playIntro(); };
    if (hasG) gsap.to(pre, { opacity: 0, delay: .6, duration: .8, ease: "power2.out", onComplete: done });
    else setTimeout(done, 300);
  }
  if (pre && pct) {
    (function tick() {
      var t = performance.now() - started;
      var target = loaded ? 100 : Math.min(90, t / 2200 * 90);
      if (t < 1800) target = Math.min(target, t / 1800 * 100);
      if (t > 8000) loaded = true;
      cur += (target - cur) * .12;
      pct.textContent = Math.round(cur) + "%";
      if (loaded && t > 1800 && cur >= 99.4) { pct.textContent = "100%"; endPreloader(); return; }
      requestAnimationFrame(tick);
    })();
  } else {
    setTimeout(introDone, 300);
  }

  // ---- вступление
  var heroSpans = qa(".hero__main_text span");
  var heroTexts = [".hero__content_bottom_text", ".hero__content_bottom_scroll"];
  if (hasG) {
    gsap.set(heroSpans, { opacity: 0, filter: "blur(" + rem(10) + "px)" });
    gsap.set(heroTexts, { opacity: 0 });
  }
  function playIntro() {
    if (!hasG) { introDone(); return; }
    var tl = gsap.timeline({ onComplete: introDone });
    tl.to(heroSpans[0], { opacity: 1, filter: "blur(0px)", duration: .01, ease: "none" })
      .to(heroSpans[1], { opacity: 1, filter: "blur(0px)", duration: .01, ease: "none" }, "+=0.7")
      .to(heroSpans[2], { opacity: 1, filter: "blur(0px)", duration: .01, ease: "none" }, "+=0.7")
      .to(heroTexts, { opacity: 1, duration: 1.5, ease: "power2.out", stagger: .08 }, "+=0.5");
  }
  setTimeout(function () {
    if (hasG) { gsap.to(heroSpans, { opacity: 1, filter: "blur(0px)", duration: .3 }); gsap.to(heroTexts, { opacity: 1, duration: .3 }); }
    if (!window.SiteFx.introDone) introDone();
  }, 12000);

  if (!hasG) return;

  // ---- прокрутка
  function initScroll() {
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis) {
      try {
        var lenis = new Lenis({ autoRaf: true, duration: 1.8, smoothWheel: true });
        lenis.on("scroll", ScrollTrigger.update);
        window.SiteFx.lenis = lenis;
      } catch (e) {}
    }

    var neg = qa(".negative__item");
    gsap.set(neg, { opacity: 0, filter: "blur(" + rem(20) + "px)" });
    [["top -40%", 0], ["top -110%", 1], ["top -180%", 2]].forEach(function (p) {
      ScrollTrigger.create({
        trigger: ".negative", start: p[0],
        animation: gsap.to(neg[p[1]], { opacity: 1, filter: "blur(0px)", duration: .5, paused: true }),
        toggleActions: "play none none reverse"
      });
    });
    ScrollTrigger.create({
      trigger: ".negative", start: "top -230%",
      animation: gsap.to(".negative__content", { opacity: 0, filter: "blur(" + rem(20) + "px)", duration: .5, paused: true }),
      toggleActions: "play none none reverse"
    });

    gsap.set("#head", { xPercent: -50, yPercent: -50, left: "50%", top: "50%", x: 0, y: 0 });
    gsap.to("#head", { scale: .85, opacity: .4, ease: "power3.inOut",
      scrollTrigger: { trigger: ".iamgleb", start: "top top", end: "top+=40%", scrub: 1.2 } });

    gsap.fromTo(".iamgleb__content", { x: "110vw" }, { x: function () {
        var line = document.querySelector(".iamgleb__line");
        var w = line ? line.scrollWidth : window.innerWidth * 2;
        return -(w - window.innerWidth * .3);
      }, ease: "none", invalidateOnRefresh: true,
      scrollTrigger: { trigger: ".iamgleb", start: "top top", end: "bottom bottom", scrub: 1.2 } });
    gsap.to(".iamgleb__gif:nth-child(2)", { x: "-650%", ease: "none", scrollTrigger: { trigger: ".iamgleb", start: "top top", end: "bottom bottom", scrub: 3 } });
    gsap.to(".iamgleb__gif:nth-child(3)", { x: "-450%", ease: "none", scrollTrigger: { trigger: ".iamgleb", start: "top top", end: "bottom bottom", scrub: 3 } });
    gsap.fromTo("#head", { scale: .85, opacity: .4 }, { scale: 1, opacity: 1, ease: "power3.inOut", immediateRender: false,
      scrollTrigger: { trigger: ".iamgleb", start: "bottom-=30% bottom", end: "bottom bottom", scrub: 1.2 } });

    qa(".orpk__item").forEach(function (item) {
      gsap.fromTo(item.querySelector(".orpk__item_text"), { y: "-100%" }, { y: "0%", ease: "none",
        scrollTrigger: { trigger: item, start: "top bottom", end: "top center", scrub: true } });
    });

    gsap.fromTo(".about__img .ph img", { scale: 1.18 }, { scale: 1, ease: "none",
      scrollTrigger: { trigger: ".about", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.to(".zoj__photo_item:nth-child(2)", { y: "-150%", ease: "none",
      scrollTrigger: { trigger: ".zoj__photo_list", start: "top center", end: "bottom top", scrub: 1.5 } });

    gsap.to(".gang__blood", { width: function () { return Math.min(rem(1100), window.innerWidth * .6); }, ease: "none", duration: .15,
      scrollTrigger: { trigger: ".gang__141", start: "center 65%" } });
    qa(".gang__list_item").forEach(function (item) {
      gsap.fromTo(item, { opacity: 0 }, { opacity: 1, ease: "none",
        scrollTrigger: { trigger: item, start: "top 90%", end: "center center", scrub: true } });
    });

    var prizes = qa(".slay__prize");
    var pz = [{ x: 150, y: -250, r: 20, s: 1.2, sc: true }, { x: -120, y: 180, r: -15, s: .95, sc: 1.5 }, { x: 90, y: -120, r: 10, s: .85, sc: 1.5 }];
    prizes.forEach(function (el, i) {
      gsap.to(el, { x: rem(pz[i].x), y: rem(pz[i].y), rotate: pz[i].r, scale: pz[i].s, ease: "none",
        scrollTrigger: { trigger: ".slay", start: "top 80%", end: "bottom 20%", scrub: pz[i].sc } });
    });

    gsap.to(".big_vid__anim", { scale: .4, ease: "none",
      scrollTrigger: { trigger: ".big_vid", start: "top top", end: "bottom 120%", scrub: true } });
    var frames = qa(".big_vid__anim_img"), fi = 0;
    if (frames.length) setInterval(function () {
      frames[fi].style.opacity = 0; fi = (fi + 1) % frames.length; frames[fi].style.opacity = 1;
    }, 400);

    var items = qa(".time__item");
    var base = [[-520, -260], [-480, -120], [-560, 0], [-500, 140], [-540, 280], [520, -260], [480, -120], [560, 0], [500, 140]];
    var pos = base.slice().sort(function () { return Math.random() - .5; });
    var narrow = window.innerWidth < 700 ? .45 : 1;
    items.forEach(function (it, i) {
      var p = pos[i % pos.length];
      gsap.set(it, { x: rem(p[0]) * narrow, y: rem(p[1]), xPercent: -50, yPercent: -50, z: 1200, scale: 1.6, opacity: 0, filter: "blur(20px)" });
    });
    ScrollTrigger.create({
      trigger: ".time", start: "top top", end: "bottom bottom", scrub: true,
      onUpdate: function (self) {
        var pr = self.progress, delay = .3, len = 1 + delay * items.length;
        items.forEach(function (item, i) {
          var p = pos[i % pos.length];
          var local = clamp(pr * len - i * delay, 0, 1);
          var z = gsap.utils.interpolate(1200, -4200, local);
          var scale = gsap.utils.interpolate(1.6, .3, local);
          var op = Math.min(clamp(local / .3, 0, 1), clamp((1 - local) / .3, 0, 1));
          var blur = local < .5 ? gsap.utils.interpolate(20, 0, local / .5) : gsap.utils.interpolate(0, 20, (local - .5) / .5);
          var pull = (1 - local) * 1.4;
          gsap.set(item, { x: rem(p[0]) * narrow * pull, y: rem(p[1]) * (.9 + (1 - local) * .2), z: z, scale: scale, opacity: op, filter: "blur(" + blur + "px)" });
        });
      }
    });
    gsap.to(".time__title", { scale: .1, filter: "blur(" + rem(10) + "px)", opacity: 0, y: rem(150), ease: "none",
      scrollTrigger: { trigger: ".time", start: "top top", end: "center center", scrub: true } });

    gsap.fromTo(".victims__title_big", { opacity: 0, filter: "blur(" + rem(20) + "px)" },
      { opacity: 1, filter: "blur(0px)", duration: 1.2, delay: .3, ease: "power2.out",
        scrollTrigger: { trigger: ".victims__title_big", start: "center center", toggleActions: "play none none reverse" } });
    gsap.to(".victims__title", { opacity: 0, filter: "blur(" + rem(20) + "px)", duration: .8, ease: "power2.out", immediateRender: false,
      scrollTrigger: { trigger: ".victims__item:last-child", start: "bottom top", toggleActions: "play none none reverse" } });
    gsap.to(".sec_white", { backgroundColor: "#120d10", duration: .6, ease: "power2.out",
      scrollTrigger: { trigger: ".victims__title_big", start: "center center", toggleActions: "play none none reverse" } });
    gsap.to("#smoke", { opacity: 0, ease: "none", immediateRender: false,
      scrollTrigger: { trigger: ".about", start: "top center", end: "top top", toggleActions: "play none none reverse" } });
    gsap.fromTo("#smoke", { opacity: 0 }, { opacity: .5, ease: "none", immediateRender: false,
      scrollTrigger: { trigger: ".victims__title_big", start: "center center", toggleActions: "play none none reverse" } });

    function shake(sel, x, y, dur, delay) {
      gsap.set(sel, { x: 0, y: 0 });
      gsap.to(sel, { x: function () { return gsap.utils.random(-x, x); }, y: function () { return gsap.utils.random(-y, y); },
        duration: dur, ease: "none", repeat: -1, repeatRefresh: true, delay: delay || 0 });
    }
    shake(".menace__word:nth-child(1)", rem(2), rem(4), .04);
    shake(".menace__word:nth-child(2)", rem(5), rem(2), .04, .03);

    gsap.to(".kursk__img_wrap_wrap", { y: rem(650), ease: "none", scrollTrigger: { trigger: ".kursk", start: "top bottom", end: "center -20%", scrub: true } });
    gsap.to(".kursk__img_wrap", { width: rem(450), height: rem(592), ease: "none", scrollTrigger: { trigger: ".kursk", start: "top bottom", end: "top top", scrub: true } });
    gsap.to(".kursk__text_up", { x: rem(-350), ease: "none", scrollTrigger: { trigger: ".kursk__text", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.to(".kursk__text_down", { x: rem(350), ease: "none", scrollTrigger: { trigger: ".kursk__text", start: "top bottom", end: "bottom top", scrub: true } });

    gsap.timeline({ scrollTrigger: { trigger: ".menace", start: "top center", end: "bottom center", scrub: true } })
      .to(".menace__kus svg:nth-child(1)", { x: rem(-70), y: rem(-40), rotation: -18, scale: .6, ease: "none" }, 0)
      .to(".menace__kus svg:nth-child(3)", { x: rem(150), y: rem(20), rotation: 18, scale: 1.3, ease: "none" }, 0);

    // новые разделы плавно появляются
    qa("[data-rise]").forEach(function (el) {
      gsap.fromTo(el, { y: rem(80), opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" } });
    });

    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  }
  try { initScroll(); } catch (e) { if (window.console) console.error(e); }

  // ссылки-якоря через плавный скролл
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || !window.SiteFx.lenis) return;
    var id = a.getAttribute("href").slice(1);
    var t = id && document.getElementById(id);
    if (!t) return;
    e.preventDefault();
    window.SiteFx.lenis.scrollTo(t, { duration: 2 });
  });
})();
