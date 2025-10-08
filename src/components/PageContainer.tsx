import { ReactNode } from 'react';

const PageContainer = ({ children, title }: { children: ReactNode; title?: string }) => {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {title && <h2 className="text-2xl font-bold mb-4">{title}</h2>}
      <div className="space-y-6">{children}</div>
    </div>
  );
};

export default PageContainer;
