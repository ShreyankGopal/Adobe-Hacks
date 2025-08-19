
import React, { useEffect, useState, useRef } from 'react';

declare global {
  interface Window {
    AdobeDC: {
      View: {
        new (config: { clientId: string; divId: string }): AdobeDCView;
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
    }
  ): Promise<any>;

  getAPIs(): Promise<{
    gotoLocation: (location: { pageNumber: number } | number) => Promise<void>;
    search?: (query: string) => Promise<any>;
  }>;

  registerCallback(
    eventType: string,
    callback: (event: any) => void,
    options: { enablePageChangeEvents: boolean }
  ): void;
}

import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ArrowLeft,
  Menu,
  X,
  FileText,
  BookOpen
} from 'lucide-react';
import { usePDF } from '../context/PDFContext';

const DocumentViewer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getPDFById } = usePDF();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState(new Set(['Title', 'H1']));
  const [currentPage, setCurrentPage] = useState(1);

  const viewerRef = useRef<any>(null);
  const pdf = id ? getPDFById(id) : undefined;

  useEffect(() => {
    if (pdf && pdf.serverFilename && window.AdobeDC) {
      const adobeDCView = new window.AdobeDC.View({
        clientId: "ce717f3e6e444a8893c4c7e873884e35",
        divId: "pdf-viewer",
      });

      adobeDCView
        .previewFile(
          {
            content: {
              location: {
                url: `http://localhost:5001/uploads/${pdf.serverFilename}`,
              },
            },
            metaData: {
              fileName: pdf.name,
            },
          },
          {
            embedMode: "FULL_WINDOW",
            defaultViewMode: "FIT_PAGE",
            showAnnotationTools: true,
            enableSearchAPIs: true,
            
          }
        )
        .then((viewer: any) => {
          viewerRef.current = viewer;

          try {
            viewer.registerCallback(
              window.AdobeDC.View.Enum.CallbackType.EVENT_LISTENER,
              (event: any) => {
                if (event.type === "PAGE_VIEW") {
                  setCurrentPage(event.data.pageNumber);
                }
              },
              { enablePageChangeEvents: true }
            );
          } catch (e) {
            // ignore registration errors
          }
        });

      return () => {
        viewerRef.current = null;
      };
    }
  }, [pdf]);

  if (!pdf) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">PDF not found</h2>
          <p className="text-gray-600 mb-6">The requested document could not be found.</p>
          <button
            onClick={() => navigate(-1)}
            className="btn-primary"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
        </motion.div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleHeadingClick = async (page: number, text: string) => {
    if (!viewerRef.current) {
      console.error('Viewer not initialized');
      return;
    }

    try {
      const apis = await viewerRef.current.getAPIs();
      const pageNumberArg = typeof apis.gotoLocation === 'function' ? page : { pageNumber: page };
      // adapt to API signature variations
      await apis.gotoLocation(pageNumberArg as any);

      // perform search if available to highlight the text
      if (typeof apis.search === 'function') {
        try {
          const searchResult = await apis.search(text);
          if (searchResult && typeof (searchResult as any).onResultsUpdate === 'function') {
            (searchResult as any).onResultsUpdate = (result: any) => {
              if (result.numMatches === 0) {
                console.warn(`No matches found for "${text}" on page ${page}`);
              } else {
                console.log(`Found ${result.numMatches} matches for "${text}".`);
              }
            };
          }
        } catch (searchErr) {
          console.warn('Search failed or not supported by viewer APIs', searchErr);
        }
      }

      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error('Error during navigation or search:', error);
    }
  };

  interface HeadingItem {
    text: string;
    page: number;
  }

  type GroupedHeadings = {
    [key: string]: HeadingItem[];
  };

  const groupHeadings = () => {
    const grouped: GroupedHeadings = {
      Title: [],
      H1: [],
      H2: [],
      H3: [],
    };
    if (pdf.outline) {
      grouped.Title.push({ text: pdf.outline.title, page: pdf.outline.outline[0]?.page || 1 });
      pdf.outline.outline.forEach(item => {
        if (grouped[item.level]) {
          grouped[item.level].push({ text: item.text, page: item.page });
        }
      });
    }
    return grouped;
  };

  const renderSection = (section: string, items: HeadingItem[]) => {
    const isExpanded = expandedSections.has(section);
    return (
      <div key={section} className="mb-2">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center py-3 px-4 rounded-lg cursor-pointer 
                     bg-[#1a1a1a] transition-all duration-200"
          onClick={() => toggleSection(section)}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="mr-2"
          >
            <ChevronDown className="w-5 h-5 text-purple-400" />
          </motion.div>
          <span className="font-semibold text-white">{section}</span>
          <span className="ml-2 text-sm text-gray-400">({items.length})</span>
        </motion.div>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden ml-4 space-y-1"
            >
              {items.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center py-2 px-4 rounded-lg cursor-pointer 
                             hover:bg-[#3B0B3B]/80 transition-all duration-200 border border-purple-700/50 bg-[#2A0A2A]/90

                             `}
                  onClick={() => handleHeadingClick(item.page, item.text)}
                >
                  <span className="flex-1 truncate text-gray-200">{item.text}</span>
                  <span className="text-sm text-purple-400 font-medium bg-[#1a1a1a]/70 px-2 py-1 rounded">
                    p.{item.page}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };
  

  const groupedHeadings = groupHeadings();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-[#030303] flex"
    >
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-80 lg:w-96 bg-[#1a1a1a] shadow-xl border-r border-purple-900/40 flex flex-col relative z-20"
          >
            <div className="p-6 border-b border-purple-900/40 bg-[#2A0A2A]/90">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-6 h-6 text-purple-400" />
                  <h2 className="text-lg font-semibold text-white">Document Outline</h2>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
              <p className="text-sm text-gray-300 truncate font-medium" title={pdf.name}>
                {pdf.name}
              </p>
              {pdf.outline && (
                <p className="text-xs text-purple-400 mt-1">
                  {pdf.outline.outline.length} headings detected
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[80vh]">
              {Object.entries(groupedHeadings).map(([section, items]) =>
                items.length > 0 && renderSection(section, items)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
  
      <div className="flex-1 flex flex-col">
        <div className="bg-[#1a1a1a] shadow-sm border-b border-purple-900/40 p-4 lg:p-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="btn-secondary text-white bg-purple-800/40 hover:bg-purple-700/50"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back
              </button>
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="btn-secondary lg:hidden text-white bg-purple-800/40 hover:bg-purple-700/50"
                >
                  <Menu className="w-5 h-5 mr-2" />
                  Show Outline
                </button>
              )}
            </div>
          </div>
        </div>
  
        <div className="flex-1 bg-[#2A0A2A]/90 p-4 lg:p-8">
          <div className="max-w-5xl mx-auto h-full">
            <div
              id="pdf-viewer"
              className="w-full h-full max-h-[90vh] bg-[#1a1a1a] rounded-2xl shadow-xl border border-purple-900/40"
            />
          </div>
        </div>
      </div>
  
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </motion.div>
  );
  
};

export default DocumentViewer;
