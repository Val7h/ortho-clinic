"""
Receitas simples de paciente (prescrições manuais/Memed).
Modelo leve sem dependência de ClickSign ou PDF generator.
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class PatientRx(Base):
    """Receita médica simples vinculada a um paciente."""
    __tablename__ = "patient_prescriptions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)

    date = Column(Date, nullable=False)
    # Tipo: "simples" | "controle_especial" | "antimicrobiano" | "notificacao_ab"
    # Aliases legados mantidos: "especial_azul" → "controle_especial", "especial_amarelo" → descontinuado
    prescription_type = Column(String(30), nullable=False, default="simples")
    medications = Column(JSON, nullable=True)   # lista de {name, dose, route, frequency, duration, instructions}
    instructions = Column(Text, nullable=True)  # orientações gerais
    memed_id = Column(String(100), nullable=True)  # id da receita Memed (se houver)

    # A16-back: dados do paciente exigidos na receita de antimicrobiano
    # (RDC 20/2011) — precisam ficar PERSISTIDOS p/ a reimpressão sair completa.
    # TODO(mantenedor): tabela "patient_prescriptions" já existe em prod; estas
    # 2 colunas só são criadas automaticamente em banco novo (create_all). Rodar
    # ALTER TABLE no banco existente:
    #   ALTER TABLE patient_prescriptions ADD COLUMN patient_address VARCHAR(400);
    #   ALTER TABLE patient_prescriptions ADD COLUMN patient_phone   VARCHAR(20);
    patient_address = Column(String(400), nullable=True)
    patient_phone = Column(String(20), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    patient = relationship("Patient", backref="rx_prescriptions", foreign_keys=[patient_id])
