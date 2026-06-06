'use client';

import { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Spinner,
  Alert,
  Chip,
  Divider,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@nextui-org/react';
import { CheckCircle2, XCircle, AlertTriangle, QrCode } from 'lucide-react';
import { toast } from 'sonner';

interface ValidationData {
  valid: boolean;
  prescription_id: number;
  patient_name: string;
  doctor_name: string;
  doctor_crm: string;
  issued_at: string;
  signed_at: string;
  expires_at: string;
  medicines: Array<{
    name: string;
    dose: string;
    frequency: string;
    route: string;
    quantity: number;
  }>;
  signature_proof_url?: string;
}

interface ValidatorState {
  loading: boolean;
  error?: string;
  data?: ValidationData;
}

export function PrescriptionValidator() {
  const [prescriptionId, setPrescriptionId] = useState('');
  const [token, setToken] = useState('');
  const [state, setState] = useState<ValidatorState>({
    loading: false,
  });

  const handleValidate = async () => {
    if (!prescriptionId || !token) {
      toast.error('Preencha ID da receita e token');
      return;
    }

    setState({ loading: true });

    try {
      const response = await fetch(
        `/api/prescriptions/validate/${prescriptionId}?token=${token}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro ao validar receita');
      }

      const data: ValidationData = await response.json();
      setState({ loading: false, data });
      toast.success('Receita validada com sucesso!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setState({ loading: false, error: errorMessage });
      toast.error(errorMessage);
    }
  };

  const isExpired = state.data
    ? new Date(state.data.expires_at) < new Date()
    : false;

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="flex gap-3">
          <QrCode className="w-6 h-6" />
          <div className="flex flex-col">
            <p className="text-lg font-semibold">Validar Receita Médica</p>
            <p className="text-sm text-gray-600">Escaneie o QR code ou insira manualmente</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="ID da Receita"
              placeholder="Ex: 12345"
              value={prescriptionId}
              onValueChange={setPrescriptionId}
              type="number"
              disabled={state.loading}
            />
            <Input
              label="Token de Validação"
              placeholder="Cole o token do QR code"
              value={token}
              onValueChange={setToken}
              disabled={state.loading}
            />
          </div>

          <Button
            color="primary"
            size="lg"
            fullWidth
            isLoading={state.loading}
            onPress={handleValidate}
          >
            Validar Receita
          </Button>
        </CardBody>
      </Card>

      {state.error && (
        <Alert
          color="danger"
          title="Erro na Validação"
          icon={<XCircle className="w-5 h-5" />}
        >
          {state.error}
        </Alert>
      )}

      {state.data && (
        <div className="space-y-4">
          {/* Status da receita */}
          <Card className={isExpired ? 'bg-red-50' : 'bg-green-50'}>
            <CardBody className="space-y-2">
              <div className="flex items-center gap-3">
                {isExpired ? (
                  <>
                    <XCircle className="w-6 h-6 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-700">Receita Expirada</p>
                      <p className="text-sm text-red-600">Esta receita não é mais válida</p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="font-semibold text-green-700">Receita Válida</p>
                      <p className="text-sm text-green-600">
                        Válida até {new Date(state.data.expires_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Dados do paciente e médico */}
          <Card>
            <CardHeader className="flex gap-3">
              <p className="text-lg font-semibold">Informações da Receita</p>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Paciente</p>
                  <p className="text-base">{state.data.patient_name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Médico</p>
                  <p className="text-base">{state.data.doctor_name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">CRM</p>
                  <p className="text-base">{state.data.doctor_crm}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Nº Receita</p>
                  <p className="text-base">{state.data.prescription_id}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Data de Emissão</p>
                  <p className="text-base">
                    {new Date(state.data.issued_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Data de Assinatura</p>
                  <p className="text-base">
                    {new Date(state.data.signed_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Medicamentos */}
          <Card>
            <CardHeader className="flex gap-3">
              <p className="text-lg font-semibold">Medicamentos Prescritos</p>
            </CardHeader>
            <Divider />
            <CardBody>
              <Table className="overflow-auto">
                <TableHeader>
                  <TableColumn>Medicamento</TableColumn>
                  <TableColumn>Dose</TableColumn>
                  <TableColumn>Posologia</TableColumn>
                  <TableColumn>Via</TableColumn>
                  <TableColumn>Qtd.</TableColumn>
                </TableHeader>
                <TableBody>
                  {state.data.medicines.map((med, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-semibold">{med.name}</TableCell>
                      <TableCell>{med.dose}</TableCell>
                      <TableCell>{med.frequency}</TableCell>
                      <TableCell>{med.route}</TableCell>
                      <TableCell>{med.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>

          {/* Assinatura */}
          {state.data.signature_proof_url && (
            <Card>
              <CardHeader className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-lg font-semibold">Certificado de Assinatura</p>
              </CardHeader>
              <Divider />
              <CardBody>
                <a
                  href={state.data.signature_proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Baixar Certificado de Assinatura Digital
                </a>
                <p className="text-xs text-gray-600 mt-2">
                  Este documento contém o certificado de assinatura digital ICP-Brasil
                </p>
              </CardBody>
            </Card>
          )}

          {/* Avisos */}
          {!isExpired && (
            <Alert
              color="success"
              title="Receita Válida"
              icon={<CheckCircle2 className="w-5 h-5" />}
            >
              Esta receita está assinada digitalmente conforme Lei nº 14.065/2020 e é válida
              para uso na farmácia.
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
