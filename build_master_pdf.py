import os
import sys
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Define Palette
COLOR_PRIMARY = colors.HexColor('#0F172A')    # Slate 900 (Dark Navy)
COLOR_SECONDARY = colors.HexColor('#2563EB')  # Royal Blue
COLOR_ACCENT = colors.HexColor('#0D9488')     # Teal
COLOR_TEXT = colors.HexColor('#334155')       # Slate 700
COLOR_MUTED = colors.HexColor('#64748B')      # Slate 500
COLOR_BG_LIGHT = colors.HexColor('#F8FAFC')   # Slate 50
COLOR_BORDER = colors.HexColor('#E2E8F0')     # Slate 200
COLOR_SUCCESS = colors.HexColor('#059669')    # Emerald 600

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress running header/footer on cover page

        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(COLOR_MUTED)

        # Header
        self.drawString(54, 800, "AI Seller Management Platform — Complete Project Documentation & Technical Blueprint")
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(54, 792, 558, 792)

        # Footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, page_str)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY — PREPARED FOR CLIENT PRESENTATION")
        self.line(54, 48, 558, 48)

        self.restoreState()

print("NumberedCanvas helper initialized.")
