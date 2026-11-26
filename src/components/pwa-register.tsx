"use client";

import * as React from "react";

// Regista o service worker (só em produção) — é o que deixa a app instalar-se
// no telemóvel e funcionar sem internet.
export function PwaRegister() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const registrar = () => {
      navigator.serviceWorker.register(`${bp}/sw.js`).catch(() => {
        // se falhar, a app continua a funcionar só que sem modo offline
      });
    };
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar);
      return () => window.removeEventListener("load", registrar);
    }
  }, []);
  return null;
}
