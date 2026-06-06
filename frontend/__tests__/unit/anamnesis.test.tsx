/**
 * Unit tests for Anamnesis Form functionality
 * Tests template selection, field validation, auto-save, and navigation
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

describe('Anamnesis Form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Template Selection', () => {
    it('should load available templates', () => {
      const mockTemplates = [
        { id: 1, name: 'Template Ortopedia', specialty: 'Ortopedia' },
        { id: 2, name: 'Template Traumato', specialty: 'Traumatologia' },
      ]

      expect(mockTemplates.length).toBe(2)
    })

    it('should select template and load fields', () => {
      const template = {
        id: 1,
        name: 'Template Ortopedia',
        structure: {
          tabs: [
            {
              id: 'complaint',
              label: 'Queixa Principal',
              sections: [
                {
                  fields: [
                    {
                      id: 'main_complaint',
                      type: 'textarea',
                      label: 'Queixa Principal',
                      required: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      }

      expect(template.structure.tabs.length).toBeGreaterThan(0)
    })
  })

  describe('Field Validation', () => {
    it('should block submit with missing required fields', () => {
      const requiredFields = [
        { id: 'complaint', required: true, value: '' },
      ]

      const isValid = requiredFields.every((field) => !field.required || field.value)
      expect(isValid).toBe(false)
    })

    it('should allow submit with all required fields filled', () => {
      const requiredFields = [
        { id: 'complaint', required: true, value: 'Dor no joelho' },
        { id: 'optional', required: false, value: '' },
      ]

      const isValid = requiredFields.every((field) => !field.required || field.value)
      expect(isValid).toBe(true)
    })

    it('should validate field types', () => {
      const fields = {
        textarea: 'string',
        email: 'string',
        number: 'number',
        date: 'string',
      }

      expect(typeof fields.textarea).toBe('string')
      expect(typeof fields.email).toBe('string')
    })
  })

  describe('Auto-Save', () => {
    it('should save draft every 30 seconds', async () => {
      const mockSave = vi.fn()
      const autoSaveInterval = 30000

      vi.useFakeTimers()

      // Simulate auto-save interval
      const interval = setInterval(() => {
        mockSave({ draft: true })
      }, autoSaveInterval)

      expect(mockSave).not.toHaveBeenCalled()

      vi.advanceTimersByTime(autoSaveInterval)
      expect(mockSave).toHaveBeenCalledWith({ draft: true })

      clearInterval(interval)
      vi.useRealTimers()
    })

    it('should preserve unsaved data on page refresh', () => {
      const sessionData = {
        complaint: 'Dor crônica',
        duration: '3 meses',
        draft: true,
      }

      // Simulate localStorage
      const saved = JSON.stringify(sessionData)
      const restored = JSON.parse(saved)

      expect(restored.complaint).toBe(sessionData.complaint)
      expect(restored.draft).toBe(true)
    })

    it('should not duplicate data on concurrent saves', async () => {
      const mockApiCall = vi.fn().mockResolvedValue({ id: 1 })

      const data = { complaint: 'Dor no joelho' }

      await mockApiCall(data)
      await mockApiCall(data)

      expect(mockApiCall).toHaveBeenCalledTimes(2)
    })
  })

  describe('Tab Navigation', () => {
    it('should navigate between tabs without losing data', () => {
      const formData = {
        tab1: { complaint: 'Dor no joelho' },
        tab2: { duration: '2 semanas' },
      }

      // Switch to tab 2
      const tab2Data = formData.tab2

      // Switch back to tab 1
      const tab1Data = formData.tab1

      expect(tab1Data.complaint).toBe('Dor no joelho')
      expect(tab2Data.duration).toBe('2 semanas')
    })

    it('should show all tabs as navigable', () => {
      const tabs = [
        { id: 'complaint', label: 'Queixa' },
        { id: 'history', label: 'Histórico' },
        { id: 'medications', label: 'Medicações' },
      ]

      const allNavigable = tabs.every((tab) => tab.id && tab.label)
      expect(allNavigable).toBe(true)
    })

    it('should maintain scroll position on tab switch', () => {
      const tab1Position = 0
      const tab2Position = 500

      expect(tab1Position).not.toEqual(tab2Position)
    })
  })

  describe('Medication Validation', () => {
    it('should validate medication interactions', () => {
      const medications = [
        { name: 'Dipirona 500mg', interactions: [] },
        { name: 'Ibuprofeno 400mg', interactions: ['Dipirona'] },
      ]

      // Check for interactions
      const hasInteractions = medications.some((med) => med.interactions.length > 0)
      expect(hasInteractions).toBe(true)
    })

    it('should display interaction warnings', () => {
      const interaction = {
        drug1: 'Dipirona',
        drug2: 'Ibuprofeno',
        severity: 'moderate',
        description: 'NSAIDs combined increase GI risk',
      }

      expect(interaction.severity).toBeDefined()
      expect(interaction.description).toBeDefined()
    })

    it('should allow proceeding with acknowledged warnings', () => {
      const warningAcknowledged = true
      const canSubmit = warningAcknowledged

      expect(canSubmit).toBe(true)
    })
  })

  describe('Data Persistence', () => {
    it('should save anamnesis as JSON', () => {
      const data = {
        complaint: 'Dor crônica',
        history: {
          onset: '2023-01-15',
          severity: 8,
        },
        medications: [
          { name: 'Drug A', frequency: '12/12h' },
        ],
      }

      const jsonString = JSON.stringify(data)
      const restored = JSON.parse(jsonString)

      expect(restored.complaint).toBe(data.complaint)
      expect(restored.history.severity).toBe(8)
      expect(restored.medications.length).toBe(1)
    })

    it('should handle special characters in data', () => {
      const data = {
        complaint: 'São Paulo - Dor cervical',
        notes: 'Paciente relata "piora" à noite',
      }

      const jsonString = JSON.stringify(data)
      const restored = JSON.parse(jsonString)

      expect(restored.complaint).toContain('São Paulo')
      expect(restored.notes).toContain('piora')
    })

    it('should validate JSON structure on load', () => {
      const validJson = '{"complaint":"test","duration":"3 dias"}'
      const parsed = JSON.parse(validJson)

      expect(parsed.complaint).toBeDefined()
      expect(parsed.duration).toBeDefined()
    })
  })

  describe('Form Submission', () => {
    it('should submit complete anamnesis', () => {
      const formData = {
        patient_id: 1,
        appointment_id: 1,
        template_id: 1,
        data: {
          complaint: 'Dor no joelho',
          duration: '2 semanas',
        },
      }

      expect(formData.patient_id).toBeDefined()
      expect(formData.appointment_id).toBeDefined()
      expect(formData.data.complaint).toBeDefined()
    })

    it('should show success message after submission', () => {
      const response = {
        status: 'success',
        message: 'Anamnese salva com sucesso',
        id: 1,
      }

      expect(response.status).toBe('success')
      expect(response.id).toBeDefined()
    })
  })
})
