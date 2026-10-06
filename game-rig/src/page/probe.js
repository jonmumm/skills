// Browser-side probe, injected as source text (never bundled, so no transpiler helpers leak in).
// Installs window.__gameRigProbe. Every function returns plain JSON; the Node side parses it with Zod.
(() => {
  if (window.__gameRigProbe) return;

  const vw = () => window.innerWidth;
  const vh = () => window.innerHeight;
  const plain = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });

  function selectorOf(el) {
    if (!(el instanceof Element)) return "#text";
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 3);
    if (cls.length) s += `.${cls.join(".")}`;
    const parent = el.parentElement;
    if (!el.id && parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    const up = parent && parent !== document.body && parent !== document.documentElement ? selectorOf(parent).split(" > ").pop() : "";
    return up ? `${up} > ${s}` : s;
  }

  const ignored = (el, ignore) => ignore.some((sel) => { try { return el.closest(sel); } catch { return false; } });

  function visible(el) {
    if (el.closest("[aria-hidden=true]")) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return r.right > 0 && r.bottom > 0 && r.left < vw() && r.top < vh();
  }

  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();

  function textRect(el) {
    const range = document.createRange();
    let box = null;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        box = box
          ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
    }
    return box && { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
  }

  const alpha = (color) => {
    if (!color || color === "transparent") return 0;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean);
    return parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
  };
  const MEDIA = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "PICTURE", "INPUT", "SELECT", "TEXTAREA"]);

  /** The rect an element actually paints (its box if it has a fill or is media, its text otherwise), or null. */
  function paintedRect(el) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    if (MEDIA.has(el.tagName.toUpperCase())) return plain(box);
    if (alpha(cs.backgroundColor) > 0.05 || cs.backgroundImage !== "none") return plain(box);
    const borderVisible = ["Top", "Right", "Bottom", "Left"].some((s) => Number.parseFloat(cs[`border${s}Width`]) > 0 && alpha(cs[`border${s}Color`]) > 0.05);
    if (borderVisible) return plain(box);
    return ownText(el) ? textRect(el) : null;
  }

  /** The biggest canvas is the 3D/2D scene; DOM drawn over it is what the focal check is about. */
  function sceneCanvas() {
    let best = null;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height >= 0.4 * vw() * vh() && (!best || r.width * r.height > best.a)) best = { el: c, a: r.width * r.height };
    }
    return best?.el ?? null;
  }

  function inOverlayLayer(el) {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === "fixed" || p === "absolute" || p === "sticky") return true;
    }
    return false;
  }

  const describe = (el, rect) => ({ selector: selectorOf(el), text: (ownText(el) || el.getAttribute("aria-label") || "").slice(0, 80), rect });

  function overlays({ ignore = [] } = {}) {
    const scene = sceneCanvas();
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el === scene || (scene && el.contains(scene)) || ignored(el, ignore) || !visible(el) || !inOverlayLayer(el)) continue;
      if (el.closest("svg") && el.tagName.toUpperCase() !== "SVG") continue;
      const rect = paintedRect(el);
      if (rect) out.push(describe(el, rect));
    }
    return out;
  }

  function content({ ignore = [] } = {}) {
    const scene = sceneCanvas();
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el === scene || ignored(el, ignore) || !visible(el)) continue;
      if (el.closest("svg") && el.tagName.toUpperCase() !== "SVG") continue;
      const tag = el.tagName.toUpperCase();
      let rect = null;
      if (MEDIA.has(tag) || tag === "BUTTON" || el.getAttribute("role") === "button") rect = plain(el.getBoundingClientRect());
      else if (ownText(el)) rect = textRect(el);
      // Full-bleed art (backdrops, the scene) is allowed to run into the overscan.
      if (rect && rect.width * rect.height < 0.5 * vw() * vh()) out.push(describe(el, rect));
    }
    return out;
  }

  /** On top at its centre: what a person would see, not something hidden under another screen. */
  function onTop(el, rect) {
    if (getComputedStyle(el).pointerEvents === "none") return true;
    const x = Math.min(vw() - 1, Math.max(0, rect.x + rect.width / 2));
    const y = Math.min(vh() - 1, Math.max(0, rect.y + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return !hit || hit === el || el.contains(hit) || hit.contains(el) || getComputedStyle(hit).pointerEvents === "none";
  }

  const CLIPS = new Set(["hidden", "clip", "scroll", "auto"]);
  function textScan({ ignore = [] } = {}) {
    const clipped = [];
    const labels = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (ignored(el, ignore) || !visible(el) || el.closest("svg")) continue;
      const text = (el.innerText ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      const wide = el.scrollWidth > el.clientWidth + 1;
      const tall = el.scrollHeight > el.clientHeight + 1;
      let kind = null;
      if (cs.textOverflow === "ellipsis" && wide) kind = "ellipsis";
      else if (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && tall) kind = "line-clamp";
      else if ((CLIPS.has(cs.overflowX) && wide) || (CLIPS.has(cs.overflowY) && tall)) kind = "overflow";
      if (kind && el !== document.body) clipped.push({ selector: selectorOf(el), text: text.slice(0, 80), kind });
      const own = ownText(el);
      const rect = own && textRect(el);
      if (rect && onTop(el, rect)) labels.push({ selector: selectorOf(el), text: own });
    }
    return { clipped, labels };
  }

  function visibleTexts() {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      const own = ownText(el);
      if (own && visible(el)) out.push(own);
    }
    return out;
  }

  const TAPPABLE = "button, [role=button]";
  function tappables({ ignore = [], holdSelector = "[data-hold], [data-hold-only]" } = {}) {
    const out = [];
    const all = [...document.querySelectorAll(TAPPABLE)];
    all.forEach((el, index) => {
      if (ignored(el, ignore) || !visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      const r = el.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x >= vw() || y >= vh()) return;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) return;
      const label = ((el.innerText ?? "").trim() || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").slice(0, 60);
      const words = `${label} ${el.getAttribute("aria-description") ?? ""} ${el.getAttribute("title") ?? ""}`;
      out.push({ index, selector: selectorOf(el), label, rect: plain(r), holdOnly: el.matches(holdSelector) || /\bhold\b/i.test(words) });
    });
    return out;
  }

  // ── Tap monitor: DOM mutations, audio starts and the pointerdown time, all on performance.now(). ──
  const mon = { on: false, downAt: null, events: [] };
  const sig = (m) => `${selectorOf(m.target.nodeType === 1 ? m.target : m.target.parentElement)}|${m.type}|${m.attributeName ?? ""}`;
  new MutationObserver((list) => {
    if (!mon.on) return;
    const t = performance.now();
    for (const m of list) mon.events.push({ kind: "dom", t, sig: sig(m) });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const noteAudio = (what) => mon.on && mon.events.push({ kind: "audio", t: performance.now(), sig: what });
  const wrap = (proto, name, what) => {
    if (!proto?.[name]) return;
    const orig = proto[name];
    proto[name] = function (...args) {
      noteAudio(what);
      return orig.apply(this, args);
    };
  };
  wrap(window.AudioScheduledSourceNode?.prototype, "start", "webaudio");
  wrap(window.HTMLMediaElement?.prototype, "play", "media");
  wrap(window.speechSynthesis, "speak", "speech");
  window.addEventListener("pointerdown", () => { if (mon.on && mon.downAt === null) mon.downAt = performance.now(); }, true);
  window.addEventListener("touchstart", () => { if (mon.on && mon.downAt === null) mon.downAt = performance.now(); }, true);

  function monitorStart() {
    mon.on = true;
    mon.downAt = null;
    mon.events = [];
    return performance.now();
  }
  function monitorRead() {
    return { now: performance.now(), downAt: mon.downAt, events: mon.events.slice() };
  }

  window.__gameRigProbe = { overlays, content, textScan, tappables, visibleTexts, monitorStart, monitorRead, now: () => performance.now() };
})();
