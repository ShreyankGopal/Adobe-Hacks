# app.py
# Replace your current app.py with this file. (Only backend changes.)
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
from generate_audio import generate_audio
from pydub import AudioSegment
from werkzeug.utils import secure_filename
import logging
from pathlib import Path
import fitz  # PyMuPDF
import pandas as pd
import joblib
import re
from sklearn.preprocessing import MinMaxScaler
import time
from datetime import datetime
import numpy as np
from RePDFBuilding import highlight_refined_texts
from sentence_transformers import SentenceTransformer, util
from llmProvider import LLMClient
from litellm import completion
import traceback
from werkzeug.utils import secure_filename
from gtts import gTTS
import os, time, traceback
# from nltk.corpus import wordnet
# from nltk.tokenize import word_tokenize
# import nltk
import urllib.parse
from datetime import datetime
import azure.cognitiveservices.speech as speechsdk
import random
import xml.sax.saxutils as saxutils
from RePDFBuildingNegative import highlight_refined_texts_negative
# nltk.download('punkt')
# nltk.download('punkt_tab')
# nltk.download('wordnet')
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
# Initialize LLM client
llm=LLMClient()
app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

model = None
embedder = None
#-------------------------
# generate contradictory
#-------------------------
# def generate_contradictory(text):
#     tokens = word_tokenize(text)
#     contradictory_tokens = []

#     for token in tokens:
#         antonyms = []
#         for syn in wordnet.synsets(token):
#             for lemma in syn.lemmas():
#                 if lemma.antonyms():
#                     antonyms.append(lemma.antonyms()[0].name())

#         if antonyms:
#             contradictory_tokens.append(antonyms[0])  # pick first antonym
#         else:
#             contradictory_tokens.append(token)

#     return " ".join(contradictory_tokens)
#-------------------------
# load model
#-------------------------
def load_model():
    global model, embedder
    model_path = "heading_classifier_with_font_count_norm_textNorm_5.pkl"
    if Path(model_path).exists():
        model = joblib.load(model_path)
        logger.info("Heading classifier model loaded successfully")
    else:
        logger.warning(f"Model file {model_path} not found!")

    try:
        cached_path = Path("./cached_model")
        if cached_path.exists():
            embedder = SentenceTransformer(str(cached_path))
            logger.info("SentenceTransformer loaded from ./cached_model")
        else:
            logger.info("Cached model not found. Downloading...")
            embedder = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
            embedder.save(str(cached_path))
            logger.info("Model downloaded and saved to ./cached_model")
    except Exception as e:
        logger.exception(f"Failed to load SentenceTransformer: {e}")
        embedder = None


# -------------------------
# PDF text utilities
# -------------------------
def is_bullet_point(text):
    text = text.strip()
    bullet_patterns = [
        r'^[•·▪▫▬►‣⁃]\s*', r'^\*\s+', r'^-\s+', r'^—\s+', r'^–\s+',
        r'^\+\s+', r'^>\s+', r'^»\s+', r'^○\s+', r'^□\s+', r'^▪\s+', r'^▫\s+'
    ]
    for pattern in bullet_patterns:
        if re.match(pattern, text):
            return True
    if re.match(r'^\d+[\.\)]\s*$', text) or re.match(r'^[a-zA-Z][\.\)]\s*$', text):
        return True
    if len(text) <= 3 and re.match(r'^[^\w\s]+$', text):
        return True
    return False

def should_ignore_text(text):
    text = text.strip()
    if len(text) < 2:
        return True
    if is_bullet_point(text):
        return True
    if re.match(r'^\d+$', text) or re.match(r'^[a-zA-Z]$', text):
        return True
    artifacts = ['©', '®', '™', '...', '…']
    if text in artifacts:
        return True
    return False

def clean_text(text):
    text = text.strip()
    bullet_patterns = [
        r'^[•·▪▫▬►‣⁃]\s*', r'^\*\s+', r'^-\s+', r'^—\s+', r'^–\s+',
        r'^\+\s+', r'^>\s+', r'^»\s+', r'^○\s+', r'^□\s+', r'^▪\s+', r'^▫\s+'
    ]
    for pattern in bullet_patterns:
        text = re.sub(pattern, '', text)
    return text.strip()


# -------------------------
# analyze_pdf_sections (produces both df for classifier AND lines_list mapping)
# -------------------------
def extract_features(text, pdf_path, page_num, font_size, is_bold, is_italic, position_y, y_gap, start_line=None, end_line=None):
    text_length = len(text)
    upper_count = sum(1 for c in text if c.isupper())
    total_alpha = sum(1 for c in text if c.isalpha())
    capitalization_ratio = upper_count / total_alpha if total_alpha > 0 else 0
    starts_with_numbering = bool(re.match(r'^\d+(\.\d+)*(\.|\))\s', text))
    dot_match = re.match(r'^(\d+\.)+(\d+)', text)
    num_dots_in_prefix = dot_match.group(1).count('.') if dot_match else 0

    row = {
        'PDF Path': str(pdf_path),
        'Page Number': page_num,
        'Section Text': text,
        'Font Size': font_size,
        'Is Bold': is_bold,
        'Is Italic': is_italic,
        'Text Length': text_length,
        'Capitalization Ratio': capitalization_ratio,
        'Starts with Numbering': starts_with_numbering,
        'Position Y': position_y,
        'Prefix Dot Count': num_dots_in_prefix,
        'Y Gap': y_gap
    }
    # attach start/end line indexes for later mapping to rects
    if start_line is not None:
        row['Start Line'] = int(start_line)
    if end_line is not None:
        row['End Line'] = int(end_line)
    return row

