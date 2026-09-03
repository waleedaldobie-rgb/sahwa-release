// @ts-nocheck
import React from 'react';
import { X, AlertCircle, CheckCircle2, Info, Loader2, ArrowDown, ArrowDownUp, ArrowUp } from 'lucide-react';

// =================== BUTTON COMPONENT ===================
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline-dark' | 'outline-amber';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  isLoading,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses =
    'sahwa-button inline-flex items-center justify-center cursor-pointer select-none whitespace-nowrap tracking-tight';

  const sizeClasses = {
    sm: 'h-9 px-4 text-xs gap-1.5 min-w-[70px]',
    md: 'h-11 px-5 text-sm gap-2 min-w-[90px]',
    lg: 'h-12 px-6 text-base gap-2.5 min-w-[110px]'
  };

  const variantClasses = {
    primary: 'sahwa-button--primary',
    secondary: 'sahwa-button--secondary',
    'outline-dark': 'sahwa-button--outline-dark',
    'outline-amber': 'sahwa-button--outline-amber',
    ghost: 'sahwa-button--ghost',
    danger: 'sahwa-button--danger',
    success: 'sahwa-button--success'
  };

  return (
    <button
      type="button"
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        icon && <span className="inline-flex shrink-0" aria-hidden={Boolean(children)}>{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};

// =================== TOOLTIP COMPONENT ===================
export interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const tooltipId = React.useId();
  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' ')
      })
    : children;

  return (
    <span className="sahwa-tooltip">
      {trigger}
      <span id={tooltipId} className="sahwa-tooltip-content" role="tooltip">
        {content}
      </span>
    </span>
  );
};

// =================== SORTABLE TABLE HEADER ===================
export type SortDirection = 'asc' | 'desc';

export interface SortHeaderProps {
  label: string;
  active?: boolean;
  direction?: SortDirection;
  onClick: () => void;
  align?: 'right' | 'center' | 'left';
}

export const SortHeader: React.FC<SortHeaderProps> = ({
  label,
  active = false,
  direction = 'asc',
  onClick,
  align = 'right'
}) => {
  const Icon = !active ? ArrowDownUp : direction === 'asc' ? ArrowUp : ArrowDown;
  const alignmentClass = align === 'center' ? 'justify-center' : align === 'left' ? 'justify-start' : 'justify-end';

  return (
    <button
      type="button"
      className={`sahwa-sort-header ${alignmentClass}`}
      data-active={active}
      aria-label={`فرز حسب ${label}`}
      title={`فرز حسب ${label}${active ? ` (${direction === 'asc' ? 'تصاعدي' : 'تنازلي'})` : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
};

// =================== SEGMENTED CONTROL COMPONENT ===================
export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string = string>({ value, options, onChange, ariaLabel, className = '' }: SegmentedControlProps<T>) {
  return (
    <div className={`sahwa-segmented-control ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className="sahwa-segmented-control__button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// =================== CARD COMPONENT ===================
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  headerIcon?: React.ReactNode;
  bodyClassName?: string;
  headerOnly?: boolean;
  accentBorder?: 'amber' | 'emerald' | 'red' | 'slate' | 'none';
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  action,
  headerIcon,
  bodyClassName = '',
  headerOnly = false,
  accentBorder = 'none',
  className = '',
  ...props
}) => {
  const accentBorderMap = {
    none: '',
    amber: 'border-r-4 border-r-[#111111]',
    emerald: 'border-r-4 border-r-[#10B981]',
    red: 'border-r-4 border-r-[#EF4444]',
    slate: 'border-r-4 border-r-[#6B7280]'
  };

  return (
    <div
      className={`ui-card sahwa-card transition-[box-shadow,border-color] duration-200 ${accentBorderMap[accentBorder]} ${className}`}
      {...props}
    >
      {(title || action || headerIcon) && (
        <div className="ui-card-header sahwa-card-header flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            {headerIcon && (
              <div className="sahwa-card-icon w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                {headerIcon}
              </div>
            )}
            <div>
              {title && <h3 className="sahwa-card-title text-[15px] font-black tracking-tight">{title}</h3>}
              {subtitle && <p className="sahwa-card-subtitle text-[12px] mt-0.5 font-black">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      {!headerOnly && <div className={`ui-card-body sahwa-card-body ${bodyClassName}`}>{children}</div>}
    </div>
  );
};

// =================== EMPTY STATE COMPONENT ===================
export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
  className = ''
}) => {
  return (
    <div className={`sahwa-empty-state ${compact ? 'sahwa-empty-state--compact' : ''} ${className}`} role="status" aria-live="polite">
      <div className="sahwa-empty-state-icon">
        {icon}
      </div>
      <h4 className="sahwa-empty-state-title">{title}</h4>
      {description && <p className="sahwa-empty-state-description">{description}</p>}
      {action && <div className="sahwa-empty-state-action">{action}</div>}
    </div>
  );
};

