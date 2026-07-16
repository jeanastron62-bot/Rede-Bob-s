import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
          <button
            onClick={onClose}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 text-white"
            aria-label="Fechar"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
