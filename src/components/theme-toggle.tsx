"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

// Botão de alternar entre modo dia e modo noite
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = theme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={isDark ? "Mudar para modo dia" : "Mudar para modo noite"}
      title={isDark ? "Modo dia" : "Modo noite"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-11 w-11"
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-5 w-5" aria-hidden />
        ) : (
          <Moon className="h-5 w-5" aria-hidden />
        )
      ) : (
        <span className="h-5 w-5" aria-hidden />
      )}
    </Button>
  );
}
