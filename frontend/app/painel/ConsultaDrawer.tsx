"use client";

import { useEffect, useState, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import {
  X, Play, CheckCircle, UserX, AlertTriangle, Activity, Pill,
  ClipboardList, Stethoscope, FileText, FlaskConical,
  Plus, Trash2, Printer, ChevronDown, ChevronUp, Save,
  Send, ClipboardCheck, Award, Camera, FileSearch2, Upload, ImageIcon, ZoomIn, ZoomOut,
  Pencil, Download, MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, patientsApi, consultationsApi, prescriptionsApi, prescriptionTemplatesApi, examsApi, evolutionApi, clinicApi, chatApi, reportsApi, leafletsApi, waitingRoomApi, msgErro } from "@/lib/api";
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type QueueStatus = "waiting" | "attending" | "suspended" | "attended" | "absent";

export interface WaitingRoomEntry {
  id: number;
  patient_id: number;
  patient_name: string;
  patient_insurance: string | null;
  clinic_id: number | null;
  reason: string | null;
  position: number;
  arrived_at: string;
  called_at?: string | null;
  attended_at?: string | null;
  status: QueueStatus;
  waited_minutes: number | null;
  duration_minutes?: number | null;
  value_cents?: number | null;
  // Cronômetro com pausa (suspender/continuar)
  active_seconds?: number;
  segment_started_at?: string | null;
}

interface ConsultaDrawerProps {
  entry: WaitingRoomEntry;
  onClose: () => void;
  onStatusChange: (entryId: number, status: QueueStatus) => void;
}

type DrawerTab = "anamnese" | "exames" | "receitas" | "encaminhamentos" | "procedimentos" | "atestados" | "laudos" | "fotos";

// ── Coletor de documentos da consulta ────────────────────────────────────────
// Cada modal de impressão (PrintDocModal / PrintModal) registra seu documento
// aqui ao abrir. No fim do atendimento, o botão "Imprimir documentos" abre um
// centro que lista tudo que foi gerado, com checkbox pra escolher o que sai, e
// imprime os selecionados de uma vez (cada um em sua página). Reseta por paciente.
type CollectedDoc = { id: string; label: string; content: React.ReactNode };

interface PrintCollectorValue {
  docs: CollectedDoc[];
  addDoc: (doc: CollectedDoc) => void;
  removeDoc: (id: string) => void;
}

const PrintCollectorContext = createContext<PrintCollectorValue | null>(null);

/** Registra um documento no coletor assim que o modal de impressão abre (mount). */
function useRegisterPrintDoc(doc: CollectedDoc | null) {
  const collector = useContext(PrintCollectorContext);
  useEffect(() => {
    if (!collector || !doc) return;
    collector.addDoc(doc);
    // Não remove no unmount de propósito: o doc fica disponível pra impressão
    // final mesmo depois de fechar o preview individual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PAIN_COLORS = [
  "bg-green-500", "bg-green-400", "bg-lime-400", "bg-yellow-300",
  "bg-yellow-400", "bg-orange-300", "bg-orange-400", "bg-orange-500",
  "bg-red-400", "bg-red-500", "bg-red-600",
];

const DURATION_UNITS = ["horas", "dias", "semanas", "meses", "anos"];

const CONSULT_TYPES = [
  { value: "primeira_consulta", label: "1ª Consulta" },
  { value: "retorno", label: "Retorno" },
  { value: "urgencia", label: "Urgência" },
  { value: "pre_operatorio", label: "Pré-operatório" },
  { value: "pos_operatorio", label: "Pós-operatório" },
  { value: "procedimento", label: "Procedimento" },
  { value: "teleconsulta", label: "Teleconsulta" },
];

const ORTHO_TESTS = [
  { key: "lachman", label: "Lachman", region: "Joelho" },
  { key: "mcmurray", label: "McMurray", region: "Joelho" },
  { key: "thessaly", label: "Thessaly", region: "Joelho" },
  { key: "varus_valgus", label: "Varo/Valgo", region: "Joelho" },
  { key: "lasegue", label: "Lasègue", region: "Coluna" },
  { key: "bragard", label: "Bragard", region: "Coluna" },
  { key: "patrick", label: "Patrick (FABER)", region: "Quadril" },
  { key: "trendelenburg", label: "Trendelenburg", region: "Quadril" },
  { key: "neer", label: "Neer", region: "Ombro" },
  { key: "hawkins", label: "Hawkins-Kennedy", region: "Ombro" },
  { key: "jobe", label: "Jobe (empty can)", region: "Ombro" },
  { key: "finkelstein", label: "Finkelstein", region: "Punho" },
  { key: "phalen", label: "Phalen", region: "Punho" },
  { key: "tinel_carpal", label: "Tinel (carpo)", region: "Punho" },
];

// Busca REVERSA de CID (pedido Valth 02/08): ele não decora códigos — digita a
// condição em português ("joelho", "esporão", "joanete", "tenista") e acha o
// CID. `k` = palavras-chave/apelidos populares; busca ignora acentos.
function normTxt(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function cidMatches(c: { code: string; label: string; k?: string }, query: string): boolean {
  const q = normTxt(query);
  return (
    normTxt(c.code).includes(q) ||
    normTxt(c.label).includes(q) ||
    (!!c.k && normTxt(c.k).includes(q))
  );
}

const ORTHO_CIDS: { code: string; label: string; k?: string }[] = [
  // ── Joelho ──
  { code: "M17.1", label: "Gonartrose primária unilateral", k: "joelho artrose desgaste" },
  { code: "M17.0", label: "Gonartrose primária bilateral", k: "joelho artrose bilateral" },
  { code: "M23.2", label: "Lesão do menisco por ruptura antiga", k: "joelho menisco" },
  { code: "M23.0", label: "Menisco cístico / corpo livre no joelho", k: "joelho" },
  { code: "M22.2", label: "Síndrome patelofemoral", k: "joelho patela dor anterior" },
  { code: "M22.4", label: "Condromalácia da rótula", k: "joelho patela cartilagem" },
  { code: "S83.2", label: "Ruptura do menisco (atual)", k: "joelho menisco trauma" },
  { code: "S83.5", label: "Entorse do joelho — ligamento cruzado (LCA/LCP)", k: "joelho lca ligamento cruzado" },
  { code: "S83.0", label: "Luxação da rótula", k: "joelho patela" },
  { code: "M70.5", label: "Bursite do joelho", k: "joelho" },
  { code: "M76.5", label: "Tendinite patelar", k: "joelho saltador" },
  // ── Ombro ──
  { code: "M75.0", label: "Capsulite adesiva (ombro congelado)", k: "ombro congelado rigidez" },
  { code: "M75.1", label: "Síndrome do manguito rotador", k: "ombro supraespinhal manguito" },
  { code: "M75.2", label: "Tendinite bicipital", k: "ombro biceps" },
  { code: "M75.3", label: "Tendinite calcificante do ombro", k: "ombro calcificacao calcarea" },
  { code: "M75.4", label: "Síndrome de colisão do ombro (impacto)", k: "ombro impacto" },
  { code: "M75.5", label: "Bursite do ombro", k: "ombro" },
  { code: "S43.0", label: "Luxação do ombro", k: "ombro luxacao" },
  { code: "S43.4", label: "Entorse do ombro", k: "ombro" },
  // ── Coluna ──
  { code: "M54.5", label: "Lombalgia (dor lombar baixa)", k: "coluna lombar costas" },
  { code: "M54.4", label: "Lumbago com ciática (lumbociatalgia)", k: "coluna ciatico perna" },
  { code: "M54.3", label: "Ciática", k: "coluna nervo ciatico" },
  { code: "M54.2", label: "Cervicalgia (dor no pescoço)", k: "coluna cervical pescoco" },
  { code: "M54.6", label: "Dor na coluna torácica (dorsalgia)", k: "coluna dorsal" },
  { code: "M51.1", label: "Hérnia de disco lombar com radiculopatia", k: "coluna hernia disco" },
  { code: "M50.1", label: "Hérnia de disco cervical com radiculopatia", k: "coluna hernia cervical braco" },
  { code: "M48.0", label: "Estenose do canal vertebral", k: "coluna canal estreito claudicacao" },
  { code: "M47.8", label: "Espondilose (artrose da coluna)", k: "coluna bico de papagaio" },
  { code: "M43.1", label: "Espondilolistese", k: "coluna escorregamento vertebra" },
  { code: "M41.9", label: "Escoliose", k: "coluna desvio curvatura" },
  // ── Quadril ──
  { code: "M16.1", label: "Coxartrose primária unilateral", k: "quadril artrose" },
  { code: "M16.0", label: "Coxartrose primária bilateral", k: "quadril artrose" },
  { code: "M70.6", label: "Bursite trocantérica", k: "quadril dor lateral trocanter" },
  { code: "M87.0", label: "Osteonecrose da cabeça femoral", k: "quadril necrose avascular" },
  // ── Mão e punho ──
  { code: "G56.0", label: "Síndrome do túnel do carpo", k: "mao punho formigamento dormencia" },
  { code: "M65.3", label: "Dedo em gatilho", k: "mao dedo trava" },
  { code: "M65.4", label: "Tenossinovite de De Quervain", k: "punho polegar tendinite" },
  { code: "M65.1", label: "Tenossinovite", k: "tendinite bainha" },
  { code: "M18.1", label: "Rizartrose (artrose do polegar)", k: "mao polegar base artrose" },
  { code: "M72.0", label: "Contratura de Dupuytren", k: "mao palma fibrose dedo" },
  { code: "M67.4", label: "Cisto sinovial (gânglio)", k: "punho mao carocinho" },
  // ── Cotovelo ──
  { code: "M77.1", label: "Epicondilite lateral (cotovelo de tenista)", k: "cotovelo tenista" },
  { code: "M77.0", label: "Epicondilite medial (cotovelo de golfista)", k: "cotovelo golfista" },
  // ── Tornozelo e pé ──
  { code: "S93.4", label: "Entorse do tornozelo", k: "tornozelo torcao pe" },
  { code: "M77.3", label: "Esporão do calcâneo", k: "pe calcanhar esporao" },
  { code: "M72.2", label: "Fasciíte plantar (fibromatose da fáscia)", k: "pe calcanhar fascite sola" },
  { code: "M76.6", label: "Tendinite do tendão de Aquiles", k: "pe calcanhar aquileu" },
  { code: "M20.1", label: "Hálux valgo (joanete)", k: "pe joanete dedao" },
  { code: "M21.4", label: "Pé plano (chato)", k: "pe chato plano" },
  { code: "M77.4", label: "Metatarsalgia", k: "pe dor planta antepe" },
  { code: "G57.6", label: "Neuroma de Morton", k: "pe neuroma dedos queimacao" },
  { code: "M20.2", label: "Hálux rígido", k: "pe dedao rigido artrose" },
  // ── Fraturas ──
  { code: "S42.0", label: "Fratura da clavícula", k: "fratura ombro" },
  { code: "S42.2", label: "Fratura da extremidade superior do úmero", k: "fratura ombro braco" },
  { code: "S52.5", label: "Fratura distal do rádio (punho)", k: "fratura punho radio" },
  { code: "S62.0", label: "Fratura do escafoide", k: "fratura punho navicular" },
  { code: "S62.5", label: "Fratura de metacarpo", k: "fratura mao" },
  { code: "S72.0", label: "Fratura do colo do fêmur", k: "fratura quadril idoso" },
  { code: "S72.1", label: "Fratura pertrocantérica do fêmur", k: "fratura quadril" },
  { code: "S82.0", label: "Fratura da rótula (patela)", k: "fratura joelho" },
  { code: "S82.6", label: "Fratura do maléolo lateral", k: "fratura tornozelo" },
  { code: "S92.0", label: "Fratura do calcâneo", k: "fratura pe calcanhar" },
  { code: "S32.0", label: "Fratura de vértebra lombar", k: "fratura coluna" },
  { code: "M84.3", label: "Fratura por estresse", k: "fratura fadiga corrida" },
  { code: "M84.4", label: "Fratura patológica", k: "fratura osteoporose" },
  // ── Osteoporose / reumato / geral ──
  { code: "M81.0", label: "Osteoporose pós-menopáusica", k: "osso densitometria" },
  { code: "M81.9", label: "Osteoporose não especificada", k: "osso densitometria" },
  { code: "M80.9", label: "Osteoporose com fratura patológica", k: "osso fratura" },
  { code: "M06.9", label: "Artrite reumatoide", k: "reumatismo articulacoes" },
  { code: "M10.9", label: "Gota", k: "acido urico dedao" },
  { code: "M15.9", label: "Poliartrose (artrose múltipla)", k: "artrose varias articulacoes" },
  { code: "M19.9", label: "Artrose não especificada", k: "artrose desgaste" },
  { code: "M79.7", label: "Fibromialgia", k: "dor difusa generalizada corpo" },
  { code: "M62.6", label: "Distensão muscular", k: "musculo estiramento" },
  { code: "M79.1", label: "Mialgia (dor muscular)", k: "musculo dor" },
  { code: "M25.5", label: "Dor articular", k: "dor articulacao" },
  { code: "M79.6", label: "Dor em membro", k: "dor braco perna" },
  { code: "M70.9", label: "Bursite não especificada", k: "bursa inflamacao" },
  { code: "E66.9", label: "Obesidade", k: "peso sobrepeso emagrecimento imc metabolico" },
  { code: "E66.0", label: "Obesidade por excesso de calorias", k: "peso sobrepeso emagrecimento" },
  { code: "M76.9", label: "Entesopatia do membro inferior", k: "tendinite perna" },
  { code: "T14.0", label: "Traumatismo superficial (contusão)", k: "trauma pancada batida" },
];

const ROUTE_OPTIONS = ["oral", "tópico", "IM", "SC", "IV", "transdérmico", "intraarticular", "inalatório", "sublingual", "retal"];

const LS_EXAM_TEMPLATES_KEY = "orthoclinic_exam_templates";
const LS_EXAM_FONT_SIZE_KEY = "orthoclinic_exam_font_size";
const LS_EXAM_LINE_HEIGHT_KEY = "orthoclinic_exam_line_height";

// Quick exam templates built-in (ortopedia ambulatorial)
const EXAM_QUICK_TEMPLATES = [
  // Pedido Valth 02/08: pré-operatório de 1 clique (bateria + ECG/risco cirúrgico)
  { name: "🔪 Pré-Operatório", content: "SOLICITO — EXAMES PRÉ-OPERATÓRIOS:\n- HEMOGRAMA COMPLETO COM PLAQUETAS\n- COAGULOGRAMA (TP/INR, TTPa)\n- GLICEMIA DE JEJUM\n- UREIA E CREATININA\n- SÓDIO E POTÁSSIO\n- SUMÁRIO DE URINA\n- ELETROCARDIOGRAMA (ECG) DE REPOUSO\n- AVALIAÇÃO CARDIOLÓGICA COM RISCO CIRÚRGICO\n\nPROGRAMAÇÃO CIRÚRGICA: [PROCEDIMENTO]\nHD: [CID]\n\nObs: trazer todos os resultados na consulta de revisão pré-anestésica." },
  { name: "RNM Joelho", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DO JOELHO [D/E] SEM CONTRASTE\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: LESÃO MENISCAL / LCA" },
  { name: "RNM Coluna", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DA COLUNA [CERVICAL/TORÁCICA/LOMBAR] SEM CONTRASTE\nHD: HÉRNIA DISCAL / ESTENOSE DO CANAL" },
  { name: "RX Coluna LS", content: "SOLICITO: RADIOGRAFIA DA COLUNA LOMBOSSACRA\nINCIDÊNCIAS: AP e Perfil\nHD: LOMBALGIA / ESPONDILODISCOARTROSE" },
  { name: "TC Coluna", content: "SOLICITO: TOMOGRAFIA COMPUTADORIZADA DA COLUNA LOMBAR\nHD: HÉRNIA DISCAL / ESTENOSE DO CANAL" },
  { name: "DXA", content: "SOLICITO: DENSITOMETRIA ÓSSEA (DXA)\nREGIÕES: Coluna lombar L1-L4, Fêmur proximal bilateral e Rádio distal 1/3\nINDICAÇÃO: [Pós-menopausa / Uso crônico de corticoide / Fratura por fragilidade]\nHD: OSTEOPOROSE / OSTEOPENIA\n\nObs: Controle terapêutico — último DXA em: ___" },
  { name: "DXA (controle)", content: "SOLICITO: DENSITOMETRIA ÓSSEA — CONTROLE TERAPÊUTICO\nREGIÕES: Coluna lombar L1-L4 e Fêmur proximal bilateral\nÚLTIMO EXAME: [data]  T-score prévio: ___\nTRATAMENTO EM USO: [bifosfonato/denosumabe/outro]\nHD: OSTEOPOROSE EM TRATAMENTO\nObs: intervalo mínimo recomendado entre exames: 12 meses (em tratamento) / 24 meses (sem tratamento) — SBDENS 2022" },
  { name: "ENMG", content: "SOLICITO: ELETRONEUROMIOGRAFIA (ENMG) COM VELOCIDADE DE CONDUÇÃO NERVOSA DOS MEMBROS [SUPERIORES/INFERIORES]\nHD: SÍNDROME DO TÚNEL DO CARPO / RADICULOPATIA" },
  { name: "RNM Ombro", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DO OMBRO [D/E] SEM CONTRASTE\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: LESÃO DO MANGUITO ROTADOR / IMPACTO SUBACROMIAL" },
  { name: "artro-RM Ombro", content: "SOLICITO: ARTRO-RESSONÂNCIA MAGNÉTICA DO OMBRO [D/E]\n(RM após artrocentese com injeção intra-articular de gadolíneo diluído)\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: INSTABILIDADE GLENOUMERAL / LESÃO LABRAL (BANKART / SLAP)\nObs: Paciente em investigação de instabilidade anterior crônica" },
  { name: "RX Joelho", content: "SOLICITO: RADIOGRAFIA DO JOELHO [D/E]\nINCIDÊNCIAS: AP, Perfil e Axial de Patela\nHD: GONARTROSE" },
  { name: "RX Joelho (pré-op)", content: "SOLICITO: RADIOGRAFIA DO JOELHO [D/E] EM ORTOSTATISMO\nINCIDÊNCIAS: AP bilateral com carga, Perfil, Axial de Patela (30°/60°) e Schuss (PA a 45° com carga)\nObs: Necessário para planejamento cirúrgico\nHD: GONARTROSE — AVALIAÇÃO PRÉ-OPERATÓRIA" },
  { name: "RX Quadril", content: "SOLICITO: RADIOGRAFIA DO QUADRIL [D/E]\nINCIDÊNCIAS: AP e Perfil (Lauenstein)\nHD: COXARTROSE / FRATURA DO COLO DO FÊMUR" },
  { name: "RX Bacia AP", content: "SOLICITO: RADIOGRAFIA DA BACIA\nINCIDÊNCIAS: AP em ortostatismo\nHD: COXARTROSE / DISPLASIA" },
  { name: "RX Tornozelo", content: "SOLICITO: RADIOGRAFIA DO TORNOZELO [D/E]\nINCIDÊNCIAS: AP, Perfil e Mortise\nHD: ENTORSE / FRATURA" },
  { name: "US Ombro", content: "SOLICITO: ULTRASSONOGRAFIA DO OMBRO [D/E]\nHD: TENDINOPATIA / BURSITE SUBACROMIAL" },
  { name: "RX Mão/Punho", content: "SOLICITO: RADIOGRAFIA DO PUNHO E MÃO [D/E]\nINCIDÊNCIAS: AP, Perfil e Oblíqua\nHD: FRATURA DO ESCAFOIDE / METACARPO" },
  { name: "RNM Quadril", content: "SOLICITO: RESSONÂNCIA MAGNÉTICA DO QUADRIL [D/E] SEM CONTRASTE\nINCIDÊNCIAS: Coronal, Sagital, Axial\nHD: BURSITE TROCANTÉRICA / LESÃO LABRAL / FAI" },
  { name: "Cintilografia Óssea", content: "SOLICITO: CINTILOGRAFIA ÓSSEA COM TECNÉCIO-99m (CORPO INTEIRO + FOCO)\nHD: FRATURA POR ESTRESSE / INVESTIGAÇÃO DE LESÃO ÓSSEA METASTÁTICA" },
  { name: "RX Pé", content: "SOLICITO: RADIOGRAFIA DO PÉ [D/E]\nINCIDÊNCIAS: AP, Perfil e Oblíqua\nHD: HÁLUX VALGO / ESPORÃO CALCÂNEO / FRATURA" },
];

interface ExamTemplate {
  id: string;
  name: string;
  content: string;
}

function loadExamTemplates(): ExamTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_EXAM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveExamTemplates(list: ExamTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_EXAM_TEMPLATES_KEY, JSON.stringify(list));
}

function loadExamFontSize(): 12 | 14 | 16 {
  if (typeof window === "undefined") return 14;
  const v = localStorage.getItem(LS_EXAM_FONT_SIZE_KEY);
  if (v === "12" || v === "14" || v === "16") return Number(v) as 12 | 14 | 16;
  return 14;
}

function loadExamLineHeight(): "normal" | "relaxed" {
  if (typeof window === "undefined") return "normal";
  const v = localStorage.getItem(LS_EXAM_LINE_HEIGHT_KEY);
  if (v === "relaxed") return "relaxed";
  return "normal";
}

// ── Drug-allergy alert groups ───────────────────────────────────────────────────
const DRUG_ALLERGY_GROUPS: { groupName: string; groupKeywords: string[]; drugKeywords: string[] }[] = [
  { groupName: "AINEs", groupKeywords: ["aine", "anti-inflamatório", "antiinflamatório", "nsaid", "aspirina", "asa", "aas"], drugKeywords: ["nimesulida", "diclofenaco", "meloxicam", "ibuprofeno", "celecoxib", "etoricoxib", "naproxeno", "piroxicam", "cetoprofeno", "tenoxicam"] },
  { groupName: "Penicilinas", groupKeywords: ["penicilina", "amoxicilina", "ampicilina"], drugKeywords: ["amoxicilina", "ampicilina", "amoxil"] },
  { groupName: "Sulfonamidas", groupKeywords: ["sulfa", "sulfonamida"], drugKeywords: ["sulfametoxazol", "bactrim"] },
  { groupName: "Dipirona/Metamizol", groupKeywords: ["dipirona", "metamizol"], drugKeywords: ["dipirona", "novalgina"] },
  { groupName: "Opioides", groupKeywords: ["opioide", "morfina", "codeína", "tramadol"], drugKeywords: ["morfina", "codeína", "tramadol", "oxicodona", "fentanil"] },
  { groupName: "Corticosteroides", groupKeywords: ["corticoide", "corticosteroide"], drugKeywords: ["prednisona", "prednisolona", "dexametasona", "triancinolona", "betametasona"] },
];

function checkDrugAllergyAlert(medName: string, allergiesStr: string): { allergen: string; drug: string; group: string } | null {
  if (!medName || !allergiesStr) return null;
  const name = medName.toLowerCase();
  const alrg = allergiesStr.toLowerCase();
  for (const grp of DRUG_ALLERGY_GROUPS) {
    const allergyMatches = grp.groupKeywords.some(k => alrg.includes(k)) || grp.drugKeywords.some(k => alrg.includes(k));
    const drugMatches = grp.drugKeywords.some(k => name.includes(k));
    if (allergyMatches && drugMatches) {
      return { allergen: allergiesStr, drug: medName, group: grp.groupName };
    }
  }
  return null;
}

// ── Ortho autocomplete medications ─────────────────────────────────────────────
interface OrthoMedPreset {
  name: string; dose: string; route: string; frequency: string; duration: string; instructions: string; prescriptionType: "simples" | "controle_especial" | "antimicrobiano" | "notificacao_ab";
}
const ORTHO_MEDICATIONS: OrthoMedPreset[] = [
  { name: "Nimesulida 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Diclofenaco Potássico 50mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Meloxicam 15mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "7 dias", instructions: "Tomar após refeição principal", prescriptionType: "simples" },
  { name: "Cetoprofeno 100mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Tramadol 50mg", dose: "1 cápsula", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Pode causar sonolência — Notificação B (receita amarela SESA)", prescriptionType: "notificacao_ab" },
  { name: "Codeína 30mg", dose: "1 comprimido", route: "oral", frequency: "6/6h", duration: "3 dias", instructions: "Conforme necessidade — Notificação B (receita amarela SESA)", prescriptionType: "notificacao_ab" },
  { name: "Ciclobenzaprina 5mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Pode causar sonolência — evitar dirigir", prescriptionType: "simples" },
  { name: "Omeprazol 20mg", dose: "1 cápsula", route: "oral", frequency: "1x/dia", duration: "30 dias", instructions: "Tomar 30 min antes do café", prescriptionType: "simples" },
  { name: "Prednisolona 20mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "5 dias", instructions: "Tomar pela manhã após refeição", prescriptionType: "simples" },
  { name: "Dexametasona 4mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "3 dias", instructions: "Tomar após refeições", prescriptionType: "simples" },
  { name: "Tenoxicam 20mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "7 dias", instructions: "Tomar após refeição principal", prescriptionType: "simples" },
  { name: "Paracetamol 750mg", dose: "1 comprimido", route: "oral", frequency: "6/6h", duration: "5 dias", instructions: "Conforme necessidade — máx. 4 comprimidos/dia", prescriptionType: "simples" },
  { name: "Dipirona 500mg", dose: "2 comprimidos", route: "oral", frequency: "6/6h", duration: "3 dias", instructions: "Conforme necessidade de dor ou febre", prescriptionType: "simples" },
  { name: "Gabapentina 300mg", dose: "1 cápsula", route: "oral", frequency: "8/8h", duration: "30 dias", instructions: "Aumentar dose gradualmente conforme orientação", prescriptionType: "simples" },
  { name: "Pregabalina 75mg", dose: "1 cápsula", route: "oral", frequency: "12/12h", duration: "30 dias", instructions: "Pode causar sonolência e tontura", prescriptionType: "simples" },
  { name: "Alopurinol 300mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "30 dias", instructions: "Tomar após refeição principal — manter hidratação", prescriptionType: "simples" },
  { name: "Colchicina 0,5mg", dose: "1 comprimido", route: "oral", frequency: "12/12h", duration: "5 dias", instructions: "Suspender se diarreia ou dor abdominal intensa", prescriptionType: "simples" },
  { name: "Condroitina + Glucosamina", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "90 dias", instructions: "Tomar após refeição", prescriptionType: "simples" },
  { name: "Carisoprodol + Diclofenaco", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "5 dias", instructions: "Tomar após refeições — pode causar sonolência", prescriptionType: "simples" },
  { name: "Celecoxib 200mg", dose: "1 cápsula", route: "oral", frequency: "1x/dia", duration: "10 dias", instructions: "Tomar com alimento — evitar em doença renal", prescriptionType: "simples" },
  { name: "Duloxetina 30mg", dose: "1 cápsula", route: "oral", frequency: "1x/dia", duration: "30 dias", instructions: "Tomar pela manhã — titulação gradual", prescriptionType: "simples" },
  { name: "Vitamina D3 7000UI", dose: "1 comprimido", route: "oral", frequency: "1x/semana", duration: "60 dias", instructions: "Tomar junto com refeição", prescriptionType: "simples" },
  { name: "Prednisona 40mg (desmame 7d)", dose: "1 comprimido (40mg)", route: "oral", frequency: "1x/dia (esquema de desmame — ver orientações)", duration: "7 dias", instructions: "Esquema: Dias 1-3: 2 comprimidos pela manhã / Dias 4-6: 1 comprimido pela manhã / Dia 7: 1/2 comprimido pela manhã. NÃO suspender abruptamente.", prescriptionType: "simples" },
  { name: "Etoricoxib 90mg", dose: "1 comprimido", route: "oral", frequency: "1x/dia", duration: "5 dias", instructions: "Tomar após refeição principal — evitar em insuficiência renal", prescriptionType: "simples" },
  { name: "Tizanidina 4mg", dose: "1 comprimido", route: "oral", frequency: "8/8h", duration: "7 dias", instructions: "Pode causar hipotensão — não associar com ciprofloxacino", prescriptionType: "simples" },
  { name: "Clonazepam 0,5mg", dose: "1/2 comprimido", route: "oral", frequency: "1x/dia (à noite)", duration: "30 dias", instructions: "Usar à noite para dor neuropática — Notificação B2 (receita amarela)", prescriptionType: "controle_especial" },
  { name: "Sulfato de Glicosamina 1500mg", dose: "1 sachê em 200ml de água", route: "oral", frequency: "1x/dia", duration: "90 dias", instructions: "Tomar preferencialmente pela manhã", prescriptionType: "simples" },
];

// ── Referral text templates ─────────────────────────────────────────────────────
const REFERRAL_TEXT_TEMPLATES = [
  { type: "fisioterapia", name: "Gonartrose (fortalecimento)", text: "Paciente portador(a) de gonartrose (CID: M17.1). Solicito avaliação e início de programa de fortalecimento muscular de quadríceps e isquiotibiais, visando melhora funcional e alívio da dor." },
  { type: "fisioterapia", name: "Pós-op LCA", text: "Paciente em pós-operatório de reconstrução do ligamento cruzado anterior. Solicito fisioterapia pós-operatória conforme protocolo de reabilitação de LCA." },
  { type: "fisioterapia", name: "Lombalgia crônica", text: "Paciente com lombalgia crônica (CID: M54.5). Solicito avaliação e programa de fisioterapia para fortalecimento do core e reabilitação funcional." },
  { type: "fisioterapia", name: "Síndrome do ombro", text: "Paciente com síndrome do manguito rotador (CID: M75.1). Solicito avaliação e tratamento fisioterápico — cinesioterapia e fortalecimento do manguito." },
  { type: "fisioterapia", name: "Pós-op artroscopia joelho", text: "Paciente em pós-operatório de artroscopia do joelho [D/E] (HD: [diagnóstico]). Solicito fisioterapia pós-operatória — fase I: controle de edema e ADM; fase II: fortalecimento; fase III: retorno esportivo." },
  { type: "fisioterapia", name: "Cervicalgia", text: "Paciente com cervicalgia (CID: M54.2). Solicito cinesioterapia cervical, fortalecimento de musculatura estabilizadora e orientação postural." },
  { type: "fisioterapia", name: "Tendinopatia de Aquiles", text: "Paciente com tendinopatia de Aquiles (CID: M76.6). Solicito fisioterapia — protocolo de carga excêntrica e fortalecimento do tríceps sural." },
  { type: "fisioterapia", name: "Reabilitação pós-fratura", text: "Paciente em recuperação de fratura de [osso/segmento] com imobilização resolvida. Solicito fisioterapia para recuperação de ADM, força muscular e funcionalidade." },
  { type: "especialidade", name: "Lombalgia → Neurologia", text: "Paciente com lombalgia crônica e sinais de radiculopatia. Solicito avaliação neurológica para investigação diagnóstica e conduta especializada." },
  { type: "especialidade", name: "Suspeita reumatológica", text: "Paciente com artralgia poliarticular de padrão inflamatório. Solicito avaliação reumatológica para investigação de doença reumatológica sistêmica." },
  { type: "colega", name: "Segunda opinião cirúrgica", text: "Encaminho o(a) paciente para avaliação ortopédica e segunda opinião quanto à indicação cirúrgica. O paciente apresenta [diagnóstico], com falha de tratamento conservador de [prazo]. Seguem resumo clínico, imagens e exames complementares em anexo. Solicito sua avaliação e parecer.\n\nAtenciosamente,\nDr. Valth Guimarães — CRM/PB 6326 | CRM/PE 16551" },
  { type: "outro", name: "Clínica da dor", text: "Paciente com dor crônica de difícil controle. Solicito avaliação multidisciplinar em clínica especializada em dor para otimização do tratamento analgésico." },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

// E10: avisa quando o aniversário do paciente cai nesta semana (±3 dias), pra
// o médico parabenizar na consulta.
function aniversarioProximo(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  try {
    const b = new Date(birthDate.length <= 10 ? `${birthDate}T12:00:00` : birthDate);
    if (isNaN(b.getTime())) return null;
    const hoje = new Date();
    const esteAno = new Date(hoje.getFullYear(), b.getMonth(), b.getDate(), 12);
    const dias = Math.round((esteAno.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12).getTime()) / 86400000);
    if (dias === 0) return "Aniversário HOJE!";
    if (dias > 0 && dias <= 3) return `Aniversário em ${dias} dia${dias > 1 ? "s" : ""}`;
    if (dias < 0 && dias >= -3) return `Fez aniversário ${-dias} dia${dias < -1 ? "s" : ""} atrás`;
    return null;
  } catch {
    return null;
  }
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const birth = new Date(birthDate);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  return `${age} anos`;
}

function parseList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string") return val.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// S1 (LGPD): escopo de usuário para chaves de rascunho no localStorage. Assim o
// rascunho de um médico não é restaurado na sessão de outro usuário no mesmo
// navegador. Limitação: o localStorage não é apagado no logout aqui (fora do
// escopo deste componente); o escopo por id do usuário mitiga o vazamento.
function userScope(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const raw = localStorage.getItem("ortho_user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.id != null) return `u${u.id}`;
    }
  } catch {}
  return "anon";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AllergyBanner({ patient }: { patient: any }) {
  const allergies = parseList(patient?.allergies);
  const chronic = parseList(patient?.chronic_conditions);
  const meds = parseList(patient?.current_medications);

  if (!allergies.length && !chronic.length && !meds.length) return null;

  return (
    <div className="space-y-2 px-5 pt-3">
      {allergies.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wide">
              Alérgico a:
            </p>
            <p className="text-xs text-red-700 dark:text-red-400">{allergies.join(" · ")}</p>
          </div>
        </div>
      )}
      {chronic.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
          <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Condições crônicas</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">{chronic.join(" · ")}</p>
          </div>
        </div>
      )}
      {meds.length > 0 && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2">
          <Pill className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-blue-800 dark:text-blue-300">Em uso atual</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">{meds.join(" · ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// CID autocomplete inline
function CidSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.length >= 2
    ? ORTHO_CIDS.filter((c) => cidMatches(c, query)).slice(0, 6)
    : [];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Ex: M17.1 ou gonartrose..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                onClick={() => {
                  const val = `${c.code} — ${c.label}`;
                  setQuery(val);
                  onChange(val);
                  setOpen(false);
                }}
              >
                <span className="text-xs font-bold text-blue-600 w-12 flex-shrink-0">{c.code}</span>
                <span className="text-xs text-slate-700 dark:text-slate-300">{c.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Diagnósticos fixos (CIDs) + lembrete de ofertas de alto valor ──────────────
// Pedido do Valth 02/08: campo FIXO de CIDs na anamnese — sem ele o lembrete de
// "não esquecer de oferecer" nunca dispara. Mapeamentos ditados por ele:
// dor no ombro → infiltração de corticoide; osteoporose → ácido zoledrônico.
const CID_OFERTAS: { prefix: string; nome: string; opcoes: string[] }[] = [
  { prefix: "M17", nome: "Gonartrose", opcoes: ["Viscossuplementação", "Infiltração", "Bloqueio geniculares", "Programa de dor", "Protocolo metabólico (peso)"] },
  { prefix: "M16", nome: "Coxartrose", opcoes: ["Infiltração guiada", "Programa de dor"] },
  { prefix: "M19", nome: "Artrose", opcoes: ["Viscossuplementação", "Infiltração", "Bloqueio geniculares (joelho)", "Programa de dor"] },
  { prefix: "M75", nome: "Ombro doloroso", opcoes: ["Infiltração de corticoide", "Ondas de choque", "Proloterapia"] },
  { prefix: "M80", nome: "Osteoporose c/ fratura", opcoes: ["Ácido zoledrônico (aplicação)", "Acompanhamento semestral"] },
  { prefix: "M81", nome: "Osteoporose", opcoes: ["Ácido zoledrônico (aplicação)", "Acompanhamento semestral"] },
  { prefix: "M72.2", nome: "Fascite plantar / esporão", opcoes: ["Ondas de choque", "Palmilha sob medida"] },
  { prefix: "M77.3", nome: "Esporão do calcâneo", opcoes: ["Ondas de choque", "Palmilha sob medida"] },
  { prefix: "M77", nome: "Epicondilite / entesopatia", opcoes: ["Ondas de choque", "Infiltração", "Proloterapia"] },
  { prefix: "M76", nome: "Tendinite (patelar/Aquiles)", opcoes: ["Ondas de choque", "Proloterapia"] },
  { prefix: "M54", nome: "Lombalgia", opcoes: ["Programa de dor crônica", "Medicina integrativa"] },
  { prefix: "M65", nome: "Tenossinovite", opcoes: ["Infiltração", "Proloterapia"] },
  { prefix: "M25.5", nome: "Dor articular", opcoes: ["Proloterapia", "Infiltração"] },
  { prefix: "E66", nome: "Obesidade / Sobrepeso", opcoes: ["Protocolo metabólico (Tirzepatida)"] },
  // Cirurgia do joelho (ditado Valth 02/08 — ele é cirurgião de joelho):
  { prefix: "M23.2", nome: "Lesão de menisco", opcoes: ["Avaliação cirúrgica (artroscopia)", "Folheto do menisco"] },
  { prefix: "S83.2", nome: "Ruptura de menisco", opcoes: ["Avaliação cirúrgica (artroscopia)", "Folheto do menisco"] },
  { prefix: "S83.5", nome: "Lesão ligamentar (LCA/LCP)", opcoes: ["Reconstrução ligamentar (avaliar)", "Folheto do LCA"] },
  { prefix: "S83.0", nome: "Luxação da patela", opcoes: ["Reconstrução do MPFL (se recidivante)", "Folheto da patela"] },
];

function ofertasParaCids(cids: string[]): { prefix: string; nome: string; opcoes: string[] }[] {
  const found: Record<string, { prefix: string; nome: string; opcoes: string[] }> = {};
  for (const raw of cids) {
    const code = (raw.split("—")[0] || raw).trim().toUpperCase();
    // prefixos mais específicos primeiro (M72.2 antes de M72)
    const match = [...CID_OFERTAS]
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find(o => code.startsWith(o.prefix));
    if (match) found[match.prefix] = match;
  }
  return Object.keys(found).map(k => found[k]);
}

function DiagnosticosCids({ patientId, patient }: { patientId: number; patient: any }) {
  const [cids, setCids] = useState<string[]>(Array.isArray(patient?.cids) ? patient.cids : []);
  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ prefix: string; nome: string; opcoes: string[] } | null>(null);
  const [leaflets, setLeaflets] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCids(Array.isArray(patient?.cids) ? patient.cids : []);
  }, [patientId, patient?.cids]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenList(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Dispensados por paciente (localStorage, escopo do usuário): não insistir
  const dKey = `${userScope()}_ofertas_dispensadas_${patientId}`;
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(dKey) || "[]"); } catch { return []; }
  });
  const dispensar = (prefix: string) => {
    const next = [...dismissed, prefix];
    setDismissed(next);
    try { localStorage.setItem(dKey, JSON.stringify(next)); } catch {}
  };

  const persist = async (next: string[]) => {
    setCids(next);
    try {
      await patientsApi.update(patientId, { cids: next });
    } catch {
      toast.error("Erro ao salvar os CIDs");
    }
  };

  const addCid = (val: string) => {
    const v = val.trim();
    if (!v || cids.includes(v)) return;
    persist([...cids, v]);
    setQuery("");
    setOpenList(false);
  };

  const filtered = query.length >= 2
    ? ORTHO_CIDS.filter(
        c => !cids.some(x => x.startsWith(c.code)) && cidMatches(c, query)
      ).slice(0, 8)
    : [];

  const ofertas = ofertasParaCids(cids).filter(o => !dismissed.includes(o.prefix));

  const abrirPicker = async (o: { prefix: string; nome: string; opcoes: string[] }) => {
    setPickerFor(o);
    if (leaflets.length === 0) {
      try { setLeaflets(await leafletsApi.list()); } catch {}
    }
  };

  const linkFolheto = (leaflet: any) =>
    `${window.location.origin}/folheto-publico/${leaflet.id}?nome=${encodeURIComponent(patient?.name ?? "")}`;

  const enviarFolheto = async (leaflet: any | null) => {
    if (!pickerFor) return;
    if (!patient?.phone) { toast.error("Paciente sem telefone cadastrado"); return; }
    setSending(true);
    try {
      const treat = pickerFor.opcoes.join(" / ");
      const text = leaflet
        ? `Olá, {nome}! Aqui é do consultório do {doctor}. Na sua consulta conversamos sobre opções de tratamento (${treat}). O doutor separou este material informativo para você ler com calma:\n${linkFolheto(leaflet)}\n\nQualquer dúvida, é só responder por aqui.`
        : `Olá, {nome}! Aqui é do consultório do {doctor}. Na sua consulta conversamos sobre opções de tratamento (${treat}). Se quiser conversar melhor ou agendar uma avaliação, é só responder por aqui.`;
      await api.post("/whatsapp/send", { patient_id: patientId, message_type: "folheto", custom_text: text });
      toast.success("Enviado no WhatsApp do paciente ✓");
      setPickerFor(null);
    } catch (err: any) {
      toast.error(msgErro(err, "Erro ao enviar"));
    } finally {
      setSending(false);
    }
  };

  // Imprimir na hora e entregar em mãos — abre o folheto público (já com o
  // nome do paciente no cabeçalho) e chama a impressão (pedido Valth 02/08)
  const imprimirFolheto = (leaflet: any) => {
    const w = window.open(linkFolheto(leaflet), "_blank");
    if (!w) { toast.error("Pop-up bloqueado — libere pra imprimir"); return; }
    w.addEventListener("load", () => { try { w.print(); } catch {} });
    setPickerFor(null);
  };

  return (
    <div className="mb-4 space-y-2">
      {/* Campo fixo de CIDs */}
      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
          Diagnósticos (CID)
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {cids.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {c}
              <button
                onClick={() => persist(cids.filter((_, j) => j !== i))}
                className="text-blue-400 hover:text-red-500 font-bold"
                title="Remover"
              >
                ×
              </button>
            </span>
          ))}
          <div ref={boxRef} className="relative min-w-[180px] flex-1">
            <input
              className="w-full px-2 py-1 text-sm bg-transparent border-0 border-b border-dashed border-slate-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-100 placeholder-slate-400"
              placeholder="+ adicionar CID (ex.: M17, ombro, osteoporose…)"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpenList(true); }}
              onFocus={() => setOpenList(true)}
              onKeyDown={e => { if (e.key === "Enter" && query.trim()) addCid(query); }}
            />
            {openList && filtered.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filtered.map(c => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
                      onClick={() => addCid(`${c.code} — ${c.label}`)}
                    >
                      <span className="text-xs font-bold text-blue-600 w-12 flex-shrink-0">{c.code}</span>
                      <span className="text-xs text-slate-700 dark:text-slate-300">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Lembretes de oferta de alto valor por CID */}
      {ofertas.map(o => (
        <div key={o.prefix} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 border-l-4 border-l-amber-500 rounded-xl px-3 py-2.5">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
            💡 {o.nome} — opções de alto valor pra discutir:
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">{o.opcoes.join(" · ")}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button
              onClick={() => abrirPicker(o)}
              className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              📄 Enviar material ao paciente
            </button>
            <button
              onClick={() => dispensar(o.prefix)}
              className="px-3 py-1 rounded-full border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Já discutido / não indicado
            </button>
          </div>
        </div>
      ))}

      {/* Picker de folheto */}
      {pickerFor && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[80vh]">
            <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900 dark:text-slate-50 text-sm">Enviar material — {pickerFor.nome}</p>
                <p className="text-xs text-slate-400 mt-0.5">Vai no WhatsApp do paciente, individual</p>
              </div>
              <button onClick={() => setPickerFor(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {leaflets.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum folheto cadastrado ainda (Documentos → Folhetos).</p>
              )}
              {leaflets.map(l => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{l.title}</p>
                    <p className="text-xs text-slate-400">{l.category}</p>
                  </div>
                  <button
                    disabled={sending}
                    onClick={() => enviarFolheto(l)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                    title="Enviar no WhatsApp do paciente"
                  >
                    📱 WhatsApp
                  </button>
                  <button
                    disabled={sending}
                    onClick={() => imprimirFolheto(l)}
                    className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                    title="Imprimir com o nome do paciente e entregar em mãos"
                  >
                    🖨️ Imprimir
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                disabled={sending}
                onClick={() => enviarFolheto(null)}
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Enviar só a mensagem, sem folheto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Input style shared
const inp = "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
const lbl = "block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1";
const sectionTitle = "text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3";

// Medication row
interface Medication {
  id: string; name: string; dose: string; route: string; frequency: string; duration: string; instructions: string; quantity?: string;
}
const emptyMed = (): Medication => ({ id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now() + Math.random()), name: "", dose: "", route: "oral", frequency: "", duration: "", instructions: "", quantity: "" });

const FREQ_OPTIONS = ["1x/dia", "2x/dia (12/12h)", "3x/dia (8/8h)", "4x/dia (6/6h)", "1x/semana", "2x/semana", "1x/mês", "Dose única", "Se necessário (SN)", "Outro"];

function MedRowInline({ med, index, total, onChange, onRemove, allergyWarning, suggestions, onApplyPreset }: {
  med: Medication; index: number; total: number;
  onChange: (k: keyof Medication, v: string) => void;
  onRemove: () => void;
  allergyWarning?: { allergen: string; drug: string; group: string } | null;
  suggestions?: OrthoMedPreset[];
  onApplyPreset?: (p: OrthoMedPreset) => void;
}) {
  const [freqOther, setFreqOther] = useState(false);
  const knownFreq = FREQ_OPTIONS.includes(med.frequency);
  const showSuggestions = (suggestions?.length ?? 0) > 0;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Medicamento {index + 1}</span>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
            <Trash2 className="w-3 h-3" /> Remover
          </button>
        )}
      </div>
      {allergyWarning && (
        <div className="flex items-start gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded px-2 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700 dark:text-red-300 font-semibold">ATENÇÃO: paciente alérgico a {allergyWarning.allergen} — {allergyWarning.drug} pertence ao grupo {allergyWarning.group}. Confirme antes de prescrever.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 relative">
          <label className={lbl}>Nome *</label>
          <input className={inp} placeholder="Ex: Nimesulida 100mg" value={med.name} onChange={(e) => onChange("name", e.target.value)} />
          {showSuggestions && (
            <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {suggestions!.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex flex-col gap-0.5"
                    onClick={() => onApplyPreset?.(p)}
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{p.name}</span>
                    <span className="text-[10px] text-slate-500">{p.dose} · {p.frequency} · {p.duration}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className={lbl}>Dose</label>
          <input className={inp} placeholder="1 comprimido" value={med.dose} onChange={(e) => onChange("dose", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Via</label>
          <select className={inp} value={med.route} onChange={(e) => onChange("route", e.target.value)}>
            {ROUTE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Frequência</label>
          {(!freqOther && knownFreq) || !freqOther ? (
            <select
              className={inp}
              value={knownFreq ? med.frequency : "Outro"}
              onChange={(e) => {
                if (e.target.value === "Outro") { setFreqOther(true); onChange("frequency", ""); }
                else onChange("frequency", e.target.value);
              }}
            >
              <option value="">— selecionar —</option>
              {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (
            <div className="flex gap-1">
              <input className={inp} placeholder="Ex: de 8 em 8h" value={med.frequency} onChange={(e) => onChange("frequency", e.target.value)} />
              <button type="button" className="text-[10px] text-slate-400 hover:text-slate-600 whitespace-nowrap" onClick={() => setFreqOther(false)}>↩</button>
            </div>
          )}
        </div>
        <div>
          <label className={lbl}>Duração</label>
          <input className={inp} placeholder="7 dias..." value={med.duration} onChange={(e) => onChange("duration", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Qtd. total (QSP)</label>
          <input className={inp} placeholder="Ex: 10 comprimidos" value={med.quantity || ""} onChange={(e) => onChange("quantity", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Instruções</label>
          <input className={inp} placeholder="Tomar após as refeições..." value={med.instructions} onChange={(e) => onChange("instructions", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

// ── Tipos de Receita ──────────────────────────────────────────────────────────

type PrescriptionType = "simples" | "controle_especial" | "antimicrobiano" | "notificacao_ab";

// Alias de compatibilidade com valores antigos do banco
function normalizePrescriptionType(t: string): PrescriptionType {
  if (t === "especial_azul") return "controle_especial";
  if (t === "especial_amarelo") return "controle_especial";
  if (t === "simples" || t === "controle_especial" || t === "antimicrobiano" || t === "notificacao_ab") return t as PrescriptionType;
  return "simples";
}

const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  simples: "Simples (Branca)",
  controle_especial: "Controle Especial (RCE)",
  antimicrobiano: "Antimicrobiano (ATB)",
  notificacao_ab: "Notificação A/B (SESA)",
};

// Print prescription modal — 3 tipos que o médico pode imprimir + aviso para A/B
function PrintModal({ rx, patient, clinic, onClose, collectorId }: {
  rx: {
    date: string;
    medications: Medication[];
    instructions: string;
    prescription_type: PrescriptionType;
    patientAddress?: string;
    patientPhone?: string;
  };
  patient: any;
  clinic?: any;
  onClose: () => void;
  // M8: id único do documento no coletor de impressão em lote. Quando null,
  // o modal NÃO registra nada (ex.: reimpressão a partir do histórico), evitando
  // que uma receita antiga sobreponha/apague a receita gerada hoje.
  collectorId?: string | null;
}) {
  const type = normalizePrescriptionType(rx.prescription_type);
  const isRCE = type === "controle_especial";
  const isATB = type === "antimicrobiano";
  const vias = (isRCE || isATB) ? 2 : 1;
  const headerColor = isRCE ? "#5c3a00" : isATB ? "#003580" : "#0F2D5E";
  const viaLabels = (isRCE || isATB) ? ["1ª VIA — FARMÁCIA", "2ª VIA — PACIENTE"] : ["VIA ÚNICA"];

  const dateStr = (() => {
    const d = new Date(rx.date + "T12:00:00");
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  })();

  // Folha para RCE (Controle Especial — Portaria SVS/MS 344/98, Anexo XVII).
  // REFEITA 05/08 (erro E1 do Valth): faltavam os quadros obrigatórios de
  // IDENTIFICAÇÃO DO COMPRADOR e IDENTIFICAÇÃO DO FORNECEDOR (onde o
  // farmacêutico registra e assina), e a folha ocupava só um cantinho da A4.
  // Agora cada via ocupa uma página inteira: 1ª via Farmácia · 2ª via Paciente.
  const linhaVazia = (label: string, largura = "100%") => (
    <div style={{ width: largura, marginBottom: "9px" }}>
      <div style={{ borderBottom: "1px solid #555", height: "15px" }} />
      <p style={{ fontSize: "8px", color: "#555", textTransform: "uppercase", letterSpacing: "0.3px", margin: "2px 0 0 0" }}>{label}</p>
    </div>
  );

  const RCESheet = ({ viaLabel, viaIndex }: { viaLabel: string; viaIndex: number }) => (
    <div style={{
      background: "white",
      border: `2px solid ${headerColor}`,
      padding: "16px 18px",
      fontSize: "12px",
      color: "#111",
      minHeight: "252mm",            // ocupa a A4 inteira (E1)
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
    }}>
      {/* Faixa da via — exigência: dizeres em DESTAQUE em cada via */}
      <div style={{
        background: headerColor, color: "white", textAlign: "center",
        padding: "5px", fontWeight: 700, fontSize: "12px", letterSpacing: "1px",
        textTransform: "uppercase", marginBottom: "10px",
      }}>
        {viaLabel}
      </div>

      {/* 1 · IDENTIFICAÇÃO DO EMITENTE */}
      <div style={{ border: "1px solid #999", padding: "8px 10px", marginBottom: "8px" }}>
        <p style={{ fontWeight: 700, fontSize: "8.5px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px 0" }}>Identificação do Emitente</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 1px 0", color: headerColor }}>Dr. Valth Menezes Guimarães</p>
            <p style={{ fontSize: "10.5px", color: "#333", margin: "0" }}>Ortopedia e Traumatologia · {crmComTeot(clinic)}</p>
            <p style={{ fontSize: "10.5px", color: "#333", margin: "1px 0 0 0" }}>
              {clinic?.name ? `${clinic.name} — ` : ""}{clinic?.address || ""}{clinic?.city ? ` · ${clinic.city}/${clinic.state}` : ""}
            </p>
            {clinic?.phone && <p style={{ fontSize: "10.5px", color: "#333", margin: "1px 0 0 0" }}>Telefone: {clinic.phone}</p>}
          </div>
          <div style={{ textAlign: "right", minWidth: "120px" }}>
            <p style={{ fontWeight: 700, fontSize: "9px", color: headerColor, textTransform: "uppercase", margin: "0" }}>Receituário de</p>
            <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, textTransform: "uppercase", margin: "0" }}>Controle Especial</p>
            <p style={{ fontSize: "9px", color: "#666", margin: "3px 0 0 0" }}>Portaria SVS/MS 344/98</p>
          </div>
        </div>
      </div>

      {/* 2 · IDENTIFICAÇÃO DO PACIENTE */}
      <div style={{ border: "1px solid #999", padding: "8px 10px", marginBottom: "8px" }}>
        <p style={{ fontWeight: 700, fontSize: "8.5px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px 0" }}>Identificação do Paciente</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "4px 12px", fontSize: "11px" }}>
          <div><span style={{ color: "#666" }}>Nome: </span><span style={{ fontWeight: 600 }}>{patient?.name || "________________________"}</span></div>
          <div><span style={{ color: "#666" }}>Nasc.: </span><span>{patient?.birth_date ? new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR") : "____/____/______"}</span></div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ color: "#666" }}>Endereço: </span>
            <span>{rx.patientAddress || patient?.address_street || "____________________________________________________"}</span>
          </div>
          <div><span style={{ color: "#666" }}>Telefone: </span><span>{rx.patientPhone || patient?.phone || "________________"}</span></div>
          <div><span style={{ color: "#666" }}>CPF: </span><span style={{ fontFamily: "monospace" }}>{patient?.cpf || "________________"}</span></div>
        </div>
      </div>

      {/* 3 · PRESCRIÇÃO — área grande, ocupa o corpo da folha */}
      <div style={{ border: "1px solid #999", padding: "10px", marginBottom: "8px", flex: 1, minHeight: "90mm" }}>
        <p style={{ fontWeight: 700, fontSize: "8.5px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>Prescrição</p>
        {rx.medications.length > 0 ? (
          <>
            {rx.medications.map((m, i) => (
              <div key={i} style={{ marginBottom: "12px" }}>
                <p style={{ fontWeight: 700, margin: "0 0 2px 0", fontSize: "12.5px" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
                <p style={{ color: "#333", fontSize: "11px", margin: "0 0 1px 14px" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                {m.instructions && <p style={{ color: "#555", fontSize: "10.5px", fontStyle: "italic", margin: "0 0 0 14px" }}>{m.instructions}</p>}
              </div>
            ))}
            {rx.instructions && (
              <p style={{ color: "#333", fontSize: "11px", marginTop: "8px", fontStyle: "italic" }}>Orientações: {rx.instructions}</p>
            )}
          </>
        ) : (
          <p style={{ whiteSpace: "pre-wrap", fontSize: "12.5px", margin: "0", lineHeight: 1.7 }}>{rx.instructions}</p>
        )}
      </div>

      {/* Data / local + assinatura do prescritor.
          06/08: a linha "Cidade – UF, data" ficava CENTRADA logo acima da
          linha de assinatura, roubando o espaço do carimbo. Foi para a
          esquerda; a coluna da direita agora é só carimbo e assinatura. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "10px", gap: "16px" }}>
        <div style={{ textAlign: "left" }}>
          <p style={{ fontSize: "11px", color: "#333", margin: "0 0 4px 0" }}>
            {clinic?.city ? `${clinic.city} – ${clinic.state}` : "______________"}, {dateStr}
          </p>
          <p style={{ fontSize: "9.5px", color: "#666", margin: 0 }}>
            Validade: 30 dias a partir da emissão · Uso restrito conforme Portaria 344/98
          </p>
        </div>
        <div style={{ textAlign: "center", width: "230px", flexShrink: 0 }}>
          <div style={{ height: "34px" }} />
          <div style={{ borderTop: "1px solid #333", paddingTop: "3px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, margin: 0 }}>Dr. Valth Menezes Guimarães</p>
            <p style={{ fontSize: "9.5px", color: "#555", margin: 0 }}>{crmDaClinica(clinic)}</p>
            <p style={{ fontSize: "8.5px", color: "#999", margin: "1px 0 0 0", textTransform: "uppercase", letterSpacing: "0.3px" }}>Assinatura e carimbo</p>
          </div>
        </div>
      </div>

      {/* 4 e 5 · COMPRADOR e FORNECEDOR — quadros obrigatórios, lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div style={{ border: "1px solid #999", padding: "8px 10px" }}>
          <p style={{ fontWeight: 700, fontSize: "8.5px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>
            Identificação do Comprador
          </p>
          {linhaVazia("Nome completo")}
          {linhaVazia("Documento de identidade (nº / órgão emissor)")}
          {linhaVazia("Endereço completo")}
          {linhaVazia("Telefone")}
        </div>
        <div style={{ border: "1px solid #999", padding: "8px 10px" }}>
          <p style={{ fontWeight: 700, fontSize: "8.5px", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>
            Identificação do Fornecedor
          </p>
          {linhaVazia("Farmácia / Drogaria (nome e endereço)")}
          {linhaVazia("Responsável pela dispensação — nome e CRF")}
          {linhaVazia("Assinatura do farmacêutico")}
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1 }}>{linhaVazia("Data")}</div>
            <div style={{ flex: 1 }}>{linhaVazia("Nº do registro")}</div>
          </div>
        </div>
      </div>
    </div>
  );

  // Folha para ATB (RDC ANVISA 20/2011)
  const ATBSheet = ({ viaLabel, viaIndex }: { viaLabel: string; viaIndex: number }) => (
    <div style={{
      background: "white",
      border: `2px solid ${headerColor}`,
      borderRadius: "8px",
      padding: "18px",
      fontSize: "12px",
      color: "#111",
    }}>
      {/* Cabeçalho */}
      <div style={{ borderBottom: `2px solid ${headerColor}`, paddingBottom: "10px", marginBottom: "12px" }}>
        <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px 0", textAlign: "center" }}>
          Receita para Antimicrobianos — RDC ANVISA 20/2011
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "10px", color: "#555", textTransform: "uppercase", margin: "0 0 2px 0" }}>Prescritor</p>
            <p style={{ fontWeight: 700, fontSize: "14px", margin: "0 0 1px 0", color: headerColor }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>Especialidade: Ortopedia e Traumatologia</p>
            <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>{crmDaClinica(clinic)}</p>
            {clinic?.phone && <p style={{ fontSize: "10px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontWeight: 700, fontSize: "11px", color: headerColor, margin: "0" }}>{viaLabel}</p>
            <p style={{ fontSize: "10px", color: "#888", margin: "4px 0 0 0" }}>Data: {dateStr}</p>
          </div>
        </div>
      </div>

      {/* Dados do paciente */}
      <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "8px", marginBottom: "12px", fontSize: "10px" }}>
        <p style={{ fontWeight: 700, color: "#555", textTransform: "uppercase", fontSize: "9px", margin: "0 0 6px 0" }}>Identificação do Paciente</p>
        <p style={{ margin: "0 0 3px 0" }}><strong>Paciente:</strong> {patient?.name}</p>
        {patient?.cpf && <p style={{ margin: "0 0 3px 0" }}><strong>CPF:</strong> {patient.cpf}</p>}
        {rx.patientAddress && <p style={{ margin: "0 0 3px 0" }}><strong>Endereço:</strong> {rx.patientAddress}</p>}
        {rx.patientPhone && <p style={{ margin: "0" }}><strong>Telefone:</strong> {rx.patientPhone}</p>}
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: "12px", borderBottom: "1px solid #ddd", paddingBottom: "10px" }}>
        <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>Prescrição</p>
        {rx.medications.length > 0 ? (
          <>
            {rx.medications.map((m, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <p style={{ fontWeight: 600, margin: "0 0 1px 0" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
                <p style={{ color: "#555", fontSize: "10px", margin: "0 0 1px 0" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                {m.instructions && <p style={{ color: "#777", fontSize: "10px", fontStyle: "italic", margin: "0" }}>Obs: {m.instructions}</p>}
              </div>
            ))}
            {rx.instructions && (
              <p style={{ color: "#555", fontSize: "10px", marginTop: "6px", fontStyle: "italic" }}>Orientações: {rx.instructions}</p>
            )}
          </>
        ) : (
          <p style={{ whiteSpace: "pre-wrap", fontSize: "12px", margin: "0", lineHeight: 1.6 }}>{rx.instructions}</p>
        )}
      </div>

      {/* Assinatura */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <p style={{ fontSize: "9px", color: "#aaa", margin: "0" }}>Antibiótico de uso sob prescrição médica — RDC ANVISA 20/2011</p>
        <div style={{ textAlign: "center", width: "180px" }}>
          <div style={{ borderTop: `1px solid ${headerColor}`, paddingTop: "4px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, margin: "0" }}>Dr. Valth Guimarães</p>
            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>{crmDaClinica(clinic)}</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Folha para Receita Simples
  const SimplesSheet = () => (
    <div style={{
      background: "white",
      padding: "0",
      fontSize: "13px",
      color: "#1a1a1a",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      {/* 10/08: mesmo papel timbrado do laudo, a pedido do Valth. */}
      <TimbradoOficial clinic={clinic} />
      <p style={{ textAlign: "center", fontFamily: DOC_SERIF, fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#0F2D5E", margin: "0 0 16px" }}>
        Receita
      </p>

      {/* Dados do paciente */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px", fontSize: "12px" }}>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Paciente: </span><span style={{ fontWeight: 600 }}>{patient?.name}</span></div>
        <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Data: </span><span>{dateStr}</span></div>
        {patient?.cpf && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>CPF: </span><span style={{ fontFamily: "monospace" }}>{patient.cpf}</span></div>}
        {patient?.birth_date && <div><span style={{ fontWeight: 700, color: "#666", textTransform: "uppercase", fontSize: "10px" }}>Nasc.: </span><span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}</span></div>}
      </div>

      {/* Medicamentos */}
      <div style={{ marginBottom: "14px" }}>
        <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "10px", letterSpacing: "1px", borderBottom: "1px solid #ddd", paddingBottom: "4px", marginBottom: "10px" }}>Prescrição</p>
        {rx.medications.length > 0 ? (
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {rx.medications.map((m, i) => (
              <li key={i} style={{ marginBottom: "10px", paddingLeft: "4px" }}>
                <p style={{ fontWeight: 600, margin: "0 0 2px 0" }}>{i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}</p>
                <p style={{ color: "#555", fontSize: "11px", margin: "0 0 2px 0" }}>{[m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                {m.instructions && <p style={{ color: "#777", fontSize: "11px", fontStyle: "italic", margin: "0" }}>Obs: {m.instructions}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p style={{ whiteSpace: "pre-wrap", fontSize: "13px", margin: 0, lineHeight: 1.6 }}>{rx.instructions}</p>
        )}
      </div>

      {rx.medications.length > 0 && rx.instructions && (
        <div style={{ background: "#f8f8f8", borderRadius: "4px", padding: "10px", marginBottom: "14px" }}>
          <p style={{ fontWeight: 700, color: "#444", textTransform: "uppercase", fontSize: "10px", marginBottom: "4px" }}>Orientações</p>
          <p style={{ fontSize: "11px", color: "#555", margin: 0 }}>{rx.instructions}</p>
        </div>
      )}

      <p style={{ fontSize: "10px", color: "#999", margin: "10px 0 0", textAlign: "right" }}>Válido por 30 dias</p>
      <FechoOficial clinic={clinic} />
    </div>
  );

  const labelMap: Record<PrescriptionType, string> = {
    simples: "Receita Simples — 1 via",
    controle_especial: "Controle Especial (RCE) — 2 vias",
    antimicrobiano: "Antimicrobiano (ATB) — 2 vias",
    notificacao_ab: "Notificação A/B",
  };

  // Corpo das folhas (reutilizado no modal E no coletor de impressão final).
  const sheetsBody = (
    <>
      {type === "simples" && <SimplesSheet />}
      {type === "controle_especial" && viaLabels.map((label, idx) => (
        <div key={idx}>
          <div className={idx < vias - 1 ? "rx-via-break" : ""}>
            <RCESheet viaLabel={label} viaIndex={idx} />
          </div>
          {idx < vias - 1 && (
            <div className="rx-cut-line" style={{ textAlign: "center", color: "#aaa", fontSize: "10px", margin: "4px 0", letterSpacing: "2px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>
              ✂ recortar aqui
            </div>
          )}
        </div>
      ))}
      {type === "antimicrobiano" && viaLabels.map((label, idx) => (
        <div key={idx}>
          <div className={idx < vias - 1 ? "rx-via-break" : ""}>
            <ATBSheet viaLabel={label} viaIndex={idx} />
          </div>
          {idx < vias - 1 && (
            <div className="rx-cut-line" style={{ textAlign: "center", color: "#aaa", fontSize: "10px", margin: "4px 0", letterSpacing: "2px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>
              ✂ recortar aqui
            </div>
          )}
        </div>
      ))}
    </>
  );

  // Registra a receita no coletor da consulta (impressão final em lote).
  // M8: id ÚNICO por documento (collectorId incremental do TabReceita), para que
  // duas receitas do mesmo tipo não se sobreponham no coletor. collectorId null =
  // reimpressão do histórico → não registra (não polui/apaga o lote de hoje).
  useRegisterPrintDoc(collectorId ? { id: collectorId, label: `Receita — ${labelMap[type]}`, content: sheetsBody } : null);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          /* 06/08 — POR QUE MUDOU DE NOVO: imprimia só a 1ª via, e o rodapé
             da folha mostrava o começo da 2ª, que nunca saía. Causa: o papel
             ficava dentro do modal, que é "position: absolute" e "display:
             flex". Navegador não pagina caixa absoluta, e quebra de página é
             ignorada dentro de flex — então saía uma página só, cortada.
             Agora o papel vai para um portal FILHO DIRETO DO BODY, em fluxo
             normal: a quebra de página funciona e cada via sai inteira. */
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          /* Esconde tudo que NÃO é portal de impressão; depois só o portal
             desta janela volta a aparecer. Se o Centro de Impressão também
             estiver aberto, o portal dele continua com o display:none do
             inline — o pior caso vira papel a mais, nunca folha em branco. */
          body > *:not([data-print-portal]) { display: none !important; }
          #rx-print-portal { display: block !important; position: static !important; width: 100% !important; background: #fff !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .rx-via-break { page-break-after: always; break-after: page; margin-bottom: 0 !important; }
          .rx-cut-line { display: none !important; }
        }
        .rx-cut-line { display: none; }
      `}</style>
      {/* O papel de verdade — fora do modal, direto no body, para o navegador
          conseguir paginar. Invisível na tela; só existe para a impressora. */}
      {typeof document !== "undefined" && createPortal(
        <div id="rx-print-portal" data-print-portal style={{ display: "none" }}>{sheetsBody}</div>,
        document.body,
      )}

      <div id="print-rx-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Preview da Receita</h2>
            <p className="text-xs text-slate-500 mt-0.5">{labelMap[type]}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="rx-scroll flex-1 overflow-y-auto p-5 bg-white">
          {sheetsBody}
        </div>
      </div>
    </div>
  );
}

// ── Memed SDK Integration ───────────────────────────────────────────────────────
// SDK Memed Sinapse Prescricao v3.25
// JWT lido de data-token na <script> tag (autenticação automática no carregamento).
// Após o download do script principal, o SDK carrega MdHub + md-privacy de forma
// dinâmica — window.MdSinapsePrescricao só fica disponível depois disso (~2-5s).
// SecurityErrors no console = bug interno do SDK (cross-origin iframe), não-fatal.

declare global {
  interface Window {
    MdSinapsePrescricao?: {
      setToken: (jwt: string) => void;
      command: { send: (module: string, action: string, data?: any) => Promise<any> };
      event: { add: (event: string, cb: (data: any) => void) => void };
    };
  }
}

const MEMED_SDK_URL =
  "https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js";

// ── Singleton de módulo (fora do React) ────────────────────────────────────────
// Garante que o SDK é inicializado uma única vez por sessão do navegador,
// mesmo que o componente seja montado/desmontado várias vezes.
type SdkStatus = "idle" | "loading" | "ready" | "error";
let _sdkStatus: SdkStatus = "idle";
let _sdkActiveJwt: string | null = null;
let _sdkLoadPromise: Promise<void> | null = null;

function _isoToBR(iso: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return undefined;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function _fetchMemedToken(): Promise<string> {
  const API = process.env.NEXT_PUBLIC_API_URL || "https://ortho-clinic-ldcd.onrender.com";
  const bearerToken = typeof window !== "undefined" ? localStorage.getItem("ortho_token") : null;
  const res = await fetch(`${API}/memed/token`, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
  });
  if (!res.ok) throw new Error(`Memed /token retornou HTTP ${res.status}`);
  const data = await res.json();
  if (data.valid === false) {
    // Token com data desatualizada — falha imediata com mensagem clara ao usuário.
    // A correção definitiva é configurar MEMED_SECRET_KEY no Render (secret-key da
    // conta Memed), que faz o backend renovar o JWT automaticamente todo dia.
    throw new Error(`Memed não configurado: o token de acesso está expirado (${data.date}). Configure a MEMED_SECRET_KEY no Render (secret-key da sua conta Memed) para renovar automaticamente.`);
  }
  return data.token as string;
}

function _injectScript(jwt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MEMED_SDK_URL;
    script.type = "text/javascript";
    script.setAttribute("data-token", jwt); // autenticação automática no load

    script.onload = () => {
      // MdHub é carregado dinamicamente após o script principal — poll até 20s
      let ticks = 0;
      const timer = setInterval(() => {
        if (window.MdSinapsePrescricao) { clearInterval(timer); resolve(); return; }
        if (++ticks > 200) { clearInterval(timer); reject(new Error("Memed: MdHub não inicializou em 20s")); }
      }, 100);
    };

    script.onerror = () => reject(new Error("Memed: falha ao baixar SDK (verifique conexão)"));
    document.head.appendChild(script);
  });
}

async function _ensureSdkReady(jwt: string): Promise<void> {
  // Já pronto
  if (_sdkStatus === "ready" && window.MdSinapsePrescricao) return;

  // Já em carregamento — reutiliza a mesma promise
  if (_sdkStatus === "loading" && _sdkLoadPromise) {
    await _sdkLoadPromise;
    return;
  }

  _sdkStatus = "loading";
  _sdkActiveJwt = jwt;

  // Script já está no DOM (ex: segunda chamada após erro recuperado)
  const existingScript = document.querySelector(`script[src="${MEMED_SDK_URL}"]`);
  if (existingScript) {
    _sdkLoadPromise = new Promise<void>((resolve, reject) => {
      if (window.MdSinapsePrescricao) { resolve(); return; }
      let ticks = 0;
      const timer = setInterval(() => {
        if (window.MdSinapsePrescricao) { clearInterval(timer); resolve(); return; }
        if (++ticks > 200) { clearInterval(timer); reject(new Error("Memed: timeout aguardando MdHub")); }
      }, 100);
    });
  } else {
    _sdkLoadPromise = _injectScript(jwt);
  }

  try {
    await _sdkLoadPromise;
    _sdkStatus = "ready";
  } catch (err) {
    _sdkStatus = "error";
    _sdkLoadPromise = null; // permite retry na próxima chamada
    // Garante que iframes residuais do Memed não bloqueiem cliques na UI
    document.querySelectorAll<HTMLIFrameElement>('iframe[src*="memed.com.br"]').forEach((f) => {
      f.style.pointerEvents = "none";
    });
    throw err;
  }
}

async function openMemed(patient: any, _clinic: any): Promise<void> {
  // 1. JWT fresco do backend (env var MEMED_JWT no Render)
  const jwt = await _fetchMemedToken();

  // 2. Carrega e inicializa o SDK (idempotente)
  await _ensureSdkReady(jwt);

  const sdk = window.MdSinapsePrescricao!;

  // 3. Renova token se mudou desde a última abertura
  if (jwt !== _sdkActiveJwt) {
    try { sdk.setToken(jwt); } catch (_) {}
    _sdkActiveJwt = jwt;
  }

  // 4. Registra callbacks de ciclo de vida (SDK ignora duplicatas)
  try {
    sdk.event.add("prescricao:encerramento", () => toast.success("Prescrição finalizada no Memed!"));
    sdk.event.add("logout:token-invalido", () => toast.error("Sessão Memed expirada — recarregue a página."));
  } catch (_) {}

  // 5. Pré-preenche dados do paciente
  try {
    sdk.command.send("platform.patient-management", "setPatient", {
      nome:            patient?.full_name || patient?.name || "",
      // B3: o campo real do cadastro é `birthdate` (mantém fallbacks legados)
      data_nascimento: _isoToBR(patient?.birthdate || patient?.date_of_birth || patient?.birth_date || ""),
      telefone:        patient?.phone || undefined,
      cpf:             patient?.cpf   || undefined,
    });
  } catch (_) {}

  // 6. Abre o módulo de prescrição
  sdk.command.send("hub", "core:moduleShow", "plataforma.prescricao");
}

// ── Tab: Prontuário ────────────────────────────────────────────────────────────

const formatDateBR = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const formatDateBRFull = (dateStr: string) => {
  const d = new Date(dateStr + "T12:00:00");
  const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// Evolution type
interface Evolution {
  id: number;
  patient_id: number;
  entry_date: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

// SOAP/templates for prontuario
const PRONTUARIO_TEMPLATES = [
  { name: "SOAP", text: "QP: __\nHDA: __\nEF: __\nHD: __\nConduta: __" },
  { name: "Retorno", text: "Retorno - __\nEvolução: __\nEF atual: __\nConduta: __" },
  { name: "Pós-op", text: "POD: __\nFerida: __\nDor (0-10): __\nFisio: __\nRetorno em: __" },
  { name: "Urgência", text: "Chegou ao consultório com __\nMecanismo: __\nEF: __\nRX: __\nConduta: __" },
  { name: "EF Ortopédico", text: "Inspeção: __\nPalpação: __\nADM: Flexão __° / Extensão __° / RotInt __° / RotExt __°\nForça (MRC): __\nSensibilidade: __\nTestes: Lachman ( ) / McMurray ( ) / Neer ( ) / Hawkins ( )\nMarcha: __\n" },
  { name: "Pós-infiltração", text: "POD: __d da infiltração de __\nDor EVA antes: __ → após: __\nEfusão: __\nADM pós: __\nEfeitos adversos: __\nConduta: __\n" },
  { name: "Pós-op D__", text: "Procedimento: __\nPOD: __\nFerida operatória: __\nEdema: __\nDor EVA: __\nFisioterapia: __\nRestrições: __\nRetorno: __\n" },
];

function insertAtCursor(el: HTMLTextAreaElement, text: string): string {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.substring(0, start);
  const after = el.value.substring(end);
  return before + text + after;
}

function TabProntuario({ patientId, patient }: { patientId: number; patient?: any }) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [consultType, setConsultType] = useState("retorno");
  const [saving, setSaving] = useState(false);
  const [recentlySavedId, setRecentlySavedId] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(false);
  // Adendo modal state (immutable append instead of edit)
  const [adendoId, setAdendoId] = useState<number | null>(null);
  const [adendoText, setAdendoText] = useState("");
  const [adendoSaving, setAdendoSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adendoTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { todayBRFull, todayISO } = useMemo(() => {
    const d = new Date();
    return {
      todayISO: d.toISOString().split("T")[0],
      todayBRFull: formatDateBRFull(d.toISOString().split("T")[0]),
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setEvolutions([]);
    evolutionApi
      .list(patientId)
      .then((data) => setEvolutions(data as Evolution[]))
      .catch(() => toast.error("Erro ao carregar evoluções"))
      .finally(() => setLoading(false));
  }, [patientId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 400) + "px";
  }, [newText]);

  // Auto-resize adendo textarea
  useEffect(() => {
    const ta = adendoTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 500) + "px";
  }, [adendoText]);

  const handleSave = async () => {
    if (!newText.trim()) {
      toast.error("Digite a evolução antes de salvar");
      return;
    }
    setSaving(true);
    try {
      // Use fresh date at save time — avoids stale date if drawer was open past midnight
      const saveDateISO = new Date().toISOString().split("T")[0];
      const typePrefix = CONSULT_TYPES.find(c => c.value === consultType)?.label ?? "";
      const contentWithType = typePrefix ? `[${typePrefix.toUpperCase()}]\n${newText.trim()}` : newText.trim();
      const created = await evolutionApi.create(patientId, {
        entry_date: saveDateISO,
        content: contentWithType,
      });
      setEvolutions((prev) => [created as Evolution, ...prev]);
      setNewText("");
      setRecentlySavedId((created as Evolution).id);
      setTimeout(() => setRecentlySavedId(null), 2500);
      toast.success("Evolução registrada!");
    } catch (err: any) {
      toast.error(msgErro(err, "Erro ao salvar evolução"));
    } finally {
      setSaving(false);
    }
  };

  const handleAdendoSave = async (ev: Evolution) => {
    if (!adendoText.trim()) return;
    setAdendoSaving(true);
    const now = new Date();
    const dateTag = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()}`;
    const adendoContent = `${ev.content}\n\n--- ADENDO [${dateTag}] ---\n${adendoText.trim()}`;
    try {
      await evolutionApi.update(ev.id, { content: adendoContent });
      setEvolutions(prev => prev.map(e => e.id === ev.id ? { ...e, content: adendoContent } : e));
      setAdendoId(null);
      setAdendoText("");
      toast.success("Adendo registrado");
    } catch {
      toast.error("Erro ao salvar adendo — tente novamente");
      // keep adendoId open so user doesn't lose text
    } finally {
      setAdendoSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSave();
      return;
    }
    // Tab-stop: jump to next __ placeholder in the textarea
    if (e.key === "Tab") {
      const ta = textareaRef.current;
      if (!ta) return;
      const nextPos = ta.value.indexOf("__", ta.selectionEnd);
      if (nextPos >= 0) {
        e.preventDefault();
        ta.setSelectionRange(nextPos, nextPos + 2);
      }
      // else: default Tab behavior (move focus out)
    }
  };

  const insertTemplate = (templateText: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setNewText(prev => prev + templateText);
      return;
    }
    const updated = insertAtCursor(ta, templateText);
    setNewText(updated);
    setTimeout(() => {
      // Tab-stop: select first __ in the inserted text
      const firstUnderscore = updated.indexOf("__");
      if (firstUnderscore >= 0) {
        ta.setSelectionRange(firstUnderscore, firstUnderscore + 2);
      } else {
        const pos = ta.selectionStart + templateText.length;
        ta.setSelectionRange(pos, pos);
      }
      ta.focus();
    }, 0);
  };

  const filteredEvolutions = useMemo(() => {
    const sorted = [...evolutions].sort((a, b) => {
      const cmp = b.entry_date.localeCompare(a.entry_date) || (b.id - a.id);
      return sortAsc ? -cmp : cmp;
    });
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(ev =>
      ev.content.toLowerCase().includes(q) || ev.entry_date.includes(q)
    );
  }, [evolutions, searchQuery, sortAsc]);

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Diagnósticos fixos (CID) + lembretes de oferta (Valth 02/08) ── */}
      <div className="px-5 flex-shrink-0">
        <DiagnosticosCids patientId={patientId} patient={patient} />
      </div>

      {/* ── Adendo modal ── */}
      {adendoId !== null && (() => {
        const ev = evolutions.find(e => e.id === adendoId);
        if (!ev) return null;
        return (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
              <div className="px-5 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-50 text-sm">Acrescentar Adendo</p>
                  <p className="text-xs text-slate-400 mt-0.5">O registro original é preservado — o adendo é acrescentado abaixo</p>
                </div>
                <button onClick={() => { setAdendoId(null); setAdendoText(""); }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Registro original (somente leitura)</p>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700">
                    {ev.content}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Texto do adendo / correção *</p>
                  <textarea
                    ref={adendoTextareaRef}
                    autoFocus
                    className="w-full font-mono text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 border border-blue-300 dark:border-blue-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ minHeight: "120px", maxHeight: "500px" }}
                    placeholder="Descreva a correção ou complemento..."
                    value={adendoText}
                    onChange={e => setAdendoText(e.target.value)}
                  />
                </div>
              </div>
              <div className="px-4 pb-4 flex gap-2 justify-end flex-shrink-0">
                <button type="button" onClick={() => { setAdendoId(null); setAdendoText(""); }} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">Cancelar</button>
                <button
                  type="button"
                  onClick={() => handleAdendoSave(ev)}
                  disabled={adendoSaving || !adendoText.trim()}
                  className="px-4 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {adendoSaving ? "Salvando..." : "Salvar Adendo"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Histórico header ── */}
      {!loading && evolutions.length > 0 && (() => {
        const todayISO = new Date().toISOString().split("T")[0];
        const todayEv = evolutions.find(e => e.entry_date === todayISO);
        const todayTime = todayEv?.created_at
          ? new Date(todayEv.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : null;
        return (
          <div className="px-5 pt-2 pb-1 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-1.5">
            {/* Banner: evolução registrada hoje */}
            {todayEv && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg px-3 py-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <p className="text-[11px] text-green-700 dark:text-green-300 font-semibold">
                  Evolução registrada hoje{todayTime ? ` às ${todayTime}` : ""}
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {evolutions.length} evolução{evolutions.length !== 1 ? "ões" : ""} · {sortAsc ? "mais antigo primeiro" : "mais recente primeiro"}
              </span>
              <button
                type="button"
                onClick={() => setSortAsc(v => !v)}
                title={sortAsc ? "Mostrar mais recente primeiro" : "Mostrar mais antigo primeiro"}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Buscar no histórico de evoluções..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery.trim() && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                  {filteredEvolutions.length} de {evolutions.length}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Documento evolutivo (scrollável) ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-2 pb-2 min-h-0"
        style={{ maxHeight: "calc(100vh - 440px)", minHeight: "120px" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : evolutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">Sem evoluções registradas neste sistema</p>
            <p className="text-xs text-slate-400 text-center max-w-52">Se houver histórico anterior, registre um resumo como primeira entrada.</p>
            <button
              type="button"
              onClick={() => {
                setNewText("[RESUMO DE PRONTUÁRIO ANTERIOR]\nHistórico relevante: __\nCirurgias prévias: __\nExames anteriores: __\n");
                textareaRef.current?.focus();
              }}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              Importar resumo de prontuário anterior
            </button>
          </div>
        ) : filteredEvolutions.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Nenhuma evolução encontrada para "{searchQuery}"</p>
        ) : (
          <div className="space-y-3 py-1">
            {filteredEvolutions.map((ev) => {
              const isToday = ev.entry_date === new Date().toISOString().split("T")[0];
              return (
              <div
                key={ev.id}
                className={`border-l-4 ${isToday ? "border-green-500" : "border-blue-500"} bg-slate-50 dark:bg-slate-800 rounded-r-lg p-3 transition-all duration-1000 ${recentlySavedId === ev.id ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isToday ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}>{formatDateBRFull(ev.entry_date)}</span>
                    {isToday && <span className="text-[9px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full font-bold">HOJE</span>}
                    {ev.created_at && (
                      <span className="text-[10px] text-slate-400">
                        {new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Acrescentar adendo a esta evolução"
                    onClick={() => { setAdendoId(ev.id); setAdendoText(""); }}
                    className="p-1 text-slate-300 hover:text-blue-600 dark:text-slate-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">
                  {highlightText(ev.content, searchQuery)}
                </p>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Área de nova entrada (fixa no bottom) ── */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-5 pt-3 pb-4 bg-white dark:bg-slate-900">
        {/* Tipo de consulta + Templates rápidos */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <select
            value={consultType}
            onChange={e => setConsultType(e.target.value)}
            className="text-xs border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {CONSULT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {PRONTUARIO_TEMPLATES.map(tpl => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => insertTemplate(tpl.text)}
                className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Label com data de hoje */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{todayBRFull}</span>
          <span className="text-[11px] text-slate-400 ml-1">(hoje)</span>
        </div>

        <textarea
          ref={textareaRef}
          className="w-full font-mono text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ minHeight: "120px", maxHeight: "400px" }}
          placeholder="Queixa principal, história da doença, exame físico, hipótese diagnóstica e conduta..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-slate-400">Ctrl+Enter para salvar · {newText.length} caracteres</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !newText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-semibold text-sm"
          >
            {saving ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> Salvar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Receita ───────────────────────────────────────────────────────────────

const PRESCRIPTION_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  simples:           { label: "Simples",   cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  controle_especial: { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  antimicrobiano:    { label: "ATB 2 vias", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  notificacao_ab:    { label: "Notif. A/B", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  // aliases legados
  especial_azul:     { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  especial_amarelo:  { label: "RCE 2 vias", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const RX_TYPE_OPTIONS: { value: PrescriptionType; label: string; activeClass: string }[] = [
  { value: "simples",           label: "Simples (Branca)",          activeClass: "border-slate-600 bg-slate-600 text-white" },
  { value: "controle_especial", label: "Controle Especial (RCE)",   activeClass: "border-amber-600 bg-amber-600 text-white" },
  { value: "antimicrobiano",    label: "Antimicrobiano (ATB)",       activeClass: "border-blue-600 bg-blue-600 text-white" },
  { value: "notificacao_ab",    label: "Notificação A/B (SESA)",    activeClass: "border-red-600 bg-red-600 text-white" },
];

function TabReceita({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [rxType, setRxType] = useState<PrescriptionType>("simples");
  const [freeTextMode, setFreeTextMode] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [medications, setMedications] = useState<Medication[]>([emptyMed()]);
  const [instructions, setInstructions] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [printRx, setPrintRx] = useState<{
    date: string; medications: Medication[]; instructions: string;
    prescription_type: PrescriptionType; patientAddress?: string; patientPhone?: string;
  } | null>(null);
  // M8: id do documento a registrar no coletor de impressão em lote. Contador
  // incremental via useRef (NÃO Date.now(), que pode quebrar o build). Null quando
  // o preview vem do histórico (reimpressão) — aí não registra no coletor.
  const [printRxCollectorId, setPrintRxCollectorId] = useState<string | null>(null);
  const rxDocSeq = useRef(0);
  // S8: auto-resize do editor de texto livre da receita
  const freeTextRef = useRef<HTMLTextAreaElement>(null);

  // Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<number | null>(null);
  const [showAllRx, setShowAllRx] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  // Autocomplete suggestions keyed by med.id
  const [medSuggestions, setMedSuggestions] = useState<Record<string, OrthoMedPreset[]>>({});

  // Track patient id to avoid overwriting manually edited address on re-render
  const patientIdRef = useRef<number | null>(null);

  useEffect(() => {
    prescriptionsApi.list(patientId)
      .then(setPrescriptions)
      .catch(() => {})
      .finally(() => setLoadingRx(false));
    prescriptionTemplatesApi.list()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [patientId]);

  // Pré-preenche endereço e telefone do cadastro do paciente (somente ao trocar de paciente)
  useEffect(() => {
    if (!patient) return;
    if (patient.id !== patientIdRef.current) {
      const parts = [
        patient.address_street,
        patient.address_city,
        patient.address_state,
      ].filter(Boolean);
      setPatientAddress(parts.join(", "));
      setPatientPhone(patient.phone || "");
      patientIdRef.current = patient.id;
    }
  }, [patient]);

  // A14: rascunho da receita persistido no localStorage (por paciente + usuário),
  // igual ao padrão de Laudos/Encaminhamentos. Sem isto, trocar de aba desmonta a
  // TabReceita e o texto livre / medicamentos digitados se perdem.
  const rxDraftKey = `orthoclinic_rx_draft_${userScope()}_${patientId}`;

  // Restaura o rascunho ao montar
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(rxDraftKey);
      if (!saved) return;
      const p = JSON.parse(saved);
      if (p.rxType) setRxType(normalizePrescriptionType(p.rxType));
      if (typeof p.freeTextMode === "boolean") setFreeTextMode(p.freeTextMode);
      if (typeof p.freeText === "string") setFreeText(p.freeText);
      if (Array.isArray(p.medications) && p.medications.length) setMedications(p.medications);
      if (typeof p.instructions === "string") setInstructions(p.instructions);
      const hasContent = (typeof p.freeText === "string" && p.freeText.trim())
        || (Array.isArray(p.medications) && p.medications.some((m: any) => m?.name?.trim()));
      if (hasContent) toast.success("Rascunho de receita restaurado");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rxDraftKey]);

  // Autosave com debounce; grava só quando há conteúdo, limpa quando esvazia
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window === "undefined") return;
      const hasContent = freeText.trim() || medications.some((m) => m.name.trim()) || instructions.trim();
      if (hasContent) {
        localStorage.setItem(rxDraftKey, JSON.stringify({ rxType, freeTextMode, freeText, medications, instructions }));
      } else {
        localStorage.removeItem(rxDraftKey);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [rxType, freeTextMode, freeText, medications, instructions, rxDraftKey]);

  // S8: mantém a altura do editor de texto livre acompanhando o conteúdo
  useEffect(() => {
    if (!freeTextMode) return;
    const el = freeTextRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 220)}px`;
  }, [freeText, freeTextMode]);

  const updateMed = (id: string, k: keyof Medication, v: string) => {
    setMedications((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));
    // Trigger autocomplete suggestions when editing name
    if (k === "name") {
      if (v.trim().length >= 2) {
        const q = v.toLowerCase();
        const matches = ORTHO_MEDICATIONS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
        setMedSuggestions(prev => ({ ...prev, [id]: matches }));
      } else {
        setMedSuggestions(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    }
  };

  const applyPreset = (medId: string, preset: OrthoMedPreset) => {
    setMedications(ms => ms.map(m => m.id === medId ? {
      ...m, name: preset.name, dose: preset.dose, route: preset.route,
      frequency: preset.frequency, duration: preset.duration, instructions: preset.instructions,
    } : m));
    // Auto-select prescription type from preset
    if (preset.prescriptionType === "notificacao_ab" || preset.prescriptionType === "controle_especial" || preset.prescriptionType === "antimicrobiano") {
      setRxType(preset.prescriptionType);
    }
    setMedSuggestions(prev => { const n = { ...prev }; delete n[medId]; return n; });
  };

  const isNotificacaoAB = rxType === "notificacao_ab";
  const isATB = rxType === "antimicrobiano";
  const isRCE = rxType === "controle_especial";
  // A16: endereço e telefone são obrigatórios na receita de antimicrobiano (RDC 20/2011)
  const atbFieldsMissing = () => isATB && (!patientAddress.trim() || !patientPhone.trim());

  const handleSave = async () => {
    if (isNotificacaoAB) { toast.error("Notificação A/B não pode ser impressa pelo médico — use formulários SESA"); return; }
    // A16: bloqueia salvar ATB sem endereço/telefone obrigatórios (RDC 20/2011)
    if (atbFieldsMissing()) { toast.error("Antimicrobiano exige endereço e telefone do paciente (RDC 20/2011)"); return; }
    let validMeds: Medication[] = [];
    if (freeTextMode) {
      if (!freeText.trim()) { toast.error("Escreva o conteúdo da receita"); return; }
    } else {
      validMeds = medications.filter((m) => m.name.trim());
      if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento"); return; }
    }
    setSaving(true);
    try {
      const newRx = await prescriptionsApi.create(patientId, {
        date: new Date().toISOString().split("T")[0],
        prescription_type: rxType,
        medications: validMeds,
        instructions: freeTextMode ? freeText : instructions,
        // A16: persiste endereço/telefone (obrigatórios em ATB; úteis também na RCE).
        // CONTRATO BACKEND: o create passa a gravar patient_address/patient_phone.
        patient_address: patientAddress || undefined,
        patient_phone: patientPhone || undefined,
      });
      toast.success("Receita salva!");
      setPrescriptions((prev) => [newRx, ...prev]);
      setMedications([emptyMed()]);
      setInstructions("");
      setFreeText("");
      // A14: receita salva → limpa o rascunho persistido
      if (typeof window !== "undefined") localStorage.removeItem(rxDraftKey);
      // Restore patient defaults (not wipe them)
      if (patient) {
        const parts = [patient.address_street, patient.address_city, patient.address_state].filter(Boolean);
        setPatientAddress(parts.join(", "));
        setPatientPhone(patient.phone || "");
      }
    } catch {
      toast.error("Erro ao salvar receita");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (isNotificacaoAB) return;
    // A16: bloqueia imprimir ATB sem endereço/telefone obrigatórios (RDC 20/2011)
    if (atbFieldsMissing()) { toast.error("Antimicrobiano exige endereço e telefone do paciente (RDC 20/2011)"); return; }
    let validMeds: Medication[] = [];
    if (freeTextMode) {
      if (!freeText.trim()) { toast.error("Escreva o conteúdo da receita para imprimir"); return; }
    } else {
      validMeds = medications.filter((m) => m.name.trim());
      if (validMeds.length === 0) { toast.error("Adicione pelo menos um medicamento para imprimir"); return; }
    }
    // M8: id incremental por documento gerado hoje (registra no coletor de lote)
    rxDocSeq.current += 1;
    setPrintRxCollectorId(`receita-${rxDocSeq.current}`);
    setPrintRx({
      date: new Date().toISOString().split("T")[0],
      medications: validMeds,
      instructions: freeTextMode ? freeText : instructions,
      prescription_type: rxType,
      patientAddress: patientAddress || undefined,
      patientPhone: patientPhone || undefined,
    });
  };

  const handleLoadTemplate = (tmpl: any) => {
    setRxType(normalizePrescriptionType(tmpl.prescription_type || "simples"));
    const meds = tmpl.medications || [];
    // Modelo de TEXTO LIVRE = sem medicamentos estruturados, texto em instructions.
    if (meds.length === 0 && (tmpl.instructions || "").trim()) {
      setFreeTextMode(true);
      setFreeText(tmpl.instructions || "");
      setMedications([emptyMed()]);
      setInstructions("");
    } else {
      setFreeTextMode(false);
      setFreeText("");
      setMedications(meds.length ? meds : [emptyMed()]);
      setInstructions(tmpl.instructions || "");
    }
    setShowTemplateDropdown(false);
    toast.success(`Modelo "${tmpl.name}" carregado`);
  };

  const handleSaveTemplate = async () => {
    // Aceita salvar modelo tanto estruturado quanto de texto livre.
    let validMeds: Medication[] = [];
    if (freeTextMode) {
      if (!freeText.trim()) { toast.error("Escreva o texto da receita antes de salvar o modelo"); return; }
    } else {
      validMeds = medications.filter((m) => m.name.trim());
      if (validMeds.length === 0) { toast.error("Adicione medicamentos antes de salvar modelo"); return; }
    }
    if (!showSaveTemplateInput) { setShowSaveTemplateInput(true); setTemplateNameInput(""); return; }
    if (!templateNameInput.trim()) { toast.error("Informe um nome para o modelo"); return; }
    setSavingTemplate(true);
    try {
      const tmpl = await prescriptionTemplatesApi.create({
        name: templateNameInput.trim(),
        prescription_type: rxType,
        medications: validMeds,
        instructions: freeTextMode ? freeText : instructions,
      });
      setTemplates((prev) => [...prev, tmpl].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Modelo "${templateNameInput.trim()}" salvo!`);
      setShowSaveTemplateInput(false);
      setTemplateNameInput("");
    } catch {
      toast.error("Erro ao salvar modelo");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Monta o texto da receita (estruturada ou livre) para envio por WhatsApp.
  const buildRxText = (): string => {
    const header = `*Receita — ${patient?.name || ""}*`;
    if (freeTextMode) {
      return freeText.trim() ? `${header}\n\n${freeText.trim()}` : "";
    }
    const meds = medications.filter((m) => m.name.trim());
    if (meds.length === 0) return "";
    const lines = meds.map((m, i) => {
      const posologia = [m.route && `Via ${m.route}`, m.frequency, m.duration].filter(Boolean).join(" · ");
      let l = `${i + 1}. ${m.name}${m.dose ? ` — ${m.dose}` : ""}`;
      if (posologia) l += `\n   ${posologia}`;
      if (m.instructions) l += `\n   Obs: ${m.instructions}`;
      return l;
    });
    let txt = `${header}\n\n${lines.join("\n")}`;
    if (instructions.trim()) txt += `\n\n_Orientações:_ ${instructions.trim()}`;
    txt += `\n\n— Dr. Valth Guimarães`;
    return txt;
  };

  const handleSendWhatsApp = async () => {
    if (isNotificacaoAB) { toast.error("Notificação A/B não pode ser enviada por aqui"); return; }
    // A12: receita controlada (RCE / ATB) NÃO pode ir por WhatsApp — não tem
    // validade legal sem 2 vias físicas assinadas e expõe substância controlada.
    if (isRCE || isATB) {
      toast.error("Receita controlada (Controle Especial / Antimicrobiano) exige 2 vias físicas assinadas — não pode ser enviada por WhatsApp");
      return;
    }
    const text = buildRxText();
    if (!text) { toast.error("Preencha a receita antes de enviar"); return; }
    // P1: prioriza o telefone digitado na receita; cai para o do cadastro se vazio.
    // Obs.: o envio real usa patient_id (chatApi.sendWhatsApp) e o backend resolve o
    // número a partir do cadastro — este effectivePhone rege a validação/confirmação
    // exibida ao médico. Tipos com campo de telefone editável (RCE/ATB) já são
    // bloqueados acima, então na prática o número enviado = cadastro do paciente.
    const effectivePhone = patientPhone.trim() || patient?.phone;
    if (!effectivePhone) { toast.error("Paciente sem telefone cadastrado"); return; }
    if (typeof window !== "undefined" &&
        !window.confirm(`Enviar esta receita por WhatsApp para ${patient.name} (${effectivePhone})?\n\n${text}`)) {
      return;
    }
    setSendingWa(true);
    try {
      const res = await chatApi.sendWhatsApp(patientId, text);
      if (res.sent) toast.success(`Receita enviada por WhatsApp para ${(patient.name || "").split(" ")[0]}!`);
      else if (res.demo) toast("Modo demo: WhatsApp não configurado neste ambiente (não enviado de verdade)", { icon: "⚠️" });
      else toast.error("Falha ao enviar por WhatsApp");
    } catch {
      toast.error("Falha ao enviar por WhatsApp");
    } finally {
      setSendingWa(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    setConfirmDeleteTemplateId(null);
    try {
      await prescriptionTemplatesApi.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success("Modelo removido");
    } catch {
      toast.error("Erro ao remover modelo");
    }
  };

  return (
    <div className="space-y-4 px-5 pb-6">
      {printRx && <PrintModal rx={printRx} patient={patient} clinic={clinic} collectorId={printRxCollectorId} onClose={() => setPrintRx(null)} />}

      {/* ── Tipo de Receita ── */}
      <div>
        <p className={sectionTitle}>Tipo de Receita</p>
        <div className="flex gap-2 flex-wrap">
          {RX_TYPE_OPTIONS.map(({ value, label, activeClass }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRxType(value)}
              className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                rxType === value
                  ? activeClass
                  : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Toggle texto livre — vale pra Branca, Especial e ATB */}
        {!isNotificacaoAB && (
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={freeTextMode}
              onChange={(e) => setFreeTextMode(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            Escrever em texto livre (caixa em branco)
          </label>
        )}

        {/* Badges informativos por tipo */}
        {rxType === "controle_especial" && (
          <div className="mt-2 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">2 VIAS — Portaria SVS/MS 344/98 · Imprime 2 vias (farmácia + paciente)</p>
          </div>
        )}
        {rxType === "antimicrobiano" && (
          <div className="mt-2 flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">2 VIAS — RDC ANVISA 20/2011 · Campos obrigatórios: endereço e telefone do paciente</p>
          </div>
        )}
      </div>

      {/* ── Box informativo Notificação A/B ── */}
      {isNotificacaoAB && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Notificação de Receita A e B</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Formulários <strong>pré-numerados emitidos pela SESA estadual</strong> (Secretaria Estadual de Saúde).
            O médico <strong>NÃO pode imprimir</strong> esses formulários — eles têm numeração controlada pelo governo.
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Solicite os talonários na <strong>Secretaria Estadual de Saúde da Paraíba (SES-PB)</strong> ou
            da <strong>Secretaria Estadual de Saúde de Pernambuco (SES-PE)</strong>.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            Exemplos: morfina, codeína, tramadol em altas doses, metilfenidato, anfetaminas.
          </p>
        </div>
      )}

      {/* ── Banner de Alergias — sempre visível independente do tipo de receita ── */}
      <AllergyBanner patient={patient} />

      {/* ── Conteúdo do formulário (oculto para Notificação A/B) ── */}
      {!isNotificacaoAB && (
        <>
          {/* ── Modelos + Memed ── */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setShowTemplateDropdown((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
              >
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Carregar Modelo
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showTemplateDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                  {loadingTemplates ? (
                    <p className="text-xs text-slate-400 p-3 text-center">Carregando...</p>
                  ) : templates.length === 0 ? (
                    <p className="text-xs text-slate-400 p-3 text-center">Nenhum modelo salvo</p>
                  ) : (
                    <ul className="max-h-48 overflow-y-auto">
                      {templates.map((tmpl) => (
                        <li key={tmpl.id} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                          {confirmDeleteTemplateId === tmpl.id ? (
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span className="text-xs text-red-600 flex-1">Remover "{tmpl.name}"?</span>
                              <button type="button" onClick={() => handleDeleteTemplate(tmpl.id)} className="text-[11px] px-2 py-0.5 bg-red-500 text-white rounded">Sim</button>
                              <button type="button" onClick={() => setConfirmDeleteTemplateId(null)} className="text-[11px] px-2 py-0.5 border border-slate-300 rounded text-slate-600">Não</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                className="flex-1 text-left px-3 py-2"
                                onClick={() => handleLoadTemplate(tmpl)}
                              >
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{tmpl.name}</p>
                                {/* S6: modelo de texto livre (sem medicamentos) é rotulado como "Texto livre" */}
                                <p className="text-[10px] text-slate-400">{PRESCRIPTION_TYPE_LABELS[normalizePrescriptionType(tmpl.prescription_type)] || tmpl.prescription_type} · {(tmpl.medications?.length || 0) === 0 && (tmpl.instructions || "").trim() ? "Texto livre" : `${tmpl.medications?.length || 0} med.`}</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTemplateId(tmpl.id)}
                                className="p-2 text-red-400 hover:text-red-600 flex-shrink-0"
                                title="Remover modelo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {/*
              Botão "Abrir Memed" — paliativo: abre o site do Memed numa aba nova
              (login de médico do Valth), síncrono no clique (sem popup blocker).
              QUANDO as credenciais de integração (api-key/secret-key de parceiro)
              estiverem no Render, trocar o onClick de volta por
              `openMemed(patient, clinic)` pra abrir EMBUTIDO com o paciente já
              preenchido. A função openMemed e o SDK continuam prontos abaixo.
            */}
            <button
              type="button"
              onClick={() => window.open("https://memed.com.br/login", "_blank", "noopener,noreferrer")}
              title="Abre o login do Memed numa nova aba para você prescrever com seu login de médico"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
            >
              <Pill className="w-3.5 h-3.5" />
              Abrir Memed
            </button>
          </div>

          {/* ── Campos extras ATB/RCE: endereço e telefone do paciente ──
              A11: a RCE (Controle Especial) também exige endereço do paciente
              (Portaria SVS/MS 344/98), não só o ATB (RDC 20/2011). */}
          {(isRCE || isATB) && (
            <div className="space-y-2 border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/40 dark:bg-blue-900/10">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                {isATB ? "Dados obrigatórios do paciente (RDC 20/2011)" : "Dados do paciente (Portaria SVS/MS 344/98)"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className={lbl}>Endereço do paciente *</label>
                  <input className={inp} placeholder="Rua, nº, bairro, cidade/UF" value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Telefone do paciente{isATB ? " *" : ""}</label>
                  <input className={inp} placeholder="(83) 9xxxx-xxxx" value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Medicamentos ── */}
          <div className="space-y-3">
            {freeTextMode ? (
              <div>
                <label className={lbl}>Conteúdo da receita (texto livre)</label>
                {/* S8: auto-resize + fonte alinhada à impressão (sem font-mono, que
                    não bate com a fonte proporcional das folhas de receita) */}
                <textarea
                  ref={freeTextRef}
                  className={inp + " min-h-[220px] resize-none"}
                  placeholder={"Escreva a receita à mão livre. Ex:\n\n1. Nimesulida 100mg — 1 cp de 12/12h por 5 dias\n2. Omeprazol 20mg — 1 cp em jejum por 30 dias\n\nOrientações: repouso relativo, retorno em 7 dias."}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  rows={12}
                />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className={sectionTitle + " mb-0"}>Medicamentos</p>
                  <button
                    type="button"
                    onClick={() => setMedications((ms) => [...ms, emptyMed()])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>

                {medications.map((med, i) => (
                  <MedRowInline
                    key={med.id}
                    med={med}
                    index={i}
                    total={medications.length}
                    onChange={(k, v) => updateMed(med.id, k, v)}
                    onRemove={() => setMedications((ms) => ms.filter((m) => m.id !== med.id))}
                    allergyWarning={checkDrugAllergyAlert(med.name, (patient?.allergies || ""))}
                    suggestions={medSuggestions[med.id] || []}
                    onApplyPreset={(p) => applyPreset(med.id, p)}
                  />
                ))}

                <div>
                  <label className={lbl}>Orientações gerais</label>
                  <textarea className={inp + " min-h-[70px] resize-none"} placeholder="Evitar álcool, repouso, retorno em 7 dias..." value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {/* ── Inline save template input ── */}
            {showSaveTemplateInput && (
              <div className="flex gap-2 items-center p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <input
                  autoFocus
                  className={inp + " flex-1"}
                  placeholder="Nome do modelo..."
                  value={templateNameInput}
                  onChange={e => setTemplateNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowSaveTemplateInput(false); }}
                />
                <button type="button" onClick={handleSaveTemplate} disabled={savingTemplate} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">Confirmar</button>
                <button type="button" onClick={() => setShowSaveTemplateInput(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600">Cancelar</button>
              </div>
            )}

            {/* ── Ações ── */}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold disabled:opacity-50"
                title={freeTextMode ? "Salva este texto livre como modelo reutilizável" : "Salva os medicamentos como modelo reutilizável"}
              >
                <Save className="w-3.5 h-3.5" /> Salvar Modelo
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
                title="Imprimir sem salvar"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={sendingWa || !patient?.phone}
                title={!patient?.phone ? "Paciente sem telefone cadastrado" : "Envia a receita pelo WhatsApp do paciente"}
                className="flex items-center gap-1.5 px-3 py-2 border border-green-500 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sendingWa ? (
                  <><div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> Enviando...</>
                ) : (
                  <><MessageSquare className="w-3.5 h-3.5" /> Enviar WhatsApp</>
                )}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 text-sm"
              >
                {saving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Salvar Receita</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Histórico ── */}
      {loadingRx ? (
        <div className="space-y-2 px-0 pt-2">
          <p className={sectionTitle}>Receitas anteriores</p>
          {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="flex items-center gap-2 py-2">
          <Pill className="w-4 h-4 text-slate-300" />
          <p className="text-xs text-slate-400 italic">Nenhuma receita anterior registrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={sectionTitle + " mb-0"}>Receitas anteriores</p>
            {prescriptions.length > 5 && (
              <button type="button" onClick={() => setShowAllRx(v => !v)} className="text-xs text-blue-600 hover:underline">
                {showAllRx ? "Mostrar menos" : `Ver todas (${prescriptions.length})`}
              </button>
            )}
          </div>
          {(showAllRx ? prescriptions : prescriptions.slice(0, 5)).map((rx) => {
            const badge = PRESCRIPTION_TYPE_BADGE[rx.prescription_type] || PRESCRIPTION_TYPE_BADGE["simples"];
            return (
              <div key={rx.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(rx.date)}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setRxType(normalizePrescriptionType(rx.prescription_type || "simples"));
                        const meds = rx.medications?.length ? rx.medications.map((m: any) => ({ ...emptyMed(), ...m })) : [];
                        // A15: receita de texto livre (sem medicamentos, texto em
                        // instructions) deve voltar em modo texto livre — senão cai
                        // no modo estruturado quebrado. Espelha handleLoadTemplate.
                        if (meds.length === 0 && (rx.instructions || "").trim()) {
                          setFreeTextMode(true);
                          setFreeText(rx.instructions || "");
                          setMedications([emptyMed()]);
                          setInstructions("");
                        } else {
                          setFreeTextMode(false);
                          setFreeText("");
                          setMedications(meds.length ? meds : [emptyMed()]);
                          setInstructions(rx.instructions || "");
                        }
                        // A16: reidrata endereço/telefone salvos na receita, se houver
                        if (rx.patient_address) setPatientAddress(rx.patient_address);
                        if (rx.patient_phone) setPatientPhone(rx.patient_phone);
                        toast.success("Receita carregada para edição");
                      }}
                      className="p-1 text-slate-400 hover:text-green-600"
                      title="Repetir esta receita"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        // M8: reimpressão do histórico NÃO registra no coletor de lote
                        setPrintRxCollectorId(null);
                        setPrintRx({
                          date: rx.date,
                          medications: rx.medications || [],
                          instructions: rx.instructions || "",
                          prescription_type: normalizePrescriptionType(rx.prescription_type || "simples"),
                          // A16: reidrata endereço/telefone salvos p/ reimpressão fiel
                          patientAddress: rx.patient_address || undefined,
                          patientPhone: rx.patient_phone || undefined,
                        });
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Imprimir"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {(rx.medications?.length || 0) === 0 && (rx.instructions || "").trim() ? (
                    // S6: receita de texto livre — mostra trecho das instruções
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic line-clamp-2">{rx.instructions}</p>
                  ) : (
                    <>
                      {rx.medications?.slice(0, 3).map((m: any, i: number) => (
                        <p key={i} className="text-xs text-slate-600 dark:text-slate-400">
                          {i + 1}. {m.name}{m.dose ? ` — ${m.dose}` : ""}{m.frequency ? ` · ${m.frequency}` : ""}{m.duration ? ` · ${m.duration}` : ""}
                        </p>
                      ))}
                      {(rx.medications?.length || 0) > 3 && (
                        <p className="text-xs text-slate-400">+{rx.medications.length - 3} mais...</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Exames ────────────────────────────────────────────────────────────────

// Modal de impressão de pedido de exame
function PrintExamModal({ text, patientName, patient, clinic, onClose, fontSize = 14, lineHeight = "normal" }: {
  text: string;
  patientName: string;
  patient?: any;
  clinic?: any;
  onClose: () => void;
  fontSize?: 12 | 14 | 16;
  lineHeight?: "normal" | "relaxed";
}) {
  const nasc = patient?.birth_date || patient?.birthdate || patient?.date_of_birth || null;
  const cids: string[] = Array.isArray(patient?.cids) ? patient.cids.filter(Boolean) : [];

  // A folha de verdade — vai por portal no body para o navegador paginar.
  // Dentro do modal (absolute + flex) a folha herdava a altura do app inteiro
  // e saía uma SEGUNDA página em branco (reclamação do Valth em 10/08).
  const folha = (
    <div style={{ background: "#fff", padding: "0", fontFamily: "Arial, Helvetica, sans-serif", color: "#1a1a1a" }}>
      <TimbradoOficial clinic={clinic} />

      <p style={{ textAlign: "center", fontFamily: DOC_SERIF, fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#0F2D5E", margin: "0 0 16px" }}>
        Solicitação de exames
      </p>

      <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "9px 12px", marginBottom: "16px", fontSize: "12px", lineHeight: 1.7 }}>
        <div><span style={{ color: "#666" }}>Paciente: </span><strong>{patientName}</strong></div>
        <div>
          {nasc && <><span style={{ color: "#666" }}>Nascimento: </span>{new Date(nasc + "T12:00:00").toLocaleDateString("pt-BR")}{"  ·  "}</>}
          {patient?.insurance && <><span style={{ color: "#666" }}>Convênio: </span>{patient.insurance}</>}
        </div>
      </div>

      <div style={{ minHeight: "150px", whiteSpace: "pre-wrap", lineHeight: lineHeight === "relaxed" ? 1.9 : 1.6, fontSize: `${fontSize}px`, marginBottom: "8px" }}>
        {text}
      </div>

      {cids.length > 0 && (
        <p style={{ fontSize: "11.5px", color: "#444", margin: "14px 0 0" }}>
          <span style={{ color: "#666" }}>Indicação clínica (CID): </span>{cids.join(" · ")}
        </p>
      )}

      <div style={{ borderTop: "1px dashed #ddd", paddingTop: "10px", marginTop: "12px", fontSize: "10.5px", color: "#777" }}>
        Trazer os exames na consulta de retorno.
      </div>

      <FechoOficial clinic={clinic} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          /* 10/08 — saíam DUAS folhas: a interface era escondida por
             visibility, que apaga mas MANTÉM o espaço, então o papel herdava
             a altura do app inteiro e sobrava uma página em branco. Agora o
             papel sai por um portal filho direto do body, em fluxo normal. */
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > *:not([data-print-portal]) { display: none !important; }
          #exam-print-portal { display: block !important; position: static !important; width: 100% !important; background: #fff !important; }
          @page { size: A4 portrait; margin: 14mm 15mm; }
        }
      `}</style>
      {typeof document !== "undefined" && createPortal(
        <div id="exam-print-portal" data-print-portal style={{ display: "none" }}>{folha}</div>,
        document.body,
      )}
      <div id="print-exam-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Preview — Pedido de Exame</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* A tela mostra exatamente a mesma folha que vai para a impressora. */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {folha}
        </div>
      </div>
    </div>
  );
}

function TabExames({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [freeText, setFreeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [exams, setExams] = useState<any[]>([]);
  const [loadingEx, setLoadingEx] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const [showAllExams, setShowAllExams] = useState(false);

  // Modelos de solicitação
  const [examTemplates, setExamTemplates] = useState<ExamTemplate[]>(() => loadExamTemplates());
  const [confirmDeleteExamTemplateId, setConfirmDeleteExamTemplateId] = useState<string | null>(null);

  // Controle de fonte
  const [fontSize, setFontSize] = useState<12 | 14 | 16>(() => loadExamFontSize());
  const [lineHeight, setLineHeight] = useState<"normal" | "relaxed">(() => loadExamLineHeight());

  // Impressão
  const [printText, setPrintText] = useState<string | null>(null);

  // Justificativa clínica (11/08): o convênio exige um relatório à parte para
  // autorizar imagem. A IA escreve a partir da anamnese; sem anamnese, cai num
  // modelo. Sai em FOLHA SEPARADA, e só quando ele clica.
  const [gerandoJustif, setGerandoJustif] = useState(false);
  const [justifTexto, setJustifTexto] = useState<string | null>(null);
  const [justifOrigem, setJustifOrigem] = useState<string>("");

  const gerarJustificativa = async () => {
    if (!freeText.trim()) { toast.error("Escreva o pedido de exame antes"); return; }
    setGerandoJustif(true);
    try {
      const r = await examsApi.justificativa(patientId, freeText);
      setJustifTexto(r.texto);
      setJustifOrigem(r.origem);
      if (r.aviso) toast(r.aviso, { icon: "⚠️", duration: 7000 });
    } catch (err: any) {
      toast.error(msgErro(err, "Não consegui gerar a justificativa"));
    } finally {
      setGerandoJustif(false);
    }
  };

  // Inline save template
  const [showSaveExamTemplateInput, setShowSaveExamTemplateInput] = useState(false);
  const [examTemplateNameInput, setExamTemplateNameInput] = useState("");

  // Expanded history card
  const [expandedExamId, setExpandedExamId] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchExams = useCallback(() => {
    setLoadingEx(true);
    setLoadingError(false);
    setExams([]);
    examsApi.list(patientId)
      .then(setExams)
      .catch(() => { setLoadingError(true); toast.error("Erro ao carregar histórico de exames"); })
      .finally(() => setLoadingEx(false));
  }, [patientId]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // Auto-resize textarea
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  };

  // Modelos
  const handleSaveTemplate = () => {
    if (!freeText.trim()) return;
    if (!showSaveExamTemplateInput) { setShowSaveExamTemplateInput(true); setExamTemplateNameInput(""); return; }
    if (!examTemplateNameInput.trim()) { toast.error("Informe um nome para o modelo"); return; }
    const newTemplate: ExamTemplate = { id: String(Date.now()), name: examTemplateNameInput.trim(), content: freeText };
    const updated = [...examTemplates, newTemplate];
    setExamTemplates(updated);
    saveExamTemplates(updated);
    toast.success("Modelo salvo");
    setShowSaveExamTemplateInput(false);
    setExamTemplateNameInput("");
  };

  const handleLoadTemplate = (id: string) => {
    const tpl = examTemplates.find((t) => t.id === id);
    if (!tpl) return;
    if (freeText.trim() && freeText !== tpl.content) {
      if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
    }
    setFreeText(tpl.content);
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
  };

  const handleDeleteTemplate = (id: string) => {
    setConfirmDeleteExamTemplateId(null);
    const updated = examTemplates.filter((t) => t.id !== id);
    setExamTemplates(updated);
    saveExamTemplates(updated);
    toast.success("Modelo removido");
  };

  // Fonte
  const handleFontSize = (size: 12 | 14 | 16) => {
    setFontSize(size);
    if (typeof window !== "undefined") localStorage.setItem(LS_EXAM_FONT_SIZE_KEY, String(size));
  };

  const handleLineHeight = (lh: "normal" | "relaxed") => {
    setLineHeight(lh);
    if (typeof window !== "undefined") localStorage.setItem(LS_EXAM_LINE_HEIGHT_KEY, lh);
  };

  // Salvar
  const handleSave = async () => {
    if (!freeText.trim()) { toast.error("Digite a solicitação antes de salvar"); return; }
    setSaving(true);
    try {
      const newEx = await examsApi.create(patientId, {
        date: new Date().toISOString().split("T")[0],
        exams: [],
        free_text: freeText.trim(),
      });
      const patientName = patient?.name || "Paciente";
      toast.success(`Solicitação salva para ${patientName}`);
      setExams((prev) => [newEx, ...prev]);
      setFreeText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      toast.error("Erro ao salvar solicitação");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
  };

  // Preview de texto para histórico — extrai SOLICITO e HD
  const examPreview = (ex: any): string => {
    if (ex.free_text) {
      const lines = ex.free_text.split("\n");
      const solicito = lines.find((l: string) => l.startsWith("SOLICITO:"))?.slice(9).trim() ?? "";
      const hd = lines.find((l: string) => l.startsWith("HD:"))?.slice(3).trim() ?? "";
      return [solicito.slice(0, 50), hd.slice(0, 30)].filter(Boolean).join(" · ") || ex.free_text.slice(0, 60);
    }
    if (ex.exams?.length) return ex.exams.map((e: any) => e.name).join(", ").slice(0, 80);
    return "—";
  };

  const daysAgo = (dateStr: string): string => {
    const diff = Math.floor((Date.now() - new Date(dateStr + "T12:00:00").getTime()) / 86400000);
    if (diff === 0) return "hoje";
    if (diff === 1) return "ontem";
    if (diff < 30) return `há ${diff} dias`;
    if (diff < 365) return `há ${Math.floor(diff / 30)} meses`;
    return `há ${Math.floor(diff / 365)} anos`;
  };

  const patientName = patient?.name || "Paciente";

  return (
    <div className="space-y-0 pb-6">
      {printText !== null && (
        <PrintExamModal text={printText} patientName={patientName} patient={patient} clinic={clinic} onClose={() => setPrintText(null)} fontSize={fontSize} lineHeight={lineHeight} />
      )}

      {/* Justificativa clínica — FOLHA SEPARADA, revisável antes de imprimir. */}
      {justifTexto !== null && (
        <PrintDocModal
          title="Justificativa clínica"
          onClose={() => setJustifTexto(null)}
          extraHeader={
            <div className="no-print px-5 pb-3 border-b border-slate-200 dark:border-slate-700">
              <p className="text-[11px] text-slate-500 mb-1">
                {justifOrigem === "ia"
                  ? "Escrita a partir da anamnese deste paciente — leia e ajuste antes de imprimir."
                  : "Modelo padrão (sem anamnese registrada) — ajuste antes de imprimir."}
              </p>
              <textarea
                value={justifTexto}
                onChange={(e) => setJustifTexto(e.target.value)}
                rows={7}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-50 text-xs"
              />
            </div>
          }
          content={
            <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1a1a1a", fontSize: "13px" }}>
              <TimbradoOficial clinic={clinic} />
              <p style={{ textAlign: "center", fontFamily: DOC_SERIF, fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#0F2D5E", margin: "0 0 16px" }}>
                Justificativa clínica
              </p>
              <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "9px 12px", marginBottom: "16px", fontSize: "12px", lineHeight: 1.7 }}>
                <div><span style={{ color: "#666" }}>Paciente: </span><strong>{patient?.name}</strong></div>
                <div>
                  {patient?.birth_date && <><span style={{ color: "#666" }}>Nascimento: </span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}{"  ·  "}</>}
                  {patient?.insurance && <><span style={{ color: "#666" }}>Convênio: </span>{patient.insurance}</>}
                </div>
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: "13px", minHeight: "150px", textAlign: "justify" }}>
                {justifTexto}
              </div>
              <FechoOficial clinic={clinic} />
            </div>
          }
        />
      )}

      {/* ── Seção: Modelos ── */}
      <div className="px-5 pt-1 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className={sectionTitle + " mb-2"}>Modelos Rápidos</p>
        {/* Built-in quick templates */}
        <div className="flex flex-wrap gap-1 mb-2">
          {EXAM_QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => {
                if (freeText.trim() && freeText !== tpl.content) {
                  if (!window.confirm("Substituir o texto atual pelo modelo?")) return;
                }
                setFreeText(tpl.content);
                setTimeout(autoResize, 0);
                textareaRef.current?.focus();
              }}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-semibold"
            >
              {tpl.name}
            </button>
          ))}
        </div>
        {/* User saved templates */}
        {examTemplates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {examTemplates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-0.5">
                {confirmDeleteExamTemplateId === tpl.id ? (
                  <div className="flex items-center gap-1 border border-red-300 rounded px-2 py-0.5">
                    <span className="text-[10px] text-red-600">Remover "{tpl.name}"?</span>
                    <button type="button" onClick={() => handleDeleteTemplate(tpl.id)} className="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded">Sim</button>
                    <button type="button" onClick={() => setConfirmDeleteExamTemplateId(null)} className="text-[10px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-600">Não</button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplate(tpl.id)}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-l border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title={tpl.content.slice(0, 120)}
                    >
                      {tpl.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteExamTemplateId(tpl.id)}
                      className="text-[10px] px-1 py-0.5 rounded-r border border-l-0 border-slate-300 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Excluir modelo"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Seção: Solicitação ── */}
      <div className="px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className={sectionTitle}>Solicitação</p>

        {/* Controles de impressão */}
        <div className="flex items-center justify-end gap-3 mb-1.5">
          <span className="text-[10px] text-slate-400">Impressão:</span>
          <div className="flex items-center gap-1">
            {([12, 14, 16] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => handleFontSize(sz)}
                className={`px-2 py-0.5 text-[10px] border rounded transition-colors ${
                  fontSize === sz
                    ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
                    : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {sz === 12 ? "P" : sz === 14 ? "M" : "G"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(["normal", "relaxed"] as const).map((lh) => (
              <button
                key={lh}
                type="button"
                onClick={() => handleLineHeight(lh)}
                className={`px-2 py-0.5 text-[10px] border rounded transition-colors ${
                  lineHeight === lh
                    ? "bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-700 dark:border-slate-200"
                    : "border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {lh === "normal" ? "1×" : "1,5×"}
              </button>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="w-full font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 resize-none placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ minHeight: "160px", fontSize: `${fontSize}px`, lineHeight: lineHeight === "relaxed" ? "1.6" : "1.4" }}
          placeholder={"SOLICITO: [TIPO DE EXAME] — [REGIÃO ANATÔMICA] [D/E]\nINCIDÊNCIAS: \nHD: "}
          value={freeText}
          onChange={(e) => { setFreeText(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />

        {/* Inline save template input */}
        {showSaveExamTemplateInput && (
          <div className="flex gap-2 items-center mt-2 p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <input
              autoFocus
              className={inp + " flex-1"}
              placeholder="Nome do modelo..."
              value={examTemplateNameInput}
              onChange={e => setExamTemplateNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); if (e.key === "Escape") setShowSaveExamTemplateInput(false); }}
            />
            <button type="button" onClick={handleSaveTemplate} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold">Confirmar</button>
            <button type="button" onClick={() => setShowSaveExamTemplateInput(false)} className="px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600">Cancelar</button>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className={`text-[11px] ${freeText.length > 500 ? "text-amber-500" : "text-slate-400"}`}>
            {freeText.length} chars{freeText.length > 500 ? " · pedidos longos podem ser truncados em portais de convênio" : " · Ctrl+Enter para salvar"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!freeText.trim()}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
              title="Salvar como modelo"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Modelo
            </button>
            <button
              type="button"
              onClick={() => { if (!freeText.trim()) { toast.error("Digite a solicitação antes de imprimir"); return; } setPrintText(freeText); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button
              type="button"
              onClick={gerarJustificativa}
              disabled={gerandoJustif}
              title="Gera a justificativa clínica que o convênio exige — sai em folha separada"
              className="flex items-center gap-1.5 px-3 py-2 border border-indigo-400 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs font-semibold disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" /> {gerandoJustif ? "Escrevendo…" : "Justificativa"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold text-xs"
            >
              {saving ? (
                <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
              ) : (
                <><CheckCircle className="w-3.5 h-3.5" /> Salvar</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Seção: Histórico ── */}
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className={sectionTitle + " mb-0"}>Histórico</p>
          {exams.length > 5 && (
            <button type="button" onClick={() => setShowAllExams(v => !v)} className="text-xs text-blue-600 hover:underline">
              {showAllExams ? "Mostrar menos" : `Ver todos (${exams.length})`}
            </button>
          )}
        </div>
        {loadingEx ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : loadingError ? (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300 flex-1">Não foi possível carregar o histórico. Verifique a conexão.</p>
            <button type="button" onClick={fetchExams} className="text-xs text-blue-600 hover:underline flex-shrink-0">Tentar novamente</button>
          </div>
        ) : exams.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <FileSearch2 className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-semibold text-slate-500">Nenhuma solicitação registrada para este paciente</p>
            <p className="text-xs text-slate-400">Use os modelos acima para começar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(showAllExams ? exams : exams.slice(0, 5)).map((ex) => (
              <div key={ex.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDate(ex.date)}</p>
                      <span className="text-[10px] text-slate-400">({daysAgo(ex.date)})</span>
                    </div>
                    <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{examPreview(ex)}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const txt = ex.free_text || "";
                        if (freeText.trim() && !window.confirm("Substituir texto atual pelo pedido anterior?")) return;
                        setFreeText(txt);
                        setTimeout(autoResize, 0);
                        toast.success("Pedido carregado para edição");
                      }}
                      className="p-1 text-slate-400 hover:text-green-600"
                      title="Reutilizar este pedido"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedExamId(expandedExamId === ex.id ? null : ex.id)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title={expandedExamId === ex.id ? "Recolher" : "Expandir"}
                    >
                      {expandedExamId === ex.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintText(ex.free_text || ex.exams?.map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n") || "")}
                      className="p-1 text-slate-400 hover:text-blue-600"
                      title="Imprimir"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expandedExamId === ex.id && (ex.free_text || ex.exams?.length > 0) && (
                  <pre className="text-xs font-mono whitespace-pre-wrap text-slate-600 dark:text-slate-400 mt-2 max-h-40 overflow-y-auto border-t border-slate-200 dark:border-slate-700 pt-2">
                    {ex.free_text || ex.exams?.map((e: any) => `SOLICITO: ${e.name}${e.laterality ? ` — ${e.laterality}` : ""}`).join("\n")}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Constants: new tabs ────────────────────────────────────────────────────────

const REFERRAL_TYPES = [
  { value: "fisioterapia", label: "Fisioterapia", icon: "Activity" },
  { value: "especialidade", label: "Especialidade", icon: "Stethoscope" },
  { value: "colega", label: "Colega Ortopedista", icon: "Award" },
  { value: "outro", label: "Outro", icon: "FileText" },
];

const SPECIALTY_OPTIONS = [
  "Cirurgia da Mão", "Cirurgia do Tornozelo e Pé", "Cirurgia Plástica",
  "Clínica da Dor", "Endocrinologia", "Fisiatria", "Geriatria",
  "Hematologia", "Infectologia", "Medicina do Esporte", "Medicina do Trabalho",
  "Neurocirurgia", "Neurologia", "Oncologia Ortopédica",
  "Ortopedia Pediátrica", "Psicologia / Psiquiatria", "Reumatologia",
  "Angiologia / Cirurgia Vascular", "Outra",
];

const PHYSIO_MODALITY_OPTIONS = [
  "Cinesioterapia / Fortalecimento", "Fisioterapia pós-operatória", "Hidroterapia",
  "Cadeias musculares / RPG", "Pilates terapêutico", "Eletroterapia / TENS",
  "Terapia manual", "Acupuntura", "Outro",
];

const PROCEDURE_TEMPLATES = [
  { name: "Artrocentese joelho", text: "Realizada artrocentese do joelho [D/E] com agulha 18G. Aspirado aproximadamente [volume]ml de líquido sinovial com aspecto [claro/turvo/hemático].\nOrientações: repouso de 24h, curativo local. Retornar se dor, febre ou recidiva da coleção." },
  { name: "Infiltração joelho — corticoide", text: "Realizada infiltração articular do joelho [D/E] — compartimento [medial/lateral/femoropatelar] — com Triancinolona 40mg + Lidocaína 2% 2ml.\nAnestesia: Lidocaína infiltrativa local.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, gelo local por 20 min 3x/dia por 3 dias. Retorno em 4 semanas." },
  { name: "Infiltração joelho — ácido hialurônico", text: "Realizada infiltração intra-articular do joelho [D/E] com ácido hialurônico (1 ampola).\nAnestesia: Lidocaína tópica.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, evitar esforços por 48h. Retorno em 1 semana." },
  { name: "Infiltração ombro — subacromial", text: "Realizada infiltração subacromial do ombro [D/E] com Triancinolona 40mg + Lidocaína 2% 2ml.\nAnestesia: Lidocaína infiltrativa local.\nIntercorrências: nenhuma.\nOrientações: repouso relativo de 24h, gelo local por 20 min 3x/dia por 3 dias. Retorno em 4 semanas." },
  { name: "Bloqueio coluna", text: "Realizado bloqueio periradicular em [nível vertebral] com Betametasona 12mg + Lidocaína 2% 3ml sob orientação radioscópica.\nAnestesia: Lidocaína infiltrativa.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h, evitar esforços por 48h. Retorno em 2 semanas." },
  { name: "Retirada de fio de Kirschner", text: "Realizada retirada de fio de Kirschner [localização] sob anestesia local com Lidocaína 2%.\nTécnica: remoção com alicate de corte e extração com porta-agulha.\nFerita: limpa, sem sinais de infecção.\nOrientações: curativo simples, troca em 48h. Retornar se sinais de infecção." },
  { name: "Curativo pós-operatório", text: "Realizado curativo de ferida operatória [localização]. Ferida com boa evolução cicatricial, bordas coaptadas, sem sinais de infecção, hematoma ou deiscência.\nOrientações: manter curativo limpo e seco, trocar a cada 48h ou se molhar. Retornar se sinais de infecção." },
  { name: "Buddy taping — dedo", text: "Realizado buddy taping (imobilização relativa) do dedo [indicador/médio/anular/mínimo] [D/E] ao dedo adjacente com espaçador de gaze.\nOrientações: manter a imobilização por 3 semanas, mobilizar os outros dedos. Retorno em 2 semanas." },
  { name: "Drenagem hematoma subungeal", text: "Realizada drenagem de hematoma subungeal do [dedo] [D/E] com agulha aquecida (trefina).\nEvacuado conteúdo hemático sem intercorrências.\nOrientações: curativo compressivo local, manter limpo. Retornar em 1 semana." },
  { name: "Retirada de pontos", text: "Realizada retirada de pontos cirúrgicos de [localização]. Ferida operatória com boa cicatrização, sem sinais de infecção.\nOrientações: manter curativo simples por mais 24h. Liberado para banho." },
  { name: "Imobilização gesso/tala", text: "Realizada imobilização com tala gessada [tipo] em [posição]. Paciente orientado sobre cuidados.\nOrientações: não molhar o gesso, elevar o membro, retornar se edema excessivo, dor intensa ou alteração da cor dos dedos. Retorno em 4 semanas." },
  { name: "Redução de luxação", text: "Realizada redução de luxação [articulação] [D/E] sob analgesia local. Controle radiológico evidenciou redução adequada.\nOrientações: imobilização por [período], retorno em 1 semana para reavaliação." },
  { name: "Infiltração cotovelo (epicondilite)", text: "Realizada infiltração no ponto de máxima dor do epicôndilo lateral [D/E] com Triancinolona 20mg + Lidocaína 2% 1ml.\nAnestesia: Lidocaína infiltrativa local.\nIntercorrências: nenhuma.\nOrientações: repouso relativo do segmento por 72h, gelo local 3x/dia por 3 dias. Retorno em 4 semanas." },
  { name: "Infiltração dedo em gatilho", text: "Realizada infiltração intratendinosa do tendão do [flexor] do dedo [indicador/médio/anular/mínimo] [D/E] com Triancinolona 10mg + Lidocaína 2% 0,5ml.\nTécnica: agulha 25G, abordagem palmar.\nIntercorrências: nenhuma.\nOrientações: repouso de 24h. Retorno em 3 semanas." },
  { name: "Aspiração cisto de Baker", text: "Realizada aspiração de cisto de Baker (bursa semimembranosa) do joelho [D/E] com agulha 18G. Aspirado [volume]ml de líquido sinovial com aspecto [claro/turvo/gelatinoso].\nOrientações: curativo local, repouso de 24h. Retornar se recidiva." },
  { name: "Tala suropodálica", text: "Realizada imobilização com tala gessada suropodálica [D/E] com tornozelo em 90°. Foram utilizadas [x] ataduras de gesso [6/8cm].\nOrientações: não molhar, elevar o membro, retornar se edema distal, dor intensa ou parestesia dos dedos. Retorno em [prazo]." },
];

const CERTIFICATE_TYPES = [
  { value: "trabalho", label: "Atividades de trabalho" },
  { value: "esportes", label: "Atividades físicas / esportes" },
  { value: "escola", label: "Atividades escolares" },
  { value: "geral", label: "Atividades em geral" },
  { value: "ef_escolar", label: "Educação Física escolar" },
  { value: "academia", label: "Academia / Atividade física supervisionada" },
  { value: "acompanhamento", label: "Acompanhamento de paciente" },
];

// Dias rápidos por tipo de atestado
const CERT_QUICK_DAYS: Record<string, number[]> = {
  trabalho:       [1, 3, 7, 15, 30],
  esportes:       [7, 14, 30, 60, 90],
  escola:         [1, 2, 3, 5, 7],
  geral:          [1, 3, 7, 15, 30],
  ef_escolar:     [30, 60, 90, 180],
  academia:       [14, 30, 45, 60, 90],
  acompanhamento: [1, 2, 3],
};

const OBS_CHIPS = [
  "Uso de muletas — descarga parcial",
  "Uso de muletas — sem descarga",
  "Membro em repouso elevado",
  "Restrição para esforço físico",
  "Restrição para levantamento de peso",
  "Proibido dirigir",
  "Pode exercer função administrativa",
  "Imobilização gessada/órtese em uso",
  "Proibido subir escadas",
  "Deambulação com apoio parcial",
  "Restrição para posição sentada prolongada",
  "Uso de colar cervical",
];

const LAUDO_TEMPLATES = [
  { name: "Perícia INSS — Joelho", text: "LAUDO MÉDICO\n\n1. QUEIXA PRINCIPAL\n\n2. HISTÓRIA DA DOENÇA ATUAL\n\n3. ANTECEDENTES PESSOAIS E CIRÚRGICOS\n\n4. EXAME FÍSICO\n   - Inspeção:\n   - Palpação:\n   - Amplitude de Movimento (ADM):\n     Flexão: ___° (normal 135°)\n     Extensão: ___° (normal 0°)\n   - Testes Especiais: Lachman ___ | McMurray ___ | Varo/Valgo ___\n\n5. EXAMES COMPLEMENTARES\n   Exame: | Data: | Achados:\n\n6. DIAGNÓSTICO\n   CID-10:\n\n7. CAPACIDADE FUNCIONAL\n   [ ] Apto para trabalho habitual\n   [ ] Parcialmente incapaz — restrições:\n   [ ] Incapaz temporariamente — prazo estimado:\n   [ ] Incapaz permanentemente\n\n8. CONCLUSÃO\n" },
  { name: "Perícia INSS — Coluna Lombar", text: "LAUDO MÉDICO — PERÍCIA PREVIDENCIÁRIA\nColuna Lombar / Lombossacra\n\n1. QUEIXA PRINCIPAL\n   {QUEIXA}\n\n2. HISTÓRIA DA DOENÇA ATUAL\n\n3. ANTECEDENTES E CIRURGIAS PRÉVIAS\n\n4. EXAME FÍSICO\n   - Marcha:\n   - ADM lombar:\n     Flexão: ___°  Extensão: ___°  Inclinação D: ___°  Inclinação E: ___°\n   - Lasegue: D___°  E___°\n   - Força muscular MMII: D___  E___  (0–5)\n   - Reflexos: patelar D___ E___ | aquileu D___ E___\n   - Sensibilidade: {SENSIBILIDADE}\n\n5. EXAMES COMPLEMENTARES\n   Exame: | Data: | Achados:\n\n6. DIAGNÓSTICO\n   CID-10:\n\n7. CONCLUSÃO PERICIAL FORMAL\n   ( ) Não há incapacidade laborativa\n   ( ) Incapacidade parcial — restrições:\n   ( ) Incapacidade total temporária — prazo:\n   ( ) Incapacidade total definitiva\n\n8. OBSERVAÇÕES\n" },
  { name: "Seguradora — Ombro", text: "LAUDO MÉDICO — AVALIAÇÃO ORTOPÉDICA\nRegião: Ombro  |  Lado: {LADO}\n\n1. IDENTIFICAÇÃO\n   Sinistro/Apólice nº: {APOLICE}\n\n2. HISTÓRIA CLÍNICA\n   Data do evento: {DATA_EVENTO}\n   Mecanismo: {MECANISMO}\n\n3. EXAME FÍSICO\n   - Inspeção e palpação:\n   - ADM ativa:\n     Flexão: ___°  Abdução: ___°  RI: ___°  RE: ___°\n   - Força (escala MRC):\n   - Testes: Neer ___  Hawkins ___  Jobe ___  Yergason ___  Apprehension ___\n\n4. EXAMES COMPLEMENTARES\n   Exame: | Data: | Achados relevantes:\n\n5. DIAGNÓSTICO\n   CID-10:\n\n6. NEXO CAUSAL\n   As lesões descritas {SIM/NÃO} são compatíveis com o mecanismo informado.\n\n7. SEQUELA (SUSEP 2023 / Decreto 3.048/99)\n   Grau de incapacidade parcial e permanente: ____%\n\n8. CONCLUSÃO\n" },
  { name: "Autorização cirúrgica — Quadril (PTQ)", text: "LAUDO PARA AUTORIZAÇÃO DE ARTROPLASTIA TOTAL DE QUADRIL\n\n1. IDENTIFICAÇÃO DO PROCEDIMENTO\n   Procedimento: Artroplastia Total do Quadril (ATQ)\n   Código TUSS: 30724059 / CBHPM: 3.10.06.07-1\n   Lado: {LADO}\n\n2. DIAGNÓSTICO\n   CID-10: M16 — Coxartrose\n\n3. JUSTIFICATIVA CLÍNICA\n   Paciente portador(a) de coxartrose avançada ({LADO}), com dor em repouso e ao esforço, limitação severa da marcha e falha de tratamento conservador.\n\n4. TRATAMENTO CONSERVADOR REALIZADO\n   Fisioterapia: ___ sessões\n   Medicação: ___\n   Infiltrações: ___\n\n5. EXAMES COMPLEMENTARES\n   Exame: | Data: | Achados:\n\n6. URGÊNCIA\n   ( ) Eletiva\n\n7. CONCLUSÃO\n   Indicação formal de ATQ {LADO}. Solicito autorização para realização do procedimento acima justificado.\n" },
  { name: "Perícia — Síndrome do Túnel do Carpo", text: "LAUDO MÉDICO — PERÍCIA\nSíndrome do Túnel do Carpo (STC)\n\n1. QUEIXA PRINCIPAL\n   Parestesia e dor em {LADO}, com irradiação para dedos 1-3.\n\n2. HISTÓRIA DA DOENÇA ATUAL\n   Início: {INICIO}  |  Fator ocupacional: {SIM/NÃO}\n\n3. EXAME FÍSICO\n   - Sinal de Tinel: {POS/NEG}\n   - Teste de Phalen (60s): {POS/NEG}\n   - Força de pinça D:___  E:___\n   - Sensibilidade (monofilamento): {ACHADOS}\n\n4. ELETRONEUROMIOGRAFIA\n   Data: | Laudo: VCS mediano {VALOR} m/s (ref >50 m/s)\n\n5. DIAGNÓSTICO\n   CID-10: G56.0\n\n6. NEXO COM TRABALHO\n   ( ) Doença Ocupacional — CID: G56.0 / Z57\n   ( ) Sem nexo ocupacional\n\n7. CONCLUSÃO PERICIAL FORMAL\n   ( ) Sem incapacidade\n   ( ) Incapacidade parcial — restrições: movimentos repetitivos, vibração\n   ( ) Indicação cirúrgica (liberação endoscópica do túnel do carpo)\n" },
  { name: "Autorização cirúrgica (Plano)", text: "LAUDO PARA AUTORIZAÇÃO DE PROCEDIMENTO CIRÚRGICO\n\n1. IDENTIFICAÇÃO DO PROCEDIMENTO\n   Procedimento solicitado:\n   Código TUSS/CBHPM:\n\n2. DIAGNÓSTICO\n   CID-10:\n\n3. JUSTIFICATIVA CLÍNICA\n   Paciente portador(a) de...\n\n4. EXAMES QUE EMBASAM A INDICAÇÃO\n\n5. TRATAMENTO CONSERVADOR REALIZADO\n   Sim ( ) — duração:\n   Não ( ) — justificativa:\n\n6. URGÊNCIA\n   ( ) Eletiva  ( ) Urgente  ( ) Emergência\n\n7. CONCLUSÃO\n   Solicito autorização para realização do procedimento acima justificado.\n" },
  { name: "Acidente de trabalho (CAT)", text: "LAUDO DE ACIDENTE DE TRABALHO\n\n1. DESCRIÇÃO DO ACIDENTE\n   Data/hora:\n   Local:\n   Mecanismo do trauma:\n\n2. LESÕES ENCONTRADAS\n\n3. NEXO CAUSAL\n   As lesões descritas são compatíveis com o mecanismo de acidente informado.\n\n4. DIAGNÓSTICO\n   CID-10:\n\n5. TRATAMENTO NECESSÁRIO\n\n6. CONCLUSÃO\n" },
  { name: "Sequela pós-traumática", text: "LAUDO DE AVALIAÇÃO DE SEQUELA PÓS-TRAUMÁTICA\n\n1. IDENTIFICAÇÃO DO EVENTO\n   Data do trauma:\n   Mecanismo:\n\n2. HISTÓRICO DE TRATAMENTO\n\n3. ESTADO ATUAL\n   Queixa atual:\n   Exame físico:\n   Exames complementares:\n\n4. DIAGNÓSTICO\n   CID-10:\n\n5. SEQUELA\n   Descrição da sequela:\n   Limitação funcional:\n   Grau estimado de incapacidade (SUSEP 2023 / Decreto 3.048/99): ____%\n\n6. CONCLUSÃO\n" },
  { name: "Laudo de joelho (RX/RM)", text: "LAUDO MÉDICO — JOELHO\n\nExame: {EXAME}\nLado: {LADO}\n\n1. ACHADOS CLÍNICOS\n\n2. ACHADOS DE IMAGEM\n\n3. DIAGNÓSTICO\n   CID-10:\n\n4. CONCLUSÃO\n" },
  { name: "Laudo de coluna (RX/RM)", text: "LAUDO MÉDICO — COLUNA VERTEBRAL\n\nExame: {EXAME}\nSegmento: {SEGMENTO}\n\n1. ACHADOS CLÍNICOS\n\n2. ACHADOS DE IMAGEM\n\n3. DIAGNÓSTICO\n   CID-10:\n\n4. CONCLUSÃO\n" },
  { name: "Relatório médico livre", text: "RELATÓRIO MÉDICO\n\nIlmo(a). Sr(a).,\n\nEncaminho o(a) paciente abaixo, cujos dados e informações clínicas seguem:\n\n" },
];

const LAUDO_FINALIDADE_OPTIONS = [
  "INSS / Perícia Previdenciária",
  "Seguradora / Seguro de Vida",
  "Plano de Saúde (autorização cirúrgica)",
  "Junta Médica / Concurso",
  "Judicial / Processo Trabalhista",
  "Relatório Médico Geral",
];

// ── Generic Print Modal ────────────────────────────────────────────────────────

function PrintDocModal({ title, content, onClose, extraHeader }: { title: string; content: React.ReactNode; onClose: () => void; extraHeader?: React.ReactNode }) {
  // Registra este documento no coletor da consulta (impressão final em lote).
  useRegisterPrintDoc({ id: title, label: title, content });
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          /* Papel A4 retrato com margens de documento oficial (pedido do Dr. Valth) */
          @page { size: A4 portrait; margin: 16mm 15mm 18mm; }
          /* 10/08 — mesmo conserto do pedido de exame: escondido por
             visibility o app some mas MANTÉM o espaço, e sobrava folha em
             branco. O papel sai por portal filho direto do body. */
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > *:not([data-print-portal]) { display: none !important; }
          #doc-print-portal { display: block !important; position: static !important; width: 100% !important; background: #fff !important; }
        }
      `}</style>
      {typeof document !== "undefined" && createPortal(
        <div id="doc-print-portal" data-print-portal style={{ display: "none" }}>{content}</div>,
        document.body,
      )}

      <div id="print-doc-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {extraHeader}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {content}
        </div>
      </div>
    </div>
  );
}

function DrHeader({ clinic }: { clinic?: any }) {
  return (
    <div style={{ borderBottom: "2px solid #0F2D5E", paddingBottom: "12px", marginBottom: "16px", textAlign: "center" }}>
      <p style={{ fontWeight: 700, fontSize: "16px", color: "#0F2D5E", margin: "0 0 2px 0" }}>Dr. Valth Guimarães</p>
      <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Ortopedia e Traumatologia</p>
      <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>{crmDaClinica(clinic)}</p>
      {clinic?.phone && <p style={{ fontSize: "11px", color: "#555", margin: "0" }}>Tel: {clinic.phone}</p>}
    </div>
  );
}

// Registro profissional conforme o ESTADO onde ele está atendendo (10/08):
// em Palmares e Caruaru vale o CREMEPE; na Paraíba, o CRM-PB. Sai um só —
// o do conselho local — porque é esse que a clínica e o convênio conferem.
function crmDaClinica(clinic?: any): string {
  return (clinic?.state || "").toUpperCase() === "PE"
    ? "CREMEPE 16.551"
    : "CRM-PB 6326";
}

// Versão com o título de especialista, usada nos blocos de assinatura.
function crmComTeot(clinic?: any): string {
  return `${crmDaClinica(clinic)} · TEOT 15090`;
}

// ── Identidade visual dos documentos oficiais (aprovada pelo Dr. Valth) ──────
const DOC_SERIF = "Georgia, 'Times New Roman', serif";
const OM_NAVY = "#142A4D";
const OM_TEAL = "#3FB3A0";

// Logomarca OrthoMedic em SVG (fundo transparente — nítida no papel branco).
function OrthoMedicLogo({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", margin: "0 auto" }}>
      <circle cx="50" cy="50" r="44" fill="none" stroke={OM_NAVY} strokeWidth="7" />
      <circle cx="50" cy="50" r="33" fill="none" stroke={OM_TEAL} strokeWidth="6" />
      <circle cx="50" cy="50" r="23" fill="none" stroke={OM_NAVY} strokeWidth="3.5" />
      <circle cx="6" cy="50" r="4.5" fill={OM_NAVY} />
      <circle cx="94" cy="50" r="4.5" fill={OM_NAVY} />
      <path d="M42 30 h16 v12 h12 v16 h-12 v12 h-16 v-12 h-12 v-16 h12 z" fill={OM_TEAL} rx="4" />
    </svg>
  );
}

function dataExtensoHoje(): string {
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const h = new Date();
  return `${h.getDate() === 1 ? "1º" : h.getDate()} de ${MESES[h.getMonth()]} de ${h.getFullYear()}`;
}

function cidadeUf(clinic?: any): string {
  return clinic?.city ? `${clinic.city} – ${clinic.state}` : "____________________";
}

// Papel timbrado oficial: logomarca + wordmark + médico + clínica + filete duplo.
function TimbradoOficial({ clinic }: { clinic?: any }) {
  return (
    <>
      <div style={{ textAlign: "center", paddingBottom: "10px" }}>
        <OrthoMedicLogo size={46} />
        <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "4px", margin: "6px 0 8px" }}>
          <span style={{ color: OM_NAVY }}>ORTHO</span><span style={{ color: OM_TEAL }}>MEDIC</span>
        </p>
        <p style={{ fontFamily: DOC_SERIF, fontSize: "18px", fontWeight: 700, letterSpacing: "1px", margin: 0, color: "#0F2D5E" }}>Dr. Valth Menezes Guimarães</p>
        <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "3px", color: "#555", margin: "3px 0 0" }}>Ortopedia e Traumatologia</p>
        <p style={{ fontSize: "9.5px", color: "#777", margin: "3px 0 0", letterSpacing: "0.5px" }}>{crmComTeot(clinic)}</p>
        {clinic && (
          <p style={{ fontSize: "9px", color: "#999", margin: "4px 0 0" }}>
            {clinic.name}{clinic.city ? ` · ${clinic.city} – ${clinic.state}` : ""}{clinic.phone ? ` · ${clinic.phone}` : ""}
          </p>
        )}
      </div>
      <div style={{ borderTop: `2.5px solid ${OM_NAVY}`, marginBottom: "2px" }} />
      <div style={{ borderTop: `1px solid ${OM_TEAL}`, marginBottom: "18px" }} />
    </>
  );
}

// Local/data por extenso + bloco de assinatura (nunca quebra de página).
function FechoOficial({ clinic }: { clinic?: any }) {
  return (
    <div style={{ pageBreakInside: "avoid", breakInside: "avoid" } as any}>
      <p style={{ fontFamily: DOC_SERIF, fontSize: "12.5px", color: "#1a1a1a", margin: "30px 0 44px", textAlign: "right", fontStyle: "italic" }}>{cidadeUf(clinic)}, {dataExtensoHoje()}.</p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ textAlign: "center", width: "310px" }}>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: "9px" }}>
            <p style={{ fontFamily: DOC_SERIF, fontSize: "13.5px", fontWeight: 700, margin: 0, letterSpacing: "0.5px" }}>Dr. Valth Menezes Guimarães</p>
            <p style={{ fontSize: "10.5px", color: "#444", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "1.5px" }}>Ortopedista e Traumatologista</p>
            <p style={{ fontSize: "10.5px", color: "#444", margin: "2px 0 0", letterSpacing: "0.5px" }}>{crmComTeot(clinic)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Centro de impressão final da consulta ─────────────────────────────────────
// Lista todos os documentos gerados no atendimento, com checkbox pra escolher
// quais imprimir, e imprime os selecionados de uma vez (cada um em sua página).
function ConsultaPrintCenter({ docs, onRemove, onClose }: {
  docs: CollectedDoc[];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(docs.map((d) => d.id)));
  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const chosen = docs.filter((d) => selected.has(d.id));

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <style>{`
        @media print {
          /* 06/08 — mesmo conserto da receita: o papel sai por um portal
             filho direto do body. Dentro do modal (absolute + flex) o
             navegador não paginava: imprimia a primeira folha e cortava. */
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > *:not([data-print-portal]) { display: none !important; }
          #pc-print-portal { display: block !important; position: static !important; width: 100% !important; background: #fff !important; }
          .pc-doc { page-break-after: always; }
          .pc-doc:last-child { page-break-after: auto; }
          /* 2 vias de RCE/ATB quebram de página tambem na impressão em lote (M9) */
          .rx-via-break { page-break-after: always; }
        }
      `}</style>
      <div id="print-center-root" className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="no-print px-5 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-50 text-sm">Imprimir documentos</h2>
            <p className="text-xs text-slate-500 mt-0.5">Selecione o que imprimir — sai tudo de uma vez</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Checklist */}
        <div className="no-print flex-1 overflow-y-auto p-4 space-y-2">
          {docs.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-6">
              Nenhum documento gerado ainda. Gere receitas, atestados, laudos etc. nas abas e eles aparecem aqui.
            </p>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg">
                <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{d.label}</span>
                </label>
                <button
                  onClick={() => onRemove(d.id)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded"
                  title="Remover da lista"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Ações */}
        {docs.length > 0 && (
          <div className="no-print px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-slate-500">{chosen.length} de {docs.length} selecionado(s)</span>
            <button
              onClick={() => window.print()}
              disabled={chosen.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" /> Imprimir selecionados
            </button>
          </div>
        )}

        {/* Área imprimível: portal filho direto do body, para o navegador
            conseguir paginar (dentro do modal ele cortava na 1ª folha). */}
        {typeof document !== "undefined" && createPortal(
          <div id="pc-print-portal" data-print-portal style={{ display: "none" }}>
            {chosen.map((d) => (
              <div key={d.id} className="pc-doc">{d.content}</div>
            ))}
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

// ── Tab: Encaminhamentos ───────────────────────────────────────────────────────

function TabEncaminhamentos({ patient, clinic, patientId }: { patient: any; clinic?: any; patientId?: number }) {
  const [refType, setRefType] = useState("fisioterapia");
  const [specialty, setSpecialty] = useState("");
  const [specialtyOther, setSpecialtyOther] = useState("");
  const [physioModality, setPhysioModality] = useState("");
  const [colleagueName, setColleagueName] = useState("");
  const [cid, setCid] = useState("");
  const [text, setText] = useState("");
  const [outroDestino, setOutroDestino] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingRefTemplate, setPendingRefTemplate] = useState<typeof REFERRAL_TEXT_TEMPLATES[0] | null>(null);
  const [printData, setPrintData] = useState<{ typeLabel: string; text: string; cid: string; colleagueName: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";
  const draftKey = `orthoclinic_ref_draft_${patient?.id || 0}`;

  // Restore draft on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.refType) setRefType(p.refType);
        if (p.specialty) setSpecialty(p.specialty);
        if (p.specialtyOther) setSpecialtyOther(p.specialtyOther);
        if (p.physioModality) setPhysioModality(p.physioModality);
        if (p.colleagueName) setColleagueName(p.colleagueName);
        if (p.cid) setCid(p.cid);
        if (p.text) { setText(p.text); toast.success("Rascunho de encaminhamento restaurado"); }
        if (p.outroDestino) setOutroDestino(p.outroDestino);
      }
    } catch {}
  }, [draftKey]);

  // Autosave draft with debounce — no guard so clearing text also persists the cleared state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem(draftKey, JSON.stringify({ refType, specialty, specialtyOther, physioModality, colleagueName, cid, text, outroDestino }));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [refType, specialty, specialtyOther, physioModality, colleagueName, cid, text, outroDestino, draftKey]);

  const autoResizeRef = useCallback(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => { autoResizeRef(); }, [text, autoResizeRef]);

  const resolvedSpecialty = specialty === "Outra" ? specialtyOther : specialty;
  const typeLabel = refType === "especialidade" && resolvedSpecialty
    ? resolvedSpecialty
    : refType === "fisioterapia" && physioModality
    ? `Fisioterapia — ${physioModality}`
    : refType === "colega" ? "Colega Ortopedista"
    : refType === "outro" ? (outroDestino || "Outro")
    : REFERRAL_TYPES.find(r => r.value === refType)?.label ?? refType;

  const handlePrint = () => {
    if (!text.trim()) { toast.error("Descreva o encaminhamento antes de imprimir"); return; }
    setPrintData({ typeLabel, text, cid, colleagueName });
  };

  const handleSave = async () => {
    if (!text.trim()) { toast.error("Descreva o encaminhamento antes de salvar"); return; }
    setSaving(true);
    try {
      toast.success("Encaminhamento registrado");
      if (typeof window !== "undefined") localStorage.removeItem(draftKey);
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = REFERRAL_TEXT_TEMPLATES.filter(t => t.type === refType);

  const printContent = printData && (
    // 10/08: mesmo papel timbrado do laudo e do pedido de exame.
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1a1a1a", fontSize: "13px" }}>
      <TimbradoOficial clinic={clinic} />

      <p style={{ textAlign: "center", fontFamily: DOC_SERIF, fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#0F2D5E", margin: "0 0 16px" }}>
        Encaminhamento médico
      </p>

      <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "9px 12px", marginBottom: "16px", fontSize: "12px", lineHeight: 1.7 }}>
        <div><span style={{ color: "#666" }}>Paciente: </span><strong>{patient?.name}</strong></div>
        <div>
          {patient?.birth_date && <><span style={{ color: "#666" }}>Nascimento: </span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}{"  ·  "}</>}
          {(patient?.patient_insurance || patient?.insurance) && <><span style={{ color: "#666" }}>Convênio: </span>{patient?.patient_insurance || patient?.insurance}</>}
        </div>
        {patient?.phone && <div><span style={{ color: "#666" }}>Telefone: </span>{patient.phone}</div>}
      </div>

      <p style={{ margin: "0 0 14px", fontSize: "13px" }}>
        <span style={{ color: "#666" }}>Encaminho para: </span><strong>{printData.typeLabel}</strong>
      </p>

      {printData.colleagueName && (
        <p style={{ margin: "0 0 12px" }}>Prezado(a) Dr(a). <strong>{printData.colleagueName}</strong>,</p>
      )}

      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", minHeight: "120px", marginBottom: "8px" }}>
        {printData.text}
      </div>

      {printData.cid && (
        <p style={{ fontSize: "11.5px", color: "#444", margin: "14px 0 0" }}>
          <span style={{ color: "#666" }}>Diagnóstico / hipótese (CID-10): </span>{printData.cid}
        </p>
      )}

      <FechoOficial clinic={clinic} />
    </div>
  );

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Encaminhamento" content={printContent} onClose={() => setPrintData(null)} />
      )}

      {pendingRefTemplate && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-xs">
          <span className="text-amber-800 dark:text-amber-200 font-medium">Substituir texto atual pelo modelo <strong>{pendingRefTemplate.name}</strong>?</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setPendingRefTemplate(null)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
            <button type="button" onClick={() => { setText(pendingRefTemplate.text); setPendingRefTemplate(null); setTimeout(autoResizeRef, 0); textRef.current?.focus(); }} className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 font-semibold">Substituir</button>
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Tipo de Encaminhamento</label>
        <div className="flex flex-wrap gap-2">
          {REFERRAL_TYPES.map(rt => {
            const IconComp = rt.icon === "Activity" ? Activity : rt.icon === "Stethoscope" ? Stethoscope : rt.icon === "Award" ? Award : FileText;
            return (
              <button
                key={rt.value}
                type="button"
                onClick={() => setRefType(rt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  refType === rt.value
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" /> {rt.label}
              </button>
            );
          })}
        </div>
      </div>

      {refType === "fisioterapia" && (
        <div>
          <label className={lbl}>Modalidade de Fisioterapia</label>
          <select className={inp} value={physioModality} onChange={e => setPhysioModality(e.target.value)}>
            <option value="">— selecionar modalidade —</option>
            {PHYSIO_MODALITY_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {refType === "especialidade" && (
        <div>
          <label className={lbl}>Especialidade</label>
          <select className={inp} value={specialty} onChange={e => setSpecialty(e.target.value)}>
            <option value="">— selecionar especialidade —</option>
            {SPECIALTY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {specialty === "Outra" && (
            <input className={inp + " mt-2"} placeholder="Especifique a especialidade..." value={specialtyOther} onChange={e => setSpecialtyOther(e.target.value)} />
          )}
        </div>
      )}

      {refType === "colega" && (
        <div>
          <label className={lbl}>Nome do colega (Dr./Dra.)</label>
          <input className={inp} placeholder="Ex: Dr. João Silva" value={colleagueName} onChange={e => setColleagueName(e.target.value)} />
        </div>
      )}

      {refType === "outro" && (
        <div>
          <label className={lbl}>Descrever destino</label>
          <input className={inp} placeholder="Ex: Clínica Especializada em Dor, CAPS, Nutricionista..." value={outroDestino} onChange={e => setOutroDestino(e.target.value)} />
        </div>
      )}

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 / Hipótese Diagnóstica</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Templates de texto rápidos */}
      {filteredTemplates.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wide">Modelos rápidos</p>
          <div className="flex flex-wrap gap-1.5">
            {filteredTemplates.map(tpl => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => {
                  if (text.trim() && text !== tpl.text) { setPendingRefTemplate(tpl); return; }
                  setText(tpl.text); setTimeout(autoResizeRef, 0); textRef.current?.focus();
                }}
                className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Resumo clínico / Conduta Solicitada</label>
        <textarea
          ref={textRef}
          className={`${inp} resize-none`}
          style={{ minHeight: "160px" }}
          placeholder={`Resumo clínico:\nPaciente ${patient?.name || "{nome}"}, portador(a) de...\n\nExames realizados:\n- (Exame, data, achados principais)\n\nConduta solicitada:\nAvaliar e tratar conforme protocolo.`}
          value={text}
          onChange={e => { setText(e.target.value); autoResizeRef(); }}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-xs"
        >
          {saving ? <><div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> Salvando...</> : <><Save className="w-3.5 h-3.5" /> Salvar</>}
        </button>
        <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs">
          <Printer className="w-3.5 h-3.5" /> Salvar e Imprimir
        </button>
      </div>
    </div>
  );
}

// ── Tab: Procedimentos ────────────────────────────────────────────────────────

function TabProcedimentos({ patientId, patient, clinic }: { patientId: number; patient: any; clinic?: any }) {
  const [text, setText] = useState("");
  const [cid, setCid] = useState("");
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);
  const [procedureTime, setProcedureTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  });
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<typeof PROCEDURE_TEMPLATES[0] | null>(null);
  const [printData, setPrintData] = useState<{ text: string; cid: string; time: string; duration: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";

  const autoResizeProc = useCallback(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 200)}px`;
  }, []);

  const handleSelectTemplate = (tmpl: typeof PROCEDURE_TEMPLATES[0]) => {
    if (text.trim() && text !== tmpl.text) {
      setPendingTemplate(tmpl);
      return;
    }
    applyTemplate(tmpl);
  };

  const applyTemplate = (tmpl: typeof PROCEDURE_TEMPLATES[0]) => {
    setText(tmpl.text);
    setActiveTemplateName(tmpl.name);
    setPendingTemplate(null);
    setTimeout(autoResizeProc, 0);
    textRef.current?.focus();
  };

  const handleSaveProc = async () => {
    if (!text.trim()) { toast.error("Descreva o procedimento antes de salvar"); return; }
    setSaving(true);
    try {
      // Persist via evolutionApi with procedure tag until dedicated endpoint exists
      await evolutionApi.create(patientId, {
        entry_date: new Date().toISOString().split("T")[0],
        content: `[PROCEDIMENTO]${cid ? ` — CID: ${cid}` : ""}${duration ? ` — Duração: ${duration}` : ""}\n${text.trim()}`,
      });
      toast.success("Procedimento registrado!");
      setText("");
      setCid("");
      setDuration("");
      setActiveTemplateName(null);
      if (textRef.current) textRef.current.style.height = "auto";
    } catch {
      toast.error("Erro ao salvar procedimento");
    } finally {
      setSaving(false);
    }
  };

  const printContent = printData && (
    // 10/08: mesmo papel timbrado dos demais documentos.
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#1a1a1a", fontSize: "13px" }}>
      <TimbradoOficial clinic={clinic} />

      <p style={{ textAlign: "center", fontFamily: DOC_SERIF, fontSize: "13px", fontWeight: 700, letterSpacing: "3px", textTransform: "uppercase", color: "#0F2D5E", margin: "0 0 16px" }}>
        Relatório de procedimento
      </p>

      <div style={{ border: "1px solid #ddd", borderRadius: "3px", padding: "9px 12px", marginBottom: "16px", fontSize: "12px", lineHeight: 1.7 }}>
        <div><span style={{ color: "#666" }}>Paciente: </span><strong>{patient?.name}</strong></div>
        <div>
          {patient?.birth_date && <><span style={{ color: "#666" }}>Nascimento: </span>{new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}{"  ·  "}</>}
          {(patient?.patient_insurance || patient?.insurance) && <><span style={{ color: "#666" }}>Convênio: </span>{patient?.patient_insurance || patient?.insurance}</>}
        </div>
        <div>
          <span style={{ color: "#666" }}>Realizado em: </span>{dateStr}{printData.time ? ` às ${printData.time}` : ""}
          {printData.duration ? <>{"  ·  "}<span style={{ color: "#666" }}>Duração: </span>{printData.duration}</> : null}
        </div>
      </div>

      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "13px", minHeight: "120px", marginBottom: "8px" }}>
        {printData.text}
      </div>

      {printData.cid && (
        <p style={{ fontSize: "11.5px", color: "#444", margin: "14px 0 0" }}>
          <span style={{ color: "#666" }}>Diagnóstico (CID-10): </span>{printData.cid}
        </p>
      )}

      <FechoOficial clinic={clinic} />

      {/* Ciência do paciente — exigência do próprio documento, fica após o fecho. */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "26px", pageBreakInside: "avoid" } as any}>
        <div style={{ textAlign: "center", width: "310px", borderTop: "1px solid #999", paddingTop: "7px" }}>
          <p style={{ fontSize: "10.5px", color: "#666", margin: 0 }}>Paciente — ciente e de acordo</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Relatório de Procedimento" content={printContent} onClose={() => setPrintData(null)} />
      )}

      <AllergyBanner patient={patient} />

      {/* Inline confirmation for template replacement */}
      {pendingTemplate && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-xs">
          <span className="text-amber-800 dark:text-amber-200 font-medium">Substituir texto atual pelo modelo <strong>{pendingTemplate.name}</strong>?</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setPendingTemplate(null)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
            <button type="button" onClick={() => applyTemplate(pendingTemplate)} className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 font-semibold">Substituir</button>
          </div>
        </div>
      )}

      {/* Template chips */}
      <div>
        <label className={lbl}>Modelos de Procedimento</label>
        <div className="flex flex-wrap gap-1.5">
          {PROCEDURE_TEMPLATES.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => handleSelectTemplate(t)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                activeTemplateName === t.name
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 / Indicação</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Hora + Duração */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Hora do procedimento</label>
          <div className="flex gap-1">
            <input type="time" className={inp} value={procedureTime} onChange={e => setProcedureTime(e.target.value)} />
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setProcedureTime(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);
              }}
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
              title="Usar hora atual"
            >
              Agora
            </button>
          </div>
        </div>
        <div>
          <label className={lbl}>Duração aproximada</label>
          <select className={inp} value={duration} onChange={e => setDuration(e.target.value)}>
            <option value="">— selecionar —</option>
            <option value="Menos de 10 min">Menos de 10 min</option>
            <option value="10–30 min">10–30 min</option>
            <option value="30–60 min">30–60 min</option>
            <option value="Mais de 60 min">Mais de 60 min</option>
          </select>
        </div>
      </div>

      <div>
        <label className={lbl}>Descrição técnica do procedimento</label>
        <textarea
          ref={textRef}
          className={`${inp} resize-none font-mono`}
          style={{ minHeight: "200px" }}
          placeholder={"Ex: Realizada infiltração articular do joelho direito com...\n\nOrientações: repouso de 24h..."}
          value={text}
          onChange={e => { setText(e.target.value); setActiveTemplateName(null); autoResizeProc(); }}
          onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSaveProc(); } }}
        />
        <p className="text-[11px] text-slate-400 mt-1">Ctrl+Enter para salvar · {text.length} caracteres</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => { if (!text.trim()) { toast.error("Descreva o procedimento antes de imprimir"); return; } setPrintData({ text, cid, time: procedureTime, duration }); }}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
        <button
          type="button"
          onClick={handleSaveProc}
          disabled={saving}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          <CheckCircle className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar Procedimento"}
        </button>
      </div>
    </div>
  );
}

function calcReturnDate(startDate: string, days: string): string | null {
  if (!startDate || !days || Number(days) < 1) return null;
  const d = new Date(startDate + "T12:00:00");
  d.setDate(d.getDate() + Number(days));
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// ── Tab: Atestados ────────────────────────────────────────────────────────────

function TabAtestados({ patient, clinic }: { patient: any; clinic?: any }) {
  const [docKind, setDocKind] = useState<"atestado" | "comparecimento">("atestado");
  const [cid, setCid] = useState("");
  const [days, setDays] = useState("1");
  const [certType, setCertType] = useState("trabalho");
  const [obs, setObs] = useState("");
  // M6: campos do atestado de acompanhamento agora são controlados (antes eram
  // inputs não-controlados por id e não entravam no impresso)
  const [accompName, setAccompName] = useState("");
  const [accompRel, setAccompRel] = useState("");
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [startDate, setStartDate] = useState(todayStr);
  const [printData, setPrintData] = useState<{ cid: string; days: string; certType: string; obs: string; startDate: string; accompName: string; accompRel: string } | null>(null);

  // Declaração de Comparecimento
  const [compDate, setCompDate] = useState(todayStr);
  const [horaEntrada, setHoraEntrada] = useState("");
  const [horaSaida, setHoraSaida] = useState("");
  const [compAcompanhante, setCompAcompanhante] = useState("");
  const [compPrintData, setCompPrintData] = useState<{ compDate: string; horaEntrada: string; horaSaida: string; compAcompanhante: string } | null>(null);

  const { dateStr, cityState } = useMemo(() => {
    const today = new Date();
    return {
      dateStr: `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`,
      cityState: clinic ? `${clinic.city}/${clinic.state}` : "_________",
    };
  }, [clinic]);

  const typeLabel = CERTIFICATE_TYPES.find(c => c.value === certType)?.label ?? certType;
  const returnDate = useMemo(() => calcReturnDate(startDate, days), [startDate, days]);
  const quickDays = CERT_QUICK_DAYS[certType] ?? [1, 3, 7, 15, 30];

  const addObsChip = (chip: string) => {
    setObs(prev => prev ? prev + "; " + chip : chip);
  };

  const [savingDoc, setSavingDoc] = useState(false);

  const salvarAtestado = async () => {
    if (!startDate || !days || Number(days) < 1) { toast.error("Informe os dias de afastamento"); return; }
    if (!patient?.id) { toast.error("Paciente inválido"); return; }
    setSavingDoc(true);
    try {
      const typeLabel = CERTIFICATE_TYPES.find(c => c.value === certType)?.label ?? certType;
      const retDate = calcReturnDate(startDate, days) ?? "";
      const content =
        `Atesto que o(a) paciente ${patient?.name}` +
        (patient?.cpf ? `, CPF ${patient.cpf}` : "") +
        ` foi avaliado(a) em ${dateStr} e necessita afastar-se de ${typeLabel} pelo período de ${days} dia(s), a contar de ${formatDateBR(startDate)}, com retorno previsto para ${retDate}.` +
        (certType === "acompanhamento" && accompName ? `\nPaciente acompanhado: ${accompName}${accompRel ? ` (${accompRel})` : ""}` : "") +
        (cid ? `\nCID-10: ${cid}` : "") +
        (obs ? `\nRestrições/Observações: ${obs}` : "");
      await reportsApi.create(patient.id, { date: startDate, report_type: "atestado", title: `Atestado — ${typeLabel}`, content });
      toast.success("Atestado salvo no prontuário");
    } catch {
      toast.error("Erro ao salvar atestado");
    } finally {
      setSavingDoc(false);
    }
  };

  const salvarComparecimento = async () => {
    if (!compDate) { toast.error("Informe a data do comparecimento"); return; }
    if (!patient?.id) { toast.error("Paciente inválido"); return; }
    setSavingDoc(true);
    try {
      const content =
        `Declaro, para os devidos fins, que ${compAcompanhante ? `o(a) acompanhante ${compAcompanhante}` : `o(a) paciente ${patient?.name}`}` +
        (compAcompanhante ? ` esteve presente acompanhando o(a) paciente ${patient?.name}` : "") +
        ` compareceu a esta unidade de saúde no dia ${formatDateBR(compDate)}` +
        (horaEntrada ? `, das ${horaEntrada}` : "") +
        (horaSaida ? ` às ${horaSaida}` : "") +
        ` para atendimento médico.`;
      await reportsApi.create(patient.id, { date: compDate, report_type: "comparecimento", title: "Declaração de Comparecimento", content });
      toast.success("Declaração salva no prontuário");
    } catch {
      toast.error("Erro ao salvar declaração");
    } finally {
      setSavingDoc(false);
    }
  };

  const printContent = useMemo(() => {
    if (!printData) return null;
    const pTypeLabel = CERTIFICATE_TYPES.find(c => c.value === printData.certType)?.label ?? printData.certType;
    const startFormatted = formatDateBR(printData.startDate);
    const retDate = calcReturnDate(printData.startDate, printData.days) ?? "";
    return (
      <div style={{ fontFamily: DOC_SERIF, color: "#1a1a1a", fontSize: "12.5px", lineHeight: 1.75 }}>
        <TimbradoOficial clinic={clinic} />
        <div style={{ textAlign: "center", margin: "0 0 22px" }}>
          <p style={{ fontFamily: DOC_SERIF, fontWeight: 700, fontSize: "17px", textTransform: "uppercase", letterSpacing: "7px", color: "#1a1a1a", margin: 0 }}>Atestado Médico</p>
          <div style={{ width: "80px", borderTop: `1.5px solid ${OM_NAVY}`, margin: "10px auto 0" }} />
        </div>
        <div style={{ lineHeight: 1.85, marginBottom: "20px", textAlign: "justify" }}>
          <p style={{ margin: 0 }}>
            Atesto que o(a) paciente <strong>{patient?.name}</strong>
            {patient?.cpf ? `, CPF ${patient.cpf},` : ""}
            {patient?.birth_date ? ` nascido(a) em ${new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")},` : ""}
            {" "}foi avaliado(a) em {dateStr} e necessita afastar-se de <strong>{pTypeLabel}</strong> pelo
            período de <strong>{printData.days} dia{Number(printData.days) !== 1 ? "s" : ""}</strong>, a contar de {startFormatted}, com retorno previsto para <strong>{retDate}</strong>.
          </p>
          {/* M6: dados do paciente acompanhado no atestado de acompanhamento */}
          {printData.certType === "acompanhamento" && printData.accompName && (
            <p style={{ marginTop: "12px" }}>
              <strong>Paciente acompanhado:</strong> {printData.accompName}
              {printData.accompRel ? ` (${printData.accompRel})` : ""}
            </p>
          )}
          {printData.cid && (
            <p style={{ marginTop: "12px" }}>
              <strong>CID-10:</strong> {printData.cid}
            </p>
          )}
          {printData.obs && (
            <p style={{ marginTop: "12px", color: "#444", fontSize: "11.5px" }}>
              <strong>Restrições/Observações:</strong> {printData.obs}
            </p>
          )}
        </div>
        <FechoOficial clinic={clinic} />
      </div>
    );
  }, [printData, patient, clinic]);

  const compPrintContent = useMemo(() => {
    if (!compPrintData) return null;
    const startFormatted = formatDateBR(compPrintData.compDate);
    return (
      <div style={{ fontFamily: DOC_SERIF, color: "#1a1a1a", fontSize: "12.5px", lineHeight: 1.75 }}>
        <TimbradoOficial clinic={clinic} />
        <div style={{ textAlign: "center", margin: "0 0 22px" }}>
          <p style={{ fontFamily: DOC_SERIF, fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "5px", color: "#1a1a1a", margin: 0 }}>Declaração de Comparecimento</p>
          <div style={{ width: "80px", borderTop: `1.5px solid ${OM_NAVY}`, margin: "10px auto 0" }} />
        </div>
        <div style={{ lineHeight: 1.85, marginBottom: "20px", textAlign: "justify" }}>
          <p style={{ margin: 0 }}>
            Declaro, para os devidos fins, que o(a) {compPrintData.compAcompanhante ? "acompanhante" : "paciente"} <strong>{compPrintData.compAcompanhante || patient?.name}</strong>
            {patient?.cpf && !compPrintData.compAcompanhante ? `, CPF ${patient.cpf},` : ""}
            {compPrintData.compAcompanhante ? <> esteve presente acompanhando o(a) paciente <strong>{patient?.name}</strong></> : null}
            {" "}compareceu a esta unidade de saúde no dia <strong>{startFormatted}</strong>
            {horaEntrada && <>, das <strong>{horaEntrada}</strong></>}
            {horaSaida && <> às <strong>{horaSaida}</strong></>}
            {" "}para atendimento médico.
          </p>
        </div>
        <FechoOficial clinic={clinic} />
      </div>
    );
  }, [compPrintData, patient, clinic, dateStr, horaEntrada, horaSaida]);

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Atestado Médico" content={printContent} onClose={() => setPrintData(null)} />
      )}
      {compPrintData && compPrintContent && (
        <PrintDocModal title="Declaração de Comparecimento" content={compPrintContent} onClose={() => setCompPrintData(null)} />
      )}

      {/* Tipo de documento */}
      <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <button type="button" onClick={() => setDocKind("atestado")} className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${docKind === "atestado" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}>
          Atestado (afastamento)
        </button>
        <button type="button" onClick={() => setDocKind("comparecimento")} className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${docKind === "comparecimento" ? "bg-white dark:bg-slate-700 text-blue-600 shadow-sm" : "text-slate-500 dark:text-slate-400"}`}>
          Declaração de Comparecimento
        </button>
      </div>

      {docKind === "comparecimento" ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Data do comparecimento *</label>
              <input type="date" className={inp} value={compDate} onChange={e => setCompDate(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Hora de entrada</label>
              <input type="time" className={inp} value={horaEntrada} onChange={e => setHoraEntrada(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Hora de saída</label>
              <input type="time" className={inp} value={horaSaida} onChange={e => setHoraSaida(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={lbl}>Nome do acompanhante (se a declaração for para quem acompanhou o paciente)</label>
            <input className={inp} placeholder="Deixe em branco se a declaração é para o próprio paciente" value={compAcompanhante} onChange={e => setCompAcompanhante(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={salvarComparecimento}
              disabled={savingDoc}
              className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> {savingDoc ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              disabled={!compDate}
              onClick={() => {
                if (!compDate) { toast.error("Informe a data do comparecimento"); return; }
                setCompPrintData({ compDate, horaEntrada, horaSaida, compAcompanhante });
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-3.5 h-3.5" /> Visualizar e Imprimir
            </button>
          </div>
        </>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Data de início do afastamento *</label>
          <input type="date" className={inp} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Tipo de afastamento</label>
          <select className={inp} value={certType} onChange={e => setCertType(e.target.value)}>
            {CERTIFICATE_TYPES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Nota: CAT não é emitida pelo médico assistente — deve ser aberta pelo empregador */}
      <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
        <AlertTriangle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">CAT (Acidente de Trabalho) não é emitida pelo médico assistente — deve ser aberta pelo empregador no site da Previdência Social. O médico emite apenas o atestado/laudo clínico de suporte.</p>
      </div>

      <div>
        <label className={lbl}>Dias de afastamento *</label>
        {/* Quick day buttons (context-aware per type) */}
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {quickDays.map(d => (
            <button key={d} type="button" onClick={() => setDays(String(d))} className={`px-2.5 py-1 text-xs rounded border transition-all font-semibold ${days === String(d) ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400"}`}>{d}d</button>
          ))}
        </div>
        <input
          type="number"
          min="1"
          max="365"
          className={`${inp} ${(!days || Number(days) < 1) ? "border-red-400 ring-1 ring-red-400" : ""}`}
          value={days}
          onChange={e => setDays(e.target.value)}
        />
        {(!days || Number(days) < 1) && (
          <p className="text-xs text-red-500 mt-0.5">Mínimo 1 dia</p>
        )}
        {returnDate && (
          <p className="text-xs text-slate-500 mt-1">Retorno previsto: <strong>{returnDate}</strong></p>
        )}
      </div>

      <div>
        <label className={lbl}>
          CID-10{" "}
          {(certType === "trabalho" || certType === "geral") ? (
            <span className="text-red-500 font-normal">(exigido para empresas com PCMSO e INSS)</span>
          ) : (certType === "escola" || certType === "esportes" || certType === "ef_escolar" || certType === "academia") ? (
            <span className="text-slate-400 font-normal">(opcional para atividades escolares e esportivas)</span>
          ) : null}
        </label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* Acompanhamento extra fields */}
      {certType === "acompanhamento" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Nome do paciente acompanhado *</label>
            <input className={inp} placeholder="Nome completo do paciente" value={accompName} onChange={e => setAccompName(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Grau de parentesco / relação</label>
            <input className={inp} placeholder="Ex: filho(a), cônjuge, pai/mãe..." value={accompRel} onChange={e => setAccompRel(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <label className={lbl}>Restrições / Observações</label>
        {/* Chips rápidos */}
        <div className="flex flex-wrap gap-1 mb-1.5">
          {OBS_CHIPS.map(chip => (
            <button key={chip} type="button" onClick={() => addObsChip(chip)} className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              + {chip}
            </button>
          ))}
        </div>
        <textarea
          className={`${inp} resize-none min-h-[80px]`}
          rows={3}
          placeholder="Ex: restrição para levantamento de peso; pode exercer função administrativa sentado..."
          value={obs}
          onChange={e => setObs(e.target.value)}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={salvarAtestado}
          disabled={savingDoc}
          className="flex items-center gap-1.5 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold text-xs disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> {savingDoc ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          disabled={!startDate || !days || Number(days) < 1}
          onClick={() => {
            if (!startDate || !days || Number(days) < 1) { toast.error("Informe os dias de afastamento"); return; }
            // S10: CID é exigido para trabalho/geral (empresas com PCMSO e INSS).
            // Sem CID, confirma antes de imprimir.
            if ((certType === "trabalho" || certType === "geral") && !cid.trim()) {
              if (typeof window !== "undefined" && !window.confirm("Atestado para trabalho/INSS geralmente exige CID-10. Imprimir sem CID?")) return;
            }
            setPrintData({ cid, days, certType, obs, startDate, accompName, accompRel });
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Printer className="w-3.5 h-3.5" /> Visualizar e Imprimir
        </button>
      </div>
      </>
      )}
    </div>
  );
}

// ── Tab: Laudos ───────────────────────────────────────────────────────────────

function TabLaudos({ patient, clinic }: { patient: any; clinic?: any }) {
  const [text, setText] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [cid, setCid] = useState("");
  const [cidsSecundarios, setCidsSecundarios] = useState<string[]>([]);
  const [funcCapacity, setFuncCapacity] = useState("");
  const [funcDetail, setFuncDetail] = useState("");
  const [pendingLaudoTemplate, setPendingLaudoTemplate] = useState<typeof LAUDO_TEMPLATES[0] | null>(null);
  const [printData, setPrintData] = useState<{ text: string; finalidade: string; cid: string; cidsSecundarios: string[]; funcCapacity: string; funcDetail: string; incapPercent: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2,"0")}/${String(today.getMonth()+1).padStart(2,"0")}/${today.getFullYear()}`;
  const cityState = clinic ? `${clinic.city}/${clinic.state}` : "_________";

  const [draftSaved, setDraftSaved] = useState(false);
  const [incapPercent, setIncapPercent] = useState("");

  // ── Laudo INSS por ditado (IA) ──────────────────────────────────────────
  const [ditado, setDitado] = useState("");
  const [inssConcl, setInssConcl] = useState<string[]>([]);
  const [diasAfast, setDiasAfast] = useState("120");
  const [gerandoIA, setGerandoIA] = useState(false);

  const toggleConcl = (chave: string) =>
    setInssConcl(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave]);

  const gerarLaudoIA = async () => {
    if (!ditado.trim() || ditado.trim().length < 20) { toast.error("Dite o caso primeiro (história, exame, exames de imagem…)"); return; }
    if (!patient?.id) { toast.error("Paciente inválido"); return; }
    if (text.trim() && !window.confirm("Substituir o texto atual do laudo pelo gerado pela IA?")) return;
    setGerandoIA(true);
    try {
      const res = await api.post("/api/laudo-inss/gerar", {
        patient_id: patient.id,
        ditado: ditado.trim(),
        conclusoes: inssConcl,
        dias_afastamento: inssConcl.includes("afastamento_dias") ? (parseInt(diasAfast) || 0) : null,
        cidade: clinic ? `${clinic.city} – ${clinic.state}` : null,
      }).then(r => r.data);
      setText(res.texto);
      setTimeout(autoResizeLaudo, 50);
      toast.success("Laudo gerado — revise antes de imprimir");
    } catch (e: any) {
      toast.error(msgErro(e, "Erro ao gerar laudo com IA"));
    } finally {
      setGerandoIA(false);
    }
  };

  // Draft autosave — S1 (LGPD): chave escopada por usuário + paciente
  const draftKey = `orthoclinic_laudo_draft_${userScope()}_${patient?.id || "0"}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setText(parsed.text || "");
        setFinalidade(parsed.finalidade || "");
        setCid(parsed.cid || "");
        if (Array.isArray(parsed.cidsSecundarios)) setCidsSecundarios(parsed.cidsSecundarios);
        if (parsed.funcCapacity) setFuncCapacity(parsed.funcCapacity);
        if (parsed.funcDetail) setFuncDetail(parsed.funcDetail);
        if (parsed.incapPercent) setIncapPercent(parsed.incapPercent); // A13
        if (parsed.text) toast.success("Rascunho de laudo restaurado");
      } catch {}
    }
  }, [draftKey]);

  useEffect(() => {
    if (!text.trim()) return;
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem(draftKey, JSON.stringify({ text, finalidade, cid, cidsSecundarios, funcCapacity, funcDetail, incapPercent }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [text, finalidade, cid, cidsSecundarios, funcCapacity, funcDetail, incapPercent, draftKey]);

  const autoResizeLaudo = useCallback(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 300), 600)}px`;
  }, []);

  const hasPlaceholders = /\{[A-Z_]+\}/g.test(text);
  const pendingPlaceholders = useMemo(() => { const matches: string[] = []; let m; const re = /\{[A-Z_]+\}/g; while ((m = re.exec(text)) !== null) matches.push(m[0]); return matches; }, [text]);

  // Fill {PACIENTE} and {DATA} placeholders with real patient data on template apply
  const fillPatientVars = (tmplText: string): string => {
    const patientName = patient?.name ?? "{PACIENTE}";
    const today = new Date().toLocaleDateString("pt-BR");
    return tmplText
      .replace(/\{PACIENTE\}/g, patientName)
      .replace(/\{DATA\}/g, today);
  };

  const applyLaudoTemplate = (t: typeof LAUDO_TEMPLATES[0]) => {
    setText(fillPatientVars(t.text));
    setPendingLaudoTemplate(null);
    setTimeout(autoResizeLaudo, 0);
    textRef.current?.focus();
  };

  const handleTemplate = (name: string) => {
    const t = LAUDO_TEMPLATES.find(lt => lt.name === name);
    if (!t) return;
    if (text.trim() && text !== t.text) {
      setPendingLaudoTemplate(t);
      return;
    }
    applyLaudoTemplate(t);
  };

  const saveDraftNow = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(draftKey, JSON.stringify({ text, finalidade, cid, cidsSecundarios, funcCapacity, funcDetail, incapPercent }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
      toast.success("Rascunho salvo");
    }
  };

  const printContent = useMemo(() => {
    if (!printData) return null;
    const age = patient?.birth_date ? calcAge(patient.birth_date) : "";
    // O template já imprime cidade/data + assinatura no rodapé; se o corpo do
    // laudo terminar com a linha "Cidade – UF, data por extenso." (padrão dos
    // gerados por IA antigos), remove pra não sair duplicado.
    const bodyText = printData.text
      .replace(/\n\s*[A-ZÀ-Ú][^\n]{2,60}\s[–-]\s?[A-Z]{2},[^\n]{3,60}\d{4}\.?\s*$/, "")
      .trimEnd();
    const serif = DOC_SERIF;
    return (
      <div style={{ fontFamily: serif, color: "#1a1a1a", fontSize: "12.5px", lineHeight: 1.75 }}>
        <TimbradoOficial clinic={clinic} />

        {/* ── Identificação do paciente ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 18px", margin: "0 0 20px", fontSize: "11.5px", padding: "10px 14px", background: "#f8f7f4", border: "1px solid #e3e0d8", borderRadius: "2px" }}>
          <p style={{ margin: 0 }}><strong>Paciente:</strong> {patient?.name}</p>
          <p style={{ margin: 0 }}><strong>Data da avaliação:</strong> {dateStr}</p>
          {patient?.birth_date && <p style={{ margin: 0 }}><strong>Nascimento:</strong> {new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")}{age ? ` (${age})` : ""}</p>}
          {patient?.occupation && <p style={{ margin: 0 }}><strong>Profissão:</strong> {patient.occupation}</p>}
          {patient?.cpf && <p style={{ margin: 0 }}><strong>CPF:</strong> {patient.cpf}</p>}
        </div>

        {/* ── Título ── */}
        <div style={{ textAlign: "center", margin: "0 0 22px" }}>
          <p style={{ fontFamily: serif, fontWeight: 700, fontSize: "17px", textTransform: "uppercase", letterSpacing: "7px", color: "#1a1a1a", margin: 0 }}>Laudo Médico</p>
          {printData.finalidade && (
            <p style={{ fontSize: "10.5px", textTransform: "uppercase", color: "#666", margin: "4px 0 0", letterSpacing: "2px" }}>{printData.finalidade}</p>
          )}
          <div style={{ width: "80px", borderTop: "1.5px solid #0F2D5E", margin: "10px auto 0" }} />
        </div>
        {printData.cid && (
          <p style={{ fontWeight: 700, marginBottom: printData.cidsSecundarios.length ? "4px" : "14px", fontSize: "11.5px", borderLeft: "2.5px solid #0F2D5E", paddingLeft: "10px", letterSpacing: "0.3px" }}>CID-10: {printData.cid}</p>
        )}
        {printData.cidsSecundarios.length > 0 && (
          <p style={{ fontWeight: 400, marginBottom: "14px", fontSize: "11px", borderLeft: "2.5px solid #0F2D5E", paddingLeft: "10px", color: "#555" }}>CID-10 secundário(s): {printData.cidsSecundarios.join(", ")}</p>
        )}

        {/* ── Corpo ── */}
        <div style={{ whiteSpace: "pre-wrap", textAlign: "justify", lineHeight: 1.85, fontSize: "12.5px", marginBottom: "20px", textJustify: "inter-word" as any }}>
          {bodyText}
        </div>

        {printData.funcCapacity && (
          <div style={{ borderTop: "1px solid #cfcabe", paddingTop: "12px", marginBottom: "20px" }}>
            <p style={{ fontWeight: 700, fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "1.5px", color: "#0F2D5E" }}>Conclusão</p>
            <p style={{ fontSize: "12.5px", margin: 0, textAlign: "justify" }}>
              {printData.funcCapacity}
              {/* A13: grau de incapacidade (%) no laudo de incapacidade permanente */}
              {printData.funcCapacity === "Incapacidade permanente" && printData.incapPercent
                ? ` — ${printData.incapPercent}% (tabela SUSEP)`
                : (printData.funcDetail ? ` — ${printData.funcDetail}` : "")}
            </p>
          </div>
        )}

        <FechoOficial clinic={clinic} />
      </div>
    );
  }, [printData, patient, clinic]);

  return (
    <div className="px-5 pb-5 space-y-4">
      {printData && printContent && (
        <PrintDocModal title="Laudo Médico" content={printContent} onClose={() => setPrintData(null)} />
      )}

      {/* Inline confirmation for template replacement */}
      {pendingLaudoTemplate && (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg text-xs">
          <span className="text-amber-800 dark:text-amber-200 font-medium">Substituir texto atual pelo modelo <strong>{pendingLaudoTemplate.name}</strong>?</span>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => setPendingLaudoTemplate(null)} className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
            <button type="button" onClick={() => applyLaudoTemplate(pendingLaudoTemplate)} className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 font-semibold">Substituir</button>
          </div>
        </div>
      )}

      {/* Finalidade */}
      <div>
        <label className={lbl}>Finalidade do Laudo *</label>
        <select className={inp} value={finalidade} onChange={e => setFinalidade(e.target.value)}>
          <option value="">— selecionar finalidade —</option>
          {LAUDO_FINALIDADE_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Templates */}
      <div>
        <label className={lbl}>Modelos</label>
        <div className="flex flex-wrap gap-1.5">
          {LAUDO_TEMPLATES.map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => handleTemplate(t.name)}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* CID */}
      <div>
        <label className={lbl}>CID-10 Principal *</label>
        <CidSearch value={cid} onChange={setCid} />
      </div>

      {/* CIDs secundários */}
      <div>
        <label className={lbl}>CID-10 Secundário(s) (opcional)</label>
        <div className="space-y-2">
          {cidsSecundarios.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <CidSearch value={c} onChange={(v) => setCidsSecundarios(prev => prev.map((x, idx) => idx === i ? v : x))} />
              </div>
              <button
                type="button"
                onClick={() => setCidsSecundarios(prev => prev.filter((_, idx) => idx !== i))}
                className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                title="Remover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCidsSecundarios(prev => [...prev, ""])}
          className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar CID secundário
        </button>
      </div>

      {/* ── Laudo INSS por ditado (IA) ── */}
      <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/10 p-3 space-y-2.5">
        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
          🎙️ Laudo INSS por ditado (IA)
          <span className="font-normal text-[10px] text-indigo-400">médico assistente · Sonnet 5</span>
        </p>
        <textarea
          className={`${inp} resize-none`}
          rows={4}
          placeholder={"Dite o caso (pode usar o microfone do teclado): história clínica, exame físico, exames de imagem, CID se quiser…\nEx: Paciente com lombalgia crônica há 2 anos, RM mostra hérnia L4-L5 com compressão radicular, Lasègue positivo à direita, em uso de pregabalina, sem melhora com fisioterapia…"}
          value={ditado}
          onChange={e => setDitado(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("afastamento_dias")} onChange={() => toggleConcl("afastamento_dias")} />
            Afastamento por
            <input
              type="number" min="1" max="720"
              className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-xs"
              value={diasAfast}
              onChange={e => setDiasAfast(e.target.value)}
              onClick={() => { if (!inssConcl.includes("afastamento_dias")) toggleConcl("afastamento_dias"); }}
            />
            dias
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("auxilio_doenca")} onChange={() => toggleConcl("auxilio_doenca")} />
            Auxílio-doença (incapacidade temporária)
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("auxilio_acidente")} onChange={() => toggleConcl("auxilio_acidente")} />
            Auxílio-acidente (sequela definitiva)
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("tempo_indeterminado")} onChange={() => toggleConcl("tempo_indeterminado")} />
            Por tempo indeterminado
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("aposentadoria")} onChange={() => toggleConcl("aposentadoria")} />
            Aposentadoria por incapacidade permanente
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("isencao_ir")} onChange={() => toggleConcl("isencao_ir")} />
            Isenção de IR
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={inssConcl.includes("bpc_loas")} onChange={() => toggleConcl("bpc_loas")} />
            BPC / LOAS
          </label>
        </div>
        <button
          type="button"
          onClick={gerarLaudoIA}
          disabled={gerandoIA}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold text-xs disabled:opacity-60"
        >
          {gerandoIA ? "Gerando laudo…" : "✨ Gerar laudo com IA"}
        </button>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">O texto gerado cai na caixa abaixo pra você revisar/editar antes de imprimir. A IA só usa o que você ditou (nunca inventa achado nem CID).</p>
      </div>

      {/* Texto */}
      <div>
        <label className={lbl}>Texto do Laudo</label>
        {hasPlaceholders && (
          <div className="flex items-start gap-2 mb-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">Campos a preencher antes de imprimir:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {pendingPlaceholders.map((ph, i) => (
                  <span key={i} className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded px-1.5 py-0.5 font-mono">{ph}</span>
                ))}
              </div>
            </div>
          </div>
        )}
        <textarea
          ref={textRef}
          className={`${inp} resize-none font-mono`}
          style={{ minHeight: "300px", maxHeight: "600px" }}
          placeholder="Escreva o laudo aqui ou selecione um modelo acima..."
          value={text}
          onChange={e => { setText(e.target.value); autoResizeLaudo(); }}
        />
        {draftSaved && (
          <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5 text-right">Rascunho salvo automaticamente</p>
        )}
      </div>

      {/* Conclusão Pericial Formal */}
      <div>
        <label className={lbl}>Conclusão Pericial Formal (opcional)</label>
        <select className={inp + " mb-2"} value={funcCapacity} onChange={e => setFuncCapacity(e.target.value)}>
          <option value="">— selecionar —</option>
          <option value="Sem limitação funcional">Sem limitação funcional</option>
          <option value="Limitação parcial">Limitação parcial</option>
          <option value="Incapacidade temporária">Incapacidade temporária</option>
          <option value="Incapacidade permanente">Incapacidade permanente</option>
        </select>
        {(funcCapacity === "Limitação parcial" || funcCapacity === "Incapacidade temporária") && (
          <input className={inp} placeholder={funcCapacity === "Limitação parcial" ? "Atividades restritas a..." : "Estimativa de prazo (dias/semanas)..."} value={funcDetail} onChange={e => setFuncDetail(e.target.value)} />
        )}
        {funcCapacity === "Incapacidade permanente" && (
          <div className="mt-2">
            <label className={lbl}>Grau de incapacidade (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                className={inp + " w-24"}
                placeholder="0–100"
                value={incapPercent}
                onChange={e => setIncapPercent(e.target.value)}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">Conforme tabela SUSEP 2023 / Decreto 3.048/99</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={saveDraftNow}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold"
        >
          <Save className="w-3.5 h-3.5" /> Salvar Rascunho
        </button>
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) { toast.error("Escreva o laudo antes de imprimir"); return; }
            if (!finalidade) { toast.error("Selecione a finalidade do laudo antes de finalizar"); return; }
            if (hasPlaceholders) { toast.error("Preencha todos os campos { } antes de imprimir"); return; }
            if (typeof window !== "undefined") localStorage.removeItem(draftKey);
            toast.success("Laudo gerado — use Ctrl+P ou salve como PDF");
            setPrintData({ text, finalidade, cid, cidsSecundarios: cidsSecundarios.filter(c => c.trim()), funcCapacity, funcDetail, incapPercent });
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-xs"
        >
          <Printer className="w-3.5 h-3.5" /> Finalizar e Imprimir
        </button>
      </div>
    </div>
  );
}

// ── Tab: Fotos ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://ortho-clinic-ldcd.onrender.com";

// S13: placeholder exibido quando a miniatura da foto falha ao carregar
const PHOTO_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e2e8f0"/><g fill="none" stroke="#94a3b8" stroke-width="4"><rect x="30" y="34" width="60" height="46" rx="4"/><circle cx="48" cy="52" r="7"/><path d="M34 78l20-18 14 12 10-8 12 14"/></g><text x="60" y="102" font-family="sans-serif" font-size="11" fill="#64748b" text-anchor="middle">imagem indisponível</text></svg>'
  );

interface PatientDocument {
  id: number;
  file_url: string;
  title: string | null;
  date: string;
  category?: string;
  notes?: string | null;
}

function TabFotos({ patientId }: { patientId: number }) {
  const [photos, setPhotos] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [uploadZoneOpen, setUploadZoneOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Compute auth headers inline — avoids stale closure from useMemo
  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("ortho_token") : null;
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  };

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/documents?category=photo`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setPhotos(Array.isArray(data) ? data : (data.items ?? []));
      } else {
        setFetchError(true);
        toast.error("Erro ao carregar fotos");
      }
    } catch {
      setFetchError(true);
      toast.error("Erro de conexão ao carregar fotos");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    const oversized = fileArr.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.map(f => f.name).join(", ")} excedem 10MB. Comprima antes de enviar.`);
      return;
    }
    setUploading(true);
    setUploadProgress({ current: 0, total: fileArr.length });
    let uploaded = 0;
    const errors: string[] = [];
    for (const file of fileArr) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name || "Foto de exame");
      fd.append("category", "photo");
      fd.append("date", new Date().toISOString().split("T")[0]);
      try {
        const res = await fetch(`${API_URL}/patients/${patientId}/documents/upload`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: fd,
        });
        if (res.ok) { uploaded++; }
        else { errors.push(file.name); }
      } catch { errors.push(file.name); }
      setUploadProgress(p => p ? { ...p, current: p.current + 1 } : null);
    }
    setUploading(false);
    setUploadProgress(null);
    if (uploaded > 0) {
      toast.success(`${uploaded} foto${uploaded > 1 ? "s" : ""} enviada${uploaded > 1 ? "s" : ""}!`);
      setUploadZoneOpen(false);
      fetchPhotos();
    }
    if (errors.length > 0) toast.error(`Falha ao enviar: ${errors.join(", ")}`);
    else if (uploaded === 0) toast.error("Erro ao enviar foto");
  };

  const handleDeleteConfirmed = async () => {
    if (confirmDeleteId === null) return;
    const docId = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(docId);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/documents/${docId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== docId));
        if (zoomedIndex !== null && photos[zoomedIndex]?.id === docId) setZoomedIndex(null);
        toast.success("Foto removida");
      } else {
        toast.error("Erro ao remover foto");
      }
    } catch {
      toast.error("Erro de conexão ao remover foto");
    } finally {
      setDeletingId(null);
    }
  };

  // S13: miniatura quebrada → placeholder (sem loop de erro)
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fallback) return;
    img.dataset.fallback = "1";
    img.src = PHOTO_PLACEHOLDER;
  };

  // S13: download via fetch + blob (o atributo download não funciona cross-origin).
  // Se o fetch falhar (ex.: CORS), cai para abrir a imagem em nova aba.
  const handleDownloadPhoto = async (photo: PatientDocument) => {
    try {
      const res = await fetch(photo.file_url);
      if (!res.ok) throw new Error("fetch falhou");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.title || `foto-${photo.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(photo.file_url, "_blank", "noopener,noreferrer");
    }
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (zoomedIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setZoomedIndex(i => i !== null ? Math.min(i + 1, photos.length - 1) : null);
      if (e.key === "ArrowLeft") setZoomedIndex(i => i !== null ? Math.max(i - 1, 0) : null);
      if (e.key === "Escape") setZoomedIndex(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomedIndex, photos.length]);

  const zoomedPhoto = zoomedIndex !== null ? photos[zoomedIndex] : null;

  // Format photo date for lightbox
  const formatPhotoDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return dateStr; }
  };

  const showUploadZone = photos.length === 0 || uploadZoneOpen;

  return (
    <div className="px-5 pb-5">
      {/* Confirm delete modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 w-72 space-y-3">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Remover foto?</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">Cancelar</button>
              <button onClick={handleDeleteConfirmed} className="flex-1 px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
          onClick={() => setZoomedIndex(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white disabled:opacity-30"
            onClick={e => { e.stopPropagation(); setZoomedIndex(i => i !== null ? Math.max(i - 1, 0) : null); }}
            disabled={zoomedIndex === 0}
          >
            <ChevronUp className="w-5 h-5 -rotate-90" />
          </button>
          <img src={zoomedPhoto.file_url} alt={zoomedPhoto.title || "Foto"} onError={onImgError} className="max-w-[85vw] max-h-[85vh] rounded-xl shadow-2xl" />
          <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white" onClick={() => setZoomedIndex(null)}>
            <X className="w-5 h-5" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white disabled:opacity-30"
            onClick={e => { e.stopPropagation(); setZoomedIndex(i => i !== null ? Math.min(i + 1, photos.length - 1) : null); }}
            disabled={zoomedIndex === photos.length - 1}
          >
            <ChevronDown className="w-5 h-5 -rotate-90" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-[75vw]">
            {zoomedPhoto.title && (
              <p className="bg-black/60 text-white text-xs px-3 py-1 rounded-full max-w-full truncate">{zoomedPhoto.title}</p>
            )}
            {zoomedPhoto.date && (
              <p className="bg-black/50 text-white/80 text-[10px] px-2 py-0.5 rounded-full">{formatPhotoDate(zoomedPhoto.date)}</p>
            )}
            {zoomedPhoto.notes && (
              <p className="bg-black/60 text-white/90 text-[11px] px-3 py-1 rounded-lg text-center max-w-full">{zoomedPhoto.notes}</p>
            )}
          </div>
          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">{(zoomedIndex ?? 0) + 1} / {photos.length}</p>
        </div>
      )}

      {/* Upload area — collapsed when photos already exist */}
      {showUploadZone ? (
        <div className="mb-4 space-y-2">
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-blue-500 bg-blue-50/60 dark:bg-blue-900/25 scale-[1.01]"
                : "border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleUpload(e.target.files)} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500">{uploadProgress ? `Enviando ${uploadProgress.current} de ${uploadProgress.total}...` : "Enviando..."}</p>
                {uploadProgress && (
                  <div className="w-40 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Toque para adicionar fotos</p>
                <p className="text-xs text-slate-400">Ou arraste as imagens aqui — aceita múltiplas</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-semibold"
            >
              <Camera className="w-3.5 h-3.5" /> Abrir câmera
            </button>
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setUploadZoneOpen(false)}
                className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">{photos.length} foto{photos.length !== 1 ? "s" : ""} registrada{photos.length !== 1 ? "s" : ""}</p>
          <button
            type="button"
            onClick={() => setUploadZoneOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
          >
            <Camera className="w-3 h-3" /> Adicionar foto
          </button>
        </div>
      )}

      {/* Hidden inputs always present for upload zone */}
      {!showUploadZone && (
        <>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleUpload(e.target.files)} />
        </>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-sm font-semibold text-slate-500">Erro ao carregar fotos</p>
          <button onClick={fetchPhotos} className="text-xs text-blue-600 hover:underline">Tentar novamente</button>
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <ImageIcon className="w-12 h-12 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Documentação fotográfica</p>
          <p className="text-xs text-slate-400 text-center max-w-56">Registre RX fotografado, evolução de feridas, aspecto pós-operatório ou lesões cutâneas. Aceita múltiplas fotos de uma vez.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, idx) => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-square">
              <img
                src={photo.file_url}
                alt={photo.title || "Foto"}
                onError={onImgError}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setZoomedIndex(idx)}
              />
              {/* Always visible controls (bottom bar) */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-black/50 px-2 py-1">
                <div className="flex-1 mr-1 min-w-0">
                  <p className="text-white text-[10px] truncate">{photo.title || "Foto"}</p>
                  {photo.date && <p className="text-white/60 text-[9px]">{formatPhotoDate(photo.date)}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setZoomedIndex(idx)}
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white"
                    title="Ampliar"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDownloadPhoto(photo)}
                    className="p-1 bg-white/20 hover:bg-white/40 rounded text-white"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(photo.id)}
                    disabled={deletingId === photo.id}
                    className="p-1 bg-red-500/80 hover:bg-red-600 rounded text-white disabled:opacity-50"
                    title="Remover"
                  >
                    {deletingId === photo.id ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Drawer ────────────────────────────────────────────────────────────────

// Cronômetro da consulta no cabeçalho do drawer: soma o tempo acumulado
// (active_seconds) + o trecho atual ao vivo; congela quando suspenso.
function DrawerCrono({ entry }: { entry: WaitingRoomEntry }) {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (entry.status !== "attending" || !entry.segment_started_at) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [entry.status, entry.segment_started_at]);
  const base = entry.active_seconds ?? 0;
  // Timestamp do servidor é UTC; sem 'Z'/offset o browser leria como hora
  // local (cronômetro travava em 0 — bug 02/08). Força UTC no parse.
  const segMs = entry.segment_started_at
    ? new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(entry.segment_started_at) ? entry.segment_started_at : entry.segment_started_at + "Z").getTime()
    : 0;
  const sec = entry.segment_started_at
    ? base + Math.max(Math.floor((nowMs - segMs) / 1000), 0)
    : base;
  if (sec <= 0 && entry.status !== "attending") return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const label = h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const style =
    entry.status === "attending" ? "bg-green-600 text-white"
    : entry.status === "suspended" ? "bg-amber-500 text-white"
    : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200";
  return (
    <span className={`font-mono text-sm font-bold px-2.5 py-1 rounded-lg ${style}`} title="Tempo de consulta (pausas descontadas)">
      {entry.status === "suspended" ? "⏸" : "⏱"} {label}
    </span>
  );
}

export default function ConsultaDrawer({ entry, onClose, onStatusChange }: ConsultaDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("anamnese");
  // Abas já abertas nesta consulta — continuam montadas (ver comentário no render).
  const [visitadas, setVisitadas] = useState<Set<DrawerTab>>(() => new Set<DrawerTab>(["anamnese"]));
  useEffect(() => {
    setVisitadas((v) => (v.has(activeTab) ? v : new Set(v).add(activeTab)));
  }, [activeTab]);

  const ABAS_DO_ATENDIMENTO: Array<{ key: DrawerTab; render: () => JSX.Element }> = [
    { key: "anamnese",        render: () => <TabProntuario patientId={entry.patient_id} patient={patient} /> },
    { key: "exames",          render: () => <TabExames patientId={entry.patient_id} patient={patient} clinic={clinic} /> },
    { key: "receitas",        render: () => <TabReceita patientId={entry.patient_id} patient={patient} clinic={clinic} /> },
    { key: "encaminhamentos", render: () => <TabEncaminhamentos patient={patient} clinic={clinic} patientId={entry.patient_id} /> },
    { key: "procedimentos",   render: () => <TabProcedimentos patientId={entry.patient_id} patient={patient} clinic={clinic} /> },
    { key: "atestados",       render: () => <TabAtestados patient={patient} clinic={clinic} /> },
    { key: "laudos",          render: () => <TabLaudos patient={patient} clinic={clinic} /> },
    { key: "fotos",           render: () => <TabFotos patientId={entry.patient_id} /> },
  ];
  const [patient, setPatient] = useState<any>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [busyStatus, setBusyStatus] = useState(false);
  const [clinic, setClinic] = useState<any>(null);

  // Coletor de documentos da consulta (impressão final em lote).
  const [collectedDocs, setCollectedDocs] = useState<CollectedDoc[]>([]);
  const [printCenterOpen, setPrintCenterOpen] = useState(false);
  const addDoc = useCallback((doc: CollectedDoc) => {
    setCollectedDocs((prev) => [...prev.filter((d) => d.id !== doc.id), doc]);
  }, []);
  const removeDoc = useCallback((id: string) => {
    setCollectedDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // E8 (05/08): avisa o servidor que o médico ESTÁ mexendo no prontuário.
  // Sem isso, a consulta esquecida aberta rodava o cronômetro a noite toda
  // (413 min p/ 6 pacientes em 05/08). Passados 15 min sem sinal, o servidor
  // suspende sozinho — contando só até a última interação real.
  const lastPingRef = useRef<number>(0);
  useEffect(() => {
    if (entry.status !== "attending") return;
    const marcar = () => {
      const agora = Date.now();
      if (agora - lastPingRef.current < 60_000) return; // no máximo 1 ping/min
      lastPingRef.current = agora;
      waitingRoomApi.ping(entry.id);
    };
    marcar(); // ao abrir/retomar já conta como atividade
    const eventos: (keyof DocumentEventMap)[] = ["keydown", "mousedown", "touchstart"];
    eventos.forEach(ev => document.addEventListener(ev, marcar));
    return () => eventos.forEach(ev => document.removeEventListener(ev, marcar));
  }, [entry.id, entry.status]);

  useEffect(() => {
    setLoadingPatient(true);
    setPatient(null);
    setCollectedDocs([]); // nova consulta = coletor zerado
    patientsApi.get(entry.patient_id)
      // BUG 05/08: o banco chama o campo de `birthdate`, mas o app inteiro lia
      // `birth_date` — a data de nascimento NUNCA saía em atestado, laudo,
      // declaração nem no cabeçalho. Normaliza aqui, num ponto só.
      .then((p: any) => setPatient({
        ...p,
        birth_date: p?.birth_date || p?.birthdate || p?.date_of_birth || null,
      }))
      .catch(() => toast.error("Erro ao carregar dados do paciente"))
      .finally(() => setLoadingPatient(false));
  }, [entry.patient_id]);

  useEffect(() => {
    // Cidade/UF do documento vêm da clínica. O Dr. Valth atende em várias
    // unidades, então NUNCA deixar sem: (1) clínica do check-in; (2) clínica
    // da marcação de HOJE do paciente; (3) última unidade usada no aparelho.
    let cancelled = false;
    const aplicar = (c: any) => {
      if (cancelled || !c) return;
      setClinic(c);
      try { localStorage.setItem("ortho_last_clinic_id", String(c.id)); } catch {}
    };
    if (entry.clinic_id) {
      clinicApi.get(entry.clinic_id).then(aplicar).catch(() => {});
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const wk = await clinicApi.week(hoje, hoje);
        const appt = (wk || []).find((a: any) =>
          a.source === "appointment" && a.clinic_id &&
          (a.patient_id === entry.patient_id ||
           (a.patient_phone && entry.patient_name && a.patient_name === entry.patient_name)));
        if (appt?.clinic_id) { aplicar(await clinicApi.get(appt.clinic_id)); return; }
      } catch {}
      // E11 (05/08): em Palmares os documentos saíram SEM "Palmares – PE" —
      // o paciente chegou de balcão, então não havia clínica no check-in nem
      // marcação. A GRADE FIXA da semana sabe onde ele está: seg=CTO,
      // ter=Mário Bento, qua manhã=IP / tarde=Unimagem, qui=CTO/Artro.
      try {
        const agora = new Date();
        const dow = (agora.getDay() + 6) % 7; // 0=Seg
        const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
        const lista = await clinicApi.list();
        const candidatos: { c: any; s: any }[] = [];
        for (const c of lista || []) {
          for (const s of c.schedules || []) {
            if (s.active !== false && s.day_of_week === dow) candidatos.push({ c, s });
          }
        }
        const dentro = candidatos.find(({ s }) => (s.start_time || "00:00") <= hhmm && hhmm <= (s.end_time || "23:59"));
        if (dentro) { aplicar(dentro.c); return; }
        if (candidatos.length > 0) {
          const min = (t: string) => { const [h, m] = (t || "00:00").split(":").map(Number); return h * 60 + m; };
          candidatos.sort((a, b) => Math.abs(min(a.s.start_time) - min(hhmm)) - Math.abs(min(b.s.start_time) - min(hhmm)));
          aplicar(candidatos[0].c);
          return;
        }
      } catch {}
      try {
        const last = localStorage.getItem("ortho_last_clinic_id");
        if (last) aplicar(await clinicApi.get(Number(last)));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [entry.clinic_id, entry.patient_id, entry.patient_name]);

  const handleStatus = async (newStatus: QueueStatus) => {
    setBusyStatus(true);
    try {
      await onStatusChange(entry.id, newStatus);
      // S3: ao concluir o atendimento, fecha a gaveta — assim não fica parada no
      // paciente já atendido. (Botão "chamar próximo" exigiria page.tsx, fora do escopo.)
      if (newStatus === "attended") onClose();
    } finally {
      setBusyStatus(false);
    }
  };

  const allergies = parseList(patient?.allergies);

  const tabs: { key: DrawerTab; label: string; icon: React.ReactNode }[] = [
    { key: "anamnese",        label: "Anamnese",         icon: <ClipboardList className="w-3.5 h-3.5" /> },
    { key: "exames",          label: "Exames",            icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { key: "receitas",        label: "Receitas",          icon: <FileText className="w-3.5 h-3.5" /> },
    { key: "encaminhamentos", label: "Encaminh.",         icon: <Send className="w-3.5 h-3.5" /> },
    { key: "procedimentos",   label: "Procedimentos",     icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
    { key: "atestados",       label: "Atestados",         icon: <Award className="w-3.5 h-3.5" /> },
    { key: "laudos",          label: "Laudos",            icon: <FileSearch2 className="w-3.5 h-3.5" /> },
    { key: "fotos",           label: "Fotos",             icon: <Camera className="w-3.5 h-3.5" /> },
  ];

  return (
    <PrintCollectorContext.Provider value={{ docs: collectedDocs, addDoc, removeDoc }}>
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
      {printCenterOpen && (
        <ConsultaPrintCenter docs={collectedDocs} onRemove={removeDoc} onClose={() => setPrintCenterOpen(false)} />
      )}
      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 pt-4 pb-3 space-y-3">
        {/* Top row: name + close */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
              {entry.patient_name}
            </h2>
            {/* E10 (05/08): o espaço ao lado do nome estava vazio. Agora traz o
                que o médico precisa bater o olho: idade/nascimento (🎂 na semana
                do aniversário), particular×plano, cidade, profissão, 1ª vez ou
                retorno, telefone e os CIDs já fixados. */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-1">
              {patient?.birth_date && (
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {calcAge(patient.birth_date)}
                  <span className="text-slate-400 font-normal">
                    {" "}({new Date(patient.birth_date + "T12:00:00").toLocaleDateString("pt-BR")})
                  </span>
                </span>
              )}
              {aniversarioProximo(patient?.birth_date) && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                  🎂 {aniversarioProximo(patient?.birth_date)}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                (entry.patient_insurance ?? "Particular").toLowerCase() === "particular"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              }`}>
                {entry.patient_insurance || "Particular"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                (patient?.consultation_count ?? 0) > 0
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }`}>
                {(patient?.consultation_count ?? 0) > 0 ? `Retorno · ${patient.consultation_count}ª vez` : "1ª consulta"}
              </span>
              {patient?.address_city && (
                <span className="text-xs text-slate-500 dark:text-slate-400">📍 {patient.address_city}{patient.address_state ? `-${patient.address_state}` : ""}</span>
              )}
              {patient?.occupation && (
                <span className="text-xs text-slate-500 dark:text-slate-400">💼 {patient.occupation}</span>
              )}
              {patient?.phone && (
                <a
                  href={`https://wa.me/55${String(patient.phone).replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-xs text-emerald-600 hover:underline"
                  title="Abrir conversa no WhatsApp"
                >
                  📱 {patient.phone}
                </a>
              )}
              {Array.isArray(patient?.cids) && patient.cids.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]" title={patient.cids.join(" · ")}>
                  🏷 {patient.cids.map((c: string) => c.split("—")[0].trim()).join(", ")}
                </span>
              )}
              {entry.reason && (
                <span className="text-xs text-slate-400 truncate">· {entry.reason}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Allergy banner in header */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-xs font-bold text-red-800 dark:text-red-300">
              Alérgico a: {allergies.join(", ")}
            </p>
          </div>
        )}

        {/* Status buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {entry.status === "waiting" && (
            <>
              <button
                onClick={() => handleStatus("attending")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" /> Iniciar Consulta
              </button>
              <button
                onClick={() => handleStatus("absent")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                <UserX className="w-3.5 h-3.5" /> Ausente
              </button>
            </>
          )}
          {entry.status === "attending" && (
            <>
              <button
                onClick={() => handleStatus("suspended")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
                title="Paciente saiu (ex.: fazer RX) e volta no mesmo turno — pausa o cronômetro"
              >
                ⏸ Suspender
              </button>
              <button
                onClick={() => handleStatus("attended")}
                disabled={busyStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Finalizar Consulta
              </button>
            </>
          )}
          {entry.status === "suspended" && (
            <button
              onClick={() => handleStatus("attending")}
              disabled={busyStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
              title="Paciente voltou — cronômetro continua de onde parou"
            >
              <Play className="w-3.5 h-3.5" /> Continuar Consulta
            </button>
          )}
          {entry.status === "attended" && (
            <button
              onClick={() => handleStatus("attending")}
              disabled={busyStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
              title="Paciente voltou (esqueceu de pedir algo) — reabre para editar e finalizar de novo"
            >
              <Play className="w-3.5 h-3.5" /> Reabrir Consulta
            </button>
          )}
          {entry.status === "absent" && (
            <button
              onClick={() => handleStatus("waiting")}
              disabled={busyStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Recolocar na Fila
            </button>
          )}
          {/* Cronômetro da consulta: vivo em atendimento, congelado quando suspenso */}
          <DrawerCrono entry={entry} />
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            entry.status === "attending" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : entry.status === "suspended" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : entry.status === "waiting" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }`}>
            {entry.status === "attending" ? "Em Atendimento" : entry.status === "suspended" ? "Suspenso" : entry.status === "waiting" ? "Aguardando" : entry.status === "attended" ? "Atendido" : "Ausente"}
          </span>

          {/* Impressão final em lote — só aparece quando há documentos gerados */}
          {collectedDocs.length > 0 && (
            <button
              onClick={() => setPrintCenterOpen(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-900 dark:hover:bg-white"
              title="Imprimir todos os documentos gerados no atendimento de uma vez"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir documentos ({collectedDocs.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs (scrollable) ── */}
      <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        <div className="flex min-w-max">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1 px-3 py-2.5 text-[11px] font-semibold transition-all border-b-2 whitespace-nowrap ${
                activeTab === key
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Prontuário só editável com a consulta INICIADA (Valth 02/08):
            garante que todo registro aconteça com o cronômetro rodando. */}
        {!loadingPatient && entry.status !== "attending" && (
          <div className="absolute inset-0 z-30 bg-white/75 dark:bg-slate-950/75 backdrop-blur-[2px] flex items-start justify-center pt-20">
            <div className="text-center px-6 max-w-sm">
              <p className="text-3xl mb-2">
                {entry.status === "suspended" ? "⏸" : entry.status === "attended" ? "✅" : "🔒"}
              </p>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {entry.status === "waiting" && "Clique em Iniciar Consulta para abrir o prontuário"}
                {entry.status === "suspended" && "Consulta suspensa — clique em Continuar Consulta para retomar"}
                {entry.status === "attended" && "Consulta finalizada — clique em Reabrir Consulta para editar"}
                {entry.status === "absent" && "Paciente ausente — recoloque na fila para atender"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                O prontuário só é editável com a consulta em andamento (cronômetro rodando).
              </p>
            </div>
          </div>
        )}
        {loadingPatient ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          // E9 (05/08): pb-32 garante espaço abaixo do último botão (Salvar),
          // que ficava embaixo dos botões flutuantes do chat/IA.
          <div className={`pt-4 pb-32 ${entry.status !== "attending" ? "pointer-events-none select-none opacity-50" : ""}`}>
            {/* 10/08 — a aba que sai de cena fica ESCONDIDA, não desmontada.
                Antes, ir em Exames e voltar apagava a anamnese que ele tinha
                acabado de escrever: trocar de aba destruía o componente e o
                texto ia junto. Cada aba é montada só na primeira visita
                (`visitadas`), pra não disparar as buscas das oito de uma vez. */}
            {ABAS_DO_ATENDIMENTO.map(({ key, render }) => (
              visitadas.has(key) ? (
                <div key={key} style={{ display: activeTab === key ? "block" : "none" }}>
                  {render()}
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>
    </div>
    </PrintCollectorContext.Provider>
  );
}
