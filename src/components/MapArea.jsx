import React from 'react';
import { Heart, Cross, Divide, Sparkles } from 'lucide-react';

export default function MapArea({ symbols, onSymbolClick }) {
  const renderMarker = (id, label, icon, top, left, delay) => {
    const isDiscovered = symbols[id];
    
    return (
      <div 
        className="absolute flex flex-col items-center cursor-pointer transition-transform hover:scale-110"
        style={{ top, left, animation: `bounce 2s infinite ${delay}s` }}
        onClick={() => onSymbolClick(id)}
      >
        <div className="relative">
          <div className="w-10 h-10 bg-white border-[1.5px] border-gray-200 rounded-full flex items-center justify-center shadow-md z-10 relative">
            {icon}
          </div>
          {isDiscovered && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center border border-white z-20">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="mt-2 bg-white/90 backdrop-blur-sm border-[1.5px] border-gray-200 px-3 py-1 rounded-full shadow-sm">
          <span className="text-sm text-gray-500 whitespace-nowrap pt-0.5 block">{label}</span>
        </div>
      </div>
    );
  };

  const renderSpecialMarker = (id, top, left) => {
    const isDiscovered = symbols[id];
    
    return (
      <div 
        className="absolute flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
        style={{ top, left }}
        onClick={() => onSymbolClick(id)}
      >
        <div className={`relative w-12 h-12 flex items-center justify-center ${isDiscovered ? 'animate-pulse' : ''}`}>
          <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-30 rounded-full" />
          <div className="absolute inset-0 bg-yellow-400 blur-lg opacity-20 rounded-full" />
          <div className="relative w-11 h-11 border-[3px] border-yellow-400 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(250,204,21,0.4)] bg-white/80 backdrop-blur-sm">
            <span className="text-xl">✨</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-[250px] border-[3.5px] border-purple-800 rounded-[32px] relative overflow-hidden shadow-[0_12px_30px_rgba(107,33,168,0.15)] bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Decorative corner marks */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-[3px] border-l-[3px] border-purple-800/30 rounded-tl-xl" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-[3px] border-r-[3px] border-purple-800/30 rounded-tr-xl" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-[3px] border-l-[3px] border-purple-800/30 rounded-bl-xl" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-[3px] border-r-[3px] border-purple-800/30 rounded-br-xl" />
      
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(107,33,168,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(107,33,168,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Markers */}
      {renderMarker('heart', '하트', <Heart className="w-5 h-5 text-pink-500" />, '25%', '20%', 0)}
      {renderMarker('cross', '십자가', <Cross className="w-5 h-5 text-gray-700" />, '20%', '65%', 0.3)}
      {renderMarker('divide', '나누기', <Divide className="w-5 h-5 text-blue-500" />, '60%', '25%', 0.6)}
      {renderSpecialMarker('question', '55%', '60%')}
    </div>
  );
}
