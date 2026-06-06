/**
 * Testes para AnamneseFirstConsultation
 *
 * Executar: npm test -- AnamneseFirstConsultation.test.tsx
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnamneseFirstConsultation, AnamneseFirstConsultationData } from '../AnamneseFirstConsultation';
import toast from 'react-hot-toast';

// Mock toast
jest.mock('react-hot-toast');

// Mock useModal hook
jest.mock('@/components/ui', () => ({
  ...jest.requireActual('@/components/ui'),
  useModal: () => ({
    open: true,
    onOpenChange: jest.fn(),
  }),
}));

describe('AnamneseFirstConsultation', () => {
  const mockOnSave = jest.fn();
  const defaultProps = {
    patientId: 123,
    patientName: 'João Silva',
    onSave: mockOnSave,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('deve renderizar o componente', () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      expect(screen.getByText(/Preencher Anamnese/i)).toBeInTheDocument();
    });

    it('deve mostrar o nome do paciente no modal', () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);
      expect(screen.getByText(new RegExp(defaultProps.patientName))).toBeInTheDocument();
    });

    it('deve renderizar 5 abas', () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      expect(screen.getByText(/Queixa Principal/i)).toBeInTheDocument();
      expect(screen.getByText(/Histórico/i)).toBeInTheDocument();
      expect(screen.getByText(/Hábitos e Risco/i)).toBeInTheDocument();
      expect(screen.getByText(/Exame Físico/i)).toBeInTheDocument();
      expect(screen.getByText(/Resumo/i)).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('deve mudar de aba ao clicar', () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const historicoTab = screen.getByText(/Histórico/i);
      fireEvent.click(historicoTab);

      expect(screen.getByPlaceholderText(/Quedas, acidentes/i)).toBeInTheDocument();
    });
  });

  describe('Queixa Principal Tab', () => {
    it('deve validar queixa principal obrigatória', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const saveButton = screen.getByText(/Salvar Anamnese/i);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Preencha ao menos a queixa principal');
      });
    });

    it('deve preencer queixa principal', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro direito');

      expect(textarea).toHaveValue('Dor no ombro direito');
    });

    it('deve selecionar localização da dor', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const ombroButton = screen.getByRole('button', { name: /Ombro/ });
      fireEvent.click(ombroButton);

      expect(ombroButton).toHaveClass('border-brand-500');
    });

    it('deve selecionar intensidade de dor', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const painButton = screen.getByText('7');
      fireEvent.click(painButton);

      expect(painButton).toHaveClass('ring-2');
    });
  });

  describe('Form Submission', () => {
    it('deve chamar onSave com dados completos', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      // Preencher queixa principal
      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro');

      // Selecionar localização
      const ombroButton = screen.getByRole('button', { name: /Ombro/ });
      fireEvent.click(ombroButton);

      // Salvar
      const saveButton = screen.getByText(/Salvar Anamnese/i);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Anamnese salva com sucesso!');
      });
    });

    it('deve incluir template_type na submissão', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro');

      const saveButton = screen.getByText(/Salvar Anamnese/i);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
        const callArgs = mockOnSave.mock.calls[0][0];
        expect(callArgs.template_type).toBe('first_consultation');
      });
    });
  });

  describe('Hábitos Tab', () => {
    it('deve selecionar nível de sedentarismo', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const habitosTab = screen.getByText(/Hábitos e Risco/i);
      fireEvent.click(habitosTab);

      const slider = screen.getByRole('slider') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '8' } });

      expect(slider.value).toBe('8');
    });

    it('deve selecionar consumo de álcool', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const habitosTab = screen.getByText(/Hábitos e Risco/i);
      fireEvent.click(habitosTab);

      const ocasionalButton = screen.getByRole('button', { name: /Ocasional/ });
      fireEvent.click(ocasionalButton);

      expect(ocasionalButton).toHaveClass('border-brand-500');
    });
  });

  describe('Progress Bar', () => {
    it('deve calcular e exibir percentual de preenchimento', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro');

      // Deveria atualizar o percentual
      await waitFor(() => {
        const progressText = screen.getByText(/%/);
        expect(progressText).toBeInTheDocument();
      });
    });
  });

  describe('Summary Tab', () => {
    it('deve mostrar cards de resumo após preenchimento', async () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro direito há 2 semanas');

      const summaryTab = screen.getByText(/Resumo/i);
      fireEvent.click(summaryTab);

      expect(screen.getByText(/Queixa Principal/i)).toBeInTheDocument();
    });
  });

  describe('Dark Mode', () => {
    it('deve conter classes de dark mode', () => {
      render(<AnamneseFirstConsultation {...defaultProps} />);
      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const modal = screen.getByText(/Queixa Principal/i).closest('div');
      expect(modal).toHaveClass('dark:bg-slate-900');
    });
  });

  describe('Error Handling', () => {
    it('deve mostrar toast de erro se salvar falhar', async () => {
      const mockError = jest.fn().mockRejectedValue(new Error('Save failed'));
      render(<AnamneseFirstConsultation {...defaultProps} onSave={mockError} />);

      const button = screen.getByText(/Preencher Anamnese/i);
      fireEvent.click(button);

      const textarea = screen.getByPlaceholderText(/Descreva o principal motivo/i);
      await userEvent.type(textarea, 'Dor no ombro');

      const saveButton = screen.getByText(/Salvar Anamnese/i);
      fireEvent.click(saveButton);

      // Aguardar processamento de erro
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});
