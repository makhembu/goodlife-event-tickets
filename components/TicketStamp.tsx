"use client";

import { motion } from "motion/react";

interface TicketStampProps {
  text: string;
  variant: "success" | "fail" | "used";
  className?: string;
}

const variants = {
  success: {
    border: "border-green-600",
    text: "text-green-700",
    bg: "bg-green-100",
    shadow: "shadow-[4px_4px_0px_0px_#16a34a]",
    rotate: -6,
  },
  fail: {
    border: "border-red-600",
    text: "text-red-700",
    bg: "bg-red-100",
    shadow: "shadow-[4px_4px_0px_0px_#dc2626]",
    rotate: 8,
  },
  used: {
    border: "border-amber-600",
    text: "text-amber-700",
    bg: "bg-amber-100",
    shadow: "shadow-[4px_4px_0px_0px_#d97706]",
    rotate: -4,
  },
};

export default function TicketStamp({ text, variant: v, className = "" }: TicketStampProps) {
  const style = variants[v];

  return (
    <motion.div
      initial={{ scale: 0, rotate: style.rotate - 15, opacity: 0 }}
      animate={{ scale: 1, rotate: style.rotate, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 18,
        mass: 0.8,
      }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border-3 ${style.border} ${style.bg} ${style.text} ${style.shadow} font-black uppercase text-sm tracking-[0.15em] select-none ${className}`}
      aria-live="polite"
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {v === "success" ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <line x1="18" y1="6" x2="6" y2="18" />
        )}
        {v !== "success" && <line x1="6" y1="6" x2="18" y2="18" />}
      </svg>
      {text}
    </motion.div>
  );
}
