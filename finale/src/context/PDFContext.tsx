// src/context/PDFContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface RectItem {
  page: number;
  bbox: number[]; // [x0,y0,x1,y1]
  line_index?: number;
}

interface SectionItem {
  heading: string;
  text: string;
  page?: number;
  start_line?: number;
  end_line?: number;
  start_page?: number;
  end_page?: number;
  rects?: RectItem[]; // <-- new
}

interface OutlineItem {
  level?: string;
  text: string;
  page?: number;
}

interface Outline {
  title?: string;
  outline: OutlineItem[];
}

interface PDF {
  id: string;
  name: string;
  size?: number;
  uploadedAt: Date;
  serverFilename?: string;
  processed?: boolean;
  outline?: Outline | null;
  sections?: SectionItem[] | null;
}

interface PDFContextShape {
  pdfs: PDF[];
  addPDF: (file: File, serverFilename: string, outline: Outline | null, sections?: SectionItem[] | null) => void;
  removePDF: (id: string) => void;
  getPDFById: (id: string) => PDF | undefined;
  getPDFByServerFilename: (serverFilename: string) => PDF | undefined;
  isProcessing: (name: string) => boolean;
  setProcessing: (name: string, val: boolean) => void;
}

const PDFContext = createContext<PDFContextShape | null>(null);

export const PDFProvider = ({ children }: { children: ReactNode }) => {
  const [pdfs, setPDFs] = useState<PDF[]>([]);
  const [processing, setProc] = useState<Record<string, boolean>>({});

  const addPDF = (file: File, serverFilename: string, outline: Outline | null, sections?: SectionItem[] | null) => {
    const pdf: PDF = {
      id: uuidv4(),
      name: file.name,
      size: file.size,
      uploadedAt: new Date(),
      serverFilename,
      processed: true,
      outline,
      sections: sections ?? []
    };
    setPDFs(prev => [pdf, ...prev]);
  };

  const removePDF = (id: string) => {
    setPDFs(prev => prev.filter(p => p.id !== id));
  };

  const getPDFByServerFilename = (serverFilename: string) => pdfs.find(p => p.serverFilename === serverFilename);
  const getPDFById = (id: string) => pdfs.find(p => p.id === id);

  const isProcessing = (name: string) => !!processing[name];
  const setProcessing = (name: string, val: boolean) => setProc(prev => ({ ...prev, [name]: val }));

  return (
    <PDFContext.Provider
      value={{
        pdfs,
        addPDF,
        removePDF,
        getPDFById,
        getPDFByServerFilename,
        isProcessing,
        setProcessing
      }}
    >
      {children}
    </PDFContext.Provider>
  );
};

export const usePDF = () => {
  const context = useContext(PDFContext);
  if (!context) {
    throw new Error('usePDF must be used within a PDFProvider');
  }
  return context;
};
