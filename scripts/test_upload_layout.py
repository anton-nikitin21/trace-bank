"""Browser regression for the OCR checkbox hiding uploaded files below the viewport.
Requires a running preview at TRACE_URL (default 127.0.0.1:8766) and Playwright.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
report = Path(os.environ.get('TRACE_REPORT_DIR', root/'browser-report'))
report.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('TRACE_URL','http://127.0.0.1:8766')+'/demo.html')
    page.locator('#tutorialExample').click()
    for width in [360,390,768,1440,2594]:
        page.set_viewport_size({'width':width,'height':1000})
        label = page.locator('.ocr-option').bounding_box()
        checkbox = page.locator('#forcePDFScan').bounding_box()
        assert label['height'] < 160, (width,label)
        assert checkbox['width'] == 18, (width,checkbox)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#documentFiles').set_input_files(str(root/'test-files/Trace-test-UPD.pdf'))
    page.wait_for_function("!document.querySelector('#uploadFiles').disabled",timeout=60000)
    card = page.locator('.recognition-card').filter(has_text='Trace-test-UPD.pdf')
    assert 'УПД-41' in card.inner_text()
    assert '470' in card.inner_text()
    page.wait_for_function("document.querySelector('#recognitionList').getBoundingClientRect().top < 200 && document.querySelector('#recognitionList').getBoundingClientRect().bottom > 0")
    assert page.locator('#recognitionList').bounding_box()['y'] - page.locator('.ocr-option').bounding_box()['y'] < 300
    page.screenshot(path=str(report/'uploaded-pdf-desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    card.scroll_into_view_if_needed()
    page.screenshot(path=str(report/'uploaded-pdf-mobile.png'))
    # Unsupported formats show an error, rather than silently disappearing.
    page.locator('#documentFiles').set_input_files({'name':'unsupported.docx','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':b'unsupported'})
    page.wait_for_function("!document.querySelector('#uploadFiles').disabled")
    assert 'Поддерживаются PDF' in page.locator('#uploadState').inner_text()
    assert 'Не удалось прочитать' in page.locator('.recognition-card').filter(has_text='unsupported.docx').inner_text()
    assert errors == [], errors
    browser.close()
print('PASS: real PDF upload, visible extracted fields, bounded OCR label at five widths, unsupported-file error')
