'use client';
/**
 * PatientQuickActions
 *
 * A bottom action bar for the patient profile.
 * Three primary actions always visible; secondary actions in a sheet.
 *
 * Actions:
 * - Call: opens tel: link (iOS/Android native dialer)
 * - Message: WhatsApp deep link (wa.me/<phone>)
 * - New appointment: navigates to the schedule page pre-filled with patient
 * - Camera: opens photo capture modal
 *
 * Phone formatting: strips non-digits, prepends Brazil country code (55)
 * if the number starts with 0 or is 10-11 digits without prefix.
 */

import { useCallback } from 'react';
import { Phone, MessageSquare, CalendarPlus, Camera } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Props {
  patientId: number;
  patientName: string;
  phone?: string;
  onCameraClick: () => void;
}

function formatWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  color?: string;
  disabled?: boolean;
}

function ActionButton({ icon, label, onClick, href, color = 'bg-brand-600 hover:bg-brand-700', disabled }: ActionButtonProps) {
  const classes = `flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl transition-all text-white text-xs font-semibold ${
    disabled ? 'opacity-40 cursor-not-allowed bg-slate-400' : color
  }`;

  if (href && !disabled) {
    return (
      <Link href={href} className={classes}>
        <span className="w-6 h-6 flex items-center justify-center">{icon}</span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button onClick={disabled ? undefined : onClick} className={classes}>
      <span className="w-6 h-6 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function PatientQuickActions({ patientId, patientName, phone, onCameraClick }: Props) {
  const handleCall = useCallback(() => {
    if (!phone) { toast.error('Telefone não cadastrado'); return; }
    window.location.href = `tel:${phone.replace(/\D/g, '')}`;
  }, [phone]);

  const handleWhatsApp = useCallback(() => {
    if (!phone) { toast.error('Telefone não cadastrado'); return; }
    const waPhone = formatWaPhone(phone);
    const text = encodeURIComponent(`Olá, ${patientName}!`);
    window.open(`https://wa.me/${waPhone}?text=${text}`, '_blank', 'noopener');
  }, [phone, patientName]);

  return (
    <div className="flex gap-2 px-1">
      <ActionButton
        icon={<Phone className="w-5 h-5" />}
        label="Ligar"
        onClick={handleCall}
        color="bg-emerald-600 hover:bg-emerald-700"
        disabled={!phone}
      />
      <ActionButton
        icon={<MessageSquare className="w-5 h-5" />}
        label="WhatsApp"
        onClick={handleWhatsApp}
        color="bg-green-500 hover:bg-green-600"
        disabled={!phone}
      />
      <ActionButton
        icon={<CalendarPlus className="w-5 h-5" />}
        label="Agendar"
        href={`/agenda?paciente=${patientId}`}
        color="bg-brand-600 hover:bg-brand-700"
      />
      <ActionButton
        icon={<Camera className="w-5 h-5" />}
        label="Foto"
        onClick={onCameraClick}
        color="bg-slate-600 hover:bg-slate-700"
      />
    </div>
  );
}
