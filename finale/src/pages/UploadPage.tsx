import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Plus, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, Link } from 'react-router-dom';
import { usePDF } from '../context/PDFContext';
import PdfCard from './PdfCard';
import UploadProgressList, { ProgressMap } from './UploadProgressList';

type Toast = { id: string; text: string; type: 'success' | 'error' | 'info' };

const UploadPage: React.FC = () => {
  const { pdfs, addPDF, removePDF, isProcessing, setProcessing } = usePDF();
  const navigate = useNavigate();

  // --- progress state handled here, UI in UploadProgressList.tsx ---
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  // store active XHRs so we can abort individual uploads
  const xhrRefs = useRef<Record<string, XMLHttpRequest | null>>({});
  // toast messages
  const [toasts, setToasts] = useState<Toast[]>([]);

  // canvas for particle background (kept from original)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shootingStars, setShootingStars] = useState<
    Array<{ id: number; x: number; y: number; vx: number; vy: number; life: number; maxLife: number }>
  >([]);

  // --- Particle background (same as original) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    sessionStorage.clear();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles: { x: number; y: number; r: number; dx: number; dy: number }[] = [];
    let shootingStarId = 0;
    const num = 80;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = Array.from({ length: num }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.2,
        dy: (Math.random() - 0.5) * 0.2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const createShootingStar = () => {
      if (Math.random() < 0.003) {
        const newStar = {
          id: shootingStarId++,
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.5,
          vx: (Math.random() - 0.5) * 8 + 4,
          vy: Math.random() * 4 + 2,
          life: 0,
          maxLife: 60 + Math.random() * 40,
        };
        setShootingStars((prev) => [...prev.slice(-4), newStar]);
      }
    };

    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });

      setShootingStars((prev) =>
        prev
          .map((star) => {
            star.x += star.vx;
            star.y += star.vy;
            star.life++;

            const alpha = 1 - star.life / star.maxLife;
            const trailLength = 8;

            for (let i = 0; i < trailLength; i++) {
              const trailAlpha = alpha * (1 - i / trailLength);
              const trailX = star.x - star.vx * i * 0.3;
              const trailY = star.y - star.vy * i * 0.3;

              ctx.fillStyle = `rgba(77, 163, 255, ${trailAlpha})`;
              ctx.beginPath();
              ctx.arc(trailX, trailY, (trailLength - i) * 0.3, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, 2, 0, Math.PI * 2);
            ctx.fill();

            return star;
          })
          .filter((star) => star.life < star.maxLife && star.x < canvas.width + 50 && star.y < canvas.height + 50)
      );

      createShootingStar();
      requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  // small helper to create a toast
  const pushToast = (text: string, type: Toast['type'] = 'info', ttl = 4500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };

  // upload helper using XHR to report progress
  const uploadFileWithProgress = (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:5001/upload', true);

      setProgressMap((m) => ({ ...m, [file.name]: { pct: 0, status: 'uploading' } }));

      xhr.upload.onprogress = (evt: ProgressEvent) => {
        if (!evt.lengthComputable) return;
        const percent = Math.round((evt.loaded / evt.total) * 100);
        setProgressMap((m) => ({ ...m, [file.name]: { ...(m[file.name] || { status: 'uploading' }), pct: percent, status: 'uploading' } }));
      };

      xhr.onload = () => {
        try {
          const resText = xhr.responseText;
          const result = resText ? JSON.parse(resText) : null;

          if (xhr.status >= 200 && xhr.status < 300 && result?.success) {
            addPDF(file, result.filename, result.outline, result.sections);
            setProgressMap((m) => ({ ...m, [file.name]: { pct: 100, status: 'done' } }));
            pushToast(`${file.name} uploaded`, 'success');

            setTimeout(() => {
              setProgressMap((m) => {
                const copy = { ...m };
                delete copy[file.name];
                return copy;
              });
            }, 900);

            resolve();
          } else {
            const msg = result?.error || `Upload failed (${xhr.status})`;
            setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
            pushToast(`${file.name}: ${msg}`, 'error');
            reject(new Error(msg));
          }
        } catch (err) {
          setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
          pushToast(`${file.name}: parse error`, 'error');
          reject(err);
        } finally {
          delete xhrRefs.current[file.name];
          setProcessing(file.name, false);
        }
      };

      xhr.onerror = () => {
        setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
        pushToast(`${file.name}: network error`, 'error');
        delete xhrRefs.current[file.name];
        setProcessing(file.name, false);
        reject(new Error('Network error during upload'));
      };

      xhrRefs.current[file.name] = xhr;

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  };

  // Cancel handler to abort a running upload
  const handleCancelUpload = (fileName: string) => {
    const xhr = xhrRefs.current[fileName];
    if (xhr) {
      try {
        xhr.abort();
      } catch {}
      xhrRefs.current[fileName] = null;
      setProgressMap((m) => ({ ...m, [fileName]: { ...(m[fileName] || { pct: 0 }), status: 'canceled' } }));
      pushToast(`${fileName} upload canceled`, 'info');
      setTimeout(() => {
        setProgressMap((m) => {
          const copy = { ...m };
          delete copy[fileName];
          return copy;
        });
      }, 700);
      setProcessing(fileName, false);
    }
  };

  // onDrop starts uploads concurrently, sets processing flags
  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      console.log('onDrop triggered', { acceptedFiles, rejectedFiles }); // Debug log
      if (acceptedFiles.length === 0 && rejectedFiles.length === 0) {
        pushToast('No valid files dropped', 'error');
        return;
      }

      const promises: Promise<void>[] = [];

      for (const file of acceptedFiles) {
        if (file.type !== 'application/pdf') {
          pushToast(`Skipped ${file.name} (not a PDF)`, 'error');
          continue;
        }

        setProcessing(file.name, true);
        setProgressMap((m) => ({ ...m, [file.name]: { pct: 0, status: 'queued' } }));

        const p = uploadFileWithProgress(file).catch((err) => {
          console.error('Upload error for', file.name, err);
        });
        promises.push(p);
      }

      if (rejectedFiles?.length) {
        rejectedFiles.forEach((rejection) => {
          const fileName = rejection.file.name;
          rejection.errors.forEach((err: { code: string; message: string }) => {
            if (err.code === 'file-too-large') {
              pushToast(`${fileName}: File too large (max 50MB)`, 'error');
            } else if (err.code === 'file-invalid-type') {
              pushToast(`${fileName}: Only PDF files are accepted`, 'error');
            } else {
              pushToast(`${fileName}: ${err.message}`, 'error');
            }
          });
        });
      }

      await Promise.allSettled(promises);
    },
    [addPDF, setProcessing]
  );

  // Abort outstanding uploads on unmount
  useEffect(() => {
    return () => {
      Object.values(xhrRefs.current).forEach((xhr) => {
        try {
          xhr?.abort();
        } catch {}
      });
      xhrRefs.current = {};
    };
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    maxSize: 50 * 1024 * 1024,
    onDragEnter: () => console.log('Drag entered'), // Debug log
    onDragOver: () => console.log('Drag over'), // Debug log
    onDragLeave: () => console.log('Drag left'), // Debug log
    preventDefault: true, // Ensure default browser behavior is prevented
  });

  const handlePDFClick = (id: string) => navigate(`/document/${id}`);
  const handleRemovePDF = (id: string | number) => removePDF(id as string);

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.45, ease: 'easeOut' } },
  };

  return (
    <div className="relative min-h-screen bg-[#030303] text-white overflow-hidden">
      {/* Particle background */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0"></canvas>

      {/* Navbar (restored) */}
      <nav className="relative z-10 bg-transparent p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link
            to="/"
            className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors transform transition-transform duration-200 hover:scale-110"
          >
            Home
          </Link>
          <Link
            to="/query"
            className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors transform transition-transform duration-200 hover:scale-110"
          >
            Role Based Query
          </Link>
          <Link
            to="/QueryDocument"
            className="text-lg font-semibold hover:text-[#4DA3FF] transition-colors transform transition-transform duration-200 hover:scale-110"
          >
            Query Document
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <motion.div initial="hidden" animate="visible" variants={containerVariants} className="relative z-10 p-4 sm:p-6 lg:p-8">
        {/* Hero (kept nice gradient) */}
        <motion.div variants={itemVariants} className="text-center mt-4 mb-12">
          <h1 className="text-5xl sm:text-6xl font-extrabold">
            <span
              className="bg-gradient-to-r from-[#ff6ec4] via-[#7873f5] via-[#4DA3FF] to-[#4ade80] bg-clip-text text-transparent"
              style={{
                backgroundSize: '300% 100%',
                animation: 'gradientFlow 6s ease-in-out infinite',
              }}
            >
              PDF Analysis Tool
            </span>
            <style jsx>{`
              @keyframes gradientFlow {
                0% {
                  background-position: 0% 50%;
                }
                50% {
                  background-position: 100% 50%;
                }
                100% {
                  background-position: 0% 50%;
                }
              }
            `}</style>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 mt-4 max-w-2xl mx-auto">
            Upload your PDFs for AI-powered analysis
          </p>
        </motion.div>

        {/* Dropzone with premium futuristic glow */}
        <motion.div variants={itemVariants}>
          {/* Dropzone container (top-level so it can catch drop events) */}
          <div
            {...getRootProps({ role: 'region', 'aria-label': 'PDF upload dropzone' })}
            className={`${getDropzoneClassName(
              isDragActive,
              isDragAccept,
              isDragReject
            )} relative max-w-lg mx-auto border-2 border-dashed rounded-xl transition-colors duration-300`}
          >
            <input {...getInputProps()} />

            {/* Inner background (does not block events) */}
            <div className="absolute inset-[3px] rounded-xl bg-[#0a0a0a] overflow-hidden pointer-events-none" />

            {/* Content */}
            <div className="text-center p-6 space-y-5 relative z-10">
              {isDragActive ? (
                isDragAccept ? (
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 text-[#00f7ff] mx-auto animate-float" />
                    <p className="text-lg font-semibold text-white">
                      Drop your PDFs here!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <X className="w-12 h-12 text-red-400 mx-auto animate-pulse" />
                    <p className="text-base font-medium text-red-400">
                      Only PDF files are accepted
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 text-[#00f7ff] mx-auto animate-float" />
                  <p className="text-lg font-semibold text-white">
                    Drag & drop PDFs here or click to upload
                  </p>
                  <p className="text-sm text-gray-400">
                    Supports multiple PDFs (up to 50MB each)
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.96 }}
                    className="mt-3 inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-[#00f7ff] via-[#0fffc1] to-[#00f7ff] text-[#030303] font-bold shadow-lg transition-all duration-500 ease-out"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Upload Files
                  </motion.button>
                </div>
              )}
            </div>
          </div>

          <style jsx>{`
            @keyframes float {
              0% { transform: translateY(0px); }
              50% { transform: translateY(-6px); }
              100% { transform: translateY(0px); }
            }
            .animate-float {
              animation: float 3s ease-in-out infinite;
            }
          `}</style>
        </motion.div>

        {/* Upload progress UI */}
        <UploadProgressList progressMap={progressMap} onCancel={handleCancelUpload} />

        {/* Uploaded PDFs */}
        {pdfs.length > 0 && (
          <motion.div variants={itemVariants} className="space-y-6 mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl sm:text-3xl font-semibold">Uploaded PDFs ({pdfs.length})</h2>
              <div className="text-lg text-gray-400">
                Total size: {formatFileSize(pdfs.reduce((sum, p) => sum + (p.size || 0), 0))}
              </div>
            </div>

            <div>
              <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(270px,270px))] justify-start">
                {pdfs.map((pdf, index) => (
                  <motion.div
                    key={pdf.id}
                    initial={{ scale: 0.98, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.0 }}
                    transition={{ delay: index * 0.04, duration: 0.35, ease: 'easeOut' }}
                  >
                    <PdfCard
                      pdf={pdf}
                      onRemove={(id) => handleRemovePDF(id)}
                      onClick={(id) => handlePDFClick(id)}
                      isProcessing={(name) => Boolean(isProcessing && isProcessing(name))}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {pdfs.length === 0 && (
          <motion.div variants={itemVariants} className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="w-24 h-24 bg-[#4DA3FF]/20 border-4 border-[#4DA3FF] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <FileText className="w-12 h-12 text-[#4DA3FF]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No PDFs uploaded yet</h3>
              <p className="text-gray-400">Upload your first PDF to get started with AI-powered document analysis</p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

// helper used inside the component render for dropzone classes
function getDropzoneClassName(isDragActive: boolean, isDragAccept: boolean, isDragReject: boolean) {
  let base =
    'relative border-2 border-dashed rounded-2xl p-12 mb-8 transition-all duration-300 cursor-pointer backdrop-blur-md shadow-[0_0_30px_rgba(18,52,88,0.5)] overflow-hidden';
  if (isDragActive) {
    if (isDragAccept) base += ' border-[#4DA3FF] bg-[#0B1A2A]/60 scale-[1.02]';
    else if (isDragReject) base += ' border-red-500 bg-red-800/40';
    else base += ' border-[#4DA3FF] bg-[#0B1A2A]/60 scale-[1.02]';
  } else {
    base += ' border-[#4DA3FF]/40 bg-[#0B1A2A]/40 hover:border-[#4DA3FF] hover:bg-[#0B1A2A]/70 hover:shadow-[0_0_50px_rgba(77,163,255,0.5)]';
  }
  return base;
}

export default UploadPage;



// import React, { useCallback, useEffect, useRef, useState } from 'react';
// import { motion } from 'framer-motion';
// import { Upload, FileText, Plus, X } from 'lucide-react';
// import { useDropzone } from 'react-dropzone';
// import { useNavigate, Link } from 'react-router-dom';
// import { usePDF } from '../context/PDFContext';
// import PdfCard from './PdfCard';
// import UploadProgressList, { ProgressMap } from './UploadProgressList';

// type Toast = { id: string; text: string; type: 'success' | 'error' | 'info' };

// const UploadPage: React.FC = () => {
//   const { pdfs, addPDF, removePDF, isProcessing, setProcessing } = usePDF();
//   const navigate = useNavigate();

//   // --- progress state handled here, but UI is in UploadProgressList.tsx ---
//   const [progressMap, setProgressMap] = useState<ProgressMap>({});
//   // store active XHRs so we can abort individual uploads
//   const xhrRefs = useRef<Record<string, XMLHttpRequest | null>>({});
//   // toast messages
//   const [toasts, setToasts] = useState<Toast[]>([]);

//   // small helper to create a toast
//   const pushToast = (text: string, type: Toast['type'] = 'info', ttl = 4500) => {
//     const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
//     setToasts((t) => [...t, { id, text, type }]);
//     setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
//   };

//   // upload helper that returns a promise; updates progressMap via setter
//   const uploadFileWithProgress = (file: File) => {
//     return new Promise<void>((resolve, reject) => {
//       const xhr = new XMLHttpRequest();
//       xhr.open('POST', 'http://localhost:5001/upload', true);

//       // initialize map entry
//       setProgressMap((m) => ({ ...m, [file.name]: { pct: 0, status: 'uploading' } }));

//       xhr.upload.onprogress = (evt: ProgressEvent) => {
//         if (!evt.lengthComputable) return;
//         const percent = Math.round((evt.loaded / evt.total) * 100);
//         setProgressMap((m) => ({ ...m, [file.name]: { ...(m[file.name] || { status: 'uploading' }), pct: percent, status: 'uploading' } }));
//       };

//       xhr.onload = () => {
//         try {
//           const text = xhr.responseText || '';
//           const result = text ? JSON.parse(text) : null;

//           if (xhr.status >= 200 && xhr.status < 300 && result?.success) {
//             // Add PDF to context
//             addPDF(file, result.filename, result.outline, result.sections);

//             setProgressMap((m) => ({ ...m, [file.name]: { pct: 100, status: 'done' } }));
//             pushToast(`${file.name} uploaded`, 'success');

//             // clean up after a short delay so users see 100%
//             setTimeout(() => setProgressMap((m) => {
//               const copy = { ...m };
//               delete copy[file.name];
//               return copy;
//             }), 900);

//             resolve();
//           } else {
//             const errMsg = result?.error || `Upload failed (${xhr.status})`;
//             setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
//             pushToast(`${file.name}: ${errMsg}`, 'error');
//             reject(new Error(errMsg));
//           }
//         } catch (err) {
//           setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
//           pushToast(`${file.name}: parse error`, 'error');
//           reject(err);
//         } finally {
//           // cleanup XHR ref
//           delete xhrRefs.current[file.name];
//           setProcessing(file.name, false);
//         }
//       };

//       xhr.onerror = () => {
//         setProgressMap((m) => ({ ...m, [file.name]: { ...m[file.name], status: 'error' } }));
//         pushToast(`${file.name}: network error`, 'error');
//         delete xhrRefs.current[file.name];
//         setProcessing(file.name, false);
//         reject(new Error('Network error during upload'));
//       };

//       // store ref for cancel
//       xhrRefs.current[file.name] = xhr;

//       const fd = new FormData();
//       fd.append('file', file);
//       xhr.send(fd);
//     });
//   };

//   // Cancel handler to abort a running upload
//   const handleCancelUpload = (fileName: string) => {
//     const xhr = xhrRefs.current[fileName];
//     if (xhr) {
//       try {
//         xhr.abort();
//       } catch {}
//       xhrRefs.current[fileName] = null;
//       setProgressMap((m) => ({ ...m, [fileName]: { ...(m[fileName] || { pct: 0 }), status: 'canceled' } }));
//       pushToast(`${fileName} upload canceled`, 'info');
//       setTimeout(() => setProgressMap((m) => {
//         const copy = { ...m };
//         delete copy[fileName];
//         return copy;
//       }), 700);
//       setProcessing(fileName, false);
//     }
//   };

//   // onDrop handles multiple files concurrently and sets per-file processing flag
//   const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
//     if (acceptedFiles.length === 0) return;
//     const uploadPromises: Promise<void>[] = [];

//     for (const file of acceptedFiles) {
//       if (file.type !== 'application/pdf') {
//         pushToast(`Skipped ${file.name} (not a PDF)`, 'error');
//         continue;
//       }

//       setProcessing(file.name, true);
//       setProgressMap((m) => ({ ...m, [file.name]: { pct: 0, status: 'queued' } }));

//       // start upload concurrently
//       const p = uploadFileWithProgress(file)
//         .catch((err) => {
//           // already reported via toasts inside uploadFileWithProgress
//           console.error('Upload error for', file.name, err);
//         });
//       uploadPromises.push(p);
//     }

//     // wait for all started uploads to finish (not strictly necessary)
//     await Promise.allSettled(uploadPromises);

//     if (rejectedFiles?.length) {
//       pushToast(`${rejectedFiles.length} file(s) were rejected`, 'error');
//     }
//   }, [addPDF, setProcessing]);

//   // Abort all in-flight uploads on unmount
//   useEffect(() => {
//     return () => {
//       Object.values(xhrRefs.current).forEach((xhr) => {
//         try { xhr?.abort(); } catch {}
//       });
//       xhrRefs.current = {};
//     };
//   }, []);

//   const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
//     onDrop,
//     accept: { 'application/pdf': ['.pdf'] },
//     multiple: true,
//     maxSize: 50 * 1024 * 1024,
//   });

//   const handlePDFClick = (id: string) => navigate(`/document/${id}`);
//   const handleRemovePDF = (id: string | number) => removePDF(id as string);

//   const formatFileSize = (bytes: number) => {
//     if (!bytes) return '0 Bytes';
//     const k = 1024;
//     const sizes = ['Bytes', 'KB', 'MB', 'GB'];
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//     return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   };

//   // animations & variants (kept mostly as you had)
//   const containerVariants = {
//     hidden: { opacity: 0 },
//     visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.08 } },
//   };
//   const itemVariants = {
//     hidden: { y: 20, opacity: 0 },
//     visible: { y: 0, opacity: 1, transition: { duration: 0.45, ease: 'easeOut' } },
//   };

//   return (
//     <div className="relative min-h-screen bg-[#030303] text-white overflow-hidden">
//       {/* Main content container */}
//       <motion.div initial="hidden" animate="visible" variants={containerVariants} className="relative z-10 p-4 sm:p-6 lg:p-8">
//         {/* Hero */}
//         <motion.div variants={itemVariants} className="text-center mt-10 mb-12">
//           <h1 className="text-4xl sm:text-5xl font-extrabold gradient-text">
//             PDF Analysis Tool
//           </h1>
//           <p className="text-lg text-gray-300 mt-4 max-w-2xl mx-auto">Upload your PDFs for AI-powered analysis</p>
//         </motion.div>

//         {/* Dropzone */}
//         <motion.div variants={itemVariants} className="mb-6">
//           <div className="relative max-w-3xl mx-auto">
//             <div {...getRootProps()} className="relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer hover:shadow-lg transition">
//               <input {...getInputProps()} />
//               <div className="space-y-4">
//                 <Upload className="w-10 h-10 text-[#4DA3FF] mx-auto" />
//                 <p className="text-lg font-medium">Drag & drop PDFs here or click to upload</p>
//                 <p className="text-sm text-gray-400">Supports multiple PDFs (up to 50MB each)</p>
//                 <button className="mt-4 inline-flex items-center px-5 py-2 rounded-full bg-[#4DA3FF] text-[#030303] font-semibold shadow">
//                   <Plus className="w-4 h-4 mr-2" /> Upload Files
//                 </button>
//               </div>
//             </div>
//           </div>
//         </motion.div>

//         {/* Upload progress UI (separate component) */}
//         <UploadProgressList progressMap={progressMap} onCancel={handleCancelUpload} />

//         {/* Uploaded PDFs: auto-fit grid that centers rows and fits as many as possible */}
//         {pdfs.length > 0 && (
//           <motion.div variants={itemVariants} className="space-y-6 mt-8">
//             <div className="flex items-center justify-between">
//               <h2 className="text-2xl font-semibold">Uploaded PDFs ({pdfs.length})</h2>
//               <div className="text-lg text-gray-400">Total size: {formatFileSize(pdfs.reduce((sum, p) => sum + (p.size || 0), 0))}</div>
//             </div>

//             <div className="max-w-[1200px] mx-auto">
//               <div
//                 className="
//                   grid
//                   gap-6
//                   justify-center
//                   grid-cols-[repeat(auto-fit,minmax(260px,1fr))]
//                 "
//               >
//                 {pdfs.map((pdf, index) => (
//                   <motion.div
//                     key={pdf.id}
//                     initial={{ scale: 0.98, opacity: 0, y: 8 }}
//                     animate={{ scale: 1, opacity: 1, y: 0 }}
//                     whileHover={{ scale: 1.03 }}
//                     transition={{ delay: index * 0.04, duration: 0.35, ease: 'easeOut' }}
//                   >
//                     <PdfCard
//                       pdf={pdf}
//                       onRemove={(id) => handleRemovePDF(id)}
//                       onClick={(id) => handlePDFClick(id)}
//                       isProcessing={(name) => Boolean(isProcessing && isProcessing(name))}
//                     />
//                   </motion.div>
//                 ))}
//               </div>
//             </div>
//           </motion.div>
//         )}

//         {/* Empty state */}
//         {pdfs.length === 0 && (
//           <motion.div variants={itemVariants} className="text-center py-12">
//             <div className="max-w-md mx-auto">
//               <div className="w-20 h-20 bg-[#4DA3FF]/20 border-4 border-[#4DA3FF] rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
//                 <FileText className="w-10 h-10 text-[#4DA3FF]" />
//               </div>
//               <h3 className="text-xl font-semibold mb-2">No PDFs uploaded yet</h3>
//               <p className="text-gray-400">Upload your first PDF to get started</p>
//             </div>
//           </motion.div>
//         )}

//         {/* toasts */}
//         <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
//           {toasts.map((t) => (
//             <div
//               key={t.id}
//               className={`
//                 px-4 py-2 rounded-lg shadow-lg text-sm
//                 ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-sky-600'}
//               `}
//             >
//               {t.text}
//             </div>
//           ))}
//         </div>
//       </motion.div>

//       {/* subtle keyframes / styling kept minimal */}
//       <style jsx>{`
//         .gradient-text {
//           background: linear-gradient(-45deg, #ff6ec4, #7873f5, #4DA3FF, #4ade80, #ff6ec4);
//           background-clip: text;
//           -webkit-background-clip: text;
//           color: transparent;
//           background-size: 300% 300%;
//           animation: gradientFlow 4s ease-in-out infinite;
//         }
//         @keyframes gradientFlow {
//           0% { background-position: 0% 50%; }
//           50% { background-position: 100% 50%; }
//           100% { background-position: 0% 50%; }
//         }
//       `}</style>
//     </div>
//   );
// };

// export default UploadPage;

