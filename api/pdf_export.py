import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from api.schemas import SOAPNote


def soap_to_pdf(note: SOAPNote, created_at: str | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=inch, rightMargin=inch,
        topMargin=inch, bottomMargin=inch,
    )
    styles = getSampleStyleSheet()
    heading = ParagraphStyle("heading", parent=styles["Heading2"], spaceAfter=4, spaceBefore=10)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=6)
    label = ParagraphStyle("label", parent=styles["Normal"], fontSize=8, textColor=colors.grey)

    try:
        date_str = datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime("%B %d, %Y") if created_at else datetime.utcnow().strftime("%B %d, %Y")
    except (ValueError, AttributeError):
        date_str = datetime.utcnow().strftime("%B %d, %Y")

    story = [
        Paragraph("SOAP NOTE", styles["Title"]),
        Paragraph(f"Generated: {date_str}", label),
        Spacer(1, 0.2 * inch),
        Paragraph("Chief Complaint", heading),
        Paragraph(note.chief_complaint or "—", body),
        Paragraph("Subjective", heading),
        Paragraph(note.subjective or "—", body),
        Paragraph("Objective", heading),
        Paragraph(note.objective or "—", body),
        Paragraph("Assessment", heading),
    ]

    for dx in note.assessment:
        code = f" ({dx.icd10_code})" if dx.icd10_code else ""
        story.append(Paragraph(
            f"&bull; {dx.description}{code} <font color='grey'>[{dx.status}]</font>", body
        ))

    story += [
        Paragraph("Plan", heading),
        Paragraph(note.plan or "—", body),
        Paragraph("Medications Prescribed", heading),
    ]

    if note.medications_prescribed:
        med_data = [["Medication", "Dose", "Route", "Frequency"]]
        for m in note.medications_prescribed:
            med_data.append([m.name, m.dose, m.route, m.frequency])
        t = Table(med_data, colWidths=[2 * inch, 1.2 * inch, 0.8 * inch, 2 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f4f8")),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7de")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("None documented.", body))

    if note.follow_up:
        story += [Paragraph("Follow-up", heading), Paragraph(note.follow_up, body)]

    if note.flags_for_review:
        story.append(Paragraph("Flags for Review", heading))
        for f in note.flags_for_review:
            story.append(Paragraph(f"&#9888; {f}", body))

    doc.build(story)
    return buf.getvalue()
