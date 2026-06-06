const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
        AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, LevelFormat, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22 }
      }
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "065A82" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "00A896" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } }
            }
          }
        ]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      // TÍTULO
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: "DIAGRAMAS DE FLUXO",
            size: 40,
            bold: true,
            color: "065A82"
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Sistema OrthoClinic",
            size: 28,
            color: "00A896"
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: "Resumo Executivo da Arquitetura de Sistemas",
            size: 20,
            italic: true,
            color: "666666"
          })
        ]
      }),

      // SUMÁRIO
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Resumo Executivo")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Três fluxos principais documentados com detalhes de arquitetura")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Chamada de Paciente: < 1 segundo (real-time)")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Assinatura Digital: 30-60 segundos (ClickSign + CFM 2.299/21)")]
      }),
      new Paragraph({
        spacing: { after: 400 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Anamnese: 5-20 minutos de usuário (auto-save integrado)")]
      }),

      // FLUXO 1
      new Paragraph({
        children: [new PageBreak()]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("FLUXO 1: Chamada de Paciente (Real-time)")]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Sistema em tempo real que permite ao médico chamar o próximo paciente da fila com latência < 1 segundo.",
            italic: true
          })
        ]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Sequência de Etapas")]
      }),

      createFlowTable([
        { num: "1", title: "Clique Médico", time: "< 0.1s", actor: "Frontend", desc: "Médico clica 'Chamar Próximo'" },
        { num: "2", title: "API Request", time: "< 0.1s", actor: "Frontend→API", desc: "POST /clinic/queue/call" },
        { num: "3", title: "Validação BD", time: "< 0.2s", actor: "Backend", desc: "Verifica agendamento, atualiza status" },
        { num: "4", title: "WebSocket", time: "< 0.3s", actor: "Backend", desc: "Broadcast para clientes conectados" },
        { num: "5", title: "TV Update", time: "< 0.5s", actor: "Waiting Room", desc: "Exibe nome do paciente" },
        { num: "6", title: "Dashboard", time: "< 0.5s", actor: "Admin Panel", desc: "Atualiza fila em tempo real" }
      ]),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Latências Críticas")]
      }),

      createMetricsTable([
        { metric: "Clique → API", target: "< 100ms", status: "✓" },
        { metric: "Validação BD", target: "< 200ms", status: "✓" },
        { metric: "WebSocket broadcast", target: "< 300ms", status: "✓" },
        { metric: "Dashboard atualizado", target: "< 500ms", status: "✓" }
      ]),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Pontos Críticos")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Race Condition: ",
            bold: true
          }),
          new TextRun("Múltiplos médicos simultaneamente → Usar transação BD com LOCK")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "WebSocket Reliability: ",
            bold: true
          }),
          new TextRun("Clientes desconectados → Fallback com polling 5s")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Sincronização: ",
            bold: true
          }),
          new TextRun("Backend é fonte de verdade em todos os clientes")
        ]
      }),
      new Paragraph({
        spacing: { after: 400 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Índices DB: ",
            bold: true
          }),
          new TextRun("clinic_queue(clinic_id, called_at) e (status)")
        ]
      }),

      // FLUXO 2
      new Paragraph({
        children: [new PageBreak()]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("FLUXO 2: Assinatura Digital (ClickSign)")]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Fluxo completo de assinatura digital de receitas conforme CFM 2.299/21, utilizando certificado ICP-Brasil.",
            italic: true
          })
        ]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Sequência de Etapas")]
      }),

      createFlowTable([
        { num: "1", title: "Clique Assinar", time: "0s", actor: "Médico", desc: "Abre modal com resumo" },
        { num: "2", title: "Geração PDF", time: "1-2s", actor: "Backend", desc: "PDF + QR Code" },
        { num: "3", title: "Upload ClickSign", time: "2-3s", actor: "API", desc: "Recebe document_id" },
        { num: "4", title: "Assinatura", time: "30-40s", actor: "Médico", desc: "Assina no portal ClickSign" },
        { num: "5", title: "Webhook", time: "31-42s", actor: "ClickSign", desc: "Notifica backend" },
        { num: "6", title: "WhatsApp", time: "32-44s", actor: "Backend", desc: "Envia PDF ao paciente" }
      ]),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Timeline Completa")]
      }),

      createTimelineTable([
        { etapa: "Clique", tempo: "0s", ator: "Médico" },
        { etapa: "Geração PDF", tempo: "1-2s", ator: "Backend" },
        { etapa: "Upload ClickSign", tempo: "2-3s", ator: "API" },
        { etapa: "Assinatura Médico", tempo: "30-40s", ator: "Médico (humano)" },
        { etapa: "Webhook", tempo: "31-42s", ator: "ClickSign" },
        { etapa: "WhatsApp Enviado", tempo: "32-44s", ator: "Sistema" }
      ]),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),
      new Paragraph({
        spacing: { before: 100, after: 100 },
        children: [
          new TextRun({
            text: "Melhor caso: ~35s | Pior caso: ~60s",
            bold: true,
            color: "F96167"
          })
        ]
      }),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Conformidade CFM 2.299/21")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Certificado digital ICP-Brasil (ClickSign)")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Assinatura criptográfica (RSA-2048)")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("QR Code com link de validação pública")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Timestamp certificado (IETF RFC 3161)")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Hash digital SHA-256 do documento")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Proof de assinatura armazenado em BD")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Integridade do documento garantida")]
      }),
      new Paragraph({
        spacing: { after: 400 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Disponível para auditoria")]
      }),

      // FLUXO 3
      new Paragraph({
        children: [new PageBreak()]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("FLUXO 3: Anamnese (Primeira Consulta)")]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Sistema estruturado em 5 abas com auto-save, validação em tempo real e assinatura digital integrada.",
            italic: true
          })
        ]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("As 5 Abas")]
      }),

      createTabsTable([
        { num: "1", name: "Queixa Principal", icon: "🔴", items: ["Motivo consulta", "Localização dor (8 regiões)", "Duração sintomas", "Intensidade 0-10", "O que piora/melhora"] },
        { num: "2", name: "Histórico", icon: "📜", items: ["Traumas anteriores", "Cirurgias", "Fisioterapia", "Medicações (com alertas)", "Alergias"] },
        { num: "3", name: "Hábitos & Risco", icon: "⚠️", items: ["Profissão", "Atividades físicas", "Sedentarismo (slider)", "Tabagismo", "Qualidade sono"] },
        { num: "4", name: "Exame Físico", icon: "🔍", items: ["Amplitude movimento", "Testes específicos", "Inflamação", "Deformidades", "Palpação"] },
        { num: "5", name: "Resumo & Assinar", icon: "✅", items: ["Preview colorido", "Barra progresso", "Cards por seção", "Validação final", "Assinatura digital"] }
      ]),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Recursos")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Auto-save: ",
            bold: true
          }),
          new TextRun("Salva a cada campo (< 0.5s) com indicador visual")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Validação: ",
            bold: true
          }),
          new TextRun("Campos obrigatórios, alertas de interações, avisos de risco")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Barra de Progresso: ",
            bold: true
          }),
          new TextRun("Percentual de preenchimento em tempo real")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "PDF Automático: ",
            bold: true
          }),
          new TextRun("Gerado ao salvar com opção de assinatura")
        ]
      }),
      new Paragraph({
        spacing: { after: 400 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "Follow-up: ",
            bold: true
          }),
          new TextRun("Anamnese simplificada para retornos com comparação de evolução")
        ]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Fluxo de Finalização")]
      }),

      createFinalFlowTable([
        { step: "1", title: "Salvar Anamnese", time: "< 1s", color: "065A82" },
        { step: "2", title: "Gerar PDF", time: "< 2s", color: "00A896" },
        { step: "3", title: "Abrir Assinatura", time: "< 0.5s", color: "F96167" },
        { step: "4", title: "ClickSign Assinado", time: "~30-40s", color: "28A745" }
      ]),

      new Paragraph({ spacing: { after: 400 }, children: [new TextRun("")] }),

      // RESUMO COMPARATIVO
      new Paragraph({
        children: [new PageBreak()]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Resumo Comparativo")]
      }),

      createComparisonTable(),

      new Paragraph({ spacing: { after: 200 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Checklist de Status")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "✅ Chamada de Paciente: ",
            bold: true
          }),
          new TextRun("WebSocket implementado, índices otimizados")
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "✅ Assinatura Digital: ",
            bold: true
          }),
          new TextRun("ClickSign integrado, CFM 2.299/21 validado")
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        numbering: { reference: "bullets", level: 0 },
        children: [
          new TextRun({
            text: "✅ Anamnese: ",
            bold: true
          }),
          new TextRun("5 abas completas, auto-save, validação")
        ]
      }),

      // ARQUIVOS GERADOS
      new Paragraph({
        children: [new PageBreak()]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("Arquivos de Documentação")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("FLUXOS_ORTHOCLINIC.pptx - Apresentação PowerPoint com 4 slides")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("DIAGRAMAS_FLUXOS.html - Documentação interativa em HTML")]
      }),
      new Paragraph({
        spacing: { after: 100 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("FLUXOS_ARQUITETURA_COMPLETO.md - Documentação técnica em Markdown")]
      }),
      new Paragraph({
        spacing: { after: 200 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("DIAGRAMAS_FLUXOS_RESUMO_EXECUTIVO.docx - Este documento")]
      }),

      new Paragraph({
        spacing: { before: 400, after: 100 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Documentação Completa do Sistema OrthoClinic",
            italic: true,
            color: "999999"
          })
        ]
      }),
      new Paragraph({
        spacing: { after: 400 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Junho 2026 | Versão 1.0",
            italic: true,
            size: 20,
            color: "999999"
          })
        ]
      })
    ]
  }]
});

