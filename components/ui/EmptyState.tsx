'use client';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-10 h-10 rounded-full bg-[#F5F5F7] flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 3a7 7 0 100 14A7 7 0 0010 3z"
            stroke="#86868B"
            strokeWidth="1.5"
          />
          <path d="M10 7v3m0 3h.01" stroke="#86868B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-[#1D1D1F] text-sm font-medium">{title}</p>
        {description && <p className="text-[#86868B] text-sm mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
