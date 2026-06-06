"""
Gerador de PDF para receitas médicas conforme CFM 2.299/21
Usa reportlab para construção do PDF com elementos gráficos
"""
from io import BytesIO
from datetime import datetime
from typing import Optional, List, Dict, Any
import hashlib
import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
)
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT


class PrescriptionPDFGenerator:
    """Gerador de PDF para receitas médicas digitais"""

    def __init__(self, clinic_logo_path: Optional[str] = None):
        self.clinic_logo_path = clinic_logo_path
        self.page_width, self.page_height = A4

    def generate(
        self,
        prescription_id: int,
        patient_data: Dict[str, Any],
        doctor_data: Dict[str, Any],
        clinic_data: Dict[str, Any],
        medicines: List[Dict[str, Any]],
        qr_code_url: str,
        issued_at: datetime,
        notes: Optional[str] = None,
        instructions: Optional[str] = None,
    ) -> bytes:
        """
        Gera PDF da receita médica

        Args:
            prescription_id: ID da receita
            patient_data: {name, cpf, rg, birth_date, age, phone, email}
            doctor_data: {name, crm, rqe, specialty, phone, email}
            clinic_data: {name, address, phone, cnpj, logo_url}
            medicines: [{name, dose, unit, frequency, route, quantity, notes}]
            qr_code_url: URL para validação (ex: /api/prescription/validate/{id})
            issued_at: Data/hora de emissão
            notes: Observações gerais
            instructions: Instruções especiais

        Returns:
            bytes do PDF
        """
        buffer = BytesIO()
        story = []
        styles = getSampleStyleSheet()

        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=14,
            textColor=colors.HexColor('#1a3a52'),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )

        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=11,
            textColor=colors.HexColor('#2d5a7b'),
            spaceAfter=4,
            spaceBefore=8,
            fontName='Helvetica-Bold',
            borderPadding=4,
            borderColor=colors.HexColor('#d0d0d0'),
            borderWidth=0.5,
            borderRadius=2,
        )

        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=9,
            leading=12,
            textColor=colors.black,
        )

        small_style = ParagraphStyle(
            'CustomSmall',
            parent=styles['Normal'],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor('#666666'),
        )

        # ========== HEADER ==========
        header_data = []

        # Clínica + Logo
        clinic_info = f"<b>{clinic_data.get('name', 'Clínica')}</b><br/>"
        clinic_info += f"CNPJ: {clinic_data.get('cnpj', 'N/A')}<br/>"
        clinic_info += f"Endereço: {clinic_data.get('address', 'N/A')}<br/>"
        clinic_info += f"Tel: {clinic_data.get('phone', 'N/A')}"

        if self.clinic_logo_path:
            try:
                logo = Image(self.clinic_logo_path, width=3*cm, height=2*cm)
                header_data.append([logo, Paragraph(clinic_info, small_style)])
            except Exception:
                header_data.append([Paragraph("", small_style), Paragraph(clinic_info, small_style)])
        else:
            header_data.append([Paragraph("", small_style), Paragraph(clinic_info, small_style)])

        header_table = Table(header_data, colWidths=[3*cm, 15*cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 0.5*cm))

        # ========== TÍTULO ==========
        story.append(Paragraph("RECEITA MÉDICA DIGITAL", title_style))
        story.append(Paragraph(f"Nº {prescription_id}", ParagraphStyle(
            'DocNumber', parent=styles['Normal'], fontSize=10, alignment=TA_CENTER
        )))
        story.append(Spacer(1, 0.3*cm))

        # ========== DADOS DO MÉDICO ==========
        story.append(Paragraph("PRESCRITOR", heading_style))
        doctor_info = f"""
        <b>{doctor_data.get('name', 'N/A')}</b><br/>
        CRM: {doctor_data.get('crm', 'N/A')} | RQE: {doctor_data.get('rqe', 'N/A')}<br/>
        Especialidade: {doctor_data.get('specialty', 'N/A')}<br/>
        Tel: {doctor_data.get('phone', 'N/A')} | Email: {doctor_data.get('email', 'N/A')}
        """
        story.append(Paragraph(doctor_info.strip(), small_style))
        story.append(Spacer(1, 0.3*cm))

        # ========== DADOS DO PACIENTE ==========
        story.append(Paragraph("PACIENTE", heading_style))
        patient_info = f"""
        <b>{patient_data.get('name', 'N/A')}</b><br/>
        CPF: {patient_data.get('cpf', 'N/A')} | RG: {patient_data.get('rg', 'N/A')}<br/>
        Data de Nascimento: {patient_data.get('birth_date', 'N/A')} (Idade: {patient_data.get('age', 'N/A')})<br/>
        Tel: {patient_data.get('phone', 'N/A')} | Email: {patient_data.get('email', 'N/A')}
        """
        story.append(Paragraph(patient_info.strip(), small_style))
        story.append(Spacer(1, 0.3*cm))

        # ========== DATA/HORA EMISSÃO ==========
        story.append(Paragraph("EMISSÃO", heading_style))
        issued_at_str = issued_at.strftime("%d/%m/%Y às %H:%M:%S")
        story.append(Paragraph(f"<b>{issued_at_str}</b> (Data/hora imutável após assinatura)", small_style))
        story.append(Spacer(1, 0.3*cm))

        # ========== MEDICAMENTOS ==========
        story.append(Paragraph("PRESCRIÇÃO", heading_style))

        if medicines:
            medicine_data = [["Medicamento", "Dose", "Posologia", "Via", "Qtd.", "Observações"]]

            for med in medicines:
                dose_str = f"{med.get('dose', '')} {med.get('unit', '')}"
                medicine_data.append([
                    med.get('name', ''),
                    dose_str,
                    med.get('frequency', ''),
                    med.get('route', ''),
                    str(med.get('quantity', '')),
                    med.get('notes', '') or '',
                ])

            med_table = Table(medicine_data, colWidths=[4*cm, 2*cm, 2.5*cm, 2*cm, 1*cm, 2.5*cm])
            med_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2d5a7b')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 1), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
            ]))
            story.append(med_table)
        else:
            story.append(Paragraph("<i>Nenhum medicamento prescrito</i>", small_style))

        story.append(Spacer(1, 0.3*cm))

        # ========== INSTRUÇÕES ==========
        if instructions:
            story.append(Paragraph("INSTRUÇÕES ESPECIAIS", heading_style))
            story.append(Paragraph(instructions, small_style))
            story.append(Spacer(1, 0.3*cm))

        # ========== OBSERVAÇÕES ==========
        if notes:
            story.append(Paragraph("OBSERVAÇÕES", heading_style))
            story.append(Paragraph(notes, small_style))
            story.append(Spacer(1, 0.3*cm))

        # ========== QR CODE ==========
        story.append(Spacer(1, 0.3*cm))
        qr_code_img = self._generate_qr_code(qr_code_url)
        qr_table = Table([[qr_code_img]], colWidths=[2*cm])
        qr_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(qr_table)
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(
            f"Código de validação: <b>{qr_code_url.split('/')[-1]}</b>",
            ParagraphStyle('QRCode', parent=small_style, alignment=TA_CENTER)
        ))

        # ========== FOOTER ==========
        story.append(Spacer(1, 0.8*cm))
        footer_text = """
        <b>Receita Digital - Documento assinado eletronicamente conforme Lei nº 14.065/2020</b><br/>
        Validade: 30 dias a partir da emissão | Uso exclusivo da farmácia parceira
        """
        story.append(Paragraph(footer_text, ParagraphStyle(
            'Footer', parent=small_style, alignment=TA_CENTER,
            textColor=colors.HexColor('#666666')
        )))

        # ========== BUILD PDF ==========
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1*cm,
            leftMargin=1*cm,
            topMargin=1*cm,
            bottomMargin=1*cm,
        )
        doc.build(story)

        pdf_bytes = buffer.getvalue()
        buffer.close()

        return pdf_bytes

    def _generate_qr_code(self, url: str, box_size: int = 4) -> Image:
        """Gera QR code como imagem"""
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=box_size,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Converte PIL image para bytes
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)

        return Image(buffer, width=2*cm, height=2*cm)


def compute_pdf_checksum(pdf_bytes: bytes) -> str:
    """Calcula SHA256 do PDF para validação"""
    return hashlib.sha256(pdf_bytes).hexdigest()