def analyze_pdf_sections(pdf_path):
    """
    Parse the PDF and return:
      - df: DataFrame of grouped rows (for classifier). Each row contains Start Line and End Line.
      - lines_list: list of per-physical-line dicts: { line_index, page, text, bbox }
    """
    grouped_rows = []   # will become rows for df (paragraph/group-level)
    lines_list = []     # one entry per physical text line found in order
    try:
        doc = fitz.open(pdf_path)
        line_counter = 0

        for page_idx in range(doc.page_count):
            page = doc.load_page(page_idx)
            blocks = page.get_text("dict").get('blocks', [])

            # For grouping we track a current group (list of text lines' indices and texts)
            current_group_line_indices = []
            current_group_texts = []
            # representative style properties for current group (first line's style)
            current_font_size = None
            current_bold = None
            current_italic = None
            prev_line_y = None
            prev_y_gap = None

            for block in blocks:
                if block.get('type') != 0:
                    continue
                for line in block.get('lines', []):
                    spans = [s for s in line.get('spans', []) if s.get('text','').strip()]
                    if not spans:
                        continue

                    line_text = " ".join(span['text'].strip() for span in spans)
                    if should_ignore_text(line_text):
                        continue
                    cleaned = clean_text(line_text)
                    if not cleaned:
                        continue

                    # compute bbox for the physical line (union of spans)
                    x0 = min(s['bbox'][0] for s in spans)
                    y0 = min(s['bbox'][1] for s in spans)
                    x1 = max(s['bbox'][2] for s in spans)
                    y1 = max(s['bbox'][3] for s in spans)
                    bbox = [x0, y0, x1, y1]

                    # style info from first span of the line
                    first_span = spans[0]
                    font_size = first_span.get('size', 0)
                    font_flags = first_span.get('flags', 0)
                    is_bold = (font_flags & 16) > 0
                    is_italic = (font_flags & 2) > 0
                    y_pos = first_span['bbox'][1]

                    # always append a physical line entry
                    lines_list.append({
                        'line_index': line_counter,
                        'page': page_idx + 1,
                        'text': cleaned,
                        'bbox': bbox,
                    })
                    this_line_index = line_counter
                    line_counter += 1

                    # compute y gap relative to previous line (for features)
                    if prev_line_y is None:
                        y_gap = None
                    else:
                        y_gap = abs(y_pos - prev_line_y)
                    prev_line_y = y_pos

                    # decide whether to continue the current group or start a new group
                    if current_font_size is None:
                        # first line in group
                        current_group_line_indices = [this_line_index]
                        current_group_texts = [cleaned]
                        current_font_size = font_size
                        current_bold = is_bold
                        current_italic = is_italic
                        prev_y_gap = y_gap
                    else:
                        same_style = (abs(current_font_size - font_size) < 0.5 and is_bold == current_bold and is_italic == current_italic)
                        if same_style:
                            # continue group
                            current_group_line_indices.append(this_line_index)
                            current_group_texts.append(cleaned)
                        else:
                            # finalize previous group into one grouped row
                            full_text = " ".join(current_group_texts)
                            if not should_ignore_text(full_text) and len(full_text.strip()) > 2:
                                start_line = current_group_line_indices[0]
                                end_line = current_group_line_indices[-1]
                                feat = extract_features(full_text, pdf_path, page_idx + 1,
                                                        current_font_size, current_bold, current_italic,
                                                        prev_line_y, prev_y_gap, start_line=start_line, end_line=end_line)
                                grouped_rows.append(feat)
                            # start new group with this line
                            current_group_line_indices = [this_line_index]
                            current_group_texts = [cleaned]
                            current_font_size = font_size
                            current_bold = is_bold
                            current_italic = is_italic
                            prev_y_gap = y_gap

            # finalize group's leftover at end of page
            if current_group_texts:
                full_text = " ".join(current_group_texts)
                if not should_ignore_text(full_text) and len(full_text.strip()) > 2:
                    start_line = current_group_line_indices[0]
                    end_line = current_group_line_indices[-1]
                    feat = extract_features(full_text, pdf_path, page_idx + 1,
                                            current_font_size, current_bold, current_italic,
                                            prev_line_y, prev_y_gap, start_line=start_line, end_line=end_line)
                    grouped_rows.append(feat)
                # reset for next page
                current_group_line_indices = []
                current_group_texts = []
                current_font_size = None
                current_bold = None
                current_italic = None
                prev_y_gap = None

        doc.close()
    except Exception as e:
        logger.exception(f"Error processing {pdf_path}: {e}")

    df = pd.DataFrame(grouped_rows)
    return df, lines_list


