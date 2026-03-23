import React from 'react';

export default function BlastRadiusPanel({ data, theme, onClose, isLoading }) {
  if (!data && !isLoading) return null;

  const bg = theme === 'dark' ? 'rgba(30, 30, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const text = theme === 'dark' ? '#fff' : '#1d1d1f';
  const textMuted = theme === 'dark' ? '#aeaeb2' : '#86868b';
  const border = theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  // Visual severity ring colors
  const getScoreColor = (score) => {
    if (score > 70) return '#ff3b30'; // red
    if (score > 40) return '#ff9500'; // orange
    return '#34c759'; // green
  };

  return (
    <div 
      className="fixed top-24 right-5 w-80 rounded-2xl shadow-2xl z-50 flex flex-col backdrop-blur-xl overflow-hidden transition-all duration-300"
      style={{
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        maxHeight: 'calc(100vh - 120px)'
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: border }}>
        <h2 className="font-semibold text-sm m-0 tracking-tight">Blast Radius</h2>
        <button 
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer"
          style={{ color: textMuted }}
        >
          ✕
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 flex flex-col items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium" style={{ color: textMuted }}>Analyzing infrastructure impact...</p>
        </div>
      ) : data ? (
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-28 h-28 flex items-center justify-center mb-3">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="56" cy="56" r="50" fill="none" stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'} strokeWidth="6" />
                <circle 
                  cx="56" cy="56" r="50" fill="none" 
                  stroke={getScoreColor(data.blast_radius_score)} 
                  strokeWidth="6" 
                  strokeDasharray={`${(data.blast_radius_score / 100) * 314.159} 314.159`} 
                  className="transition-all duration-1000 ease-out" 
                  strokeLinecap="round" 
                />
              </svg>
              <div className="flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tracking-tight">{Math.round(data.blast_radius_score)}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textMuted }}>Score</span>
              </div>
            </div>
            <p className="text-sm font-medium text-center leading-relaxed tracking-tight" style={{ color: textMuted }}>
              {data.explanation}
            </p>
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>
              Impacted Nodes ({data.affected_nodes_count})
            </h3>
            <div className="flex flex-col gap-2">
              {data.impacted_nodes && data.impacted_nodes.map((node, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg text-xs" style={{ background: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: node.depth === 1 ? '#ff3b30' : node.depth === 2 ? '#ff9500' : '#4392f1' }} />
                  <div className="flex-1 truncate font-medium text-[11px]">{node.id}</div>
                  <div className="text-[10px]" style={{ color: textMuted }}>Hop {node.depth}</div>
                </div>
              ))}
              {(!data.impacted_nodes || data.impacted_nodes.length === 0) && (
                <div className="text-xs italic" style={{ color: textMuted }}>No downstream impact detected.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
