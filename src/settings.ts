import { Tabs } from './tabs';
import './settings.css';

const road =
  '<path class="illustration-road" d="M40 126 Q68 85 112 78 T190 26"/><path class="illustration-line" d="M40 126 Q68 85 112 78 T190 26"/>';
const cone =
  '<path class="illustration-cone" d="M-5 0 L0-16 L5 0Z"/><path class="illustration-mark" d="M-3-6 H3"/>';
const sign =
  '<path class="illustration-post" d="M0 0 V-20"/><path class="illustration-sign" d="M-8-20 V-34 H8 V-20Z"/><path class="illustration-mark" d="M-3-31 L2-27 L-3-23"/>';
const car =
  '<rect x="-9" y="-17" width="18" height="34" rx="5"/><path class="illustration-window" d="M-6-8 H6 V4 H-6Z"/>';
const illustrations: Record<string, string> = {
  minimap:
    '<path class="illustration-map" d="M65 40 Q30 40 35 75 T80 108 L152 82 Q180 70 163 43 T125 44 Q105 65 88 48Z"/><path class="illustration-position" d="M96 83 L107 104 L96 99 L85 104Z"/>',
  ghost: `${road}<g class="illustration-ghost" transform="translate(117 75) rotate(55)">${car}</g>`,
  gates: `${road}<g class="illustration-gate"><path d="M60 98 V67 H104 V80"/><path d="M111 73 V44 H151 V58"/><path d="M154 48 V22 H187 V33"/></g>`,
  cones: `${road}<g transform="translate(55 83)">${cone}</g><g transform="translate(92 61)">${cone}</g><g transform="translate(134 45)">${cone}</g><g transform="translate(106 111)">${cone}</g><g transform="translate(153 91)">${cone}</g>`,
  signs: `${road}<g transform="translate(56 84)">${sign}</g><g transform="translate(116 57)">${sign}</g><g transform="translate(167 32)">${sign}</g>`,
  grass: `${road}<g class="illustration-grass"><path d="M34 80 L30 64 M34 80 L40 62 M34 80 L45 72 M70 56 L65 40 M70 56 L73 36 M70 56 L81 45 M147 116 L141 100 M147 116 L150 94 M147 116 L160 101 M178 91 L173 74 M178 91 L182 69 M178 91 L191 79"/></g>`,
};

export function bindSettingsLayout() {
  const root = document.getElementById('settings-tabs');
  if (!root) throw new Error('Missing settings tabs');
  const tabs = new Tabs(root);
  root.querySelectorAll<HTMLElement>('[data-illustration]').forEach((figure) => {
    const content = illustrations[figure.dataset.illustration ?? ''];
    if (!content) throw new Error(`Unknown settings illustration: ${figure.dataset.illustration}`);
    figure.innerHTML = `<svg viewBox="0 0 224 126" aria-hidden="true">${content}</svg><span aria-hidden="true">Illustration</span>`;
  });
  return tabs;
}
