import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-white py-32 px-6 md:px-12 border-t border-gray-100">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-16 items-start">
        <div className="md:col-span-5">
          <div className="flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 rounded-full bg-catchy flex items-center justify-center text-white font-medium text-xs">C</div>
            <span className="text-2xl tracking-[0.5em] font-medium uppercase text-catchy">Atchy</span>
          </div>
          <p className="text-[11px] leading-loose tracking-[0.1em] max-w-sm uppercase text-catchy">
            Sustainable luxury for the modern era.
          </p>
        </div>
        <div className="md:col-span-3 flex flex-col space-y-5 text-[10px] uppercase tracking-widest text-catchy">
          <span className="opacity-30 mb-2">Legal</span>
          <Link to="/privacy" className="hover:opacity-60">Privacy Policy</Link>
          <Link to="/terms" className="hover:opacity-60">Terms of Service</Link>
        </div>
        <div className="md:col-span-4 md:text-right flex flex-col md:items-end space-y-5 text-[10px] uppercase tracking-widest text-catchy">
          <span className="opacity-30 mb-2">Newsletter</span>
          <div className="border-b border-catchy py-2 w-full max-w-xs">
            <input 
              type="email" 
              placeholder="YOUR EMAIL" 
              className="bg-transparent border-none w-full text-[10px] tracking-widest focus:ring-0 placeholder:text-catchy/30"
            />
          </div>
        </div>
      </div>
      <div className="mt-40 flex justify-between items-center text-[9px] uppercase tracking-[0.3em] opacity-40 text-catchy">
        <p>© 2026 Catchy Clothing.</p>
      </div>
    </footer>
  );
};

export default Footer;
