"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppPage = "overview" | "account" | "settings";
type TipPlacement = "top" | "bottom" | "left" | "right";

type TipStep = {
  id: string;
  title: string;
  description: string;
  page: AppPage;
  targetId?: string;
  placement?: TipPlacement;
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const TIPS_STORAGE_KEY = "monolith:new-user-tips:v1";

const steps: TipStep[] = [
  {
    id: "nav-overview",
    title: "Overview Section",
    description:
      "Use this tab to manage instances, launch Minecraft, and view logs.",
    page: "overview",
    targetId: "nav-overview",
    placement: "right",
  },
  {
    id: "overview-create-instance",
    title: "Create Instance",
    description:
      "Create a new Minecraft instance with loader and version selection.",
    page: "overview",
    targetId: "overview-create-instance",
    placement: "left",
  },
  {
    id: "overview-instance-search",
    title: "Search Instances",
    description: "Filter your instance list quickly by name, loader, or version.",
    page: "overview",
    targetId: "overview-instance-search",
    placement: "right",
  },
  {
    id: "nav-account",
    title: "Account Section",
    description:
      "Manage Microsoft and offline profiles. Pick which account is active.",
    page: "account",
    targetId: "nav-account",
    placement: "right",
  },
  {
    id: "account-add-account",
    title: "Add Account",
    description:
      "Sign in with Microsoft here. Add at least one account before launching.",
    page: "account",
    targetId: "account-add-account",
    placement: "left",
  },
  {
    id: "nav-settings",
    title: "Settings Section",
    description:
      "Configure launcher defaults such as Java runtime, memory, and sync behavior.",
    page: "settings",
    targetId: "nav-settings",
    placement: "right",
  },
  {
    id: "settings-runtime-select",
    title: "Default Java Runtime",
    description:
      "Set which Java installation is used by default when launching instances.",
    page: "settings",
    targetId: "settings-runtime-select",
    placement: "bottom",
  },
  {
    id: "settings-sync-options",
    title: "Sync Options",
    description:
      "Enable pack sync and choose what is shared between instances: resourcepacks, texturepacks, shaders, server list, and reference instance.",
    page: "settings",
    targetId: "settings-sync-options",
    placement: "top",
  },
  {
    id: "settings-jvm-settings",
    title: "JVM Memory & Args",
    description:
      "Tune JVM arguments and RAM limits for all new instances from this panel.",
    page: "settings",
    targetId: "settings-jvm-settings",
    placement: "top",
  },
  {
    id: "done",
    title: "Tips Complete",
    description: "You are ready. Go to Overview and create your first instance.",
    page: "overview",
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export default function NewUserTips({
  currentPage,
  setCurrentPage,
}: {
  currentPage: AppPage;
  setCurrentPage: (page: AppPage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cardSize, setCardSize] = useState({ width: 460, height: 240 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrolledStepRef = useRef<string | null>(null);
  const forceTips =
    process.env.NEXT_PUBLIC_FORCE_TIPS === "1" ||
    process.env.NEXT_PUBLIC_FORCE_TOUR === "1";

  const step = useMemo(() => steps[stepIndex] ?? steps[0], [stepIndex]);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forceTips) {
      setOpen(true);
      return;
    }
    const completed = window.localStorage.getItem(TIPS_STORAGE_KEY) === "done";
    if (!completed) {
      setOpen(true);
    }
  }, [forceTips]);

  useEffect(() => {
    if (!open) return;
    scrolledStepRef.current = null;
    if (currentPage !== step.page) {
      setCurrentPage(step.page);
    }
  }, [currentPage, open, setCurrentPage, step.id, step.page]);

  const resolveTargetRect = useCallback(() => {
    if (!step.targetId || typeof window === "undefined") {
      setTargetRect(null);
      return false;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-tip-id="${step.targetId}"]`,
    );
    if (!element) {
      setTargetRect(null);
      return false;
    }
    if (scrolledStepRef.current !== step.id) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      scrolledStepRef.current = step.id;
    }
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    if (!visible) {
      setTargetRect(null);
      return false;
    }
    setTargetRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    return true;
  }, [step.targetId]);

  useEffect(() => {
    if (!open) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      const found = resolveTargetRect();
      if (!found && frames < 80) {
        frames += 1;
        raf = window.requestAnimationFrame(tick);
      }
    };
    tick();
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [open, resolveTargetRect, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      resolveTargetRect();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, resolveTargetRect]);

  useLayoutEffect(() => {
    if (!open) return;
    const node = cardRef.current;
    if (!node) return;
    const syncSize = () => {
      setCardSize({
        width: node.offsetWidth || 460,
        height: node.offsetHeight || 240,
      });
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [open, stepIndex]);

  const completeTips = () => {
    if (typeof window !== "undefined" && !forceTips) {
      window.localStorage.setItem(TIPS_STORAGE_KEY, "done");
    }
    setOpen(false);
    setStepIndex(0);
    setTargetRect(null);
  };

  const cardPosition = useMemo(() => {
    if (!targetRect || viewport.width === 0 || viewport.height === 0) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
    const gap = 16;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    let left = targetCenterX - cardSize.width / 2;
    let top = targetRect.top - cardSize.height - gap;

    switch (step.placement ?? "top") {
      case "bottom":
        top = targetRect.top + targetRect.height + gap;
        left = targetCenterX - cardSize.width / 2;
        break;
      case "left":
        top = targetCenterY - cardSize.height / 2;
        left = targetRect.left - cardSize.width - gap;
        break;
      case "right":
        top = targetCenterY - cardSize.height / 2;
        left = targetRect.left + targetRect.width + gap;
        break;
      case "top":
      default:
        top = targetRect.top - cardSize.height - gap;
        left = targetCenterX - cardSize.width / 2;
        break;
    }

    const padding = 12;
    left = clamp(left, padding, viewport.width - cardSize.width - padding);
    top = clamp(top, padding, viewport.height - cardSize.height - padding);

    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      transform: "none",
    };
  }, [cardSize.height, cardSize.width, step.placement, targetRect, viewport]);

  const reopenTips = () => {
    setStepIndex(0);
    setTargetRect(null);
    scrolledStepRef.current = null;
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Show tips"
        title="Show Tips"
        onClick={reopenTips}
        className="fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:bg-secondary/50"
      >
        <Info size={18} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      {targetRect ? (
        <div
          className="pointer-events-none fixed rounded-xl border-2 border-accent/90"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.72)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/72" />
      )}

      <div
        ref={cardRef}
        className="fixed max-h-[calc(100vh-24px)] w-[min(460px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
        style={cardPosition}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-widest text-foreground/60">
            New User Tips
          </p>
          <p className="text-xs font-mono text-foreground/50">
            {stepIndex + 1}/{steps.length}
          </p>
        </div>

        <h3 className="text-2xl font-bold">{step.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          {step.description}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            type="button"
            onClick={completeTips}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Skip
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className="bg-secondary text-foreground hover:bg-secondary/80"
              disabled={isFirst}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (isLast) {
                  completeTips();
                  return;
                }
                setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
