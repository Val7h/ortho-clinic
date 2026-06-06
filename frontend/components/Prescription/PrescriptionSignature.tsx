'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  Card,
  CardBody,
  Chip,
  Divider,
} from '@nextui-org/react';
import { CheckCircle2, ExternalLink, Download, Share2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Medicine {
  name: string;
  dose: number;
  unit: string;
  frequency: string;
  route: string;
  quantity: number;
  notes?: string;
}

interface PrescriptionData {
  id: number;
  status: string;
  patient: {
    name: string;
    cpf: string;
  };
  doctor: {
    name: string;
    crm: string;
  };
  medicines: Medicine[];
  issued_at?: string;
  signed_at?: string;
  clicksign_sign_url?: string;
}

interface PrescriptionSignatureProps {
  prescriptionId: number;
  onSignatureComplete?: (prescriptionId: number) => void;
}

export function PrescriptionSignature({
  prescriptionId,
  onSignatureComplete,
}: PrescriptionSignatureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prescription, setPrescription] = useState<PrescriptionData | null>(null);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [signed, setSigned] = useState(false);
  const signWindowRef = useRef<Window | null>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load prescription data
  useEffect(() => {
    if (isOpen && prescriptionId) {
      fetchPrescription();
    }
  }, [isOpen, prescriptionId]);

  const fetchPrescription = async () => {
    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}`);
      if (!response.ok) throw new Error('Erro ao carregar receita');
      const data = await response.json();
      setPrescription(data);
    } catch (error) {
      toast.error('Erro ao carregar receita');
      console.error(error);
    }
  };

  const handleRequestSignature = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}/sign`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro ao solicitar assinatura');
      }

      const data = await response.json();
      setSignUrl(data.sign_url);

      // Abrir popup de assinatura
      signWindowRef.current = window.open(
        data.sign_url,
        'clicksign_signature',
        'width=900,height=700,toolbar=no,location=no'
      );

      // Iniciar verificação de status
      startStatusCheck();

      toast.success('Abrindo ClickSign para assinatura...');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao solicitar assinatura');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startStatusCheck = () => {
    // Verificar a cada 5 segundos
    statusCheckIntervalRef.current = setInterval(() => {
      checkSignatureStatus();
    }, 5000);
  };

  const checkSignatureStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}/signature-status`);
      if (!response.ok) throw new Error('Erro ao verificar status');

      const data = await response.json();

      if (data.status === 'signed') {
        setSigned(true);
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        if (signWindowRef.current) {
          signWindowRef.current.close();
        }
        toast.success('Receita assinada com sucesso!');

        // Recarregar dados
        await fetchPrescription();

        // Callback
        if (onSignatureComplete) {
          onSignatureComplete(prescriptionId);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}/pdf`);
      if (!response.ok) throw new Error('Erro ao baixar PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receita_${prescriptionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('PDF baixado com sucesso');
    } catch (error) {
      toast.error('Erro ao baixar PDF');
      console.error(error);
    }
  };

  const handleShareWithPatient = async () => {
    try {
      const whatsappMessage = `
Olá ${prescription?.patient.name},

Sua receita médica foi assinada digitalmente e está pronta para uso na farmácia.

Número da receita: ${prescriptionId}
Médico: ${prescription?.doctor.name}
CRM: ${prescription?.doctor.crm}

Medicamentos prescritos:
${prescription?.medicines.map((m) => `• ${m.name} ${m.dose}${m.unit} - ${m.frequency} (${m.route})`).join('\n')}

Validade: 30 dias a partir da assinatura

Para validar a receita, acesse: https://clinica.com/validar/${prescriptionId}
      `.trim();

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
      window.open(whatsappUrl, '_blank');

      toast.success('WhatsApp aberto');
    } catch (error) {
      toast.error('Erro ao compartilhar');
      console.error(error);
    }
  };

  return (
    <>
      <Button
        isIconOnly
        className="bg-gradient-to-r from-blue-500 to-blue-600 text-white"
        onPress={() => setIsOpen(true)}
        title="Assinar receita"
      >
        ✓
      </Button>

      <Modal isOpen={isOpen} onOpenChange={setIsOpen} size="2xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {signed ? '✅ Receita Assinada' : 'Assinar Receita Médica'}
              </ModalHeader>

              <ModalBody>
                {!signed && prescription && (
                  <div className="space-y-4">
                    {/* Resumo da receita */}
                    <Card className="bg-blue-50">
                      <CardBody className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold">Paciente:</span>
                          <span className="text-sm">{prescription.patient.name}</span>
                        </div>
                        <Divider className="my-1" />
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold">Médico:</span>
                          <span className="text-sm">{prescription.doctor.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold">CRM:</span>
                          <span className="text-sm">{prescription.doctor.crm}</span>
                        </div>
                      </CardBody>
                    </Card>

                    {/* Lista de medicamentos */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Medicamentos Prescritos:</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {prescription.medicines.map((med, idx) => (
                          <Card key={idx} className="bg-gray-50">
                            <CardBody className="space-y-1 py-2 px-3">
                              <p className="font-medium text-sm">{med.name}</p>
                              <div className="text-xs text-gray-600 space-y-1">
                                <p>
                                  Dose: <span className="font-semibold">{med.dose} {med.unit}</span>
                                </p>
                                <p>
                                  Posologia: <span className="font-semibold">{med.frequency}</span>
                                </p>
                                <p>
                                  Via: <span className="font-semibold">{med.route}</span>
                                </p>
                                <p>
                                  Quantidade: <span className="font-semibold">{med.quantity}</span>
                                </p>
                                {med.notes && (
                                  <p className="text-gray-500 italic">Obs: {med.notes}</p>
                                )}
                              </div>
                            </CardBody>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-700">
                          <p className="font-semibold mb-1">Próximo passo:</p>
                          <p>
                            Clique em "Abrir para Assinar" para prosseguir com a assinatura digital
                            via ClickSign. A janela será aberta e você poderá assinar com sua chave
                            de assinatura digital.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {signed && prescription && (
                  <div className="space-y-4">
                    {/* Sucesso */}
                    <div className="flex flex-col items-center gap-4 py-4">
                      <CheckCircle2 className="w-16 h-16 text-green-500" />
                      <div className="text-center">
                        <p className="font-semibold text-lg">Receita Assinada com Sucesso!</p>
                        <p className="text-sm text-gray-600 mt-2">
                          Data de assinatura: {new Date(prescription.signed_at || '').toLocaleString('pt-BR')}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Válida por 30 dias a partir da assinatura
                        </p>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Próximas ações:</h4>
                      <Button
                        fullWidth
                        className="bg-blue-500 text-white"
                        startContent={<Download className="w-4 h-4" />}
                        onPress={handleDownloadPDF}
                      >
                        Baixar PDF
                      </Button>
                      <Button
                        fullWidth
                        className="bg-green-500 text-white"
                        startContent={<Share2 className="w-4 h-4" />}
                        onPress={handleShareWithPatient}
                      >
                        Compartilhar via WhatsApp
                      </Button>
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Spinner color="primary" />
                    <span className="ml-2">Preparando assinatura...</span>
                  </div>
                )}

                {/* Status check indicator */}
                {checkingStatus && !signed && (
                  <div className="flex items-center justify-center text-sm text-gray-600">
                    <Spinner size="sm" color="default" />
                    <span className="ml-2">Aguardando assinatura...</span>
                  </div>
                )}
              </ModalBody>

              <ModalFooter>
                {!signed && !loading && (
                  <>
                    <Button color="default" variant="light" onPress={onClose}>
                      Cancelar
                    </Button>
                    <Button
                      color="primary"
                      startContent={<ExternalLink className="w-4 h-4" />}
                      isLoading={loading || checkingStatus}
                      onPress={handleRequestSignature}
                    >
                      Abrir para Assinar
                    </Button>
                  </>
                )}
                {signed && (
                  <Button color="primary" onPress={onClose}>
                    Fechar
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
