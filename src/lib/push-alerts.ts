// Web Push on iPhone and iPad works only for the app installed to the home screen. The hint is shown
// only where it applies, so other devices never see it.

export function shouldShowIosHint(userAgent: string, standalone: boolean): boolean {
  return /iPad|iPhone/.test(userAgent) && !standalone;
}
