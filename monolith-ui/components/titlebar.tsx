"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { getAppWindow, startDragging } from "@/lib/tauri";

const safeCall = async (action: (win: any) => Promise<void> | void) => {
  const win = await getAppWindow();
  if (!win) return;
  await action(win);
};

export default function Titlebar() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("mouseup", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("blur", stop);
    };
  }, [dragging]);

  const isPrimaryAction = (
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    if ("buttons" in event && typeof event.buttons === "number") {
      return event.buttons === 1;
    }
    if ("button" in event && typeof event.button === "number") {
      return event.button === 0;
    }
    return false;
  };

  const handleDragStart = async (
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    if (!isPrimaryAction(event)) return;
    setDragging(true);
    await startDragging();
  };

  const stopDrag = (
    event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
  };

  return (
    <header
      className={`tauri-drag-region flex items-center justify-between border-b border-border bg-card/60 backdrop-blur px-4 h-11 ${dragging ? "tauri-dragging" : ""}`}
      data-tauri-drag-region
      onPointerDown={handleDragStart}
      onMouseDown={handleDragStart}
    >
      <div
        className="tauri-drag-region flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-foreground/70"
        data-tauri-drag-region
        onPointerDown={handleDragStart}
        onMouseDown={handleDragStart}
      >
        <img
          src="/monolithicon.png"
          alt="Monolith Launcher"
          className="h-7 w-7 rounded-md border border-border bg-background object-cover"
          draggable={false}
        />
        <span className="font-semibold">Monolith Launcher</span>
      </div>
      <div
        className="tauri-no-drag flex items-center gap-2"
        data-tauri-drag-region="false"
      >
        <button
          className="tauri-no-drag h-7 w-7 rounded-md border border-border bg-background text-foreground/70 hover:text-foreground"
          aria-label="Minimize"
          onClick={() => safeCall((win) => win.minimize?.())}
          onPointerDown={stopDrag}
          onMouseDown={stopDrag}
        >
          <Minus className="mx-auto h-4 w-4" />
        </button>
        <button
          className="tauri-no-drag h-7 w-7 rounded-md border border-border bg-background text-foreground/70 hover:text-foreground"
          aria-label="Toggle maximize"
          onClick={() =>
            safeCall(async (win) => {
              if (win.toggleMaximize) {
                await win.toggleMaximize();
                return;
              }
              if (win.maximize) {
                await win.maximize();
              }
            })
          }
          onPointerDown={stopDrag}
          onMouseDown={stopDrag}
        >
          <Square className="mx-auto h-3.5 w-3.5" />
        </button>
        <button
          className="tauri-no-drag h-7 w-7 rounded-md border border-border bg-background text-foreground/70 hover:text-foreground hover:border-destructive/40 hover:text-destructive"
          aria-label="Close"
          onClick={() => safeCall((win) => win.close?.())}
          onPointerDown={stopDrag}
          onMouseDown={stopDrag}
        >
          <X className="mx-auto h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
