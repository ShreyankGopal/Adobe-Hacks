
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePDF } from '../context/PDFContext';
import PdfCard from './PdfCard';
import { useNavigate, Link } from 'react-router-dom';
import RightPanel from './RightPanel';

declare global {
  interface Window {
    AdobeDC: {
      View: {
        new(config: { clientId: string; divId: string }): AdobeDCView;
        Enum: {
          CallbackType: {
            EVENT_LISTENER: string;
          };
        };
      };
    };
  }
}

interface AdobeDCView {
  previewFile(
    fileConfig: {
      content: {
        location: {
          url: string;
        };
      };
      metaData: {
        fileName: string;
      };
    },
    viewerConfig: {
      embedMode: string;
      defaultViewMode: string;
      showAnnotationTools: boolean;
      enableSearchAPIs: boolean;
      enableFilePreviewEvents: boolean;
      enableTextSelectionEvent: boolean;
    }
  ): Promise<any>;

  getAPIs(): Promise<{
    gotoLocation: (location: { pageNumber: number }) => Promise<void>;
    getSelectedContent?: () => Promise<any>;
  }>;

  registerCallback(
    eventType: string,
    callback: (event: any) => void,
    options?: any
  ): void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

const PdfQueryPage: React.FC = () => {
  const { pdfs, removePDF, isProcessing } = usePDF();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [negativeResult, setNegativeResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [originalFilename, setOriginalFilename] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean>(false);
  const [isInsightsPanelOpen, setIsInsightsPanelOpen] = useState(false);
  const [insightsSummary, setInsightsSummary] = useState<string | null>(null);

  const STORAGE_KEYS = {
    positiveResult: 'pdfQuery.result',
    negativeResult: 'pdfQuery.negativeResult',
    selectedText: 'pdfQuery.selectedText',
    showResults: 'pdfQuery.showResults',
    uploadedPdfUrl: 'pdfQuery.uploadedPdfUrl',
    uploadedPdfName: 'pdfQuery.uploadedPdfName',
    insightsSummary: 'pdfQuery.insightsSummary'
  };

  // Restore persisted pdf-query results and uploaded file info if present
  useEffect(() => {
    try {
      const storedShow = sessionStorage.getItem(STORAGE_KEYS.showResults);
      if (storedShow === '1') {
        const storedResult = sessionStorage.getItem(STORAGE_KEYS.positiveResult);
        const storedNegative = sessionStorage.getItem(STORAGE_KEYS.negativeResult);
        const storedText = sessionStorage.getItem(STORAGE_KEYS.selectedText) || '';
        const storedInsights = sessionStorage.getItem(STORAGE_KEYS.insightsSummary);

        setResult(storedResult ? JSON.parse(storedResult) : null);
        setNegativeResult(storedNegative ? JSON.parse(storedNegative) : null);
        setSelectedText(storedText);
        setInsightsSummary(storedInsights);
        setShowResults(true);
      }

      // restore uploaded pdf if user uploaded previously
      const storedUploadedUrl = sessionStorage.getItem(STORAGE_KEYS.uploadedPdfUrl);
      const storedUploadedName = sessionStorage.getItem(STORAGE_KEYS.uploadedPdfName);
      if (storedUploadedUrl) {
        setUploadedPdfUrl(storedUploadedUrl);
        if (storedUploadedName) setOriginalFilename(storedUploadedName);
      }
    } catch (e) {
      console.warn('Failed to restore persisted pdf query or uploaded file:', e);
    }
  }, []);

  const handleRemovePDF = (id: string | number) => {
    removePDF(id as string);
  };

  const handleSimilarityClick = () => {
    navigate('/similarity', { state: { result, selectedText } });
  };
  const handleContradictoryClick = () => {
    navigate('/contradictory', { state: { negativeResult, selectedText } });
  };
  const handlePDFClick = (id: string | number) => {
    navigate(`/document/${id}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setError('Please select a valid PDF file');
      return;
    }

    setSelectedFile(file);
    setError(null);
    // Clear previous query-specific session storage (keeps uploaded file persistence separately)
    Object.values({
      positiveResult: STORAGE_KEYS.positiveResult,
      negativeResult: STORAGE_KEYS.negativeResult,
      selectedText: STORAGE_KEYS.selectedText,
      showResults: STORAGE_KEYS.showResults,
      insightsSummary: STORAGE_KEYS.insightsSummary
    }).forEach(key => sessionStorage.removeItem(key));
    setShowResults(false);
    setResult(null);
    setNegativeResult(null);
    setInsightsSummary(null);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const response = await fetch(`http://localhost:5001/upload-only-file`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setUploadedPdfUrl(data.filename);
        setOriginalFilename(file.name);

        // persist uploaded file info so it survives navigation
        sessionStorage.setItem(STORAGE_KEYS.uploadedPdfUrl, data.filename);
        sessionStorage.setItem(STORAGE_KEYS.uploadedPdfName, file.name);
      } else {
        setError(data.error || 'Failed to upload PDF');
      }
    } catch (err) {
      setError('Error uploading PDF');
    }
  };

  useEffect(() => {
    let adobeDCView: any;

    const initializeAdobePDFViewer = (serverFilename: string, originalName: string) => {
      if (window.AdobeDC) {
        adobeDCView = new window.AdobeDC.View({
          clientId: "ce717f3e6e444a8893c4c7e873884e35",
          divId: "pdf-viewer",
        });

        const previewFilePromise = adobeDCView.previewFile(
          {
            content: { location: { url: `http://localhost:5001/uploads/${serverFilename}` } },
            metaData: { fileName: originalName },
          },
          {
            embedMode: "FULL_WINDOW",
            defaultViewMode: "FIT_PAGE",
            showAnnotationTools: true,
            enableSearchAPIs: true,
            enableFilePreviewEvents: true,
            enableTextSelectionEvent: true
          }
        );

        adobeDCView.registerCallback(
          window.AdobeDC.View.Enum.CallbackType.EVENT_LISTENER,
          async (event: any) => {
            if (event.type === "PREVIEW_SELECTION_END") {
              try {
                const viewer = await previewFilePromise;
                const apis = await viewer.getAPIs?.();
                const selectedContent = await apis?.getSelectedContent?.();
                if (selectedContent?.data?.length) {
                  const text = Array.isArray(selectedContent.data)
                    ? selectedContent.data.map((i: any) => (i.text || '')).join(' ')
                    : String(selectedContent.data);
                  setSelectedText(text);
                }
              } catch (error) {
                console.error("Error handling text selection:", error);
              }
            }
          },
          { enableFilePreviewEvents: true }
        );
      }
    };

    if (uploadedPdfUrl && originalFilename) {
      initializeAdobePDFViewer(uploadedPdfUrl, originalFilename);
    }
  }, [uploadedPdfUrl, originalFilename]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedText.trim()) {
      setError('Please select text from the PDF to query');
      return;
    }

    setError(null);
    setLoading(true);
    setShowResults(false);

    // Clear old insights
    setInsightsSummary(null);
    sessionStorage.removeItem(STORAGE_KEYS.insightsSummary);

    const documentsPayload = pdfs.map(p => ({
      filename: p.serverFilename,
      outline: p.outline,
      sections: (p as any).sections ?? undefined
    }));
    const payload = { documents: documentsPayload, selectedText };

    try {
      const respPositive = await fetch('http://localhost:5001/pdf_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await respPositive.json();
      if (!respPositive.ok) {
        throw new Error(data?.error || 'One of the requests failed');
      }

      setResult(data.Positive);
      setNegativeResult(data.Negative);
      setShowResults(true);

      sessionStorage.setItem(STORAGE_KEYS.positiveResult, JSON.stringify(data.Positive));
      sessionStorage.setItem(STORAGE_KEYS.negativeResult, JSON.stringify(data.Negative));
      sessionStorage.setItem(STORAGE_KEYS.selectedText, selectedText);
      sessionStorage.setItem(STORAGE_KEYS.showResults, '1');
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };
  
  const insightsText = selectedText + (result?.sections_formatted || '') + (negativeResult?.sections_formatted || '');

  // Derived displayed filename
  const displayedFilename = originalFilename || selectedFile?.name || (uploadedPdfUrl ? uploadedPdfUrl.split('/').pop() : null);

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
        {/* Left panel */}
        <div className="lg:col-span-1 bg-[#2A0A2A]/90 rounded-xl shadow-xl border border-purple-900/40 p-4 flex flex-col max-h-full overflow-hidden">
          <div className="flex-shrink-0">
            <h2 className="text-lg font-bold text-white mb-1">Document Query</h2>
            <p className="text-xs text-gray-300 mb-5">Select text from an uploaded PDF to analyze.</p>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {/* Upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-200 mb-2">Upload PDF</label>
              <div className="relative">
                <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" id="pdf-upload" />
                <label htmlFor="pdf-upload" className="w-full rounded-xl border border-dashed border-purple-800/60 bg-[#111] hover:bg-purple-900/30 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all">
                  {displayedFilename ? (
                    <div className="text-sm text-green-400 truncate max-w-full">{displayedFilename}</div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <div className="text-3xl mb-2">📄</div>
                      <div className="text-sm">Click to upload PDF</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Selected text */}
            <div>
              <label className="block text-xs font-semibold text-gray-200 mb-2">Selected Text</label>
              <div className="min-h-[80px] max-h-32 border border-purple-800/40 rounded-lg p-3 text-sm bg-[#111] text-gray-100 overflow-y-auto">
                {selectedText || <span className="text-gray-500">Select text from the PDF viewer...</span>}
              </div>
            </div>

            {/* Submit + Results */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleSubmit}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-all shadow-lg disabled:opacity-50"
                disabled={loading || !(selectedFile || uploadedPdfUrl) || !selectedText}
              >
                {loading ? 'Processing...' : 'Submit Query'}
              </button>

              {showResults && (
                <div className="bg-[#111]/90 border border-purple-800/40 p-4 rounded-xl space-y-4 text-center">
                  <p className="text-sm font-semibold text-purple-200">Query Complete!</p>
                  <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <motion.button whileHover={{ scale: 1.05 }} className="flex-1 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-purple-700 to-purple-900 text-white shadow-md" onClick={handleSimilarityClick}>
                      Similarities
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.05 }} className="flex-1 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-pink-700 to-rose-900 text-white shadow-md" onClick={handleContradictoryClick}>
                      Contradictions
                    </motion.button>
                  </div>
                  <button onClick={() => setIsInsightsPanelOpen(true)} className="relative px-4 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-fuchsia-500 via-purple-600 to-violet-700 bg-[length:300%_300%] animate-gradientMove shadow-md group">
                    <span className="relative z-10">AI Insights Hub</span>
                  </button>
                </div>
              )}
            </div>