# -------------------------
# unchanged helpers: preprocess_features, build_json_from_predictions, mmr
# (copy your existing implementations; unchanged)
# -------------------------
def preprocess_features(df):
    if df.empty:
        return df

    df['Is Bold'] = df['Is Bold'].astype(int)
    df['Is Italic'] = df['Is Italic'].astype(int)
    df['Starts with Numbering'] = df['Starts with Numbering'].astype(int)

    font_sizes = sorted(df['Font Size'].unique(), reverse=True)
    font_size_rank_map = {size: rank + 1 for rank, size in enumerate(font_sizes)}
    df['Font Size Rank'] = df['Font Size'].map(font_size_rank_map)

    df['Font Size Normalised'] = df['Font Size']
    columns_to_normalize = ['Font Size Normalised', 'Text Length', 'Capitalization Ratio', 'Position Y']
    if len(df) > 0:
        scaler = MinMaxScaler()
        df[columns_to_normalize] = scaler.fit_transform(df[columns_to_normalize])

    if not df['Font Size'].empty:
        body_font_size = df['Font Size'].mode()[0]
        df['Font Ratio'] = df['Font Size'] / body_font_size
    else:
        df['Font Ratio'] = 1.0

    df['Font Size Count'] = df['Font Size'].map(df['Font Size'].value_counts())
    df['Is Unique Font Size'] = (df['Font Size Count'] == 1).astype(int)

    df['Y Gap'] = df['Y Gap'].fillna(2)
    df['Y Gap'] = pd.to_numeric(df['Y Gap'], errors='coerce').fillna(2)

    def scale_column_per_pdf(group):
        if len(group) > 1 and group.std() > 0:
            scaler = MinMaxScaler()
            return scaler.fit_transform(group.values.reshape(-1, 1)).flatten()
        else:
            return [0] * len(group)

    df['Y Gap Scaled'] = df.groupby('PDF Path')['Y Gap'].transform(scale_column_per_pdf)
    df['Font Size Count'] = df.groupby('PDF Path')['Font Size Count'].transform(scale_column_per_pdf)
    return df

def build_json_from_predictions(df):
    outline = []
    title_rows = df[df['Label'] == 'Title']
    if not title_rows.empty:
        title_text = title_rows.iloc[0]['Section Text']
        title_page = int(title_rows.iloc[0]['Page Number'])
    else:
        non_none = df[df['Label'] != 'None']
        title_text = non_none.iloc[0]['Section Text'] if not non_none.empty else "Untitled Document"
        title_page = int(non_none.iloc[0]['Page Number']) if not non_none.empty else 1

    for _, row in df[(df['Label'] != 'None') & (df['Label'] != 'Title')].iterrows():
        outline.append({
            "level": row['Label'],
            "text": row['Section Text'],
            "page": int(row['Page Number'])
        })

    return {
        "title": title_text,
        "outline": outline
    }
# -------------------------
# mmr function: implements MMR algorithm for section selection
# -------------------------
def mmr(query_emb, sections, lambda_param, top_k, isContra=0):
    if not sections:
        return [], []

    selected, remaining = [], list(range(len(sections)))
    sim_q = [util.cos_sim(query_emb, s['embedding']).item() for s in sections]
    sim_doc = [
                [util.cos_sim(sections[i]['embedding'], sections[j]['embedding']).item() for j in range(len(sections))]
                for i in range(len(sections))
            ]

    if isContra:  # only return indices with similarity < 0
        contra_indices = [i for i, score in enumerate(sim_q) if score < 0]
        return contra_indices, sim_q

    # normal mmr
    while len(selected) < top_k and remaining:
        if not selected:
            idx = int(np.argmax([sim_q[i] for i in remaining]))
            idx = remaining[idx]
            selected.append(idx)
            remaining.remove(idx)
        else:
            mmr_scores = []
            for idx in remaining:
                max_sim = max(sim_doc[idx][j] for j in selected) if selected else 0
                score = lambda_param * sim_q[idx] - (1 - lambda_param) * max_sim
                mmr_scores.append(score)
            chosen_rel_index = int(np.argmax(mmr_scores))
            idx = remaining[chosen_rel_index]
            selected.append(idx)
            remaining.remove(idx)
    return selected, sim_q

