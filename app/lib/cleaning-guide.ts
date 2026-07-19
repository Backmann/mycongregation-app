/**
 * Kingdom Hall cleaning guide: job-card data derived from the congregation's
 * cleaning instructions. Step pictograms are bundled WebP tiles under
 * assets/cleaning/; captions live in i18n under cleaningGuide.steps.*.
 *
 * The color per category is not decoration — it mirrors the real color-coding
 * of buckets/cloths used in the hall (red = toilet, yellow = sanitary,
 * blue = surfaces, green = kitchen), so the UI must keep it.
 */

export type CleaningFrequency = 'zsk' | 'weekly' | 'yearly';

export const CLEANING_FREQUENCIES: CleaningFrequency[] = [
  'zsk',
  'weekly',
  'yearly',
];

export interface CleaningStep {
  /** i18n suffix under cleaningGuide.steps.<category>, e.g. 'zsk1'. */
  key: string;
  image: number; // static require() id
}

export interface CleaningCategory {
  id: 'wc' | 'sanitary' | 'floors' | 'furniture' | 'glass' | 'kitchen';
  /** Real bucket/cloth color used in the hall for this area. */
  color: string;
  /** Soft background tint for the category card. */
  tint: string;
  /** Width / height of this category's materials strip. */
  materialsAspect: number;
  icon: string; // Ionicons name
  materials: number;
  steps: Partial<Record<CleaningFrequency, CleaningStep[]>>;
}

/**
 * Width / height of each materials strip, measured from the file. They differ
 * (3.29 … 5.54), so a single shared ratio letterboxed the odd ones — the
 * sanitary strip lost a third of its width to white.
 */
export const MATERIALS_ASPECT = 5.16;

export const TECHNIK_BLOCKS: {
  key: 'ladder' | 'rules';
  image: number;
  aspect: number;
}[] = [
  {
    key: 'rules',
    image: require('../assets/cleaning/technik-rules.webp'),
    aspect: 5.81,
  },
  {
    key: 'ladder',
    image: require('../assets/cleaning/technik-ladder.webp'),
    aspect: 3.11,
  },
];

function steps(
  category: string,
  freq: CleaningFrequency,
  images: number[],
): CleaningStep[] {
  return images.map((image, i) => ({ key: `${freq}${i + 1}`, image }));
}

export const CLEANING_CATEGORIES: CleaningCategory[] = [
  {
    id: 'wc',
    color: '#dc2626',
    tint: '#fef2f2',
    materialsAspect: 5.357,
    icon: 'water-outline',
    materials: require('../assets/cleaning/wc-materials.webp'),
    steps: {
      zsk: steps('wc', 'zsk', [
        require('../assets/cleaning/wc-zsk-1.webp'),
        require('../assets/cleaning/wc-zsk-2.webp'),
        require('../assets/cleaning/wc-zsk-3.webp'),
        require('../assets/cleaning/wc-zsk-4.webp'),
      ]),
      weekly: steps('wc', 'weekly', [
        require('../assets/cleaning/wc-weekly-1.webp'),
        require('../assets/cleaning/wc-weekly-2.webp'),
        require('../assets/cleaning/wc-weekly-3.webp'),
        require('../assets/cleaning/wc-weekly-4.webp'),
        require('../assets/cleaning/wc-weekly-5.webp'),
      ]),
    },
  },
  {
    id: 'sanitary',
    color: '#d97706',
    tint: '#fffbeb',
    materialsAspect: 3.293,
    icon: 'hand-left-outline',
    materials: require('../assets/cleaning/sanitary-materials.webp'),
    steps: {
      zsk: steps('sanitary', 'zsk', [
        require('../assets/cleaning/sanitary-zsk-1.webp'),
        require('../assets/cleaning/sanitary-zsk-2.webp'),
        require('../assets/cleaning/sanitary-zsk-3.webp'),
      ]),
      weekly: steps('sanitary', 'weekly', [
        require('../assets/cleaning/sanitary-weekly-1.webp'),
        require('../assets/cleaning/sanitary-weekly-2.webp'),
        require('../assets/cleaning/sanitary-weekly-3.webp'),
        require('../assets/cleaning/sanitary-weekly-4.webp'),
      ]),
      yearly: steps('sanitary', 'yearly', [
        require('../assets/cleaning/sanitary-yearly-1.webp'),
        require('../assets/cleaning/sanitary-yearly-2.webp'),
        require('../assets/cleaning/sanitary-yearly-3.webp'),
      ]),
    },
  },
  {
    id: 'floors',
    color: '#2563eb',
    tint: '#eff6ff',
    materialsAspect: 5.425,
    icon: 'grid-outline',
    materials: require('../assets/cleaning/floors-materials.webp'),
    steps: {
      zsk: steps('floors', 'zsk', [
        require('../assets/cleaning/floors-zsk-1.webp'),
        require('../assets/cleaning/floors-zsk-2.webp'),
        require('../assets/cleaning/floors-zsk-3.webp'),
      ]),
      weekly: steps('floors', 'weekly', [
        require('../assets/cleaning/floors-weekly-1.webp'),
      ]),
    },
  },
  {
    id: 'furniture',
    color: '#0284c7',
    tint: '#f0f9ff',
    materialsAspect: 5.04,
    icon: 'business-outline',
    materials: require('../assets/cleaning/furniture-materials.webp'),
    steps: {
      zsk: steps('furniture', 'zsk', [
        require('../assets/cleaning/furniture-zsk-1.webp'),
        require('../assets/cleaning/furniture-zsk-2.webp'),
        require('../assets/cleaning/furniture-zsk-3.webp'),
        require('../assets/cleaning/furniture-zsk-4.webp'),
      ]),
      weekly: steps('furniture', 'weekly', [
        require('../assets/cleaning/furniture-weekly-1.webp'),
        require('../assets/cleaning/furniture-weekly-2.webp'),
        require('../assets/cleaning/furniture-weekly-3.webp'),
      ]),
      yearly: steps('furniture', 'yearly', [
        require('../assets/cleaning/furniture-yearly-1.webp'),
        require('../assets/cleaning/furniture-yearly-2.webp'),
        require('../assets/cleaning/furniture-yearly-3.webp'),
        require('../assets/cleaning/furniture-yearly-4.webp'),
      ]),
    },
  },
  {
    id: 'glass',
    color: '#0891b2',
    tint: '#ecfeff',
    materialsAspect: 5.063,
    icon: 'tablet-portrait-outline',
    materials: require('../assets/cleaning/glass-materials.webp'),
    steps: {
      zsk: steps('glass', 'zsk', [
        require('../assets/cleaning/glass-zsk-1.webp'),
        require('../assets/cleaning/glass-zsk-2.webp'),
      ]),
      weekly: steps('glass', 'weekly', [
        require('../assets/cleaning/glass-weekly-1.webp'),
        require('../assets/cleaning/glass-weekly-2.webp'),
        require('../assets/cleaning/glass-weekly-3.webp'),
        require('../assets/cleaning/glass-weekly-4.webp'),
      ]),
    },
  },
  {
    id: 'kitchen',
    color: '#16a34a',
    tint: '#f0fdf4',
    materialsAspect: 5.537,
    icon: 'restaurant-outline',
    materials: require('../assets/cleaning/kitchen-materials.webp'),
    steps: {
      weekly: steps('kitchen', 'weekly', [
        require('../assets/cleaning/kitchen-weekly-1.webp'),
        require('../assets/cleaning/kitchen-weekly-2.webp'),
        require('../assets/cleaning/kitchen-weekly-3.webp'),
      ]),
    },
  },
];
