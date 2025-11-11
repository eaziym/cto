import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fullScreen?: boolean; // Add fullScreen prop
}

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  fullScreen = false
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`overflow-hidden rounded-2xl bg-white shadow-2xl ${
          fullScreen
            ? 'max-h-[95vh] w-full max-w-7xl'
            : 'max-h-[90vh] w-full max-w-3xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close dialog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M15.78 4.22a.75.75 0 0 0-1.06 0L10 8.94 5.28 4.22a.75.75 0 1 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 1 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0 0-1.06"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-6">{children}</div>
        {footer && <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
