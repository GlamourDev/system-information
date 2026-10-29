interface FanState {
  element: HTMLElement;
  angle: number;
  speed: number;
}

export function createFanAnimation() {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let fans = new Map<string, FanState>();
  let frame: number | undefined;
  let previousTime: number | null = null;

  function paint(time: number) {
    frame = undefined;
    const elapsed = previousTime === null ? 0 : Math.min(time - previousTime, 100);
    previousTime = time;
    for (const fan of fans.values()) {
      fan.angle = (fan.angle + fan.speed * elapsed / 1000) % 360;
      fan.element.style.transform = `rotate(${fan.angle}deg)`;
    }
    schedule();
  }

  function schedule() {
    if (motion.matches || ![...fans.values()].some((fan) => fan.speed > 0)) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      previousTime = null;
      return;
    }
    if (frame === undefined) frame = window.requestAnimationFrame(paint);
  }

  motion.addEventListener("change", schedule);

  return {
    update(root: HTMLElement) {
      const next = new Map<string, FanState>();
      for (const element of root.querySelectorAll<HTMLElement>("[data-fan-id]")) {
        const id = element.dataset.fanId!;
        const rpm = Number(element.dataset.fanRpm);
        // Scale real RPM to a readable animation: 1 revolution/s at 1200 RPM,
        // capped at 4 revolutions/s. Zero or unavailable readings remain still.
        const speed = Number.isFinite(rpm) && rpm > 0 ? Math.min(rpm / 1200, 4) * 360 : 0;
        const angle = fans.get(id)?.angle ?? 0;
        element.style.transform = `rotate(${angle}deg)`;
        next.set(id, { element, angle, speed });
      }
      fans = next;
      schedule();
    },
  };
}
