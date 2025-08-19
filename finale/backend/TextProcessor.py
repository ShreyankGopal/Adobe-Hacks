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

# Sentence Transformers for embeddings + util.cos_sim for mmr
from sentence_transformers import SentenceTransformer, util

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

model = None
embedder = None

def load_model():
    global model, embedder
    model_path = "heading_classifier_with_font_count_norm_textNorm_5.pkl"
    if not Path(model_path).exists():
        logger.error(f"Model file {model_path} not found!")
    else:
        model = joblib.load(model_path)
        logger.info("Heading classifier model loaded successfully")

    # Load the multilingual MiniLM model from local cache
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
        logger.error(f"Failed to load SentenceTransformer: {e}")
        embedder = None


# ---------------- PDF extraction utilities (same as before) ----------------
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

def extract_features(text, pdf_path, page_num, font_size, is_bold, is_italic, position_y, y_gap):
    text_length = len(text)
    upper_count = sum(1 for c in text if c.isupper())
    total_alpha = sum(1 for c in text if c.isalpha())
    capitalization_ratio = upper_count / total_alpha if total_alpha > 0 else 0
    starts_with_numbering = bool(re.match(r'^\d+(\.\d+)*(\.|\))\s', text))
    dot_match = re.match(r'^(\d+\.)+(\d+)', text)
    num_dots_in_prefix = dot_match.group(1).count('.') if dot_match else 0

    return {
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

def analyze_pdf_sections(pdf_path):
    sections_data = []
    try:
        doc = fitz.open(pdf_path)
        for page_num in range(doc.page_count):
            page = doc.load_page(page_num)
            blocks = page.get_text("dict")['blocks']

            prev_line_y = None
            prev_font_size = None
            prev_bold = None
            prev_italic = None
            current_lines = []
            prev_y_gap = None

            for block in blocks:
                if block['type'] != 0:
                    continue

                for line in block['lines']:
                    spans = [s for s in line['spans'] if s['text'].strip()]
                    if not spans:
                        continue

                    line_text = " ".join(span['text'].strip() for span in spans)
                    if should_ignore_text(line_text):
                        continue
                    cleaned_text = clean_text(line_text)
                    if not cleaned_text or should_ignore_text(cleaned_text):
                        continue

                    first_span = spans[0]
                    font_size = first_span['size']
                    font_flags = first_span['flags']
                    is_bold = (font_flags & 16) > 0
                    is_italic = (font_flags & 2) > 0
                    y_position = first_span['bbox'][1]

                    if prev_line_y is None:
                        y_gap = None
                    else:
                        y_gap = abs(y_position - prev_line_y)
                    prev_line_y = y_position

                    same_style = (
                        prev_font_size is not None and
                        abs(prev_font_size - font_size) < 0.5 and
                        is_bold == prev_bold and
                        is_italic == prev_italic
                    )

                    if same_style:
                        current_lines.append(cleaned_text)
                    else:
                        if current_lines:
                            full_text = " ".join(current_lines)
                            if not should_ignore_text(full_text) and len(full_text.strip()) > 2:
                                feat = extract_features(
                                    full_text, pdf_path, page_num + 1,
                                    prev_font_size, prev_bold, prev_italic, prev_line_y, prev_y_gap
                                )
                                sections_data.append(feat)

                        current_lines = [cleaned_text]
                        prev_font_size = font_size
                        prev_bold = is_bold
                        prev_italic = is_italic
                        prev_y_gap = y_gap

            if current_lines:
                full_text = " ".join(current_lines)
                if not should_ignore_text(full_text) and len(full_text.strip()) > 2:
                    feat = extract_features(
                        full_text, pdf_path, page_num + 1,
                        prev_font_size, prev_bold, prev_italic, prev_line_y, prev_y_gap
                    )
                    sections_data.append(feat)

        doc.close()
    except Exception as e:
        logger.error(f"Error processing {pdf_path}: {str(e)}")
    return pd.DataFrame(sections_data)

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
# MMR logic (from Extract_Section)
# -------------------------
def mmr(query_emb, sections, lambda_param=0.72, top_k=5):
    if not sections:
        return [], []

    selected, remaining = [], list(range(len(sections)))
    sim_q = [util.cos_sim(query_emb, s['embedding']).item() for s in sections]
    sim_doc = [[util.cos_sim(sections[i]['embedding'], sections[j]['embedding']).item() for j in range(len(sections))] for i in range(len(sections))]

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