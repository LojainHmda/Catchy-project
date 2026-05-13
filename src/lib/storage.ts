
// Mock data storage using localStorage
const STORAGE_KEYS = {
  PRODUCTS: 'catchy_products',
  HERO_SLIDES: 'catchy_hero_slides',
  USERS: 'catchy_users',
  ORDERS: 'catchy_orders',
  STOCK: 'catchy_stock',
};

const INITIAL_PRODUCTS = [
  {
    id: '1',
    name: 'Tailored Dress Pants',
    price: 120,
    stock: 50,
    category: 'Pants',
    images: ['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Slim Fit Trousers',
    price: 95,
    stock: 30,
    category: 'Pants',
    images: ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Wide Leg Chinos',
    price: 85,
    stock: 40,
    category: 'Pants',
    images: ['https://images.unsplash.com/photo-1624378439575-d8705ad7e357?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'High-Waisted Jeans',
    price: 110,
    stock: 25,
    category: 'Pants',
    images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'Classic Silk Top',
    price: 80,
    stock: 60,
    category: 'Tops',
    images: ['https://images.unsplash.com/photo-1551163943-3f6a7bca6094?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
  {
    id: '6',
    name: 'Elegant Summer Dress',
    price: 150,
    stock: 20,
    category: 'Dresses',
    images: ['https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600'],
    createdAt: new Date().toISOString(),
  },
];

const INITIAL_HERO_SLIDES = [
  {
    id: 'h1',
    url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide1.title",
    subtitle: "hero.slide1.subtitle",
    order: 1
  },
  {
    id: 'h2',
    url: "https://images.unsplash.com/photo-1539109132374-348058a1f7b6?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide2.title",
    subtitle: "hero.slide2.subtitle",
    order: 2
  }
];

export const getFromStorage = <T>(key: string, defaultValue: T): T => {
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  return JSON.parse(stored);
};

export const saveToStorage = <T>(key: string, value: T): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

// Initialize storage if empty
export const initStorage = () => {
  getFromStorage(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  getFromStorage(STORAGE_KEYS.HERO_SLIDES, INITIAL_HERO_SLIDES);
  getFromStorage(STORAGE_KEYS.USERS, []);
  getFromStorage(STORAGE_KEYS.ORDERS, []);
};

export { STORAGE_KEYS };
