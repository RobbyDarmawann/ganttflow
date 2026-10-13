import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    icon?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'md' | 'lg';
}

export default function Modal({
    open,
    onClose,
    title,
    description,
    icon,
    children,
    footer,
    size = 'md',
}: ModalProps) {
    useEffect(() => {
        if (!open) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex overflow-y-auto p-4"
            data-modal-root
        >
            <button
                type="button"
                aria-label="Tutup"
                onClick={onClose}
                className="fixed inset-0 cursor-default bg-gray-900/50"
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cn(
                    'relative z-10 m-auto flex w-full flex-col rounded-md bg-white shadow-lg',
                    size === 'lg' ? 'max-w-3xl' : 'max-w-2xl',
                )}
                data-modal-dialog
            >
                <header className="flex items-start gap-2 border-b border-gray-200 px-4 py-3">
                    {icon ? (
                        <span className="mt-0.5 shrink-0 text-gray-400">
                            {icon}
                        </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-gray-900">
                            {title}
                        </h2>
                        {description ? (
                            <p className="mt-0.5 text-xs text-gray-500">
                                {description}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="-mt-1 -mr-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="px-4 py-4">{children}</div>

                {footer ? (
                    <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
                        {footer}
                    </footer>
                ) : null}
            </div>
        </div>
    );
}
