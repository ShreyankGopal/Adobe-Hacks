import React from 'react';
import { X, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

type PDFType = {
  id: string | number;
  name: string;
  size?: number;
  uploadedAt?: Date;
  serverFilename?: string;
  processed?: boolean;
  outline?: { outline: any[] } | null;
};

interface Props {
  pdf: PDFType;
  onRemove?: (id: string | number) => void;
  onClick?: (id: string | number) => void;
  isProcessing?: (name: string) => boolean;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const PdfCard: React.FC<Props> = ({ pdf, onRemove, onClick, isProcessing }) => {
  const processing = isProcessing ? isProcessing(pdf.name) : false;

  return (
    <motion.div
      whileHover={{ scale: 1.0 }}
      className="group relative w-full max-w-xs bg-slate-800 rounded-xl shadow-md overflow-hidden cursor-pointer border border-slate-700 hover:shadow-lg hover:border-slate-500 transition-all duration-300"
      onClick={() => onClick && onClick(pdf.id)}
      layout
    >
      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove && onRemove(pdf.id);
        }}
        className="absolute top-3 right-3 z-10 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-500 hover:scale-110 shadow-lg"
        aria-label={`Remove ${pdf.name}`}
        title="Remove"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Status Badge */}
      <div className="absolute top-3 left-3 z-10">
        {processing ? (
          <div className="flex items-center px-2 py-1 bg-amber-900/30 text-amber-300 text-xs rounded-full border border-amber-700">
            <Clock className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </div>
        ) : pdf.processed ? (
          <div className="flex items-center px-2 py-1 bg-green-900/30 text-green-300 text-xs rounded-full border border-green-700">
            <CheckCircle className="w-3 h-3 mr-1" />
            Ready
          </div>
        ) : (
          <div className="flex items-center px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-full border border-slate-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pending
          </div>
        )}
      </div>

      {/* Icon Section */}
      <div className="aspect-[3/4] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-t-xl flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 to-orange-900/20" />
        <FileText className="w-16 h-16 text-orange-400 relative z-10" />
        {processing && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse-slow" />
        )}
      </div>

      {/* File Details */}
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-slate-200 truncate text-sm" title={pdf.name}>
          {pdf.name}
        </h3>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{formatFileSize(pdf.size)}</span>
          <span>{pdf.uploadedAt ? (pdf.uploadedAt as Date).toLocaleDateString() : ''}</span>
        </div>
        {pdf.outline && (
          <p className="text-xs text-purple-300 font-medium">
            {Array.isArray(pdf.outline.outline) ? pdf.outline.outline.length : 0} headings found
          </p>
        )}
      </div>

      {/* Hover Glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />
    </motion.div>
  );
};

export default PdfCard;
