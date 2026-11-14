import { h } from './dom.js';

let el;
let timer;

function hide() {
  el?.classList.remove('is-on');
}

export function toast(message, { action } = {}) {
  el ??= document.getElementById('toast');
  const kids = [h('span', {}, message)];
  if (action) {
    kids.push(h('button', {
      class: 'toast__action',
      type: 'button',
      onclick: () => { hide(); action.run(); },
    }, action.label));
  }
  el.replaceChildren(...kids);
  el.classList.toggle('has-action', Boolean(action));
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(hide, 3800);
}