function createFlowTable(data) {
  const cells = data.map(row =>
    new TableRow({
      children: [
        createCell(row.num, "065A82"),
        createCell(row.title, "FFFFFF"),
        createCell(row.time, "FFFFFF"),
        createCell(row.actor, "FFFFFF"),
        createCell(row.desc, "FFFFFF")
      ]
    })
  );

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [700, 1700, 1200, 1500, 4260],
    rows: [
      new TableRow({
        children: [
          createCell("#", "065A82", true),
          createCell("Etapa", "065A82", true),
          createCell("Tempo", "065A82", true),
          createCell("Ator", "065A82", true),
          createCell("Descrição", "065A82", true)
        ]
      }),
      ...cells
    ]
  });
}

function createMetricsTable(data) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 3000, 3360],
    rows: [
      new TableRow({
        children: [
          createCell("Métrica", "065A82", true),
          createCell("Target", "065A82", true),
          createCell("Status", "065A82", true)
        ]
      }),
      ...data.map(row =>
        new TableRow({
          children: [
            createCell(row.metric, "FFFFFF"),
            createCell(row.target, "FFFFFF"),
            createCell(row.status, "28A745")
          ]
        })
      )
    ]
  });
}

function createTimelineTable(data) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2500, 2000, 4860],
    rows: [
      new TableRow({
        children: [
          createCell("Etapa", "065A82", true),
          createCell("Tempo", "065A82", true),
          createCell("Ator", "065A82", true)
        ]
      }),
      ...data.map(row =>
        new TableRow({
          children: [
            createCell(row.etapa, "FFFFFF"),
            createCell(row.tempo, "FFFFFF"),
            createCell(row.ator, "FFFFFF")
          ]
        })
      )
    ]
  });
}

