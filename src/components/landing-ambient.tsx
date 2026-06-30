import { useEffect, useRef, useState } from "react";

/**
 * MouseGlow: a soft radial glow that follows the cursor.
 * Pointer-events disabled, fixed to viewport, behind content.
 */
export function MouseGlow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 3;
    let curX = targetX;
    let curY = targetY;

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const tick = () => {
      // ease toward target for smooth, slow motion
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      el.style.transform = `translate3d(${curX - 380}px, ${curY - 380}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2] overflow-hidden"
    >
      <div
        ref={ref}
        className="absolute h-[760px] w-[760px] rounded-full opacity-75 blur-3xl will-change-transform"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--primary) 80%, white 20%) 0%, color-mix(in srgb, var(--primary) 55%, transparent) 34%, transparent 72%)",
        }}
      />
    </div>
  );
}

/**
 * ScrollAurora: slow drifting color fields whose vertical position
 * reacts to scroll. Visible enough to read as ambient motion.
 */
export function ScrollAurora() {
  const aRef = useRef<HTMLDivElement | null>(null);
  const bRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        if (aRef.current) {
          aRef.current.style.transform = `translate3d(-10%, ${y * 0.06}px, 0)`;
        }
        if (bRef.current) {
          bRef.current.style.transform = `translate3d(10%, ${y * -0.04}px, 0)`;
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2] overflow-hidden"
    >
      <div
        ref={aRef}
        className="absolute -top-36 -left-24 h-[82vh] w-[82vh] rounded-full opacity-80 blur-3xl animate-aurora-drift-slow"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--primary) 85%, white 15%) 0%, color-mix(in srgb, var(--primary) 42%, transparent) 42%, transparent 74%)",
        }}
      />
      <div
        ref={bRef}
        className="absolute top-[32vh] -right-28 h-[86vh] w-[86vh] rounded-full opacity-75 blur-3xl animate-aurora-drift-slower"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--chart-2) 78%, white 22%) 0%, color-mix(in srgb, var(--chart-4) 46%, transparent) 44%, transparent 76%)",
        }}
      />
      <div
        className="absolute left-1/2 top-1/4 h-[65vh] w-[65vh] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--chart-3) 50%, transparent) 0%, transparent 68%)",
        }}
      />
    </div>
  );
}

/**
 * Reveal: fade + lift on first scroll into view. Subtle, runs once.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {

  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Comp = Tag as any;
  return (
    <Comp
      ref={ref as any}
      style={{ transitionDelay: `${delay}ms` }}
      className={[
        "transition-all duration-700 ease-out will-change-transform",
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        className,
      ].join(" ")}
    >
      {children}
    </Comp>
  );
}
