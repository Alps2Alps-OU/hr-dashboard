interface RAGBadgeProps {
  status: 'green' | 'amber' | 'red';
  label?: string;
}

const CONFIG = {
  green: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500', label: 'On Track' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500', label: 'At Risk' },
  red:   { bg: 'bg-red-100',   text: 'text-red-800',   dot: 'bg-red-500',   label: 'Breach'   },
};

export default function RAGBadge({ status, label }: RAGBadgeProps) {
  const c = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label ?? c.label}
    </span>
  );
}
