/** Firestore location for the optional "New Arrivals" section background image. */
export const NEW_ARRIVALS_BACKGROUND_COLLECTION = 'site_settings';
export const NEW_ARRIVALS_BACKGROUND_DOC = 'new_arrivals_background';

export type NewArrivalsBackgroundSettings = {
  enabled: boolean;
  imageUrl: string;
};

export const DEFAULT_NEW_ARRIVALS_BACKGROUND: NewArrivalsBackgroundSettings = {
  enabled: false,
  imageUrl: '',
};

/** Enabled only means something once an image actually exists — keeps the homepage render trivial. */
export function parseNewArrivalsBackground(data: Record<string, unknown> | undefined): NewArrivalsBackgroundSettings {
  const imageUrl = typeof data?.imageUrl === 'string' ? data.imageUrl : '';
  return {
    enabled: data?.enabled === true && imageUrl.trim().length > 0,
    imageUrl,
  };
}
