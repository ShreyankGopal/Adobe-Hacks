
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PDFProvider } from './context/PDFContext';
import UploadPage from './pages/UploadPage';
import DocumentViewer from './pages/DocumentViewer';
import QueryPage from './pages/QueryPage';
import QueryDocumentViewer from './pages/QueryDocumentViewer';
import DocumentQueryPage from './pages/DocumentQueryPage';
import SimilarityPage from './pages/SimilarityPage';
import ContradictoryPage from './pages/ContradictoryPage';
const App: React.FC = () => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://documentcloud.adobe.com/view-sdk/main.js';
    script.async = true;
    document.body.appendChild(script);
    script.onload = () => {
      console.log('Adobe PDF Embed API script loaded');
    };
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <PDFProvider>
      <Router>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/query" element={<QueryPage />}/>
          <Route path="/query/:id" element={<QueryDocumentViewer />} />
          <Route path="/QueryDocument" element={<DocumentQueryPage />} />
          <Route path="/similarity" element={<SimilarityPage />} />
          <Route path="/contradictory" element={<ContradictoryPage />} />
          <Route path="/document/:id" element={<DocumentViewer />} />
        </Routes>
      </Router>
    </PDFProvider>
  );
};

export default App;