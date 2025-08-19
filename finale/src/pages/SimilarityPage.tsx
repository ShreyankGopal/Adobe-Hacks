import React, { useState, useEffect } from 'react';
import { usePDF } from '../context/PDFContext';
import PdfCard from './PdfCard';
import { motion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import RightPanel from './RightPanel';

const containerVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 }
};

const SimilarityPage: React.FC = () => {
  const { pdfs, removePDF, isProcessing, getPDFByServerFilename } = usePDF();
  const navigate = useNavigate();
  const location = useLocation();

  const [result, setResult] = useState<any>(null);
  const [selectedText, setSelectedText] = useState('');
  const [isInsightsPanelOpen, setIsInsightsPanelOpen] = useState(false);

  useEffect(() => {
    if (location.state?.result) {
      setResult(location.state.result);
      setSelectedText(location.state.selectedText || location.state.result.metadata?.selected_text || '');
    } else {
      try {
        const stored = sessionStorage.getItem('pdfQuery.result');
        const storedText = sessionStorage.getItem('pdfQuery.selectedText') || '';
        if (stored) {
          setResult(JSON.parse(stored));
          setSelectedText(storedText);
        }
      } catch (e) {
        console.warn('Failed to restore similarity from sessionStorage', e);
      }
    }
  }, [location.state]);

  const handleRemovePDF = (id: string | number) => removePDF(id as string);
  const handlePDFClick = (id: string | number) => navigate(`/document/${id}`);

  const handleExtractedSectionClick = (section: any) => {
    const pdf = getPDFByServerFilename(section.document);
    if (pdf) {
      const sectionKey = `${section.document}_${section.page_number}_${section.section_title}`.replace(/\s+/g, '_');
      navigate(`/query/${pdf.id}?page=${section.page_number}`, {
        state: {
          result,
          queryType: 'similarity',
          selectedText,
          selectedSection: section,
          selectedSectionKey: sectionKey,
        }
      });
    }
  };

  const goBack = () => navigate(-1);

  const insightsText = selectedText + (result?.sections_formatted || '');

  return (
    <div className="min-h-screen bg-[#030303]">
      <nav className="relative z-10 bg-transparent p-4 text-white mb-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors">Home</Link>
          <button onClick={goBack} className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors">Back to Query</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-120px)]">
        {/* Left panel */}
        <div className="lg:col-span-1 bg-[#2A0A2A]/90 backdrop-blur-sm rounded-xl shadow-xl border border-purple-900/40 p-4 flex flex-col max-h-full overflow-hidden">
          <div className="flex-shrink-0">
            <h2 className="text-lg font-bold text-white mb-1">Similarity Analysis</h2>
            <p className="text-xs text-gray-400 mb-3">Similar content found.</p>
          </div>

          <div className="mb-4 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-300 mb-2">Original Text</label>
            <div className="max-h-32 border border-gray-700 rounded-lg p-3 text-sm bg-[#1a1a1a] overflow-y-auto text-gray-200">
              {selectedText}
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-xs font-semibold text-gray-300 mb-2 flex-shrink-0">Source PDFs ({pdfs.length})</h3>
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
                <div className="text-xs text-gray-500 text-center py-8 border-2 border-dashed border-gray-700 rounded-lg">
                  No source PDFs uploaded
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-3 bg-[#2A0A2A]/90 text-white backdrop-blur-sm rounded-xl shadow-xl border border-purple-900/40 p-4 flex flex-col max-h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xl font-bold text-white">Similarity Results</h3>
            <button
              onClick={() => setIsInsightsPanelOpen(true)}
              className="bg-gradient-to-r from-purple-700 to-purple-900 text-white px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition"
            >
              AI Insights Hub
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {result?.extracted_sections?.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {result.extracted_sections.map((s: any, idx: number) => (
                  <div
                    key={`${s.document}-${idx}`}
                    onClick={() => handleExtractedSectionClick(s)}
                    className="bg-[#1a1a1a] border border-purple-900/40 rounded-lg p-3 hover:shadow-lg hover:border-purple-700 transition-all cursor-pointer"
                  >
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span className="truncate pr-2" title={s.document}>{s.document}</span>
                      <span className="bg-purple-900/50 px-2 py-1 rounded-full font-medium text-gray-100">
                        Rank #{s.importance_rank}
                      </span>
                    </div>
                    <div className="font-semibold text-sm mt-1 text-gray-100 line-clamp-2">{s.section_title}</div>
                    <div className="text-xs text-gray-400 mt-2">Page {s.page_number}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 h-full flex flex-col justify-center">
                <div className="text-4xl mb-3">🔍</div>
                <div className="text-xl font-semibold mb-2">No Similar Sections Found</div>
                <div className="text-sm">Run a similarity query to see results.</div>
              </div>
            )}

            <div className="mt-6">
              <h4 className="font-bold text-white mb-3 flex items-center">
                <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                Detailed Analysis
              </h4>
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {result?.subsection_analysis?.map((sa: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-[#1a1a1a] border border-purple-900/40 rounded-lg p-4 shadow-sm hover:shadow-md hover:shadow-purple-900/20 transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-xs font-medium text-gray-400">Document</div>
                        <div className="font-semibold text-gray-100 text-sm">{sa.document}</div>
                      </div>
                      <div className="text-xs text-gray-300 bg-purple-900/40 px-2 py-1 rounded">
                        Page {sa.page_number}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 font-medium mb-1">Analysis</div>
                    <div className="text-sm text-gray-200 leading-relaxed">{sa.refined_text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <RightPanel
        visible={isInsightsPanelOpen}
        onClose={() => setIsInsightsPanelOpen(false)}
        pageType="query"
        storageKeyPrefix="similarity_page"
        text={insightsText}
      />
    </div>
  );
};

export default SimilarityPage;
