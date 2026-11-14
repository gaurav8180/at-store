import { $$, reducedMotion } from './dom.js';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const still = () => reducedMotion.matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let gsapReady = false;
let cardTriggers = [];

function init() {
  if (still()) return;
  try {
    const { gsap, ScrollTrigger } = window;
    if (gsap && ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      gsapReady = true;
    }
  } catch {
    gsapReady = false;
  }
}

const scrollToY = (top, behavior) => window.scrollTo({ top, behavior: behavior ?? (still() ? 'auto' : 'smooth') });

function reveal() {
  if (!gsapReady) return;
  const { gsap } = window;
  $$('[data-lines]:not(.wordmark)').forEach((el) => {
    gsap.from($$('.line__in', el), {
      yPercent: 110, duration: 0.6, ease: 'power3.out', stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 20, opacity: 0, duration: 0.6, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  });
}

function revealCards(cards) {
  cardTriggers.forEach((t) => t.kill());
  cardTriggers = [];
  const shown = cards.slice(0, 8);
  if (!gsapReady || !shown.length) return;
  const { gsap, ScrollTrigger } = window;
  gsap.set(shown, { opacity: 0, y: 24 });
  cardTriggers = ScrollTrigger.batch(shown, {
    start: 'top 95%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.03, overwrite: true, clearProps: 'transform,opacity' }),
  });
  ScrollTrigger.refresh();
}

function flip(el, fromRect, { duration = 350 } = {}) {
  if (still() || !fromRect) return null;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return null;
  return el.animate([
    { transformOrigin: '0 0', transform: `translate(${fromRect.left - to.left}px, ${fromRect.top - to.top}px) scale(${fromRect.width / to.width}, ${fromRect.height / to.height})` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration, easing: EASE, fill: 'backwards' });
}

function flipTo(el, toRect, { duration = 350 } = {}) {
  const from = el.getBoundingClientRect();
  return el.animate([
    { transformOrigin: '0 0', transform: 'none' },
    { transformOrigin: '0 0', transform: `translate(${toRect.left - from.left}px, ${toRect.top - from.top}px) scale(${toRect.width / from.width}, ${toRect.height / from.height})` },
  ], { duration, easing: EASE, fill: 'forwards' });
}

function rise(els, { delay = 0, stagger = 40 } = {}) {
  if (still()) return;
  els.filter(Boolean).forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: delay + i * stagger, easing: EASE, fill: 'backwards' });
  });
}

async function intro(ready) {
  const el = document.getElementById('loader');
  if (!el) return;
  let seen = false;
  try {
    seen = Boolean(sessionStorage.getItem('ss_seen'));
    sessionStorage.setItem('ss_seen', '1');
  } catch {
    seen = false;
  }
  if (still() || seen || location.pathname !== '/') {
    el.hidden = true;
    await ready;
    return;
  }
  el.querySelector('.loader__mark').animate([
    { transform: 'scale(1.6)', opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: 220, easing: EASE, fill: 'both' });
  await Promise.race([ready, wait(1500)]);
  await el.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 300, easing: EASE, fill: 'forwards' }).finished.catch(() => {});
  el.hidden = true;
}

function heroIntro() {
  if (still()) return;
  $$('.wordmark .ch').forEach((ch, i) => {
    ch.animate([{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 600, delay: i * 80, easing: EASE, fill: 'backwards' });
  });
}

export const motion = {
  ease: EASE,
  init,
  scrollToY,
  reveal,
  revealCards,
  flip,
  flipTo,
  rise,
  intro,
  heroIntro,
  refresh: () => gsapReady && window.ScrollTrigger.refresh(),
};
