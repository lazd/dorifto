import './text-spinner.css';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Returns a cleanup function that restores the original content and stops the animation. */
export function startTextSpinner(element: HTMLElement) {
  const content = [...element.childNodes];
  const label = document.createElement('span');
  label.className = 'text-spinner-label';
  label.append(...content);
  const spinner = document.createElement('span');
  spinner.className = 'text-spinner-frame';
  spinner.setAttribute('aria-hidden', 'true');
  spinner.textContent = frames[0];
  element.classList.add('text-spinner');
  element.append(label, spinner);
  let frame = 0;
  const interval = matchMedia('(prefers-reduced-motion: reduce)').matches
    ? undefined
    : setInterval(() => {
        frame = (frame + 1) % frames.length;
        spinner.textContent = frames[frame];
      }, 80);
  return () => {
    clearInterval(interval);
    element.replaceChildren(...content);
    element.classList.remove('text-spinner');
  };
}
