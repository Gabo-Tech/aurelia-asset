import { useEffect, useRef, useState } from "react";

/**
 * MouseGlow: a very subtle radial glow that follows the cursor.
 * Pointer-events disabled, fixed to viewport, dimmed for elegance.
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
      el.style.transform = `translate3d(${curX - 300}px, ${curY - 300}px, 0)`;
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
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden mix-blend-screen"
    >
      <div
        ref={ref}
        className="absolute h-[800px] w-[800px] rounded-full opacity-70 blur-3xl will-change-transform"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--primary)/1), transparent 70%)",
        }}
      />
    </div>
  );
}

/**
 * ScrollAurora: two slow drifting blobs whose vertical position
 * subtly reacts to scroll. Extremely low opacity, behind content.
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
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden mix-blend-screen"
    >
      <div
        ref={aRef}
        className="absolute -top-40 left-0 h-[75vh] w-[75vh] rounded-full opacity-80 blur-3xl animate-aurora-drift-slow"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--primary)/1), transparent 70%)",
        }}
      />
      <div
        ref={bRef}
        className="absolute top-[40vh] right-0 h-[80vh] w-[80vh] rounded-full opacity-70 blur-3xl animate-aurora-drift-slower"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--accent, var(--primary))/1), transparent 70%)",
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