// =================== MODAL COMPONENT ===================
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | 'full';
  allowPrint?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'lg',
  allowPrint = false
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const modalId = React.useId();

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const titleId = `modal-title-${modalId}`;

  React.useEffect(() => {
    if (!isOpen || allowPrint) return;

    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirstControl = () => {
      const firstFocusable = dialog?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (firstFocusable || dialog)?.focus();
    };

    const frame = window.requestAnimationFrame(focusFirstControl);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && document.body.contains(previousActiveElement.current)) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, allowPrint]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    full: 'max-w-[95vw]'
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto ${allowPrint ? 'modal-print-host' : 'no-print'}`}>
      {/* Dimmed Overlay */}
      <div
        className={`sahwa-modal-overlay fixed inset-0 transition-opacity duration-300 ${allowPrint ? 'no-print' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={allowPrint ? undefined : true}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sahwa-modal relative w-full ${maxWidthClasses[maxWidth]} overflow-hidden flex flex-col my-auto max-h-[92vh] z-10 animate-in fade-in zoom-in duration-200 ${allowPrint ? 'modal-print-dialog' : ''}`}
      >
        {/* Header */}
        <div className={`sahwa-modal-header flex items-center justify-between px-8 py-6 ${allowPrint ? 'no-print' : ''}`}>
          <h3 id={titleId} className="text-lg font-black text-[var(--color-text-token)] tracking-tight">{title}</h3>
          <Tooltip content="إغلاق النافذة">
            <button
              type="button"
              onClick={onClose}
              className="sahwa-modal-close sahwa-button w-10 h-10 rounded-full flex items-center justify-center focus:outline-none cursor-pointer"
              aria-label="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        {/* Content Body */}
        <div className={`sahwa-modal-body p-8 overflow-y-auto flex-1 ${allowPrint ? 'modal-print-body' : ''}`}>{children}</div>

        {/* Footer */}
        {footer && (
          <div className={`sahwa-modal-footer flex items-center justify-end gap-4 px-8 py-6 ${allowPrint ? 'no-print' : ''}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// =================== TOAST NOTIFICATION ===================
export interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  actionLabel?: string;
  onAction?: () => void;
}

export const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({
  toast,
  onClose
}) => {
  if (!toast.show) return null;

  const bgBorderMap = {
    success: 'bg-white text-emerald-900 border-emerald-100 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.2)]',
    danger: 'bg-white text-rose-900 border-rose-100 shadow-[0_10px_30px_-10px_rgba(225,29,72,0.2)]',
    warning: 'bg-white text-amber-900 border-amber-100 shadow-[0_10px_30px_-10px_rgba(245,158,11,0.2)]',
    info: 'bg-white text-sky-900 border-sky-100 shadow-[0_10px_30px_-10px_rgba(14,165,233,0.2)]'
  };

  const iconMap = {
    success: <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" /></div>,
    danger: <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center"><AlertCircle className="w-6 h-6 text-rose-600 shrink-0" /></div>,
    warning: <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center"><AlertCircle className="w-6 h-6 text-amber-600 shrink-0" /></div>,
    info: <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center"><Info className="w-6 h-6 text-sky-600 shrink-0" /></div>
  };

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] no-print animate-in slide-in-from-top duration-300 w-[calc(100vw-2rem)] max-w-lg">
      <div
        role={toast.type === 'danger' ? 'alert' : 'status'}
        aria-live={toast.type === 'danger' ? 'assertive' : 'polite'}
        className={`flex items-center gap-4 px-6 py-4 border min-w-0 w-full rounded-2xl ${bgBorderMap[toast.type]}`}
      >
        <span aria-hidden="true">{iconMap[toast.type]}</span>
        <span className="text-sm font-black flex-1 break-words whitespace-pre-line">{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
              <button
              type="button"
              onClick={() => { toast.onAction?.(); onClose(); }}
              aria-label={toast.actionLabel}
              className="mr-2 px-4 py-2 rounded-xl bg-[#111111] text-white text-xs font-black hover:bg-[#2A2A2A] transition-all"
            >
              {toast.actionLabel}
            </button>
          )}
          <Tooltip content="إغلاق الإشعار">
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق الإشعار"
              className="text-[#9CA3AF] hover:text-[#111111] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b08a4a] focus-visible:ring-offset-2 transition-colors p-2 rounded-full hover:bg-[#F3F4F6]"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
      </div>
    </div>
  );
};

