import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import RightPanel from "./RightPanel";
import {
  ArrowLeft,
  Menu,
  X,
  FileText,
  BookOpen,
  Search,
  Hash
} from 'lucide-react';
import { usePDF } from '../context/PDFContext';

// ... (interface declarations remain the same)
declare global {
  interface Window {
    AdobeDC: {
      View: {
        new (config: { clientId: string; divId: string }): any;
        Enum: { CallbackType: { EVENT_LISTENER: string; }; };
      };
    };
  }
}
interface ExtractedSection { document: string; importance_rank: number; page_number: number; section_title: string; rects?: any[]; }
interface SubsectionAnalysis { document: string; page_number: number; refined_text: string; }
declare global {
  interface QueryResult {
    extracted_sections: ExtractedSection[];
    subsection_analysis?: SubsectionAnalysis[];
    metadata?: {
      input_documents?: string[];
      job_to_be_done?: string;
      persona?: string;
      processing_timestamp?: string;
      annotated_files?: { [original: string]: string };
      llm_input: string;
    };
    insights?: any;
  };
}


const QueryDocumentViewer: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getPDFById, getPDFByServerFilename, pdfs } = usePDF();

  const [selectedSectionText, setSelectedSectionText] = useState<string>('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState<number | null>(null);
  const [result, setResult] = useState<QueryResult | undefined>((location.state as any)?.result);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  // State is hydrated from sessionStorage for persistence
  const [sectionInsights, setSectionInsights] = useState<{ [key: string]: { summary?: string; didYouKnow?: string; } }>(() => {
    try {
      const stored = sessionStorage.getItem('sectionInsights');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // --- FIX: Add state to track which sections have been animated ---
  const [animatedSections, setAnimatedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = sessionStorage.getItem('animatedSections');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  
  const [loadingInsights, setLoadingInsights] = useState<{ [key: string]: { summary: boolean; didYouKnow: boolean; } }>({});
  
  // Save both insights and animation status to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('sectionInsights', JSON.stringify(sectionInsights));
      sessionStorage.setItem('animatedSections', JSON.stringify(animatedSections));
    } catch (e) {
      console.error("Failed to save session state", e);
    }
  }, [sectionInsights, animatedSections]);

  const viewerRef = useRef<any>(null);
  const urlParams = new URLSearchParams(location.search);
  const requestedPageFromUrl = parseInt(urlParams.get('page') || '0', 10) || null;
  const currentPDF = id ? getPDFById(id) : selectedDocument ? getPDFByServerFilename(selectedDocument) : pdfs[0];

  const getCleanDocumentName = (document: string) => {
    const parts = document.split('_');
    return parts.length > 1 ? parts.slice(1).join('_') : document;
  };

  const getSectionsByDocument = (): { [key: string]: ExtractedSection[] } => {
    if (!result?.extracted_sections) return {};
    return result.extracted_sections.reduce((acc: any, section) => {
      if (!acc[section.document]) acc[section.document] = [];
      acc[section.document].push(section);
      return acc;
    }, {});
  };

  useEffect(() => {
    const state = location.state as any;
    if (state?.result) {
      setResult(state.result);
      if (state.selectedSectionKey) setSelectedSectionKey(state.selectedSectionKey);
      if (state.selectedSection) {
        const section = state.selectedSection as ExtractedSection;
        setSelectedDocument(section.document);
        setRequestedPage(section.page_number);
        const matchingAnalysis = state.result?.subsection_analysis?.find(
          (a: any) => a.document === section.document && a.page_number === section.page_number
        );
        if (matchingAnalysis) setSelectedSectionText(matchingAnalysis.refined_text);
      }
    } else if (!result) {
      try {
        const stored = sessionStorage.getItem('lastQueryResult');
        if (stored) {
          const parsed = JSON.parse(stored);
          setResult(parsed);
          if (parsed.extracted_sections?.[0]?.document) {
            setSelectedDocument(parsed.extracted_sections[0].document);
          }
        }
      } catch (e) { console.warn('Failed to parse persisted query result', e); }
    }
    if (requestedPageFromUrl) setRequestedPage(requestedPageFromUrl);
  }, [location.state, result]);


  useEffect(() => {
    if (result?.extracted_sections && !selectedDocument) {
      const first = result.extracted_sections[0]?.document;
      if (first) setSelectedDocument(first);
    }
  }, [result, selectedDocument]);

  const attemptGoto = async (pageNumber: number, retries = 12, delayMs = 300): Promise<boolean> => {
    const pn = Math.max(1, Math.floor(Number(pageNumber) || 1));
    for (let i = 0; i < retries; i++) {
      try {
        if (viewerRef.current?.getAPIs) {
          const apis = await viewerRef.current.getAPIs();
          if (apis?.gotoLocation) {
            await apis.gotoLocation(pn, 0, 0);
            return true;
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  };
  
  useEffect(() => {
    if (!currentPDF?.serverFilename || !(window as any).AdobeDC) return;

    const container = document.getElementById('pdf-viewer');
    if (container) container.innerHTML = '';

    const adobeDCView = new (window as any).AdobeDC.View({ clientId: "ce717f3e6e444a8893c4c7e873884e35", divId: 'pdf-viewer' });
    const annotatedFiles = result?.metadata?.annotated_files || {};
    const annotatedForThis = annotatedFiles[currentPDF.serverFilename];
    const ts = result?.metadata?.processing_timestamp ? encodeURIComponent(result.metadata.processing_timestamp) : Date.now();
    const filenameToLoad = annotatedForThis || currentPDF.serverFilename;
    const url = `http://localhost:5001/uploads/${filenameToLoad}?t=${ts}`;

    adobeDCView.previewFile({ content: { location: { url } }, metaData: { fileName: currentPDF.name } },
      { embedMode: 'FULL_WINDOW', defaultViewMode: 'FIT_PAGE', showAnnotationTools: true, enableSearchAPIs: true })
      .then((viewer: any) => {
        viewerRef.current = viewer;
        if (requestedPage) setTimeout(() => attemptGoto(requestedPage), 500);
      }).catch((err: any) => console.error('Adobe previewFile error:', err));

    return () => { viewerRef.current = null; };
  }, [currentPDF, result?.metadata?.annotated_files, result?.metadata?.processing_timestamp]);

  const handleSectionClick = (section: ExtractedSection) => {
    const matchingAnalysis = result?.subsection_analysis?.find(a => a.document === section.document && a.page_number === section.page_number);
    setSelectedSectionText(matchingAnalysis?.refined_text || '');
    const key = `${section.document}_${section.page_number}_${section.section_title}`.replace(/\s+/g, '_');
    setSelectedSectionKey(key);

    if (!sectionInsights[key]) setSectionInsights(prev => ({ ...prev, [key]: {} }));
    if (!loadingInsights[key]) setLoadingInsights(prev => ({ ...prev, [key]: { summary: false, didYouKnow: false } }));

    const targetPage = Math.max(1, Math.floor(Number(section.page_number) || 1));
    const targetPDF = getPDFByServerFilename(section.document);
    if (!targetPDF) return;

    if (currentPDF?.serverFilename === targetPDF.serverFilename) {
      setSelectedDocument(section.document);
      setRequestedPage(targetPage);
      attemptGoto(targetPage);
    } else {
      navigate(`/query/${targetPDF.id}?page=${targetPage}`, { state: { result, selectedSection: section, selectedSectionKey: key }, replace: true });
    }
  };

  const handleInsightClick = async (type: 'summary' | 'didYouKnow') => {
    if (!selectedSectionKey || !selectedSectionText) return;
    setLoadingInsights(prev => ({ ...prev, [selectedSectionKey]: { ...prev[selectedSectionKey], [type]: true } }));
    const endpoint = type === 'summary' ? 'summarize' : 'did-you-know';
    try {
      const response = await fetch(`http://localhost:5001/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: selectedSectionText }),
      });
      if (!response.ok) throw new Error(`API request failed`);
      const data = await response.json();
      setSectionInsights(prev => ({ ...prev, [selectedSectionKey]: { ...prev[selectedSectionKey], [type]: data.response } }));
    } catch (err) {
      console.error(`Failed to get insight for type '${type}':`, err);
    } finally {
      setLoadingInsights(prev => ({ ...prev, [selectedSectionKey]: { ...prev[selectedSectionKey], [type]: false } }));
    }
  };

  const handleAnimationComplete = () => {
    if (!selectedSectionKey) return;
    setAnimatedSections(prev => ({...prev, [selectedSectionKey]: true}));
  }

  if (!result || !currentPDF) { 
    return <div className="min-h-screen flex items-center justify-center bg-[#1a1a1a] text-white">Loading or document not found...</div>
  }

  const sectionsByDocument = getSectionsByDocument();
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-[#1a1a1a] flex">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            className="w-80 lg:w-96 bg-[#2A0A2A]/95 shadow-2xl border-r border-purple-900/40 flex flex-col z-20"
          >
            <div className="p-6 border-b border-purple-900/40"><h2 className="text-lg font-semibold text-purple-100">Query Results</h2></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {Object.entries(sectionsByDocument).map(([document, sections]) => (
                <div key={document}>
                  <h3 className="font-semibold text-purple-100 text-sm flex items-center p-2"><FileText className="w-4 h-4 mr-2" />{getCleanDocumentName(document)}</h3>
                  {sections.map((section) => {
                    const key = `${section.document}_${section.page_number}_${section.section_title}`.replace(/\s+/g, '_');
                    return (
                      <motion.div key={key} onClick={() => handleSectionClick(section)}
                        className={`p-3 rounded-lg cursor-pointer border ${selectedSectionKey === key ? 'bg-purple-900/50 border-purple-500' : 'bg-[#1a1a1a] border-purple-900/40 hover:bg-[#2A0A2A]'}`}
                      >
                         <h4 className="font-medium text-purple-100 text-sm truncate">{section.section_title}</h4>
                         <div className="flex items-center space-x-3 mt-2 text-xs">
                           <span className="flex items-center text-purple-400"><BookOpen className="w-3 h-3 mr-1" />Page {section.page_number}</span>
                           <span className="flex items-center text-orange-400"><Hash className="w-3 h-3 mr-1" />Rank {section.importance_rank}</span>
                         </div>
                      </motion.div>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
  
      <div className="flex-1 flex flex-col">
        <div className="bg-[#2A0A2A]/90 shadow-sm border-b border-purple-900/40 p-4 z-10 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="btn-secondary text-white bg-purple-800/40 hover:bg-purple-700/50"><ArrowLeft className="w-5 h-5 mr-2" />Back</button>
          <button onClick={() => setIsPanelOpen(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg shadow-md">AI Insights Hub</button>
        </div>
        <div className="flex-1 bg-[#1a1a1a] p-4">
          <div id="pdf-viewer" className="w-full h-full bg-[#1a1a1a] rounded-lg shadow-xl border border-purple-900/40"/>
        </div>
      </div>
  
      <RightPanel
        visible={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        pageType="section"
        text={selectedSectionText}
        onInsightClick={handleInsightClick}
        sectionInsights={sectionInsights[selectedSectionKey || '']}
        loadingInsights={loadingInsights[selectedSectionKey || '']}
        // --- FIX: Pass animation status and handler to the RightPanel ---
        isSummaryAnimated={animatedSections[selectedSectionKey || ''] || false}
        onAnimationComplete={handleAnimationComplete}
      />
    </motion.div>
  );
};

export default QueryDocumentViewer;
