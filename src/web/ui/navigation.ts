import { renderIcon } from "../components/icons.js";
import { getElement } from "../lib/dom.js";
import { pages, type Page } from "../views/pages.js";

export function createNavigation(onSelect: (page: Page) => void) {
  const container = getElement("#navigation");
  const buttons = new Map<string, HTMLButtonElement>();

  for (const [index, page] of pages.entries()) {
    if (index === 2) {
      const divider = document.createElement("div");
      divider.className = "navigation__divider";
      container.append(divider);
    }
    const button = document.createElement("button");
    button.className = "navigation__item";
    button.innerHTML = `${renderIcon(page.id, 17, "navigation__icon")}<span>${page.title}</span>`;
    button.addEventListener("click", () => onSelect(page));
    container.append(button);
    buttons.set(page.id, button);
  }

  document.addEventListener("keydown", (event) => {
    if (!event.metaKey && !event.ctrlKey) return;
    const page = pages[Number(event.key) - 1];
    if (!page) return;
    event.preventDefault();
    onSelect(page);
  });

  return {
    select(page: Page) {
      for (const [id, button] of buttons) {
        const active = id === page.id;
        button.classList.toggle("navigation__item--active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    },
  };
}
