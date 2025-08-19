# PDF Analysis Backend

This is the Python Flask backend for the PDF Analysis application. It provides REST APIs for PDF upload, processing, and heading extraction using AI models.

## 🚀 Features

- **PDF Upload & Validation**: Secure file upload with size and type validation
- **AI-Powered Heading Extraction**: Integration point for your Part 1A model
- **RESTful API**: Clean, documented endpoints for frontend integration
- **Error Handling**: Comprehensive error handling and logging
- **CORS Support**: Configured for React frontend integration
- **File Management**: Organized file storage and retrieval

## 📋 Prerequisites

- Python 3.8 or higher
- pip (Python package installer)

## 🛠 Setup Instructions

### 1. Create Virtual Environment

```bash
cd backend
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

You should see output like:
```
==================================================
PDF Analysis Backend Server
==================================================
Upload folder: /path/to/backend/uploads
Max file size: 50MB
Allowed extensions: {'pdf'}
==================================================
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://[your-ip]:5000
```

## 📚 API Endpoints

### Health Check
```http
GET /health
```
**Response:**
```json
{
  "status": "healthy",
  "message": "PDF Analysis API is running",
  "version": "1.0.0"
}
```

### Upload PDF
```http
POST /upload
Content-Type: multipart/form-data
```
**Body:** `file` (PDF file)

**Response:**
```json
{
  "success": true,
  "filename": "document.pdf",
  "outline": [...],
  "message": "Successfully processed PDF and found X headings"
}
```

### Process Existing PDF
```http
POST /process-pdf
Content-Type: application/json
```
**Body:**
```json
{
  "filename": "document.pdf"
}
```

### Get Outline
```http
GET /get-outline/<filename>
```

### List Files
```http
GET /files
```

## 🤖 AI Model Integration

The current implementation uses mock data for heading extraction. To integrate your **Part 1A AI model**:

### 1. Replace Mock Implementation

Edit the `process_with_ai_model` method in the `PDFProcessor` class:

```python
def process_with_ai_model(self, pdf_file_path: str) -> List[Dict[str, Any]]:
    """
    Integrate your Part 1A model here
    """
    # Import your model
    from your_model import HeadingDetector
    
    # Initialize detector
    detector = HeadingDetector()
    detector.load_model('path/to/your/model.pth')
    
    # Extract features from PDF
    features = detector.extract_features(pdf_file_path)
    
    # Run inference
    predictions = detector.predict(features)
    
    # Convert to expected format
    outline = detector.format_output(predictions)
    
    return outline
```

### 2. Expected Output Format

Your AI model should return headings in this format:

```python
[
    {
        "id": "unique_id",           # Unique identifier
        "text": "Heading Text",      # Extracted heading text
        "level": 1,                  # 0=Title, 1=H1, 2=H2, 3=H3
        "page": 1,                   # Page number (1-indexed)
        "x": 100,                    # X coordinate (optional)
        "y": 200,                    # Y coordinate (optional)
        "confidence": 0.95           # Model confidence (optional)
    }
]
```

### 3. Add Model Dependencies

Update `requirements.txt` with your model's dependencies:

```txt
# Your AI model dependencies
torch==2.0.1
transformers==4.30.0
numpy==1.24.3
opencv-python==4.8.0.74
# ... other dependencies
```

### 4. Model Files Structure

Organize your model files:

```
backend/
├── app.py
├── requirements.txt
├── models/
│   ├── __init__.py
│   ├── heading_detector.py    # Your model class
│   ├── weights/
│   │   └── model.pth         # Trained weights
│   └── utils/
│       ├── preprocessing.py   # PDF preprocessing
│       └── postprocessing.py  # Output formatting
└── uploads/                   # PDF storage
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file for production:

```env
FLASK_ENV=production
UPLOAD_FOLDER=uploads
MAX_FILE_SIZE=52428800  # 50MB in bytes
DEBUG=False
```

### File Upload Limits

Modify in `app.py`:

```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {'pdf'}
```

## 🛡 Security Features

- **File Type Validation**: Only PDF files accepted
- **File Size Limits**: Configurable maximum file size
- **Secure Filenames**: Uses `secure_filename()` to prevent path traversal
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Detailed error responses without exposing internals

## 📊 Logging

The application logs important events:

- File uploads and processing
- Error conditions
- Model inference results
- API request/response cycles

Logs are output to console. For production, configure file logging:

```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
```

## 🚀 Production Deployment

### Using Gunicorn

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Using Docker

Create `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

### Environment Setup

For production:

1. Set `FLASK_ENV=production`
2. Configure proper logging
3. Use a production WSGI server (Gunicorn, uWSGI)
4. Set up reverse proxy (Nginx)
5. Configure SSL/TLS

## 🧪 Testing

Test the API endpoints:

```bash
# Health check
curl http://localhost:5000/health

# Upload PDF
curl -X POST -F "file=@sample.pdf" http://localhost:5000/upload

# List files
curl http://localhost:5000/files
```

## 🤝 Integration with Frontend

The backend is designed to work seamlessly with the React frontend:

1. **CORS**: Configured to allow requests from React dev server
2. **JSON Responses**: All endpoints return JSON
3. **Error Handling**: Consistent error response format
4. **File Upload**: Supports multipart/form-data for file uploads

## 📝 Next Steps

1. **Integrate Your AI Model**: Replace mock implementation with your Part 1A model
2. **Add Authentication**: Implement user authentication if needed
3. **Database Integration**: Store processing results and user data
4. **Caching**: Implement Redis caching for processed PDFs
5. **Batch Processing**: Add support for processing multiple PDFs
6. **Monitoring**: Add application monitoring and metrics

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**:
   ```bash
   # Kill process on port 5000
   lsof -ti:5000 | xargs kill -9
   ```

2. **Permission Errors**:
   ```bash
   # Ensure uploads directory is writable
   chmod 755 uploads/
   ```

3. **Module Import Errors**:
   ```bash
   # Ensure virtual environment is activated
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   ```

4. **File Size Errors**:
   - Check `MAX_FILE_SIZE` configuration
   - Verify client-side file size limits

## 📞 Support

For questions or issues:

1. Check the logs for error details
2. Verify all dependencies are installed
3. Ensure Python version compatibility
4. Test API endpoints individually

---

**Ready to integrate your AI model and start processing PDFs!** 🚀