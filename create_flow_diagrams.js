const PptxGenJS = require('pptxgenjs');

// Create presentation
const prs = new PptxGenJS();

const colors = {
  primary: '065A82',      // Deep blue
  secondary: '00A896',    // Seafoam
  accent: 'F96167',       // Coral
  light: 'F2F2F2',        // Off-white
  dark: '2F3C7E',         // Navy
  success: '28A745',      // Green
  warning: 'FFC107',      // Yellow
  text: '212121',         // Black
  border: 'D0D0D0'        // Light gray
};

// Slide 1: Title
const slide1 = prs.addSlide();
slide1.background = { color: colors.primary };
slide1.addText('DIAGRAMAS DE FLUXO', {
  x: 0.5, y: 2.5, w: 9, h: 1.5,
  fontSize: 54, bold: true, color: colors.light,
  align: 'center', fontFace: 'Calibri'
});
slide1.addText('Sistema OrthoClinic', {
  x: 0.5, y: 4.2, w: 9, h: 0.8,
  fontSize: 32, color: colors.secondary,
  align: 'center', fontFace: 'Calibri'
});
slide1.addText('Fluxos: Chamada de Paciente • Assinatura Digital • Anamnese', {
  x: 0.5, y: 5.3, w: 9, h: 0.6,
  fontSize: 16, color: 'FFFFFF',
  align: 'center', fontFace: 'Calibri'
});

// Slide 2: Fluxo de Chamada de Paciente
const slide2 = prs.addSlide();
slide2.background = { color: colors.light };

slide2.addText('FLUXO 1: Chamada de Paciente (Real-time)', {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.primary,
  align: 'left', fontFace: 'Calibri'
});

const boxWidth = 2.2;
const boxHeight = 0.6;
const startX = 0.5;
const startY = 1.1;
const spacing = 0.9;

function drawFlowBox(slide, x, y, text, color, actor) {
  slide.addShape(prs.ShapeType.roundRect, {
    x: x, y: y, w: boxWidth, h: boxHeight,
    fill: { color: color },
    line: { color: colors.primary, width: 2 }
  });
  slide.addText(text, {
    x: x, y: y + 0.08, w: boxWidth, h: 0.25,
    fontSize: 11, bold: true, color: 'FFFFFF',
    align: 'center', fontFace: 'Calibri'
  });
  slide.addText(actor, {
    x: x, y: y + 0.35, w: boxWidth, h: 0.18,
    fontSize: 8, color: 'FFFFFF',
    align: 'center', fontFace: 'Calibri', italic: true
  });
}

function drawArrow(slide, x1, y1, x2, y2, label) {
  slide.addShape(prs.ShapeType.line, {
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    line: { color: colors.primary, width: 2, endArrowType: 'triangle' }
  });
  if (label) {
    slide.addText(label, {
      x: (x1 + x2) / 2 - 0.3, y: (y1 + y2) / 2 - 0.15, w: 0.8, h: 0.3,
      fontSize: 8, color: colors.accent, align: 'center',
      fontFace: 'Calibri', bold: true
    });
  }
}

// Row 1
drawFlowBox(slide2, startX, startY, 'Médico clica', colors.primary, 'Frontend');
drawArrow(slide2, startX + boxWidth, startY + boxHeight/2, startX + boxWidth + spacing - 0.2, startY + boxHeight/2, '< 0.1s');
drawFlowBox(slide2, startX + boxWidth + spacing, startY, 'POST /queue/call', colors.secondary, 'API');

// Row 2
const y2 = startY + 1.2;
drawFlowBox(slide2, startX, y2, 'Validação de\napontamento', colors.primary, 'Backend');
drawArrow(slide2, startX + boxWidth, y2 + boxHeight/2, startX + boxWidth + spacing - 0.2, y2 + boxHeight/2, '< 0.2s');
drawFlowBox(slide2, startX + boxWidth + spacing, y2, 'Atualiza DB\nstatus=called', colors.secondary, 'Database');

