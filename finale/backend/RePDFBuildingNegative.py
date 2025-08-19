# RePDFBuilding.py
import fitz
import os
from collections import defaultdict
from datetime import datetime

def highlight_refined_texts_negative(output):
    """
    Create annotated copies of PDFs with highlights for the selected sections.
    - For each document in output['extracted_sections'], we create a copy of the original PDF
      (uploads/annotated_<timestamp>_<origfile>) and add highlight annotations per rect.
    - We DO NOT modify the original PDF.
    - Returns a mapping: { "original_filename.pdf": "annotated_<ts>_original_filename.pdf", ... }
    """
    print("[RePDFBuilding] Starting highlight -> annotated-copy process")
    files = defaultdict(list)

    for sec in output.get("extracted_sections", []):
        fname = sec.get('document')
        if not fname:
            continue
        files[fname].append(sec)

    annotated_map = {}  # original_filename -> annotated_filename

    for fname, sections in files.items():
        src_path = os.path.join("uploads", fname)
        if not os.path.exists(src_path):
            print(f"[RePDFBuilding] Skipping missing file: {src_path}")
            continue

        try:
            src_doc = fitz.open(src_path)
        except Exception as e:
            print(f"[RePDFBuilding] Failed to open {src_path}: {e}")
            continue

        # create a copy document in memory by inserting pages into a new doc
        new_doc = fitz.open()
        new_doc.insert_pdf(src_doc)  # duplicate all pages

        modified = False

        for sec in sections:
            rects = sec.get('rects', []) or []
            page_hint = sec.get('page_number', None)

            if rects:
                for r in rects:
                    try:
                        # dict rect with page & bbox expected
                        if isinstance(r, dict) and 'page' in r and 'bbox' in r:
                            pnum = int(r['page'])
                            bbox = r['bbox']
                            if pnum < 1 or pnum > len(new_doc):
                                continue
                            page = new_doc[pnum - 1]
                            if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
                                continue
                            rect = fitz.Rect(float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
                            try:
                                annot = page.add_highlight_annot(rect)
                                if annot:
                                    annot.set_colors(stroke=(1, 0.6, 0.6), fill=(1, 0.6, 0.6))  # light red
                                    annot.update()
                                    modified = True
                            except Exception as e:
                                print(f"[RePDFBuilding] Annot failure {fname}:{pnum} -> {e}")
                                continue
                        else:
                            # legacy: list rect + page_hint
                            if isinstance(r, (list, tuple)) and len(r) == 4 and page_hint:
                                pnum = int(page_hint)
                                if pnum >= 1 and pnum <= len(new_doc):
                                    page = new_doc[pnum - 1]
                                    rect = fitz.Rect(float(r[0]), float(r[1]), float(r[2]), float(r[3]))
                                    try:
                                        annot = page.add_highlight_annot(rect)
                                        if annot:
                                            annot.update()
                                            modified = True
                                    except Exception as e:
                                        print(f"[RePDFBuilding] Legacy annot error {fname}:{pnum} -> {e}")
                                        continue
                    except Exception as e:
                        print(f"[RePDFBuilding] Unexpected error processing rect {r} for {fname}: {e}")
                        continue
            else:
                # if no rects present, skip (we intentionally avoid fuzzy string matching)
                print(f"[RePDFBuilding] No rects for section '{sec.get('section_title')}' in {fname}; skipping.")

        if modified:
            ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
            annotated_name = f"annotatedNeg_{ts}_{fname}"
            annotated_path = os.path.join("uploads", annotated_name)
            try:
                # save annotated copy (do not overwrite original)
                new_doc.save(annotated_path)
                annotated_map[fname] = annotated_name
                print(f"[RePDFBuilding] Saved annotated copy: {annotated_path}")
            except Exception as e:
                print(f"[RePDFBuilding] Failed to save annotated copy for {fname}: {e}")
        else:
            print(f"[RePDFBuilding] No modifications for {fname}; no annotated file created.")

        new_doc.close()
        src_doc.close()

    print("[RePDFBuilding] Finished highlighting. Annotated map:", annotated_map)
    return annotated_map