#--------------------------------------- #
#     only to upload file                #
#--------------------------------------- #
@app.route('/upload-only-file', methods=['POST'])
def upload_only_file():
    try:
        if 'pdf' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['pdf']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        if file and '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() not in ALLOWED_EXTENSIONS:
            return jsonify({"error": "Invalid file type. Only PDF files are allowed"}), 400

        if request.content_length and request.content_length > MAX_FILE_SIZE:
            return jsonify({"error": "File too large. Maximum size is 50MB"}), 400

        filename = secure_filename(file.filename)
        
        
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        logger.info(f"Uploaded file: {filename}")
        return jsonify({"filename": filename, "filepath": filepath}), 200
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        return jsonify({"error": "Error uploading file"}), 500
#--------------------------------------- #
# upload endpoint: builds sections using df rows' Start/End line indices
#--------------------------------------- #
@app.route('/upload', methods=['POST'])
def upload_pdf():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        if file and '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() not in ALLOWED_EXTENSIONS:
            return jsonify({"error": "Invalid file type. Only PDF files are allowed"}), 400

        if request.content_length and request.content_length > MAX_FILE_SIZE:
            return jsonify({"error": "File too large. Maximum size is 50MB"}), 400

        filename = secure_filename(file.filename)
        timestamp = str(int(time.time()))
        filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        logger.info(f"Uploaded file: {filename}")

        if model is None:
            os.remove(filepath)
            return jsonify({"error": "Model not loaded"}), 500

        # analyze: get grouped df (for classifier) and lines_list (per-line bboxes)
        df, lines_list = analyze_pdf_sections(filepath)
        if (df is None or df.empty) and not lines_list:
            os.remove(filepath)
            return jsonify({"error": "No extractable text"}), 400

        df = preprocess_features(df)
        if df.empty:
            os.remove(filepath)
            return jsonify({"error": "Preprocessing failed"}), 400

        features = [
            'Font Ratio', 'Font Size Rank', 'Text Length', 'Capitalization Ratio',
            'Position Y', 'Is Bold', 'Is Italic',
            'Starts with Numbering', 'Font Size Count', 'Is Unique Font Size'
        ]
        df['Label'] = model.predict(df[features])

        structured_json = build_json_from_predictions(df)

        # Build sections mapping using Title/H1/H2 as section starts (but use Start/End Line indices
        # from grouped df rows to collect all physical lines for the full section body)
        sections = []
        final_df = df.reset_index(drop=True)
        section_labels = ['Title', 'H1', 'H2']
        for i, row in final_df.iterrows():
            if row['Label'] in section_labels:
                heading = row['Section Text']
                # collect grouped rows texts until next heading
                body_rows = []
                body_start_line = None
                body_end_line = None
                for j in range(i + 1, len(final_df)):
                    next_row = final_df.iloc[j]
                    if next_row['Label'] in section_labels:
                        break
                    body_rows.append(next_row['Section Text'])
                    # get start/end line indices if present
                    sline = next_row.get('Start Line', None)
                    eline = next_row.get('End Line', None)
                    if sline is not None:
                        if body_start_line is None:
                            body_start_line = int(sline)
                        body_end_line = int(eline) if eline is not None else body_end_line

                # If there were no body grouped rows, include nothing (heading-only)
                # But always include heading text.
                full_text = heading + (" " + " ".join(body_rows) if body_rows else "")

                # Compute page numbers:
                start_line = int(row.get('Start Line', -1)) if 'Start Line' in row else -1
                end_line = body_end_line if body_end_line is not None else (int(row.get('End Line', -1)) if 'End Line' in row else start_line)
                start_page = None
                end_page = None
                if start_line >= 0 and start_line < len(lines_list):
                    start_page = lines_list[start_line]['page']
                if end_line is not None and end_line >= 0 and end_line < len(lines_list):
                    end_page = lines_list[end_line]['page']

                # Gather all physical line indices for this section:
                collected_line_indices = []
                # include heading group lines:
                if start_line is not None and start_line >= 0:
                    # find the grouped row for the heading (it had Start/End Line)
                    heading_sline = int(row.get('Start Line', start_line))
                    heading_eline = int(row.get('End Line', start_line))
                    collected_line_indices.extend(list(range(heading_sline, heading_eline + 1)))
                # include body grouped lines by collecting the Start/End ranges for each body grouped row
                if body_rows:
                    for j in range(i + 1, i + 1 + len(body_rows)):
                        br = final_df.iloc[j]
                        bs = br.get('Start Line', None)
                        be = br.get('End Line', None)
                        if bs is not None and be is not None:
                            collected_line_indices.extend(list(range(int(bs), int(be) + 1)))

                # make per-page union bounding boxes from collected_line_indices
                page_to_box = {}
                for li in collected_line_indices:
                    if li is None or li < 0 or li >= len(lines_list):
                        continue
                    rec = lines_list[li]
                    p = rec['page']
                    bbox = rec['bbox']
                    if p not in page_to_box:
                        page_to_box[p] = {
                            'x0': bbox[0],
                            'y0': bbox[1],
                            'x1': bbox[2],
                            'y1': bbox[3]
                        }
                    else:
                        pb = page_to_box[p]
                        pb['x0'] = min(pb['x0'], bbox[0])
                        pb['y0'] = min(pb['y0'], bbox[1])
                        pb['x1'] = max(pb['x1'], bbox[2])
                        pb['y1'] = max(pb['y1'], bbox[3])

                rects = []
                for p, box in page_to_box.items():
                    rects.append({
                        "page": int(p),
                        "bbox": [float(box['x0']), float(box['y0']), float(box['x1']), float(box['y1'])]
                    })

                sections.append({
                    "heading": heading,
                    "text": full_text,
                    "page": start_page if start_page is not None else int(row.get('Page Number', 1)),
                    "start_line": start_line,
                    "start_page": start_page,
                    "end_line": end_line,
                    "end_page": end_page,
                    "rects": rects
                })

        response_payload = {
            "success": True,
            "filename": filename,
            "outline": structured_json,
            "sections": sections,
            "message": f"Successfully processed PDF and found {len(structured_json['outline'])} headings and {len(sections)} sections"
        }

        return jsonify(response_payload)

    except Exception as e:
        logger.exception(f"Error processing upload: {str(e)}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

#---------------------------- #
# negative pdf query          #
#---------------------------- #


@app.route('/pdf_query_negative', methods=['POST'])
def pdf_query_negative():
    try:
        import json
        import urllib.parse
        data = request.get_json(force=True)
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400

        selectedText = data.get('selectedText')
        documents = data.get('documents', [])
        if not isinstance(documents, list):
            return jsonify({"error": "documents must be a list"}), 400

        if embedder is None:
            return jsonify({"error": "Embedder not loaded on server"}), 500

        # Generate contradictory query
        query_text = generate_contradictory(selectedText)
        query_embedding = embedder.encode(query_text, normalize_embeddings=True)

        section_data = []
        for doc in documents:
            filename = doc.get('filename') or doc.get('serverFilename') or doc.get('name')
            sections_list = doc.get('sections')
            if not sections_list:
                outline_obj = doc.get('outline') or {}
                sections_list = outline_obj.get('outline') if isinstance(outline_obj, dict) else None
            if not sections_list:
                continue

            for item in sections_list:
                if isinstance(item, dict) and 'text' in item:
                    heading = item.get('heading') or item.get('text')
                    full_text = item['text']
                    page = item.get('page')
                    rects = item.get('rects', [])
                    start_line = item.get('start_line')
                    end_line = item.get('end_line')
                    start_page = item.get('start_page')
                    end_page = item.get('end_page')
                else:
                    continue

                emb = embedder.encode(full_text, normalize_embeddings=True)
                section_data.append({
                    'Document': filename,
                    'Page': page if page is not None else -1,
                    'heading': heading,
                    'text': full_text,
                    'embedding': emb,
                    'rects': rects,
                    'start_line': start_line,
                    'end_line': end_line,
                    'start_page': start_page,
                    'end_page': end_page
                })

        if not section_data:
            return jsonify({"error": "No headings/sections found"}), 400

        top_k = min(5, len(section_data))
        selected_indices, sim_scores = mmr(query_embedding, section_data, lambda_param=0.72, top_k=top_k)

        now = datetime.now().isoformat()
        output = {
            "metadata": {
                "input_documents": [d.get('filename') for d in documents],
                "selected_text": selectedText,
                "processing_timestamp": now
            },
            "extracted_sections": [],
            "subsection_analysis": []
        }

        for rank, idx in enumerate(selected_indices, start=1):
            sec = section_data[idx]
            output['extracted_sections'].append({
                "document": sec['Document'],
                "section_title": sec['heading'],
                "importance_rank": rank,
                "page_number": sec['Page'],
                "rects": sec.get('rects', []),
                "start_line": sec.get('start_line'),
                "end_line": sec.get('end_line'),
                "start_page": sec.get('start_page'),
                "end_page": sec.get('end_page')
            })
            output['subsection_analysis'].append({
                "document": sec['Document'],
                "refined_text": sec['text'],
                "page_number": sec['Page'],
                "rects": sec.get('rects', []),
                "start_line": sec.get('start_line'),
                "end_line": sec.get('end_line'),
                "start_page": sec.get('start_page'),
                "end_page": sec.get('end_page')
            })
        annotated_map = highlight_refined_texts_negative(output)
        # Build the text for LLM podcast summarization, preserving importance order
        sections_formatted = "\n\n".join(
            f"Section {i+1} (Rank {sec.get('importance_rank', '?')}): {sec.get('section_title', 'Untitled')}\n{sec['refined_text']}"
            for i, sec in enumerate(sorted(output['subsection_analysis'], key=lambda x: x.get('importance_rank', 999)))
            if sec.get('refined_text')
        )
        output['sections_formatted'] = sections_formatted
        
        output['metadata']['annotated_files'] = annotated_map

        
        print("done pdf negative processing to find contradictions")
        return jsonify(output)

    except Exception as e:
        logger.exception("Error in pdf_query_negative")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

#---------------------------#
# PDF summarization Route    #
#---------------------------#

@app.route('/generate_summary', methods=['POST'])
def generate_summary():
    try:
        import json
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        text_content = data.get("text")
        if not text_content:
            return jsonify({"error": "Missing 'text' field"}), 400

        custom_prompt = data.get("prompt") or """
        Summarize the following text in a concise and clear way.
        Respond only with the summary text, no formatting.
        """

        prompt = f"""
        {custom_prompt}

        ---
        {text_content}
        ---
        """

        summary_text = llm.generate(prompt).strip()
        return jsonify({"summary": summary_text})

    except Exception as e:
        logger.exception("Error in generate_summary")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
#---------------------------#
# Did You Know Route        #
#---------------------------#
@app.route('/generate_didyouknow', methods=['POST'])
def generate_didyouknow():
    try:
        import json
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        text_content = data.get("text")
        if not text_content:
            return jsonify({"error": "Missing 'text' field"}), 400

        custom_prompt = data.get("prompt") or """
        Generate a Did You Know fact based on the text below.
        Respond only with the fact, no extra commentary.
        """

        prompt = f"""
        {custom_prompt}

        ---
        {text_content}
        ---
        """

        didyouknow_text = llm.generate(prompt).strip()
        return jsonify({"didYouKnow": didyouknow_text})
    except Exception as e:
        logger.exception("Error in generate_didyouknow")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/generate_podcast', methods=['POST'])
def generate_podcast():
    try:
        import json
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        text_content = data.get("text")
        if not text_content:
            return jsonify({"error": "Missing 'text' field"}), 400

        custom_prompt = data.get("prompt") or """
        Write a short, engaging 2-minute podcast script based on the text below.
        Respond only with the script, no extra commentary. Make it sound as natural as possible.
        """

        prompt = f"""
        {custom_prompt}

        ---
        {text_content}
        ---
        """

        podcast_script = llm.generate(prompt).strip()

        # Generate audio file
        tts = gTTS(text=podcast_script, lang="en", slow=False)
        filename = secure_filename(f"podcast_{int(time.time())}.mp3")
        file_path = os.path.join(AUDIO_DIR, filename)
        tts.save(file_path)
        podcast_audio_url = f"http://localhost:5001/static/audio/{filename}"

        return jsonify({
            "script": podcast_script,
            "audio_url": podcast_audio_url
        })

    except Exception as e:
        logger.exception("Error in generate_podcast")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
#---------------------------#
# positive pdf query          #
#---------------------------#

@app.route('/pdf_query', methods=['POST'])
def pdf_query():
    try:
        import json
        import urllib.parse
        data = request.get_json(force=True)
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400

        selectedText = data.get('selectedText')
        documents = data.get('documents', [])
        if not isinstance(documents, list):
            return jsonify({"error": "documents must be a list"}), 400

        if embedder is None:
            return jsonify({"error": "Embedder not loaded on server"}), 500

        query_text = selectedText
        query_embedding = embedder.encode(query_text, normalize_embeddings=True)

        section_data = []
        for doc in documents:
            filename = doc.get('filename') or doc.get('serverFilename') or doc.get('name')
            sections_list = doc.get('sections')
            if not sections_list:
                outline_obj = doc.get('outline') or {}
                sections_list = outline_obj.get('outline') if isinstance(outline_obj, dict) else None

            if not sections_list:
                continue

            for item in sections_list:
                if isinstance(item, dict) and 'text' in item and 'heading' in item:
                    heading = item['heading']
                    full_text = item['text']
                    page = item.get('page')
                    rects = item.get('rects', [])
                    start_line = item.get('start_line')
                    end_line = item.get('end_line')
                    start_page = item.get('start_page')
                    end_page = item.get('end_page')
                elif isinstance(item, dict) and 'text' in item and 'level' in item:
                    heading = item['text']
                    full_text = item['text']
                    page = item.get('page')
                    rects = []
                    start_line = end_line = start_page = end_page = None
                else:
                    heading = item.get('heading') if isinstance(item, dict) else str(item)
                    full_text = item.get('text') if isinstance(item, dict) else heading
                    page = item.get('page') if isinstance(item, dict) else None
                    rects = item.get('rects') if isinstance(item, dict) else []
                    start_line = item.get('start_line') if isinstance(item, dict) else None
                    end_line = item.get('end_line') if isinstance(item, dict) else None
                    start_page = item.get('start_page') if isinstance(item, dict) else None
                    end_page = item.get('end_page') if isinstance(item, dict) else None

                emb = embedder.encode(full_text, normalize_embeddings=True)
                section_data.append({
                    'Document': filename,
                    'Page': page if page is not None else -1,
                    'heading': heading,
                    'text': full_text,
                    'embedding': emb,
                    'rects': rects,
                    'start_line': start_line,
                    'end_line': end_line,
                    'start_page': start_page,
                    'end_page': end_page
                })

        if not section_data:
            return jsonify({"error": "No headings/sections found in supplied documents"}), 400

        # Positive retrieval
        top_k = min(5, len(section_data))
        pos_indices, pos_scores = mmr(query_embedding, section_data, lambda_param=0.72, top_k=top_k, isContra=0)

        # Negative retrieval (contradictory)
        #neg_query = generate_contradictory(selectedText)
        #neg_query_emb = embedder.encode(neg_query, normalize_embeddings=True)
        neg_indices, neg_scores = mmr(query_embedding, section_data, lambda_param=0.72, top_k=0, isContra=1)

        def build_output(indices, label):
            now = datetime.now().isoformat()
            out = {
                "metadata": {
                    "input_documents": [d.get('filename') for d in documents],
                    "selected_text": selectedText,
                    "processing_timestamp": now
                },
                "extracted_sections": [],
                "subsection_analysis": []
            }

            for rank, idx in enumerate(indices, start=1):
                sec = section_data[idx]
                out['extracted_sections'].append({
                    "document": sec['Document'],
                    "section_title": sec['heading'],
                    "importance_rank": rank,
                    "page_number": sec['Page'],
                    "rects": sec.get('rects', []),
                    "start_line": sec.get('start_line'),
                    "end_line": sec.get('end_line'),
                    "start_page": sec.get('start_page'),
                    "end_page": sec.get('end_page')
                })
                out['subsection_analysis'].append({
                    "document": sec['Document'],
                    "refined_text": sec['text'],
                    "page_number": sec['Page'],
                    "rects": sec.get('rects', []),
                    "start_line": sec.get('start_line'),
                    "end_line": sec.get('end_line'),
                    "start_page": sec.get('start_page'),
                    "end_page": sec.get('end_page')
                })

            annotated_map = highlight_refined_texts(out)
            sections_formatted = "\n\n".join(
                f"Section {i+1} (Rank {sec.get('importance_rank', '?')}): {sec.get('section_title', 'Untitled')}\n{sec['refined_text']}"
                for i, sec in enumerate(sorted(out['subsection_analysis'], key=lambda x: x.get('importance_rank', 999)))
                if sec.get('refined_text')
            )
            out['sections_formatted'] = sections_formatted
            out['metadata']['annotated_files'] = annotated_map
            return out

        output = {
            "Positive": build_output(pos_indices, "Positive"),
            "Negative": build_output(neg_indices, "Negative")
        }
        print("printing output ", output)
        return jsonify(output)

    except Exception as e:
        logger.exception("Error in pdf_query")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500


       
@app.route('/role_query', methods=['POST'])
def role_query():
    try:
        data = request.get_json(force=True)
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400

        persona = None
        if isinstance(data.get('persona'), dict):
            persona = data['persona'].get('role')
        else:
            persona = data.get('persona')

        job = None
        if isinstance(data.get('job_to_be_done'), dict):
            job = data['job_to_be_done'].get('task')
        else:
            job = data.get('job_to_be_done')

        if not persona or not job:
            return jsonify({"error": "Missing persona or job_to_be_done"}), 400

        documents = data.get('documents', [])
        if not isinstance(documents, list):
            return jsonify({"error": "documents must be a list"}), 400

        if embedder is None:
            return jsonify({"error": "Embedder not loaded on server"}), 500
        numRanks = data.get('numRanks')
        query_text = f"{job} {persona}"
        query_embedding = embedder.encode(query_text, normalize_embeddings=True)

        section_data = []
        for doc in documents:
            filename = doc.get('filename') or doc.get('serverFilename') or doc.get('name')
            sections_list = doc.get('sections')
            if not sections_list:
                outline_obj = doc.get('outline') or {}
                sections_list = outline_obj.get('outline') if isinstance(outline_obj, dict) else None

            if not sections_list:
                continue

            for item in sections_list:
                if isinstance(item, dict) and 'text' in item and 'heading' in item:
                    heading = item['heading']
                    full_text = item['text']
                    page = item.get('page')
                    rects = item.get('rects', [])
                    start_line = item.get('start_line')
                    end_line = item.get('end_line')
                    start_page = item.get('start_page')
                    end_page = item.get('end_page')
                elif isinstance(item, dict) and 'text' in item and 'level' in item:
                    heading = item['text']
                    full_text = item['text']
                    page = item.get('page')
                    rects = []
                    start_line = end_line = start_page = end_page = None
                else:
                    heading = item.get('heading') if isinstance(item, dict) else str(item)
                    full_text = item.get('text') if isinstance(item, dict) else heading
                    page = item.get('page') if isinstance(item, dict) else None
                    rects = item.get('rects') if isinstance(item, dict) else []
                    start_line = item.get('start_line') if isinstance(item, dict) else None
                    end_line = item.get('end_line') if isinstance(item, dict) else None
                    start_page = item.get('start_page') if isinstance(item, dict) else None
                    end_page = item.get('end_page') if isinstance(item, dict) else None

                emb = embedder.encode(full_text, normalize_embeddings=True)
                section_data.append({
                    'Document': filename,
                    'Page': page if page is not None else -1,
                    'heading': heading,
                    'text': full_text,
                    'embedding': emb,
                    'rects': rects,
                    'start_line': start_line,
                    'end_line': end_line,
                    'start_page': start_page,
                    'end_page': end_page
                })

        if not section_data:
            return jsonify({"error": "No headings/sections found in supplied documents"}), 400

        top_k = min(numRanks, len(section_data))
        selected_indices, sim_scores = mmr(query_embedding, section_data, lambda_param=0.72, top_k=top_k)

        now = datetime.now().isoformat()
        output = {
            "metadata": {
                "input_documents": [d.get('filename') for d in documents],
                "persona": persona,
                "job_to_be_done": job,
                "processing_timestamp": now
            },
            "extracted_sections": [],
            "subsection_analysis": []
        }

        for rank, idx in enumerate(selected_indices, start=1):
            sec = section_data[idx]
            output['extracted_sections'].append({
                "document": sec['Document'],
                "section_title": sec['heading'],
                "importance_rank": rank,
                "page_number": sec['Page'],
                "rects": sec.get('rects', []),
                "start_line": sec.get('start_line'),
                "end_line": sec.get('end_line'),
                "start_page": sec.get('start_page'),
                "end_page": sec.get('end_page')
            })
            output['subsection_analysis'].append({
                "document": sec['Document'],
                "refined_text": sec['text'],
                "page_number": sec['Page'],
                "rects": sec.get('rects', []),
                "start_line": sec.get('start_line'),
                "end_line": sec.get('end_line'),
                "start_page": sec.get('start_page'),
                "end_page": sec.get('end_page')
            })

        annotated_map = highlight_refined_texts(output)  # returns { original_filename: annotated_filename, ... }

        # Build the text for LLM podcast summarization, preserving importance order
        sections_formatted = "\n\n".join(
            f"Section {i+1} (Rank {sec.get('importance_rank', '?')}): {sec.get('section_title', 'Untitled')}\n{sec['refined_text']}"
            for i, sec in enumerate(sorted(output['subsection_analysis'], key=lambda x: x.get('importance_rank', 999)))
            if sec.get('refined_text')
        )

        # attach to metadata so frontend can use annotated copies
        output['metadata']['annotated_files'] = annotated_map
        
        output['sections_formatted'] = sections_formatted
        return jsonify(output)

    except Exception as e:
        logger.exception("Error in role_query")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

#----------------------------- PDF Route handling --------------------------------------#
@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_pdf(filename):
    safe_name = secure_filename(filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)

    if not os.path.exists(file_path):
        print(f"File '{safe_name}' not found")
        return jsonify({"error": f"File '{safe_name}' not found"}), 404

    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], safe_name)
    except Exception as e:
        app.logger.error(f"Error serving PDF '{safe_name}': {e}")
        return jsonify({"error": f"Error serving PDF: {str(e)}"}), 500