// =================== LOADING SPINNER ===================
export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'جاري التحميل...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-16 gap-4 text-[#6B7280]">
      <Loader2 className="w-10 h-10 animate-spin text-[#111111]" />
      <span className="text-sm font-black">{label}</span>
    </div>
  );
};

// =================== BADGE COMPONENT ===================
export type BadgeVariant = 'slate' | 'amber' | 'emerald' | 'red' | 'blue';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const getOrderStatusBadgeVariant = (status: string, cancellationWriteoffAmount = 0): BadgeVariant => {
  if (status === 'cancelled') return Number(cancellationWriteoffAmount) > 0 ? 'blue' : 'red';
  if (status === 'new') return 'blue';
  if (status === 'processing') return 'amber';
  if (status === 'ready') return 'emerald';
  if (status === 'delivered') return 'slate';
  return 'slate';
};

export const getInvoiceStatusBadgeVariant = (status: string): BadgeVariant => {
  if (status === 'paid') return 'emerald';
  if (status === 'partial') return 'amber';
  if (status === 'unpaid') return 'red';
  if (status === 'settled_by_cancellation') return 'blue';
  return 'slate';
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'slate',
  children,
  className = ''
}) => {
  const variantMap: Record<BadgeVariant, string> = {
    slate: 'sahwa-badge--neutral',
    amber: 'sahwa-badge--pending',
    emerald: 'sahwa-badge--success',
    red: 'sahwa-badge--danger',
    blue: 'sahwa-badge--info'
  };

  return (
    <span className={`sahwa-badge ${variantMap[variant]} ${className}`}>
      {children}
    </span>
  );
};

// =================== FORM FIELD HELPERS ===================
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  icon,
  className = '',
  ...props
}, ref) => {
  const fieldId = React.useId();
  const errorId = `${fieldId}-error`;
  const describedBy = error ? [props['aria-describedby'], errorId].filter(Boolean).join(' ') : props['aria-describedby'];

  return (
    <div className="w-full">
      {label && <label htmlFor={props.id || fieldId} className="sahwa-field-label block text-[13px] font-black mb-2">{label}</label>}
      <div className="relative flex items-center group">
        {icon && <span className="sahwa-field-icon absolute right-4 pointer-events-none">{icon}</span>}
        <input
          className={`sahwa-field w-full text-sm ${icon ? 'pr-11 pl-4' : 'px-4'} ${
            error ? 'sahwa-field--error' : ''
          } ${className}`}
          {...props}
          ref={ref}
          id={props.id || fieldId}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={describedBy}
        />
      </div>
      {error && <p id={errorId} role="alert" className="sahwa-field-error text-xs font-bold mt-1.5">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  children,
  className = '',
  ...props
}) => {
  const fieldId = React.useId();
  const errorId = `${fieldId}-error`;
  const describedBy = error ? [props['aria-describedby'], errorId].filter(Boolean).join(' ') : props['aria-describedby'];

  return (
    <div className="w-full">
      {label && <label htmlFor={props.id || fieldId} className="sahwa-field-label block text-[13px] font-black mb-2">{label}</label>}
      <select
        className={`sahwa-field w-full text-sm appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23707070%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat ${
            error ? 'sahwa-field--error' : ''
          } ${className}`}

        {...props}
        id={props.id || fieldId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      {error && <p id={errorId} role="alert" className="sahwa-field-error text-xs font-bold mt-1.5">{error}</p>}
    </div>
  );
};
