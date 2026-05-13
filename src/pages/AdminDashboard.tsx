import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, collection, getDocs, query, orderBy, limit, addDoc, serverTimestamp } from '../firebase';
import { Package, ShoppingCart, Users, TrendingUp, ArrowUpRight, ArrowDownRight, Database, Loader2, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    users: 0,
    revenue: 0
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const { loading: authLoading, role } = useAuth();

  const seedData = async () => {
    setIsSeeding(true);
    const dummyProducts = [
      {
        name: "Emerald Silk Evening Gown",
        price: 245,
        category: "Dresses",
        description: "A stunning emerald green silk gown with a deep V-neck and elegant floor-length silhouette. Perfect for high-end evening events.",
        images: ["https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&q=80&w=1000"],
        stock: 12,
        createdAt: serverTimestamp()
      },
      {
        name: "Midnight Velvet Blazer",
        price: 185,
        category: "Jackets",
        description: "Sophisticated midnight blue velvet blazer with satin lapels. Part of our signature evening set collection.",
        images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=1000"],
        stock: 8,
        createdAt: serverTimestamp()
      },
      {
        name: "Ivory Lace Cocktail Dress",
        price: 195,
        category: "Dresses",
        description: "Delicate ivory lace overlay with a silk lining. Features a modern midi length and intricate floral patterns.",
        images: ["https://images.unsplash.com/photo-1539008835279-434674508233?auto=format&fit=crop&q=80&w=1000"],
        stock: 15,
        createdAt: serverTimestamp()
      },
      {
        name: "Golden Hour Satin Set",
        price: 165,
        category: "Formal Sets",
        description: "Two-piece satin set in a warm golden hue. Includes a cropped top and high-waisted wide-leg trousers.",
        images: ["https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000"],
        stock: 5,
        createdAt: serverTimestamp()
      },
      {
        name: "Pearl Embellished Top",
        price: 85,
        category: "Tops",
        description: "Elegant sheer top with hand-sewn pearl embellishments along the neckline and cuffs.",
        images: ["https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&q=80&w=1000"],
        stock: 20,
        createdAt: serverTimestamp()
      },
      {
        name: "Onyx Leather Mini Skirt",
        price: 125,
        category: "Skirts",
        description: "Premium black leather mini skirt with a subtle gloss finish and silver hardware details.",
        images: ["https://images.unsplash.com/photo-1548624149-f9b1859aa700?auto=format&fit=crop&q=80&w=1000"],
        stock: 10,
        createdAt: serverTimestamp()
      },
      {
        name: "Tailored Wool Trousers",
        price: 145,
        category: "Pants",
        description: "High-waisted tailored wool trousers in charcoal grey. Features a sharp crease and slim fit.",
        images: ["https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&q=80&w=1000"],
        stock: 15,
        createdAt: serverTimestamp()
      },
      {
        name: "Silk Coordinate Set",
        price: 210,
        category: "Coordinates",
        description: "Matching silk shirt and trousers set with a custom geometric print. Effortless luxury.",
        images: ["https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=1000"],
        stock: 7,
        createdAt: serverTimestamp()
      }
    ];

    const dummyHeroSlides = [
      { title: 'hero.slide1.title', subtitle: 'hero.slide1.subtitle', url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000', order: 0 },
      { title: 'hero.slide2.title', subtitle: 'hero.slide2.subtitle', url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e12?auto=format&fit=crop&q=80&w=1000', order: 1 },
      { title: 'hero.slide3.title', subtitle: 'hero.slide3.subtitle', url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1000', order: 2 },
      { title: 'hero.slide4.title', subtitle: 'hero.slide4.subtitle', url: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=1000', order: 3 }
    ];

    try {
      for (const product of dummyProducts) {
        await addDoc(collection(db, 'products'), product);
      }
      for (const slide of dummyHeroSlides) {
        await addDoc(collection(db, 'hero_slides'), slide);
      }
      alert('Successfully seeded dummy items and hero slides!');
      window.location.reload();
    } catch (error) {
      console.error('Error seeding data:', error);
      alert('Failed to seed data.');
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (role !== 'admin') {
      setLoading(false);
      return;
    }
    const fetchStats = async () => {
      try {
        const [productsSnap, ordersSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'users'))
        ]);

        const orders = ordersSnap.docs.map(doc => doc.data());
        const totalRevenue = orders.reduce((acc, curr) => acc + (curr.total || 0), 0);

        setStats({
          products: productsSnap.size,
          orders: ordersSnap.size,
          users: usersSnap.size,
          revenue: totalRevenue
        });

        const recentQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
        const recentSnap = await getDocs(recentQ);
        setRecentOrders(recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Revenue', value: `£${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: 'bg-emerald-500', trend: '+12.5%', isUp: true },
    { label: 'Total Orders', value: stats.orders, icon: ShoppingCart, color: 'bg-blue-500', trend: '+5.2%', isUp: true, path: '/admin/orders' },
    { label: 'Total Products', value: stats.products, icon: Package, color: 'bg-purple-500', trend: '-2.1%', isUp: false, path: '/admin/products' },
    { label: 'Total Customers', value: stats.users, icon: Users, color: 'bg-orange-500', trend: '+8.4%', isUp: true, path: '/admin/customers' },
    { label: 'Hero Reels', value: 'Manage', icon: ImageIcon, color: 'bg-pink-500', trend: 'Live', isUp: true, path: '/admin/hero' },
  ];

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Dashboard Overview</h1>
          <p className="text-gray-500 font-medium">Welcome back! Here's what's happening with Catchy Clothing today.</p>
        </div>
        <button
          onClick={seedData}
          disabled={isSeeding}
          className="flex items-center gap-2 bg-[#4ba673] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-[#3d8a5f] transition-all shadow-lg shadow-[#4ba673]/20 disabled:opacity-50"
        >
          {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
          {isSeeding ? 'Seeding...' : 'Seed Sample Data'}
        </button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link
              to={stat.path || '#'}
              className="block bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all group"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", stat.color)}>
                  <stat.icon size={28} />
                </div>
                <div className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black",
                  stat.isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {stat.isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {stat.trend}
                </div>
              </div>
              <p className="text-gray-500 font-bold text-sm uppercase tracking-widest mb-1">{stat.label}</p>
              <h3 className="text-3xl font-black text-gray-900">{stat.value}</h3>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-50 flex justify-between items-center">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">Recent Orders</h2>
            <button className="text-[#4CAF50] font-bold text-sm hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50/50 text-gray-400 text-xs font-black uppercase tracking-widest">
                  <th className="px-8 py-5">Order ID</th>
                  <th className="px-8 py-5">Customer</th>
                  <th className="px-8 py-5">Status</th>
                  <th className="px-8 py-5">Total</th>
                  <th className="px-8 py-5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentOrders.length > 0 ? recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-8 py-6 font-bold text-gray-900">#{order.id.slice(0, 8)}</td>
                    <td className="px-8 py-6 text-gray-500 font-medium">{order.userId}</td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider",
                        order.status === 'delivered' ? "bg-emerald-50 text-emerald-600" :
                        order.status === 'pending' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                      )}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 font-black text-gray-900">£{order.total}</td>
                    <td className="px-8 py-6 text-gray-400 font-medium">
                      {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-gray-400 font-medium">
                      No recent orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-8">Inventory Alerts</h2>
          <div className="space-y-6">
            {/* Low stock items would go here */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100">
              <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white">
                <Package size={24} />
              </div>
              <div>
                <h4 className="font-bold text-orange-900">Low Stock Alert</h4>
                <p className="text-sm text-orange-700 font-medium">5 items are below threshold</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm font-medium text-center">All systems operational.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
