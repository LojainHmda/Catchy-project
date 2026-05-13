import React from 'react';
import { motion } from 'framer-motion';

const HeroVideo = () => {
  return (
    <div className="relative h-[80vh] w-full overflow-hidden">
      {/* Background Video Placeholder - Using a high quality fashion video from a public source */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        poster="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2070"
      >
        <source src="https://assets.mixkit.co/videos/preview/mixkit-fashion-model-walking-in-a-studio-34444-large.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight"
        >
          CATCHY CLOTHING
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl font-light"
        >
          Elevate your style with our curated collection of elegant ladies' fashion.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <a
            href="/catalog"
            className="bg-white text-gray-900 px-8 py-4 rounded-full text-lg font-medium hover:bg-gray-100 transition-all transform hover:scale-105"
          >
            Shop Collection
          </a>
        </motion.div>
      </div>
    </div>
  );
};

export default HeroVideo;
