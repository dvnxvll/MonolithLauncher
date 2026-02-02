import { navItems, panels } from './dom';

export const setActivePanel = (target: string) => {
  navItems.forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-target') === target);
  });

  panels.forEach((panel) => {
    if (panel.getAttribute('data-section') === target) {
      panel.classList.add('is-active');
    } else {
      panel.classList.remove('is-active');
    }
  });
};

export const activateSubpanel = (panel: Element | null, target: string) => {
  if (!panel) return;
  const subtabButtons = [...panel.querySelectorAll('.subtab-item')];
  const subpanels = [...panel.querySelectorAll('.subpanel')];
  if (!subtabButtons.length || !subpanels.length) return;
  subtabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-subtarget') === target);
  });
  subpanels.forEach((subpanel) => {
    subpanel.classList.toggle(
      'is-active',
      subpanel.getAttribute('data-subsection') === target
    );
  });
};

const initSubtabs = () => {
  document.querySelectorAll('.panel').forEach((panel) => {
    const subtabButtons = [...panel.querySelectorAll('.subtab-item')];
    const subpanels = [...panel.querySelectorAll('.subpanel')];
    if (!subtabButtons.length || !subpanels.length) {
      return;
    }

    subtabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-subtarget');
        if (target) {
          activateSubpanel(panel, target);
        }
      });
    });

    const initial =
      panel.querySelector('.subtab-item.is-active')?.getAttribute('data-subtarget') ||
      subpanels[0]?.getAttribute('data-subsection');
    if (initial) {
      activateSubpanel(panel, initial);
    }
  });
};

export const initNavigation = () => {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      if (target) {
        setActivePanel(target);
      }
    });
  });

  const initialTarget =
    document.querySelector('.nav-item.is-active')?.getAttribute('data-target') || 'overview';
  setActivePanel(initialTarget);
  initSubtabs();
};
