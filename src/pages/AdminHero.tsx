import React, { useEffect, useState } from 'react';
import { db, collection, getDocs, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot } from '../firebase';
import { Plus, Trash2, Save, Image as ImageIcon, MoveUp, MoveDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

const AdminHero = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'hero_slides'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      setSlides(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const addSlide = async (type: 'standard' | 'new_arrivals' = 'standard') => {
    const newSlide = {
      title: type === 'new_arrivals' ? 'New Arrivals' : 'New Slide Title',
      subtitle: type === 'new_arrivals' ? 'Explore Latest Pieces' : 'New Slide Subtitle',
      url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000',
      order: slides.length,
      type: type,
      createdAt: serverTimestamp()
    };
    try {
      await addDoc(collection(db, 'hero_slides'), newSlide);
    } catch (error) {
      console.error('Error adding slide:', error);
    }
  };

  const updateSlide = async (id: string, data: any) => {
    try {
      await updateDoc(doc(db, 'hero_slides', id), data);
    } catch (error) {
      console.error('Error updating slide:', error);
    }
  };

  const deleteSlide = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hero_slides', id));
    } catch (error) {
      console.error('Error deleting slide:', error);
    }
  };

  const moveSlide = async (index: number, direction: 'up' | 'down') => {
    const newSlides = [...slides];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const temp = newSlides[index];
    newSlides[index] = newSlides[targetIndex];
    newSlides[targetIndex] = temp;

    // Update orders in Firestore
    setSlides(newSlides);
    try {
      await Promise.all([
        updateDoc(doc(db, 'hero_slides', newSlides[index].id), { order: index }),
        updateDoc(doc(db, 'hero_slides', newSlides[targetIndex].id), { order: targetIndex })
      ]);
    } catch (error) {
      console.error('Error moving slide:', error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-catchy" size={48} /></div>;

  return (
    <div className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Hero Management</h1>
          <p className="text-gray-500 font-medium">Customize the main reels on your homepage.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => addSlide('standard')}
            className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-lg"
          >
            <Plus size={18} />
            Add Standard
          </button>
          <button
            onClick={() => addSlide('new_arrivals')}
            className="flex items-center gap-2 bg-catchy text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-catchy-dark transition-all shadow-lg shadow-catchy/20"
          >
            <Plus size={18} />
            Add New Arrivals
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8">
        <AnimatePresence>
          {slides.map((slide, index) => (
            <motion.div
              key={slide.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col md:flex-row"
            >
              <div className="w-full md:w-64 h-48 md:h-auto relative group">
                <img src={slide.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button className="text-white bg-white/20 backdrop-blur-md p-3 rounded-full hover:bg-white/40 transition-all">
                    <ImageIcon size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      slide.type === 'new_arrivals' ? "bg-catchy/10 text-catchy" : "bg-gray-100 text-gray-500"
                    )}>
                      {slide.type === 'new_arrivals' ? 'New Arrivals Slide' : 'Standard Slide'}
                    </span>
                    {slide.type === 'new_arrivals' && (
                      <span className="text-xs text-gray-400 font-medium italic">
                        (Shows auto-scrolling product carousel)
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Title Key / Text</label>
                    <input
                      type="text"
                      value={slide.title}
                      onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-catchy/20 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Subtitle Key / Text</label>
                    <input
                      type="text"
                      value={slide.subtitle}
                      onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-catchy/20 outline-none font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Image URL</label>
                  <input
                    type="text"
                    value={slide.url}
                    onChange={(e) => updateSlide(slide.id, { url: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-catchy/20 outline-none font-mono text-sm"
                  />
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                  <div className="flex gap-2">
                    <button
                      onClick={() => moveSlide(index, 'up')}
                      disabled={index === 0}
                      className="p-2 text-gray-400 hover:text-catchy disabled:opacity-20 transition-colors"
                    >
                      <MoveUp size={20} />
                    </button>
                    <button
                      onClick={() => moveSlide(index, 'down')}
                      disabled={index === slides.length - 1}
                      className="p-2 text-gray-400 hover:text-catchy disabled:opacity-20 transition-colors"
                    >
                      <MoveDown size={20} />
                    </button>
                  </div>
                  <button
                    onClick={() => deleteSlide(slide.id)}
                    className="flex items-center gap-2 text-red-400 hover:text-red-600 font-bold text-sm transition-colors"
                  >
                    <Trash2 size={18} />
                    Delete Slide
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminHero;
