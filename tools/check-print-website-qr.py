"""Independent rendered-output QA for synthetic TradeFlow print documents."""
import base64
import io
import sys
from pathlib import Path

import pypdfium2 as pdfium
import zxingcpp
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

folder = Path(sys.argv[1])
expected = "https://zolaelectronicszone.com/"
previews = []
page_count = 0
for file in sorted(folder.glob("*.pdf")):
    document = pdfium.PdfDocument(file)
    text = PdfReader(file)
    for index, page in enumerate(document):
        # HTML headers appear once per document; the PDF engine repeats on every page.
        if file.name.startswith("browser-") and index:
            continue
        rendered = page.render(scale=2.5).to_pil().convert("RGB")
        codes = zxingcpp.read_barcodes(rendered)
        assert any(code.text == expected for code in codes), (file.name, index, "QR decode failed")
        assert "zolaelectronicszone.com" in text.pages[index].extract_text(), (file.name, index, "URL missing")
        code = next(code for code in codes if code.text == expected)
        assert code.position.top_right.x > rendered.width * 0.70, (file.name, index, "QR is not on the right")
        assert code.position.top_right.y < rendered.height * 0.25, (file.name, index, "QR is not at the top")
        if not index:
            crop = rendered.crop((0, 0, rendered.width, min(rendered.height, 520)))
            crop.thumbnail((350, 280))
            previews.append((file.stem, crop.copy()))
        page_count += 1
    document.close()
assert len(previews) >= 18, (len(previews), "Missing document coverage")
for group in range(0, len(previews), 8):
    batch = previews[group:group + 8]
    sheet = Image.new("RGB", (720, 4 * 310), "#dbe1e8")
    draw = ImageDraw.Draw(sheet)
    for index, (name, preview) in enumerate(batch):
        x, y = (index % 2) * 360, (index // 2) * 310
        draw.text((x + 8, y + 5), name, fill="black")
        sheet.paste(preview, (x + 5, y + 25))
    target = folder / ("contact-" + str(group // 8) + ".png")
    sheet.save(target, optimize=True)
    print("PRINT_QR_CONTACT_" + str(group // 8) + "=" + base64.b64encode(target.read_bytes()).decode())
print(f"PRINT_QR_RENDER_PASS documents={len(previews)} pages={page_count} target={expected}")
