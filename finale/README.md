# PDF Analysis Tool

A modern, production-ready web application for analyzing PDF documents and extracting structured headings with intelligent navigation. Built with React.js frontend and Python Flask backend, designed for the Adobe hackathon.

## 🚀 Features

### Frontend (React + TypeScript)
- **🎯 Drag & Drop Upload**: Intuitive multi-file PDF upload interface with visual feedback
- **📱 Responsive Grid Display**: Beautiful card-based layout showing uploaded PDFs (3-4 per row)
- **🔍 Document Analysis**: Click any PDF to view and analyze with AI-powered processing
- **📋 Interactive Outline**: Collapsible tree view of extracted headings (Title, H1, H2, H3)
- **📖 Smart Navigation**: Click headings to navigate to specific sections with highlighting
- **🎨 Modern Design**: Professional UI with smooth animations and micro-interactions
- **📱 Mobile Responsive**: Optimized for all devices and screen sizes

### Backend (Python Flask)
- **🤖 AI Integration**: Ready for your Part 1A model integration
- **📤 Secure Upload**: File validation, size limits, and secure handling
- **🔗 RESTful APIs**: Clean, documented endpoints for all operations
- **📊 Processing Pipeline**: Structured heading extraction and analysis
- **🛡️ Error Handling**: Comprehensive error handling and logging

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript for type safety
- **Create React App** for standard React.js setup
- **React Router** for client-side navigation
- **Framer Motion** for smooth animations and transitions
- **React Dropzone** for drag-and-drop file uploads
- **Tailwind CSS** for modern, responsive styling
- **Lucide React** for beautiful, consistent icons

### Backend
- **Python Flask** for lightweight, flexible API server
- **PyPDF2** for PDF processing and text extraction
- **Flask-CORS** for seamless frontend integration
- **Werkzeug** for secure file handling
- **Comprehensive logging** for debugging and monitoring

## 📋 Prerequisites

- **Node.js** (16+ recommended)
- **Python** (3.8+ required)
- **npm** or **yarn** package manager

## 🚀 Quick Start

### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The React app will be available at `http://localhost:3000`

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python app.py
```

The backend API will be available at `http://localhost:5000`

## 📁 Project Structure

```
pdf-analysis-tool/
├── public/                     # Static assets
├── src/
│   ├── components/            # Reusable UI components (future)
│   ├── context/              # React context providers
│   │   └── PDFContext.tsx    # PDF state management
│   ├── pages/                # Main page components
│   │   ├── UploadPage.tsx    # PDF upload interface
│   │   └── DocumentViewer.tsx # PDF analysis view
│   ├── App.tsx               # Main app component with routing
│   ├── index.css             # Global styles and Tailwind
│   └── index.tsx             # App entry point
├── backend/
│   ├── app.py                # Flask application
│   ├── requirements.txt      # Python dependencies
│   ├── uploads/              # PDF file storage
│   └── README.md             # Backend documentation
├── package.json              # Node.js dependencies and scripts
├── tailwind.config.js        # Tailwind CSS configuration
└── README.md                 # This file
```

## 🎨 Design System

### Color Palette
- **Primary**: Blue gradient (`#3b82f6` to `#1d4ed8`)
- **Secondary**: Teal accent (`#14b8a6` to `#0f766e`)
- **Accent**: Orange highlights (`#f97316` to `#c2410c`)
- **Neutrals**: Gray scale for text and backgrounds

### Typography
- **Headings**: Bold, gradient text effects
- **Body**: Clean, readable sans-serif
- **Code**: Monospace for technical elements

### Components
- **Cards**: Elevated with subtle shadows and hover effects
- **Buttons**: Consistent styling with hover states
- **Animations**: Smooth transitions and micro-interactions

## 🔌 API Integration

### Current Endpoints

```bash
# Health check
GET /health

# Upload and process PDF
POST /upload
Content-Type: multipart/form-data
Body: file (PDF)

# Process existing PDF
POST /process-pdf
Content-Type: application/json
Body: {"filename": "document.pdf"}

# Get outline for PDF
GET /get-outline/<filename>

# List all uploaded files
GET /files
```

### Integrating Your AI Model

Replace the mock implementation in `backend/app.py`:

