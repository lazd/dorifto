export class Tabs {
  private readonly tabs: HTMLButtonElement[];
  private readonly panels: HTMLElement[];

  constructor(root: HTMLElement) {
    const list = root.querySelector<HTMLElement>('[role="tablist"]');
    if (!list) throw new Error('Tabs require a tablist');
    this.tabs = [...list.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
    if (!this.tabs.length) throw new Error('Tabs require at least one tab');
    this.panels = this.tabs.map((tab) => {
      const panel = root.ownerDocument.getElementById(tab.getAttribute('aria-controls') ?? '');
      if (!tab.id || !panel || !root.contains(panel) || panel.getAttribute('role') !== 'tabpanel')
        throw new Error(`Invalid tab panel for ${tab.id}`);
      panel.setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('click', () => this.select(panel.id));
      tab.addEventListener('keydown', (event) => {
        const index = this.tabs.indexOf(tab);
        let next: number;
        switch (event.key) {
          case 'ArrowRight':
            next = (index + 1) % this.tabs.length;
            break;
          case 'ArrowLeft':
            next = (index + this.tabs.length - 1) % this.tabs.length;
            break;
          case 'Home':
            next = 0;
            break;
          case 'End':
            next = this.tabs.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        this.select(this.panels[next].id);
        this.tabs[next].focus();
      });
      return panel;
    });
    this.select(this.panels[0].id);
  }

  select(panelId: string) {
    const index = this.panels.findIndex((panel) => panel.id === panelId);
    if (index < 0) throw new Error(`Unknown tab panel: ${panelId}`);
    this.tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      this.panels[i].hidden = !selected;
    });
  }
}
