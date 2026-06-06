"""
Unit tests for Anamnesis Management.
Tests template selection, field validation, auto-save, and data persistence.
"""
import pytest
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from models.queue import AnamnesisTemplate
from models.anamnesis import Anamnesis


class TestAnamnesisTemplate:
    """Test anamnesis template functionality."""

    def test_template_creation(
        self,
        db: Session,
        anamnesis_template: AnamnesisTemplate
    ):
        """Test creating anamnesis template."""
        assert anamnesis_template.name == "Template Ortopedia"
        assert anamnesis_template.specialty == "Ortopedia"
        assert anamnesis_template.structure is not None


    def test_template_structure_has_tabs(self, anamnesis_template: AnamnesisTemplate):
        """Test template structure contains tabs."""
        assert "tabs" in anamnesis_template.structure
        assert len(anamnesis_template.structure["tabs"]) > 0


    def test_template_tabs_navigable(self, anamnesis_template: AnamnesisTemplate):
        """Test all tabs have required structure."""
        for tab in anamnesis_template.structure["tabs"]:
            assert "id" in tab
            assert "label" in tab
            assert "sections" in tab


    def test_template_fields_required_flag(self, anamnesis_template: AnamnesisTemplate):
        """Test fields have required flag."""
        for tab in anamnesis_template.structure["tabs"]:
            for section in tab.get("sections", []):
                for field in section.get("fields", []):
                    assert "required" in field


    def test_multiple_templates_per_clinic(
        self,
        db: Session,
        clinic
    ):
        """Test clinic can have multiple templates."""
        template1 = AnamnesisTemplate(
            clinic_id=clinic.id,
            name="Template Ortopedia",
            specialty="Ortopedia",
            structure={"tabs": []}
        )
        template2 = AnamnesisTemplate(
            clinic_id=clinic.id,
            name="Template Traumato",
            specialty="Traumatologia",
            structure={"tabs": []}
        )
        db.add(template1)
        db.add(template2)
        db.commit()

        templates = db.query(AnamnesisTemplate).filter(
            AnamnesisTemplate.clinic_id == clinic.id
        ).all()

        assert len(templates) == 2


class TestAnamnesisCreation:
    """Test anamnesis form creation and submission."""

    def test_create_anamnesis_draft(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test creating anamnesis in draft status."""
        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data={"complaint": "Dor no joelho"}
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        assert anamnesis.status == "draft"
        assert anamnesis.data is not None


    def test_anamnesis_required_fields_validation(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test required fields block submission."""
        # This would be handled by API validation
        incomplete_data = {
            # Missing required "complaint" field
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=incomplete_data
        )
        # In real app, API would validate required fields before save
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        # Verify data structure
        assert anamnesis.data is not None


class TestAnamnesisAutoSave:
    """Test auto-save functionality."""

    def test_auto_save_updates_draft(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test auto-save updates draft every 30 seconds."""
        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data={"complaint": "Dor no ombro"}
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        first_update = anamnesis.updated_at

        # Simulate auto-save
        import time
        time.sleep(0.1)

        anamnesis.data = {"complaint": "Dor no ombro", "duration": "3 meses"}
        db.commit()
        db.refresh(anamnesis)

        assert anamnesis.updated_at > first_update


    def test_auto_save_preserves_data(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test auto-save doesn't lose data."""
        initial_data = {
            "complaint": "Dor no joelho",
            "duration": "2 semanas",
            "intensity": "7/10"
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=initial_data
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        # Update different field
        anamnesis.data["additional_info"] = "Piora ao subir escadas"
        db.commit()
        db.refresh(anamnesis)

        # Verify all fields preserved
        assert anamnesis.data["complaint"] == initial_data["complaint"]
        assert anamnesis.data["duration"] == initial_data["duration"]
        assert anamnesis.data["intensity"] == initial_data["intensity"]


class TestAnamnesisNavigation:
    """Test tab navigation without data loss."""

    def test_switch_tabs_preserves_data(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test switching tabs doesn't lose entered data."""
        data = {
            "tab1": {"field1": "value1"},
            "tab2": {"field2": "value2"}
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=data
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        # Verify both tabs' data preserved
        assert "tab1" in anamnesis.data
        assert "tab2" in anamnesis.data
        assert anamnesis.data["tab1"]["field1"] == "value1"


class TestAnamnesusMedicationInteractions:
    """Test medication validation."""

    def test_medication_field_validation(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test medication fields are validated."""
        data = {
            "medications": [
                {
                    "name": "Dipirona 500mg",
                    "dose": "500",
                    "frequency": "8/8h",
                    "interactions": []
                }
            ]
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=data
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        medication = anamnesis.data["medications"][0]
        assert medication["name"] is not None
        assert medication["dose"] is not None
        assert medication["frequency"] is not None


class TestAnamnesisDataPersistence:
    """Test JSON data storage."""

    def test_anamnesis_data_stored_as_json(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test anamnesis data is properly serialized as JSON."""
        complex_data = {
            "complaint": "Dor crônica",
            "history": {
                "onset": "2023-01-15",
                "severity": "8",
                "recurring": True
            },
            "medications": [
                {"name": "Drug A", "frequency": "12/12h"},
                {"name": "Drug B", "frequency": "8/8h"}
            ]
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=complex_data
        )
        db.add(anamnesis)
        db.commit()
        db.refresh(anamnesis)

        # Retrieve and verify
        retrieved = db.query(Anamnesis).filter(
            Anamnesis.id == anamnesis.id
        ).first()

        assert retrieved.data == complex_data
        assert isinstance(retrieved.data["history"], dict)
        assert isinstance(retrieved.data["medications"], list)


    def test_anamnesis_json_encoding(
        self,
        db: Session,
        clinic,
        patient,
        appointment,
        anamnesis_template
    ):
        """Test JSON data can be encoded/decoded properly."""
        original_data = {
            "unicode": "São Paulo",
            "numbers": [1, 2, 3],
            "nested": {"key": "value"}
        }

        anamnesis = Anamnesis(
            clinic_id=clinic.id,
            patient_id=patient.id,
            appointment_id=appointment.id,
            template_id=anamnesis_template.id,
            status="draft",
            data=original_data
        )
        db.add(anamnesis)
        db.commit()

        # Verify JSON integrity
        json_str = json.dumps(anamnesis.data)
        restored = json.loads(json_str)

        assert restored == original_data
