interface KPICardProps {
  title: string;
  value: string | number | null;
  subtitle?: string;
  gradient: string;
  icon?: string;
  warning?: boolean;
}

export default function KPICard({ title, value, subtitle, gradient, icon, warning }: KPICardProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl p-5 text-white shadow-md ${gradient}`}>
      {icon && <div className="absolute top-3 right-4 text-2xl opacity-30 select-none">{icon}</div>}
      <div className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-1">{title}</div>
      <div className={`text-3xl font-bold tracking-tight ${warning ? 'text-yellow-200' : ''}`}>
        {value === null || value === undefined ? '—' : value}
      </div>
      {subtitle && <div className="text-xs opacity-70 mt-1">{subtitle}</div>}
      {warning && <div className="text-xs text-yellow-200 mt-1 font-medium">⚠ Below 80% target</div>}
    </div>
  );
}
