"use client";

import { useEffect } from "react";

/** Opens the browser print dialog once after the page has rendered. */
export default function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
