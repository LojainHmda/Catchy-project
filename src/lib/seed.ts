import { db, collection, addDoc, serverTimestamp, query, where, getDocs } from '../firebase';

export async function seedDressPants() {
  try {
    const productsCollection = collection(db, 'products');
    
    const products = [
      {
        name: 'Tailored Dress Pants',
        price: 120,
        stock: 50,
        category: 'Pants',
        images: ['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
      {
        name: 'Slim Fit Trousers',
        price: 95,
        stock: 30,
        category: 'Pants',
        images: ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
      {
        name: 'Wide Leg Chinos',
        price: 85,
        stock: 40,
        category: 'Pants',
        images: ['https://images.unsplash.com/photo-1624378439575-d8705ad7e357?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
      {
        name: 'High-Waisted Jeans',
        price: 110,
        stock: 25,
        category: 'Pants',
        images: ['https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
      {
        name: 'Classic Silk Top',
        price: 80,
        stock: 60,
        category: 'Tops',
        images: ['https://images.unsplash.com/photo-1551163943-3f6a7bca6094?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
      {
        name: 'Elegant Summer Dress',
        price: 150,
        stock: 20,
        category: 'Dresses',
        images: ['https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&q=80&w=600'],
        createdAt: serverTimestamp(),
      },
    ];

    for (const product of products) {
      const q = query(productsCollection, where('name', '==', product.name));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await addDoc(productsCollection, product);
        console.log(`Added product: ${product.name}`);
      } else {
        console.log(`Product already exists: ${product.name}, skipping`);
      }
    }
    console.log('Seeding process complete');
  } catch (error) {
    console.error('Error seeding products:', error);
  }
}