function createTabsTable(data) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [800, 2000, 2000, 4560],
    rows: [
      new TableRow({
        children: [
          createCell("#", "065A82", true),
          createCell("Nome", "065A82", true),
          createCell("Icon", "065A82", true),
          createCell("Campos", "065A82", true)
        ]
      }),
      ...data.map(row =>
        new TableRow({
          children: [
            createCell(row.num, "FFFFFF"),
            createCell(row.name, "FFFFFF"),
            createCell(row.icon, "FFFFFF"),
            createCell(row.items.join(" • "), "FFFFFF")
          ]
        })
      )
    ]
  });
}

function createFinalFlowTable(data) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1200, 2500, 1500, 4160],
    rows: [
      ...data.map(row =>
        new TableRow({
          children: [
            createCell(row.step, row.color, true),
            createCell(row.title, row.color, true),
            createCell(row.time, "FFFFFF"),
            createCell(" ", "F8F9FA")
          ]
        })
      )
    ]
  });
}

function createComparisonTable() {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1800, 2500, 2500, 2560],
    rows: [
      new TableRow({
        children: [
          createCell("Aspecto", "065A82", true),
          createCell("Chamada", "065A82", true),
          createCell("Assinatura", "065A82", true),
          createCell("Anamnese", "065A82", true)
        ]
      }),
      new TableRow({
        children: [
          createCell("Duração", "FFFFFF"),
          createCell("< 1s", "FFFFFF"),
          createCell("30-60s", "FFFFFF"),
          createCell("5-20 min", "FFFFFF")
        ]
      }),
      new TableRow({
        children: [
          createCell("Atores", "FFFFFF"),
          createCell("Frontend+API+DB", "FFFFFF"),
          createCell("Frontend+API+ClickSign", "FFFFFF"),
          createCell("Frontend+API+DB", "FFFFFF")
        ]
      }),
      new TableRow({
        children: [
          createCell("Crítico em", "FFFFFF"),
          createCell("Latência real-time", "FFFFFF"),
          createCell("Conformidade legal", "FFFFFF"),
          createCell("Completude dados", "FFFFFF")
        ]
      })
    ]
  });
}

function createCell(text, bgColor, isHeader = false) {
  return new TableCell({
    borders,
    width: { size: 100, type: WidthType.PERCENTAGE },
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text,
            bold: isHeader,
            color: bgColor === "065A82" || bgColor === "00A896" || bgColor === "F96167" || bgColor === "28A745" ? "FFFFFF" : "212121",
            size: isHeader ? 22 : 20
          })
        ],
        alignment: AlignmentType.CENTER
      })
    ]
  });
}

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:\\Users\\Admin\\ortho-clinic\\DIAGRAMAS_FLUXOS_RESUMO_EXECUTIVO.docx", buffer);
  console.log("Documento criado com sucesso: DIAGRAMAS_FLUXOS_RESUMO_EXECUTIVO.docx");
});
