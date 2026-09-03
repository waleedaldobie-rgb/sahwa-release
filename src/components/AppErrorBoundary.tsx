// @ts-nocheck
import React from 'react';

interface AppErrorBoundaryProps {
  children?: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  readonly props: Readonly<AppErrorBoundaryProps>;
  state: AppErrorBoundaryState = { hasError: false };

  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء تحميل الشاشة'
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Renderer error boundary caught an error', { error, componentStack: info.componentStack });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <section
        role="alert"
        className="min-h-[360px] flex flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center"
      >
        <h2 className="text-lg font-black text-rose-900">تعذر تحميل هذه الشاشة</h2>
        <p className="max-w-xl text-sm font-bold text-rose-800">
          حدث خطأ غير متوقع. يمكنك إعادة تحميل الواجهة والمحاولة مرة أخرى.
        </p>
        {this.state.message && <p className="max-w-xl text-xs text-rose-700/80">{this.state.message}</p>}
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-xl bg-rose-900 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          إعادة تحميل الواجهة
        </button>
      </section>
    );
  }
}