// Row 3
const y3 = y2 + 1.2;
drawFlowBox(slide2, startX, y3, 'WebSocket\nbroadcast', colors.accent, 'Backend');
drawArrow(slide2, startX + boxWidth, y3 + boxHeight/2, startX + boxWidth + spacing - 0.2, y3 + boxHeight/2, '< 0.3s');
drawFlowBox(slide2, startX + boxWidth + spacing, y3, 'TV exibe\npaciência', colors.warning, 'Waiting Room');

// Row 4
const y4 = y3 + 1.2;
drawFlowBox(slide2, startX, y4, 'Admin recebe\natualização', colors.primary, 'Frontend');
drawArrow(slide2, startX + boxWidth, y4 + boxHeight/2, startX + boxWidth + spacing - 0.2, y4 + boxHeight/2, '< 0.5s');
drawFlowBox(slide2, startX + boxWidth + spacing, y4, 'Dashboard\natualizado', colors.success, 'Admin Panel');

// Status box
slide2.addShape(prs.ShapeType.roundRect, {
  x: 0.5, y: 5.5, w: 9, h: 1.8,
  fill: { color: 'F8F9FA' },
  line: { color: colors.primary, width: 1 }
});

slide2.addText('SEQUÊNCIA DE LATÊNCIAS CRÍTICAS', {
  x: 0.7, y: 5.6, w: 8.6, h: 0.25,
  fontSize: 11, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const statuses = [
  '• Clique → API: < 100ms',
  '• Validação BD: < 200ms',
  '• WebSocket broadcast: < 300ms',
  '• Dashboard atualizado: < 500ms'
];

let statusY = 5.95;
statuses.forEach(status => {
  slide2.addText(status, {
    x: 1.0, y: statusY, w: 8.5, h: 0.22,
    fontSize: 10, color: colors.text,
    fontFace: 'Calibri'
  });
  statusY += 0.28;
});

// Slide 3: Fluxo de Assinatura Digital
const slide3 = prs.addSlide();
slide3.background = { color: colors.light };

slide3.addText('FLUXO 2: Assinatura Digital (ClickSign)', {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.primary,
  align: 'left', fontFace: 'Calibri'
});

// Left column - Frontend
slide3.addText('FRONTEND', {
  x: 0.5, y: 1.05, w: 4, h: 0.3,
  fontSize: 10, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const fStepY = 1.45;
const fSteps = [
  { text: 'Clique "Assinar\nReceita"', time: '' },
  { text: 'Valida dados\nreceita', time: '< 0.2s' },
  { text: 'Abre modal\nassinatura', time: '< 0.3s' },
  { text: 'Poll status\na cada 5s', time: '5s' },
  { text: 'Sucesso!\nBaixa PDF', time: '< 1s' }
];

let fY = fStepY;
fSteps.forEach((step, idx) => {
  const color = idx % 2 === 0 ? colors.secondary : colors.accent;
  drawFlowBox(slide3, 0.5, fY, step.text, color, 'Browser');
  if (step.time) {
    slide3.addText(step.time, {
      x: 0.3, y: fY - 0.25, w: 0.4, h: 0.2,
      fontSize: 8, color: colors.accent, bold: true,
      fontFace: 'Calibri'
    });
  }
  fY += 0.75;
});

// Middle column - API
slide3.addText('BACKEND API', {
  x: 4.7, y: 1.05, w: 2.5, h: 0.3,
  fontSize: 10, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const aStepY = 1.45;
const aSteps = [
  { text: 'POST /sign', time: '< 0.1s' },
  { text: 'Gera PDF\ncom QR', time: '< 1s' },
  { text: 'Upload\nClickSign', time: '< 2s' },
  { text: 'Status pendente', time: '' }
];

let aY = aStepY;
aSteps.forEach((step, idx) => {
  drawFlowBox(slide3, 4.7, aY, step.text, colors.primary, 'FastAPI');
  if (step.time) {
    slide3.addText(step.time, {
      x: 4.5, y: aY - 0.25, w: 0.5, h: 0.2,
      fontSize: 8, color: colors.accent, bold: true,
      fontFace: 'Calibri'
    });
  }
  aY += 0.75;
});

// Right column - ClickSign
slide3.addText('CLICKSIGN', {
  x: 7.6, y: 1.05, w: 2, h: 0.3,
  fontSize: 10, bold: true, color: colors.accent,
  fontFace: 'Calibri'
});

const cStepY = 1.45;
const cSteps = [
  { text: 'Recebe PDF', time: '' },
  { text: 'Gera sign_url', time: '< 1s' },
  { text: 'Médico assina', time: '~30s' },
  { text: 'Webhook→BD', time: '< 0.5s' }
];

let cY = cStepY;
cSteps.forEach((step, idx) => {
  drawFlowBox(slide3, 7.6, cY, step.text, colors.accent, 'ClickSign');
  if (step.time) {
    slide3.addText(step.time, {
      x: 7.4, y: cY - 0.25, w: 0.5, h: 0.2,
      fontSize: 8, color: colors.accent, bold: true,
      fontFace: 'Calibri'
    });
  }
  cY += 0.75;
});

// Final step - WhatsApp
slide3.addShape(prs.ShapeType.roundRect, {
  x: 0.5, y: 5.0, w: 9, h: 0.65,
  fill: { color: colors.success },
  line: { color: colors.primary, width: 2 }
});
slide3.addText('COMPARTILHAR PACIENTE: PDF + Comprovante Assinatura via WhatsApp (< 2s)', {
  x: 0.7, y: 5.1, w: 8.6, h: 0.45,
  fontSize: 11, bold: true, color: 'FFFFFF',
  align: 'center', fontFace: 'Calibri'
});

// Timeline
slide3.addText('TIMELINE COMPLETA (Melhor caso: ~35s | Pior caso: ~60s)', {
  x: 0.5, y: 5.95, w: 9, h: 0.25,
  fontSize: 10, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const timelineItems = [
  { label: 'Clique', time: '0s' },
  { label: 'API gera PDF', time: '~1-2s' },
  { label: 'ClickSign pronto', time: '~2-3s' },
  { label: 'Médico assina', time: '~30-40s' },
  { label: 'Webhook', time: '~31-42s' }
];

let timelineX = 0.7;
timelineItems.forEach((item, idx) => {
  slide3.addShape(prs.ShapeType.ellipse, {
    x: timelineX, y: 6.35, w: 0.3, h: 0.3,
    fill: { color: colors.accent },
    line: { color: colors.primary, width: 1 }
  });
  slide3.addText(item.time, {
    x: timelineX - 0.1, y: 6.7, w: 0.5, h: 0.22,
    fontSize: 8, color: colors.primary, align: 'center',
    fontFace: 'Calibri', bold: true
  });
  if (idx < timelineItems.length - 1) {
    slide3.addShape(prs.ShapeType.line, {
      x: timelineX + 0.3, y: 6.5, w: 0.8, h: 0,
      line: { color: colors.primary, width: 2 }
    });
  }
  timelineX += 1.75;
});

// Slide 4: Fluxo de Anamnese
const slide4 = prs.addSlide();
slide4.background = { color: colors.light };

slide4.addText('FLUXO 3: Anamnese (Primeira Consulta)', {
  x: 0.5, y: 0.3, w: 9, h: 0.5,
  fontSize: 28, bold: true, color: colors.primary,
  align: 'left', fontFace: 'Calibri'
});

// Tabs visualization
slide4.addText('NAVEGACAO POR ABAS', {
  x: 0.5, y: 1.05, w: 9, h: 0.25,
  fontSize: 10, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const tabs = [
  { name: '1. Queixa\nPrincipal', icon: 'O' },
  { name: '2. Historico', icon: 'H' },
  { name: '3. Habitos &\nRisco', icon: 'R' },
  { name: '4. Exame\nFisico', icon: 'E' },
  { name: '5. Resumo\n& Assinar', icon: 'S' }
];

const tabX = 0.5;
const tabWidth = 1.72;
const tabY = 1.45;
const tabHeight = 0.8;

tabs.forEach((tab, idx) => {
  const x = tabX + idx * (tabWidth + 0.1);
  const color = idx === 0 ? colors.primary : (idx === 4 ? colors.success : colors.secondary);
  slide4.addShape(prs.ShapeType.roundRect, {
    x: x, y: tabY, w: tabWidth, h: tabHeight,
    fill: { color: color },
    line: { color: colors.primary, width: 1 }
  });
  slide4.addText(tab.name, {
    x: x + 0.05, y: tabY + 0.15, w: tabWidth - 0.1, h: 0.5,
    fontSize: 9, bold: true, color: 'FFFFFF',
    align: 'center', fontFace: 'Calibri'
  });
});

// Content areas
const contentY = 2.45;

const contentBoxes = [
  {
    title: 'Preenchimento',
    items: [
      '• Motivo da consulta',
      '• Localizacao dor',
      '• Intensidade (0-10)',
      '• O que piora/melhora'
    ]
  },
  {
    title: 'Auto-save',
    items: [
      '• Salva a cada campo',
      '• Indicador visual',
      '• Recuperacao auto',
      '• Status sincronizado'
    ]
  },
  {
    title: 'Validacao',
    items: [
      '• Campos obrigatorios',
      '• Alertas interacoes',
      '• Consistencia dados',
      '• Avisos de risco'
    ]
  }
];

let contentX = 0.5;
contentBoxes.forEach(box => {
  slide4.addShape(prs.ShapeType.roundRect, {
    x: contentX, y: contentY, w: 2.9, h: 1.8,
    fill: { color: 'FFFFFF' },
    line: { color: colors.border, width: 1 }
  });
  slide4.addText(box.title, {
    x: contentX + 0.15, y: contentY + 0.1, w: 2.6, h: 0.3,
    fontSize: 11, bold: true, color: colors.primary,
    fontFace: 'Calibri'
  });
  let itemY = contentY + 0.5;
  box.items.forEach(item => {
    slide4.addText(item, {
      x: contentX + 0.15, y: itemY, w: 2.6, h: 0.22,
      fontSize: 8, color: colors.text,
      fontFace: 'Calibri'
    });
    itemY += 0.28;
  });
  contentX += 3.05;
});

// Barra de progresso
slide4.addText('BARRA DE PROGRESSO', {
  x: 0.5, y: 4.5, w: 9, h: 0.2,
  fontSize: 9, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

slide4.addShape(prs.ShapeType.roundRect, {
  x: 0.5, y: 4.75, w: 9, h: 0.3,
  fill: { color: colors.light },
  line: { color: colors.border, width: 1 }
});

slide4.addShape(prs.ShapeType.roundRect, {
  x: 0.5, y: 4.75, w: 4.5, h: 0.3,
  fill: { color: colors.secondary },
  line: { color: colors.primary, width: 1 }
});

slide4.addText('Preenchimento: 50% concluido', {
  x: 0.7, y: 4.78, w: 3, h: 0.24,
  fontSize: 9, bold: true, color: 'FFFFFF',
  fontFace: 'Calibri'
});

// Fluxo final
slide4.addText('FLUXO DE FINALIZACAO', {
  x: 0.5, y: 5.25, w: 9, h: 0.2,
  fontSize: 9, bold: true, color: colors.primary,
  fontFace: 'Calibri'
});

const finalSteps = [
  { text: 'Salvar\nAnamnese', color: colors.primary, time: '< 1s' },
  { text: 'Gerar\nPDF', color: colors.secondary, time: '< 2s' },
  { text: 'Abrir\nAssinatura', color: colors.accent, time: '< 0.5s' },
  { text: 'Assinado\nBD', color: colors.success, time: '~30-40s' }
];

let finalX = 0.5;
finalSteps.forEach((step, idx) => {
  drawFlowBox(slide4, finalX, 5.6, step.text, step.color, 'Sistema');
  slide4.addText(step.time, {
    x: finalX + 0.4, y: 5.35, w: 1.4, h: 0.2,
    fontSize: 8, color: colors.accent, bold: true,
    align: 'center', fontFace: 'Calibri'
  });
  if (idx < finalSteps.length - 1) {
    slide4.addShape(prs.ShapeType.line, {
      x: finalX + boxWidth, y: 5.9, w: spacing - 0.2, h: 0,
      line: { color: colors.primary, width: 2, endArrowType: 'triangle' }
    });
  }
  finalX += boxWidth + spacing;
});

// Save presentation
prs.writeFile({ fileName: 'FLUXOS_ORTHOCLINIC.pptx' });
console.log('Apresentacao criada com sucesso: FLUXOS_ORTHOCLINIC.pptx');