#----------------------------- LLM Route handling --------------------------------------#
@app.route('/<task>', methods=['POST'])
def generate(task):
    try:
        print(task)
        data = request.get_json()
        if not data or 'prompt' not in data:
            return jsonify({"error": "Missing prompt"}), 400

        prompt = data['prompt']

        if task == "did-you-know":
            prompt = f"{prompt} Ignore the task, only give me a 'Did You Know?' fact about the given relevant sections. Do not write 'Did You Know?' in your response. Add an exclamation mark at the end of your fact."
        elif task == "summarize":
            prompt = f"{prompt} Summarize the mentioned relvant sections clearly and concisely. Format the result text well, leaving lines between paragraphs."
        elif task != "generate":
            return jsonify({"error": "Invalid task"}), 400

        response = llm.generate(prompt)
        return jsonify({"response": response})
    except Exception as e:
        logger.exception("Error in generate")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/files', methods=['GET'])
def list_files():
    try:
        files = []
        for filename in os.listdir(app.config['UPLOAD_FOLDER']):
            if filename.endswith('.pdf'):
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file_size = os.path.getsize(filepath)
                files.append({
                    "filename": filename,
                    "size": file_size,
                    "uploaded_at": os.path.getctime(filepath)
                })
        return jsonify({
            "success": True,
            "files": files,
            "count": len(files)
        })
    except Exception as e:
        logger.exception("Error listing files")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

