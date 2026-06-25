import type { ToastType } from '../components/ui/Toast';

export type NotifyDetail = {
  type: ToastType;
  message: string;
  duration?: number;
};

export function notify(type: ToastType, message: string, duration?: number) {
  window.dispatchEvent(new CustomEvent<NotifyDetail>('maplevault:toast', {
    detail: { type, message, duration }
  }));
}

export const notifications = {
  success: (message: string, duration?: number) => notify('success', message, duration),
  error: (message: string, duration?: number) => notify('error', message, duration),
  warning: (message: string, duration?: number) => notify('warning', message, duration),
  info: (message: string, duration?: number) => notify('info', message, duration)
};