```python
def process_with_ai_model(self, pdf_file_path: str) -> List[Dict[str, Any]]:
    # TODO: Replace with your Part 1A model
    from your_model import HeadingDetector
    
    detector = HeadingDetector()
    detector.load_model('path/to/your/model.pth')
    
    # Extract features and run inference
    features = detector.extract_features(pdf_file_path)
    predictions = detector.predict(features)
    
    # Format output
    return detector.format_output(predictions)
```

### Expected Output Format

```json
[
    {
        "id": "unique_id",
        "text": "Introduction",
        "level": 1,
        "page": 1,
        "x": 100,
        "y": 200,
        "confidence": 0.95
    }
]
```

## 📱 User Experience Flow

1. **📤 Upload**: Users drag and drop or select multiple PDF files
2. **👀 Browse**: View uploaded files in a responsive grid layout
3. **🔍 Analyze**: Click any PDF to start AI-powered analysis
4. **📋 Navigate**: Use the collapsible outline to jump to any section
5. **✨ Highlight**: Headings are highlighted and auto-scrolled in the viewer

## 🎯 Key Features Implemented

### Upload Page
- ✅ Drag and drop file upload with visual feedback
- ✅ Multi-file support with progress indicators
- ✅ File validation (PDF only, size limits)
- ✅ Grid display with 3-4 PDFs per row
- ✅ Remove functionality with confirmation
- ✅ File size and upload date display
- ✅ Processing status indicators

### Document Viewer
- ✅ Collapsible sidebar with outline navigation
- ✅ Hierarchical heading display (Title, H1, H2, H3)
- ✅ Page navigation and current page indicator
- ✅ Confidence scores for AI predictions
- ✅ Mobile-responsive design with overlay sidebar
- ✅ Smooth animations and transitions
- ✅ Back navigation to upload page

### Technical Features
- ✅ React Context for state management
- ✅ TypeScript for type safety
- ✅ Responsive design with Tailwind CSS
- ✅ Error handling and loading states
- ✅ File size formatting and validation
- ✅ Secure backend API with CORS support

## 🔧 Development

### Available Scripts

```bash
# Frontend
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
npm run eject      # Eject from Create React App

# Backend
python app.py      # Run Flask development server
pip freeze > requirements.txt  # Update dependencies
```

### Environment Configuration

Create `.env` files for different environments:

```bash
# Frontend (.env)
REACT_APP_API_URL=http://localhost:5000
REACT_APP_MAX_FILE_SIZE=52428800

# Backend (.env)
FLASK_ENV=development
UPLOAD_FOLDER=uploads
MAX_FILE_SIZE=52428800
DEBUG=True
```

## 🚀 Production Deployment

### Frontend (Netlify/Vercel)
```bash
npm run build
# Deploy build/ folder
```

### Backend (Heroku/Railway/DigitalOcean)
```bash
# Add Procfile for Heroku:
web: gunicorn app:app

# Install production dependencies:
pip install gunicorn

# Configure environment variables
# Deploy with git or platform CLI
```

## 🧪 Testing

### Manual Testing Checklist

- [ ] Upload single PDF file
- [ ] Upload multiple PDF files
- [ ] Remove PDF from grid
- [ ] Navigate to document viewer
- [ ] Expand/collapse outline sections
- [ ] Click outline items for navigation
- [ ] Test responsive design on mobile
- [ ] Test error handling (invalid files, large files)

### API Testing

```bash
# Test health endpoint
curl http://localhost:5000/health

# Test file upload
curl -X POST -F "file=@sample.pdf" http://localhost:5000/upload

# Test file listing
curl http://localhost:5000/files
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with proper commit messages
4. Test thoroughly on both frontend and backend
5. Push to your branch: `git push origin feature-name`
6. Submit a pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Adobe** for hosting the hackathon and providing inspiration
- **React team** for the excellent framework and Create React App
- **Tailwind CSS** for the beautiful, utility-first styling system
- **Flask** for the lightweight, flexible backend framework
- **Framer Motion** for smooth, professional animations
- All contributors and testers who helped improve the application

## 📞 Support & Contact

For questions, issues, or contributions:

1. **Issues**: Open a GitHub issue with detailed description
2. **Features**: Submit feature requests with use cases
3. **Documentation**: Help improve documentation and examples
4. **Testing**: Report bugs and edge cases

---

**Built with ❤️ for the Adobe Hackathon** 

Ready to revolutionize PDF analysis with AI-powered heading detection! 🚀📄✨