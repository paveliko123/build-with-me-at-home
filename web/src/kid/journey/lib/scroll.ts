// QA round 2: the newest message sometimes stayed off screen: after a step change or a build
// the content kept growing after the first scroll, and on narrow screens the page scrolls,
// not the chat panel. Scroll the panel and bring its last item into view, now and once more
// after the layout settles.
export function keepNewestInView(panel: HTMLElement | null) {
  if (!panel) return;
  const go = () => {
    panel.scrollTo({ top: panel.scrollHeight });
    panel.lastElementChild?.scrollIntoView({ block: 'nearest' });
  };
  requestAnimationFrame(go);
  window.setTimeout(go, 400);
}