            {error && <div className="text-xs text-red-400 bg-red-900/30 p-2 rounded-lg border border-red-800">{error}</div>}

            {/* Source PDFs */}
            <div>
              <h3 className="text-xs font-semibold text-gray-300 mb-2">Source PDFs ({pdfs.length})</h3>
              <div className="max-h-[30vh] overflow-y-auto pr-2 space-y-2">
                {pdfs.length > 0 ? (
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-2">
                    {pdfs.map((pdf) => (
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
        </div>

        {/* Right panel (PDF Viewer) */}
        <div className="lg:col-span-3 bg-[#111] rounded-xl border border-purple-900/40 p-4 flex flex-col max-h-full overflow-hidden">
          {uploadedPdfUrl ? (
            <div id="pdf-viewer" className="w-full h-full min-h-[85vh] rounded-lg" />
          ) : (
            <div className="h-full flex flex-col justify-center items-center text-gray-400 border-2 border-dashed border-purple-800/40 rounded-lg">
              <div className="text-6xl mb-4">📄</div>
              <div className="text-xl font-semibold text-white">No PDF Selected</div>
              <div className="text-sm text-gray-300">Upload a PDF to view and query it</div>
            </div>
          )}
        </div>
      </div>

      <RightPanel
        visible={isInsightsPanelOpen}
        onClose={() => setIsInsightsPanelOpen(false)}
        pageType="query"
        text={insightsSummary || insightsText}
        onGenerateSummary={(summary: string) => {
          setInsightsSummary(summary);
          sessionStorage.setItem(STORAGE_KEYS.insightsSummary, summary);
        }}
      />
    </div>
  );
};

export default PdfQueryPage;
