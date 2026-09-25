import { useEffect, useState } from "react";

function readKeyboardInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

/** Bottom inset when the on-screen keyboard shrinks the visual viewport (mobile browsers). */
export function useVisualViewportInset(): number {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setKeyboardInset(readKeyboardInset());
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
    return () => {
      document.documentElement.style.setProperty("--keyboard-inset", "0px");
    };
  }, [keyboardInset]);

  return keyboardInset;
}
