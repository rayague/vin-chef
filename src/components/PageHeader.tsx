import { ReactNode } from 'react';

const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => {
  return (
    <header className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
};

export default PageHeader;