AUDIO_DIR = os.path.join("static", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

#---------------------   PodCast -----------------------------------#

@app.route("/podcast", methods=["POST"])
def podcast():
    try:
        data = request.get_json()
        if isinstance(data, str):
            podcast_input = data
        else:
            podcast_input = data.get("podcast_input") or data.get("prompt")

        if not podcast_input:
            return jsonify({"error": "Missing podcast_input"}), 400

        # 1. Generate podcast script with Gemini (LLM)
        podcast_prompt = podcast_input + """
        Please create a concise and engaging 2-minute summary...
        """
        script_text = llm.generate(podcast_prompt)

        # 2. Convert to Audio
        filename = secure_filename(f"podcast_{int(time.time())}.mp3")
        file_path = os.path.join(AUDIO_DIR, filename)

        tts_provider = os.getenv("TTS_PROVIDER", "gcp").lower()

        if tts_provider == "azure":
            # Use Adobe’s provided script (Azure TTS)
            generate_audio(script_text, file_path)  
        else:
            # Local dev: fallback to Google TTS
            tts = gTTS(text=script_text, lang="en", slow=False)
            tts.save(file_path)

        # 3. Return script + audio URL
        return jsonify({
            "script": script_text,
            "audio_url": f"http://localhost:5001/static/audio/{filename}"
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    load_model()
    app.run(debug=True, host='0.0.0.0', port=5001)
