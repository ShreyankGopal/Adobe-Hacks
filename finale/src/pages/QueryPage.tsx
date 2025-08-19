import React, { useState, useEffect, useMemo } from 'react';
import { usePDF } from '../context/PDFContext';
import PdfCard from './PdfCard';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import RightPanel from './RightPanel';
import { Brain } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
};

const RoleQueryPage: React.FC = () => {
  const { pdfs, removePDF, isProcessing, getPDFByServerFilename } = usePDF();
  const navigate = useNavigate();
  const [role, setRole] = useState('');
  const [task, setTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranks, setRanks] = useState<any>('');
  const [isInsightsPanelOpen, setIsInsightsPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('lastQueryResult');
      if (stored) {
        setResult(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse persisted query result', e);
    }
  }, []);

  const handleRemovePDF = (id: string | number) => {
    removePDF(id as string);
  };

  const handlePDFClick = (id: string | number) => {
    navigate(`/document/${id}`);
  };

    const handleExtractedSectionClick = (section: any) => {
    const pdf = getPDFByServerFilename(section.document);
    navigate(`/query/${pdf?.id}?page=${section.page_number}`, { 
      state: { 
        result,
        selectedSection: section,
        selectedSectionKey: `${section.document}_${section.page_number}_${section.section_title}`.replace(/\s+/g, '_')
      } 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    sessionStorage.removeItem('query_page_summary');
    sessionStorage.removeItem('query_page_didYouKnow');
    sessionStorage.removeItem('query_page_podcast');

    if (!role.trim() || !task.trim()) {
      setError('Please fill both Role and Task');
      return;
    }

    const documentsPayload = pdfs.map(p => ({
      filename: p.serverFilename,
      outline: p.outline,
      sections: (p as any).sections ?? undefined
    }));

    const payload = {
      persona: { role: role.trim() },
      job_to_be_done: { task: task.trim() },
      numRanks: parseInt(ranks, 10) || 5, // Default to 5 if empty or invalid
      documents: documentsPayload
    };

    setLoading(true);
    setLoadingMessage('Processing query...');
    
    try {
      const resp = await fetch('http://localhost:5001/role_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || `Request failed: ${resp.status}`);
      }
      
      setLoadingMessage('Finalizing results...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const data = await resp.json();
      setResult(data);
      try {
        sessionStorage.setItem('lastQueryResult', JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to persist query result', e);
      }
      
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const insightsTextPayload = useMemo(() => {
    if (!result || !result.subsection_analysis) return "";
    return result.subsection_analysis
      .map((sa: any) => `From Document: ${sa.document} (Page ${sa.page_number})\nAnalysis: ${sa.refined_text}`)
      .join('\n\n---\n\n');
  }, [result]);

  return (
    <div className="min-h-screen bg-[#030303]">
        <nav className="relative z-10 bg-transparent p-4 text-white mb-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <Link to="/" className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors">Home</Link>
                <Link to="/query" className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors">Role Based Query</Link>
                <Link to="/QueryDocument" className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors">Query Document</Link>
            </div>
        </nav>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-120px)]">
            <div className="lg:col-span-1 bg-[#2A0A2A]/90 backdrop-blur-sm rounded-xl shadow-xl border border-white/10 p-4 flex flex-col max-h-full overflow-hidden">
                <div className="flex-shrink-0">
                    <h2 className="text-lg font-bold text-white mb-1">Role Based Query</h2>
                    <p className="text-xs text-gray-400 mb-3">Find relevant sections across your PDFs</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3 flex-shrink-0">
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">Role</label>
                        <input className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-white" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g., Hiring Manager" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">Task</label>
                        <textarea className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-white resize-none" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g., Identify sections about safety procedures" rows={2} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1">Number of Ranks</label>
                        <input type="number" className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] text-white" value={ranks} onChange={(e) => setRanks(e.target.value)} placeholder="e.g., 5" min="1" />
                    </div>
                    <button type="submit" className="w-full py-2.5 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all shadow-lg disabled:opacity-50" disabled={loading}>
                        {loading ? loadingMessage : 'Submit Query'}
                    </button>
                </form>

                {error && <div className="text-xs text-red-400 bg-red-900/30 p-2 rounded-lg border border-red-700/50 mt-4">{error}</div>}

                <div className="mt-4 flex-1 overflow-hidden flex flex-col">
                    <h3 className="text-xs font-semibold text-gray-300 mb-2 flex-shrink-0">Uploaded PDFs ({pdfs.length})</h3>
                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {pdfs.length > 0 ? (
                        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-2">
                        {pdfs.map(pdf => (
                            <motion.div key={pdf.id} variants={itemVariants}>
                            <PdfCard pdf={pdf} onRemove={handleRemovePDF} onClick={handlePDFClick} isProcessing={(name) => isProcessing ? isProcessing(name) : false} />
                            </motion.div>
                        ))}
                        </motion.div>
                    ) : (
                        <div className="text-xs text-gray-500 text-center py-8 border-2 border-dashed border-gray-700 rounded-lg">No PDFs uploaded</div>
                    )}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-3 bg-[#2A0A2A]/90 text-white backdrop-blur-sm rounded-xl shadow-xl border border-white/20 p-4 flex flex-col max-h-full overflow-hidden">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xl font-bold text-white">Query Results</h3>
                    {result && (
                        <button onClick={() => setIsInsightsPanelOpen(true)} className="relative px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-fuchsia-500 via-indigo-600 to-violet-600 bg-[length:300%_300%] animate-gradientMove shadow-md hover:shadow-lg group flex items-center gap-2">
                            
                            <span className="relative z-10 flex items-center gap-2"><Brain className="w-5 h-5" />AI Insights</span>
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {!result && !loading && (
                        <div className="text-center text-gray-500 h-full flex flex-col justify-center">
                            <div className="text-4xl mb-3">🔍</div>
                            <div className="text-xl font-semibold mb-2">No Query Executed</div>
                            <div className="text-sm">Run a role-based query to see relevant sections.</div>
                        </div>
                    )}
                    {loading && (
                        <div className="text-center text-gray-400 h-full flex flex-col justify-center">
                            <div className="text-3xl mb-3 animate-pulse">⏳</div>
                            <div className="text-lg font-semibold">{loadingMessage}</div>
                        </div>
                    )}
                    {result && (
                      <div className="space-y-6 pb-4">
                        {/* Processed at box */}
                        <div className="bg-[#1a1a1a] rounded-lg p-3 border border-purple-900/40">
                            <div className="flex items-center justify-between text-sm">
                                <div>
                                    <div className="text-xs text-gray-400">Processed on</div>
                                    <div className="font-semibold text-gray-100">
                                    {result.metadata?.processing_timestamp
                                        ? new Date(result.metadata.processing_timestamp).toLocaleString('en-US', {
                                            year: 'numeric', month: 'long', day: 'numeric', 
                                            hour: '2-digit', minute: '2-digit'
                                        })
                                        : '—'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-400">Documents</div>
                                    <div className="font-semibold text-gray-100">
                                        {result.metadata?.input_documents?.length || 0}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Extracted sections */}
                        <div>
                            <h4 className="font-bold mb-3 text-lg flex items-center text-gray-100">
                                <span className="w-2 h-2 bg-indigo-500 rounded-full mr-3"></span>
                                Top Extracted Sections
                            </h4>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                                {result.extracted_sections?.map((s: any, idx: number) => (
                                    <div key={`${s.document}-${idx}`} className="bg-[#1a1a1a] border border-purple-900/40 rounded-lg p-3 hover:shadow-lg hover:border-purple-700 transition-all cursor-pointer" onClick={() => handleExtractedSectionClick(s)}>
                                        <div className="flex justify-between items-center text-xs text-gray-500">
                                        <span className="truncate pr-2" title={s.document}>{s.document}</span>
                                        <span className="bg-purple-900/50 px-2 py-1 rounded-full font-medium text-gray-100">Rank #{s.importance_rank}</span>
                                        </div>
                                        <div className="font-semibold text-sm mt-1 text-gray-100 line-clamp-2">{s.section_title}</div>
                                        <div className="text-xs text-gray-400 mt-2">Page {s.page_number}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Detailed analysis */}
                        <div>
                            <h4 className="font-bold mb-3 text-lg flex items-center text-gray-100">
                                <span className="w-2 h-2 bg-purple-500 rounded-full mr-3"></span>
                                Detailed Analysis
                            </h4>
                            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                                {result.subsection_analysis?.map((sa: any, idx: number) => (
                                <div
                                    key={idx}
                                    className="bg-[#1a1a1a] border border-purple-900/40 rounded-lg p-4 shadow-sm hover:shadow-md hover:shadow-purple-900/20 transition-shadow"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-xs font-medium text-gray-400">Document</div>
                                        <div className="font-semibold text-gray-100 text-sm">
                                        {sa.document}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-300 bg-purple-900/40 px-2 py-1 rounded">
                                        Page {sa.page_number}
                                    </div>
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium mb-1">Analysis</div>
                                    <div className="text-sm text-gray-200 leading-relaxed">
                                    {sa.refined_text}
                                    </div>
                                </div>
                                ))}
                            </div>
                        </div>
                      </div>
                    )}
                </div>
            </div>
        </div>

        <RightPanel
            visible={isInsightsPanelOpen}
            onClose={() => setIsInsightsPanelOpen(false)}
            text={insightsTextPayload}
            pageType="query"
        />
    </div>
  );
};

export default RoleQueryPage;