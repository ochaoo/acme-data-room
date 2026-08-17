'use client';

import { useEffect } from 'react';

type ModalProps = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: 'normal' | 'wide';
};

export function Modal({ title, children, onClose, size = 'normal' }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        role="dialog"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${size === 'wide' ? 'max-w-4xl' : 'max-w-lg'}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
