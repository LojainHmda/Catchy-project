import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Users, Settings, LogOut, ChevronRight, ClipboardList, Image as ImageIcon, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { logout } = useAuth();
  const location = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
    { icon: Store, label: 'Shop Page', path: '/' },
    { icon: ImageIcon, label: 'Hero Reels', path: '/admin/hero' },
    { icon: Package, label: 'Products', path: '/admin/products' },
    { icon: ClipboardList, label: 'Stock', path: '/admin/stock' },
    { icon: ShoppingCart, label: 'Orders', path: '/admin/orders' },
    { icon: Users, label: 'Customers', path: '/admin/customers' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen">
        <div className="p-8 border-b border-gray-50">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#4CAF50] rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-[#4CAF50]/20">
              C
            </div>
            <span className="text-2xl font-black tracking-tight text-gray-900">ADMIN</span>
          </Link>
        </div>

        <nav className="flex-1 p-6 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200 group",
                  isActive
                    ? "bg-[#4CAF50] text-white shadow-lg shadow-[#4CAF50]/20"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={20} className={cn(isActive ? "text-white" : "text-gray-400 group-hover:text-gray-900")} />
                  {item.label}
                </div>
                {isActive && <ChevronRight size={16} />}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-gray-50">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
