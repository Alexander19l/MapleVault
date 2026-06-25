import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'watching' | 'completed' | 'pending' | 'dropped' | 'default' | 'accent';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = ''
}) => {
  const baseStyle = "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider select-none border";

  const variants = {
    watching: "bg-[var(--status-watching)]/10 text-[var(--status-watching)] border-[var(--status-watching)]/20",
    completed: "bg-[var(--status-completed)]/10 text-[var(--status-completed)] border-[var(--status-completed)]/20",
    pending: "bg-[var(--status-pending)]/10 text-[var(--status-pending)] border-[var(--status-pending)]/20",
    dropped: "bg-[var(--status-dropped)]/10 text-[var(--status-dropped)] border-[var(--status-dropped)]/20",
    default: "bg-slate-800 text-[var(--text-muted)] border-slate-700/50",
    accent: "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/20"
  };

  return (
    <span className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};
