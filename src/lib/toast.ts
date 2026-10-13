import { toast as sonnerToast } from "sonner"

// App toasts. Errors stay on screen until dismissed (DESIGN_SYSTEM §10); the others close after sonner's default.
// Import `toast` from here rather than from "sonner" so every error keeps its close button and stays up.
export const toast = Object.assign(
  (message: Parameters<typeof sonnerToast>[0], data?: Parameters<typeof sonnerToast>[1]) => sonnerToast(message, data),
  {
    success: sonnerToast.success,
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    error: (message: Parameters<typeof sonnerToast.error>[0], data?: Parameters<typeof sonnerToast.error>[1]) =>
      sonnerToast.error(message, { duration: Infinity, closeButton: true, ...data }),
  }
);
