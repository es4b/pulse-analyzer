'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'gray';
}

const variants = {
  default: 'bg-[#1D1D1F] text-white',
  success: 'bg-[#22C55E]/10 text-[#22C55E]',
  warning: 'bg-[#F59E0B]/10 text-[#F59E0B]',
  error: 'bg-[#EF4444]/10 text-[#EF4444]',
  gray: 'bg-[#E5E5E5] text-[#86868B]',
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
